export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getA2ASessionForViewer } from "@/lib/a2a-chat";
import { findUserById, toPublicUser } from "@/lib/users-redis";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ chatId: string }> },
) {
  let me;
  try {
    me = await requireUser();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }

  const { chatId } = await ctx.params;
  const session = await getA2ASessionForViewer(chatId);
  if (!session) return NextResponse.json({ error: "chat not found" }, { status: 404 });
  if (session.juniorId !== me.row.id && session.seniorId !== me.row.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [junior, senior] = await Promise.all([
    findUserById(session.juniorId),
    findUserById(session.seniorId),
  ]);

  const messages = session.turns
    .filter((turn) => turn.speaker === "junior_agent" || turn.speaker === "senior_agent")
    .map((turn, index) => ({
      role: turn.speaker === "senior_agent" ? "assistant" : "user",
      content: turn.content,
      ts: session.createdAt + index,
    }));

  return NextResponse.json({
    source: "legacy-compat",
    chatId,
    createdAt: session.createdAt,
    lastMessageAt: session.lastMessageAt,
    summary: session.summary,
    junior: junior ? toPublicUser(junior) : null,
    senior: senior ? toPublicUser(senior) : null,
    messages,
  });
}
