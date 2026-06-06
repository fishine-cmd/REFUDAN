/**
 * POST /api/profile/build
 *
 * Full 4-stage pipeline: collect → analyze → synthesize → store.
 * Accepts a list of platform accounts and runs everything end to end.
 *
 * When the caller is logged in, the resulting profile is also persisted to
 * the user's DB row so it survives across devices and feeds Phase 3a's
 * persona injection on subsequent chats.
 */

import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/python-bridge";
import { getCurrentUser } from "@/lib/auth";
import { updateUserBuiltProfile } from "@/lib/users-redis";

export const runtime = "nodejs";

interface BuildRequest {
  accounts: string[];
  displayName?: string;
}

export async function POST(request: Request) {
  let body: BuildRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { accounts, displayName } = body;

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

  const result = await runPipeline(args, 300_000); // 5 min timeout

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Pipeline failed" },
      { status: 500 },
    );
  }

  // Persist to current user's row if logged in (non-blocking on failure).
  try {
    const u = await getCurrentUser();
    if (u) {
      const profile = (result.data as { profile?: unknown }).profile;
      if (profile) {
        await updateUserBuiltProfile(u.pub.id, profile);
      }
    }
  } catch (e) {
    console.error("[profile/build] failed to persist to user row:", e);
  }

  return NextResponse.json(result.data);
}
