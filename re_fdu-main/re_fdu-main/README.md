# RE:FUDAN（复见）

> 让经验先抵达，答案再相见。

RE:FUDAN 是一个面向复旦校园场景的 Agent-Native 社交 Demo。系统围绕"学弟 Agent 提问 - 学长 Agent 预沟通 - 真人决定是否接力"展开，把高摩擦的经验咨询，重构成可追踪、可解释、可分阶段推进的协作流程。

当前仓库已经进入可运行工作版，核心链路不再是静态展示：

- 学弟 / 学长在落地页就能按角色分流注册，登录后 SSR 自动跳转到各自工作台
- 学弟侧可以构建 Agent 档案、生成 AI 画像洞察、选择问题方向、获得推荐学长
- 需求匹配页支持发出首条消息后自动触发 A2A 多轮预沟通
- 学长侧可以在接力收件台查看结果，并决定是否 handoff
- P3 保留完整自动对话轨迹，P4 负责连接简报与人工接力
- 小红书数据采集已统一为「真实 Chrome + CDP 附着」路径，绕开 headless 风控

## 当前项目状态

- 主站：`apps/site`（端口 `3000`）
- 备用站：`apps/app`（端口 `3001`，启动脚本会顺带拉起）
- 共享合同：`packages/contracts`
- 画像抽取流水线：`services/profile-extraction`
- 技术主线：`Next.js 15 + React 19 + Bun + Upstash Redis + DeepSeek + Python 3.12 + Playwright + Chrome CDP`

当前版本定位为 Agent 训练营中期可演示工作版，不是生产环境成品。

## 快速导航

| 你想看什么 | 路径 |
| --- | --- |
| 项目说明书 | `doc/01_项目说明书.md` |
| Demo 视频说明 | `doc/03_demo视频说明.md` |
| 代码运行说明 | `doc/05_代码运行说明.md` |
| 主站代码 | `apps/site` |
| 备用站代码 | `apps/app` |
| Python 画像流水线 | `services/profile-extraction` |
| 一键启动脚本 | `启动.bat`（Windows） |

## 当前系统结构

### `apps/site`（核心主站，端口 3000）

主站承担所有用户交互和业务 API，包括：

- 双角色落地页 `/`
- 注册 `/signup?role=junior|senior` / 登录 `/login`
- 角色路由 `/me`（根据 role SSR 重定向到下面两个工作台）
  - 学弟工作台 `/me/junior` — 推荐 + 搜索 + 会话列表
  - 学长接力台 `/me/senior` — 收件台 + persona 预览
- 学长公开页 `/seniors/[id]`
- Agent 工作台 `/agent-workbench`（带角色 banner）
- A2A 会话中心 `/a2a/[sessionId]`
- P4 连接简报页 `/a2a/[sessionId]/referral`
- `/chat/*` 路径保留为兼容垫片，会重定向到对应 A2A 会话

### `apps/app`（备用站，端口 3001）

最小化的第二个 Next.js workspace，由启动脚本一并拉起。当前主要作为后续拆分扩展的占位，演示主链路集中在 `apps/site`。

### `packages/contracts`

用于维护前后端共享类型，当前已覆盖：

- A2A turn / trace
- autoplay state
- assessment / verdict / covered slots
- handoff / referral 状态

### `services/profile-extraction`

画像抽取与分析流水线，由主站通过子进程触发，不是独立 Web 服务。主要职责：

- 收集 GitHub / 小红书 / 知乎 / LinkedIn 资料
- 通过 Chrome CDP 复用真实浏览器的小红书登录态
- 运行画像分析与综合
- 产出结构化 `builtProfile`
- 为推荐、A2A 和 AI 画像洞察提供输入

## 当前最重要的功能更新

### 1. 双角色落地页 + SSR 角色重定向

