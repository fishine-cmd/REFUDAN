/**
 * POST /api/profile/[userId]/sync-secondme
 *
 * Sync a stored profile to the Second Me cloud platform.
 */

import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/python-bridge";

interface SyncRequest {
  secondMeToken: string;
  baseUrl?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  let body: SyncRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { secondMeToken, baseUrl } = body;
  if (!secondMeToken) {
    return NextResponse.json(
      { error: "secondMeToken is required" },
      { status: 400 },
    );
  }

  const args = [
    "--resume-user-id", userId,
    "--second-me-token", secondMeToken,
    "--no-scrape",
  ];
  if (baseUrl) args.push("--second-me-base-url", baseUrl);

  const result = await runPipeline(args, 60_000);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Second Me sync failed" },
      { status: 500 },
    );
  }
  return NextResponse.json(result.data);
}
