# RE:FUDAN（复见）

> 让经验先抵达，答案再相见。

RE:FUDAN 是一个面向复旦校园场景的 Agent-Native 社交 Demo。系统围绕“学弟 Agent 提问 - 学长 Agent 预沟通 - 真人决定是否接力”展开，把高摩擦的经验咨询，重构成可追踪、可解释、可分阶段推进的协作流程。

当前仓库已经进入可运行工作版，核心链路不再是静态展示：

- 学弟侧可以构建 Agent 档案、选择问题方向、获得推荐学长
- 需求匹配页支持发出首条消息后自动触发 A2A 多轮预沟通
- 学长侧可以在接力收件台查看结果，并决定是否 handoff
- P3 保留完整自动对话轨迹，P4 负责连接简报与人工接力

## 当前项目状态

- 主应用：`apps/site`
- 共享合同：`packages/contracts`
- 画像抽取流水线：`services/profile-extraction`
- 技术主线：`Next.js 15 + React 19 + Bun + Upstash Redis + DeepSeek + Python`

当前版本定位为 Agent 训练营中期可演示工作版，不是生产环境成品。

## 快速导航

| 你想看什么 | 路径 |
| --- | --- |
| 项目说明书 | `doc/01_项目说明书.md` |
| Demo 视频说明 | `doc/03_demo视频说明.md` |
| 代码运行说明 | `doc/05_代码运行说明.md` |
| 主站代码 | `apps/site` |
| Python 画像流水线 | `services/profile-extraction` |

## 当前系统结构

### `apps/site`

主站承担所有用户交互和业务 API，包括：

- 首页、注册、登录
- Agent 工作台
- 学弟推荐页 `/me/junior`
- 学长接力收件台 `/me/senior`
- A2A 会话中心 `/a2a/[sessionId]`
- P4 连接简报页 `/a2a/[sessionId]/referral`

### `packages/contracts`

用于维护前后端共享类型，当前已覆盖：

- A2A turn / trace
- autoplay state
- assessment / verdict / covered slots
- handoff / referral 状态

### `services/profile-extraction`

这是画像抽取与分析流水线，由主站通过子进程触发，不是独立 Web 服务。主要职责：

- 收集 GitHub / 小红书 / 知乎 / LinkedIn 资料
- 运行分析与综合
- 产出结构化 `builtProfile`
- 为推荐和 A2A 提供输入

## 当前最重要的功能更新

### 1. 需求匹配页触发 A2A 自动多轮对话

当前不再要求用户必须先跳转到 `/a2a/new` 才能开始预沟通。

在 `/me/junior` 的推荐卡片中：

- 用户先输入第一句方向性问题
- 系统创建 A2A session，并立即生成首轮回复
- 随后前端循环调用 autoplay API
- 由编排器围绕 5 个信息槽继续追问
- 达到停止条件后输出总结、结论标签、回流评分

5 个核心信息槽包括：

- 入营 / 整体难度
- 真题 / 问题类型
- 导师或沟通风格
- 信任升级后才适合透露的信息
- GPA / 硬门槛

### 2. A2A 会话支持自动编排与总结回流

后端现在不再只是“用户问一句，学长答一句”。

系统已经支持：

- 自动选择下一轮 probing slot
- 自动生成 junior_agent 追问
- 调用 senior_agent 回复
- 评估已覆盖槽位
- 生成 `summary / verdict / adjustedScore / insights`
- 把 assessment 回流到推荐卡片

### 3. 旧 `agent-workbench` 路径已兼容接入 autoplay

由于部分演示路径仍会从 `/agent-workbench` 发消息，当前这个旧入口也已经补上：

- 首条消息后自动创建带 `autoplay: true` 的 session
- 前端按轮推进 autoplay
- 页面内展示运行状态
- 会话结束后可直接进入完整 A2A 轨迹

### 4. Provider 失败时会自动降级

如果 DeepSeek 当前不可用，系统不会直接中断，而是：

- 记录 fallback trace
- 生成基于本地 persona / evidence 的保底回复
- 保留会话与已有结果

这意味着“对话质量可能下降”，但演示链路尽量不断。

## 核心外部依赖

### Upstash Redis

用于持久化：

- 用户信息
- 登录 session
- 学长 / 学弟索引
- 推荐缓存
- A2A session metadata
- turn / trace / assessment / handoff / referral

关键环境变量：

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### DeepSeek API

当前用于：

- 学长 Agent 回复生成
- 自动追问链路中的 senior-side 回复
- 会话摘要和 handoff brief 所依赖的内容生成

关键环境变量：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### Python 画像流水线

当前用于：

- 采集社媒资料
- 生成结构化档案
- 支撑推荐与 A2A 上下文

## 本地运行

### 环境要求

| 组件 | 建议版本 | 作用 |
| --- | --- | --- |
| Bun | `>=1.3` | 包管理与脚本执行 |
| Node.js | `>=20` | Next.js runtime |
| Python | `3.11` 或 `3.12` | 画像流水线 |
| Git | 较新版本 | 拉取仓库 |

### 1. 获取代码

```bash
git clone https://github.com/fishine-cmd/REFUDAN.git
cd REFUDAN/re_fdu-main/re_fdu-main
```

### 2. 安装依赖

```bash
bun install
```

### 3. 配置环境变量

```bash
cp apps/site/.env.example apps/site/.env.local
```

至少补齐：

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
DEEPSEEK_API_KEY=
```

### 4. 安装 Python 依赖

```bash
cd services/profile-extraction
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

### 5. 初始化 demo 学长数据

```bash
cd apps/site
bun run seed
```

默认 demo 学长密码统一为：

```text
demo123
```

### 6. 启动主站

```bash
cd apps/site
bun run dev
```

访问：

- [http://localhost:3000](http://localhost:3000)

### 7. 类型检查

```bash
bun run typecheck:site
bun run typecheck:contracts
```

## 推荐演示路径

### 学弟侧

1. 注册学弟账号
2. 进入 `Agent 工作台`
3. 构建 Agent 档案
4. 进入 `/me/junior`
5. 选择问题方向并输入第一句问题
6. 在推荐卡片内启动 A2A 自动多轮预沟通
7. 查看自动总结与匹配结论
8. 进入 `/a2a/[sessionId]` 查看完整轨迹

### 学长侧

1. 使用 seed 后的 demo 学长账号登录
2. 进入 `/me/senior`
3. 查看接力收件台中的 A2A 会话
4. 进入 P3 会话中心查看轨迹与 assessment
5. 决定是否 handoff
6. 若通过则进入 P4 连接简报页

## 当前仓库中最重要的目录

```text
re_fdu-main/re_fdu-main
├─ apps
│  └─ site
│     ├─ src/app
│     ├─ src/lib
│     ├─ src/data/mentors
│     └─ scripts/seed-redis.ts
├─ packages/contracts
├─ services/profile-extraction
└─ doc
```

## 当前仍需注意的事项

- 当前 README 已按现有代码更新，但仓库中仍可能残留早期设计文档，请不要直接把旧设计当成当前运行说明
- `services/profile-extraction/data/browser_profile/` 可能包含本地浏览器登录态，提交材料前不要打包这类私有目录
- 如果 Redis 未配置，主站大部分核心能力都无法运行
- 如果 DeepSeek 当前不可用，A2A 会降级为 fallback reply，链路可能继续，但质量会下降
- 如果 Python 依赖未安装，“生成 Agent 档案”会失败，但登录、推荐、A2A 主链路仍可单独演示
