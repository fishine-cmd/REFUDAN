// Auth primitives. node:crypto.scrypt password hashing. Server-side sessions
// in Upstash Redis (TTL-based), HttpOnly cookies, sliding 7-day expiration.
//
// Routes that use this MUST set `export const runtime = "nodejs"` so
// node:crypto is available and Upstash REST 走 fetch on Node runtime.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import {
  findUserById,
  findUserByUsername,
  findUserBySessionToken as findUserBySessionTokenDal,
  createSession as createSessionDal,
  destroySession as destroySessionDal,
  touchSession as touchSessionDal,
  insertUser,
  toPublicUser,
  type PublicUser,
  type UserRow,
} from "./users-redis";

const SESSION_COOKIE = "refudan_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

// ────────────────────────────────────────────────────────────────────────
// Hashing (scrypt: salt_hex:derived_hex)
// ────────────────────────────────────────────────────────────────────────

const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(plain, salt, KEYLEN);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const sep = stored.indexOf(":");
    if (sep < 0) return false;
    const salt = stored.slice(0, sep);
    const expected = Buffer.from(stored.slice(sep + 1), "hex");
    const derived = await scryptAsync(plain, salt, expected.length);
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Sessions
// ────────────────────────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  return createSessionDal(userId);
}

export async function destroySession(token: string): Promise<void> {
  await destroySessionDal(token);
}

export async function touchSession(token: string): Promise<void> {
  await touchSessionDal(token);
}

export async function findUserBySessionToken(token: string): Promise<UserRow | null> {
  return findUserBySessionTokenDal(token);
}

// ────────────────────────────────────────────────────────────────────────
// Cookie helpers (Next 15 App Router — cookies() is async)
// ────────────────────────────────────────────────────────────────────────

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

// ────────────────────────────────────────────────────────────────────────
// Public surface
// ────────────────────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<{ row: UserRow; pub: PublicUser } | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  const row = await findUserBySessionToken(token);
  if (!row) return null;
  await touchSession(token);
  return { row, pub: toPublicUser(row) };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<{ row: UserRow; pub: PublicUser }> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("Authentication required", 401);
  return u;
}

export async function requireRole(role: "senior" | "junior"): Promise<{ row: UserRow; pub: PublicUser }> {
  const u = await requireUser();
  if (u.pub.role !== role) throw new AuthError(`Role '${role}' required`, 403);
  return u;
}

// ────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────

export function validateUsername(username: unknown): string {
  if (typeof username !== "string") throw new AuthError("username must be string", 400);
  const lower = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(lower)) {
    throw new AuthError("username must be 3-30 letters/digits/underscore", 400);
  }
  return lower;
}

export function validatePassword(password: unknown, username: string): string {
  if (typeof password !== "string") throw new AuthError("password must be string", 400);
  if (password.length < 6) throw new AuthError("password must be ≥ 6 chars", 400);
  if (password === username) throw new AuthError("password must differ from username", 400);
  return password;
}

export function validateRole(role: unknown): "senior" | "junior" {
  if (role !== "senior" && role !== "junior") {
    throw new AuthError("role must be 'senior' or 'junior'", 400);
  }
  return role;
}

export function validateDisplayName(name: unknown): string {
  if (typeof name !== "string") throw new AuthError("displayName must be string", 400);
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    throw new AuthError("displayName must be 1-50 chars", 400);
  }
  return trimmed;
}

// ────────────────────────────────────────────────────────────────────────
// User creation
// ────────────────────────────────────────────────────────────────────────

export async function createUser(input: {
  username: string;
  password: string;
  role: "senior" | "junior";
  displayName: string;
}): Promise<UserRow> {
  const username = validateUsername(input.username);
  const password = validatePassword(input.password, username);
  const role = validateRole(input.role);
  const displayName = validateDisplayName(input.displayName);

  if (await findUserByUsername(username)) {
    throw new AuthError("username already taken", 409);
  }

  const passwordHash = await hashPassword(password);
  const id = randomBytes(16).toString("hex");
  const now = Date.now();

  await insertUser({
    id,
    username,
    password_hash: passwordHash,
    display_name: displayName,
    role,
    created_at: now,
  });

  const row = await findUserById(id);
  if (!row) throw new AuthError("user not found after insert", 500);
  return row;
}

export { findUserByUsername, findUserById };
