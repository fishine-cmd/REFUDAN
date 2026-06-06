import crypto from "crypto";
import fs from "fs";
import path from "path";

// SecondMe API 端点（参考: https://develop-docs.second.me/zh/docs/authentication/oauth2）
// - Authorize page (浏览器跳转): https://go.second-me.cn/oauth/
// - Token endpoints 走业务 API: https://api.mindverse.com/gate/lab/api/oauth/token/*
const BASE_URL = process.env.SECONDME_BASE_URL || "https://api.mindverse.com/gate/lab";
const AUTH_URL = process.env.SECONDME_AUTH_URL || "https://go.second-me.cn/oauth/";
const CLIENT_ID = process.env.SECONDME_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SECONDME_CLIENT_SECRET || "";
const REDIRECT_URI =
  process.env.SECONDME_REDIRECT_URI ||
  "http://localhost:3000/api/auth/secondme/callback";

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function buildAuthorizeUrl(state: string, mentorId: string): string {
  // 官方文档显示 authorize 只接受 client_id / redirect_uri / response_type / state；
  // scope 由控制台创建应用时预定，不在 URL 里传。
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    state: `${state}:${mentorId}`,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  // 官方还可能返回 camelCase 字段，做向后兼容
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

function normalizeToken(raw: TokenResponse): TokenResponse {
  return {
    ...raw,
    access_token: raw.access_token ?? raw.accessToken ?? "",
    refresh_token: raw.refresh_token ?? raw.refreshToken,
    expires_in: raw.expires_in ?? raw.expiresIn,
  };
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/oauth/token/code`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    throw new Error(`SecondMe token exchange failed: ${res.status} ${await res.text()}`);
  }
  return normalizeToken((await res.json()) as TokenResponse);
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/oauth/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    throw new Error(`SecondMe token refresh failed: ${res.status} ${await res.text()}`);
  }
  return normalizeToken((await res.json()) as TokenResponse);
}

export interface UserInfo {
  userId: string;
  name: string;
  avatar?: string;
  bio?: string;
}

// /auth/me 是轻量接口，token 拿到后第一步先调用以获得 appScopedUserId。
// 然后再调 /secondme/user/info 拿姓名等业务字段（需要 userinfo scope）。
export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  // 1) 先 /auth/me 拿稳定的 userId
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) {
    throw new Error(`SecondMe /auth/me failed: ${meRes.status} ${await meRes.text()}`);
  }
  const meJson = (await meRes.json()) as Record<string, unknown>;
  console.log("[secondme] /auth/me response:", JSON.stringify(meJson));

  // 容错：字段可能在顶层、在 data 下、用 appScopedUserId 或 userId 命名
  const data = (meJson.data ?? meJson) as Record<string, unknown>;
  const userId =
    (data.appScopedUserId as string | undefined) ??
    (data.userId as string | undefined) ??
    (meJson.appScopedUserId as string | undefined) ??
    (meJson.userId as string | undefined) ??
    "";

  // 2) 再尝试 /secondme/user/info 拿姓名头像（userinfo scope 必需；失败不阻塞）
  try {
    const infoRes = await fetch(`${BASE_URL}/api/secondme/user/info`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (infoRes.ok) {
      const j = (await infoRes.json()) as Record<string, unknown>;
      console.log("[secondme] /secondme/user/info response:", JSON.stringify(j));
      const info = (j.data ?? j) as UserInfo;
      return { ...info, userId: userId || info.userId || "unknown" };
    } else {
      console.warn("[secondme] /secondme/user/info failed:", infoRes.status);
    }
  } catch (e) {
    console.warn("[secondme] /secondme/user/info threw:", e);
  }

  return { userId: userId || "unknown", name: userId || "SecondMe user" };
}

export type ChatChunkHandler = (delta: string) => void | Promise<void>;

export async function streamChat(
  accessToken: string,
  message: string,
  onChunk: ChatChunkHandler,
): Promise<{ sessionId?: string }> {
  const res = await fetch(`${BASE_URL}/api/secondme/chat/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok || !res.body) {
    throw new Error(`SecondMe chat/stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sessionId: string | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return { sessionId };
      try {
        const json = JSON.parse(payload) as {
          sessionId?: string;
          choices?: { delta?: { content?: string } }[];
        };
        if (json.sessionId) sessionId = json.sessionId;
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) await onChunk(delta);
      } catch {
        // skip non-JSON lines
      }
    }
  }
  return { sessionId };
}

// ─────────────────────────────────────────────────────────────
// Token store (demo-only file-based persistence)
// 生产应替换为加密的数据库存储 + token 刷新 + 撤销机制
// ─────────────────────────────────────────────────────────────
const TOKEN_FILE = path.join(process.cwd(), "mentor_tokens.json");

interface StoredToken {
  mentorId: string;
  secondmeUserId: string;
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  grantedAt: string;
}

function readStore(): Record<string, StoredToken> {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StoredToken>): void {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function saveMentorToken(mentorId: string, token: StoredToken): void {
  const store = readStore();
  store[mentorId] = token;
  writeStore(store);
}

export function getMentorToken(mentorId: string): StoredToken | null {
  return readStore()[mentorId] ?? null;
}

export function revokeMentorToken(mentorId: string): void {
  const store = readStore();
  delete store[mentorId];
  writeStore(store);
}

export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}
