import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getBuiltProfile } from "@/lib/users-redis";
import { generateProfileInsights } from "@/lib/profile-insights";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { builtProfile?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const user = await requireUser();
    const builtProfile = body.builtProfile ?? (await getBuiltProfile(user.pub.id));

    if (!builtProfile) {
      return NextResponse.json({ error: "No built profile found" }, { status: 404 });
    }

    const insights = await generateProfileInsights(builtProfile);
    return NextResponse.json({ insights });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