- 落地页直接呈现两个角色入口卡片，注册 URL 自带 `?role=junior|senior`
- 登录后访问 `/me` 由服务端按 role 重定向到 `/me/junior` 或 `/me/senior`，避免客户端闪烁
- 注册成功后系统会写入会话并把用户直接送到对应工作台

### 2. 学弟侧需求匹配页（/me/junior）

- 选择问题方向（保研 / 实习 / 科研 / 跨专业 等）后系统重排推荐
- 推荐卡片内可输入首句问题，立刻触发 A2A 自动多轮预沟通
- 实时回流 summary / verdict / adjustedScore / coveredSlots
- 顶部聚合用户已有的会话列表，可继续追问

### 3. 学长侧接力收件台（/me/senior）

- 收件台展示进入 handoff 视野的会话摘要
- 进入会话后展示完整 A2A 轨迹与 assessment
- 在同一页面预览自己的 persona / 公开档案
- 决定 `approved / rejected` 后跳转到 P4 连接简报

### 4. A2A 自动编排与总结回流

- 自动选择下一轮 probing slot
- 自动生成 junior_agent 追问、senior_agent 回复
- 评估已覆盖槽位
- 生成 `summary / verdict / adjustedScore / insights`
- 把 assessment 回流到推荐卡片

5 个核心信息槽：入营 / 整体难度、真题 / 问题类型、导师或沟通风格、信任升级后才适合透露的信息、GPA / 硬门槛。

### 5. AI 生成画像洞察（/api/profile/insights）

新增 `/api/profile/insights` 端点：
- 基于结构化 `builtProfile` 调 DeepSeek 输出标签化卡片（性格、兴趣、动机、表达风格、擅长、可聊主题、风险提示）
- DeepSeek 不可用时回退到本地 fallback 归纳，保证返回不为空

### 6. 小红书采集统一为「真实 Chrome + CDP」

- 启动脚本步骤 6 提示是否打开真实 Chrome 并跑 `xhs_login.py`
- 用户在真实 Chrome 中完成扫码后，Python 通过 CDP 附着同一浏览器抓取主页内容
- 端点缓存写入 `services/profile-extraction/data/chrome_cdp_endpoint.txt`
- 关键环境变量：`SCHOOLMATE_BROWSER_USE_CDP=true`、`SCHOOLMATE_CDP_ENDPOINT=http://127.0.0.1:9222`

### 7. UI / 对话体验整体重做

落地页、Agent 工作台、A2A 对话页和角色 banner 全部按新的视觉规范重做：聚焦"路径优先推荐 / A2A 预沟通 / 人工决定接力"三柱，对话区域提供更清晰的轮次推进与 fallback 状态提示。

### 8. Provider 失败时自动降级

如果 DeepSeek 当前不可用，系统不会直接中断，而是：
- 记录 fallback trace
- 生成基于本地 persona / evidence 的保底回复
- 保留会话与已有结果

意味着"对话质量可能下降"，但演示链路尽量不断。

## 核心外部依赖

### Upstash Redis

用于持久化：用户信息、登录 session、学长 / 学弟索引、推荐缓存、A2A session metadata、turn / trace / assessment / handoff / referral。

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### DeepSeek API

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### Python 画像流水线

- 采集 GitHub / 小红书 / 知乎 / LinkedIn 资料
- 通过 Playwright + Chrome CDP 在真实浏览器登录态下抓取小红书
- 输出结构化档案

---

# 📚 教学篇：从零跑通 RE:FUDAN（写给完全没接触过本项目的同学）

> 假设你刚拿到这个仓库，电脑上只有操作系统和浏览器。  
> 跟着下面这一节一步一步走，应该能在 30 ~ 60 分钟内看到 `/` 落地页跑起来。  
> 本节以 **Windows 10/11** 为主线，Mac/Linux 用户在「平台差异」小节里给出替换命令。

## 第 0 步：你需要准备什么

