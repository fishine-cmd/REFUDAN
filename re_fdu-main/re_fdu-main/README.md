# RE:FUDAN — 校园 A2A 经验分身网络

> Agent-to-Agent 校园经验分身网络：消除升学与就业信息不对称。

---

## ⚠️ 当前分支说明

**你正在浏览 `experiment/profile-extraction` 分支** —— 这是一个用于**调试 Profile Extraction Pipeline** 的实验性分支，**不是项目主线**。

| 我想看 | 切到这条分支 |
|---|---|
| **中期评审版本**（SecondMe OAuth2 集成 + 合规架构） | [`feat/secondme-integration`](../../tree/feat/secondme-integration) |
| **Profile Extraction 调试**（本分支，含多平台爬取实验） | `experiment/profile-extraction` |
| **上游原始版本** | [`main`](../../tree/main) |

切换命令：
```bash
git switch feat/secondme-integration   # 评审版本
git switch experiment/profile-extraction  # 调试版本（本分支）
```

> **本分支状态**：Profile Extraction Pipeline 处于 WIP（work-in-progress）阶段，实际抓取链路尚未跑通，仅作技术实验保存。社媒抓取相关合规设计将在中期评审后讨论。

---

## 项目概述

RE:FUDAN 是一个基于 **A2A (Agent-to-Agent)** 模式的校园社交平台：通过为每位学生构建 AI 数字分身，让 Agent 之间先行异步沟通，实现高效率经验交付，解决传统校园社交中重复问答、响应率低的痛点。

### 三大支柱

| 支柱 | 描述 | 状态 |
|------|------|------|
| **SecondMe Integration** | 学长学姐通过 SecondMe 平台训练个人分身，OAuth2 授权后由 RE:FUDAN 调用本人分身进行流式对话 | ✅ 已在 `feat/secondme-integration` 实现 |
| **Profile Extraction** | 从多平台聚合个人公开内容，LLM 分析生成结构化画像 | 🧪 实验中（本分支，未完成） |
| **A2A Matching & Dialogue** | 基于路径相似度的雷达图匹配 + DeepSeek 兜底对话 | 🔨 已在 `feat/secondme-integration` 原型化 |

---

## 本分支的内容（Profile Extraction）

### ✅ 代码骨架已完成（功能 WIP）

- **Profile Extraction Pipeline (Python)**
  - 多平台抓取脚手架：小红书、GitHub、LinkedIn、知乎（实际数据采集尚未完成）
  - LLM 内容分析骨架：话题分类、技能提取、风格分析、受众推理、商业信号检测
  - 结构化画像 JSON schema 设计
  - SQLite + FAISS 本地存储 / 向量相似搜索原型
  - Second Me 云端同步接口（占位）
  - CLI 接口 + JSON 模式（供 Next.js API 调用）

- **前端 API 端点（同事整合）**
  - `POST /api/profile/build` — 全流程画像构建
  - `POST /api/profile/collect` — 仅平台抓取
  - `POST /api/profile/analyze` — 重新 LLM 分析
  - `GET /api/profile/[userId]` — 获取已存储画像
  - `GET /api/profiles` — 列出所有画像
  - `POST /api/profile/[userId]/sync-secondme` — 同步到 Second Me
  - `GET /api/profile/search` — 多维度搜索

### 🧪 已知问题（实验中）

- 实际爬取链路在当前代码下**无法稳定工作**，不能真正提取他人信息
- 缺少 `services/profile-extraction/.env.example`，环境变量配置需要参考 `schoolmate/config.py`
- 平台 ToS / robots.txt 遵守 + 用户授权检查机制**尚未实现**
- 此分支不会进入中期评审材料

---

## 合规免责声明

本分支为**内部技术实验**，旨在探索"基于用户主动提供的公开账号 ID + 本人授权下"的多平台经验聚合可行性。当前状态：

- **不进行任何未经授权的第三方信息采集**
- **任何实际数据抓取必须在获得本人明确同意 + 平台 ToS 允许的前提下进行**
- **正式产品方向**以 [`feat/secondme-integration`](../../tree/feat/secondme-integration) 分支为准——通过 SecondMe 平台「本人训练 + 本人授权 + 本人可撤回」的合规路径实现校园经验分身

Profile Extraction 的合规化路径（含 PIPL / 民法典 1019 / 生成式 AI 服务管理办法对齐）将在中期评审通过后由小组讨论决定。

---

## 项目布局

```
re_fdu-main/re_fdu-main/        ← 实际项目根（仓库双层嵌套来自上游）
├── apps/
│   ├── app/                    # 产品演示流程 (port 3001, P0-P4)
│   └── site/                   # 公开落地页 (port 3000)
│       └── src/
│           ├── app/
│           │   ├── page.tsx
│           │   ├── agent-workbench/
│           │   ├── mentors/
│           │   └── api/
│           │       ├── chat/             # DeepSeek 对话（兜底）
│           │       ├── mentors/          # mentor 列表
│           │       ├── profile/          # ★ 本分支新增：画像构建 & 管理
│           │       └── profiles/         # ★ 本分支新增：所有画像列表
│           ├── lib/
│           │   └── python-bridge.ts      # ★ 本分支新增：Node ↔ Python 桥接
│           ├── components/
│           └── data/mentors/             # 6 份 mentor JSON
├── packages/contracts/         # 共享 TS 类型 + YAML 接口
├── services/                   # ★ 本分支新增
│   └── profile-extraction/
│       ├── schoolmate/
│       │   ├── collectors/     # github / linkedin / zhihu collector + base/dispatcher
│       │   ├── agents/         # content_analyzer / profile_synthesizer / embedding
│       │   ├── config.py
│       │   ├── database.py
│       │   └── second_me.py
│       ├── extract_xhs_profile.py   # 小红书 CDP 抓取（独立脚本，不在 schoolmate/collectors）
│       ├── llm_client.py
│       ├── run_pipeline.py
│       ├── prompts/                 # 5 份 LLM prompt 模板
│       ├── doc/
│       └── data/                    # SQLite + FAISS 运行时数据
├── doc/                        # 产品需求 + SecondMe 集成设计 + 中期材料
└── README.md                   # 本文件
```

