#!/usr/bin/env node
/**
 * RE:FUDAN 中期材料一键打包脚本
 *
 * 用法:
 *   bun run scripts/package-submission.mjs
 *   node scripts/package-submission.mjs
 *   node scripts/package-submission.mjs --project RE_FUDAN --group 复见组
 *
 * 从 doc/ 收集 PDF + 视频，按训练营要求结构打包成 ZIP 到 dist/。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// ── 参数解析 ─────────────────────────────────────────────
const argv = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, idx, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[idx + 1]]);
    return acc;
  }, []),
);
const PROJECT = argv.project || "RE_FUDAN";
const GROUP = argv.group || "复见组";
const REPO_URL = argv.repo || "https://github.com/fishine-cmd/REFUDAN";
const DOC_DIR = path.join(REPO_ROOT, argv.doc || "doc");
const OUT_DIR = path.join(REPO_ROOT, argv.out || "dist");

const BUNDLE = `Agent训练营中期材料_${PROJECT}_${GROUP}`;
const BUNDLE_DIR = path.join(OUT_DIR, BUNDLE);
const ZIP_PATH = path.join(OUT_DIR, `${BUNDLE}.zip`);

// ── 小工具 ───────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};
const ok = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const skip = (msg) => console.log(`  ${c.yellow}-${c.reset} ${msg}`);
const fail = (msg) => console.log(`  ${c.red}✗${c.reset} ${msg}`);
const header = (msg) => {
  console.log("");
  console.log(c.cyan + "================================================" + c.reset);
  console.log(c.cyan + "  " + msg + c.reset);
  console.log(c.cyan + "================================================" + c.reset);
};

header("RE:FUDAN 中期材料打包");
console.log(`  项目根目录: ${REPO_ROOT}`);
console.log(`  项目名称:   ${PROJECT}`);
console.log(`  小组名称:   ${GROUP}`);
console.log("");

// ── 1. 清理旧产物 ───────────────────────────────────────
if (fs.existsSync(BUNDLE_DIR)) fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH, { force: true });
fs.mkdirSync(BUNDLE_DIR, { recursive: true });

// ── 2. 收集文件 ─────────────────────────────────────────
const items = [
  {
    src: "01_项目说明书.pdf",
    dst: "01_项目说明书.pdf",
    required: true,
    note: "提交要求 1 — 项目说明文档",
  },
  {
    src: "02_demo_video.mp4",
    dst: "02_demo_video.mp4",
    required: true,
    note: "提交要求 2 — Demo 演示视频",
  },
  {
    src: "03_demo视频说明.md",
    dst: "03_Demo视频说明.md",
    required: false,
    note: "提交要求 3 — Demo 视频说明(可选)",
  },
  {
    src: "05_代码运行说明.md",
    dst: "05_代码运行说明.md",
    required: true,
    note: "提交要求 5 — 代码运行说明",
  },
];

const missing = [];
for (const it of items) {
  const srcPath = path.join(DOC_DIR, it.src);
  const dstPath = path.join(BUNDLE_DIR, it.dst);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, dstPath);
    ok(`已收集 ${it.dst}  (${it.note})`);
  } else if (it.required) {
    missing.push(it);
    fail(`缺失   ${it.src}  (${it.note})`);
  } else {
    skip(`跳过(可选) ${it.src}`);
  }
}

// ── 3. 生成代码仓库链接 (提交要求 4) ──────────────────
const linkPath = path.join(BUNDLE_DIR, "04_代码仓库链接.txt");
const linkContent = `RE:FUDAN（复见） 项目代码仓库
========================================

主仓库 (fork):    ${REPO_URL}
开发分支:          feat/secondme-integration
原始仓库:          https://github.com/Wesleyyyyyy/REFUDAN

注意 · 评审入口
----------------------------------------
仓库由上游 zip 解压生成，实际代码位于双层嵌套
路径 \`re_fdu-main/re_fdu-main/\` 内。

GitHub 浏览：
  ${REPO_URL}/tree/feat/secondme-integration/re_fdu-main/re_fdu-main

本地 clone：
  git clone -b feat/secondme-integration ${REPO_URL}
  cd REFUDAN/re_fdu-main/re_fdu-main

详细运行步骤见 05_代码运行说明.md。
`;
fs.writeFileSync(linkPath, linkContent, "utf-8");
ok("已生成 04_代码仓库链接.txt");

// ── 4. 缺失项检查 ──────────────────────────────────────
if (missing.length > 0) {
  console.log("");
  header("⚠ 以下必需文件缺失，请补齐后重新运行");
  for (const m of missing) {
    console.log(`  • doc/${m.src}`);
  }
  console.log("");
  console.log(c.cyan + "提示：" + c.reset);
  console.log("  • 01_项目说明书.pdf  → 把 doc/01_项目说明书.md 用 VS Code Markdown PDF 扩展导出");
  console.log("  • 02_demo_video.mp4 → 录完后放进 doc/ 目录");
  console.log("");
  console.log(c.red + "本次打包未生成 ZIP。" + c.reset);
  process.exit(1);
}

// ── 5. 压缩 ────────────────────────────────────────────
console.log("");
console.log(c.cyan + "正在打包 ZIP..." + c.reset);

// 优先用系统命令；Windows 用 PowerShell 5.1 内建 Compress-Archive；macOS/Linux 用 zip
try {
  if (process.platform === "win32") {
    const psCmd = `Compress-Archive -Path '${BUNDLE_DIR}' -DestinationPath '${ZIP_PATH}' -Force`;
    execSync(`powershell.exe -NoProfile -Command "${psCmd}"`, { stdio: "inherit" });
  } else {
    execSync(`cd "${OUT_DIR}" && zip -r "${BUNDLE}.zip" "${BUNDLE}"`, { stdio: "inherit" });
  }
} catch (e) {
  console.log(c.red + "压缩失败: " + e.message + c.reset);
  process.exit(1);
}

const sizeMB = (fs.statSync(ZIP_PATH).size / 1024 / 1024).toFixed(2);

header(c.green + "✓ 打包完成" + c.reset);
console.log(`  ZIP 路径: ${ZIP_PATH}`);
console.log(`  ZIP 大小: ${sizeMB} MB`);
console.log("");
console.log(c.cyan + "下一步：" + c.reset);
console.log(`  1. 发邮件到 FudanAICS@163.com`);
console.log(`  2. 邮件主题: ${BUNDLE}.zip`);
console.log(`  3. 附件名称: ${BUNDLE}.zip`);
console.log(`  4. 截止时间: 6 月 9 日 23:59`);
console.log("");
