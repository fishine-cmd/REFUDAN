// User / Session / Profile data access against Upstash Redis.
// 接口形态尽量贴近原 lib/db.ts 以降低 API 路由迁移面,差别:全部 async。

import { randomBytes } from "node:crypto";
import { getRedis, K, SESSION_TTL_SEC } from "./redis";
import { buildAgentSnapshot, parseStoredAgentProfile } from "./agent-snapshot";

// ────────────────────────────────────────────────────────────────────────
// Types — 与原 db.ts 保持一致
// ────────────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: "senior" | "junior";
  avatar: string | null;
  bio: string | null;
  created_at: number;
  title: string | null;
  scores_json: string | null;
  tags_json: string | null;
  badges_json: string | null;
  highlight: string | null;
  persona_json: string | null;
  detailed_profile_json: string | null;
  built_profile_json: string | null;
  agent_profile_json: string | null;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: "senior" | "junior";
  avatar: string | null;
  bio: string | null;
  title?: string | null;
  scores?: number[];
  tags?: string[];
  badges?: string[];
  highlight?: string | null;
  avatarUrl?: string | null;
  persona?: { name: string; background: string; expertise: string } | null;
  agent?: {
    school?: string;
    major?: string;
    goal?: string;
    promptText?: string;
    skills?: string[];
    interests?: string[];
    topics?: string[];
    styleCues?: string[];
  } | null;
}

// ────────────────────────────────────────────────────────────────────────
// Internal: 把 Redis hash(string→string) 合并成 UserRow
// ────────────────────────────────────────────────────────────────────────

function rowFromHash(
  id: string,
  user: Record<string, string> | null,
  profile: Record<string, string> | null,
): UserRow | null {
  if (!user || !user.username) return null;
  return {
    id,
    username: user.username,
    password_hash: user.password_hash,
    display_name: user.display_name,
    role: user.role as "senior" | "junior",
    avatar: user.avatar ?? null,
    bio: user.bio ?? null,
    created_at: Number(user.created_at) || 0,
    title: user.title ?? null,
    highlight: user.highlight ?? null,
    scores_json: profile?.scores_json ?? null,
    tags_json: profile?.tags_json ?? null,
    badges_json: profile?.badges_json ?? null,
    persona_json: profile?.persona_json ?? null,
    detailed_profile_json: profile?.detailed_profile_json ?? null,
    built_profile_json: profile?.built_profile_json ?? null,
    agent_profile_json: profile?.agent_profile_json ?? null,
  };
}

export function toPublicUser(row: UserRow): PublicUser {
  const snapshot = buildAgentSnapshot({
    displayName: row.display_name,
    bio: row.bio,
    title: row.title,
    highlight: row.highlight,
    avatar: row.avatar,
    tagsJson: row.tags_json,
    personaJson: row.persona_json,
    detailedProfileJson: row.detailed_profile_json,
    builtProfileJson: row.built_profile_json,
    agentProfileJson: row.agent_profile_json,
  });
  const base: PublicUser = {
    id: row.id,
    username: row.username,
    displayName: snapshot.displayName || row.display_name,
    role: row.role,
    avatar: snapshot.avatarUrl || row.avatar,
    avatarUrl: snapshot.avatarUrl || row.avatar,
    bio: snapshot.bio || row.bio,
    title: snapshot.title || row.title,
    highlight: snapshot.highlight || row.highlight,
    agent: {
      school: snapshot.school || undefined,
      major: snapshot.major || undefined,
      goal: snapshot.goal || undefined,
      promptText: snapshot.promptText || undefined,
      skills: snapshot.skills,
      interests: snapshot.interests,
      topics: snapshot.topics,
      styleCues: snapshot.styleCues,
    },
  };
  if (row.role === "senior") {
    if (row.scores_json) {
      try { base.scores = JSON.parse(row.scores_json); } catch { /* ignore */ }
    }
    if (row.tags_json) {
      try { base.tags = JSON.parse(row.tags_json); } catch { /* ignore */ }
    }
    if ((!base.tags || base.tags.length === 0) && snapshot.tags.length > 0) {
      base.tags = snapshot.tags;
    }
    if (row.badges_json) {
      try { base.badges = JSON.parse(row.badges_json); } catch { /* ignore */ }
    }
    if (row.persona_json) {
      try { base.persona = JSON.parse(row.persona_json); } catch { /* ignore */ }
    }
    if (!base.persona) {
      base.persona = {
        name: snapshot.displayName,
        background: snapshot.personaBackground,
        expertise: snapshot.personaExpertise,
      };
    }
  }
  return base;
}

// ────────────────────────────────────────────────────────────────────────
// User CRUD
// ────────────────────────────────────────────────────────────────────────

export async function findUserById(id: string): Promise<UserRow | null> {
  const r = getRedis();
  const [user, profile] = await Promise.all([
    r.hgetall<Record<string, string>>(K.user(id)),
    r.hgetall<Record<string, string>>(K.profile(id)),
  ]);
  return rowFromHash(id, user, profile);
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const r = getRedis();
  const id = await r.get<string>(K.userByName(username.toLowerCase()));
  if (!id) return null;
  return findUserById(id);
}

export async function listUsersByRole(role: "senior" | "junior"): Promise<UserRow[]> {
  const r = getRedis();
  const ids = await r.smembers(K.usersByRole(role));
  if (ids.length === 0) return [];
  const rows = await Promise.all(ids.map((id) => findUserById(id)));
  return rows.filter((row): row is UserRow => row !== null)
    .sort((a, b) => a.created_at - b.created_at);
}

