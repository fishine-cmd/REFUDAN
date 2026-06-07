// GET /api/chats — 学弟视角:列出我发起的所有对话
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listJuniorChats } from "@/lib/chat-redis";
import { findUserById, toPublicUser } from "@/lib/users-redis";

export async function GET() {
  let me;
  try {
    me = await requireRole("junior");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const chats = await listJuniorChats(me.row.id);
  const seniors = await Promise.all(
    [...new Set(chats.map((c) => c.seniorId))].map((id) => findUserById(id)),
  );
  const seniorMap = new Map(
    seniors.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.id, toPublicUser(r)]),
  );
  return NextResponse.json({
    chats: chats.map((c) => ({
      chatId: c.chatId,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
      summary: c.summary,
      senior: seniorMap.get(c.seniorId) ?? null,
    })),
  });
}
