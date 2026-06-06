# Phase 2: XHS（小红书）真实抓取实施

**日期**：2026-06-07
**分支**：`feat/secondme-integration`
**前置**：Phase 1 GitHub 端到端已通（commit `52df593` 起）

---

## 关键发现：缺失的执行底座

上游 README 自述"实际抓取链路无法稳定工作"是客气说法。事实是：

- `extract_xhs_profile.py` 把所有浏览器操作发送到 `http://localhost:3456` 的 REST 端点（`/new`、`/eval`、`/navigate`、`/scroll`、`/click`、`/back`、`/close`）
- 而 Edge 在 `--remote-debugging-port=3456` 上吐的是原生 CDP 协议（WebSocket），**根本不响应这些 REST 路径**
- 仓库里没有 HTTP→CDP 桥接代码
- 结论：现有抓取代码**完全跑不起来**，不是"不稳定"

Phase 2 不是"修 bug"——是**补全缺失的执行底座** + 重写 XHS 业务逻辑。

## 决策摘要

| 维度 | 决策 | 理由 |
|---|---|---|
| 浏览器控制底座 | Playwright sync_api + persistent_context | 业界标准，auto-wait 替代全仓 time.sleep，反反爬成熟，一个包搞定 |
| 测试目标账号 | XHS ID `95544127432`（用户自己） | 用户提供，5 条公开笔记，方便本人登录验证 |
| 登录策略 | 首次手动登录，cookie 落盘持久化复用 | XHS 内容必须登录，一次性 QR 扫码最直白 |
| 模块分层 | 新建 `schoolmate/browser.py` 抽离原语；XHS 业务搬到 `schoolmate/collectors/xhs_collector.py` | 解耦 XHS 业务与浏览器原语，让 linkedin/zhihu 共享底座 |
| linkedin/zhihu collector | 只改 import 不动 collect 业务（Phase 3/4 处理） | 最小侵入，保证 dispatcher 不崩 |

## 1. 模块分层

```
schoolmate/
├── browser.py                       新增。Playwright sync_api 单例 + 持久化 context + 7 原语
│
├── collectors/
│   ├── base.py                      不动
│   ├── dispatcher.py                注册 XHSCollector,旧的 XhsCollector 占位删除
│   ├── github_collector.py          Phase 1 已重写,不动
│   ├── xhs_collector.py             新增。XHS BaseCollector 实现,用 browser.py
│   ├── linkedin_collector.py        改 import: from extract_xhs_profile → from schoolmate.browser
│   └── zhihu_collector.py           改 import: 同上
│
└── (extract_xhs_profile.py 删除)
```

### 1.1 `schoolmate/browser.py` 接口

```python
# 同步 API,内部隐藏 playwright sync_api
from contextlib import contextmanager

USER_DATA_DIR = Path(DATA_DIR) / "browser_profile"

def get_context(*, headless: bool = True) -> BrowserContext:
    """获取持久化 context 单例。cookie 自动落盘到 USER_DATA_DIR。"""

def new_page(url: str | None = None, *, headless: bool = True) -> Page:
    """新建 tab,可选直接导航。"""

def navigate(page: Page, url: str, *, wait_until: str = "networkidle") -> None:

def eval_js(page: Page, script: str) -> Any:
    """page.evaluate(script) 的薄封装。"""

def scroll(page: Page, dy: int = 2000) -> None:

def click(page: Page, selector: str, *, timeout: int = 5000) -> None:

def go_back(page: Page) -> None:

def close(page: Page) -> None:

@contextmanager
def login_session(initial_url: str):
    """带头浏览器,导航到 initial_url,yield 给调用者等待 Enter,然后关闭。"""
```

设计要点：
- **不引入 asyncio**：用 `playwright.sync_api`,内部线程模型不暴露给 collector
- **单例 context**：避免每次 collect 都重启浏览器；用 module-level 变量缓存
- **headless 切换**：`--xhs-login` 模式用 headed,collect 模式用 headless
- **viewport 固定 1280×800**：模拟桌面用户

### 1.2 异常

```python
class LoginRequired(RuntimeError):
    """登录态失效,调用方应提示用户跑 --xhs-login。"""
```

## 2. XHS 抓取逻辑（`xhs_collector.py`）

### 2.1 入口

```python
class XHSCollector(BaseCollector):
    platform = "xiaohongshu"

    def collect(self, identifier: str, max_notes: int = 10) -> dict[str, Any]:
        ...
```

`identifier` 是纯数字 ID（如 `95544127432`）。URL 由 collector 内部拼：
`https://www.xiaohongshu.com/user/profile/{identifier}`

### 2.2 抓取流程

