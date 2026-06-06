# HANDOFF — 接手开发备忘

> 写给下次接力开发的人。**先把这份文档从头到尾读一遍**，再动手。

---

## 0. 5 分钟上手

1. 当前所在分支：`feat/secondme-integration`（fork：`fishine-cmd/REFUDAN`，原仓：`Wesleyyyyyy/REFUDAN`）
2. 项目根：`re_fdu-main/re_fdu-main/`（双层嵌套，**没有扁平化**，原因见第 6 章）
3. 主演示：`apps/site`（端口 3000）；架构示意：`apps/app`（端口 3001，可忽略）
4. 跑起来：参考 [`05_代码运行说明.md`](05_代码运行说明.md)
5. 完整设计：[`secondme-integration-design.md`](secondme-integration-design.md)

---

## 1. 已完成矩阵

| 模块 | 状态 | 关键文件 | 测试过的场景 |
|---|---|---|---|
| OAuth2 完整链路 | ✅ 端到端跑通 | `apps/site/src/app/api/auth/secondme/*` | 真实回环：authorize → SecondMe 同意 → callback → token 落地，全程成功 |
| SecondMe 客户端 | ✅ | `apps/site/src/lib/secondme.ts` | 包含 token 交换、refresh、/auth/me、user/info、streamChat、本地存储 |
| 流式对话中转 | ✅ 59 chunks 实测 | `apps/site/src/app/api/chat/route.ts` | `secondmeChatResponse()` 收完全部 chunks 后转 JSON 返回 |
| 兜底 LLM (DeepSeek) | ⚠️ 路径写好但未配 key | 同上 | mentor 未绑定 SecondMe 时走兜底；当前 `.env.local` 未填 `DEEPSEEK_API_KEY` |
| Mentor schema 扩展 | ✅ | `apps/site/src/data/mentors/*.json` + `index.ts` | 加了 `consent_status` / `consent_granted_at` / `data_source` / `secondme_user_id` / `demo_binding_note` |
| 学长授权管理 UI | ✅ | `apps/site/src/app/mentor-onboard/page.tsx` | 含状态徽章、回调 banner、撤销按钮、演示绑定橙色标识 |
| 合规水印 | ✅ | `apps/site/src/app/agent-workbench/page.tsx` 头部 | 顶部一行明确"AI 助手代为表达" |
| Mentor 卡片状态 | ✅ | `apps/site/src/app/mentors/page.tsx` | 绿/黄 pill 显示是否已接 SecondMe |
| 协作流程 | ✅ | `README.md` + `doc/01_项目说明书.md` | fork → feature branch → PR 工作流 |
| 安全卫生 | ✅ | `.gitignore` + `.git/info/exclude` | secret 全在 `.env.local`，git history 扫描确认无残留 |
| 提交材料 | ✅ md 完成，⏳ PDF 待转 | `doc/01,03,05_*.md` | 用 VS Code Markdown PDF 扩展导出 |
| 一键打包 | ✅ | `scripts/package-submission.mjs` | 跑过 dry-run，必需文件缺失会清晰报错 |

---

## 2. 待办（按优先级）

### P0 — 中期评审硬截止前（6/9 23:59）

- [ ] **训练 SecondMe 分身**到 profileCompleteness ≥ 50%（当前 3%，回复质量直接关联）
- [ ] **录 demo 视频** → 放 `doc/02_demo_video.mp4`（脚本见 `03_demo视频说明.md`）
- [ ] `doc/01_项目说明书.md` → 导出 `doc/01_项目说明书.pdf`
- [ ] `bun run scripts/package-submission.mjs` 打包，发邮件到 `FudanAICS@163.com`

### P1 — 评审通过后短期（1-2 周）

- [ ] **5 位剩余 mentor 完成 SecondMe 注册 + 各自 OAuth2 授权**（这是整个项目「上线」的前置条件）
- [ ] `mentor_tokens.json` 从文件存储迁到 **服务端加密数据库**（建议 PostgreSQL + KMS 或 SQLite + libsodium）
- [ ] **OAuth2 refresh token 自动续期**：现在拿到 `refresh_token` 没用上，`refreshAccessToken()` 已实现但未集成
- [ ] **撤销 webhook 接收端**：实现 `/api/webhooks/secondme/revoked`，到 SecondMe 控制台回填地址 + HMAC-SHA256 签名验证（参考 [`secondme-integration-design.md` 第 6 章](secondme-integration-design.md)）
- [ ] 部署到内测域名 + HTTPS + 注册 SecondMe 生产环境应用
- [ ] 把双层嵌套 `re_fdu-main/re_fdu-main/` 扁平化（见第 6 章风险评估）

