export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getA2ASessionForViewer } from "@/lib/a2a-chat";
import { findUserById, toPublicUser } from "@/lib/users-redis";

export async function GET(
  _req: NextRequest,
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
  const detail = await getA2ASessionForViewer(sessionId);
  if (!detail) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (detail.juniorId !== me.row.id && detail.seniorId !== me.row.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [junior, senior] = await Promise.all([
    findUserById(detail.juniorId),
    findUserById(detail.seniorId),
  ]);

  const referralPreparedById = detail.handoff?.referralPreparedBy;
  const connectionCompletedById = detail.handoff?.connectionCompletedBy;
  const [preparedByUser, completedByUser] = await Promise.all([
    referralPreparedById ? findUserById(referralPreparedById) : Promise.resolve(null),
    connectionCompletedById ? findUserById(connectionCompletedById) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    sessionId: detail.sessionId,
    createdAt: detail.createdAt,
    lastMessageAt: detail.lastMessageAt,
    summary: detail.summary,
    status: detail.status,
    provider: detail.provider,
    privacyLevel: detail.privacyLevel,
    handoffStatus: detail.handoffStatus,
    handoff: detail.handoff
      ? {
          ...detail.handoff,
          referralPreparedByName: preparedByUser?.display_name ?? "",
          connectionCompletedByName: completedByUser?.display_name ?? "",
        }
      : null,
    junior: junior ? toPublicUser(junior) : null,
    senior: senior ? toPublicUser(senior) : null,
    originSurface: detail.originSurface,
    intentHash: detail.intentHash,
    autoplayState: detail.autoplayState,
    assessment: detail.assessment,
    turns: detail.turns,
    trace: detail.trace,
  });
}