export async function insertUser(input: {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: "senior" | "junior";
  created_at: number;
  avatar?: string | null;
  bio?: string | null;
  title?: string | null;
  scores_json?: string | null;
  tags_json?: string | null;
  badges_json?: string | null;
  highlight?: string | null;
  persona_json?: string | null;
  detailed_profile_json?: string | null;
  built_profile_json?: string | null;
  agent_profile_json?: string | null;
}): Promise<void> {
  const r = getRedis();
  const userKey = K.user(input.id);
  const profileKey = K.profile(input.id);

  const userFields: Record<string, string> = {
    username: input.username,
    password_hash: input.password_hash,
    display_name: input.display_name,
    role: input.role,
    created_at: String(input.created_at),
  };
  if (input.avatar != null) userFields.avatar = input.avatar;
  if (input.bio != null) userFields.bio = input.bio;
  if (input.title != null) userFields.title = input.title;
  if (input.highlight != null) userFields.highlight = input.highlight;

  const profileFields: Record<string, string> = {};
  if (input.scores_json != null) profileFields.scores_json = input.scores_json;
  if (input.tags_json != null) profileFields.tags_json = input.tags_json;
  if (input.badges_json != null) profileFields.badges_json = input.badges_json;
  if (input.persona_json != null) profileFields.persona_json = input.persona_json;
  if (input.detailed_profile_json != null) profileFields.detailed_profile_json = input.detailed_profile_json;
  if (input.built_profile_json != null) profileFields.built_profile_json = input.built_profile_json;
  if (input.agent_profile_json != null) profileFields.agent_profile_json = input.agent_profile_json;

  await Promise.all([
    r.hset(userKey, userFields),
    r.set(K.userByName(input.username.toLowerCase()), input.id),
    r.sadd(K.usersByRole(input.role), input.id),
    Object.keys(profileFields).length > 0 ? r.hset(profileKey, profileFields) : Promise.resolve(0),
  ]);
}

async function invalidateAgentDerivedCaches(userId: string): Promise<void> {
  const r = getRedis();
  await Promise.all([
    r.del(K.matchCache(userId)),
    r.incr(K.agentGraphVersion()),
  ]);
}

export async function updateUserBuiltProfile(
  userId: string,
  builtProfile: unknown | null,
): Promise<void> {
  const r = getRedis();
  if (builtProfile === null) {
    await r.hdel(K.profile(userId), "built_profile_json");
  } else {
    await r.hset(K.profile(userId), {
      built_profile_json: JSON.stringify(builtProfile),
    });
  }
  // 学弟改 builtProfile 后,推荐结果缓存失效
  await invalidateAgentDerivedCaches(userId);
}

export async function getBuiltProfile(userId: string): Promise<unknown | null> {
  const r = getRedis();
  const v = await r.hget<string>(K.profile(userId), "built_profile_json");
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Agent profile — 用户在工作台录入的"主 Agent"完整档案
// （简历 / 标准化信息 / 外部账号 / 知识库 / 对话定位）。
// builtProfile（社交画像）仍单独存 built_profile_json,这里只存手填部分,
// GET /api/profile/me 时两者合并返回。
// ────────────────────────────────────────────────────────────────────────

export interface AgentKnowledgeItem {
  id: string;
  title: string;
  source: string;
  privacy: string;
}

export interface AgentProfile {
  resumeFileName?: string | null;
  resumeText?: string;
  school?: string;
  major?: string;
  gpa?: string;
  goal?: string;
  promptText?: string;
  accounts?: {
    xhsId?: string;
    githubUser?: string;
    linkedinUrl?: string;
    zhihuId?: string;
  };
  knowledgeItems?: AgentKnowledgeItem[];
  createdAt?: number;
  updatedAt?: number;
}

export async function updateUserAgentProfile(
  userId: string,
  agentProfile: AgentProfile | null,
): Promise<void> {
  const r = getRedis();
  if (agentProfile === null) {
    await r.hdel(K.profile(userId), "agent_profile_json");
  } else {
    await r.hset(K.profile(userId), {
      agent_profile_json: JSON.stringify(agentProfile),
    });
  }
  // 档案变更后,推荐结果缓存失效
  await invalidateAgentDerivedCaches(userId);
}

export async function getAgentProfile(userId: string): Promise<AgentProfile | null> {
  const r = getRedis();
  const v = await r.hget<string>(K.profile(userId), "agent_profile_json");
  if (!v) return null;
  if (typeof v === "object") return v as AgentProfile;
  return parseStoredAgentProfile(v) as AgentProfile | null;
}

// ────────────────────────────────────────────────────────────────────────
// Sessions
// ────────────────────────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  const r = getRedis();
  const token = randomBytes(32).toString("hex");
  // Must HSET before EXPIRE — EXPIRE on a non-existent key is a silent no-op.
  await r.hset(K.session(token), { user_id: userId, created_at: String(Date.now()) });
  await Promise.all([
    r.expire(K.session(token), SESSION_TTL_SEC),
    r.sadd(K.sessionByUser(userId), token),
  ]);
  return token;
}

export async function destroySession(token: string): Promise<void> {
  const r = getRedis();
  const userId = await r.hget<string>(K.session(token), "user_id");
  const ops: Promise<unknown>[] = [r.del(K.session(token))];
  if (userId) ops.push(r.srem(K.sessionByUser(userId), token));
  await Promise.all(ops);
}

export async function touchSession(token: string): Promise<void> {
  await getRedis().expire(K.session(token), SESSION_TTL_SEC);
}

export async function findUserBySessionToken(token: string): Promise<UserRow | null> {
  const userId = await getRedis().hget<string>(K.session(token), "user_id");
  if (!userId) return null;
  return findUserById(userId);
}