### P2 — 中期（1 个月）

- [ ] **隐私级别（公开 / 握手后可见 / 仅本人确认）后端对接**：三档对应不同的 SecondMe `memory.read` 字段筛选
- [ ] 接入 SecondMe **Key Memory 搜索接口** 让分身能召回经验细节
- [ ] **真流式渲染**：当前 `/api/chat` 收完整 stream 再 JSON 返回（demo 简化），上线应改回 SSE 直通前端
- [ ] **雷达图匹配算法升级**：从静态打分到基于 mentor/mentee 真实需求的语义匹配
- [ ] **真人引荐链路**：分身对话结束 → 可选向 mentor 本人发起 RE:FUDAN 真人会面邀请

### P3 — 长期 / 演进

- [ ] 多分身矩阵 + Plaza 广场打通
- [ ] 接入 `note.write` 让学长本人补充新经验
- [ ] 接入 `agent_memory` 上报"被询问最多的问题"反哺学长本人

---

## 3. ADR-lite（关键技术决策记录）

### ADR-1：数据来源 = 知情同意，不爬取
**Context**：初始构想是"爬取公开社媒训练学长分身"。
**Decision**：完全 pivot 到"本人填写 + 本人 SecondMe 授权"。
**Why**：PIPL + 民法典 1019 条 + 复旦个人信息保护红线，作为校内训练营评审材料更不能踩。SecondMe 平台自身也不提供"为他人创建分身"的 API。
**Trade-off**：扩展 mentor 池速度受限于"愿意配合的真人"数量，但**符合产品叙事且法律稳健**。

### ADR-2：演示阶段 chenxiaoyuan 卡片绑定项目方账号
**Context**：3 天内不可能让 6 位真实学长完成"SecondMe 注册 + 训练 + 授权"。
**Decision**：仅陈晓远一张卡片绑定项目方账号（fishine），用于验证 OAuth2 + 流式对话技术链路；mentor JSON 加 `demo_binding_note` 字段，UI 显示橙色提示框。
**Why**：诚实 > 假装；评审会因"团队明确披露 demo 阶段妥协"加分。
**Trade-off**：demo 视频不能展示"6 位学长各自分身"的多样性。

### ADR-3：/api/chat 不流式（中转后一次返回）
**Context**：前端 `agent-workbench` 现有逻辑用 `res.json()` 读响应。
**Decision**：服务端收完整 SecondMe SSE 流，拼接成完整文本，以 `{reply, source, mentorId}` JSON 返回。
**Why**：前端零改动；用户体感（9 秒延迟）与真流式接近；演示视频里看不出区别。
**Trade-off**：生产应改回真 SSE 直通前端（已在 P2 列出）。

### ADR-4：token 本地文件 mentor_tokens.json
**Context**：demo 阶段不接 DB。
**Decision**：用 `apps/site/mentor_tokens.json` 持久化 OAuth2 token，已 gitignore。
**Why**：演示视频里要展示"撤销 → 卡片回退"，文件读写最直接；secret 不会进入 git。
**Trade-off**：生产**必须**替换（已在 P1 列出）。多副本部署下并发写无控制。

### ADR-5：OAuth2 endpoints 写死在 secondme.ts，可被环境变量覆盖
**Context**：SecondMe 官方文档 endpoint 易变（实际开发时曾踩 endpoint 错误的坑）。
**Decision**：默认值 hardcode 在 `lib/secondme.ts`，三个 URL（`AUTH_URL` / `BASE_URL` / token paths）可由 `.env.local` 覆盖。
**Why**：避免 endpoint 变更时改代码；同时让默认开箱即用。

---

## 4. SecondMe API 探索边界

### 已验证可用
| Endpoint | 方法 | 真实响应字段 |
|---|---|---|
| `https://go.second-me.cn/oauth/` | GET (浏览器跳转) | `?code=lba_ac_xxx&state=...` |
| `https://api.mindverse.com/gate/lab/api/oauth/token/code` | POST form | `{code:0, data:{accessToken,refreshToken,tokenType,expiresIn,scope[]}}` |
| `https://api.mindverse.com/gate/lab/api/auth/me` | GET Bearer | `{code:0, data:{userId,name,email,avatar,appScopedUserId}}` |
| `https://api.mindverse.com/gate/lab/api/secondme/user/info` | GET Bearer | `{code:0, data:{userId,name,email,avatar,selfIntroduction,profileCompleteness,route,...}}` |
| `https://api.mindverse.com/gate/lab/api/secondme/chat/stream` | POST JSON Bearer | SSE `data: {choices:[{delta:{content}}]}` + `data: [DONE]` |

