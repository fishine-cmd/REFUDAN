/**
 * POST /api/profile/collect
 *
 * CDP collection only — no LLM analysis.
 */

import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/python-bridge";

interface CollectRequest {
  accounts: string[];
}

export async function POST(request: Request) {
  let body: CollectRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { accounts } = body;
  if (!accounts?.length) {
    return NextResponse.json(
      { error: "accounts array is required" },
      { status: 400 },
    );
  }

  const args: string[] = ["--no-analyze"];
  for (const acct of accounts) {
    args.push("--accounts", acct);
  }

  const result = await runPipeline(args, 120_000); // 2 min timeout
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Collection failed" },
      { status: 500 },
    );
  }
  return NextResponse.json(result.data);
}
