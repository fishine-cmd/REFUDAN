import { NextResponse } from "next/server";
import {
  createSession,
  findUserByUsername,
  setSessionCookie,
  validateUsername,
  verifyPassword,
} from "@/lib/auth";
import { ensureSeeded, toPublicUser } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureSeeded();
  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let username: string;
  try {
    username = validateUsername(body.username);
  } catch {
    return NextResponse.json({ error: "用户名格式不正确" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json({ error: "请输入密码" }, { status: 400 });
  }

  const row = await findUserByUsername(username);
  if (!row) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const token = await createSession(row.id);
  await setSessionCookie(token);
  return NextResponse.json({ user: toPublicUser(row) });
}