### 未实际调用过（demo 阶段未涉及）
- `/api/oauth/token/refresh`（代码已写，未触发过）
- `/api/secondme/memory/key/search`
- `/api/secondme/note/*`
- `/api/secondme/agent-memory/*`
- `/api/secondme/plaza/*`
- `/api/secondme/tts/*`

### 已知边界 / 不能做的事
1. **没有 client_credentials grant** — 无法让服务端在无用户的情况下访问任何分身
2. **没有"为他人创建分身"的接口** — 每个分身必须本人注册 + 本人授权
3. **chat/stream 无 system prompt 参数** — persona 由 token 所属用户的训练数据决定，不能在请求里 override
4. **chat/stream 不接受 messages 数组** — 只接 `{message: string}` 单条；多轮对话需自己维护 `sessionId`（响应 SSE 第一帧带 sessionId，目前我们没存）

---

## 5. 关键文件速查表

| 想改 | 改这里 |
|---|---|
| 学长名单 / 经历 | `apps/site/src/data/mentors/*.json` |
| 学长授权字段 | `apps/site/src/data/mentors/index.ts` 里 `MentorProfile` 接口 |
| OAuth2 流程 | `apps/site/src/lib/secondme.ts` |
| chat 分发逻辑 | `apps/site/src/app/api/chat/route.ts` |
| onboard 页面 UI | `apps/site/src/app/mentor-onboard/page.tsx` |
| 合规水印 | `apps/site/src/app/agent-workbench/page.tsx` 顶部 |
| 配置变量 | `apps/site/.env.example`（模板）+ `apps/site/.env.local`（本地，不入库） |
| 打包脚本 | `scripts/package-submission.mjs` |

---

## 6. 双层嵌套目录为什么没扁平化？

**事实**：上游 `Wesleyyyyyy/REFUDAN` 仓库本身就是这种 `re_fdu-main/re_fdu-main/` 结构（zip 解压后直接 commit 的痕迹）。

**为什么没改**（即使丑）：
1. 改动量大：上百文件 + 中文路径 + git 跟踪 rename 检测可能失败
2. 中期 3 天内不值得：评审看代码不会因此打低分
3. README 第一段已经说明，评审能 5 秒进入

**何时该改**：评审通过 + 邀请到真实 mentor 上线时，开一个独立 PR 专门做扁平化，并同步提给上游。

**怎么改**（备忘）：
```bash
# 1. 停所有 dev server
# 2. 合并外层 + 内层 .gitignore（外层已经合并好了，直接用）
# 3. 用 git mv（不是 OS mv）逐项移动，让 git 自动识别 rename：
git mv re_fdu-main/re_fdu-main/apps .
git mv re_fdu-main/re_fdu-main/packages .
# ... 18 项一项一项来
# 4. 删空目录
rmdir re_fdu-main/re_fdu-main re_fdu-main
# 5. 更新所有相对路径引用（doc/、scripts/）
# 6. typecheck 全部包，本地起服务验证
# 7. 单独 PR
```

---

## 7. 已知小问题

| 问题 | 是否阻塞 | 修复建议 |
|---|---|---|
| `apps/app/*` 5 个 P0-P4 页面是静态占位（合计 176 行） | 不阻塞 demo | 评审后 decide 删除还是充实 |
| `mentor-onboard` 的 banner 显示 `user=undefined` 旧 URL 来自第一次失败的回调 | 已修但旧 link 可能还在浏览器历史 | 用户重做一次授权就好 |
| `secondme.ts` 还留有诊断 `console.log` | 不影响功能 | 生产前清掉或换成 logger |
| `.trellis/.template-hashes.json` 是 trellis 工具内部文件 | 否 | 不要手动改，trellis update 时会重写 |
| 双层目录 `re_fdu-main/re_fdu-main/` | 评审视觉不爽 | 评审后扁平化，见第 6 章 |

---

## 8. 联系 / 求助

- **GitHub 仓库**：https://github.com/fishine-cmd/REFUDAN
- **上游原仓**：https://github.com/Wesleyyyyyy/REFUDAN
- **SecondMe 官方文档**：https://develop-docs.second.me/zh/docs
- **SecondMe 开发者控制台**：https://develop.second-me.cn/integrations/list

读到这里——祝顺利。
