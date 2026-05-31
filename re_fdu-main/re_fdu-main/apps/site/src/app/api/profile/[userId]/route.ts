/**
 * GET /api/profile/[userId]
 *
 * Retrieve a stored profile by its user ID.
 */

import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/python-bridge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const result = await runPipeline(["--get-profile", userId], 10_000);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Profile not found" },
      { status: 404 },
    );
  }
  return NextResponse.json(result.data);
}