```
[Step 1] page = new_page(profile_url, headless=True)
         page.wait_for_load_state("networkidle", timeout=30000)

[Step 2] 登录态检测
         if eval_js(page, "!!document.querySelector('.login-container, [class*=login-modal]')"):
             raise LoginRequired("XHS cookie 已过期/未登录,请双击 xhs_login.bat 后重试")

[Step 3] 抓 profile header (单次 eval_js)
         {
           nickname:    .user-nickname / meta[og:title]
           bio:         .user-desc / .desc / [class*=description]
           avatar_url:  .user-avatar img[src] / .avatar img[src]
           followers:   .user-statistics span[正则匹配粉丝]
           following:   同上
           liked:       同上
         }

[Step 4] 滚动 3 次加载笔记列表
         for _ in range(3):
             scroll(page, dy=2000)
             time.sleep(random.uniform(1.5, 2.5))

[Step 5] 抓笔记卡片 (单次 eval_js,取前 max_notes 张)
         [
           { note_id, url, title, cover_url, like_count }
           ...
         ]

[Step 6] 对每张笔记 click → 等模态/页面 → 抓正文 → 关闭
         for card in cards:
             click(page, f'a[href*="{card.note_id}"]')
             page.wait_for_selector('.note-content, .content', timeout=10000)
             note_detail = eval_js(page, JS_EXTRACT_NOTE_BODY)
             notes.append(normalize_note({
                 ...card,
                 text: note_detail.text,
                 tags: note_detail.tags,
                 publish_time: note_detail.publish_time,
                 comment_count: note_detail.comments,
                 favorite_count: note_detail.collects,
             }))
             # 关 modal 或 go_back
             go_back(page) or close_modal
             time.sleep(random.uniform(2.0, 4.0))

[Step 7] close(page)

[Step 8] return base.py schema dict
```

### 2.3 反反爬

- 所有 sleep 用 `random.uniform`,不写死
- 顺序串行,不并发
- 不改 User-Agent（用 Playwright Chromium 默认，最不显眼）
- 滚动距离 2000±随机
- 不解析未渲染的 raw API（只看 DOM）

### 2.4 输出 schema

完全遵守 `base.py` 的 `BaseCollector` 规范：

```python
{
    "platform": "xiaohongshu",
    "input": {"identifier": "95544127432", "display_name_hint": None},
    "resolved_profile": {
        "nickname": "...",
        "bio": "...",
        "profile_url": "https://www.xiaohongshu.com/user/profile/95544127432",
        "avatar_url": "...",
        "followers": int | None,
        "following": int | None,
        "liked": int | None,
    },
    "notes": [normalize_note(...) × N],
    "diagnostics": {
        "notes_attempted": int,
        "notes_succeeded": int,
        "login_state": "valid",
    },
    "extraction_status": {
        "success": bool,
        "partial": bool,
        "failure_reason": str,
        "warnings": list[str],
    },
    "collected_at": iso8601,
}
```

## 3. 登录流程

### 3.1 一次性登录命令

`run_pipeline.py` 增加 `--xhs-login` flag：

```python
parser.add_argument("--xhs-login", action="store_true",
    help="一次性 XHS 登录: 启动带头浏览器,人工登录后按 Enter 保存 cookie")
```

行为：

```
if args.xhs_login:
    from schoolmate.browser import login_session
    with login_session("https://www.xiaohongshu.com") as page:
        print("请扫码或输入账号密码登录小红书", file=sys.stderr)
        print("完成后回到本窗口按 Enter 继续...", file=sys.stderr)
        input()  # 等待用户按 Enter
    print("✓ 登录态已保存到 data/browser_profile/", file=sys.stderr)
    return 0
```

### 3.2 双击启动器

新增 `services/profile-extraction/xhs_login.bat`：

```bat
@echo off
setlocal
cd /d "%~dp0"
python run_pipeline.py --xhs-login
pause
```

同样 GBK + CRLF 转码（参考 项目记忆 [[project-refudan-windows-bat-encoding]]）。

### 3.3 cookie 失效

- collector 抛 `LoginRequired` 时,`run_pipeline.py` 捕获 → `--json-output` 模式下输出 `{"success": False, "error": "XHS 登录态失效,请双击 services/profile-extraction/xhs_login.bat 重新登录"}`
- API route 透传给前端 → 用户看到清晰中文指引

### 3.4 Web 流程不嵌入登录

- Next.js 调 Python 是无 stdin 子进程
- 把浏览器从服务器端弹给用户不直观
- 一次性命令行操作（双击 → 扫码 → 关）最直白

## 4. LinkedIn / 知乎 collector 处理

### 4.1 改 import

```diff
# linkedin_collector.py, zhihu_collector.py
- from extract_xhs_profile import create_tab, close_tab, navigate, eval_js
+ from schoolmate.browser import new_page as create_tab, close, navigate, eval_js
```

兼容别名（`new_page as create_tab` 和 `close as close_tab`）让两个 collector 的 collect() 方法体内调用不需要改。

### 4.2 collect 业务

**不动**。这两个 collector 的实际抓取代码 Phase 3/4 才修。Phase 2 只保证：
- import 不崩
- 实例化不崩
- `collect()` 调用会因为选择器对不上 / 真实 DOM 不同而失败,但抛的是带有 `warnings` 的标准 `empty_result(...)`,不是堆栈崩溃

### 4.3 module-level WIP 标记

每个文件顶部加注释：