| 资源 | 是否必需 | 怎么准备 |
| --- | --- | --- |
| Git | ✅ 必需 | https://git-scm.com/download 直接下载安装 |
| 现代浏览器（Chrome 推荐） | ✅ 必需 | Demo 运行时观看 + 小红书 CDP 登录 |
| Python 3.12+ | ✅ 必需 | https://www.python.org/downloads/ ，安装时**勾选 Add Python to PATH** |
| Upstash Redis 数据库信息 | ✅ 必需 | 找数据库管理员要，填入.env.local |
| DeepSeek API Key | ✅ 必需 | https://platform.deepseek.com 注册并申请 API Key |
| Bun | ⚠️ 启动脚本会自动装 | 你不用手动装，`启动.bat` 第一步会帮你安装 |
| Node.js | ❌ 可选 | Bun 已经够用，不强求安装 |

> 如果你不打算演示「生成 Agent 档案 / 小红书采集」，Python 和小红书部分可以跳过，登录注册和 A2A 自动多轮仍能跑通。

## 第 1 步：克隆代码

打开 PowerShell（Win+X → "终端"或"PowerShell"）：

```powershell
git clone https://github.com/fishine-cmd/REFUDAN.git
cd REFUDAN\re_fdu-main\re_fdu-main
```

> 仓库是双层目录结构，真正的"项目根"是第二层 `re_fdu-main`。  
> 后续所有命令都以这个目录为起点。

## 第 2 步：拿 Upstash Redis 数据库的URL和TOKEN

找管理员拿这两个值
   - `UPSTASH_REDIS_REST_URL`（一串 https 地址）
   - `UPSTASH_REDIS_REST_TOKEN`（一长串字母数字）

## 第 3 步：拿一个 DeepSeek API Key

1. 打开 https://platform.deepseek.com，注册
2. 进入「API Keys」页面，新建一个 Key
3. 复制保存好，只显示一次

## 第 4 步：配置环境变量

在项目根目录（`re_fdu-main/re_fdu-main`）下执行：

```powershell
copy apps\site\.env.example apps\site\.env.local
```

用记事本 / VSCode 打开 `apps\site\.env.local`，**至少**填上：

```env
UPSTASH_REDIS_REST_URL=https://你的-upstash-地址
UPSTASH_REDIS_REST_TOKEN=你的-upstash-token
DEEPSEEK_API_KEY=你的-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

> 如果你要用小红书 CDP 采集，保留模板里这几行（默认值就够用）：
> ```env
> SCHOOLMATE_BROWSER_USE_CDP=true
> SCHOOLMATE_CDP_ENDPOINT=http://127.0.0.1:9222
> ```

## 第 5 步：用一键启动脚本（推荐）

在项目根目录双击运行：

```text
启动.bat
```

或者在 PowerShell 里：

```powershell
.\启动.bat
```

脚本会**自动**做完下面这 7 件事：

| 步骤 | 做什么 | 失败怎么办 |
| --- | --- | --- |
| 1/7 | 检查 / 安装 Bun | 失败时按提示去 https://bun.sh 手动装 |
| 2/7 | 检查 / 安装前端依赖（`bun install`） | 网络差时手动重跑 `bun install` |
| 3/7 | 检查 Python 3.12+ | 缺则按提示装 Python |
| 4/7 | 检查 / 安装 Python 依赖 | 失败时手动 `pip install -r services\profile-extraction\requirements.txt` |
| 5/7 | 检查 / 下载 Playwright Chromium | 网络差时手动 `python -m playwright install chromium` |
| 6/7 | **可选**：是否现在打开真实 Chrome 做小红书登录 | 选 Y 会弹出新窗口，按提示扫码；选 N 跳过 |
| 7/7 | 同时启动 `apps/site`（3000）和 `apps/app`（3001），并自动打开浏览器 | 端口被占用时关掉占用进程或改端口 |

如果第 7 步成功，你会看到两个新的命令行窗口，标题分别是：

- `RE:FUDAN site (3000)`
- `RE:FUDAN app (3001)`

浏览器会自动跳到 [http://localhost:3000](http://localhost:3000) ，看到落地页就算成功。

## 第 6 步：不用 .bat 的手动启动（Mac / Linux 或想分步运行）

如果你不在 Windows 上，或者想看每一步发生了什么，按下面顺序手动跑：

```bash
# 1) 装 Bun（一次性）
curl -fsSL https://bun.sh/install | bash

