// GET /api/inbox — 学长视角:收件箱列表 + 未读计数
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listSeniorInbox } from "@/lib/chat-redis";
import { findUserById, toPublicUser } from "@/lib/users-redis";

export async function GET() {
  let me;
  try {
    me = await requireRole("senior");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const { chats, unreadCount } = await listSeniorInbox(me.row.id);
  const juniors = await Promise.all(
    [...new Set(chats.map((c) => c.juniorId))].map((id) => findUserById(id)),
  );
  const juniorMap = new Map(
    juniors.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.id, toPublicUser(r)]),
  );
  return NextResponse.json({
    unreadCount,
    inbox: chats.map((c) => ({
      chatId: c.chatId,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
      summary: c.summary,
      unread: c.unread,
      junior: juniorMap.get(c.juniorId) ?? null,
    })),
  });
}
