export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { advanceA2AAutoplaySession, getA2ASessionForViewer } from "@/lib/a2a-chat";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  let me;
  try {
    me = await requireRole("junior");
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 401;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status },
    );
  }

  const { sessionId } = await ctx.params;
  const session = await getA2ASessionForViewer(sessionId);
  if (!session || session.juniorId !== me.row.id) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  try {
    const result = await advanceA2AAutoplaySession({
      juniorId: me.row.id,
      sessionId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
