# schoolmate/agents/content_analyzer.py
"""ContentAnalyzer Agent — LLM-powered analysis of social media notes.

Input:  Raw notes list from collector dispatcher
Output: Structured signals (topics, skills, style, audience, commercial)

All analysis is done by LLM — zero hardcoded keywords or school/major assumptions.
Uses the unified LLM API key from schoolmate.config.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from llm_client import LLMClient, load_prompt


class ContentAnalyzer:
    """Analyze raw notes using LLM prompts for topic, skill, style, audience,
    and commercial signal extraction."""

    def __init__(
        self,
        llm: LLMClient | None = None,
        prompts_dir: str | None = None,
    ):
        self.llm = llm or LLMClient()
        self.prompts_dir = prompts_dir

    def analyze(self, raw_data: dict[str, Any]) -> dict[str, Any]:
        """Run full analysis pipeline on raw collected data.

        Returns a dict with keys:
          topics, skills, style, audience, commercial, meta
        """
        notes = raw_data.get("notes", [])
        manual_profile = (
            raw_data.get("user_context", {}).get("manual_profile", {})
            if isinstance(raw_data.get("user_context", {}), dict)
            else {}
        )
        if not notes:
            return self._empty_result("No notes to analyze.")

        note_texts = self._format_notes(notes)

        results: dict[str, Any] = {
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "note_count": len(notes),
        }

        # 1. Topic classification
        try:
            results["topics"] = self.classify_topics(note_texts)
        except Exception as e:
            results["topics"] = {"error": str(e), "topics": []}

        # 2. Skills & education & career extraction
        try:
            results["skills"] = self.extract_skills(note_texts, manual_profile)
        except Exception as e:
            results["skills"] = {"error": str(e), "skills_inferred": []}

        # 3. Style & tone analysis
        try:
            results["style"] = self.analyze_style(note_texts)
        except Exception as e:
            results["style"] = {"error": str(e), "writing_style": [], "tone": []}

        # 4. Audience inference
        try:
            topics_for_audience = results.get("topics", {})
            results["audience"] = self.infer_audience(note_texts, topics_for_audience)
        except Exception as e:
            results["audience"] = {"error": str(e), "description": ""}

        # 5. Commercial signal detection
        try:
            results["commercial"] = self.detect_commercial(note_texts)
        except Exception as e:
            results["commercial"] = {"error": str(e), "has_commercial_signal": False}

        return results

    def classify_topics(self, note_texts: list[str]) -> dict[str, Any]:
        prompt_template = load_prompt("topic_classification.txt", self.prompts_dir)
        user_msg = f"{prompt_template}\n\n--- POSTS TO ANALYZE ---\n"
        user_msg += "\n\n---\n\n".join(
            f"[Post {i + 1}]\n{t}" for i, t in enumerate(note_texts)
        )
        return self.llm.chat(
            user_msg,
            system="You classify social media posts into topics. Output valid JSON only.",
            temperature=0.3,
        )

    def extract_skills(
        self,
        note_texts: list[str],
        manual_profile: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        prompt_template = load_prompt("skills_extraction.txt", self.prompts_dir)
        user_msg = f"{prompt_template}\n"
        context_block = self._format_manual_profile(manual_profile or {})
        if context_block:
            user_msg += f"\n--- USER-DECLARED PROFILE (GROUND TRUTH) ---\n{context_block}\n"
        user_msg += "\n--- POSTS TO ANALYZE ---\n"
        user_msg += "\n\n---\n\n".join(
            f"[Post {i + 1}]\n{t}" for i, t in enumerate(note_texts)
        )
        return self.llm.chat(
            user_msg,
            system=(
                "You extract skills and high-risk professional or educational signals from social media content. "
                "Treat the user-declared profile as authoritative ground truth when present. Output valid JSON only."
            ),
            temperature=0.3,
        )

    def analyze_style(self, note_texts: list[str]) -> dict[str, Any]:
        prompt_template = load_prompt("style_analysis.txt", self.prompts_dir)
        user_msg = f"{prompt_template}\n\n--- POSTS TO ANALYZE ---\n"
        user_msg += "\n\n---\n\n".join(
            f"[Post {i + 1}]\n{t}" for i, t in enumerate(note_texts)
        )
        return self.llm.chat(
            user_msg,
            system="You analyze writing style and tone from social media content. Output valid JSON only.",
            temperature=0.3,
        )

    def infer_audience(
        self, note_texts: list[str], topics: dict[str, Any]
    ) -> dict[str, Any]:
        prompt_template = load_prompt("audience_inference.txt", self.prompts_dir)
        user_msg = f"{prompt_template}\n\n--- CONTENT TOPICS (pre-analyzed) ---\n"
        user_msg += json.dumps(topics, ensure_ascii=False, indent=2)
        user_msg += "\n\n--- POSTS ---\n"
        user_msg += "\n\n---\n\n".join(
            f"[Post {i + 1}]\n{t}" for i, t in enumerate(note_texts)
        )
        return self.llm.chat(
            user_msg,
            system="You infer audience from social media content. Output valid JSON only.",
            temperature=0.4,
        )

    def detect_commercial(self, note_texts: list[str]) -> dict[str, Any]:
        prompt_template = load_prompt("commercial_detection.txt", self.prompts_dir)
        user_msg = f"{prompt_template}\n\n--- POSTS TO ANALYZE ---\n"
        user_msg += "\n\n---\n\n".join(
            f"[Post {i + 1}]\n{t}" for i, t in enumerate(note_texts)
        )
        return self.llm.chat(
            user_msg,
            system="You detect commercial signals in social media content. Output valid JSON only.",
            temperature=0.2,
        )

    @staticmethod
    def _format_notes(notes: list[dict[str, Any]], body: bool = True) -> list[str]:
        out: list[str] = []
        for n in notes:
            title = n.get("title", "")
            text = n.get("text", "")
            tags = n.get("tags", [])
            parts = [title]
            if body and text and text != title:
                parts.append(text[:800])
            if tags:
                parts.append("Tags: " + ", ".join(tags[:10]))
            out.append("\n".join(parts).strip())
        return out

    @staticmethod
    def _empty_result(reason: str) -> dict[str, Any]:
        return {
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "note_count": 0,
            "error": reason,
            "topics": {"topics": [], "dominant_themes": []},
            "skills": {
                "skills_inferred": [],
                "education": {},
                "career_domains": {},
                "content_roles": [],
                "possible_signals": {},
            },
            "style": {"writing_style": [], "tone": [], "visual_style": []},
            "audience": {"description": "", "segments": []},
            "commercial": {"has_commercial_signal": False, "categories": [], "evidence": []},
        }

    @staticmethod
    def _format_manual_profile(manual_profile: dict[str, Any]) -> str:
        cleaned = {
            key: str(value).strip()
            for key, value in (manual_profile or {}).items()
            if str(value or "").strip()
        }
        if not cleaned:
            return ""
        return json.dumps(cleaned, ensure_ascii=False, indent=2)

    def save_signals(self, signals: dict[str, Any], path: Path | None = None) -> Path:
        out_path = path or Path("outputs/analyzed_signals.json")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(
            json.dumps(signals, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return out_path
