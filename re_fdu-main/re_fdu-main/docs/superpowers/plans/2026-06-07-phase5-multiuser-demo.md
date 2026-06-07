# Phase 5 — Upstash Redis 多用户 Demo 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Phase 4 的本地 SQLite 多用户体系整体迁到 Upstash Redis 云端,并加上学弟侧推荐+搜索双轨主页、学长侧收件箱主页、单向 A2A 对话页,完成可对外展示的多用户 demo 闭环。

**Architecture:** 后端先行(C 方案)。先建 Redis 适配层 + seed 脚本,再把现有 API 路由数据访问层整体切换到 Redis(前端不动),然后新增学长侧 API+推荐打分,最后整体重制 4 个新前端页面。Upstash 完全替代 SQLite,无回退路径。

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Bun · `@upstash/redis` (REST) · DeepSeek API · node:crypto (scrypt + randomBytes)

**Spec:** `docs/superpowers/specs/2026-06-07-phase5-multiuser-demo-design.md`

**重要工程提醒(全 plan 适用)**:
1. 项目无测试框架。本 plan 用 **smoke scripts 跑 Redis 单元检查 + curl 跑 API 集成 + 浏览器手测** 替代。每个改造任务的"验证"步骤都给出具体命令和预期。
2. Upstash Redis SDK 全部返 Promise。`apps/site/src/lib/db.ts` 里所有同步函数(`findUserById` / `findUserByUsername` / `createSession` 等)迁到 Redis 后都变 async,**调用点全部要补 await**。`auth.ts` 里有 4 处同步调用需要级联改成 async。
3. 工作目录:所有 `bun` 命令都从 monorepo 根 `D:\GitHub项目2\REFUDAN\re_fdu-main\re_fdu-main\` 跑,或者 `bun --cwd apps/site ...`;路径以 monorepo 根为基准。
4. 文件 IO 编码:Windows 上 `bun` 默认 UTF-8 输出,但旧 `启动.bat` 的中文打印走 GBK + CRLF — 见 `[[project-refudan-windows-bat-encoding]]`。本 plan 不改 .bat。
5. 提交风格:沿用现有 `feat(phaseX): ...` / `fix(...): ...` / `docs(spec): ...` 前缀。

---

## Phase 5.1 — Redis 适配层 + Seed 脚本

> **目标**:接入 Upstash Redis SDK,写好类型化访问包装、把 6 个学长 seed 进去。完成后**不切换任何 API**,SQLite 仍在跑。

### Task 1: 装依赖 + 配置环境变量

**Files:**
- Modify: `apps/site/package.json`
- Create: `apps/site/.env.local.example`
- Modify: `apps/site/.env.local`(用户已有)

- [ ] **Step 1: 装 @upstash/redis**

Run from `apps/site/`:
```
bun add @upstash/redis
```

Expected: `apps/site/package.json` 新增 `"@upstash/redis": "^1.x"` 在 `dependencies`,`bun.lock` 更新。

- [ ] **Step 2: 把 Upstash 凭据写入 .env.local**

去 Upstash 控制台 `https://console.upstash.com/redis/dc48ed99-7745-4aca-afd1-23ebb762b7c0` → Details 页 → 复制 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`,追加到 `apps/site/.env.local`:

```
# ---------- Upstash Redis ----------
UPSTASH_REDIS_REST_URL=https://<your-instance>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<your-token>
```

- [ ] **Step 3: 创建 .env.local.example 给后续协作者**

Create `apps/site/.env.local.example`:

```
# DeepSeek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com

# GitHub REST API (可选,升 60→5000 req/h)
GITHUB_TOKEN=

# Upstash Redis (https://console.upstash.com/)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 4: 类型检查通过(确认 SDK 类型正确加载)**

Run from monorepo root:
```
bun run typecheck:site
```

Expected: 0 errors. 若出现 `cannot find module '@upstash/redis'`,确认 Step 1 装在 `apps/site/` 而非根 workspace。

- [ ] **Step 5: Commit**

```
git add apps/site/package.json apps/site/bun.lock apps/site/.env.local.example
git commit -m "feat(phase5.1): add @upstash/redis dep + env template"
```

> **不提交 `.env.local`**(已在 .gitignore)。

---

### Task 2: 创建 Redis 客户端单例 + key 帮助器

**Files:**
- Create: `apps/site/src/lib/redis.ts`
- Create: `apps/site/scripts/smoke-redis.ts`(临时 smoke,Task 5 后删)
- Modify: `apps/site/package.json`(加 scripts)

- [ ] **Step 1: 写 redis.ts**

Create `apps/site/src/lib/redis.ts`:

```ts
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
  inboxSenior: (id: string) => `refudan:inbox:senior:${id}`,
  inboxJunior: (id: string) => `refudan:inbox:junior:${id}`,
  inboxSeniorUnread: (id: string) => `refudan:inbox:senior:${id}:unread`,
  matchCache: (juniorId: string) => `refudan:match:cache:${juniorId}`,
} as const;

// 7 天 (秒)
export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
// 推荐缓存 1 小时
export const MATCH_CACHE_TTL_SEC = 60 * 60;
```

- [ ] **Step 2: 写 smoke 脚本验证连通性**

Create `apps/site/scripts/smoke-redis.ts`:

```ts
// Smoke test for Upstash Redis connection. 跑一次后删除。
// Usage: bun --cwd apps/site scripts/smoke-redis.ts

import { getRedis, K } from "../src/lib/redis";

async function main() {
  const r = getRedis();
  const probe = `refudan:smoke:${Date.now()}`;
  await r.set(probe, "ok", { ex: 60 });
  const v = await r.get<string>(probe);
  if (v !== "ok") throw new Error(`got ${JSON.stringify(v)}, want "ok"`);
  await r.del(probe);
  console.log("[smoke] Upstash Redis OK, key builder sample:", K.user("test"));
}

main().catch((e) => {
  console.error("[smoke] FAILED:", e);
  process.exit(1);
});
```

- [ ] **Step 3: 加 package.json 脚本入口**

Edit `apps/site/package.json`. 把 `scripts` 块改成:

```json
"scripts": {
  "dev": "next dev -p 3000",
  "build": "next build",
  "start": "next start -p 3000",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "smoke:redis": "bun scripts/smoke-redis.ts",
  "seed": "bun scripts/seed-redis.ts"
}
```

> **注**:`seed` 脚本在 Task 5 才创建,但提前注册以减少 commit 散乱。

- [ ] **Step 4: 跑通 smoke**

Run from `apps/site/`:
```
bun run smoke:redis
```

Expected stdout 含 `[smoke] Upstash Redis OK`。若报 `UPSTASH_REDIS_REST_URL ... missing`,回 Task 1 Step 2 检查 `.env.local`(注意 Next.js 加载 .env.local 但裸 bun 不自动加载,Step 5 用 `bun --env-file` 处理)。

- [ ] **Step 5: 如果 Step 4 报 env 缺失,改 dotenv 显式加载**

修 `apps/site/scripts/smoke-redis.ts` 顶部:

```ts
import { getRedis, K } from "../src/lib/redis";
import { config } from "node:process";

// Bun 不自动读 .env.local,显式加载
process.loadEnvFile?.(".env.local");
```

再跑 `bun run smoke:redis`。

> 如果 Bun 版本不支持 `process.loadEnvFile`,改用 `bun --env-file=.env.local scripts/smoke-redis.ts`。在 package.json scripts 里加 `--env-file=.env.local`。

- [ ] **Step 6: Typecheck + commit**

```
bun --cwd apps/site run typecheck
git add apps/site/src/lib/redis.ts apps/site/scripts/smoke-redis.ts apps/site/package.json
git commit -m "feat(phase5.1): Redis client singleton + key builders + smoke test"
```

---

### Task 3: 用户/Session/Profile 数据访问层

**Files:**
- Create: `apps/site/src/lib/users-redis.ts`(替代 `lib/db.ts` 的所有用户数据函数)

- [ ] **Step 1: 写 users-redis.ts(包括类型 + CRUD + Session)**

Create `apps/site/src/lib/users-redis.ts`:

```ts
// User / Session / Profile data access against Upstash Redis.
// 接口形态尽量贴近原 lib/db.ts 以降低 API 路由迁移面,差别:全部 async。

import { randomBytes } from "node:crypto";
import { getRedis, K, SESSION_TTL_SEC } from "./redis";

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
  persona?: { name: string; background: string; expertise: string } | null;
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
  };
}

