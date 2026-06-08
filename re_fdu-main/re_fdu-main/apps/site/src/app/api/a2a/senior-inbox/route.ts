export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listSeniorInboxCards } from "@/lib/a2a-session-list";

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

  const { inbox, unreadCount } = await listSeniorInboxCards(me.row.id);

  return NextResponse.json({
    unreadCount,
    inbox,
  });
}
