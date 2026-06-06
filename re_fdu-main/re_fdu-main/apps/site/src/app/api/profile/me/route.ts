import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getBuiltProfile, updateUserBuiltProfile } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const u = await requireUser();
    const builtProfile = getBuiltProfile(u.pub.id);
    return NextResponse.json({ user: u.pub, builtProfile });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const u = await requireUser();
    updateUserBuiltProfile(u.pub.id, null);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
