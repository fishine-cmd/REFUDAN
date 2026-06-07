# 一键启动改造（Windows 双击运行）

**日期**：2026-06-06
**适用分支**：`experiment/profile-extraction`（本仓库当前分支）
**目标**：让 RE:FUDAN 的两个 Next.js 前端应用无需命令行即可运行，并把改动写进 README。

---

## 1. 范围

**包含**：
- 前端 `apps/site`（端口 3000）和 `apps/app`（端口 3001）两个 Next.js 应用的一键启动
- 缺失运行时（Bun）的自动安装
- 缺失依赖（`node_modules`）的自动安装
- 启动后自动打开默认浏览器到 `http://localhost:3000`
- README.md 中新增"一键启动"章节

**不包含**：
- `services/profile-extraction` Python 管线（上游 README 自述实际抓取链路 WIP、无法稳定工作，纳入价值低）
- Edge CDP 远程调试启动
- 跨平台支持（仅 Windows；macOS/Linux 不在本期）
- 生产构建（决定用 dev 模式，避免 TS 严格检查导致 build 阻断）
- 停止应用的自动化脚本（手动关窗口，避免 `taskkill` 误杀其他 Bun 进程）

## 2. 决策摘要

| 维度 | 决策 | 理由 |
|---|---|---|
| 覆盖范围 | 仅前端两个 Next.js 应用 | Python 管线 WIP，纳入无价值 |
| 运行时假设 | 检测 + 自动装 Bun | 拿到代码的人不一定预装 Bun |
| 运行模式 | 开发模式（`bun dev:site` + `bun dev:app`） | 不受 TS 严格检查阻断；与现状一致 |
| 启动器形态 | 单 `.bat` 文件 | 最薄；不引入 PowerShell 执行策略问题 |
| 启动器位置 | `re_fdu-main/re_fdu-main/启动.bat`（真项目根） | 与 `package.json` 同级，`cwd` 正确 |
| README 处理 | 新增"一键启动"节，**保留**原"本地启动"节 | 命令行流程对开发者仍有用 |

## 3. 启动脚本（`启动.bat`）行为

### 3.1 执行流程

```
[Step 1] cd 到脚本所在目录
[Step 2] 检测 bun
         where bun >nul 2>&1
         ├─ 未找到 → 调 PowerShell 跑 `irm bun.sh/install.ps1 | iex`
         │           把 %USERPROFILE%\.bun\bin 加入当前会话 PATH
         │           再次 where bun；仍失败 → 提示并 pause（不退出）
         └─ 找到   → 跳过
[Step 3] 检测依赖
         if not exist "apps\site\node_modules\next"
         ├─ 缺失 → bun install
         │         if errorlevel 1 → 提示并 pause（不退出）
         └─ 已装 → 跳过
[Step 4] start "RE:FUDAN site (3000)" cmd /k "bun --cwd apps/site run dev"
[Step 5] start "RE:FUDAN app (3001)"  cmd /k "bun --cwd apps/app run dev"
[Step 6] timeout /t 6 /nobreak >nul
[Step 7] start "" "http://localhost:3000"
[Step 8] 主窗口打印停止指引并 pause
```

### 3.2 关键技术细节

- **依赖探针用 `apps/site/node_modules/next` 而非根 `node_modules`**
  本仓库的 `node_modules` 已被装在 per-package 层（不是 hoist 到根），用根目录做探针会误判为未装。
- **`cmd /k`（不是 `/c`）**
  Next.js 退出后子窗口留着，方便看 EADDRINUSE 等错误。
- **不自动 `taskkill`**
  避免误杀其他 Bun 项目；用户手动关两个窗口即停。
- **不动 `apps/site/.env.local`**
  已存在 `DEEPSEEK_API_KEY` 等条目，假设用户自管。
- **中文状态行**
  脚本里每个阶段 `echo` 一行中文（`[1/4] 正在检查 Bun...` 等），让用户看到进度。
- **文件编码必须为 GBK / CP936（无 BOM），行结尾必须 CRLF**
  cmd.exe 在中文 Windows 上按系统 ACP（936）解析 .bat。两条硬约束：
  1. 编码必须 GBK——UTF-8 会让中文全乱码
  2. 行结尾必须 CRLF（`0D 0A`）——LF-only 在 `if (...)` 块里会让 cmd 解析器错位，之后整脚本崩
  脚本里**不要**写 `chcp 65001`——文件已是 GBK，控制台默认也是 GBK，切到 UTF-8 反而会再次错位。
  用 Claude 的 Write 工具保存后（默认 UTF-8 + LF），需要 PowerShell 一次性修两项：
  ```powershell
  $c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
  $c = ($c -replace "`r`n", "`n") -replace "`n", "`r`n"
  [System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::GetEncoding(936))
  ```
