// GET /api/chats/[chatId] — 双方都可读,鉴权:必须是 junior 或 senior 参与方
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChatMeta, getChatMessages } from "@/lib/chat-redis";
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
  const meta = await getChatMeta(chatId);
  if (!meta) return NextResponse.json({ error: "chat not found" }, { status: 404 });
  if (meta.juniorId !== me.row.id && meta.seniorId !== me.row.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const [messages, junior, senior] = await Promise.all([
    getChatMessages(chatId),
    findUserById(meta.juniorId),
    findUserById(meta.seniorId),
  ]);
  return NextResponse.json({
    chatId,
    createdAt: meta.createdAt,
    lastMessageAt: meta.lastMessageAt,
    summary: meta.summary,
    junior: junior ? toPublicUser(junior) : null,
    senior: senior ? toPublicUser(senior) : null,
    messages,
  });
}
