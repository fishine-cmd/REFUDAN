# schoolmate/agents/profile_synthesizer.py
"""ProfileSynthesizer Agent — aggregate LLM signals into a unified profile.

Input:  ContentAnalyzer output (analyzed_signals) + raw collected data
Output: Final structured profile JSON, ready for database storage.

No hardcoded keywords — purely structural aggregation from LLM signals.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ProfileSynthesizer:
    """Aggregate analyzed signals and raw profile data into a unified Profile JSON."""

    def synthesize(
        self,
        raw_data: dict[str, Any],
        analyzed_signals: dict[str, Any],
    ) -> dict[str, Any]:
        """Produce the final structured profile.

        Args:
            raw_data: Output from CollectorDispatcher (resolved_profile, notes, etc.)
            analyzed_signals: Output from ContentAnalyzer (topics, skills, style, etc.)

        Returns:
            Final profile dict for database storage and Second Me sync.
        """
        resolved = raw_data.get("resolved_profile", {})
        notes = raw_data.get("notes", [])
        extraction_status = raw_data.get("extraction_status", {})

        # ── Basic info ──
        basic_info = {
            "display_name": resolved.get("nickname", ""),
            "platforms": raw_data.get("platforms", []),
            "bio": resolved.get("bio", ""),
            "profile_url": resolved.get("profile_url", ""),
        }
        # Pass through per-platform profile details
        if "platform_profiles" in resolved:
            basic_info["platform_profiles"] = resolved["platform_profiles"]

        # ── Content topics ──
        topics_data = analyzed_signals.get("topics", {})
        content_topics: list[dict[str, Any]] = []
        for t in topics_data.get("topics", []):
            content_topics.append({
                "topic": t.get("topic", ""),
                "post_count": t.get("post_count", 0),
                "confidence": t.get("confidence", 0.5),
                "evidence": t.get("evidence", [])[:5],
            })
        content_topics.sort(key=lambda x: x.get("post_count", 0), reverse=True)

        # ── Inferred signals ──
        skills_data = analyzed_signals.get("skills", {})
        style_data = analyzed_signals.get("style", {})

        inferred_signals = {
            "education": skills_data.get("education", {}) or {},
            "career_domains": skills_data.get("career_domains", {}) or {},
            "skills_inferred": skills_data.get("skills_inferred", []) or [],
            "interests": skills_data.get("interests", []) or [],
            "industry_signals": skills_data.get("industry_signals", []) or [],
            "content_roles": skills_data.get("content_roles", []) or [],
        }

        # ── Style profile ──
        style_profile = {
            "writing_style": style_data.get("writing_style", []) or [],
            "visual_style": style_data.get("visual_style", []) or [],
            "tone": style_data.get("tone", []) or [],
            "title_patterns": style_data.get("title_patterns", []),
            "language_complexity": style_data.get("language_complexity", "moderate"),
            "emoji_usage": style_data.get("emoji_usage", "minimal"),
            "hashtag_usage": style_data.get("hashtag_usage", "minimal"),
            "avg_post_length": style_data.get("avg_post_length", "medium"),
        }

        # ── Audience ──
        audience_data = analyzed_signals.get("audience", {})
        audience_guess = {
            "description": audience_data.get("description", ""),
            "segments": audience_data.get("segments", []),
            "confidence": audience_data.get("confidence", 0.5),
            "evidence": audience_data.get("evidence", [])[:5],
            "content_appeal": audience_data.get("content_appeal", ""),
        }

        # ── Commercial signals ──
        commercial_data = analyzed_signals.get("commercial", {})
        commercial_signals = {
            "has_brand_or_product_signal": commercial_data.get("has_commercial_signal", False),
            "categories": commercial_data.get("categories", []),
            "evidence": commercial_data.get("evidence", [])[:8],
            "overall_confidence": commercial_data.get("overall_confidence", 0.0),
            "note": commercial_data.get("note", ""),
        }

        # ── Limitations ──
        limitations = self._assess_limitations(notes, extraction_status, analyzed_signals)

        # ── Confidence ──
        confidence = self._compute_confidence(extraction_status, len(notes), analyzed_signals)

        return {
            "basic_info": basic_info,
            "content_topics": content_topics,
            "inferred_signals": inferred_signals,
            "style_profile": style_profile,
            "audience_guess": audience_guess,
            "commercial_signals": commercial_signals,
            "limitations": limitations,
            "confidence": confidence,
            "synthesized_at": datetime.now(timezone.utc).isoformat(),
            "platforms_used": raw_data.get("platforms", []),
            "platform_profiles": resolved.get("platform_profiles", {}),
            "successful_platforms": raw_data.get("successful_platforms", 0),
            "sources": {
                "notes_collected": len(notes),
                "notes_with_body": sum(
                    1 for n in notes if str(n.get("text", "")) != str(n.get("title", ""))
                ),
                "analyzer_version": "llm-v2",
                "llm_errors": [
                    k for k in ["topics", "skills", "style", "audience", "commercial"]
                    if "error" in analyzed_signals.get(k, {})
                ],
            },
        }

    @staticmethod
    def _assess_limitations(
        notes: list[dict[str, Any]],
        status: dict[str, Any],
        signals: dict[str, Any],
    ) -> list[str]:
        limitations: list[str] = []

        if not notes:
            limitations.append("No public notes were extracted; profile is limited to homepage-level evidence.")
        elif len(notes) < 5:
            limitations.append("Only a small number of notes were extracted; avoid over-generalizing the profile.")

        if status.get("partial"):
            limitations.append("Extraction completed with partial warnings; inspect raw evidence before matching.")

        body_count = sum(
            1 for n in notes if str(n.get("text", "")) != str(n.get("title", ""))
        )
        if not body_count:
            limitations.append("Note body text could not be extracted; signals are inferred from titles alone.")
        else:
            limitations.append(
                f"Body text extracted for {body_count} notes; "
                "remaining notes have title-only evidence."
            )

        for key in ["topics", "skills", "style", "audience", "commercial"]:
            if "error" in signals.get(key, {}):
                limitations.append(f"LLM analysis failed for '{key}': {signals[key]['error']}")

        return limitations

    @staticmethod
    def _compute_confidence(
        status: dict[str, Any],
        note_count: int,
        signals: dict[str, Any],
    ) -> float:
        if not status.get("success"):
            return 0.0
        score = 0.35
        if note_count:
            score += min(0.2, note_count / 40)

        topics = signals.get("topics", {})
        if not topics.get("error") and topics.get("topics"):
            score += 0.15

        skills = signals.get("skills", {})
        if not skills.get("error") and skills.get("skills_inferred"):
            score += 0.15

        style = signals.get("style", {})
        if not style.get("error") and (style.get("writing_style") or style.get("tone")):
            score += 0.1

        audience = signals.get("audience", {})
        if not audience.get("error") and audience.get("description"):
            score += 0.1

        if status.get("partial"):
            score -= 0.1

        llm_conf = 0.0
        for key in ["topics", "skills", "style", "audience"]:
            conf_val = signals.get(key, {}).get("confidence", 0)
            if isinstance(conf_val, (int, float)) and conf_val > 0:
                llm_conf = max(llm_conf, conf_val)
        score += llm_conf * 0.1

        return round(max(0.0, min(0.95, score)), 2)

    def save_profile(self, profile: dict[str, Any], path: Path | None = None) -> Path:
        out_path = path or Path("outputs/final_profile.json")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(
            json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return out_path
