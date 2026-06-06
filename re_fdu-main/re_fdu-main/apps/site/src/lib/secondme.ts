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
}

// SecondMe 实际可能返回 snake_case、camelCase，或者用 { code, data: {...} } 包装
function normalizeToken(raw: unknown): TokenResponse {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const data = (obj.data ?? obj) as Record<string, unknown>;
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = data[k] ?? obj[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
    return undefined;
  };
  const pickNum = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = data[k] ?? obj[k];
      if (typeof v === "number") return v;
    }
    return undefined;
  };
  return {
    access_token:
      pick("access_token", "accessToken", "token", "at") ?? "",
    refresh_token: pick("refresh_token", "refreshToken", "rt"),
    expires_in: pickNum("expires_in", "expiresIn"),
    scope: pick("scope", "scopes"),
    token_type: pick("token_type", "tokenType"),
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
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`SecondMe token exchange failed: ${res.status} ${rawText}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw new Error(`SecondMe token endpoint returned non-JSON: ${rawText.slice(0, 500)}`);
  }
  console.log("[secondme] /api/oauth/token/code raw response:", JSON.stringify(raw));
  const token = normalizeToken(raw);
  if (!token.access_token) {
    throw new Error(
      `SecondMe token exchange returned no access_token. Raw: ${JSON.stringify(raw).slice(0, 500)}`,
    );
  }
  return token;
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
  return normalizeToken(await res.json());
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
  console.log(
    "[secondme] chat/stream status:",
    res.status,
    "content-type:",
    res.headers.get("content-type"),
  );
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`SecondMe chat/stream failed: ${res.status} ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sessionId: string | undefined;
  let rawDump = "";
  let chunkCount = 0;

  // 提取一个 JSON payload 里的 content delta（兼容多种字段命名）
  function extractDelta(json: Record<string, unknown>): string | undefined {
    const choices = json.choices as
      | { delta?: { content?: string }; message?: { content?: string } }[]
      | undefined;
    const fromChoice =
      choices?.[0]?.delta?.content ?? choices?.[0]?.message?.content;
    if (fromChoice) return fromChoice;
    // 备用字段
    const data = json.data as Record<string, unknown> | undefined;
    return (
      (json.content as string | undefined) ??
      (json.delta as string | undefined) ??
      (json.message as string | undefined) ??
      (data?.content as string | undefined) ??
      (data?.delta as string | undefined)
    );
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    rawDump += text;
    buf += text;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // 支持 `data: xxx` 和 `data:xxx` 两种格式；也支持纯 JSON 行（NDJSON）
      let payload = trimmed;
      if (trimmed.startsWith("data:")) {
        payload = trimmed.slice(5).trim();
      } else if (trimmed.startsWith("event:") || trimmed.startsWith(":")) {
        continue;
      }
      if (payload === "[DONE]" || payload === "data: [DONE]") {
        console.log("[secondme] chunks emitted:", chunkCount);
        return { sessionId };
      }
      try {
        const json = JSON.parse(payload) as Record<string, unknown>;
        if (json.sessionId) sessionId = json.sessionId as string;
        const delta = extractDelta(json);
        if (delta) {
          chunkCount += 1;
          await onChunk(delta);
        }
      } catch {
        // 不是 JSON 就忽略
      }
    }
  }

  console.log("[secondme] chunks emitted:", chunkCount);
  if (chunkCount === 0) {
    // 第一次失败时把原始响应贴到日志里（限长），便于诊断字段格式
    console.log(
      "[secondme] raw response (first 1500 chars):",
      rawDump.slice(0, 1500),
    );
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
