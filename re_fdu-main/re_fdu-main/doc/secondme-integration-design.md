# SecondMe 集成设计

> 文档目标：作为 RE:FUDAN 项目 SecondMe API 接入的技术设计稿，同时面向训练营中期评审，说明合规路径与端到端数据流。

## 1. 设计原则

RE:FUDAN 的核心叙事是「让经验先抵达」——学长学姐的经验通过 AI 分身先与学弟妹完成一轮高质量对话，再决定是否真人引荐。SecondMe 是这一叙事的天然技术底座，因为它的产品哲学就是「**本人训练 + 本人授权 + 本人可撤回**」的数字分身。

集成遵循三条硬性原则：

1. **没有"为他人创建分身"**：每位被建模的学长学姐必须**自己**在 SecondMe 上完成账号注册与分身训练，再通过 OAuth2 授权 RE:FUDAN 调用其分身。
2. **没有第三方爬取**：所有 mentor 资料均为本人主动填写或本人 SecondMe 分身授权调用，不进行任何形式的公开社媒爬取。
3. **可撤回 + 标识**：授权可随时撤销并立即清除本地 token；所有 AI 回复带「AI 助手代为表达，非本人直接发言」水印。

## 2. 五层架构

```
┌─────────────────────────────────────────────────────────────┐
│  L5  演示前端 (apps/site)                                    │
│   /mentor-onboard     学长授权管理                            │
│   /mentors            学弟妹浏览推荐                          │
│   /agent-workbench    A2A 对话工作台 (SSE 流式)               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  L4  同意管理层                                              │
│   mentor JSON.consent_status / consent_granted_at            │
│   mentor_tokens.json  ←  OAuth2 access_token 本地落地         │
│   /api/auth/secondme/{authorize,callback,revoke,status}      │
│   合规水印 / 撤回入口 / 状态徽章                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  L3  Agent 编排层 (Next.js Route Handlers)                   │
│   /api/chat 分发：                                            │
│     mentor.consent_status === "granted" && token 存在        │
│       → SecondMe SSE 中转                                    │
│     否则 → DeepSeek 兜底 (system prompt + persona JSON)       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  L2  SecondMe API 客户端 (apps/site/src/lib/secondme.ts)      │
│   buildAuthorizeUrl / exchangeCodeForToken                   │
│   fetchUserInfo / streamChat (SSE parser)                    │
│   saveMentorToken / getMentorToken / revokeMentorToken       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  L1  SecondMe 平台 (https://second.me)                       │
│   学长本人注册 + 上传记忆/笔记 + 训练分身 + 授权 RE:FUDAN      │
└─────────────────────────────────────────────────────────────┘
```

## 3. OAuth2 授权码流程

```
   学长本人              RE:FUDAN apps/site             SecondMe 平台
       │                       │                              │
       │ ① 点击「开始授权」       │                              │
       ├──────────────────────→ │                              │
       │                       │ ② 生成 state + cookie         │
       │                       │ ③ 302 → authorize URL         │
       │ ←─────────────────────┤                              │
       │ ④ 跳到 SecondMe 授权页                                  │
       ├─────────────────────────────────────────────────────→ │
       │ ⑤ 同意 / 拒绝                                          │
       ├─────────────────────────────────────────────────────→ │
       │                       │ ⑥ 302 → /callback?code&state  │
       │ ←─────────────────────────────────────────────────────┤
       │                       │ ⑦ 校验 state CSRF              │
       │                       │ ⑧ POST /oauth2/token           │
       │                       │     (code + client_secret)     │
       │                       ├─────────────────────────────→ │
       │                       │ ⑨ access_token + refresh       │
       │                       │ ←─────────────────────────────│
       │                       │ ⑩ GET /api/secondme/user/info  │
       │                       ├─────────────────────────────→ │
       │                       │ ⑪ userId, name, avatar         │
       │                       │ ←─────────────────────────────│
       │                       │ ⑫ saveMentorToken(mentorId,    │
       │                       │      { userId, token, … })     │
       │ ⑬ 跳回 /mentor-onboard │                              │
       │ ←─────────────────────┤                              │
```

**state 设计**：`state = randomHex(16) + ":" + mentorId`。回调时 split 出 mentorId 用于绑定，randomHex 与 cookie 中保存的 `secondme_oauth_state` 比对完成 CSRF 校验。

## 4. 流式对话路径

学弟妹在 `/agent-workbench` 选中一个 mentor 发起对话，路径如下：

