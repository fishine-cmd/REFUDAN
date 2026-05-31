/**
 * POST /api/profile/build
 *
 * Full 4-stage pipeline: collect → analyze → synthesize → store.
 * Accepts a list of platform accounts and runs everything end to end.
 */

import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/python-bridge";

interface BuildRequest {
  accounts: string[];
  displayName?: string;
  secondMeToken?: string;
}

export async function POST(request: Request) {
  let body: BuildRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { accounts, displayName, secondMeToken } = body;

  if (!accounts?.length) {
    return NextResponse.json(
      { error: "accounts array is required" },
      { status: 400 },
    );
  }

  const args: string[] = [];
  for (const acct of accounts) {
    args.push("--accounts", acct);
  }
  if (displayName) args.push("--display-name", displayName);
  if (secondMeToken) args.push("--second-me-token", secondMeToken);

  const result = await runPipeline(args, 300_000); // 5 min timeout

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Pipeline failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(result.data);
}
