# Phase 4: 多用户改造（SQLite + 本地账密 + 6 mentor 作 seed + 拆 SecondMe）

**日期**：2026-06-07
**分支**：`feat/secondme-integration`
**前置**：Phase 1/2/3a 已落地

---

## 决策摘要

| 维度 | 决策 |
|---|---|
| 认证 | 本地用户名+密码，Bun.password (argon2) 散列 |
| Session | server-side（DB 表），HttpOnly cookie 装 token，7 天滚动过期 |
| 持久化 | SQLite 文件 `apps/site/data/users.db`，依赖 `bun:sqlite` 内置 |
| 注册策略 | 开放注册，新用户必选角色（学长/学弟） |
| Seed 数据 | 6 个 mentor JSON 首次启动时 seed 进 users 表，预设密码 `demo123` |
| SecondMe | 完全删除（lib/路由/页面/字段/配置） |
| 本 session 范围 | 4a + 4b + 4c + 50% 4d（即拆 SecondMe + DB+seed + auth + 最小 UI 集成） |

## 1. 数据模型（SQLite）

```sql
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('senior','junior')),
  avatar          TEXT,
  bio             TEXT,
  created_at      INTEGER NOT NULL,

  -- senior-only (NULL for juniors)
  title                  TEXT,
  scores_json            TEXT,
  tags_json              TEXT,
  badges_json            TEXT,
  highlight              TEXT,
  persona_json           TEXT,
  detailed_profile_json  TEXT,
  built_profile_json     TEXT
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_username ON users(username);

CREATE TABLE sessions (
  token        TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

**DB 文件路径**：`apps/site/data/users.db`，加进 `.gitignore`。
**Schema 文件**：`apps/site/src/lib/db-schema.sql`，启动时 idempotent 跑 `CREATE TABLE IF NOT EXISTS`。

## 2. Auth API + 中间件

### 2.1 5 个路由

| 方法 | 路径 | 入参 | 出参 |
|---|---|---|---|
| POST | `/api/auth/signup` | `{username, password, role, displayName}` | `{user}` + Set-Cookie |
| POST | `/api/auth/login` | `{username, password}` | `{user}` + Set-Cookie |
| POST | `/api/auth/logout` | — | `{success:true}` + clear cookie |
| GET | `/api/auth/me` | — | `{user}` 或 401 |
| PATCH | `/api/auth/me` | `{displayName?, bio?, avatar?}` | `{user}` |

### 2.2 Cookie

- 名称：`refudan_session`
- 值：`crypto.randomBytes(32).toString("hex")`
- `HttpOnly`，`SameSite=Lax`，`Path=/`，`Max-Age=604800`（7 天）
- 不设 `Secure`（dev 用 http）。生产打开。

### 2.3 中间件 `lib/auth.ts`

```ts
export async function getCurrentUser(req: Request): Promise<User | null>
export async function requireUser(req: Request): Promise<User>
export async function requireRole(req: Request, role: "senior"|"junior"): Promise<User>
```

`requireUser` 抛 `Response.json({error}, {status:401})`，路由用 try-catch 转返回。

### 2.4 密码规则

- 长度 ≥ 6
- 不等于 username
- 不强求复杂度

### 2.5 用户名规则

- `^[a-zA-Z0-9_]{3,30}$`
- 不区分大小写存储为小写
- 唯一索引

## 3. SecondMe 删除

整文件删（7 个）：
```
apps/site/src/lib/secondme.ts
apps/site/src/app/api/auth/secondme/authorize/route.ts
apps/site/src/app/api/auth/secondme/callback/route.ts
apps/site/src/app/api/auth/secondme/revoke/route.ts
apps/site/src/app/api/auth/secondme/status/route.ts
apps/site/src/app/api/profile/[userId]/sync-secondme/route.ts
apps/site/src/app/mentor-onboard/page.tsx
```

代码段删（4 处）：
```
apps/site/src/app/api/chat/route.ts        — 删 secondmeChatResponse + getMentorToken 那段
apps/site/src/app/layout.tsx               — 删 SecondMe 相关导航/水印（如有）
apps/site/src/app/mentors/page.tsx         — 删 consent / secondme_linked / demo_binding_note 角标
apps/site/src/app/page.tsx                 — 删落地页 SecondMe 段（如有）
```

环境变量：`apps/site/.env.local` 里 `SECONDME_*` 几行可保留也可删，运行时不再读取。spec 不强求用户删。

文档：
- `README.md`：改"三分钟跑起来"，去掉 SecondMe OAuth2 配置步骤，加 demo 账号清单
- `doc/secondme-integration-design.md` 等评审材料：**保留**（历史文档）

mentor JSON 字段清洗（每个 6 个文件）：
- 删 `consent_status` / `consent_granted_at` / `data_source` / `secondme_user_id` / `demo_binding_note`
- 保留 `id` / `name` / `title` / `avatar` / `scores` / `tags` / `badges` / `highlight` / `persona` / `detailed_profile`

`apps/site/src/data/mentors/index.ts` 字段同步删 `ConsentStatus` / `consent_status` / `secondme_user_id` / `secondme_linked` / `demo_binding_note`。

## 4. Mentor → User 迁移（seed）

### 4.1 时机

`lib/db.ts` 模块加载时调 `ensureSchema()` 创建表；`ensureSeeded()` 检查 `SELECT COUNT(*) FROM users WHERE role='senior'` 是否为 0，是则跑 seed。

### 4.2 seed 算法

```ts
const mentorsDir = path.join(process.cwd(), "src/data/mentors");
for (const file of fs.readdirSync(mentorsDir).filter(f => f.endsWith(".json"))) {
  const mentor = JSON.parse(fs.readFileSync(path.join(mentorsDir, file), "utf-8"));
  const passwordHash = await Bun.password.hash("demo123", "argon2id");
  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role, avatar,
                       title, scores_json, tags_json, badges_json, highlight,
                       persona_json, detailed_profile_json, created_at)
    VALUES (?, ?, ?, ?, 'senior', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    mentor.id, mentor.id, passwordHash, mentor.name, mentor.avatar,
    mentor.title,
    JSON.stringify(mentor.scores),
    JSON.stringify(mentor.tags),
    JSON.stringify(mentor.badges),
    mentor.highlight,
    JSON.stringify(mentor.persona),
    mentor.detailed_profile ? JSON.stringify(mentor.detailed_profile) : null,
    Date.now()
  );
}
```

### 4.3 demo 账号（写进 README）

```
chensirui      / demo123
chenxiaoyuan   / demo123
sunyifan       / demo123
weixuejie      / demo123
wuzihan        / demo123
zhangmingyuan  / demo123
```

### 4.4 reset 流程

`rm apps/site/data/users.db && bun dev:site` 重启即重新 seed。

## 5. UI 改动

### 5.1 新增页面

`apps/site/src/app/login/page.tsx`：表单 username + password，submit → POST /api/auth/login → 跳 `/`
`apps/site/src/app/signup/page.tsx`：表单 username + password + role 选择 (radio: 学长/学弟) + displayName，submit → POST /api/auth/signup → 跳 `/`

### 5.2 改动现有

| 文件 | 改动 |
|---|---|
| `app/layout.tsx` | 顶部窄横条：未登录 → "登录 / 注册"，已登录 → `{displayName} · {学长/学弟}` + 登出 |
| `app/page.tsx`（落地页） | 删 SecondMe 文案；CTA 改为"登录 / 注册" |
| `app/mentors/page.tsx` | 数据源改 `GET /api/users?role=senior`；删 consent UI；保留"找他对话"链 |
| `app/agent-workbench/page.tsx` | mount 时 `GET /api/auth/me`，未登录跳 `/login`；builtProfile 从 server load (GET /api/profile/me) 而非 localStorage；清除画像调 DELETE /api/profile/me |
| `app/mentor-onboard/page.tsx` | **整页删** |

### 5.3 新 client lib

`apps/site/src/lib/auth-client.ts`：
```ts
export function useCurrentUser() { ... }      // SWR-style 读 /api/auth/me
export async function login(username, password)
export async function signup(...)
export async function logout()
```

不引入 SWR/React Query；用现有 fetch + useEffect 风格。

## 6. Per-user builtProfile

`POST /api/profile/build` 行为延伸：成功 + 当前 user.role === 'senior' → 额外 `UPDATE users SET built_profile_json = ? WHERE id = ?`。

新增：
- `GET /api/profile/me` → `{user, builtProfile: parsed_json|null}`
- `DELETE /api/profile/me` → `UPDATE users SET built_profile_json = NULL`

`agent-workbench` 不再依赖 `localStorage.refudan.builtProfile`，每次 mount 从 server 取。可保留 localStorage 作 SSR 渲染加速缓存（可选）。

## 7. 验收

1. ✅ `apps/site/data/users.db` 首启动自动创建 + seed 6 学长
2. ✅ 落地页 `/` 未登录看到登录/注册 CTA；点跳 `/login` 或 `/signup`
3. ✅ `/signup` 注册新学弟（如 `xiaodi / pwd123 / 学弟 / 小弟`）→ 自动登录 → 跳回 `/`
4. ✅ 登出 → `chenxiaoyuan / demo123` 登录 → 进 `/agent-workbench` → 看到的 builtProfile 是该用户自己的（首次为空）
5. ✅ 跑提取后 builtProfile 写 DB；登出再登入仍在；换账号登入看不到这份
6. ✅ `/mentors` 列出 6 个学长（role=senior），无 consent UI；点"找他对话"跳 agent-workbench
7. ✅ grep `from "@/lib/secondme"` / `mentor_tokens` / `mentor-onboard` 在 src/ 下无命中（spec 文档不算）
8. ✅ `bun run typecheck` 通过
9. ✅ README 更新：删 SecondMe 配置，加 demo 账号清单

## 8. 不在范围

- 学长/学弟独占 UI 模板（`/mentors` 仅学弟看，学长看自己的"我的画像"页等）→ 4d 下次
- 编辑 mentor profile 字段（persona / scores / tags）
- 角色升级（学弟切学长）
- 邀请关系 / 私信 / 实际匹配算法
- 密码找回 / 邮箱验证
- Rate limiting / CSRF token（demo 不做，部署上线时再加）
- BYOK
- SecondMe 自我授权（Phase 6，可选）

## 9. 风险

| 风险 | 对策 |
|---|---|
| Bun 内置 SQLite 是否与 Next.js dev server 协作 | 用 `import { Database } from "bun:sqlite"` + 模块级单例;Next.js Edge runtime 不支持 bun:sqlite,所以 API route 必须明确 `export const runtime = "nodejs"` |
| seed 失败让用户进不了系统 | seed 失败抛错;DB 文件腐损时 rm 后重启即可 |
| Cookie 在 dev 上不设 Secure 会被现代浏览器警告 | 接受;生产用 HTTPS 时再加 |
| 多 tab 同时操作 | server 是真相,前端读时 always re-fetch |
| 6 mentor 的 `id` 字段被 seed 用作 `id` 也是 `username`,新用户输错"chenxiaoyuan" 撞 unique | 注册路由 SELECT 检测撞名时返回 409 + 提示 |
| `bun:sqlite` 不可用时无降级 | 启动时检测,fail-fast 提示用户用 Bun ≥ 1.0 |
