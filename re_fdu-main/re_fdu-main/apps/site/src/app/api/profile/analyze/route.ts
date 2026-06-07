/**
 * POST /api/profile/analyze
 *
 * Re-run LLM analysis on an existing profile stored in the database.
 */

import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/python-bridge";

interface AnalyzeRequest {
  userId: string;
}

export async function POST(request: Request) {
  let body: AnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId } = body;
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 },
    );
  }

  const result = await runPipeline(["--resume-user-id", userId], 180_000);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Analysis failed" },
      { status: 500 },
    );
  }
  return NextResponse.json(result.data);
}