```python
# WIP: implementation pending Phase 3 (knzhu) / Phase 4 (linkedin).
# DOM selectors and flow are unverified — real scraping will likely return empty_result().
```

## 5. requirements.txt 改动

追加：
```
playwright>=1.40
```

`pip install playwright` 后还需要 `playwright install chromium`（~150MB）下载浏览器二进制。启动器 Phase 2 改动要负责这步：检测 chromium 是否装了，没装就运行 `playwright install chromium`。

## 6. 启动器（`启动.bat`）改动

Phase 0 的 6 步流程改 7 步：

```
[1/7] Bun
[2/7] 前端依赖
[3/7] Python
[4/7] Python 依赖 (新增 playwright)
[5/7] Playwright Chromium  ← 新增
       python -c "from playwright.sync_api import sync_playwright; ..." 探测
       未装则 python -m playwright install chromium
[6/7] Edge CDP  ← 可保留也可删除。建议保留,知乎/LinkedIn 后续不一定也走 Playwright
       (但 GitHub + XHS 都不再依赖 Edge CDP)
[7/7] site + app dev servers
```

文档里说明 Edge CDP 这一步在 Phase 2 后**纯属冗余**,Phase 3 决定知乎走 Playwright 还是 Edge CDP 时再决定去留。

## 7. 验收标准

完成 Phase 2 时这些必须为真：

1. ✅ `schoolmate/browser.py` 存在，`python -c "from schoolmate.browser import new_page"` 不报错
2. ✅ `schoolmate/collectors/xhs_collector.py` 存在，遵守 `BaseCollector` 接口（dispatcher 注册不报错）
3. ✅ `services/profile-extraction/xhs_login.bat` 双击能起带头浏览器到 xiaohongshu.com，等 Enter
4. ✅ 首次跑 `--xhs-login` 走完后 `data/browser_profile/` 目录里有 cookie 文件落盘
5. ✅ 登录完成后 `python run_pipeline.py --accounts 95544127432 --no-sync` 应该：
   - Stage 1 抓到 5 条笔记
   - 每条笔记有非空 title、text
   - Stage 2 LLM 分析返回非空 topics / skills
   - Stage 3 confidence > 0.5
   - Stage 4 写入 DB + FAISS
   - EXIT 0
6. ✅ Web 端跑通：浏览器 /agent-workbench → Profile → 输入 `95544127432` → 5-30 秒后看到含真实小红书数据的 profile JSON
7. ✅ GitHub 路径不破：`github:torvalds` 单独跑或与 XHS 一起跑，仍能产出 Phase 1 同等结果
8. ✅ SecondMe OAuth2 不破：`/mentor-onboard` 仍能授权
9. ✅ LinkedIn / 知乎账号路径：填了能看到"WIP, Phase 3/4 待实施"消息，不是堆栈崩溃

## 8. 不在 Phase 2 范围

- LinkedIn / 知乎 的真实抓取（Phase 3/4）
- 笔记图片 OCR、视频转录
- 笔记数 > 30 的虚拟列表分页
- Cookie 失效自动检测+刷新（手动重跑 xhs_login）
- 笔记内容的去 emoji / 去广告标记 等清洗

## 9. 交付物清单

新增：
- `services/profile-extraction/schoolmate/browser.py`
- `services/profile-extraction/schoolmate/collectors/xhs_collector.py`
- `services/profile-extraction/xhs_login.bat`
- `docs/superpowers/specs/2026-06-07-phase2-xhs-design.md`（本文档）

修改：
- `services/profile-extraction/requirements.txt`（加 playwright）
- `services/profile-extraction/run_pipeline.py`（加 --xhs-login）
- `services/profile-extraction/schoolmate/collectors/dispatcher.py`（注册 XHSCollector）
- `services/profile-extraction/schoolmate/collectors/linkedin_collector.py`（改 import）
- `services/profile-extraction/schoolmate/collectors/zhihu_collector.py`（改 import）
- `启动.bat`（加 Playwright Chromium 检测步骤）
- `README.md`（加 XHS 登录章节）

删除：
- `services/profile-extraction/extract_xhs_profile.py`（业务搬到 xhs_collector.py，原语搬到 browser.py）

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| XHS DOM selectors 实际跑起来对不上 | 用 `python -m playwright codegen https://www.xiaohongshu.com` 实操确认选择器；多组备选 selector |
| 笔记点击后是模态而非新页 | 都 try：先尝试 `.modal-close button` 关闭，失败再 `go_back` |
| Playwright Chromium 下载慢/失败 | 启动器报错不 exit，提示手动 `python -m playwright install chromium` |
| Cookie 过期 user 没看到提示 | LoginRequired 错误消息走整条链路：collector → run_pipeline 顶层 → JSON → API route → 前端 errors 数组 |
| XHS 反爬升级（验证码、风控页）| 暂时无对策，记录 warnings + 返回 empty_result；用户可以稍后再试 |
| 中文路径 + Playwright 是否兼容 | Playwright 在 Windows 上 Chromium 走 NT API，原生支持 Unicode 路径，预计无问题；但需要在中文路径下验证一次 |
