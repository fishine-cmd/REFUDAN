export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getA2ASessionForViewer } from "@/lib/a2a-chat";
import { getHandoffDetail, setConnectionCompleted, setReferralPrepared } from "@/lib/chat-redis";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  let me;
  try {
    me = await requireUser();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }

  const { sessionId } = await ctx.params;
  const session = await getA2ASessionForViewer(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (session.juniorId !== me.row.id && session.seniorId !== me.row.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (session.seniorId !== me.row.id) {
    return NextResponse.json(
      { error: "Only the senior owner can update referral preparation" },
      { status: 403 },
    );
  }

  if (session.handoffStatus !== "approved") {
    return NextResponse.json(
      { error: "referral preparation is only available after approved handoff" },
      { status: 400 },
    );
  }

  let body: { prepared?: boolean; completed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasPrepared = typeof body.prepared === "boolean";
  const hasCompleted = typeof body.completed === "boolean";

  if (!hasPrepared && !hasCompleted) {
    return NextResponse.json(
      { error: "prepared or completed must be boolean" },
      { status: 400 },
    );
  }

  if (hasPrepared) {
    await setReferralPrepared(sessionId, body.prepared as boolean, me.row.id);
  }

  if (hasCompleted) {
    await setConnectionCompleted(sessionId, body.completed as boolean, me.row.id);
  }

  const handoff = await getHandoffDetail(sessionId);

  return NextResponse.json({
    sessionId,
    handoff,
  });
}