export function toPublicUser(row: UserRow): PublicUser {
  const base: PublicUser = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    avatar: row.avatar,
    bio: row.bio,
  };
  if (row.role === "senior") {
    base.title = row.title;
    if (row.scores_json) {
      try { base.scores = JSON.parse(row.scores_json); } catch { /* ignore */ }
    }
    if (row.tags_json) {
      try { base.tags = JSON.parse(row.tags_json); } catch { /* ignore */ }
    }
    if (row.badges_json) {
      try { base.badges = JSON.parse(row.badges_json); } catch { /* ignore */ }
    }
    base.highlight = row.highlight;
    if (row.persona_json) {
      try { base.persona = JSON.parse(row.persona_json); } catch { /* ignore */ }
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
  title?: string | null;
  scores_json?: string | null;
  tags_json?: string | null;
  badges_json?: string | null;
  highlight?: string | null;
  persona_json?: string | null;
  detailed_profile_json?: string | null;
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
  if (input.title != null) userFields.title = input.title;
  if (input.highlight != null) userFields.highlight = input.highlight;

  const profileFields: Record<string, string> = {};
  if (input.scores_json != null) profileFields.scores_json = input.scores_json;
  if (input.tags_json != null) profileFields.tags_json = input.tags_json;
  if (input.badges_json != null) profileFields.badges_json = input.badges_json;
  if (input.persona_json != null) profileFields.persona_json = input.persona_json;
  if (input.detailed_profile_json != null) profileFields.detailed_profile_json = input.detailed_profile_json;

  await Promise.all([
    r.hset(userKey, userFields),
    r.set(K.userByName(input.username), input.id),
    r.sadd(K.usersByRole(input.role), input.id),
    Object.keys(profileFields).length > 0 ? r.hset(profileKey, profileFields) : Promise.resolve(0),
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
  await r.del(K.matchCache(userId));
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
// Sessions
// ────────────────────────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  const r = getRedis();
  const token = randomBytes(32).toString("hex");
  await Promise.all([
    r.hset(K.session(token), { user_id: userId, created_at: String(Date.now()) }),
    r.expire(K.session(token), SESSION_TTL_SEC),
    r.sadd(K.sessionByUser(userId), token),
  ]);
  return token;
}

export async function destroySession(token: string): Promise<void> {
  const r = getRedis();
  const userId = await r.hget<string>(K.session(token), "user_id");
  await r.del(K.session(token));
  if (userId) {
    await r.srem(K.sessionByUser(userId), token);
  }
}

export async function touchSession(token: string): Promise<void> {
  await getRedis().expire(K.session(token), SESSION_TTL_SEC);
}

export async function findUserBySessionToken(token: string): Promise<UserRow | null> {
  const userId = await getRedis().hget<string>(K.session(token), "user_id");
  if (!userId) return null;
  return findUserById(userId);
}
```

- [ ] **Step 2: Typecheck**

```
bun --cwd apps/site run typecheck
```

Expected: 0 errors. 若报 `Cannot redeclare exported variable` — 检查与 `lib/db.ts` 是否同时 import,**这步还没改 db.ts 引用方,这里不该有冲突**。

- [ ] **Step 3: Commit**

```
git add apps/site/src/lib/users-redis.ts
git commit -m "feat(phase5.1): Redis-backed user/session/profile DAL"
```

---

### Task 4: Seed 脚本 — 把 6 个学长 JSON 入 Redis

**Files:**
- Create: `apps/site/scripts/seed-redis.ts`
- Delete: `apps/site/scripts/smoke-redis.ts`(已完成使命)

- [ ] **Step 1: 写 seed-redis.ts**

Create `apps/site/scripts/seed-redis.ts`:

```ts
// 一次性 seed:把 src/data/mentors/*.json 入 Upstash Redis 作为 role=senior 用户。
// 幂等:已存在的 senior 跳过。统一密码 demo123。
// Usage: bun --cwd apps/site run seed

import fs from "node:fs";
import path from "node:path";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

process.loadEnvFile?.(".env.local");

import { getRedis, K } from "../src/lib/redis";
import { insertUser, findUserByUsername } from "../src/lib/users-redis";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(plain, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

interface MentorJson {
  id: string;
  name: string;
  avatar?: string | null;
  title?: string;
  scores?: number[];
  tags?: string[];
  badges?: string[];
  highlight?: string;
  persona?: { name: string; background: string; expertise: string };
  detailed_profile?: unknown;
}

async function main() {
  const mentorsDir = path.join(process.cwd(), "src", "data", "mentors");
  if (!fs.existsSync(mentorsDir)) {
    console.error(`[seed] mentors dir not found: ${mentorsDir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(mentorsDir).filter((f) => f.endsWith(".json"));
  const password_hash = await hashPassword("demo123");
  const now = Date.now();
  let inserted = 0, skipped = 0;

  for (const file of files) {
    const mentor: MentorJson = JSON.parse(
      fs.readFileSync(path.join(mentorsDir, file), "utf-8"),
    );
    const username = mentor.id; // mentor.id 复用作 username

    if (await findUserByUsername(username)) {
      console.log(`[seed] skip ${username} (already exists)`);
      skipped++;
      continue;
    }

    await insertUser({
      id: mentor.id,
      username,
      password_hash,
      display_name: mentor.name,
      role: "senior",
      created_at: now,
      avatar: mentor.avatar ?? null,
      title: mentor.title ?? null,
      highlight: mentor.highlight ?? null,
      scores_json: mentor.scores ? JSON.stringify(mentor.scores) : null,
      tags_json: mentor.tags ? JSON.stringify(mentor.tags) : null,
      badges_json: mentor.badges ? JSON.stringify(mentor.badges) : null,
      persona_json: mentor.persona ? JSON.stringify(mentor.persona) : null,
      detailed_profile_json: mentor.detailed_profile
        ? JSON.stringify(mentor.detailed_profile)
        : null,
    });
    console.log(`[seed] inserted ${username}`);
    inserted++;
  }
  console.log(`[seed] done. inserted=${inserted} skipped=${skipped}`);

  // 抽查
  const r = getRedis();
  const ids = await r.smembers(K.usersByRole("senior"));
  console.log(`[seed] role=senior 总数: ${ids.length}`, ids);
}

main().catch((e) => {
  console.error("[seed] FAILED:", e);
  process.exit(1);
});
```

- [ ] **Step 2: 跑 seed**

Run from `apps/site/`:
```
bun run seed
```

Expected stdout:
```
[seed] inserted chensirui
[seed] inserted chenxiaoyuan
[seed] inserted sunyifan
[seed] inserted weixuejie
[seed] inserted wuzihan
[seed] inserted zhangmingyuan
[seed] done. inserted=6 skipped=0
[seed] role=senior 总数: 6 [...6 个 id...]
```

- [ ] **Step 3: 再跑一次验证幂等**

```
bun run seed
```

Expected: 全部 `skip ... (already exists)`,`inserted=0 skipped=6`。

- [ ] **Step 4: 删除 smoke 脚本**

```
git rm apps/site/scripts/smoke-redis.ts
```

`package.json` 也删 `"smoke:redis": "bun scripts/smoke-redis.ts",` 这行(留下 dev/build/start/typecheck/seed 即可)。

- [ ] **Step 5: Typecheck + Commit**

```
bun --cwd apps/site run typecheck
git add apps/site/scripts/seed-redis.ts apps/site/package.json
git commit -m "feat(phase5.1): seed 6 mentor accounts into Upstash"
```

✅ **Phase 5.1 完成**:Redis 接通,users-redis.ts DAL 就绪,6 个学长已经在云端。

---

## Phase 5.2 — 全部 API 路由切到 Redis

> **目标**:逐路由把数据访问层从 `db.ts` 切到 `users-redis.ts`。`auth.ts` 同步函数全部 async 化。完成后**前端无变化**地继续工作,但底层 100% 走 Upstash。`/api/mentors` 改名 `/api/seniors`,旧 `/api/mentors` 保留为薄 alias。
> **风险点**:`auth.ts` 的同步 → async 改造会传染所有 import 它的地方。Task 5 先把 auth.ts 改完(用 users-redis.ts 替代 db.ts),后续路由任务在此基础上调用。

### Task 5: 改造 `lib/auth.ts` — 同步 → async + 切 Redis

**Files:**
- Modify: `apps/site/src/lib/auth.ts`

- [ ] **Step 1: 替换 import + 改 hashing 函数(不变)**

打开 `apps/site/src/lib/auth.ts`。把第 11-18 行的 import:

```ts
import {
  findUserById,
  findUserByUsername,
  getDb,
  toPublicUser,
  type PublicUser,
  type UserRow,
} from "./db";
```

替换为:

```ts
import {
  findUserById,
  findUserByUsername,
  findUserBySessionToken,
  createSession as createSessionDal,
  destroySession as destroySessionDal,
  touchSession as touchSessionDal,
  insertUser,
  toPublicUser,
  type PublicUser,
  type UserRow,
} from "./users-redis";
```

> **不再 import `getDb`** — Redis 接口里没有这玩意。

- [ ] **Step 2: 改 `createSession` 为 async wrapper**

把第 59-67 行的 `createSession`:

```ts
export function createSession(userId: string): string {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;
  getDb().prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(token, userId, now, expiresAt);
  return token;
}
```

替换为:

```ts
export async function createSession(userId: string): Promise<string> {
  return createSessionDal(userId);
}
```

- [ ] **Step 3: 改 destroySession / touchSession 为 async**

把第 69-79 行的两个函数:

```ts
export function destroySession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function touchSession(token: string): void {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  getDb().prepare("UPDATE sessions SET expires_at = ? WHERE token = ?").run(
    expiresAt,
    token,
  );
}
```

替换为:

```ts
export async function destroySession(token: string): Promise<void> {
  await destroySessionDal(token);
}

export async function touchSession(token: string): Promise<void> {
  await touchSessionDal(token);
}
```

- [ ] **Step 4: 改 findUserBySessionToken 为透传 async**

把第 81-92 行的 `findUserBySessionToken`:

```ts
export function findUserBySessionToken(token: string): UserRow | null {
  const db = getDb();
  const session = db.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?",
  ).get(token) as { user_id: string; expires_at: number } | undefined;
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return findUserById(session.user_id);
}
```

替换为(Redis 用 TTL 自动过期,不需要手动判过期):

```ts
export async function findUserBySessionToken(token: string): Promise<UserRow | null> {
  return findUserBySessionTokenDal(token);
}
```

把 Step 1 的 import alias 调整为:

```ts
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
```

- [ ] **Step 5: 更新 getCurrentUser(已 async,补 await)**

把第 124-131 行:

```ts
export async function getCurrentUser(): Promise<{ row: UserRow; pub: PublicUser } | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  const row = findUserBySessionToken(token);
  if (!row) return null;
  touchSession(token);
  return { row, pub: toPublicUser(row) };
}
```

替换为(2 处补 await):

```ts
export async function getCurrentUser(): Promise<{ row: UserRow; pub: PublicUser } | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  const row = await findUserBySessionToken(token);
  if (!row) return null;
  await touchSession(token);
  return { row, pub: toPublicUser(row) };
}
```

- [ ] **Step 6: 改 createUser 用 insertUser**

把第 193-220 行:

```ts
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

  if (findUserByUsername(username)) {
    throw new AuthError("username already taken", 409);
  }

  const passwordHash = await hashPassword(password);
  const id = randomBytes(16).toString("hex");
  const now = Date.now();

  getDb().prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, username, passwordHash, displayName, role, now);

  const row = findUserById(id);
  if (!row) throw new AuthError("user not found after insert", 500);
  return row;
}
```

替换为:

```ts
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
```

- [ ] **Step 7: 删除注释里的"Server-side sessions in SQLite"**

把第 1-6 行的注释:

```ts
// Auth primitives. Uses node:crypto.scrypt for password hashing (no native
// build deps required; fast and secure). Server-side sessions in SQLite,
// HttpOnly cookies, sliding 7-day expiration.
//
// Routes that use this MUST set `export const runtime = "nodejs"` so
// node:sqlite and node:crypto are available.
```

替换为:

```ts
// Auth primitives. node:crypto.scrypt password hashing. Server-side sessions
// in Upstash Redis (TTL-based), HttpOnly cookies, sliding 7-day expiration.
//
// Routes that use this MUST set `export const runtime = "nodejs"` so
// node:crypto is available and Upstash REST 走 fetch on Node runtime.
```

- [ ] **Step 8: Typecheck**

```
bun --cwd apps/site run typecheck
```

Expected: **会报错** — 调用 `createSession` / `destroySession` 的 API 路由现在收到 Promise,需要 await。我们先列出报错 -- Task 6/7 各 route 任务里逐一修。

记下报错列表(类似):
- `apps/site/src/app/api/auth/signup/route.ts:NN: Argument of type 'Promise<string>' is not assignable...`
- `apps/site/src/app/api/auth/login/route.ts:NN: ...`
- `apps/site/src/app/api/auth/logout/route.ts:NN: ...`

继续下一 Task,**这步先不 commit**(保留破坏状态在 working tree,Task 6 修完一起 commit Task 5+6)。

---

### Task 6: 切 `/api/auth/*` 路由(signup / login / logout / me)

**Files:**
- Modify: `apps/site/src/app/api/auth/signup/route.ts`
- Modify: `apps/site/src/app/api/auth/login/route.ts`
- Modify: `apps/site/src/app/api/auth/logout/route.ts`
- Modify: `apps/site/src/app/api/auth/me/route.ts`

- [ ] **Step 1: 查看每个 route 当前内容**

```
cat apps/site/src/app/api/auth/signup/route.ts
cat apps/site/src/app/api/auth/login/route.ts
cat apps/site/src/app/api/auth/logout/route.ts
cat apps/site/src/app/api/auth/me/route.ts
```

> **重点找**:任何调用 `createSession(...)` / `destroySession(...)` / `findUserByUsername(...)` 不带 await 的地方,补 await。

- [ ] **Step 2: 给 signup/login 加 await**

打开 `apps/site/src/app/api/auth/signup/route.ts`,找到调用 `createSession(`、`findUserByUsername(`、`createUser(` 的行,**确认每行前都有 await**。`createUser` 已是 async,只检查;`createSession` 和 `findUserByUsername` 现在变 async,补 await。

打开 `apps/site/src/app/api/auth/login/route.ts`,同样处理。注意 `verifyPassword` 一直是 async,本来就有 await,跳过。

- [ ] **Step 3: 给 logout 加 await**

打开 `apps/site/src/app/api/auth/logout/route.ts`,把 `destroySession(token)` 改为 `await destroySession(token)`。

- [ ] **Step 4: /api/auth/me 不需要改**

`/api/auth/me` 通常只调 `getCurrentUser`,后者本来就 async + await,Task 5 已改完。

- [ ] **Step 5: Typecheck**

```
bun --cwd apps/site run typecheck
```

Expected: 上述 4 个文件的报错全消。若仍有 `Argument of type 'Promise<...>'` 错,定位到行号补 await。

- [ ] **Step 6: 端到端测试 — 用 curl 验证注册/登录/登出/me**

先启动 dev server。在新终端运行:
```
bun run dev:site
```

等 server 报 `Ready in ...`。在另一终端跑:

```
# 注册一个学弟测试号
curl -s -i -X POST http://localhost:3000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"username":"testjunior01","password":"demo123","role":"junior","displayName":"测试学弟01"}'
```

Expected: `HTTP/1.1 200 OK`,响应头含 `Set-Cookie: refudan_session=...`,body 含 user JSON。

```
# 用同样凭据登录(从响应头记下 cookie,下面用 -c / -b 演示更稳)
curl -s -i -c /tmp/refudan-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"testjunior01","password":"demo123"}'
```

Expected: `200 OK` + cookies 写入 `/tmp/refudan-cookies.txt`(Windows 上换成 `%TEMP%\refudan-cookies.txt`)。

```
# 用 cookie 查 me
curl -s -b /tmp/refudan-cookies.txt http://localhost:3000/api/auth/me
```

Expected: JSON 含 `displayName: "测试学弟01", role: "junior"`。

```
# 登出
curl -s -i -b /tmp/refudan-cookies.txt -c /tmp/refudan-cookies.txt -X POST http://localhost:3000/api/auth/logout
curl -s -i -b /tmp/refudan-cookies.txt http://localhost:3000/api/auth/me
```

Expected: 登出 200,me 返 `null` 或 401。

- [ ] **Step 7: 用 seed 学长账号登录**

```
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"chensirui","password":"demo123"}'
```

Expected: 200 OK + senior 用户 JSON(含 title、persona 等字段)。

- [ ] **Step 8: Commit**

```
git add apps/site/src/lib/auth.ts apps/site/src/app/api/auth/
git commit -m "feat(phase5.2): auth.ts async + /api/auth/* on Upstash"
```

---

### Task 7: 切 `/api/profile/*` 路由(me / build / collect / analyze)

**Files:**
- Modify: `apps/site/src/app/api/profile/me/route.ts`
- Modify: `apps/site/src/app/api/profile/build/route.ts`
- Modify: `apps/site/src/app/api/profile/collect/route.ts`
- Modify: `apps/site/src/app/api/profile/analyze/route.ts`

- [ ] **Step 1: 查看 me 路由**

```
cat apps/site/src/app/api/profile/me/route.ts
```

把任何 `from "@/lib/db"` 或 `from "../../../lib/db"` 的 import 改为 `from "@/lib/users-redis"` (或对应相对路径),把 `getBuiltProfile(...)` / `updateUserBuiltProfile(...)` 调用前补 await。

- [ ] **Step 2: 同样处理 build / collect / analyze**

`collect` 和 `analyze` 透传 python-bridge,通常不直接读写 user DB。只检查它们是否 import 了 db.ts,如有,改成 users-redis.ts(虽然不调用,但避免残留 import 让 Task 12 删除时漏改)。

`build` 路由在 python pipeline 成功后会写入 `updateUserBuiltProfile(currentUser.row.id, builtProfile)`,补 await。

- [ ] **Step 3: Typecheck**

```
bun --cwd apps/site run typecheck
```

- [ ] **Step 4: 测 build 链(可选,需 DeepSeek key 已配)**

用 testjunior01 cookie 跑:
```
curl -s -b /tmp/refudan-cookies.txt http://localhost:3000/api/profile/me
```
Expected: `{}` 或 `{"builtProfile":null}`(用户从未跑过 build)。

完整 build 链耗时长(GitHub + XHS 数据爬取 ~30s),手动在浏览器 `/agent-workbench` 跑一次更稳。这里只 typecheck + commit。

- [ ] **Step 5: Commit**

```
git add apps/site/src/app/api/profile/
git commit -m "feat(phase5.2): /api/profile/* on Upstash"
```

---

### Task 8: 新建 `/api/seniors` + 保留 `/api/mentors` alias

**Files:**
- Create: `apps/site/src/app/api/seniors/route.ts`
- Modify: `apps/site/src/app/api/mentors/route.ts`(改为薄 alias)

- [ ] **Step 1: 创建 /api/seniors/route.ts**

Create `apps/site/src/app/api/seniors/route.ts`:

```ts
// GET /api/seniors → 列出所有 role=senior 用户公开资料
// 用于学弟主页和搜索。
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { listUsersByRole, toPublicUser } from "@/lib/users-redis";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const rows = await listUsersByRole("senior");
  const mentors = rows.map((row) => {
    const pub = toPublicUser(row);
    // 兼容旧 mentor-card 期望的 MentorSummary 形状:
    return {
      id: pub.id,
      name: pub.displayName,
      title: pub.title ?? "",
      avatar: pub.avatar,
      scores: pub.scores ?? [50, 50, 50, 50],
      tags: pub.tags ?? [],
      badges: pub.badges ?? [],
      highlight: pub.highlight ?? "",
      meta: "",
    };
  });
  return NextResponse.json({ mentors });
}
```

> **MentorSummary 形状**:看 `apps/site/src/app/mentors/page.tsx:5-15` 类型定义,保持 `{id,name,title,avatar,scores,tags,badges,highlight,meta}` 不变,前端 5.4 之前不用改。

- [ ] **Step 2: /api/mentors 改为薄 alias**

打开 `apps/site/src/app/api/mentors/route.ts`,**完整替换文件内容**为:

```ts
// Deprecated:5.2-5.3 期间的薄 alias,内部转发 /api/seniors。
// 5.4 删除前端 /mentors 页面同时删除本路由。
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL("/api/seniors", req.url);
  const r = await fetch(url, {
    headers: req.headers,
    cache: "no-store",
  });
  return new NextResponse(r.body, {
    status: r.status,
    headers: r.headers,
  });
}
```

- [ ] **Step 3: 验证 /api/mentors 和 /api/seniors 返回一致**

dev server 跑着 + 用 testjunior01 cookie:
```
curl -s -b /tmp/refudan-cookies.txt http://localhost:3000/api/seniors | head -c 200
curl -s -b /tmp/refudan-cookies.txt http://localhost:3000/api/mentors | head -c 200
```

Expected: 两者返回相同的 `{"mentors":[...]}` JSON,有 6 个学长。

- [ ] **Step 4: 浏览器手测旧 /mentors 页**

打开 `http://localhost:3000/login` → 用 chensirui/demo123 登录(或新建一个 junior 登录)→ 跳 `/mentors` → 应该看到 6 张学长卡片 + 雷达图。

- [ ] **Step 5: Commit**

```
git add apps/site/src/app/api/seniors/ apps/site/src/app/api/mentors/
git commit -m "feat(phase5.2): /api/seniors (new) + /api/mentors thin alias"
```

---

### Task 9: 切 `/api/chat` 数据访问(逻辑暂不变)

**Files:**
- Modify: `apps/site/src/app/api/chat/route.ts`

- [ ] **Step 1: 查看 chat route**

```
cat apps/site/src/app/api/chat/route.ts
```

定位它从 `db.ts` 拿什么 — 主要是查 mentor 拿 persona/builtProfile。

- [ ] **Step 2: 改 import + 补 await**

把所有 `from "@/lib/db"` 改成 `from "@/lib/users-redis"`。

把 `findUserById(seniorId)` 这类同步调用补 await,在函数声明加 `async`(应该已是 async)。

> **注**:这步**不改业务逻辑**(不写 inbox / 不创 chatId)— 那是 Task 11(Phase 5.3)。仅替换数据访问。

- [ ] **Step 3: Typecheck**

```
bun --cwd apps/site run typecheck
```

- [ ] **Step 4: 手测对话**

用 testjunior01 登录浏览器(`/login`),进 `/mentors`,点任一学长 → `/agent-workbench?mentor=...` → 发问 → 应该流式返回 DeepSeek 回复。

> 没回复?检查 `.env.local` 的 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_BASE_URL=https://api.deepseek.com`(**不要带 /v1 后缀**,见 memory [[project-refudan]])。

- [ ] **Step 5: Commit**

```
git add apps/site/src/app/api/chat/route.ts
git commit -m "feat(phase5.2): /api/chat data layer on Upstash (logic unchanged)"
```

---

### Task 10: 删 `/api/profile/search` + `/api/profile/[userId]` + `/api/profiles`

**Files:**
- Delete: `apps/site/src/app/api/profile/search/route.ts`
- Delete: `apps/site/src/app/api/profile/[userId]/route.ts`
- Delete: `apps/site/src/app/api/profiles/route.ts`

- [ ] **Step 1: grep 前端是否还有引用**

```
grep -rn "/api/profile/search\|/api/profile/\[\|/api/profiles" apps/site/src --include="*.ts" --include="*.tsx"
```

如果有调用方,**记下来**,Task 18 (Phase 5.3) 新接口里要确保替代品已存在。

- [ ] **Step 2: 删除三个路由文件夹**

```
git rm -r apps/site/src/app/api/profile/search/ apps/site/src/app/api/profile/[userId]/ apps/site/src/app/api/profiles/
```

- [ ] **Step 3: Typecheck**

```
bun --cwd apps/site run typecheck
```

Expected: 0 errors(若 Step 1 找到调用方,可能有引用错误 — 暂用 placeholder fetch 跳过,Task 18 修)。

- [ ] **Step 4: Commit**

```
git commit -m "refactor(phase5.2): drop /api/profile/{search,[userId]} + /api/profiles"
```

---

### Task 11: 删 `lib/db.ts` + 删 `apps/site/data/users.db` + 完整 smoke

**Files:**
- Delete: `apps/site/src/lib/db.ts`
- Delete: `apps/site/data/users.db`

- [ ] **Step 1: 确认无引用**

```
grep -rn "from \"@/lib/db\"\|from \"./db\"\|from \"../lib/db\"\|from \"../../lib/db\"" apps/site/src
```

Expected: 0 hits。若有,定位并改成 `users-redis`。

- [ ] **Step 2: 删 db.ts**

```
git rm apps/site/src/lib/db.ts
```

- [ ] **Step 3: 删 SQLite 数据文件**

```
rm -f apps/site/data/users.db apps/site/data/users.db-wal apps/site/data/users.db-shm
rmdir apps/site/data 2>/dev/null || true
```

> 这些文件本来就在 `.gitignore` 里,不需要 git rm。

- [ ] **Step 4: Typecheck**

```
bun --cwd apps/site run typecheck
```

Expected: 0 errors。

- [ ] **Step 5: 全链路 smoke 测试**

重启 dev server (`bun run dev:site`)。按顺序跑:
1. 浏览器开 `/login`,用 chensirui/demo123 登录 → 跳首页 OK
2. 进 `/mentors` → 看见 6 学长卡片
3. 点任一学长 → `/agent-workbench` → 发问 → 流式回复
4. 退出 → 用 testjunior01 登录(Task 6 创建的)→ 重复 2-3 步
5. 注册一个新账号 → 登录 → 重复 2-3 步

任一环节挂掉,**回到对应 Task 的 Step 修**。

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "refactor(phase5.2): drop lib/db.ts + remove SQLite files"
```

✅ **Phase 5.2 完成**:所有 API 走 Upstash,前端零改动,旧功能跑通。

---

## Phase 5.3 — 学长侧 API + 推荐打分

> **目标**:新增 inbox / chats / seniors/recommend / seniors/search / seniors/[id] / inbox/[chatId]/read。改造 `/api/chat` 写入双方收件箱 + 维护 chatId。增加 `lib/chat-redis.ts` 和 `lib/match.ts`。

### Task 12: chat/inbox 数据访问层 — `lib/chat-redis.ts`

**Files:**
- Create: `apps/site/src/lib/chat-redis.ts`

- [ ] **Step 1: 写 chat-redis.ts**

Create `apps/site/src/lib/chat-redis.ts`:

```ts
// Chat / Inbox 数据访问层。所有写操作都同步更新两侧 inbox sorted set。

import { randomUUID } from "node:crypto";
import { getRedis, K } from "./redis";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export interface ChatMeta {
  chatId: string;
  juniorId: string;
  seniorId: string;
  createdAt: number;
  lastMessageAt: number;
  summary: string;
}

export async function getChatMeta(chatId: string): Promise<ChatMeta | null> {
  const r = getRedis();
  const h = await r.hgetall<Record<string, string>>(K.chat(chatId));
  if (!h || !h.junior_id) return null;
  return {
    chatId,
    juniorId: h.junior_id,
    seniorId: h.senior_id,
    createdAt: Number(h.created_at) || 0,
    lastMessageAt: Number(h.last_message_at) || 0,
    summary: h.summary ?? "",
  };
}

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  const r = getRedis();
  const items = await r.lrange<string>(K.chatMsgs(chatId), 0, -1);
  return items.map((s) => JSON.parse(s) as ChatMessage);
}

/** 创建新对话(首条用户消息前调用)。返回 chatId。 */
export async function createChat(juniorId: string, seniorId: string): Promise<string> {
  const r = getRedis();
  const chatId = randomUUID();
  const now = Date.now();
  await Promise.all([
    r.hset(K.chat(chatId), {
      junior_id: juniorId,
      senior_id: seniorId,
      created_at: String(now),
      last_message_at: String(now),
      summary: "",
    }),
    r.zadd(K.inboxJunior(juniorId), { score: now, member: chatId }),
    r.zadd(K.inboxSenior(seniorId), { score: now, member: chatId }),
  ]);
  return chatId;
}

/** 追加用户消息(学弟发问)。 */
export async function appendUserMessage(
  chatId: string,
  content: string,
  ts: number = Date.now(),
): Promise<void> {
  const r = getRedis();
  await r.rpush(K.chatMsgs(chatId), JSON.stringify({ role: "user", content, ts }));
}

/** 追加助手消息 + 更新 chat meta + 两侧 inbox score + 学长未读集。 */
export async function appendAssistantMessage(
  chatId: string,
  content: string,
  questionPreview: string,
  ts: number = Date.now(),
): Promise<void> {
  const r = getRedis();
  const meta = await getChatMeta(chatId);
  if (!meta) throw new Error(`chat ${chatId} not found`);
  await Promise.all([
    r.rpush(K.chatMsgs(chatId), JSON.stringify({ role: "assistant", content, ts })),
    r.hset(K.chat(chatId), {
      last_message_at: String(ts),
      summary: questionPreview.slice(0, 60),
    }),
    r.zadd(K.inboxJunior(meta.juniorId), { score: ts, member: chatId }),
    r.zadd(K.inboxSenior(meta.seniorId), { score: ts, member: chatId }),
    r.sadd(K.inboxSeniorUnread(meta.seniorId), chatId),
  ]);
}

/** 学长侧:取收件箱(按时间倒序),并附带未读判定。 */
export async function listSeniorInbox(seniorId: string): Promise<{
  chats: Array<ChatMeta & { unread: boolean }>;
  unreadCount: number;
}> {
  const r = getRedis();
  const [ids, unreadSet] = await Promise.all([
    r.zrange<string[]>(K.inboxSenior(seniorId), 0, -1, { rev: true }),
    r.smembers(K.inboxSeniorUnread(seniorId)),
  ]);
  const unread = new Set(unreadSet);
  const metas = await Promise.all(ids.map((id) => getChatMeta(id)));
  return {
    chats: metas
      .filter((m): m is ChatMeta => m !== null)
      .map((m) => ({ ...m, unread: unread.has(m.chatId) })),
    unreadCount: unread.size,
  };
}

/** 学弟侧:取我发起的对话列表(按时间倒序)。 */
export async function listJuniorChats(juniorId: string): Promise<ChatMeta[]> {
  const r = getRedis();
  const ids = await r.zrange<string[]>(K.inboxJunior(juniorId), 0, -1, { rev: true });
  const metas = await Promise.all(ids.map((id) => getChatMeta(id)));
  return metas.filter((m): m is ChatMeta => m !== null);
}

/** 学长标已读。 */
export async function markChatRead(seniorId: string, chatId: string): Promise<void> {
  await getRedis().srem(K.inboxSeniorUnread(seniorId), chatId);
}
```

- [ ] **Step 2: Typecheck**

```
bun --cwd apps/site run typecheck
```

- [ ] **Step 3: Commit**

```
git add apps/site/src/lib/chat-redis.ts
git commit -m "feat(phase5.3): chat/inbox DAL"
```

---

### Task 13: 推荐打分模块 — `lib/match.ts`

**Files:**
- Create: `apps/site/src/data/major-synonyms.json`
- Create: `apps/site/src/lib/match.ts`

- [ ] **Step 1: 写专业同义词表**

Create `apps/site/src/data/major-synonyms.json`:

```json
{
  "groups": [
    ["计算机", "CS", "计科", "计算机科学与技术", "软件", "软件工程", "信工", "信息工程"],
    ["电子", "EE", "电子工程", "电气", "微电子"],
    ["金融", "金融学", "财政", "经济", "经济学"],
    ["管理", "工商管理", "MBA", "管理学", "工管"],
    ["数学", "应用数学", "统计", "数据科学"],
    ["物理", "应用物理", "物理学"],
    ["化学", "应用化学", "化工"],
    ["材料", "材料学", "材料科学与工程"],
    ["生物", "生命科学", "生物学", "生物医学"],
    ["新闻", "传播", "新闻传播", "广告"]
  ]
}
```

- [ ] **Step 2: 写 match.ts**

Create `apps/site/src/lib/match.ts`:

```ts
// 推荐打分(v1 纯启发式)。
// 4 个轴各 0-100,综合 = 等权平均。

import synonyms from "../data/major-synonyms.json";
import type { UserRow } from "./users-redis";

export interface MatchResult {
  seniorId: string;
  score: number;
  scores: [number, number, number, number];
  reasons: string[];
}

const SYN_GROUPS: string[][] = synonyms.groups;

// ─── 工具 ───────────────────────────────────────────────────────────

function normalizeStr(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function inSameMajorGroup(a: string, b: string): boolean {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return false;
  return SYN_GROUPS.some((g) => {
    const lower = g.map((x) => x.toLowerCase());
    return lower.some((x) => na.includes(x)) && lower.some((x) => nb.includes(x));
  });
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  return inter / (a.size + b.size - inter);
}

function tokensFromTags(json: string | null): Set<string> {
  if (!json) return new Set();
  try {
    const arr = JSON.parse(json) as string[];
    return new Set(arr.map((s) => s.toLowerCase()).filter((s) => s.length >= 2));
  } catch {
    return new Set();
  }
}

function extractJuniorTags(builtProfileJson: string | null): Set<string> {
  if (!builtProfileJson) return new Set();
  try {
    const p = JSON.parse(builtProfileJson);
    const out = new Set<string>();
    // GitHub repos topics
    if (Array.isArray(p?.github?.repos)) {
      for (const r of p.github.repos) {
        if (Array.isArray(r?.topics)) {
          for (const t of r.topics) out.add(String(t).toLowerCase());
        }
      }
    }
    // XHS notes 关键词
    if (Array.isArray(p?.xhs?.tags)) {
      for (const t of p.xhs.tags) out.add(String(t).toLowerCase());
    }
    // builtProfile 派生的 expertise / interests
    if (Array.isArray(p?.expertise)) {
      for (const t of p.expertise) out.add(String(t).toLowerCase());
    }
    if (Array.isArray(p?.interests)) {
      for (const t of p.interests) out.add(String(t).toLowerCase());
    }
    return new Set([...out].filter((s) => s.length >= 2));
  } catch {
    return new Set();
  }
}

function extractGoals(detailedProfileJson: string | null): Set<string> {
  if (!detailedProfileJson) return new Set();
  try {
    const dp = JSON.parse(detailedProfileJson);
    const v = dp?.goals ?? dp?.target ?? "";
    if (typeof v === "string") {
      return new Set(v.toLowerCase().split(/[\s,;、，；]+/).filter((s) => s.length >= 2));
    }
    if (Array.isArray(v)) {
      return new Set(v.map((s) => String(s).toLowerCase()).filter((s) => s.length >= 2));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function getSchool(detailedProfileJson: string | null): string {
  if (!detailedProfileJson) return "";
  try {
    const dp = JSON.parse(detailedProfileJson);
    return String(dp?.education?.school ?? dp?.school ?? "");
  } catch {
    return "";
  }
}

function getMajor(detailedProfileJson: string | null): string {
  if (!detailedProfileJson) return "";
  try {
    const dp = JSON.parse(detailedProfileJson);
    return String(dp?.education?.major ?? dp?.major ?? "");
  } catch {
    return "";
  }
}

// ─── 主算法 ──────────────────────────────────────────────────────────

export function scoreOne(junior: UserRow, senior: UserRow): MatchResult {
  const jSchool = getSchool(junior.detailed_profile_json);
  const sSchool = getSchool(senior.detailed_profile_json);
  const jMajor = getMajor(junior.detailed_profile_json);
  const sMajor = getMajor(senior.detailed_profile_json);
  const jGoals = extractGoals(junior.detailed_profile_json);
  const jTags = extractJuniorTags(junior.built_profile_json);
  const sTags = tokensFromTags(senior.tags_json);
  // 学长 persona.expertise 也作为 tag 池
  let sExpertise = new Set<string>();
  if (senior.persona_json) {
    try {
      const p = JSON.parse(senior.persona_json);
      if (typeof p?.expertise === "string") {
        for (const w of p.expertise.toLowerCase().split(/[\s,;、，；]+/)) {
          if (w.length >= 2) sExpertise.add(w);
        }
      }
    } catch {}
  }
  const sPool = new Set([...sTags, ...sExpertise]);

  const reasons: string[] = [];

  // 1. 院校匹配
  let schoolScore = 50;
  if (jSchool && sSchool && normalizeStr(jSchool) === normalizeStr(sSchool)) {
    schoolScore = 100;
    reasons.push(`同为${jSchool}`);
  } else if (!jSchool) {
    schoolScore = 50;
  }

  // 2. 专业匹配
  let majorScore = 30;
  if (jMajor && sMajor) {
    if (normalizeStr(jMajor) === normalizeStr(sMajor)) {
      majorScore = 100;
      reasons.push(`同专业:${jMajor}`);
    } else if (inSameMajorGroup(jMajor, sMajor)) {
      majorScore = 70;
      reasons.push(`专业相近:${jMajor} ↔ ${sMajor}`);
    }
  } else {
    majorScore = 50;
  }

  // 3. 目标重合
  let goalScore = 20;
  if (jGoals.size > 0 && sPool.size > 0) {
    const overlap = [...jGoals].filter((g) => sPool.has(g));
    goalScore = Math.max(20, Math.round(jaccard(jGoals, sPool) * 100));
    if (overlap.length > 0) {
      reasons.push(`目标重合:${overlap.slice(0, 3).join("、")}`);
    }
  }

  // 4. 经历相似
  let expScore = 20;
  if (jTags.size > 0 && sTags.size > 0) {
    const overlap = [...jTags].filter((t) => sTags.has(t));
    expScore = Math.max(20, Math.round(jaccard(jTags, sTags) * 100));
    if (overlap.length > 0) {
      reasons.push(`经历相近:${overlap.slice(0, 3).join("、")}`);
    }
  }

  const scores: [number, number, number, number] = [
    schoolScore,
    majorScore,
    goalScore,
    expScore,
  ];
  const score = Math.round(scores.reduce((a, b) => a + b, 0) / 4);

  return {
    seniorId: senior.id,
    score,
    scores,
    reasons,
  };
}

export function rankSeniors(
  junior: UserRow,
  seniors: UserRow[],
  topN = 6,
): MatchResult[] {
  // 冷启动:学弟 builtProfile + detailed_profile 都空 → 给中性结果 + 引导文案
  const hasAnyJuniorData =
    !!junior.built_profile_json || !!junior.detailed_profile_json;
  if (!hasAnyJuniorData) {
    return seniors.slice(0, topN).map((s) => ({
      seniorId: s.id,
      score: 50,
      scores: [50, 50, 50, 50],
      reasons: ["完成社媒提取后可获得个性化匹配"],
    }));
  }
  return seniors
    .map((s) => scoreOne(junior, s))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
```

- [ ] **Step 3: Typecheck**

```
bun --cwd apps/site run typecheck
```

- [ ] **Step 4: Commit**

```
git add apps/site/src/data/major-synonyms.json apps/site/src/lib/match.ts
git commit -m "feat(phase5.3): heuristic recommendation scoring + major synonyms"
```

---

### Task 14: 大改 `/api/chat` — 写入收件箱 + 创建 chatId + 末尾元数据

**Files:**
- Modify: `apps/site/src/app/api/chat/route.ts`

- [ ] **Step 1: 读现状**

```
cat apps/site/src/app/api/chat/route.ts
```

记下:
- 当前 POST body 形状是什么(可能含 `mentorId, messages, builtProfile`)
- DeepSeek 调用是否流式
- persona 注入逻辑(`derivePersonaFromBuiltProfile` / `extractKeyExperiencesFromBuiltProfile` 应该在这里)

- [ ] **Step 2: 重写 route.ts — 接受 {seniorId, question, chatId?}**

> **关键**:这一步是 5.3 最复杂的一刀,先做"非流式"实现稳一波,流式可后续 Phase 6 再加。从 Phase 3a 已有的非流式 → 现在保持非流式即可,不破现状。先确认现状是否流式 — 看 `cat` 输出有没有 `ReadableStream` / `stream:true`。下面给非流式版本;若现状本来是流式则改成保留流式骨架但加 chat 写入。

替换 `apps/site/src/app/api/chat/route.ts` 的 POST handler 主体为:

```ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { findUserById } from "@/lib/users-redis";
import {
  createChat,
  getChatMeta,
  getChatMessages,
  appendUserMessage,
  appendAssistantMessage,
} from "@/lib/chat-redis";

// 复用 Phase 3a 已有的 persona 注入工具(应在 route.ts 里或就近 lib)。
// 若工具函数现在 inline 在 route.ts 里,保留它们。否则 import 已有路径。
// 这里假设它们已 import / inline:derivePersonaFromBuiltProfile, extractKeyExperiencesFromBuiltProfile,
// 以及 callDeepseek(messages: ChatMessage[]) => Promise<string>。

interface PostBody {
  seniorId: string;
  question: string;
  chatId?: string;
}

export async function POST(req: NextRequest) {
  let me;
  try {
    me = await requireRole("junior");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }

  const body = (await req.json()) as PostBody;
  if (!body.seniorId || !body.question?.trim()) {
    return NextResponse.json(
      { error: "seniorId and question required" },
      { status: 400 },
    );
  }

  const senior = await findUserById(body.seniorId);
  if (!senior || senior.role !== "senior") {
    return NextResponse.json(
      { error: "senior not found" },
      { status: 404 },
    );
  }

  // 1. chatId 处理:无则建,有则鉴权
  let chatId = body.chatId;
  if (!chatId) {
    chatId = await createChat(me.row.id, senior.id);
  } else {
    const meta = await getChatMeta(chatId);
    if (!meta || meta.juniorId !== me.row.id || meta.seniorId !== senior.id) {
      return NextResponse.json({ error: "chat not found" }, { status: 404 });
    }
  }

  // 2. 写学弟问题
  await appendUserMessage(chatId, body.question);

  // 3. 构造 DeepSeek messages
  const history = await getChatMessages(chatId); // 含刚 push 的 user
  const systemPrompt = buildSystemPrompt(senior); // 用 senior persona + builtProfile 派生
  const deepseekMsgs = [
    { role: "system" as const, content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  // 4. 调 DeepSeek(非流式;若现状流式,保留 streaming)
  const reply = await callDeepseek(deepseekMsgs);

  // 5. 写助手回复 + 更新 inbox + 学长未读集
  await appendAssistantMessage(chatId, reply, body.question);

  return NextResponse.json({ chatId, reply });
}

// ─── helpers(若原文件已有,保留原版本,删除此处占位)──────────────

function buildSystemPrompt(senior: { persona_json: string | null; built_profile_json: string | null; display_name: string }): string {
  // 复用 Phase 3a 的 derivePersonaFromBuiltProfile + extractKeyExperiencesFromBuiltProfile。
  // 若它们在原 route 里就保留;不在则直接拼:
  const persona = senior.persona_json ? JSON.parse(senior.persona_json) : null;
  const built = senior.built_profile_json ? JSON.parse(senior.built_profile_json) : null;
  return [
    `你是${senior.display_name}的 AI 分身。`,
    persona ? `背景:${persona.background}` : "",
    persona ? `专长:${persona.expertise}` : "",
    built ? `参考经历(由公开社媒派生):${JSON.stringify(built).slice(0, 1500)}` : "",
    "回答时第一人称,务实、具体、避免泛泛而谈;若超出你的经验范围,如实说明。",
  ].filter(Boolean).join("\n\n");
}

async function callDeepseek(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<string> {
  const url = `${process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}
```

> **注**:如果原文件已经有更完善的 `derivePersonaFromBuiltProfile` / `extractKeyExperiencesFromBuiltProfile`,保留它们替换 `buildSystemPrompt`。如果原文件是流式的,把 `callDeepseek` 改回 `stream:true` 并用 `ReadableStream` 包,**但 `appendAssistantMessage` 必须在流结束后才调用(在流的 "finish" 回调里)**。

- [ ] **Step 3: Typecheck**

```
bun --cwd apps/site run typecheck
```

- [ ] **Step 4: 端到端测**

dev server 跑着。新终端:

```
# 用 testjunior01(已注册)发问给 chensirui
curl -s -b /tmp/refudan-cookies.txt -c /tmp/refudan-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"testjunior01","password":"demo123"}'

curl -s -b /tmp/refudan-cookies.txt -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"seniorId":"chensirui","question":"申博材料里推荐信怎么准备?"}'
```

Expected: 返 `{chatId: "<uuid>", reply: "<DeepSeek 回复>"}`。记下 chatId。

```
# 用同一 chatId 继续追问
curl -s -b /tmp/refudan-cookies.txt -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"seniorId":"chensirui","question":"那导师的推荐信权重多大?","chatId":"<上面的 chatId>"}'
```

Expected: 同样的 chatId 返回,DeepSeek 应该带上下文(知道你刚问过推荐信)。

- [ ] **Step 5: 用 Upstash 控制台 spot-check 数据**

去 `https://console.upstash.com/redis/dc48ed99-7745-4aca-afd1-23ebb762b7c0/data`:
- 搜 `refudan:chat:<chatId>` → 应有 hash 含 junior_id/senior_id/created_at/last_message_at/summary
- 搜 `refudan:chat:msgs:<chatId>` → 应有 list 含 2 个 user + 2 个 assistant message
- 搜 `refudan:inbox:senior:chensirui` → 应有 sorted set 含 chatId
- 搜 `refudan:inbox:senior:chensirui:unread` → 应有 set 含 chatId

- [ ] **Step 6: Commit**

```
git add apps/site/src/app/api/chat/route.ts
git commit -m "feat(phase5.3): /api/chat writes inbox + creates chatId + persona injection"
```

> **前端 /agent-workbench 老调用会变化**:它现在传 `{mentorId, messages, builtProfile}`,本路由现在期望 `{seniorId, question, chatId?}`。**这会破坏老 agent-workbench 调用**。5.4 Task 21 会改 agent-workbench,在那之前如需保留老入口,加 fallback handler。**最小修补**:在 Step 2 的 POST 顶部加:

```ts
// Backward-compat shim:agent-workbench 老调用 5.4 改完后删
if ((body as any).mentorId && Array.isArray((body as any).messages)) {
  const oldBody = body as any;
  body.seniorId = oldBody.mentorId;
  body.question = oldBody.messages[oldBody.messages.length - 1]?.content ?? "";
}
```

放在 `const body = (await req.json()) as PostBody;` 之后。

---

### Task 15: 新 `/api/chats` + `/api/chats/[chatId]`(学弟视角对话历史)

**Files:**
- Create: `apps/site/src/app/api/chats/route.ts`
- Create: `apps/site/src/app/api/chats/[chatId]/route.ts`

- [ ] **Step 1: 创建 /api/chats**

Create `apps/site/src/app/api/chats/route.ts`:

```ts
// GET /api/chats — 学弟视角:列出我发起的所有对话
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listJuniorChats } from "@/lib/chat-redis";
import { findUserById, toPublicUser } from "@/lib/users-redis";

export async function GET() {
  let me;
  try {
    me = await requireRole("junior");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const chats = await listJuniorChats(me.row.id);
  // 联读 senior 公开资料
  const seniors = await Promise.all(
    [...new Set(chats.map((c) => c.seniorId))].map((id) => findUserById(id)),
  );
  const seniorMap = new Map(
    seniors.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.id, toPublicUser(r)]),
  );
  return NextResponse.json({
    chats: chats.map((c) => ({
      chatId: c.chatId,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
      summary: c.summary,
      senior: seniorMap.get(c.seniorId) ?? null,
    })),
  });
}
```

- [ ] **Step 2: 创建 /api/chats/[chatId]**

Create `apps/site/src/app/api/chats/[chatId]/route.ts`:

```ts
// GET /api/chats/[chatId] — 双方都可读,鉴权:必须是 junior 或 senior 参与方
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChatMeta, getChatMessages } from "@/lib/chat-redis";
import { findUserById, toPublicUser } from "@/lib/users-redis";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ chatId: string }> },
) {
  let me;
  try {
    me = await requireUser();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const { chatId } = await ctx.params;
  const meta = await getChatMeta(chatId);
  if (!meta) return NextResponse.json({ error: "chat not found" }, { status: 404 });
  if (meta.juniorId !== me.row.id && meta.seniorId !== me.row.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const [messages, junior, senior] = await Promise.all([
    getChatMessages(chatId),
    findUserById(meta.juniorId),
    findUserById(meta.seniorId),
  ]);
  return NextResponse.json({
    chatId,
    createdAt: meta.createdAt,
    lastMessageAt: meta.lastMessageAt,
    summary: meta.summary,
    junior: junior ? toPublicUser(junior) : null,
    senior: senior ? toPublicUser(senior) : null,
    messages,
  });
}
```

- [ ] **Step 3: Typecheck + curl 测**

```
bun --cwd apps/site run typecheck

# 学弟视角列表(testjunior01 cookie)
curl -s -b /tmp/refudan-cookies.txt http://localhost:3000/api/chats
# Expected: { chats: [{ chatId, summary, senior: {...} }] }

# 单 chat 详情(用 Task 14 拿到的 chatId)
curl -s -b /tmp/refudan-cookies.txt http://localhost:3000/api/chats/<chatId>
# Expected: { messages: [4 条], junior:..., senior:... }
```

- [ ] **Step 4: Commit**

```
git add apps/site/src/app/api/chats/
git commit -m "feat(phase5.3): /api/chats (junior list) + /api/chats/[chatId] (both sides)"
```

---

### Task 16: 新 `/api/inbox` + `/api/inbox/[chatId]/read`(学长收件箱)

**Files:**
- Create: `apps/site/src/app/api/inbox/route.ts`
- Create: `apps/site/src/app/api/inbox/[chatId]/read/route.ts`

- [ ] **Step 1: 创建 /api/inbox**

Create `apps/site/src/app/api/inbox/route.ts`:

```ts
// GET /api/inbox — 学长视角:收件箱列表 + 未读计数
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listSeniorInbox } from "@/lib/chat-redis";
import { findUserById, toPublicUser } from "@/lib/users-redis";

export async function GET() {
  let me;
  try {
    me = await requireRole("senior");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const { chats, unreadCount } = await listSeniorInbox(me.row.id);
  const juniors = await Promise.all(
    [...new Set(chats.map((c) => c.juniorId))].map((id) => findUserById(id)),
  );
  const juniorMap = new Map(
    juniors.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.id, toPublicUser(r)]),
  );
  return NextResponse.json({
    unreadCount,
    inbox: chats.map((c) => ({
      chatId: c.chatId,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
      summary: c.summary,
      unread: c.unread,
      junior: juniorMap.get(c.juniorId) ?? null,
    })),
  });
}
```

- [ ] **Step 2: 创建 /api/inbox/[chatId]/read**

Create `apps/site/src/app/api/inbox/[chatId]/read/route.ts`:

```ts
// POST /api/inbox/[chatId]/read — 学长标已读
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getChatMeta, markChatRead } from "@/lib/chat-redis";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ chatId: string }> },
) {
  let me;
  try {
    me = await requireRole("senior");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const { chatId } = await ctx.params;
  const meta = await getChatMeta(chatId);
  if (!meta || meta.seniorId !== me.row.id) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }
  await markChatRead(me.row.id, chatId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck + curl 测**

```
bun --cwd apps/site run typecheck

# 用 chensirui 登录
curl -s -c /tmp/refudan-senior.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"chensirui","password":"demo123"}'

# 查收件箱
curl -s -b /tmp/refudan-senior.txt http://localhost:3000/api/inbox
# Expected: { unreadCount: 1, inbox: [{ chatId, summary: "申博材料...", unread: true, junior: {...} }] }

# 标已读
curl -s -b /tmp/refudan-senior.txt -X POST http://localhost:3000/api/inbox/<chatId>/read
# Expected: { ok: true }

# 再查
curl -s -b /tmp/refudan-senior.txt http://localhost:3000/api/inbox
# Expected: unreadCount=0,inbox[0].unread=false
```

- [ ] **Step 4: Commit**

```
git add apps/site/src/app/api/inbox/
git commit -m "feat(phase5.3): /api/inbox (senior list) + /api/inbox/[chatId]/read"
```

---

### Task 17: 新 `/api/seniors/recommend` + `/api/seniors/search` + `/api/seniors/[id]`

**Files:**
- Create: `apps/site/src/app/api/seniors/recommend/route.ts`
- Create: `apps/site/src/app/api/seniors/search/route.ts`
- Create: `apps/site/src/app/api/seniors/[id]/route.ts`

- [ ] **Step 1: 创建 recommend**

Create `apps/site/src/app/api/seniors/recommend/route.ts`:

```ts
// GET /api/seniors/recommend?topN=6 — 学弟视角推荐 + 1h 缓存
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listUsersByRole, toPublicUser } from "@/lib/users-redis";
import { rankSeniors } from "@/lib/match";
import { getRedis, K, MATCH_CACHE_TTL_SEC } from "@/lib/redis";

export async function GET(req: NextRequest) {
  let me;
  try {
    me = await requireRole("junior");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }

  const topN = Number(new URL(req.url).searchParams.get("topN") ?? "6") || 6;
  const r = getRedis();
  const cached = await r.get<string>(K.matchCache(me.row.id));
  if (cached) {
    return NextResponse.json(JSON.parse(cached));
  }

  const seniors = await listUsersByRole("senior");
  const seniorMap = new Map(seniors.map((s) => [s.id, s]));
  const results = rankSeniors(me.row, seniors, topN);

  const recommendations = results
    .map((m) => {
      const s = seniorMap.get(m.seniorId);
      if (!s) return null;
      return {
        senior: toPublicUser(s),
        score: m.score,
        scores: m.scores,
        reasons: m.reasons,
      };
    })
    .filter(Boolean);

  const payload = { recommendations };
  await r.set(K.matchCache(me.row.id), JSON.stringify(payload), {
    ex: MATCH_CACHE_TTL_SEC,
  });
  return NextResponse.json(payload);
}
```

- [ ] **Step 2: 创建 search**

Create `apps/site/src/app/api/seniors/search/route.ts`:

```ts
// GET /api/seniors/search?q=foo — 简单内存子串过滤
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listUsersByRole, toPublicUser } from "@/lib/users-redis";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  const rows = await listUsersByRole("senior");
  const matched = rows
    .map(toPublicUser)
    .filter((pub) => {
      if (!q) return true;
      const hay = [
        pub.displayName,
        pub.title ?? "",
        ...(pub.tags ?? []),
        ...(pub.badges ?? []),
        pub.highlight ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  return NextResponse.json({ seniors: matched });
}
```

- [ ] **Step 3: 创建 /api/seniors/[id]**

Create `apps/site/src/app/api/seniors/[id]/route.ts`:

```ts
// GET /api/seniors/[id] — 单个学长公开资料
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { findUserById, toPublicUser } from "@/lib/users-redis";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }
  const { id } = await ctx.params;
  const row = await findUserById(id);
  if (!row || row.role !== "senior") {
    return NextResponse.json({ error: "senior not found" }, { status: 404 });
  }
  return NextResponse.json({ senior: toPublicUser(row) });
}
```

- [ ] **Step 4: Typecheck + curl 测**

```
bun --cwd apps/site run typecheck

# 学弟视角推荐
curl -s -b /tmp/refudan-cookies.txt http://localhost:3000/api/seniors/recommend
# Expected: { recommendations: [{ senior, score, scores: [n,n,n,n], reasons }] × 6 }

# 搜索
curl -s -b /tmp/refudan-cookies.txt "http://localhost:3000/api/seniors/search?q=信号"
# Expected: { seniors: [{...陈思睿...}] }

# 单学长
curl -s -b /tmp/refudan-cookies.txt http://localhost:3000/api/seniors/chensirui
# Expected: { senior: {...} }
```

- [ ] **Step 5: Commit**

```
git add apps/site/src/app/api/seniors/
git commit -m "feat(phase5.3): /api/seniors/{recommend,search,[id]} + scoring cache"
```

✅ **Phase 5.3 完成**:学长侧 API 全到位,推荐打分可用,/api/chat 写入收件箱。

---

## Phase 5.4 — 前端整体重制

> **目标**:新增 4 个页面 + 改首页+signup+agent-workbench;删旧 `/mentors` 页;删 `/api/mentors` alias。保留 minimal 粉色风。

### Task 18: 改首页 — 双入口

**Files:**
- Modify: `apps/site/src/app/page.tsx`

- [ ] **Step 1: 替换首页**

替换 `apps/site/src/app/page.tsx` 的整个 LandingPage:

```tsx
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="minimal-shell">
      <section className="minimal-hero">
        <p className="minimal-eyebrow">RE:FUDAN · Agent-native social</p>
        <h1>让经验先抵达,答案再相见。</h1>
        <p className="minimal-sub">
          你的 Agent 先完成一次高质量对话,再把真正值得的人带回到你面前。
        </p>
      </section>

      <section className="minimal-roles">
        <article className="minimal-role-card">
          <h3>我是学弟 / 学妹</h3>
          <p>提取你的社媒画像,让你的 Agent 替你先发问,在真正见面前看到值得的学长。</p>
          <Link className="minimal-primary" href="/signup?role=junior">
            注册学弟账号
          </Link>
          <Link className="minimal-secondary" href="/login">
            已有账号,登录
          </Link>
        </article>

        <article className="minimal-role-card">
          <h3>我是学长 / 学姐</h3>
          <p>训练好你的 Agent,看看哪些学弟来问过、聊了什么,在你方便的时候回应。</p>
          <Link className="minimal-primary" href="/signup?role=senior">
            注册学长账号
          </Link>
          <Link className="minimal-secondary" href="/login">
            已有账号,登录
          </Link>
        </article>
      </section>

      <section className="minimal-grid">
        <article>
          <h3>Path-first matching</h3>
          <p>从路径相似度出发,而不是标签堆叠。</p>
        </article>
        <article>
          <h3>A2A pre-conversation</h3>
          <p>先让 Agent 对话,把沟通变成可解释的桥梁。</p>
        </article>
        <article>
          <h3>Human-approved handoff</h3>
          <p>只有在值得时,真人相遇才发生。</p>
        </article>
      </section>

      <section className="minimal-quote">
        <p>「不是撮合,而是让你被再次看见。」</p>
        <span>RE:FUDAN · 2026</span>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: 加 CSS for `minimal-roles` + `minimal-role-card`**

打开 `apps/site/src/styles/_legacy-tokens.css`,末尾追加(同款 token):

```css
.minimal-roles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  max-width: 920px;
  margin: 3rem auto;
}
.minimal-role-card {
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 2rem;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.minimal-role-card h3 {
  font-size: 1.4rem;
  color: var(--accent);
  margin: 0;
}
.minimal-role-card p {
  color: var(--text-muted);
  margin: 0;
  font-size: 0.95rem;
}
.minimal-role-card .minimal-primary,
.minimal-role-card .minimal-secondary {
  display: inline-block;
  text-align: center;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  font-weight: 500;
  text-decoration: none;
  font-size: 0.9rem;
}
@media (max-width: 640px) {
  .minimal-roles {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: 浏览器验证**

刷新 `http://localhost:3000/` → 双入口卡片,粉色 accent 按钮,移动端竖排。

- [ ] **Step 4: Commit**

```
git add apps/site/src/app/page.tsx apps/site/src/styles/_legacy-tokens.css
git commit -m "feat(phase5.4): landing page with dual role entries"
```

---

### Task 19: signup 支持 `?role=...` 预填

**Files:**
- Modify: `apps/site/src/app/signup/page.tsx`

- [ ] **Step 1: 改 signup**

打开 `apps/site/src/app/signup/page.tsx`,在表单状态初始化处把 role 默认值改成从 URL query 读:

文件顶部加 import:
```tsx
import { useSearchParams } from "next/navigation";
```

在组件函数开头加:
```tsx
const sp = useSearchParams();
const presetRole = sp.get("role") === "senior" ? "senior" : sp.get("role") === "junior" ? "junior" : "junior";
const [role, setRole] = useState<"senior" | "junior">(presetRole);
```

> **如果原文件已有 `useState<...>("junior")`,直接把 `"junior"` 换成 `presetRole` 即可。**

在角色选择 UI 上方加一行提示:
```tsx
<p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.8rem" }}>
  当前注册身份:<strong>{role === "senior" ? "学长 / 学姐" : "学弟 / 学妹"}</strong>
</p>
```

- [ ] **Step 2: 浏览器验证**

- `http://localhost:3000/signup?role=junior` → 预选学弟
- `http://localhost:3000/signup?role=senior` → 预选学长
- 注册成功后,跳哪里?**期望跳 `/me`(下一 Task 创建)**。若现在 signup 跳的是 `/agent-workbench` 或 `/`,改成 `router.push("/me")`(可在 Task 20 一起改)。

- [ ] **Step 3: Commit**

```
git add apps/site/src/app/signup/page.tsx
git commit -m "feat(phase5.4): signup respects ?role= query"
```

---

### Task 20: 新 `/me` — 角色 SSR 分发

**Files:**
- Create: `apps/site/src/app/me/page.tsx`(server component)

- [ ] **Step 1: 创建 /me/page.tsx**

Create `apps/site/src/app/me/page.tsx`:

```tsx
// /me — 根据 role SSR 重定向,避免客户端闪烁
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function MeRedirect() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.pub.role === "senior") redirect("/me/senior");
  redirect("/me/junior");
}
```

- [ ] **Step 2: 改 signup + login 成功后跳 /me**

打开 `apps/site/src/app/signup/page.tsx` 和 `apps/site/src/app/login/page.tsx`,把成功后 `router.push("/agent-workbench")` 或类似改成 `router.push("/me")`。

- [ ] **Step 3: 浏览器验证**

未登录访问 `/me` → 跳 `/login`。登录(chensirui)后访问 `/me` → 跳 `/me/senior`(404 占位,Task 22 创建)。登录(testjunior01)→ 跳 `/me/junior`(404,Task 21 创建)。

- [ ] **Step 4: Commit**

```
git add apps/site/src/app/me/page.tsx apps/site/src/app/signup/page.tsx apps/site/src/app/login/page.tsx
git commit -m "feat(phase5.4): /me role-based SSR redirect"
```

---

### Task 21: 学弟主页 `/me/junior`

**Files:**
- Create: `apps/site/src/app/me/junior/page.tsx`(client component)
- Modify: `apps/site/src/styles/_legacy-tokens.css`(加新页 CSS)

- [ ] **Step 1: 创建学弟主页**

Create `apps/site/src/app/me/junior/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PublicSenior {
  id: string;
  displayName: string;
  title?: string | null;
  avatar?: string | null;
  tags?: string[];
  highlight?: string | null;
}

interface Recommendation {
  senior: PublicSenior;
  score: number;
  scores: [number, number, number, number];
  reasons: string[];
}

interface ChatSummary {
  chatId: string;
  lastMessageAt: number;
  summary: string;
  senior: PublicSenior | null;
}

const axes = ["院校匹配", "专业匹配", "目标重合", "经历相似"] as const;

function getRadarPoints(values: [number, number, number, number]) {
  const center = 50, radius = 38;
  return values
    .map((value, index) => {
      const angle = (Math.PI * 2 * index) / values.length - Math.PI / 2;
      const ratio = value / 100;
      const x = center + Math.cos(angle) * radius * ratio;
      const y = center + Math.sin(angle) * radius * ratio;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function JuniorHome() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [all, setAll] = useState<PublicSenior[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [me, setMe] = useState<{ displayName: string; hasBuiltProfile: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/seniors/recommend").then((r) => r.json()),
      fetch("/api/seniors").then((r) => r.json()),
      fetch("/api/chats").then((r) => r.json()),
      fetch("/api/profile/me").then((r) => r.json()),
    ])
      .then(([meRes, recRes, allRes, chatsRes, profRes]) => {
        setMe({
          displayName: meRes?.user?.displayName ?? meRes?.displayName ?? "",
          hasBuiltProfile: !!(profRes?.builtProfile ?? profRes?.built_profile_json ?? null),
        });
        setRecs(recRes?.recommendations ?? []);
        // /api/seniors 返回 MentorSummary[],适配
        setAll((allRes?.mentors ?? []).map((m: any) => ({
          id: m.id, displayName: m.name, title: m.title, avatar: m.avatar,
          tags: m.tags, highlight: m.highlight,
        })));
        setChats(chatsRes?.chats ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="me-shell"><p>加载中…</p></main>;

  const filtered = all.filter((s) => {
    if (!q.trim()) return true;
    const hay = [s.displayName, s.title ?? "", ...(s.tags ?? []), s.highlight ?? ""].join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <main className="me-shell">
      <header className="me-hero">
        <p className="me-eyebrow">学弟主页</p>
        <h1>你好,{me?.displayName ?? ""}。</h1>
        {me?.hasBuiltProfile ? (
          <p>已完成社媒提取,下方推荐基于你的真实画像。</p>
        ) : (
          <p>
            完成社媒提取后推荐会更准 ——
            <Link className="me-inline-cta" href="/agent-workbench">去 workbench →</Link>
          </p>
        )}
      </header>

      <section className="me-section">
        <h2>为你推荐的学长</h2>
        {recs.length === 0 ? (
          <p className="me-muted">暂无推荐。</p>
        ) : (
          <div className="me-grid">
            {recs.map((r) => (
              <article key={r.senior.id} className="me-card">
                <div className="me-card-head">
                  {r.senior.avatar ? (
                    <img className="me-avatar" src={r.senior.avatar} alt={r.senior.displayName} />
                  ) : (
                    <div className="me-avatar me-avatar-placeholder" />
                  )}
                  <div>
                    <p className="me-card-name">{r.senior.displayName}</p>
                    <p className="me-card-title">{r.senior.title ?? ""}</p>
                  </div>
                  <span className="me-score">{r.score}</span>
                </div>
                <div className="me-radar" role="img">
                  <svg viewBox="0 0 100 100">
                    <polygon className="radar__frame" points="50,12 88,50 50,88 12,50" />
                    <polygon className="radar__data" points={getRadarPoints(r.scores)} />
                  </svg>
                  <div className="me-radar-labels">
                    {axes.map((a) => <span key={a}>{a}</span>)}
                  </div>
                </div>
                <ul className="me-reasons">
                  {r.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                </ul>
                <Link className="me-cta" href={`/seniors/${r.senior.id}`}>
                  查看 · 向 ta 提问
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="me-section">
        <h2>全部学长</h2>
        <input
          className="me-search"
          placeholder="搜索姓名 / 标签 / 院校"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="me-grid">
          {filtered.map((s) => (
            <article key={s.id} className="me-card me-card-compact">
              <p className="me-card-name">{s.displayName}</p>
              <p className="me-card-title">{s.title ?? ""}</p>
              <p className="me-muted">{s.highlight ?? ""}</p>
              <Link className="me-cta" href={`/seniors/${s.id}`}>查看</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="me-section">
        <h2>我的对话</h2>
        {chats.length === 0 ? (
          <p className="me-muted">还没发起过对话。挑一位学长去聊聊吧。</p>
        ) : (
          <ul className="me-chatlist">
            {chats.map((c) => (
              <li key={c.chatId}>
                <Link href={`/chat/${c.chatId}`}>
                  <strong>{c.senior?.displayName ?? "已离开"}</strong>
                  <span className="me-muted">{c.summary}</span>
                  <time>{new Date(c.lastMessageAt).toLocaleString()}</time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: 加 CSS**

打开 `apps/site/src/styles/_legacy-tokens.css`,末尾追加:

```css
/* /me/* shared shell */
.me-shell {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}
.me-hero {
  margin-bottom: 2.5rem;
}
.me-eyebrow {
  color: var(--accent);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
}
.me-inline-cta {
  color: var(--accent);
  text-decoration: underline;
  margin-left: 0.3rem;
}
.me-section {
  margin-bottom: 3rem;
}
.me-section h2 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
}
.me-muted {
  color: var(--text-muted);
  font-size: 0.85rem;
}
.me-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}
.me-card {
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 1.2rem;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  position: relative;
}
.me-card-compact {
  gap: 0.4rem;
}
.me-card-head {
  display: flex;
  gap: 0.8rem;
  align-items: center;
}
.me-card-name {
  font-weight: 600;
  margin: 0;
}
.me-card-title {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.me-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--border-default);
}
.me-avatar-placeholder { background: var(--border-default); }
.me-score {
  position: absolute;
  top: 1rem;
  right: 1rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent);
}
.me-radar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.me-radar svg { width: 96px; height: 96px; }
.me-radar-labels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.15rem 0.6rem;
  font-size: 0.7rem;
  color: var(--text-muted);
}
.me-reasons {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.me-reasons li::before { content: "· "; }
.me-cta {
  margin-top: auto;
  align-self: flex-start;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--accent);
  color: var(--accent);
  text-decoration: none;
  font-size: 0.8rem;
}
.me-search {
  width: 100%;
  padding: 0.7rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-default);
  background: var(--surface);
  margin-bottom: 1rem;
}
.me-chatlist {
  list-style: none;
  padding: 0;
  margin: 0;
}
.me-chatlist li a {
  display: grid;
  grid-template-columns: 140px 1fr 160px;
  gap: 1rem;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid var(--border-default);
  color: inherit;
  text-decoration: none;
  align-items: center;
}
.me-chatlist li a strong { color: var(--accent); }
.me-chatlist time { color: var(--text-muted); font-size: 0.75rem; text-align: right; }
```

- [ ] **Step 3: 浏览器验证**

用 testjunior01 登录 → 访问 `/me/junior`:
- 看到推荐区(6 张卡 + 雷达图 + reasons + 评分右上角)
- 看到全部学长可搜
- 看到"我的对话"区有 Task 14 创建的对话

- [ ] **Step 4: Commit**

```
git add apps/site/src/app/me/junior/ apps/site/src/styles/_legacy-tokens.css
git commit -m "feat(phase5.4): /me/junior — recommend + search + chats"
```

---

### Task 22: 学长主页 `/me/senior`

**Files:**
- Create: `apps/site/src/app/me/senior/page.tsx`

- [ ] **Step 1: 创建学长主页**

Create `apps/site/src/app/me/senior/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PublicJunior {
  id: string;
  displayName: string;
  avatar?: string | null;
}

interface InboxItem {
  chatId: string;
  createdAt: number;
  lastMessageAt: number;
  summary: string;
  unread: boolean;
  junior: PublicJunior | null;
}

interface Persona {
  background: string;
  expertise: string;
}

export default function SeniorHome() {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [me, setMe] = useState<{ displayName: string; persona: Persona | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/inbox").then((r) => r.json()),
    ])
      .then(([meRes, ibRes]) => {
        const u = meRes?.user ?? meRes;
        setMe({
          displayName: u?.displayName ?? "",
          persona: u?.persona ?? null,
        });
        setInbox(ibRes?.inbox ?? []);
        setUnreadCount(ibRes?.unreadCount ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="me-shell"><p>加载中…</p></main>;

  return (
    <main className="me-shell">
      <header className="me-hero">
        <p className="me-eyebrow">学长主页</p>
        <h1>你好,{me?.displayName ?? ""}。</h1>
        <p>
          你的 Agent 已和 <strong>{inbox.length}</strong> 位学弟聊过,
          <strong style={{ color: "var(--accent)" }}>{unreadCount}</strong> 条未读。
        </p>
      </header>

      <section className="me-section">
        <h2>收件箱</h2>
        {inbox.length === 0 ? (
          <p className="me-muted">还没有学弟来找你。先去 workbench 完善你的画像 →</p>
        ) : (
          <ul className="me-inbox">
            {inbox.map((it) => (
              <li key={it.chatId} className={it.unread ? "me-inbox-unread" : ""}>
                <Link href={`/chat/${it.chatId}`}>
                  <span className={`me-dot ${it.unread ? "me-dot-on" : ""}`} />
                  <strong>{it.junior?.displayName ?? "匿名学弟"}</strong>
                  <span className="me-muted">{it.summary || "(空对话)"}</span>
                  <time>{new Date(it.lastMessageAt).toLocaleString()}</time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="me-section">
        <h2>我的 Agent persona</h2>
        {me?.persona ? (
          <div className="me-card" style={{ display: "block" }}>
            <p><strong>背景:</strong>{me.persona.background}</p>
            <p><strong>专长:</strong>{me.persona.expertise}</p>
            <Link className="me-cta" href="/agent-workbench">更新我的资料</Link>
          </div>
        ) : (
          <p className="me-muted">
            还没生成 persona。<Link className="me-inline-cta" href="/agent-workbench">去 workbench →</Link>
          </p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: 加收件箱样式**

打开 `apps/site/src/styles/_legacy-tokens.css`,末尾追加:

```css
.me-inbox {
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  overflow: hidden;
}
.me-inbox li {
  border-bottom: 1px solid var(--border-default);
}
.me-inbox li:last-child { border-bottom: 0; }
.me-inbox li a {
  display: grid;
  grid-template-columns: 16px 140px 1fr 160px;
  gap: 0.8rem;
  padding: 0.9rem 1rem;
  align-items: center;
  text-decoration: none;
  color: inherit;
}
.me-inbox-unread { background: rgba(var(--accent-rgb, 200, 80, 120), 0.04); }
.me-inbox-unread strong { color: var(--accent); }
.me-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
}
.me-dot-on { background: var(--accent); }
.me-inbox time { color: var(--text-muted); font-size: 0.75rem; text-align: right; }
```

- [ ] **Step 3: 浏览器验证**

用 chensirui 登录 → `/me/senior`:
- Hero 显示 "已和 1 位学弟聊过,1 条未读"
- 收件箱有一行(testjunior01,summary 是 Task 14 的问题前 60 字)
- persona 段显示 chensirui 的 background / expertise(来自 seed 的 persona_json)

> **注**:如果 `/api/auth/me` 返回结构不是 `{user:{persona:...}}` 而是 `{displayName,persona,...}` 直接平铺,Step 1 里两种都覆盖到了。如果发现 persona 还是没显示,curl `/api/auth/me` 看下真实形状,在 page.tsx 里调整字段路径。

- [ ] **Step 4: Commit**

```
git add apps/site/src/app/me/senior/ apps/site/src/styles/_legacy-tokens.css
git commit -m "feat(phase5.4): /me/senior — inbox + persona preview"
```

---

### Task 23: 学长公开页 `/seniors/[id]`

**Files:**
- Create: `apps/site/src/app/seniors/[id]/page.tsx`

- [ ] **Step 1: 创建公开页**

Create `apps/site/src/app/seniors/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface SeniorDetail {
  id: string;
  displayName: string;
  title?: string | null;
  avatar?: string | null;
  tags?: string[];
  badges?: string[];
  highlight?: string | null;
  persona?: { background: string; expertise: string } | null;
}

export default function SeniorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [senior, setSenior] = useState<SeniorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/seniors/${id}`)
      .then((r) => r.json())
      .then((d) => setSenior(d?.senior ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <main className="me-shell"><p>加载中…</p></main>;
  if (!senior) return <main className="me-shell"><p>没找到该学长。</p></main>;

  return (
    <main className="me-shell">
      <header className="me-hero">
        <p className="me-eyebrow">学长资料</p>
        <h1>{senior.displayName}</h1>
        <p className="me-muted">{senior.title}</p>
      </header>
      <section className="me-section">
        <p>{senior.highlight}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "1rem" }}>
          {(senior.tags ?? []).map((t) => (
            <span key={t} style={{
              border: "1px solid var(--border-default)",
              borderRadius: "999px",
              padding: "0.2rem 0.65rem",
              fontSize: "0.7rem",
              color: "var(--accent)",
            }}>{t}</span>
          ))}
        </div>
      </section>
      {senior.persona && (
        <section className="me-section">
          <h2>背景</h2>
          <p>{senior.persona.background}</p>
          <h2>专长</h2>
          <p>{senior.persona.expertise}</p>
        </section>
      )}
      <section className="me-section">
        <Link className="me-cta" href={`/chat/new?seniorId=${senior.id}`}>
          让我的 Agent 去聊聊
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: 创建 /chat/new 跳板**

Create `apps/site/src/app/chat/new/page.tsx`:

```tsx
// /chat/new?seniorId=... — 不创 chat,引导填首条问题
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function NewChat() {
  const sp = useSearchParams();
  const seniorId = sp.get("seniorId") ?? "";
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!q.trim() || !seniorId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seniorId, question: q }),
      });
      const d = await r.json();
      if (d?.chatId) {
        router.push(`/chat/${d.chatId}`);
      } else {
        alert(d?.error ?? "发送失败");
        setBusy(false);
      }
    } catch (e) {
      alert(String(e));
      setBusy(false);
    }
  }

  return (
    <main className="me-shell">
      <header className="me-hero">
        <p className="me-eyebrow">新对话</p>
        <h1>对 {seniorId} 说点什么</h1>
        <p className="me-muted">你的第一句问题:</p>
      </header>
      <section className="me-section">
        <textarea
          className="me-search"
          rows={5}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="想问的问题…"
        />
        <button className="minimal-primary" disabled={busy || !q.trim()} onClick={send}>
          {busy ? "发送中…" : "让我的 Agent 发问"}
        </button>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: 浏览器验证**

用 testjunior01 → `/seniors/chensirui` → 看到详情 → 点 "让我的 Agent 去聊聊" → 跳 `/chat/new?seniorId=chensirui` → 输入 → 发送 → 跳 `/chat/<chatId>`(下一 Task 创建)。

- [ ] **Step 4: Commit**

```
git add apps/site/src/app/seniors/ apps/site/src/app/chat/new/
git commit -m "feat(phase5.4): /seniors/[id] public page + /chat/new bootstrapping"
```

---

### Task 24: 对话页 `/chat/[chatId]`(双视角)

**Files:**
- Create: `apps/site/src/app/chat/[chatId]/page.tsx`
- Modify: `apps/site/src/styles/_legacy-tokens.css`(加 chat 样式)

- [ ] **Step 1: 创建对话页**

Create `apps/site/src/app/chat/[chatId]/page.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface Msg { role: "user" | "assistant"; content: string; ts: number }
interface ChatDetail {
  chatId: string;
  junior: { id: string; displayName: string } | null;
  senior: { id: string; displayName: string } | null;
  messages: Msg[];
}

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const [data, setData] = useState<ChatDetail | null>(null);
  const [me, setMe] = useState<{ id: string; role: "senior" | "junior" } | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function loadAll() {
    const [meRes, chatRes] = await Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch(`/api/chats/${chatId}`).then((r) => r.json()),
    ]);
    const u = meRes?.user ?? meRes;
    setMe({ id: u.id, role: u.role });
    setData(chatRes);
    // 学长进来标已读
    if (u.role === "senior") {
      fetch(`/api/inbox/${chatId}/read`, { method: "POST" }).catch(() => {});
    }
  }

  useEffect(() => { loadAll(); }, [chatId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [data?.messages.length]);

  async function send() {
    if (!q.trim() || !data?.senior) return;
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seniorId: data.senior.id, question: q, chatId }),
      });
      const d = await r.json();
      if (d?.reply) {
        setQ("");
        await loadAll();
      } else {
        alert(d?.error ?? "发送失败");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!data || !me) return <main className="me-shell"><p>加载中…</p></main>;

  const isJunior = me.role === "junior";
  const peer = isJunior ? data.senior : data.junior;

  return (
    <main className="chat-shell">
      <header className="chat-head">
        <p className="me-eyebrow">{isJunior ? "对话学长" : "学弟提问"}</p>
        <h2>{peer?.displayName ?? "(已离开)"}</h2>
      </header>
      <div className="chat-stream" ref={scrollRef}>
        {data.messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
            <p>{m.content}</p>
            <time>{new Date(m.ts).toLocaleTimeString()}</time>
          </div>
        ))}
      </div>
      {isJunior ? (
        <div className="chat-input">
          <textarea
            rows={2}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="继续问点什么…(Enter 发送 · Shift+Enter 换行)"
          />
          <button className="minimal-primary" disabled={busy || !q.trim()} onClick={send}>
            {busy ? "发送中…" : "发送"}
          </button>
        </div>
      ) : (
        <p className="me-muted" style={{ padding: "1rem" }}>
          你正在查看学弟与你 Agent 的对话(只读)。
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: 加 chat CSS**

打开 `apps/site/src/styles/_legacy-tokens.css`,末尾追加:

```css
.chat-shell {
  max-width: 760px;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: calc(100vh - 80px);
}
.chat-head { margin-bottom: 1rem; }
.chat-head h2 { margin: 0; color: var(--accent); }
.chat-stream {
  overflow-y: auto;
  padding: 1rem;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.chat-bubble {
  max-width: 80%;
  padding: 0.7rem 0.95rem;
  border-radius: 12px;
  font-size: 0.9rem;
  line-height: 1.5;
}
.chat-bubble p { margin: 0; white-space: pre-wrap; }
.chat-bubble time {
  display: block;
  font-size: 0.65rem;
  color: var(--text-muted);
  margin-top: 0.3rem;
}
.chat-bubble-user {
  align-self: flex-end;
  background: var(--accent);
  color: white;
}
.chat-bubble-user time { color: rgba(255,255,255,0.7); }
.chat-bubble-assistant {
  align-self: flex-start;
  background: var(--border-default);
  color: inherit;
}
.chat-input {
  margin-top: 1rem;
  display: flex;
  gap: 0.6rem;
}
.chat-input textarea {
  flex: 1;
  padding: 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border-default);
  background: var(--surface);
  font-family: inherit;
  resize: vertical;
}
```

- [ ] **Step 3: 浏览器端到端验证**

1. testjunior01 登录 → `/me/junior` → 点推荐区某学长 → `/seniors/...` → 让 Agent 去聊聊 → `/chat/new` → 发问 → 跳 `/chat/<chatId>`
2. 看到 user / assistant 气泡
3. 输入继续问 → 回车 → 新一轮气泡
4. 退出登录 → 用 chensirui 登录 → `/me/senior` → 看到收件箱该 chat 是未读 → 点进去 `/chat/<chatId>` → 只读 → 回 `/me/senior` → 该 chat 不再未读

- [ ] **Step 4: Commit**

```
git add apps/site/src/app/chat/[chatId]/ apps/site/src/styles/_legacy-tokens.css
git commit -m "feat(phase5.4): /chat/[chatId] dual-view (junior writes, senior reads)"
```

---

### Task 25: 改 agent-workbench — 顶部角色提示

**Files:**
- Modify: `apps/site/src/app/agent-workbench/page.tsx`

- [ ] **Step 1: 加角色提示 banner**

打开 `apps/site/src/app/agent-workbench/page.tsx`,在主 `return (...)` 顶部 JSX 树的最上面加:

```tsx
{me?.role === "senior" ? (
  <div style={{
    background: "rgba(0,0,0,0.03)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    padding: "0.8rem 1rem",
    marginBottom: "1.5rem",
  }}>
    <strong style={{ color: "var(--accent)" }}>学长视角:</strong>
    你提取的画像会作为你 Agent 的 persona,在学弟向你提问时被注入到回答。
  </div>
) : me?.role === "junior" ? (
  <div style={{
    background: "rgba(0,0,0,0.03)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    padding: "0.8rem 1rem",
    marginBottom: "1.5rem",
  }}>
    <strong style={{ color: "var(--accent)" }}>学弟视角:</strong>
    你提取的画像用于在 `/me/junior` 推荐更匹配的学长。
  </div>
) : null}
```

> 如果文件还没有 `me` 状态变量,在组件顶部加:
> ```tsx
> const [me, setMe] = useState<{ role: "senior" | "junior" } | null>(null);
> useEffect(() => {
>   fetch("/api/auth/me").then((r) => r.json()).then((d) => {
>     const u = d?.user ?? d;
>     if (u?.role) setMe({ role: u.role });
>   });
> }, []);
> ```

- [ ] **Step 2: 删掉 agent-workbench 里调用 /api/chat 的"我的 Agent"对话区**

> agent-workbench 老版有一个"我的 Agent"对话框,会调旧 chat API。Task 14 加了 backward-compat shim 让它能跑,但语义现在重叠了 `/chat/[chatId]`。
>
> **方案**:删 agent-workbench 里的"我的 Agent 对话"组件(若有),让 workbench 单一职责"建/管 persona"。**保留** "运行画像提取" 模块。
>
> 若不确定哪段是对话组件,grep `apps/site/src/app/agent-workbench/page.tsx` 找 `/api/chat`,删除该 fetch 周边的对话渲染块。

- [ ] **Step 3: 浏览器验证**

学弟 / 学长分别进 `/agent-workbench`,看到对应角色 banner,提取流程仍工作。

- [ ] **Step 4: Commit**

```
git add apps/site/src/app/agent-workbench/page.tsx
git commit -m "feat(phase5.4): agent-workbench role banner + drop redundant chat panel"
```

---

### Task 26: 删 `/mentors` 页 + 删 `/api/mentors` alias + 删 chat backward-compat shim

**Files:**
- Delete: `apps/site/src/app/mentors/page.tsx`
- Delete: `apps/site/src/app/api/mentors/route.ts`
- Modify: `apps/site/src/app/api/chat/route.ts`(删 shim)

- [ ] **Step 1: grep 现有引用**

```
grep -rn "/mentors\"\|href=\"/mentors\"\|/api/mentors" apps/site/src --include="*.ts" --include="*.tsx"
```

记下命中的位置,改成 `/me/junior` 或 `/api/seniors`。

- [ ] **Step 2: 删除 mentors 页**

```
git rm -r apps/site/src/app/mentors/
```

> 老 mentor-card 雷达图 SVG 在 page.tsx 里,Task 21 的 me/junior 已重新实现 `getRadarPoints` — 不依赖被删的代码,放心删。

- [ ] **Step 3: 改 /mentors 410 重定向(不推荐 — 现代 SPA 不需要,删就完了)**

无需做 redirect,Next.js 对未匹配路由会自动 404。直接 SKIP 这个 step。

- [ ] **Step 4: 删 /api/mentors alias**

```
git rm -r apps/site/src/app/api/mentors/
```

- [ ] **Step 5: 删 /api/chat 里的 backward-compat shim**

打开 `apps/site/src/app/api/chat/route.ts`,删除 Task 14 Step 2 末尾加的:

```ts
// Backward-compat shim:agent-workbench 老调用 5.4 改完后删
if ((body as any).mentorId && Array.isArray((body as any).messages)) {
  ...
}
```

- [ ] **Step 6: Typecheck + 浏览器全链路 smoke**

```
bun --cwd apps/site run typecheck
```

dev server 跑着,浏览器:
- 访问 `/mentors` → 404 OK
- 访问 `/api/mentors` → 404 OK
- 完整跑 §12 验收清单 8 步(下一 Task)

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "refactor(phase5.4): drop /mentors, /api/mentors, chat compat shim"
```

---

### Task 27: 端到端 demo 验收

**Files:** 无代码,仅手测。

- [ ] **Step 1: 清空测试数据**

进 Upstash 控制台 → Data 视图 → 删 `refudan:user:` 前缀里所有非 seed(testjunior01 等)、删 `refudan:chat:*` / `refudan:inbox:*` / `refudan:session:*` / `refudan:match:cache:*`。或者(更彻底)直接 Flush 整个 DB 然后 `bun run seed` 重灌 6 个学长。

- [ ] **Step 2: 跑 spec §12 验收清单 8 步**

参考 `docs/superpowers/specs/2026-06-07-phase5-multiuser-demo-design.md` §12,逐条勾选:

1. [ ] `bun --cwd apps/site run seed` 注入 6 学长成功
2. [ ] 浏览器 `/` → 点 "注册学弟账号" → `/signup?role=junior` → 注册 alice/demo123 → 自动登录跳 `/me/junior`
3. [ ] `/agent-workbench` 跑 GitHub + 小红书提取(用你自己的账号/链接),成功后回 `/me/junior`
4. [ ] `/me/junior` 推荐区显示 6 张卡 + 4 轴雷达 + 每张 ≥1 条 reason
5. [ ] 点其中一张 → `/seniors/[id]` → "让我的 Agent 去聊聊" → `/chat/new` → 输入问题 → 流式回复 → 跳 `/chat/[chatId]`
6. [ ] 登出 → 用 chensirui/demo123 登录 → `/me/senior` Hero 显示 "已和 1 位学弟聊过,1 条未读"
7. [ ] 点收件箱条目 → `/chat/[chatId]` 只读 → 自动标已读 → 回 `/me/senior` 未读消失
8. [ ] 重新用 alice 登录 → `/me/junior` "我的对话"区显示该对话 → 点进去继续发问 → 工作

- [ ] **Step 3: 任一步失败回到对应 Task 修**

- 第 4 步推荐为空:检查 Task 17 的 `/api/seniors/recommend`,确认学弟有 builtProfile(否则会走冷启动 fallback,scores 全 50,reasons 仅 "完成社媒提取..."— 是符合预期的,不算 fail)
- 第 5 步对话报 401:Task 14 / Task 24 的 fetch 没带 cookie? Next.js 同源 fetch 默认带,但检查 dev tools Network
- 第 6 步收件箱空:Upstash 控制台搜 `refudan:inbox:senior:chensirui`,确认 zset 有 chatId

- [ ] **Step 4: 写 verification 笔记**

`docs/superpowers/specs/2026-06-07-phase5-multiuser-demo-design.md` 文末追加:

```
## 14. 验收记录(Phase 5 完成)

- 日期: <YYYY-MM-DD>
- 测试账号: alice / chensirui
- 验收 8 步全过 ✅ / 部分过 ⚠️
- 已知问题: <写下 demo 时还需要继续优化的点>
```

- [ ] **Step 5: 最终 commit + 推送**

```
git add docs/superpowers/specs/2026-06-07-phase5-multiuser-demo-design.md
git commit -m "docs(phase5): record verification of multi-user demo"

# 推送到 feat/secondme-integration(若需要)
git push origin feat/secondme-integration
```

> **`git push` 是与他人共享的破坏性操作**:推送前确认这是你想要的;若希望保留本地不推,跳过此步。

✅ **Phase 5 完成**:Upstash Redis 全量替换 SQLite、双角色主页、单向 A2A 对话页、推荐打分、收件箱全部上线。

---

## 完整文件清单(本 plan 涉及)

### 新建

- `apps/site/src/lib/redis.ts`
- `apps/site/src/lib/users-redis.ts`
- `apps/site/src/lib/chat-redis.ts`
- `apps/site/src/lib/match.ts`
- `apps/site/scripts/seed-redis.ts`
- `apps/site/src/data/major-synonyms.json`
- `apps/site/src/app/api/seniors/route.ts`
- `apps/site/src/app/api/seniors/recommend/route.ts`
- `apps/site/src/app/api/seniors/search/route.ts`
- `apps/site/src/app/api/seniors/[id]/route.ts`
- `apps/site/src/app/api/chats/route.ts`
- `apps/site/src/app/api/chats/[chatId]/route.ts`
- `apps/site/src/app/api/inbox/route.ts`
- `apps/site/src/app/api/inbox/[chatId]/read/route.ts`
- `apps/site/src/app/me/page.tsx`
- `apps/site/src/app/me/junior/page.tsx`
- `apps/site/src/app/me/senior/page.tsx`
- `apps/site/src/app/seniors/[id]/page.tsx`
- `apps/site/src/app/chat/new/page.tsx`
- `apps/site/src/app/chat/[chatId]/page.tsx`
- `apps/site/.env.local.example`

### 修改

- `apps/site/package.json`(deps + scripts)
- `apps/site/src/lib/auth.ts`(同步→异步 + 切 users-redis)
- `apps/site/src/app/api/auth/{signup,login,logout,me}/route.ts`(补 await)
- `apps/site/src/app/api/profile/{me,build,collect,analyze}/route.ts`(切 users-redis)
- `apps/site/src/app/api/chat/route.ts`(大改:写 inbox + chatId + persona)
- `apps/site/src/app/page.tsx`(双入口)
- `apps/site/src/app/signup/page.tsx`(支持 ?role=)
- `apps/site/src/app/login/page.tsx`(成功跳 /me)
- `apps/site/src/app/agent-workbench/page.tsx`(角色 banner + 删冗余对话区)
- `apps/site/src/styles/_legacy-tokens.css`(新页样式)

### 删除

- `apps/site/src/lib/db.ts`
- `apps/site/data/users.db`(+ wal / shm)
- `apps/site/src/app/api/profile/search/`
- `apps/site/src/app/api/profile/[userId]/`
- `apps/site/src/app/api/profiles/`
- `apps/site/src/app/api/mentors/`
- `apps/site/src/app/mentors/`
