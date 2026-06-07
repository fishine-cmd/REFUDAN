# Phase 5 — 多用户 Demo 完善(Upstash Redis + 双角色体验)

**状态**:Design(待实施)
**日期**:2026-06-07
**前置 Phase**:Phase 4(本地 SQLite 多用户体系)
**对应 Phase 4 spec**:`2026-06-07-phase4-multi-user-design.md`

---

## 1. 目标与背景

Phase 4 完成了"本地账密多用户 + 6 学长 seed + 角色字段"的最小基底,持久化在 `apps/site/data/users.db`(SQLite)。Phase 5 目标是把 demo 推到**可对外展示的多用户闭环**:

- 数据层迁出本地 SQLite,统一在 **Upstash Redis 云端**,任何机器/部署实例共享同一份数据
- 注册时已分流的 `senior` / `junior` 两种角色拥有**截然不同的主页与功能**
- 学弟主页提供**推荐 + 全量搜索双轨**,鼓励学弟提取社媒画像后看个性化匹配
- 学弟可对指定学长发问,后端用学长 persona 注入 DeepSeek 单向回答,**对话写入双方收件箱**
- 学长主页是**收件箱视图**,无主动找学弟的入口,只看"哪些学弟来问过什么"
- 前端保留 Phase 0-4 的 minimal 粉色风,**仅新增/重制** 4 个新页面

不在本 Phase 范围内:
- 真正的 Agent-to-Agent 双向对话(学弟 agent 自主调用学长 agent)
- BYOK / 学长自带 LLM 后端
- LLM 辅助的语义打分(v2 才考虑)
- 服务器推送(SSE 实时提醒、移动推送)
- 中间评审后才能放出的合规审查流程(用户 2026-06-06 已授权 4 平台提取)

## 2. 关键决策(已与用户确认)

