import { NextResponse } from "next/server";
import {
  AuthError,
  createSession,
  createUser,
  setSessionCookie,
} from "@/lib/auth";
import { toPublicUser } from "@/lib/users-redis";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown; role?: unknown; displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const row = await createUser({
      username: String(body.username ?? ""),
      password: String(body.password ?? ""),
      role: body.role as "senior" | "junior",
      displayName: String(body.displayName ?? ""),
    });
    const token = await createSession(row.id);
    await setSessionCookie(token);
    return NextResponse.json({ user: toPublicUser(row) });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[signup] unexpected error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
