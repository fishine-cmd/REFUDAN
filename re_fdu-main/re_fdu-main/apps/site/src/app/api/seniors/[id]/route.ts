// GET /api/seniors/[id] — 单个学长公开资料
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { findUserById, toPublicUser } from "@/lib/users-redis";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const { id } = await ctx.params;
  const row = await findUserById(id);
  if (!row || row.role !== "senior") {
    return NextResponse.json({ error: "senior not found" }, { status: 404 });
  }
  return NextResponse.json({ senior: toPublicUser(row) });
}