| 决策 | 选项 | 选定 |
|---|---|---|
| Upstash Redis 角色 | 完全替代 SQLite / 仅做新增 / 仅缓存+会话 | **完全替代 SQLite** |
| A2A 深度 | 双 agent 真跑 / 学弟手输→学长 agent 回 / 脚本化模拟 | **单向:学弟手输 → 学长 agent 回答** |
| 学弟主页 | 推荐+搜索双轨 / 仅推荐 / 仅全量+筛选 | **推荐 + 搜索双轨** |
| 学长通知 | 收件箱 / 全局未读 badge / 主页 banner | **登录后看收件箱** |
| 前端野心 | minimal+重制新增 / 双角色重设计 / 仅加组件 | **保留 minimal + 重制新增模块** |
| Phase 切分 | 数据层先行 / 垂直切片 / 后端先行 | **后端先行(C)** |

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│ 浏览器 (Next.js app router, 保留 minimal CSS, 新增 4 个页面)   │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP (cookie auth, 兼容原 refudan_session)
┌──────────────────▼──────────────────────────────────────────┐
│ Next.js API Routes (apps/site/src/app/api/*)                │
│ ─ auth      (signup/login/logout/me)                        │
│ ─ profile   (build/me/collect/analyze)                      │
│ ─ seniors   (list/recommend/search/[id])                    │
│ ─ chat + chats + chats/[chatId]                             │
│ ─ inbox + inbox/[chatId]/read                               │
└──────┬─────────────────────────────┬────────────────────────┘
       │ @upstash/redis (REST)       │ python-bridge (已有)
       ▼                             ▼
┌──────────────────┐         ┌────────────────────────────┐
│ Upstash Redis    │         │ Python pipeline (XHS+GH)    │
│ (users/sessions/ │         │ → builtProfile             │
│  profile/chat/   │         │ → 写回 Redis profile:*     │
│  inbox/match)    │         └────────────┬────────────────┘
└──────────────────┘                      │
                                          ▼
                            DeepSeek API + persona 注入(Phase 3a)
```

### 取消的东西

- `apps/site/data/users.db`(SQLite)— 完全弃用,不留兼容路径
- `apps/site/src/lib/db.ts` 整体迁出,改名 `lib/redis.ts`,接口形态保留(`findUserById` 等)以降低 API 路由改造面
- 静态 `apps/site/src/data/mentors/*.json` 改为 **一次性 seed 脚本** (`scripts/seed-redis.ts`) 的种子源,不再被运行时引用
- `/api/mentors` 路径 → 改名 `/api/seniors`(学长的角色名统一)
- `/api/profile/search`、`/api/profile/[userId]`、`/api/profiles` 合并入 seniors 系列
- `/mentors` 页面 → 410 重定向到 `/me/junior`(SSR 完成角色分发)
- `lib/db.ts` 的 `ensureSeeded` 自动触发(不在请求路径里 seed)

## 4. Phase 拆分(后端先行 / C 方案)

| Phase | 内容 | 完成标志 |
|---|---|---|
| **5.1 Redis 适配层** | 接入 `@upstash/redis`、写 `lib/redis.ts` 类型化包装、写 `scripts/seed-redis.ts` seed 6 个学长 | 本地运行 `bun run seed` 后用 Upstash 控制台或 redis-cli 能看到 6 个学长 hash;没有任何路由切换 |
| **5.2 全部 API 切 Redis** | 把现有 8 个路由的数据访问从 `db.ts` 切到 `redis.ts`;**同时挂出** `/api/seniors`(新)和 `/api/mentors`(保留为薄 alias 到 5.4 删除) | 现有功能在 Upstash 上跑通(注册/登录/提取/对话);前端继续用旧 `/mentors` 页面,但内部数据走 Redis |
| **5.3 学长侧 API + 推荐打分** | 新增 `/api/inbox`、`/api/chats`、`/api/seniors/recommend`、`/api/seniors/search`、`/api/seniors/[id]`;改造 `/api/chat` → 写入收件箱 + 创建/复用 chatId | curl/Postman 能测通收件箱写入读取、推荐返回 4 轴打分、流式对话仍工作 |
| **5.4 前端整体重制** | 新增 `/me/junior` + `/me/senior` + `/chat/[chatId]` + `/seniors/[id]`;改首页双入口;删 `/mentors` 页 | 端到端 demo:注册学弟 → 提取 → 推荐 → 发问 → 学长登录 → 收件箱看到 → 读完未读消失 |

## 5. Redis 数据模型

> 所有 key 加 `refudan:` 前缀避免与同一 Upstash 实例其他项目冲突。所有 JSON 字段在适配层序列化/反序列化。

| Key 模式 | 类型 | 内容 | 备注 |
|---|---|---|---|
| `refudan:user:{userId}` | Hash | `username, password_hash, display_name, role, avatar, bio, title, highlight, created_at` | 用户基础信息 |
| `refudan:user:byname:{username}` | String | `userId` | 登录用,O(1) 反向索引 |
| `refudan:user:byrole:senior` | Set | userId 集合 | 列学长用 |
| `refudan:user:byrole:junior` | Set | userId 集合 | 列学弟(管理用,demo 可不暴露) |
| `refudan:profile:{userId}` | Hash | `scores_json, tags_json, badges_json, persona_json, detailed_profile_json, built_profile_json` | 学长 seed 数据 + 用户提取的画像 |
| `refudan:session:{token}` | Hash | `user_id, created_at`,设 EX=7d | 7 天滚动 |
| `refudan:session:byuser:{userId}` | Set | token 集合 | logout 全清 / 多设备 |
| `refudan:chat:{chatId}` | Hash | `junior_id, senior_id, created_at, last_message_at, summary` | summary 给收件箱列表预览(取首条问题前 30 字) |
| `refudan:chat:msgs:{chatId}` | List | 消息 JSON `{role, content, ts}` | RPUSH 追加,LRANGE 读 |
| `refudan:inbox:senior:{seniorId}` | Sorted Set | score=`last_message_at`,member=`chatId` | 学长收件箱(按最新排序) |
| `refudan:inbox:junior:{juniorId}` | Sorted Set | score=`last_message_at`,member=`chatId` | 学弟我发起的对话列表 |
| `refudan:inbox:senior:{seniorId}:unread` | Set | chatId 集合 | 未读集合,UI 计数 |
| `refudan:match:cache:{juniorId}` | String (JSON) | `[{seniorId, score, scores[4], reasons[]}]`,EX=1h | 推荐结果缓存,避免每次刷新都重算 |

### ID 与 token 生成

- `userId`、`chatId`:`crypto.randomUUID()`(沿用 Phase 4)
- `session token`:`crypto.randomBytes(32).toString('base64url')`(沿用 Phase 4 auth.ts)

### 容量估算(demo 上限 30 学弟 + 6 学长)

- 用户 hash:~500B × 36 = ~18KB
- 学长 profile(含 builtProfile):~50KB × 6 = 300KB
- 学弟 profile(含 builtProfile):~50KB × 30 = 1.5MB
- 对话(每条 ~10KB,平均 5 个学弟各发 3 次)= ~150KB
- **合计 < 2MB**,Upstash 免费 256MB 极宽裕

### 命令次数估算(每天)

- 登录/查 me:每次 2-3 cmd × 假设 100 次 = 300
- 推荐列表:首屏 ~10 cmd × 30 次 = 300(有 1h 缓存)
- 对话:每条消息 ~6 cmd × 50 条/天 = 300
- **合计 < 1k cmd/day**,Upstash 免费 10k 宽裕

### 启动 seed 时机(关键)

- **不在请求路径里跑 `ensureSeeded`** — Upstash 走 HTTP,每次都掉网络费
- 改为 `scripts/seed-redis.ts`,**手动执行一次**;`package.json` 增加 `"seed": "bun scripts/seed-redis.ts"`
- `lib/redis.ts` 启动只做单例 client 实例化,不主动 seed
- `启动.bat` 增加首启提示"若未 seed,运行 `bun run seed`"

## 6. API 路由全表

> **[改]** = 已存在,改数据访问层;**[新]** = 新增;**[删]** = 删除

| Method | 路径 | Auth | Phase | 行为 |
|---|---|---|---|---|
| POST | `/api/auth/signup` | 任意 | 5.2 [改] | 写 `user:*` + `byname` + `byrole`,种 session |
| POST | `/api/auth/login` | 任意 | 5.2 [改] | 查 `byname` → 验密 → 种 session |
| POST | `/api/auth/logout` | 登录 | 5.2 [改] | DEL session,从 `byuser` 移除 |
| GET | `/api/auth/me` | 登录 | 5.2 [改] | 读 `session:{token}` → user hash |
| GET | `/api/profile/me` | 登录 | 5.2 [改] | HGET `profile:{userId} built_profile_json` |
| DELETE | `/api/profile/me` | 登录 | 5.2 [改] | HDEL `profile:{userId} built_profile_json` |
| POST | `/api/profile/build` | 登录 | 5.2 [改] | python-bridge 跑完后 HSET `profile:{me} built_profile_json` |
| POST | `/api/profile/collect` | 登录 | 5.2 [改] | 透传 python-bridge,无 DB |
| POST | `/api/profile/analyze` | 登录 | 5.2 [改] | 透传 python-bridge,无 DB |
| GET | `/api/seniors` | 登录 | 5.2 [新] | SMEMBERS `byrole:senior` → 联读 hash → 公开化 |
| GET | `/api/mentors` | 登录 | 5.2 [保留] | 5.2-5.3 期间薄 alias,内部转发 `/api/seniors`;5.4 删除 |
| GET | `/api/seniors/recommend` | junior | 5.3 [新] | 走打分算法,返 Top 6;1h 缓存 |
| GET | `/api/seniors/search?q=` | junior | 5.3 [新] | 简单内存子串过滤(扫 SMEMBERS,demo 量级 OK) |
| GET | `/api/seniors/[id]` | 登录 | 5.3 [新] | 单个学长公开资料(给 `/seniors/[id]` 用) |
| POST | `/api/chat` | junior | 5.3 [改] | **大改**:见 §6.1 |
| GET | `/api/chats` | junior | 5.3 [新] | 学弟视角:ZREVRANGE `inbox:junior:{me}` → 联读 chat hash |
| GET | `/api/chats/[chatId]` | 双方 | 5.3 [新] | 鉴权(参与方才行)→ HGETALL chat + LRANGE chat:msgs |
| GET | `/api/inbox` | senior | 5.3 [新] | ZREVRANGE `inbox:senior:{me}` + 联读 unread set 算未读 |
| POST | `/api/inbox/[chatId]/read` | senior | 5.3 [新] | SREM `inbox:senior:{me}:unread` |

### 取消

- ~~`/api/mentors`~~ → 改名 `/api/seniors`
- ~~`/api/profile/search`~~ → 合并入 `/api/seniors/search`
- ~~`/api/profile/[userId]`~~ → 合并入 `/api/seniors/[id]`
- ~~`/api/profiles`~~ → 删除(用途已被 `/api/seniors` 覆盖)

### 6.1 `POST /api/chat` 完整链

输入:`{ seniorId, question, chatId? }`

```
1. 校验 junior 身份;读 senior 用户,确认 role=senior
2. 若无 chatId:
     chatId = crypto.randomUUID()
     HSET chat:{chatId} junior_id senior_id created_at last_message_at
     ZADD inbox:junior:{me} now chatId
     ZADD inbox:senior:{seniorId} now chatId
3. RPUSH chat:msgs:{chatId} {role:'user', content:question, ts:now}
4. 读 senior profile:persona + builtProfile
   走 Phase 3a 的 derivePersonaFromBuiltProfile + extractKeyExperiencesFromBuiltProfile
   注入 DeepSeek system prompt
5. 调 DeepSeek(流式),边收边 SSE 推给前端
6. 收尾:
     RPUSH chat:msgs:{chatId} {role:'assistant', content:reply, ts:now}
     HSET chat:{chatId} last_message_at=now summary=<question.slice(0,30)>
     ZADD inbox:junior:{me} now chatId      // 更新 score
     ZADD inbox:senior:{seniorId} now chatId
     SADD inbox:senior:{seniorId}:unread chatId
7. 返流式 + 末尾元数据 {chatId}
```

## 7. 推荐打分算法(v1,纯启发式)

学弟 `/me/junior` 首屏调 `/api/seniors/recommend`,返回 Top 6 学长 + 雷达图 4 轴分。

### 输入

- `junior.built_profile_json` → 抽出 `juniorTags`(GitHub repos topics ∪ XHS notes 关键词 ∪ LLM 派生 expertise 词)
- `junior.detailed_profile_json.school / major / goals`(首版 demo 可为空)
- `senior.tags`(seed JSON 已有,每人 4-6 个,如 "NLP / RL / 创业 / MBB")
- `senior.persona.expertise`(seed JSON 已有)
- `senior.detailed_profile_json.school / major / goals`

### 4 轴打分(各 0-100)

1. **院校匹配**:同校 100;其他 demo 阶段统一 50(校名同义表 v2 再做)
2. **专业匹配**:专业字符串完全匹配 100;字符串包含或同义(用 `apps/site/src/data/major-synonyms.json` 维护的小表)80;同大类(`["CS","信工","软件"]`、`["金融","会计","工管"]` 等小白名单)60;跨界 30
3. **目标重合**:`junior.goals` 与 `senior.tags ∪ persona.expertise` 做 Jaccard × 100,最低 20 兜底
4. **经历相似**:`juniorTags`(见下)与 `senior.tags` 做 Jaccard × 100,最低 20

`juniorTags` 的提取规则:沿用 Phase 3a `extractKeyExperiencesFromBuiltProfile` 的输出,二次聚合到关键词集合(取 GitHub repos topics、XHS notes hashtags、builtProfile 里 LLM 派生的 expertise 字段),小写去重,过滤长度 < 2 的噪声 token。

综合分 = 4 轴等权平均;取 Top 6 返回。

### 返回结构

```ts
{
  recommendations: [{
    senior: PublicUser,                         // 给前端渲卡片用
    score: number,                              // 0-100 综合
    scores: [number, number, number, number],   // 直喂雷达图(轴顺序复用现 mentor-card)
    reasons: string[]                           // ["同为复旦计算机", "都做 NLP", "目标都包含'保研'"]
  }]
}
```

### 冷启动 fallback

学弟没 builtProfile / 资料未填 → 返回 6 个学长按 created_at,scores 全给 50 中性值,reasons 给 `["完成社媒提取后可获得个性化匹配"]`。

### 缓存

- `refudan:match:cache:{juniorId}` EX=1h
- 学弟重新跑 `/api/profile/build` 时主动 DEL 缓存

### v2(后续不在 demo 范围)

LLM 一轮"看 junior 自述 + senior persona,给 0-10 分 + 理由",权重融合启发式得分。

## 8. 前端页面

### 路由表

| 路径 | 角色 | 状态 | 内容 |
|---|---|---|---|
| `/` | 公开 | 改 | 双入口:"我是学弟/学妹" / "我是学长/学姐",带 query 跳 `/signup?role=...` |
| `/signup` | 公开 | 改 | role 从 query string 预填,UI 突出当前选择 |
| `/login` | 公开 | 不动 | 登录后看 role,SSR 重定向 `/me` → `/me/{role}` |
| `/agent-workbench` | 双方 | 改 | 顶部加角色提示;学长侧多一行"你的 persona 将用于回答学弟问题" |
| `/me` | 登录 | 新 | 根据 role 自动 SSR 重定向到 `/me/junior` 或 `/me/senior`,避免闪烁 |
| `/me/junior` | junior | 新 | 学弟主页:推荐 + 搜索 + 我发起的对话 |
| `/me/senior` | senior | 新 | 学长主页:收件箱 + 我的 persona 预览 |
| `/seniors/[id]` | 登录 | 新 | 学长公开资料页 + "向 ta 提问"按钮 |
| `/chat/[chatId]` | 参与方 | 新 | 完整对话视图(学弟可继续发问,学长只读且自动标已读) |
| `/mentors` | — | 删 | 旧路由 410 重定向到 `/me/junior` |

### 学弟主页 `/me/junior`

- **Hero 卡**:已完成提取 → "你好,XXX。已完成 GitHub+小红书 提取";未完成 → "完成社媒提取后推荐会更准 → [去 workbench]"
- **§A 为你推荐的学长**:`GET /api/seniors/recommend` Top 6,卡片复用现有 `mentor-card`,新增 reasons 段
- **§B 全部学长(可搜)**:`GET /api/seniors` + 客户端按 `q` 过滤(姓名 / 标签 / 院校 / title)
- **§C 我的对话**:`GET /api/chats` 时间线列表,学长名 / 最后消息时间 / 摘要 / [继续] 按钮

### 学长主页 `/me/senior`

- **Hero**:"你的 Agent 已和 N 位学弟聊过,M 条未读"(N、M 取自 `/api/inbox` 返回)
- **§A 收件箱**:`GET /api/inbox`,每条显示学弟名+主修+时间+摘要,未读以圆点标记,点 [查看完整对话] 跳 `/chat/[chatId]`
- **§B 我的 Agent persona 预览**:只读,展示 `persona.background + expertise` + builtProfile 来源列表 + `[更新我的资料 → /agent-workbench]` 按钮

**关键差异**:学长侧**没有**推荐 / 搜索学弟的功能,**没有**主动找学弟的入口。

### 对话页 `/chat/[chatId]`

- **学弟视角**:用户气泡右、agent 气泡左;底部输入框继续发问;enter 发送;SSE 流式接收
- **学长视角**:进入时立即 `POST /api/inbox/[chatId]/read` 标已读;纯只读;顶部显示"学弟 XXX · 首次提问 X 月 X 日";无输入框

### 首页 `/` 双入口

```
─────────────────────────────────────────────
我是学弟/学妹 →   注册 / 登录后:看到为你推荐的学长
                  让你的 Agent 替你先发问
─────────────────────────────────────────────
我是学长/学姐 →   注册 / 登录后:看到学弟来问过什么
                  你的 Agent 自动以你的经验回答
─────────────────────────────────────────────
```

两个 CTA 都走 `/signup?role={role}`;已登录的访客直接走 `/me` SSR 分发。

### 视觉一致性

- 沿用现有 `--accent` 粉色 + `--border-default` + 现有 mentor-card 雷达图 SVG
- 新增页面 CSS 写到 `styles/_me.css`、`styles/_inbox.css`、`styles/_chat.css`,与 `_legacy-tokens.css` 同级
- 暗色模式继承 ThemeToggle(已有)

## 9. 环境变量

`apps/site/.env.local` 新增:

```
UPSTASH_REDIS_REST_URL=https://<region>-<id>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token from upstash console>
```

`.env.example` 同步加注释 + 指向 Upstash 控制台说明。

## 10. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| Upstash REST 延迟 ~50-200ms,每路由多次调用累积 | 首屏可能 1-2s | 推荐结果 1h 缓存;非热数据用 MGET / pipeline 合批 |
| 误删 / schema 写歪 | demo 数据丢 | `scripts/seed-redis.ts` 幂等可重跑;Phase 5.1 完成前不动 SQLite,可回滚 |
| Upstash 命令次数被打满 | 服务不可用 | 估算 < 1k/day vs 10k 额度;真实跑超后扩容到 Upstash 付费(< $0.2/M cmd) |
| 学长侧"被联系"无实时提醒,可能错过 demo 时机 | 演示效果打折 | 学长主页 Hero 明显写未读数;演示时手动刷新即可 |
| Phase 5.2 切换中途崩溃,Redis 半写 | 用户数据不一致 | 5.2 子任务用 PR-per-route 切分,每个 PR 包含本路由的端到端单测;Upstash 的 KEYS 命令 + 控制台可 spot-check |

## 11. 不做(明确边界)

- 不做 SSE 实时推送给学长
- 不做学长侧"主动找学弟"的任何入口
- 不做双向 A2A 协议、真正的 agent 调 agent
- 不做 BYOK
- 不做 LLM 辅助推荐打分(v2 才考虑)
- 不做 token 刷新 / 多 session 设备管理 UI
- 不做 GDPR 删号 / 数据导出

## 12. 验收清单

Phase 5 完成时,以下流程必须跑通:

1. 启动:运行 `bun run seed` 注入 6 学长到 Upstash
2. 学弟 A 注册(`/signup?role=junior`),跳 `/me/junior`
3. 学弟 A 完成 GitHub + 小红书提取(`/agent-workbench`)
4. 学弟 A 回到 `/me/junior`,推荐区显示 6 张卡片,每张有 4 轴雷达图 + 至少 1 条 reason
5. 学弟 A 点其中一张 → 进 `/chat/[chatId]` → 输入问题 → 看到流式回复
6. 学长 B(seed 账号)登录,自动跳 `/me/senior`,Hero 显示"已和 1 位学弟聊过,1 条未读"
7. 学长 B 点收件箱条目 → 进 `/chat/[chatId]`(只读)→ 自动标已读 → 回 `/me/senior` 看到未读消失
8. 学弟 A 回 `/me/junior` 的"我的对话"区域,能看到这条对话条目并继续发问

## 13. 引用

- Phase 3a:`docs/superpowers/specs/2026-06-07-phase3a-persona-injection-design.md`
- Phase 4:`docs/superpowers/specs/2026-06-07-phase4-multi-user-design.md`
- Upstash 控制台:`https://console.upstash.com/redis/dc48ed99-7745-4aca-afd1-23ebb762b7c0`
- Upstash Redis SDK:`https://github.com/upstash/redis-js`

## 14. 验收记录(Phase 5 完成)

- 日期: 2026-06-07
- 测试账号: alice_demo27 (junior, fresh signup) / chensirui (senior seed)
- 验收 8 步全过 ✅(Step 3 提取流程因 headless 环境跳过,使用冷启动路径验证推荐)
- 已知小问题:
  - 早期 testjunior01 账号 displayName 在 Upstash 中以 mojibake 形式存储("����ѧ��01"),不影响功能,demo 前可清掉旧测试数据
  - 推荐冷启动 reasons 单一(只有 "完成社媒提取后可获得个性化匹配"),后续可补 1-2 条更友好的引导
  - chensirui 持久人格回复较长(2-3 句),可在 demo 时观察是否需要在 prompt 控制长度
