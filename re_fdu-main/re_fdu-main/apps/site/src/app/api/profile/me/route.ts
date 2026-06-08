import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  getAgentProfile,
  getBuiltProfile,
  updateUserBuiltProfile,
} from "@/lib/users-redis";

export const runtime = "nodejs";

export async function GET() {
  try {
    const u = await requireUser();
    const [builtProfile, agentProfile] = await Promise.all([
      getBuiltProfile(u.pub.id),
      getAgentProfile(u.pub.id),
    ]);
    const hasAgent = Boolean(agentProfile || builtProfile);
    return NextResponse.json({ user: u.pub, builtProfile, agentProfile, hasAgent });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// 仅清除社交画像（built_profile_json）。删除整个 Agent 用 /api/profile/agent。
export async function DELETE() {
  try {
    const u = await requireUser();
    await updateUserBuiltProfile(u.pub.id, null);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
