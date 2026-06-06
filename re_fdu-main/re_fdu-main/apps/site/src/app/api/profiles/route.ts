/**
 * GET /api/profiles
 *
 * List all stored profiles in the database.
 */

import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/python-bridge";

export async function GET() {
  const result = await runPipeline(["--list"], 10_000);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to list profiles" },
      { status: 500 },
    );
  }
  return NextResponse.json(result.data);
}
