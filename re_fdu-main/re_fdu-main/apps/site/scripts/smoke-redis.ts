// Smoke test for Upstash Redis connection. 跑一次后删除。
// Usage: bun --cwd apps/site scripts/smoke-redis.ts

import { getRedis, K } from "../src/lib/redis";

// Bun 不自动读 .env.local,显式加载(若 Bun 版本支持 loadEnvFile)
process.loadEnvFile?.(".env.local");

async function main() {
  const r = getRedis();
  const probe = `refudan:smoke:${Date.now()}`;
  await r.set(probe, "ok", { ex: 60 });
  const v = await r.get<string>(probe);
  if (v !== "ok") throw new Error(`got ${JSON.stringify(v)}, want "ok"`);
  await r.del(probe);
  console.log("[smoke] Upstash Redis OK, key builder sample:", K.user("test"));
}

main().catch((e) => {
  console.error("[smoke] FAILED:", e);
  process.exit(1);
});
