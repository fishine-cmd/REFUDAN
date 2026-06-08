// Upstash Redis client (HTTP REST). 全局单例。
// 凭据来自 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN。
// 所有 key 加 `refudan:` 前缀避免与同一 Upstash 实例其他项目冲突。

import { Redis } from "@upstash/redis";

let _client: Redis | null = null;

export function getRedis(): Redis {
  if (_client) return _client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing in env",
    );
  }
  _client = new Redis({ url, token });
  return _client;
}

// ────────────────────────────────────────────────────────────────────────
// Key builders — 全部从这里出,禁止散落字符串。
// ────────────────────────────────────────────────────────────────────────
export const K = {
  user: (id: string) => `refudan:user:${id}`,
  userByName: (username: string) => `refudan:user:byname:${username}`,
  usersByRole: (role: "senior" | "junior") => `refudan:user:byrole:${role}`,
  profile: (id: string) => `refudan:profile:${id}`,
  session: (token: string) => `refudan:session:${token}`,
  sessionByUser: (id: string) => `refudan:session:byuser:${id}`,
  chat: (chatId: string) => `refudan:chat:${chatId}`,
  chatMsgs: (chatId: string) => `refudan:chat:msgs:${chatId}`,
  a2aTrace: (sessionId: string) => `refudan:a2a:trace:${sessionId}`,
  a2aHandoff: (sessionId: string) => `refudan:a2a:handoff:${sessionId}`,
  a2aAssessment: (sessionId: string) => `refudan:a2a:assessment:${sessionId}`,
  a2aAssessmentByIntent: (juniorId: string, intentHash: string) =>
    `refudan:a2a:assessment-by-intent:${juniorId}:${encodeURIComponent(intentHash)}`,
  inboxSenior: (id: string) => `refudan:inbox:senior:${id}`,
  inboxJunior: (id: string) => `refudan:inbox:junior:${id}`,
  inboxSeniorUnread: (id: string) => `refudan:inbox:senior:${id}:unread`,
  matchCache: (juniorId: string) => `refudan:match:cache:${juniorId}`,
  agentGraphVersion: () => "refudan:agent:graph:version",
} as const;

// 7 天 (秒)
export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
// 推荐缓存 1 小时
export const MATCH_CACHE_TTL_SEC = 60 * 60;