---

## 技术栈

### 前端
- **Next.js 15** (App Router) + React 19
- **TypeScript 5.8 (strict)**
- **Tailwind CSS v3** (`apps/site`) + Pure CSS (`apps/app`)
- **Bun** 工作空间管理

### Python 管线（本分支）
- **Python 3.12+** — 画像提取管线
- **DeepSeek API** — LLM 分析
- **FAISS** — 向量相似搜索
- **SQLite** — 画像本地存储
- **Edge CDP** (Chrome DevTools Protocol) — 浏览器自动化（实验中）

### 外部集成
- **SecondMe API** — `feat/secondme-integration` 分支已完成 OAuth2 + 流式对话集成
- **DeepSeek** — 兜底 LLM

---

## 本地启动

### 前置条件

- **Bun** ≥ 1.3
- **Node.js** ≥ 20
- **Python** ≥ 3.12（仅本分支需要）
- **Edge / Chrome 浏览器**（仅本分支 CDP 抓取需要）

### 1. 前端

```bash
# 装依赖
cd re_fdu-main/re_fdu-main
bun install

# 启动落地页（port 3000）
bun dev:site

# 可选：启动演示应用（port 3001）
bun dev:app
```

### 2. Python 画像管线（本分支特有）

```bash
# 装依赖
bun run pipeline:setup
# 等价于：pip install -r services/profile-extraction/requirements.txt

# 配置环境变量（同事尚未提供 .env.example，需参考 schoolmate/config.py）
# 至少需要设置 DEEPSEEK_API_KEY

# 启动 Edge 远程调试（CDP 抓取小红书需要）
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=3456
```

### 3. 运行管线 CLI

```bash
cd services/profile-extraction

# 单平台抓取
python run_pipeline.py --accounts 193190562

# 多平台
python run_pipeline.py --accounts github:myuser --accounts https://www.linkedin.com/in/name

# 搜索已存储画像
python run_pipeline.py --search "量化金融 Python"

# 列出所有画像
python run_pipeline.py --list

# 数据库统计
python run_pipeline.py --stats
```

### 4. 完整工作流（前端调用 Python 管线）

```bash
# Terminal 1: 启动 Edge CDP
# Terminal 2: bun dev:site
# 浏览器 → http://localhost:3000/agent-workbench → Profile 标签
# 填入平台账号 → 点 "生成我的 Agent"
# 前端经 lib/python-bridge.ts 调用 /api/profile/build → Python 管线 → 返回画像
```

> ⚠️ 当前实际抓取链路存在问题，可能在 collector 或 CDP 连接阶段失败。

---

## API 参考

### 用户画像（本分支）

| Method | Endpoint | 描述 |
|--------|----------|------|
| `POST` | `/api/profile/build` | 全流程：抓取 → 分析 → 合成 → 存储 |
| `POST` | `/api/profile/collect` | 仅平台抓取（不分析） |
| `POST` | `/api/profile/analyze` | 对已有画像重新运行 LLM 分析 |
| `GET` | `/api/profile/[userId]` | 获取存储的画像 JSON |
| `GET` | `/api/profiles` | 列出所有已存储画像 |
| `POST` | `/api/profile/[userId]/sync-secondme` | 同步到 Second Me 云平台 |
| `GET` | `/api/profile/search` | 搜索画像 (`?q=`, `&industry=`, `&skill=`, `&grade=`) |

### 对话与数据

| Method | Endpoint | 描述 |
|--------|----------|------|
| `POST` | `/api/chat` | AI 对话（DeepSeek 兜底；SecondMe 路径在 `feat/secondme-integration` 分支） |
| `GET` | `/api/mentors` | 获取 mentor 列表 |

### `POST /api/profile/build` 请求示例

```json
{
  "accounts": [
    "193190562",
    "github:myusername",
    "https://www.linkedin.com/in/myprofile"
  ],
  "displayName": "复旦 计算机 大三",
  "secondMeToken": "sm_token_xxx (可选)"
}
```

---

## 下一步 / Roadmap

### 短期（评审通过后）
- [ ] 小组讨论 Profile Extraction 的合规化路径
- [ ] 实现"账号必须经本人确认"的前置授权检查
- [ ] 平台 ToS / robots.txt 遵守机制
- [ ] 补齐 `services/profile-extraction/.env.example`
- [ ] 修复实际抓取链路的稳定性问题

### 中期
- [ ] 画像实时搜索匹配 UI
- [ ] 管线进度 SSE 推送（替代轮询等待）
- [ ] Postgres 替代 SQLite

### 长期
- [ ] 完整 ANP 协议 A2A 对话流程
- [ ] SecondMe 集成（已在 `feat/secondme-integration` 完成）与 Profile Extraction 的合并方案
- [ ] 生产部署 + HTTPS + 用户认证

---

## 团队与链接

- 主仓库（fork）：https://github.com/fishine-cmd/REFUDAN
- 上游原仓：https://github.com/Wesleyyyyyy/REFUDAN
- SecondMe 官方文档：https://develop-docs.second.me/zh/docs

## License

MIT，见 [`LICENSE`](LICENSE)。
