// GET /api/seniors/search?q=foo — 简单内存子串过滤
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listUsersByRole, toPublicUser } from "@/lib/users-redis";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  const rows = await listUsersByRole("senior");
  const matched = rows
    .map(toPublicUser)
    .filter((pub) => {
      if (!q) return true;
      const hay = [
        pub.displayName,
        pub.title ?? "",
        ...(pub.tags ?? []),
        ...(pub.badges ?? []),
        pub.highlight ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  return NextResponse.json({ seniors: matched });
}
