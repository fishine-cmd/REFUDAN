export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { HandoffStatus } from "@re-fudan/contracts";
import { requireUser } from "@/lib/auth";
import { getA2ASessionForViewer } from "@/lib/a2a-chat";
import { getHandoffDetail, setHandoffStatus } from "@/lib/chat-redis";

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

  if (session.seniorId !== me.row.id) {
    return NextResponse.json({ error: "Only the senior owner can decide handoff" }, { status: 403 });
  }

  let body: { status?: HandoffStatus; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "pending" && body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: "status must be pending/approved/rejected" }, { status: 400 });
  }

  await setHandoffStatus(sessionId, body.status, body.note ?? "");
  const handoff = await getHandoffDetail(sessionId);

  return NextResponse.json({
    sessionId,
    handoffStatus: body.status,
    handoff,
  });
}
