export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listJuniorSessionCards } from "@/lib/a2a-session-list";

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

  const sessions = await listJuniorSessionCards(me.row.id);

  return NextResponse.json({
    sessions,
  });
}