# 2) 装前端依赖（在项目根目录）
bun install

# 3) 装 Python 依赖
cd services/profile-extraction
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium
cd ../..

# 4) 写入 demo 学长 + 启动主站
cd apps/site
bun run seed                       # 注入 6 位 demo 学长，密码 demo123
bun run dev                        # 启动 :3000
```

如果还想跑备用站：另开一个终端

```bash
cd apps/app
bun run dev                        # 启动 :3001
```

## 第 7 步：初始化 demo 数据（如果已经从管理员那里拿到了数据库URL等就不用做，当前已经存入管理员的云端数据库）

启动脚本不会自动跑 seed，所以**第一次**用之前需要在 `apps/site` 目录里手动跑一次：

```powershell
cd apps\site
bun run seed
```

这一步会向 Redis 注入 6 位 demo 学长账号：

| 用户名 | 默认密码 |
| --- | --- |
| `chensirui` | `demo123` |
| `chenxiaoyuan` | `demo123` |
| `sunyifan` | `demo123` |
| `weixuejie` | `demo123` |
| `wuzihan` | `demo123` |
| `zhangmingyuan` | `demo123` |

学弟账号请通过落地页的「注册学弟账号」自行注册。

## 第 8 步：跑一遍最小演示链路（10 分钟）

完成上面所有步骤后，按这个顺序点：

1. 浏览器打开 `http://localhost:3000`
2. 点「注册学弟账号」，注册并自动登录
3. 自动跳到 `/me/junior` 学弟需求匹配页
4. 选一个问题方向（例如「保研 / 夏令营策略」）
5. 在某张推荐卡片里输入首句问题，例如：
   - `请问复旦计算机保研需要做哪些准备？`
6. 等 30 ~ 90 秒，观察：
   - 推荐卡片中出现「自动多轮进行中」状态
   - 完成后出现 summary / verdict / 分数变化
7. 点「查看完整 A2A」进入 `/a2a/[sessionId]`，看完整轨迹
8. 浏览器开一个隐身窗口
9. 用 `chensirui` / `demo123` 登录学长账号
10. 自动跳到 `/me/senior`，能看到刚刚那段会话进入收件台
11. 点击会话 → 审批 → 进入 P4 连接简报页

## 第 9 步（可选）：跑通「生成 Agent 档案 + 小红书采集」

1. 在启动脚本第 6 步选 `Y`，或者手动运行：
   ```powershell
   cd services\profile-extraction
   python xhs_login.py
   ```
2. 弹出的 Chrome 中**手动登录**小红书账号
3. 登录成功后这个 Chrome 不要关，保持在那里
4. 回到学弟工作台 `/agent-workbench`
5. 填入小红书 / GitHub / 知乎用户名，点「生成我的 Agent」
6. 等待返回结构化档案与 AI 生成的画像洞察

> 小红书第一次抓取需要登录态，所以一定要先跑 `xhs_login.py`。  
> 之后只要那个 Chrome 不关，就一直能用。

## 第 10 步：跑不起来怎么办

| 现象 | 大概率原因 | 怎么修 |
| --- | --- | --- |
| 浏览器打开但登录 / 注册一直转圈 | Upstash Redis 没配 | 回到第 2、4 步把 `.env.local` 填完整 |
| A2A 只回一轮就停 | DeepSeek 没配 / 网络不通 | 检查 `DEEPSEEK_API_KEY` ，或者等待恢复（系统会显示 fallback reply） |
| 点「生成我的 Agent」报错 | Python 依赖没装好 | 手动跑 `pip install -r services\profile-extraction\requirements.txt` |
| 小红书抓不到内容 | Chrome 没登录 / `SCHOOLMATE_CDP_ENDPOINT` 不对 | 重新跑 `xhs_login.py`，端口默认是 `9222` |
| 启动.bat 在第 6 步打不开 Chrome | Chrome 不在标准路径 | 自己手动启动 `services\profile-extraction\xhs_login.py` |
| 端口 3000 被占用 | 之前的 dev server 没关 | 在任务管理器关掉之前的 node/bun 进程，或者修改 `apps/site/package.json` 的端口 |