```
浏览器 POST /api/chat
  body: { mentorId, messages:[{role,content},...] }

  ↓ /api/chat/route.ts
  ├─ loadMentor(mentorId)
  ├─ if (consent_status === "granted" && getMentorToken(mentorId))
  │     → secondmeChatResponse(token, messages, mentorId)
  │     → 返回 text/event-stream
  │        ├─ data: { source: "secondme", mentorId }
  │        ├─ data: { delta: "..." }   ×N
  │        └─ data: [DONE]
  │
  └─ else → DeepSeek 兜底（system prompt 注入 persona + detailed_profile）
        → 返回 JSON { reply }
```

中转流而不是直接代理：在 SSE 流头部先吐一条 `source` 元数据，让前端 UI 能显示「实时来自本人 SecondMe 分身」徽章。

## 5. 数据模型

### 5.1 Mentor JSON（仓库内静态文件，6 份）

```jsonc
{
  "id": "chenxiaoyuan",
  "name": "陈晓远",
  "consent_status": "granted",          // granted | pending | revoked
  "consent_granted_at": "2026-06-06",
  "data_source": "authorized_self_report",
  "secondme_user_id": null,             // 学长跑完 OAuth2 后由系统填入
  // …其余 persona / detailed_profile / scores / tags
}
```

### 5.2 mentor_tokens.json（本地运行时，**不入库**）

```jsonc
{
  "chenxiaoyuan": {
    "mentorId": "chenxiaoyuan",
    "secondmeUserId": "12345678",
    "accessToken": "lba_at_xxxxxxxx",
    "refreshToken": "lba_rt_xxxxxxxx",
    "scope": "userinfo chat.write memory.read",
    "grantedAt": "2026-06-06T14:23:10.123Z"
  }
}
```

> ⚠️ Demo 阶段使用文件存储以便快速演示。生产环境必须替换为：
> - 服务端加密存储（KMS）
> - token 刷新机制
> - 平台撤销 webhook 接收端
> - 多副本/集群下的并发写控制

## 6. 合规设计要点

| 措施 | 实现位置 |
|---|---|
| 来源声明（"本人填写/本人授权"） | `data_source` 字段 + `/agent-workbench` 顶部水印 |
| 知情同意记录 | `consent_status` + `consent_granted_at` |
| 数据最小化 | OAuth scope 只申请 `userinfo` + `chat.write` + `memory.read` |
| 可撤回 | `/api/auth/secondme/revoke` + UI「撤销授权」按钮 |
| CSRF 防护 | OAuth2 state 参数 + httpOnly cookie 校验 |
| 密钥管理 | `.env.local` 本地存储，`.gitignore` 排除，`.env.example` 仅为占位模板 |
| 输出标识 | 所有 AI 回复带「AI 助手代为表达，非本人直接发言」字样 |
| Webhook 撤销（**待上线**） | 后续在控制台填回写 `/api/webhooks/secondme/revoked` 公网地址 |

## 7. 已知限制与后续计划

### Demo 阶段（已交付）
- ✅ 全套 OAuth2 流程（authorize / callback / revoke / status）
- ✅ SSE 流式对话中转
- ✅ 兜底 LLM（DeepSeek）路径，未授权 mentor 不影响演示
- ✅ 学长授权管理 UI + 合规水印

### 上线前必做
- ⏳ token 落地：从 JSON 文件迁移到服务端加密数据库
- ⏳ refresh token 自动续期
- ⏳ 撤销 webhook 接收端
- ⏳ 域名 + HTTPS + 生产环境 OAuth2 应用
- ⏳ 隐私级别开关（公开 / 握手后可见 / 仅本人确认后可见）实际语义对接

### 评审优秀后规划
- 邀请更多学长学姐通过 SecondMe 完成分身训练
- 接入 SecondMe `memory.read` 实现"经验自动召回"
- 接入 `note.write` 让学长本人能在对话后追加新经验记忆
- 实验 Agent Memory 事件流，记录"被询问最多的问题"反哺学长

## 8. 相关源文件清单

| 文件 | 作用 |
|---|---|
| `apps/site/src/lib/secondme.ts` | OAuth2 客户端 + SSE 解析 + token 存储 |
| `apps/site/src/app/api/auth/secondme/authorize/route.ts` | 授权发起 |
| `apps/site/src/app/api/auth/secondme/callback/route.ts` | 回调 + token 交换 + state 校验 |
| `apps/site/src/app/api/auth/secondme/revoke/route.ts` | 撤销授权 |
| `apps/site/src/app/api/auth/secondme/status/route.ts` | 查询所有 mentor 当前授权状态 |
| `apps/site/src/app/api/chat/route.ts` | 主路由分发：SecondMe SSE / DeepSeek 兜底 |
| `apps/site/src/app/mentor-onboard/page.tsx` | 学长授权管理 UI |
| `apps/site/src/data/mentors/*.json` | 6 份 mentor 元数据（含 consent_status） |
| `apps/site/.env.example` | 环境变量模板 |
