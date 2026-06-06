# profile_builder.py
"""Multi-source Profile construction for RE:FUDAN agent system.

Three core goals (from profile_format.md):
  便于匹配          — rich skill/interest vectors + embeddings
  便于个性化服务    — detailed persona signals from platform extraction
  可持续更新        — source provenance, timestamps, incremental merge

Supports building Profile from:
  - Xiaohongshu extraction JSON (extract_xhs_profile.py output)
  - User-provided resume / questionnaire (future)
  - Chat-based refinement (future)
"""

from __future__ import annotations

import json
import os
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional

from profile_schema import Achievement, Profile, SocialAccounts

# ── Source provenance tracking ────────────────────────────────────────────


class SignalSource:
    """Tracks origin of each profile signal (便于可持续更新)."""

    def __init__(self, platform: str, url: str = "", extracted_at: Optional[datetime] = None):
        self.platform = platform
        self.url = url
        self.extracted_at = extracted_at or datetime.now(timezone.utc)

    def to_dict(self) -> dict[str, Any]:
        return {
            "platform": self.platform,
            "url": self.url,
            "extracted_at": self.extracted_at.isoformat(),
        }


# ── Profile builder ────────────────────────────────────────────────────────


class ProfileBuilder:
    """Build and incrementally enrich a Profile from multiple sources."""

    def __init__(self, user_id: str, name: str):
        self.profile = Profile(user_id=user_id, name=name)
        self._sources: dict[str, SignalSource] = {}
        self._enrichment_log: list[dict[str, Any]] = []

    # ── Source registration ──

    def register_source(self, key: str, platform: str, url: str = "") -> SignalSource:
        src = SignalSource(platform, url)
        self._sources[key] = src
        return src

    # ── Enrichment entry points ──

    def enrich_from_xhs_extraction(self, xhs_path: str) -> list[str]:
        """Load a xhs_profile.json and merge its signals into this Profile.

        Returns a list of field names that were updated.
        """
        if not os.path.exists(xhs_path):
            raise FileNotFoundError(f"XHS extraction file not found: {xhs_path}")

        with open(xhs_path, "r", encoding="utf-8") as f:
            xhs = json.load(f)

        url = xhs.get("basic_info", {}).get("profile_url", "")
        src = self.register_source("xiaohongshu", "xiaohongshu", url)
        updated: list[str] = []

        # ── basic_info ──
        bi = xhs.get("basic_info", {})
        if bi.get("display_name") and not self.profile.name:
            self.profile.name = bi["display_name"]
            updated.append("name")

        xhs_id = bi.get("xhs_id", "")
        if xhs_id:
            sa = self.profile.social_accounts
            if isinstance(sa, dict):
                sa["xiaohongshu"] = xhs_id
            else:
                sa.xiaohongshu = xhs_id
            updated.append("social_accounts.xiaohongshu")

        bio = bi.get("bio", "")
        if bio:
            self._parse_bio_fields(bio, updated)

        # ── content_topics → interests ──
        topics = xhs.get("content_topics", [])
        if topics:
            interest_tags: list[str] = []
            for t in topics:
                topic_name = t.get("topic", "")
                if topic_name and t.get("confidence", 0) >= 0.5:
                    interest_tags.append(topic_name)
            if interest_tags:
                self.profile.interests = _dedupe_extend(self.profile.interests, interest_tags)
                updated.append("interests")

        # ── inferred_signals → skills / career fields ──
        signals = xhs.get("inferred_signals", {})
        if signals:
            skills_raw = signals.get("skills_inferred", [])
            if skills_raw:
                skills = _normalize_skills(skills_raw)
                self.profile.skills = _dedupe_extend(self.profile.skills, skills)
                updated.append("skills")

            domains = signals.get("career_domains", {})
            if domains:
                domain_labels = list(domains.keys())
                if domain_labels and not self.profile.target_industry:
                    self.profile.target_industry = domain_labels[0]
                    updated.append("target_industry")

                career_text = " / ".join(domain_labels)
                if not self.profile.career_goal:
                    self.profile.career_goal = f"探索方向: {career_text}"
                    updated.append("career_goal")

        # ── style_profile → personality_traits ──
        style = xhs.get("style_profile", {})
        if style:
            tone = style.get("tone", [])
            if tone:
                self.profile.personality_traits = _dedupe_extend(
                    self.profile.personality_traits, tone
                )
                updated.append("personality_traits")

            writing = style.get("writing_style", [])
            visuals = style.get("visual_style", [])
            extras = [w for w in writing + visuals if w]
            if extras:
                self.profile.hobbies = _dedupe_extend(self.profile.hobbies, extras)
                updated.append("hobbies")

        # ── audience_guess → (informs targeting) ──
        audience = xhs.get("audience_guess", {})
        if audience.get("description"):
            self.profile.interests = _dedupe_extend(
                self.profile.interests, [audience["description"]]
            )

        # ── education ──
        edu = signals.get("education", {})
        if edu:
            schools = edu.get("school", [])
            if schools and not self.profile.major:
                self.profile.major = f"在校生 — {schools[0]}"
                updated.append("major")

            grades = edu.get("grade_level", [])
            if grades and not self.profile.grade:
                self.profile.grade = grades[0]
                updated.append("grade")

        # ── content roles → achievements ──
        roles = signals.get("content_roles", [])
        for role in roles:
            evidence = role.get("evidence", "")
            role_label = role.get("role", "")
            if evidence and role_label:
                self.profile.achievements.append(
                    Achievement(
                        title=role_label.split(":")[0].strip(),
                        description=role_label,
                    )
                )
        if roles:
            updated.append("achievements")

        # ── log enrichment ──
        self._enrichment_log.append(
            {
                "source": "xiaohongshu",
                "extracted_at": src.extracted_at.isoformat(),
                "fields_updated": updated,
                "confidence": xhs.get("confidence", 0),
            }
        )

        return updated

    def enrich_from_manual(self, **kwargs: Any) -> list[str]:
        """Set fields directly from a questionnaire or manual entry."""
        updated: list[str] = []
        for field, value in kwargs.items():
            if hasattr(self.profile, field) and value:
                current = getattr(self.profile, field)
                if not current or current == [] or current == SocialAccounts():
                    setattr(self.profile, field, value)
                    updated.append(field)
        if updated:
            self._enrichment_log.append(
                {
                    "source": "manual",
                    "extracted_at": datetime.now(timezone.utc).isoformat(),
                    "fields_updated": updated,
                }
            )
        return updated

    # ── helpers ──

    def _parse_bio_fields(self, bio: str, updated: list[str]) -> None:
        """Parse self-description bio for grade, school, etc."""
        import re

        grade_map = {
            "大一": "大一", "大二": "大二", "大三": "大三", "大四": "大四",
            "研一": "研一", "研二": "研二", "研三": "研三",
            "博一": "博一", "博二": "博二",
        }
        for key, label in grade_map.items():
            if key in bio and not self.profile.grade:
                self.profile.grade = label
                updated.append("grade")
                break

        school_match = re.search(r"(\S+大学|\S+学院)", bio)
        if school_match and not self.profile.major:
            self.profile.major = f"在校 — {school_match.group(1)}"
            updated.append("major")

    # ── serialization ──

    def to_profile(self) -> Profile:
        """Return the built Profile."""
        self.profile.last_update = datetime.now(timezone.utc)
        return self.profile

    def to_second_me_payload(self) -> dict[str, Any]:
        """Build payload for Second Me API update_profile call."""
        p = self.profile
        sa = p.social_accounts
        return {
            "resume_url": p.resume_file,
            "social_accounts": sa if isinstance(sa, dict) else sa.model_dump(),
            "skills": p.skills,
            "interests": p.interests,
            "career_goal": p.career_goal,
            "target_industry": p.target_industry,
            "personality_traits": p.personality_traits,
            "hobbies": p.hobbies,
            "languages": p.languages,
        }

    def provenance_report(self) -> dict[str, Any]:
        """Return a report of all sources and enrichment history."""
        return {
            "profile_id": self.profile.user_id,
            "last_update": self.profile.last_update.isoformat() if self.profile.last_update else None,
            "sources": {k: v.to_dict() for k, v in self._sources.items()},
            "enrichment_log": self._enrichment_log,
            "field_summary": {
                "skills": self.profile.skills,
                "interests": self.profile.interests,
                "personality_traits": self.profile.personality_traits,
                "career_goal": self.profile.career_goal,
                "target_industry": self.profile.target_industry,
            },
        }