## 平台差异速查

| 步骤 | Windows | Mac / Linux |
| --- | --- | --- |
| 复制 env | `copy apps\site\.env.example apps\site\.env.local` | `cp apps/site/.env.example apps/site/.env.local` |
| 激活 venv | `.venv\Scripts\activate` | `source .venv/bin/activate` |
| 启动脚本 | `启动.bat` | 没有 .bat，请按「第 6 步：不用 .bat 的手动启动」走 |
| 小红书 CDP 登录 | `python services\profile-extraction\xhs_login.py` | `python services/profile-extraction/xhs_login.py`，需手动指定 Chrome 路径 |

---

## 推荐演示路径

### 学弟侧

1. 落地页 → 注册学弟账号
2. SSR 自动跳转到 `/me/junior`
3. 进入 `Agent 工作台` 构建 Agent 档案（可选触发画像洞察）
4. 回到 `/me/junior` 选问题方向 + 输入首句问题
5. 在推荐卡片内启动 A2A 自动多轮预沟通
6. 查看自动总结与匹配结论
7. 进入 `/a2a/[sessionId]` 查看完整轨迹

### 学长侧

1. 使用 seed 后的 demo 学长账号登录
2. SSR 自动跳转到 `/me/senior` 接力收件台
3. 查看 A2A 会话摘要 + persona 预览
4. 进入 P3 会话中心查看轨迹与 assessment
5. 决定 handoff
6. 若通过则进入 P4 连接简报页

## 当前仓库中最重要的目录

```text
re_fdu-main/re_fdu-main
├─ apps
│  ├─ site                          # 主站，:3000
│  │  ├─ src/app                    # 路由（/, /me/*, /a2a/*, /chat/*, /seniors/*, /api/*）
│  │  ├─ src/lib
│  │  │  ├─ profile-insights.ts     # 新：AI 画像洞察
│  │  │  ├─ a2a-chat.ts             # A2A 自动多轮编排
│  │  │  └─ users-redis.ts          # Redis DAL
│  │  ├─ src/data/mentors           # demo 学长 JSON
│  │  └─ scripts/seed-redis.ts      # bun run seed
│  └─ app                           # 备用站，:3001
├─ packages/contracts
├─ services/profile-extraction
│  ├─ xhs_login.py                  # 真实 Chrome + CDP 登录入口
│  ├─ schoolmate/                   # 抓取与画像构建
│  └─ data/chrome_cdp_endpoint.txt  # CDP 端点缓存
├─ doc
│  ├─ 01_项目说明书.md
│  ├─ 03_demo视频说明.md
│  └─ 05_代码运行说明.md
└─ 启动.bat                         # Windows 一键启动
```

## 当前仍需注意的事项

- `services/profile-extraction/data/browser_profile/`、`chrome_cdp_endpoint.txt` 可能包含本地浏览器登录态与 CDP 端点，提交材料前不要打包这类私有内容
- 如果 Redis 未配置，主站大部分核心能力都无法运行
- 如果 DeepSeek 当前不可用，A2A 会降级为 fallback reply，链路可能继续，但质量会下降
- 如果 Python / Playwright Chromium 未装好，"生成 Agent 档案"会失败，但登录、推荐、A2A 主链路仍可单独演示
- 小红书 CDP 登录窗口请保留在后台运行，关闭则需要重新跑 `xhs_login.py`（用python运行就好）
