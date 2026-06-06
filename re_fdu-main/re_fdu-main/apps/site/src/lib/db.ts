// schoolmate-style: SQLite via Bun's built-in driver. Singleton, idempotent
// schema, idempotent seed. All API routes that import this MUST opt out of the
// Edge runtime via `export const runtime = "nodejs"` because bun:sqlite is not
// available in Edge.

import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "users.db");

let _db: Database | null = null;
let _seedPromise: Promise<void> | null = null;

function open(): Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('senior','junior')),
  avatar          TEXT,
  bio             TEXT,
  created_at      INTEGER NOT NULL,
  title                  TEXT,
  scores_json            TEXT,
  tags_json              TEXT,
  badges_json            TEXT,
  highlight              TEXT,
  persona_json           TEXT,
  detailed_profile_json  TEXT,
  built_profile_json     TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS sessions (
  token        TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`;

export function getDb(): Database {
  if (_db) return _db;
  _db = open();
  _db.exec(SCHEMA);
  return _db;
}

/** Idempotent seed: load mentor JSONs into users table on first run. */
export async function ensureSeeded(): Promise<void> {
  if (_seedPromise) return _seedPromise;
  _seedPromise = (async () => {
    const db = getDb();
    const row = db.query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM users WHERE role='senior'",
    ).get();
    if (row && row.count > 0) return;

    const mentorsDir = path.join(process.cwd(), "src", "data", "mentors");
    if (!fs.existsSync(mentorsDir)) return;

    const files = fs.readdirSync(mentorsDir).filter((f) => f.endsWith(".json"));
    const defaultPasswordHash = await Bun.password.hash("demo123", "argon2id");

    const insert = db.prepare(`
      INSERT INTO users (
        id, username, password_hash, display_name, role, avatar,
        title, scores_json, tags_json, badges_json, highlight,
        persona_json, detailed_profile_json, created_at
      ) VALUES (?, ?, ?, ?, 'senior', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const file of files) {
      try {
        const mentor = JSON.parse(
          fs.readFileSync(path.join(mentorsDir, file), "utf-8"),
        );
        insert.run(
          mentor.id,
          mentor.id,
          defaultPasswordHash,
          mentor.name,
          mentor.avatar ?? null,
          mentor.title ?? null,
          mentor.scores ? JSON.stringify(mentor.scores) : null,
          mentor.tags ? JSON.stringify(mentor.tags) : null,
          mentor.badges ? JSON.stringify(mentor.badges) : null,
          mentor.highlight ?? null,
          mentor.persona ? JSON.stringify(mentor.persona) : null,
          mentor.detailed_profile ? JSON.stringify(mentor.detailed_profile) : null,
          Date.now(),
        );
      } catch (e) {
        console.error(`[seed] failed for ${file}:`, e);
      }
    }
    console.log(`[seed] seeded ${files.length} mentor accounts (password=demo123)`);
  })();
  return _seedPromise;
}

// ────────────────────────────────────────────────────────────────────────
// User row helpers
// ────────────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: "senior" | "junior";
  avatar: string | null;
  bio: string | null;
  created_at: number;
  title: string | null;
  scores_json: string | null;
  tags_json: string | null;
  badges_json: string | null;
  highlight: string | null;
  persona_json: string | null;
  detailed_profile_json: string | null;
  built_profile_json: string | null;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: "senior" | "junior";
  avatar: string | null;
  bio: string | null;
  title?: string | null;
  scores?: number[];
  tags?: string[];
  badges?: string[];
  highlight?: string | null;
  persona?: { name: string; background: string; expertise: string } | null;
}

export function toPublicUser(row: UserRow): PublicUser {
  const base: PublicUser = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    avatar: row.avatar,
    bio: row.bio,
  };
  if (row.role === "senior") {
    base.title = row.title;
    if (row.scores_json) {
      try { base.scores = JSON.parse(row.scores_json); } catch { /* ignore */ }
    }
    if (row.tags_json) {
      try { base.tags = JSON.parse(row.tags_json); } catch { /* ignore */ }
    }
    if (row.badges_json) {
      try { base.badges = JSON.parse(row.badges_json); } catch { /* ignore */ }
    }
    base.highlight = row.highlight;
    if (row.persona_json) {
      try { base.persona = JSON.parse(row.persona_json); } catch { /* ignore */ }
    }
  }
  return base;
}

export function findUserById(id: string): UserRow | null {
  const db = getDb();
  return db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ?").get(id);
}

export function findUserByUsername(username: string): UserRow | null {
  const db = getDb();
  return db.query<UserRow, [string]>("SELECT * FROM users WHERE username = ?").get(
    username.toLowerCase(),
  );
}

export function listUsersByRole(role: "senior" | "junior"): UserRow[] {
  const db = getDb();
  return db.query<UserRow, [string]>(
    "SELECT * FROM users WHERE role = ? ORDER BY created_at",
  ).all(role);
}

export function updateUserBuiltProfile(userId: string, builtProfile: unknown | null): void {
  const db = getDb();
  db.prepare("UPDATE users SET built_profile_json = ? WHERE id = ?").run(
    builtProfile === null ? null : JSON.stringify(builtProfile),
    userId,
  );
}

export function getBuiltProfile(userId: string): unknown | null {
  const row = findUserById(userId);
  if (!row || !row.built_profile_json) return null;
  try {
    return JSON.parse(row.built_profile_json);
  } catch {
    return null;
  }
}