# ── Conversion: xhs_profile.json → Profile ─────────────────────────────────


def build_profile_from_xhs(
    xhs_path: str,
    user_id: str = "RE_FUDAN_AUTO",
    name: str = "",
) -> tuple[Profile, ProfileBuilder]:
    """Quick one-shot: load XHS extraction and return a built Profile + builder."""
    builder = ProfileBuilder(user_id=user_id, name=name)
    builder.enrich_from_xhs_extraction(xhs_path)
    return builder.to_profile(), builder


# ── Merge utilities ────────────────────────────────────────────────────────


def merge_profiles(base: Profile, incoming: Profile, fields: Optional[list[str]] = None) -> Profile:
    """Merge incoming Profile into base, only filling empty fields by default.

    The base (user-provided) profile wins over platform-extracted data.
    """
    default_fields = [
        "skills", "interests", "personality_traits", "hobbies", "languages",
        "career_goal", "target_industry", "major", "grade",
        "birth_year", "enrollment_year", "gender",
    ]
    for f in fields or default_fields:
        base_val = getattr(base, f, None)
        inc_val = getattr(incoming, f, None)
        if base_val in (None, "", [], SocialAccounts()) and inc_val not in (None, "", [], SocialAccounts()):
            setattr(base, f, inc_val)
        elif isinstance(base_val, list) and isinstance(inc_val, list):
            setattr(base, f, _dedupe_extend(base_val, inc_val))

    base.last_update = datetime.now(timezone.utc)
    return base


# ── Internal helpers ───────────────────────────────────────────────────────


def _dedupe_extend(existing: list[str], incoming: list[str]) -> list[str]:
    seen = set(existing)
    result = list(existing)
    for item in incoming:
        key = item.strip().lower()
        if key and key not in seen:
            seen.add(key)
            result.append(item.strip())
    return result


def _normalize_skills(raw: list[str]) -> list[str]:
    """Deduplicate and normalize skill labels."""
    seen: set[str] = set()
    out: list[str] = []
    for s in raw:
        low = s.strip().lower()
        if low and low not in seen:
            seen.add(low)
            out.append(s.strip())
    return out
