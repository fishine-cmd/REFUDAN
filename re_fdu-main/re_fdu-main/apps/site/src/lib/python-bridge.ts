/**
 * python-bridge.ts — Spawn Python processes from Next.js API routes.
 *
 * All routes call `run_pipeline.py` with `--json-output` so stdout is a single
 * JSON object and progress messages go to stderr.
 */

import { spawn, spawnSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

/** Locate `services/profile-extraction/` regardless of where the Next.js
 * dev server was launched from. The site is started with `cd apps/site &&
 * bun run dev`, which means process.cwd() is `apps/site/`, NOT the repo
 * root. We probe both common cases.
 */
function resolvePythonDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "..", "..", "services", "profile-extraction"),  // from apps/site/
    path.resolve(process.cwd(), "services", "profile-extraction"),               // from repo root
    path.resolve(process.cwd(), "..", "services", "profile-extraction"),         // from apps/
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Last-resort fallback: anchor off this file's compiled location.
  // In Next.js dev this is under .next/server/..., so going up is fragile,
  // but at least the error message will name a concrete path.
  return candidates[0];
}

const PYTHON_DIR = resolvePythonDir();

/** Resolve the Python executable command once at module load.
 *
 * On Windows, Node's `spawn("python", ...)` does not auto-resolve .exe
 * extension. Probe candidates and prefer the explicit .exe form so we can
 * spawn without shell:true (which has the DEP0190 deprecation warning
 * when args are passed as an array).
 */
function resolvePythonCommand(): string {
  const candidates = process.platform === "win32"
    ? ["python.exe", "py.exe", "python3.exe", "python", "py", "python3"]
    : ["python3", "python"];
  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ["--version"], { shell: true, stdio: "pipe", timeout: 5000 });
      if (r.status === 0) return cmd;
    } catch {
      // try next
    }
  }
  return "python";
}

const PYTHON_CMD = resolvePythonCommand();

export interface PythonResult<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
  exitCode: number;
}

/**
 * Run `python run_pipeline.py` with the given arguments.
 *
 * @param args     CLI arguments passed after `run_pipeline.py --json-output`.
 * @param timeoutMs  Maximum wall-clock time (ms). Default 120 s.
 */
export function runPipeline<T = unknown>(
  args: string[],
  timeoutMs = 120_000,
): Promise<PythonResult<T>> {
  return new Promise((resolve) => {
    const proc = spawn(
      PYTHON_CMD,
      ["run_pipeline.py", "--json-output", ...args],
      {
        cwd: PYTHON_DIR,
        env: { ...process.env },
        timeout: timeoutMs,
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      const exit = code ?? 1;
      if (exit === 0 && stdout.trim()) {
        try {
          // The last JSON line is the result; earlier lines might be artifacts
          const lines = stdout.trim().split("\n");
          const lastJson = lines[lines.length - 1];
          const data = JSON.parse(lastJson) as T;
          resolve({ success: (data as Record<string, unknown>).success !== false, data, exitCode: exit });
        } catch {
          resolve({ success: true, data: { output: stdout.trim() } as T, exitCode: exit });
        }
      } else {
        // Collect stderr progress messages into error for debugging
        const progressLines = stderr
          .split("\n")
          .filter((l) => l.trim())
          .slice(-20)
          .join("\n");
        resolve({
          success: false,
          data: {} as T,
          error: progressLines || stdout.trim() || `Process exited with code ${exit}`,
          exitCode: exit,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        data: {} as T,
        error: `Failed to start Python: ${err.message}`,
        exitCode: -1,
      });
    });
  });
}
