# RE:FUDAN（复见）

> **让经验先抵达，答案再相见。**
>
> 一个面向复旦校园的 Agent-Native 社交演示系统：通过 SecondMe 数字分身，让授权学长学姐的经验先与学弟妹完成一轮 A2A（Agent-to-Agent）前哨对话，再决定是否真人引荐。

**演示分支**：`feat/secondme-integration`

---

## 📍 评审快速通道

| 我要看 | 去哪 |
|---|---|
| 项目说明 / 系统设计 / 后续计划 | [`doc/01_项目说明书.md`](doc/01_项目说明书.md) |
| Demo 演示视频（含场景脚本） | `doc/02_demo_video.mp4` + [`doc/03_demo视频说明.md`](doc/03_demo视频说明.md) |
| 怎么把项目跑起来 | [`doc/05_代码运行说明.md`](doc/05_代码运行说明.md) |
| SecondMe API 接入技术设计 | [`doc/secondme-integration-design.md`](doc/secondme-integration-design.md) |
| 未来扩展 / 接手开发备忘 | [`doc/HANDOFF.md`](doc/HANDOFF.md) |

> **注意目录结构**：本仓库由上游 zip 解压生成，实际代码在双层嵌套 `re_fdu-main/re_fdu-main/` 内。本 README 位于真正的项目根，所有相对路径以此为准。从 GitHub 浏览时直接进入这一层即可。

---

## 🚀 三分钟跑起来

> **Windows 用户偷懒**：项目根有 `启动.bat`，双击即可完成下面所有步骤（Bun 自动装、依赖检查、Python 检查、Edge CDP 启动、双前端起飞）。命令行流程在下方供其他平台参考。

### 环境

| 组件 | 最低版本 | 备注 |
|---|---|---|
| Bun | 1.3 | 前端 |
| Node.js | 20 | |
| Git | 2.30 | |
| **Python** | **3.12** | **社媒画像提取，可选；启动.bat 会检测并装依赖** |
| **Edge** | 当前版 | **XHS/知乎/LinkedIn 提取需要,GitHub REST 不需要** |

### 步骤

```bash
# 1. clone（如果还没拉）
git clone https://github.com/fishine-cmd/REFUDAN.git
cd REFUDAN/re_fdu-main/re_fdu-main

# 2. 装依赖
bun install

# 3. 配 SecondMe OAuth2（详见 doc/05_代码运行说明.md 第 4 节）
cp apps/site/.env.example apps/site/.env.local
# 然后到 https://develop.second-me.cn/integrations/list 注册应用
# 把 Client ID / Secret 填进 apps/site/.env.local

# 4. 启动主演示
cd apps/site
bun run dev
# 浏览器打开 http://localhost:3000
```

### 演示路径（5 个页面）

```
http://localhost:3000               落地页
http://localhost:3000/mentors       学弟妹浏览推荐学长（雷达图）
http://localhost:3000/mentor-onboard 学长 SecondMe 授权管理 ← OAuth2 入口
http://localhost:3000/agent-workbench A2A 对话工作台
http://localhost:3000/api/auth/secondme/status JSON 状态查询接口
```

完整运行 / 排错指南：[`doc/05_代码运行说明.md`](doc/05_代码运行说明.md)

---

## 🧩 项目结构

```
re_fdu-main/re_fdu-main/                ← 真正的项目根（README 所在地）
├── apps/
│   ├── site/                           ← 主演示应用（端口 3000）
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx                       落地页
│   │   │   │   ├── mentors/page.tsx               学弟妹浏览
│   │   │   │   ├── mentor-onboard/page.tsx        学长授权管理
│   │   │   │   ├── agent-workbench/page.tsx       A2A 对话工作台
│   │   │   │   └── api/
│   │   │   │       ├── chat/route.ts              SecondMe / 兜底智能分发
│   │   │   │       ├── mentors/route.ts           mentor 列表
│   │   │   │       └── auth/secondme/             OAuth2 四路由
│   │   │   ├── lib/secondme.ts                    SecondMe 客户端
│   │   │   └── data/mentors/                      6 份学长 JSON（含 consent 字段）
│   │   ├── .env.example                           环境变量模板
│   │   └── .env.local                             本地配置（gitignore）
│   └── app/                            ← 架构示意（次要）
├── packages/contracts/                 ← 共享 TS 类型 + YAML 接口
├── doc/                                ← 所有文档（提交材料 + 设计稿）
└── scripts/
    └── package-submission.mjs          ← 一键打包中期材料 ZIP
```

---

## 🏛️ 技术栈

- **运行时**：Bun 1.3 + Node.js 20+
- **前端**：Next.js 15 (App Router) + React 19 + Tailwind CSS 3
- **类型**：TypeScript 5.8 (strict)
- **AI 后端**：SecondMe API（主，OAuth2 + SSE 流式） + DeepSeek（兜底）
- **认证**：OAuth2 Authorization Code Flow + CSRF state 校验
- **本地存储**：mentor JSON（静态）+ mentor_tokens.json（OAuth2 token，gitignore）

---

## 🔐 数据合规（项目灵魂）

| 原则 | 实现 |
|---|---|
| 本人授权 | 6 位学长学姐已书面授权，`consent_status: granted` |
| 数据最小化 | OAuth2 仅申请 `userinfo` + `chat.write` + `memory.read` 三个 scope |
| 可撤回 | `/api/auth/secondme/revoke` + UI 一键撤销 |
| 输出标识 | `/agent-workbench` 顶部合规水印：「AI 助手代为表达，非本人直接发言」 |
| 来源透明 | 演示绑定项目方账号的 mentor 卡片有橙色提示框，明确标识 |

详见 [`doc/01_项目说明书.md` 第 5 章](doc/01_项目说明书.md)。

---

## 📞 联系

- 项目仓库：https://github.com/fishine-cmd/REFUDAN
- 原始仓库：https://github.com/Wesleyyyyyy/REFUDAN
- 中期评审材料邮箱：`FudanAICS@163.com`

---

## 📜 License

MIT，见 [`LICENSE`](LICENSE)。
