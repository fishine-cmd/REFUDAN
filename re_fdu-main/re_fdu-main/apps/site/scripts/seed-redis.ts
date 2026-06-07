// 一次性 seed:把 src/data/mentors/*.json 入 Upstash Redis 作为 role=senior 用户。
// 幂等:已存在的 senior 跳过。统一密码 demo123。
// Usage: bun --cwd apps/site run seed

import fs from "node:fs";
import path from "node:path";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

process.loadEnvFile?.(".env.local");

import { getRedis, K } from "../src/lib/redis";
import { insertUser, findUserByUsername } from "../src/lib/users-redis";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(plain, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

interface MentorJson {
  id: string;
  name: string;
  avatar?: string | null;
  title?: string;
  scores?: number[];
  tags?: string[];
  badges?: string[];
  highlight?: string;
  persona?: { name: string; background: string; expertise: string };
  detailed_profile?: unknown;
}

async function main() {
  const mentorsDir = path.join(process.cwd(), "src", "data", "mentors");
  if (!fs.existsSync(mentorsDir)) {
    console.error(`[seed] mentors dir not found: ${mentorsDir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(mentorsDir).filter((f) => f.endsWith(".json"));
  const password_hash = await hashPassword("demo123");
  const now = Date.now();
  let inserted = 0, skipped = 0;

  for (const file of files) {
    const mentor: MentorJson = JSON.parse(
      fs.readFileSync(path.join(mentorsDir, file), "utf-8"),
    );
    const username = mentor.id; // mentor.id 复用作 username

    if (await findUserByUsername(username)) {
      console.log(`[seed] skip ${username} (already exists)`);
      skipped++;
      continue;
    }

    await insertUser({
      id: mentor.id,
      username,
      password_hash,
      display_name: mentor.name,
      role: "senior",
      created_at: now,
      avatar: mentor.avatar ?? null,
      title: mentor.title ?? null,
      highlight: mentor.highlight ?? null,
      scores_json: mentor.scores ? JSON.stringify(mentor.scores) : null,
      tags_json: mentor.tags ? JSON.stringify(mentor.tags) : null,
      badges_json: mentor.badges ? JSON.stringify(mentor.badges) : null,
      persona_json: mentor.persona ? JSON.stringify(mentor.persona) : null,
      detailed_profile_json: mentor.detailed_profile
        ? JSON.stringify(mentor.detailed_profile)
        : null,
    });
    console.log(`[seed] inserted ${username}`);
    inserted++;
  }
  console.log(`[seed] done. inserted=${inserted} skipped=${skipped}`);

  // 抽查
  const r = getRedis();
  const ids = await r.smembers(K.usersByRole("senior"));
  console.log(`[seed] role=senior 总数: ${ids.length}`, ids);
}

main().catch((e) => {
  console.error("[seed] FAILED:", e);
  process.exit(1);
});
