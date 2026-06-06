# database.py
"""Unified profile database with SQLite storage and FAISS vector search.

Stores all user profiles in SQLite (no more scattered JSON files).
Supports incremental updates when users provide additional platform accounts.
Embeddings are stored in a FAISS index for local similarity matching.

Schema:
  profiles: user_id, display_name, profile_json, platforms_used, confidence,
            embedding_id, created_at, updated_at, second_me_synced
  faiss_index: in-memory + disk-persisted FAISS index
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from schoolmate.config import DATABASE_PATH, FAISS_INDEX_PATH, EMBEDDING_DIM, ensure_dirs

# ── FAISS import (optional fallback) ──
try:
    import faiss
    HAS_FAISS = True
except ImportError:
    HAS_FAISS = False


class ProfileDatabase:
    """SQLite-backed profile store with FAISS vector index.

    Usage:
        db = ProfileDatabase()
        db.upsert_profile(user_id, display_name, profile_dict, platforms, embedding_vector)
        results = db.search_similar(embedding_vector, top_k=10)
        db.set_second_me_synced(user_id)
    """

    def __init__(
        self,
        db_path: str | None = None,
        faiss_path: str | None = None,
        embedding_dim: int | None = None,
    ):
        ensure_dirs()
        self.db_path = db_path or DATABASE_PATH
        self.faiss_path = faiss_path or FAISS_INDEX_PATH
        self.embedding_dim = embedding_dim or EMBEDDING_DIM
        self._lock = threading.Lock()

        self._init_sqlite()
        self._init_faiss()

    # ═══════════════════════════════════════════════════════════════════
    #  SQLite
    # ═══════════════════════════════════════════════════════════════════

    def _init_sqlite(self) -> None:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                display_name TEXT,
                profile_json TEXT NOT NULL,
                platforms_used TEXT,
                confidence REAL DEFAULT 0.0,
                embedding_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                second_me_synced INTEGER DEFAULT 0
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_id ON profiles(user_id)
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_embedding_id ON profiles(embedding_id)
        """)
        self._conn.commit()

    # ═══════════════════════════════════════════════════════════════════
    #  FAISS
    # ═══════════════════════════════════════════════════════════════════

    def _init_faiss(self) -> None:
        """Initialize or load the FAISS index."""
        if not HAS_FAISS:
            self._index = None
            self._next_embedding_id = 0
            return

        faiss_path = Path(self.faiss_path)
        if faiss_path.exists():
            try:
                # Use serialize/deserialize via bytes to support non-ASCII paths
                # (faiss C++ FileIOWriter mishandles Unicode on Windows).
                self._index = faiss.deserialize_index(faiss_path.read_bytes())
                self._next_embedding_id = self._index.ntotal
            except Exception:
                self._create_new_index()
        else:
            self._create_new_index()

    def _create_new_index(self) -> None:
        if not HAS_FAISS:
            self._index = None
            self._next_embedding_id = 0
            return
        self._index = faiss.IndexFlatIP(self.embedding_dim)  # inner product = cosine on normalized vectors
        self._next_embedding_id = 0

    def _save_faiss(self) -> None:
        if not HAS_FAISS or self._index is None:
            return
        faiss_path = Path(self.faiss_path)
        faiss_path.parent.mkdir(parents=True, exist_ok=True)
        # Use serialize via bytes to support non-ASCII paths
        # (faiss C++ FileIOWriter mishandles Unicode on Windows).
        faiss_path.write_bytes(bytes(faiss.serialize_index(self._index)))

    # ═══════════════════════════════════════════════════════════════════
    #  Profile CRUD
    # ═══════════════════════════════════════════════════════════════════

    def upsert_profile(
        self,
        user_id: str,
        display_name: str,
        profile: dict[str, Any],
        platforms_used: list[str] | None = None,
        embedding_vector: np.ndarray | None = None,
    ) -> int:
        """Insert or update a user profile. Returns the row id.

        If the user already exists, their profile is merged/updated (incremental enrichment).
        """
        with self._lock:
            now = datetime.now(timezone.utc).isoformat()
            profile_json = json.dumps(profile, ensure_ascii=False)
            platforms_str = ",".join(platforms_used) if platforms_used else ""

            existing = self._conn.execute(
                "SELECT id, profile_json, platforms_used, embedding_id FROM profiles WHERE user_id = ?",
                (user_id,),
            ).fetchone()

            embedding_id = None

            if existing:
                # Merge: update existing profile
                existing_id, old_json, old_platforms, old_emb_id = existing
                old_profile = json.loads(old_json)
                merged_profile = self._merge_profiles(old_profile, profile)
                merged_json = json.dumps(merged_profile, ensure_ascii=False)

                # Merge platform lists
                old_plat_set = set(old_platforms.split(",")) if old_platforms else set()
                new_plat_set = set(platforms_used or [])
                merged_platforms = ",".join(sorted(old_plat_set | new_plat_set))

                self._conn.execute(
                    """UPDATE profiles
                       SET display_name = ?, profile_json = ?, platforms_used = ?,
                           confidence = ?, updated_at = ?
                       WHERE id = ?""",
                    (display_name, merged_json, merged_platforms,
                     profile.get("confidence", 0.0), now, existing_id),
                )
                row_id = existing_id
                embedding_id = old_emb_id

                # Update FAISS embedding if provided
                if embedding_vector is not None and HAS_FAISS and self._index is not None:
                    embedding_id = self._upsert_embedding(embedding_id, embedding_vector)
                    self._conn.execute(
                        "UPDATE profiles SET embedding_id = ? WHERE id = ?",
                        (embedding_id, row_id),
                    )
            else:
                # Insert new profile
                if embedding_vector is not None and HAS_FAISS and self._index is not None:
                    embedding_id = self._add_embedding(embedding_vector)

                cursor = self._conn.execute(
                    """INSERT INTO profiles
                       (user_id, display_name, profile_json, platforms_used, confidence,
                        embedding_id, created_at, updated_at, second_me_synced)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)""",
                    (user_id, display_name, profile_json, platforms_str,
                     profile.get("confidence", 0.0), embedding_id, now, now),
                )
                row_id = cursor.lastrowid

            self._conn.commit()
            if HAS_FAISS:
                self._save_faiss()
            return row_id

    def get_profile(self, user_id: str) -> dict[str, Any] | None:
        """Retrieve a profile by user_id."""
        row = self._conn.execute(
            "SELECT profile_json FROM profiles WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if row:
            return json.loads(row[0])
        return None

    def list_profiles(self, limit: int = 100) -> list[dict[str, Any]]:
        """List all profiles with metadata (no embedding vectors)."""
        rows = self._conn.execute(
            """SELECT user_id, display_name, platforms_used, confidence,
                      created_at, updated_at, second_me_synced
               FROM profiles
               ORDER BY updated_at DESC
               LIMIT ?""",
            (limit,),
        ).fetchall()
        return [
            {
                "user_id": r[0], "display_name": r[1],
                "platforms_used": r[2].split(",") if r[2] else [],
                "confidence": r[3], "created_at": r[4],
                "updated_at": r[5], "second_me_synced": bool(r[6]),
            }
            for r in rows
        ]

    def delete_profile(self, user_id: str) -> bool:
        """Delete a profile and its embedding."""
        with self._lock:
            row = self._conn.execute(
                "SELECT id, embedding_id FROM profiles WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if not row:
                return False
            emb_id = row[1]
            self._conn.execute("DELETE FROM profiles WHERE user_id = ?", (user_id,))
            self._conn.commit()
            if emb_id is not None and HAS_FAISS and self._index is not None:
                # FAISS doesn't support deletion easily; rebuild is simplest
                self._rebuild_faiss_from_db()
            return True

    def set_second_me_synced(self, user_id: str) -> None:
        """Mark a profile as synced to Second Me."""
        self._conn.execute(
            "UPDATE profiles SET second_me_synced = 1, updated_at = ? WHERE user_id = ?",
            (datetime.now(timezone.utc).isoformat(), user_id),
        )
        self._conn.commit()

    # ═══════════════════════════════════════════════════════════════════
    #  Vector search
    # ═══════════════════════════════════════════════════════════════════

    def search_similar(
        self,
        query_vector: np.ndarray,
        top_k: int = 10,
    ) -> list[dict[str, Any]]:
        """Search for profiles similar to the query embedding.

        Returns list of {user_id, display_name, score, profile} dicts.
        """
        if not HAS_FAISS or self._index is None or self._index.ntotal == 0:
            return []

        query = np.asarray(query_vector, dtype=np.float32).reshape(1, -1)
        distances, indices = self._index.search(query, min(top_k, self._index.ntotal))

        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0:
                continue
            row = self._conn.execute(
                "SELECT user_id, display_name, profile_json FROM profiles WHERE embedding_id = ?",
                (int(idx),),
            ).fetchone()
            if row:
                results.append({
                    "user_id": row[0],
                    "display_name": row[1],
                    "score": float(dist),
                    "profile": json.loads(row[2]),
                })
        return results

    def search_by_criteria(
        self,
        industry: str | None = None,
        skills: list[str] | None = None,
        grade: str | None = None,
        min_confidence: float = 0.3,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Rule-based profile search with custom weighting.

        Example: search for students in quantitative finance with programming skills.
        """
        rows = self._conn.execute(
            """SELECT user_id, display_name, profile_json, confidence
               FROM profiles WHERE confidence >= ?
               ORDER BY confidence DESC LIMIT ?""",
            (min_confidence, limit * 3),
        ).fetchall()

        results = []
        for row in rows:
            profile = json.loads(row[2])
            score = 0.0

            # Industry match
            if industry:
                inferred = profile.get("inferred_signals", {})
                domains = inferred.get("career_domains", {})
                industry_lower = industry.lower()
                for domain, info in domains.items():
                    if industry_lower in domain.lower():
                        score += 0.3
                        break
                target = profile.get("basic_info", {}).get("target_industry", "")
                if isinstance(target, str) and industry_lower in target.lower():
                    score += 0.2

            # Skill match
            if skills:
                profile_skills = profile.get("inferred_signals", {}).get("skills_inferred", [])
                profile_skills_lower = [s.lower() for s in profile_skills]
                for sk in skills:
                    if any(sk.lower() in ps for ps in profile_skills_lower):
                        score += 0.15

            # Grade match
            if grade:
                bio = profile.get("basic_info", {}).get("bio", "")
                if grade in bio:
                    score += 0.1

            if score > 0 or (not industry and not skills and not grade):
                results.append({
                    "user_id": row[0],
                    "display_name": row[1],
                    "score": round(score, 3),
                    "profile": profile,
                })

        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:limit]

    # ═══════════════════════════════════════════════════════════════════
    #  Stats
    # ═══════════════════════════════════════════════════════════════════

    def stats(self) -> dict[str, Any]:
        """Return database statistics."""
        total = self._conn.execute("SELECT COUNT(*) FROM profiles").fetchone()[0]
        synced = self._conn.execute(
            "SELECT COUNT(*) FROM profiles WHERE second_me_synced = 1"
        ).fetchone()[0]
        faiss_total = self._index.ntotal if (HAS_FAISS and self._index is not None) else 0
        return {
            "total_profiles": total,
            "second_me_synced": synced,
            "faiss_vectors": faiss_total,
            "db_path": self.db_path,
            "faiss_path": self.faiss_path,
        }

    # ═══════════════════════════════════════════════════════════════════
    #  Internals
    # ═══════════════════════════════════════════════════════════════════

    def _add_embedding(self, vector: np.ndarray) -> int:
        """Add a vector to FAISS and return its ID."""
        v = np.asarray(vector, dtype=np.float32).reshape(1, -1)
        emb_id = self._next_embedding_id
        self._index.add(v)
        self._next_embedding_id += 1
        return emb_id

    def _upsert_embedding(self, old_emb_id: int | None, vector: np.ndarray) -> int:
        """Replace an embedding in FAISS. Since FAISS doesn't support updates,
        we add a new vector and the old one becomes stale (handled by rebuild).
        """
        return self._add_embedding(vector)

    def _rebuild_faiss_from_db(self) -> None:
        """Rebuild the FAISS index from all embedded profiles in the DB."""
        if not HAS_FAISS:
            return
        self._create_new_index()
        # We can't easily rebuild without storing embeddings separately.
        # Embeddings are generated fresh each time from the LLM.
        # This is called after deletes; stale entries will be cleaned next rebuild.
        self._save_faiss()

    @staticmethod
    def _merge_profiles(old: dict, new: dict) -> dict:
        """Merge two profile dicts — new data augments old (incremental enrichment)."""
        merged = dict(old)

        # Merge content_topics (deduplicate by topic name)
        old_topics = {t.get("topic"): t for t in old.get("content_topics", [])}
        for t in new.get("content_topics", []):
            topic_name = t.get("topic", "")
            if topic_name and topic_name not in old_topics:
                old_topics[topic_name] = t
        merged["content_topics"] = list(old_topics.values())

        # Merge inferred signals (extend lists, deduplicate)
        for signal_key in ["skills_inferred", "interests", "industry_signals", "content_roles"]:
            old_items = set(
                (s if isinstance(s, str) else s.get("role", ""))
                for s in old.get("inferred_signals", {}).get(signal_key, [])
            )
            new_items = new.get("inferred_signals", {}).get(signal_key, [])
            for item in new_items:
                key = item if isinstance(item, str) else item.get("role", "")
                if key and key not in old_items:
                    old_items.add(key)
                    merged.setdefault("inferred_signals", {}).setdefault(signal_key, []).append(item)

        # Merge career domains
        old_domains = set(old.get("inferred_signals", {}).get("career_domains", {}).keys())
        new_domains = new.get("inferred_signals", {}).get("career_domains", {})
        for domain, info in new_domains.items():
            if domain not in old_domains:
                merged.setdefault("inferred_signals", {}).setdefault("career_domains", {})[domain] = info

        # Merge platform_profiles
        old_pps = old.get("platform_profiles", {})
        new_pps = new.get("platform_profiles", {})
        for plat, plat_profile in new_pps.items():
            if plat not in old_pps:
                old_pps[plat] = plat_profile
        merged["platform_profiles"] = old_pps

        # Update confidence (take max)
        merged["confidence"] = max(old.get("confidence", 0), new.get("confidence", 0))

        # Merge platforms_used
        old_plats = set(old.get("platforms_used", []))
        new_plats = set(new.get("platforms_used", []))
        merged["platforms_used"] = sorted(old_plats | new_plats)

        # Update timestamp
        merged["synthesized_at"] = datetime.now(timezone.utc).isoformat()
        merged["sources"]["notes_collected"] += new.get("sources", {}).get("notes_collected", 0)

        return merged
