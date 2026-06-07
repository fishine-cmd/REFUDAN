import { NextResponse } from "next/server";
import { clearSessionCookie, destroySession, readSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const token = await readSessionCookie();
  if (token) {
    await destroySession(token);
  }
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
