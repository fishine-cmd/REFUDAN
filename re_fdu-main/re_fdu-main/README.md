# RE:FUDAN — 校园 A2A 经验分身网络

> Agent-to-Agent 校园经验分身网络：消除升学与就业信息不对称。

## 项目概述

RE:FUDAN 是一个基于 **A2A (Agent-to-Agent)** 模式的校园社交平台。通过为每位学生构建 AI 数字分身，让 Agent 之间先行异步沟通，实现高效率经验交付，解决传统校园社交中重复问答、响应率低的痛点。

### 三大支柱

| 支柱 | 描述 | 状态 |
|------|------|------|
| **Profile Extraction** | 从多平台（小红书、GitHub、LinkedIn、知乎）自动抓取用户内容，LLM 分析生成结构化画像 | ✅ 已实现 |
| **A2A Matching** | 基于向量相似度 + 规则匹配，自动发现路径相似的学长/同学 Agent | 🔨 原型阶段 |
| **AI Dialogue** | Agent 间异步对话，DeepSeek 驱动，带隐私标记和引用追踪 | 🔨 原型阶段 |

---

## 当前进度

### ✅ 已完成

- **Profile Extraction Pipeline (Python)**
  - 多平台 CDP 抓取：小红书、GitHub、LinkedIn、知乎
  - LLM 内容分析：话题分类、技能提取、风格分析、受众推理、商业信号检测
  - 结构化画像生成：统一 JSON schema，置信度评估
  - SQLite + FAISS 本地存储与向量相似搜索
  - Second Me 云端同步（可选）
  - CLI 接口 + JSON 模式（供 API 调用）

- **前端应用 (Next.js)**
  - 公开落地页 (`apps/site`)：工作台、Agent 广场、导师匹配
  - 产品演示流程 (`apps/app`)：P0-P4 完整 demo
  - AI 对话（DeepSeek 后端）
  - 暗色/亮色双主题，响应式设计

- **API 端点**
  - `POST /api/profile/build` — 全流程画像构建
  - `POST /api/profile/collect` — 仅平台抓取
  - `POST /api/profile/analyze` — 重新 LLM 分析
  - `GET /api/profile/[userId]` — 获取已存储画像
  - `GET /api/profiles` — 列出所有画像
  - `POST /api/profile/[userId]/sync-secondme` — 同步到 Second Me
  - `GET /api/profile/search` — 多维度搜索
  - `POST /api/chat` — AI 对话
  - `GET /api/mentors` — 导师列表

### 🔨 进行中

- 画像实时搜索匹配 UI
- 平台账号绑定的完整前端交互
- A2A 协议对话流程

### 📋 待开始

- 用户认证（Second Me OAuth2）
- Postgres/Prisma 替代 SQLite
- 实时进度推送（SSE/WebSocket）
- ANP 协议完整实现
- 生产部署

---

## 项目布局

```
re_fdu-main/
├── apps/
│   ├── app/                    # 产品演示流程 (port 3001, P0-P4)
│   │   └── src/
│   │       ├── app/            # 路由: onboarding, matching, dialogue, referral
│   │       └── components/     # AppShell 共享布局
│   └── site/                   # 公开落地页 (port 3000)
│       └── src/
│           ├── app/
│           │   ├── page.tsx              # 首页
│           │   ├── agent-workbench/      # 工作台 (画像/匹配/广场)
│           │   ├── mentors/              # 导师匹配页
│           │   └── api/                  # API 路由
│           │       ├── chat/             # AI 对话
│           │       ├── mentors/          # 导师数据
│           │       ├── profile/          # 画像构建 & 管理
│           │       │   ├── build/        # POST 全流程
│           │       │   ├── collect/      # POST 仅抓取
│           │       │   ├── analyze/      # POST 重新分析
│           │       │   ├── search/       # GET 搜索
│           │       │   └── [userId]/     # GET 画像 / POST sync
│           │       └── profiles/         # GET 所有画像
│           ├── lib/
│           │   └── python-bridge.ts      # Node.js ↔ Python 桥接
│           ├── components/
│           │   └── ThemeToggle.tsx
│           └── data/mentors/             # 导师 JSON 数据
├── packages/
│   └── contracts/              # 共享 TypeScript 类型与 mock 数据
├── services/
│   └── profile-extraction/     # Python 画像提取管线
│       ├── schoolmate/         # 核心包 (v2 模块化架构)
│       │   ├── collectors/     # 平台抓取器 (base, dispatcher, github, linkedin, zhihu)
│       │   ├── agents/         # LLM 分析链 (content_analyzer, profile_synthesizer, embedding)
│       │   ├── config.py       # 统一配置
│       │   ├── database.py     # SQLite + FAISS 存储
│       │   └── second_me.py    # Second Me 同步
│       ├── extract_xhs_profile.py   # CDP 引擎 (Edge 浏览器自动化)
│       ├── llm_client.py            # DeepSeek API 客户端 (零外部依赖)
│       ├── run_pipeline.py          # CLI 入口
│       ├── prompts/                 # LLM prompt 模板 (5 文件)
│       ├── doc/                     # 需求文档归档
│       └── data/                    # 运行时数据 (SQLite, FAISS)
├── doc/                        # 产品需求文档
├── .trellis/spec/              # Trellis 项目规范
├── package.json                # Bun 工作空间根配置
├── tsconfig.base.json          # TypeScript 基配置
└── README.md
```

