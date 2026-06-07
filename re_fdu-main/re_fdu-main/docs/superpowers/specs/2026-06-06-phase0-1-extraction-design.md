# Phase 0 + Phase 1: 启动器升级 + GitHub 端到端走通

**日期**：2026-06-06
**分支**：`feat/secondme-integration`
**前置**：移植 commit `f5e6f34`、`4927fb6` 已落盘；`services/profile-extraction/` 和 `api/profile/*` 路由就位

---

## Phase 0：基础设施（~1 小时）

### 0.1 启动.bat 升级

在现有 4 步流程基础上插入：

```
新步骤[2.5/N] 检测 Python 3.12+
  where python >nul 2>&1 → 不在则提示用户去 python.org 装,pause
  python --version → 解析版本号,< 3.12 则提示升级

新步骤[2.6/N] 检测 Python 依赖
  python -c "import faiss, requests, pydantic, numpy" 2>&1
  失败 → cd services/profile-extraction && pip install -r requirements.txt

新步骤[3.5/N] 启 Edge CDP
  检测端口 3456 是否已监听:
    powershell -Command "Test-NetConnection localhost -Port 3456 -InformationLevel Quiet"
  未监听 → start "Edge CDP (3456)" "msedge.exe" --remote-debugging-port=3456 --user-data-dir="%USERPROFILE%\.edge-cdp-profile"
  独立 user-data-dir,避免与日常 Edge 进程冲突
```

**编辑后必须再次走 GBK + CRLF 转码**（同上一 spec 经验）。

### 0.2 README 补 Python 前置

在 `🚀 三分钟跑起来` 节下增加 Python 项。

### 0.3 验收

- 双击 启动.bat：依次起 Bun deps / Edge CDP / site / app
- 命令行手动 `cd services/profile-extraction && python run_pipeline.py --stats` 应返回 JSON（DB 可能为空）

---

## Phase 1：GitHub 端到端（~3-5 小时）

### 1.1 重写 `github_collector.py` 为 REST API

**当前问题**：依赖 `from extract_xhs_profile import create_tab, ...`，整个跑的是 CDP 浏览器，需要 Edge 开着。GitHub 有官方公开 API，没必要。

**新实现要点**：
- 用 `requests`（已在 requirements.txt）
- 三个端点：
  - `GET https://api.github.com/users/{user}` — 头像、bio、location、followers
  - `GET https://api.github.com/users/{user}/repos?sort=updated&per_page={max_repos}` — 仓库列表
  - `GET https://api.github.com/repos/{owner}/{repo}/readme` — README（base64，需解码）
- 可选 `GITHUB_TOKEN` 环境变量：未授权 60 req/h，授权后 5000 req/h
- 保留输出 schema 与 CDP 版完全一致：`{platform, identifier, notes[]}`，调用方零改动
- 错误：404 用户不存在 → `empty_result`；429 限流 → 重试一次 + 警告

**契约**：
```python
class GitHubCollector(BaseCollector):
    platform = "github"
    def collect(self, username: str, max_repos: int = 10,
                max_readme_chars: int = 5000) -> dict[str, Any]: ...
```

返回 dict 结构与现有 collectors 一致（`base.py` 的 `BaseCollector` 约束）。

### 1.2 前端：profile-build 表单

**当前问题**：`feat/secondme-integration` 分支的 `agent-workbench/page.tsx` 没有平台账号输入字段，无法触发 `/api/profile/build`。

**实施**：
- 从 experiment 分支拿 4 个状态字段（xhsId, githubUser, linkedinUrl, zhihuId）+ 完整的 async handleGenerate
- 但**不要**整体覆盖 `page.tsx`——这个分支的 page.tsx 在其他方面有自己的 SecondMe 集成代码，不能丢
- 做法：精准地把字段、表单 JSX、async handleGenerate 增量插入

**Profile 页核心结构**：
```
[简历上传 + 简历文本框]   ← 现有
[学校 / 专业 / GPA / 目标]  ← 现有
[平台账号 4 输入框]        ← 新增
  小红书ID:  ____
  GitHub:    ____
  LinkedIn:  ____
  知乎ID:    ____
[生成我的 Agent 按钮]      ← 触发改 async handleGenerate
[生成结果展示卡]            ← 新增,显示返回的 profile JSON
```

`handleGenerate` 行为：
- 至少填 1 个平台账号 → 调 `/api/profile/build` 真流程
- 全空 → 走原有 mock 流程（保留旧行为）

### 1.3 端到端联调

测试路径：
1. 启动.bat 双击启
2. 浏览器进 `/agent-workbench` → Profile 标签
3. 填 GitHub 用户名（例如自己的）
4. 点"生成我的 Agent"
5. 观察 Python 管线日志（在 cmd 窗口里）
6. 等待返回 → 前端展示 profile JSON
7. `python run_pipeline.py --list` 验证 DB 落了记录

**预期产出**：包含 user_overview、skills、style、commercial_signals 的真实 profile。

### 1.4 验收

- ✅ GitHub 用户名 → 真 profile，不是 mock
- ✅ Profile 落进 `services/profile-extraction/data/profiles.db`
- ✅ FAISS 索引可搜索
- ✅ XHS/知乎/LinkedIn 字段在前端能填，但提交时跑到对应 collector 后明确返回"WIP，Phase 2-4 实施"警告
- ✅ SecondMe OAuth2 流程（feat/secondme-integration 自带）未被破坏：`/mentor-onboard` 仍能授权

---

## 不在本 session 范围

- XHS/知乎/LinkedIn 的 CDP 链路修复 → Phase 2-4
- LLM prompt 优化 → 暂用现有
- Profile 搜索 UI → 现有 API 已能查，前端 UI 留给后续
- 与 SecondMe 画像数据融合 → 单独议题

## 风险与对策

| 风险 | 对策 |
|---|---|
| Python 依赖装失败（特别是 faiss-cpu） | 启动器仅 echo 错误,不 exit,允许用户先用 GitHub-only 路径 |
| GitHub API 限流 | 文档加一条:配 GITHUB_TOKEN env var |
| 前端表单插入破坏 secondme 现有功能 | 增量编辑,不替换整文件;集成后人肉点一遍 mentor-onboard 验证 |
| Edge CDP 端口冲突 | 检测端口已监听就跳过启动 |
