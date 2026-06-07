# SchoolMate - 校园 A2A 经验分身网络

## 项目概述

基于 SecondMe 平台的第三方应用。通过 Agent-to-Agent (A2A) 模式，打造校园版 LinkedIn 的 AI 经验分身网络，消除升学（保研、申请）与就业信息不对称。

**核心痛点**: 传统校园社交平台响应率低、信息重复率高，优秀学长姐被重复询问相同基础问题。

**解决方案**: A2A 异步信息桥梁——通过 AI Agent 之间的先行预沟通，实现高效率经验交付。

## 技术栈

- SecondMe OAuth2 登录
- SecondMe Open APIs (Agent Memory, Act, Chat, Note)
- Next.js 14+ (App Router) + TypeScript + Tailwind CSS

## 当前进度

### Phase 1-2: App 凭证 (进行中)
- [ ] secondme-dev-assistant skill 已安装到 `.claude/skills/`
- [ ] 用户需提供 App Info (已有 Client ID 和 Secret，待填入)
- [ ] Client Secret 存储到 `.secondme/client_secret`

### Phase 3: 需求规划 (待进行)
### Phase 4: OAuth/API 实现指导 (待进行)
### Phase 5: MCP/Integration (待进行)

## 需要的 Scopes

| Scope | 用途 |
|-------|------|
| userinfo | 用户身份/资料 |
| chat.read + chat.write | A2A Agent 间异步消息 |
| agent_memory | 经验知识库存储与检索 |
| act | 结构化行为流（匹配/判断） |
| note.write | 高频问答沉淀为笔记 |

## 下次对话需继续的事项

1. 收集用户的 App Info（App Name、Client ID、Client Secret、Redirect URIs、Scopes）
2. 将 Client Secret 安全存储到项目 `.secondme/` 目录
3. 确认是否需要追加新的 Scopes
4. 进入 Phase 3：细化产品需求（用户角色、核心功能流程、设计偏好）
5. 生成项目脚手架方案

## 项目结构 (v2 — requirement5)

```
re_fdu/
├── schoolmate/                        # 主 Python 包
│   ├── __init__.py
│   ├── config.py                      # 统一配置 (API key, 路径)
│   ├── database.py                    # SQLite + FAISS 向量数据库
│   ├── profile_schema.py              # Pydantic 数据模型 (再导出)
│   ├── profile_builder.py             # 多源 Profile 构建器 (再导出)
│   ├── second_me.py                   # Second Me 同步 (一键备份)
│   ├── collectors/                    # 多平台采集器
│   │   ├── __init__.py
│   │   ├── base.py                    # 基类 + 平台自动识别
│   │   ├── github_collector.py
│   │   ├── linkedin_collector.py
│   │   ├── zhihu_collector.py
│   │   └── dispatcher.py             # 并行调度 + 自动分发
│   └── agents/                        # 分析 Agent
│       ├── __init__.py
│       ├── content_analyzer.py        # LLM 内容分析 (5 维度)
│       ├── profile_synthesizer.py     # Profile 聚合合成
│       └── embedding.py              # 向量 Embedding 生成
├── run_pipeline.py                    # 统一流水线入口 (v2)
├── extract_xhs_profile.py             # CDP 底层 (XHS)
├── note_collector.py                  # XHS NoteCollector
├── llm_client.py                      # DeepSeek API 客户端
├── prompts/                           # LLM prompt 模板
├── data/                              # 数据库文件 (gitignore)
│   ├── schoolmate.db                  # SQLite 数据库
│   └── profiles.faiss                 # FAISS 向量索引
└── outputs/                           # 遗留 JSON 输出
```

### 流水线

```
用户输入 (任意平台账号) -> Dispatcher (自动识别 + 并行采集)
  -> ContentAnalyzer (LLM 分析) -> ProfileSynthesizer (聚合)
  -> EmbeddingGenerator -> Database (SQLite + FAISS) -> (可选) Second Me
```

### 关键特性
- **Identifier 泛化**: 输入任意数量、任意平台账号,自动识别平台类型
- **并行抓取**: ThreadPoolExecutor 同时采集所有账号
- **统一 API Key**: 所有 LLM 分析共用一个 DeepSeek API key
- **数据库存储**: SQLite 存储最终 profile,FAISS 存储向量 embedding
- **增量更新**: 用户后续提供新平台账号时自动合并 profile
- **Second Me 同步**: 一键同步 profile 到 Second Me 云端备份

## 关键文件

- 流水线入口: `run_pipeline.py`
- 配置中心: `schoolmate/config.py`
- 数据库: `schoolmate/database.py`
- Skill 定义: `.claude/skills/secondme-dev-assistant/SKILL.md`
- SecondMe 开发平台: https://develop.second.me
- API 文档: https://develop-docs.second-me.cn/zh/docs