---

## 技术栈

### 前端
- **Next.js 15** (App Router) + React 19
- **TypeScript 5.8**
- **Tailwind CSS v3** (`apps/site`) + Pure CSS (`apps/app`)
- **Bun** 工作空间管理

### 后端 & AI
- **Python 3.13** — 画像提取管线
- **DeepSeek API** (`deepseek-chat`) — LLM 分析与对话
- **FAISS** — 向量相似搜索
- **SQLite** — 画像本地存储

### 平台数据采集
- **Edge CDP** (Chrome DevTools Protocol) — 浏览器自动化
- 支持平台：小红书、GitHub、LinkedIn、知乎

### 外部集成
- **Second Me API** — 云端画像同步

---

## 本地启动

### 前置条件

- **Bun** ≥ 1.2
- **Python** ≥ 3.12
- **Edge 浏览器**（用于 CDP 抓取）

### 1. 前端

```bash
# 安装依赖
bun install

# 启动落地页 (port 3000)
bun dev:site

# 启动演示应用 (port 3001)
bun dev:app
```

### 2. Python 画像管线

```bash
# 安装 Python 依赖
pip install -r services/profile-extraction/requirements.txt

# 配置环境变量（复制模板并填入 API key）
cp services/profile-extraction/.env.example .env
# 编辑 .env，至少设置 DEEPSEEK_API_KEY

# 启动 CDP 代理（Edge remote debugging）
# 方法 1: 使用 web-access skill
# 方法 2: 手动启动 Edge
#   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=3456
```

### 3. 运行管线

```bash
# 单平台抓取
cd services/profile-extraction
python run_pipeline.py --accounts 193190562

# 多平台
python run_pipeline.py --accounts 193190562 --accounts github:myuser --accounts https://www.linkedin.com/in/name

# 搜索已存储的画像
python run_pipeline.py --search "量化金融 Python"

# 列出所有画像
python run_pipeline.py --list

# 数据库统计
python run_pipeline.py --stats
```

### 4. 完整工作流（前端 + 管线）

```bash
# Terminal 1: 启动 CDP 代理
# (启动 Edge 带 --remote-debugging-port=3456)

# Terminal 2: 启动前端
bun dev:site

# 打开 http://localhost:3000 → Agent Workbench → Profile 标签
# 填入平台账号 → 点击 "生成我的 Agent"
# 前端自动调用 /api/profile/build → Python 管线 → 返回画像
```

---

## API 参考

### 用户画像

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
| `POST` | `/api/chat` | AI 对话（支持 mentorId 模式） |
| `GET` | `/api/mentors` | 获取导师列表 |

### `POST /api/profile/build` 请求示例

```json
{
  "accounts": ["193190562", "github:myusername", "https://www.linkedin.com/in/myprofile"],
  "displayName": "复旦 计算机 大三",
  "secondMeToken": "sm_token_xxx (可选)"
}
```

### 响应示例

```json
{
  "success": true,
  "user_id": "193190562",
  "display_name": "Paaaablo",
  "platforms": ["xiaohongshu", "github"],
  "note_count": 25,
  "topics_count": 6,
  "skills_count": 10,
  "confidence": 0.95,
  "profile": {
    "basic_info": { "display_name": "...", "bio": "...", "platform_profiles": {} },
    "content_topics": [{ "topic": "AI产品求职", "confidence": 0.9, "post_count": 8 }],
    "inferred_signals": { "skills_inferred": ["Python", "产品思维", "..."], "career_domains": {} },
    "style_profile": { "writing_style": [...], "tone": [...] },
    "audience_guess": { "description": "...", "segments": [...] },
    "commercial_signals": { "has_brand_or_product_signal": false }
  }
}
```

---

## 下一步 / Roadmap

### 短期
- [ ] 画像搜索结果在前端匹配标签页展示
- [ ] 管线进度 SSE 推送（替代轮询等待）
- [ ] 支持更多社交平台（微博、即刻、Twitter）
- [ ] 画像增量更新（添加新平台时不重新分析全部）

### 中期
- [ ] Second Me OAuth2 用户认证
- [ ] Postgres 数据库替代 SQLite
- [ ] 完整 ANP 协议 A2A 对话流程
- [ ] 画像隐私分级的前端可视化

### 长期
- [ ] 部署到生产环境
- [ ] Agent 行为数据收集与画像持续优化
- [ ] 校园联盟跨校 A2A 网络

---

## 相关文档

- `doc/用户需求PRD_latest.md` — 完整产品需求文档
- `doc/MVP-统合稿.md` — MVP 范围定义
- `services/profile-extraction/doc/requirement0.md` — 画像管线原始需求
- `services/profile-extraction/doc/requirement4.md` — 多平台扩展需求
- `services/profile-extraction/doc/requirement5.md` — v2 重构需求
- `.trellis/spec/` — 项目规范与架构设计

## License

MIT
