// POST /api/inbox/[chatId]/read — 学长标已读
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getChatMeta, markChatRead } from "@/lib/chat-redis";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ chatId: string }> },
) {
  let me;
  try {
    me = await requireRole("senior");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const { chatId } = await ctx.params;
  const meta = await getChatMeta(chatId);
  if (!meta || meta.seniorId !== me.row.id) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }
  await markChatRead(me.row.id, chatId);
  return NextResponse.json({ ok: true });
}