- **`if (...)` 块里 echo 的内容不能含未转义括号**
  即使 `(3000)` 这种被引号包着的也算坑——`echo   缺少依赖(首次约 1-2 分钟)...` 里的 `)` 会被当作外层 `if (` 的提前闭合。写成 `首次约 1-2 分钟,...` 或用 `^(` `^)` 转义。
- **不要用 `bun --cwd <path> run <script>` 配合 `cmd /k`**
  `cmd /k "bun --cwd apps/site run dev"` 经过 cmd 的引号剥离规则后，bun 收到的参数可能错位（`run` 后面变空）。
  改用 `cmd /k "cd /d %~dp0apps\site && bun run dev"`——先 cd 再 bun run，跨 bun 版本最稳。

### 3.3 故障处理矩阵

| 失败场景 | 现象 | 脚本动作 |
|---|---|---|
| Bun 安装失败 | 二次 `where bun` 仍失败 | 中文错误 + `pause`，不 exit；用户截图反馈 |
| `bun install` 失败 | 退出码非 0 | 中文错误 + `pause`，不 exit |
| 端口被占 | 子窗口 Next.js 报 EADDRINUSE | 不拦截；子窗口可见，引导查 README "常见问题" |
| 离线 / PS 策略禁用 | PS 命令直接报错 | 不兜底；README 注明手动从 bun.sh 装 |
| 依赖装一半坏掉 | `bun install` 不报错但缺包 | 不自动 `rm`；README 给出手动清理路径 |

## 4. README.md 改动

### 4.1 改动位置

在原 `## 本地启动` 节（约 146 行）的 `---` 分隔符**之后**、原节标题**之前**插入新节。原节标题改为 `## 本地启动（命令行/进阶）`。

### 4.2 新增内容

完整文本（待写入 README）：

```markdown
## 🚀 一键启动（Windows）

> 给不想碰命令行的人。前端两个应用一键起，全程不需要打字。

**做法**：双击项目根目录的 `启动.bat`。

**脚本会自动**：
1. 检测 Bun 是否安装，没装就调用官方安装脚本静默装上
2. 检查依赖（首次启动）并装好
3. 同时启动 site（端口 3000）和 app（端口 3001），每个开一个独立黑窗口
4. 等 6 秒后用默认浏览器打开 http://localhost:3000

**首次启动**：约 1-3 分钟（装 Bun + 装依赖）
**之后启动**：约 10 秒

**停止**：关掉那两个标题为 `RE:FUDAN site (3000)` / `RE:FUDAN app (3001)` 的黑窗口。

**常见问题**：
- 浏览器没自动打开 → 手动访问 http://localhost:3000
- 黑窗口闪退报 `EADDRINUSE` → 3000 或 3001 被别的程序占了
- 依赖装一半坏了 → 删 `apps/site/node_modules` 和 `apps/app/node_modules`，重新双击
- Bun 装不上 → 离线或 PowerShell 被组策略禁用；手动到 https://bun.sh 装
```

### 4.3 不改的部分

- 原 `## 本地启动` 节的所有 `bun install` / `bun dev:site` / Python 管线指令——开发者还要用
- README 顶部"当前分支说明"、"项目概述"、"三大支柱"等所有现有结构

## 5. 验收标准

1. **冷机器**（无 Bun、无依赖）双击 `启动.bat` 后，3 分钟内浏览器看到 `http://localhost:3000` 落地页正常渲染
2. **已装机器**双击后 15 秒内浏览器打开同一页
3. **3000 端口被占**时，主脚本不报错；用户能从子窗口看到 EADDRINUSE
4. **README** 渲染后顶部能看到🚀新节，原命令行流程仍存在且未损坏
5. 关掉两个子窗口后，没有遗留 `bun.exe` 或 `node.exe` 进程占用端口

## 6. 交付物

- `re_fdu-main/re_fdu-main/启动.bat`（新增）
- `re_fdu-main/re_fdu-main/README.md`（修改：新增"一键启动"节、原节重命名）
- 本设计文档 `docs/superpowers/specs/2026-06-06-easy-run-design.md`（新增）
