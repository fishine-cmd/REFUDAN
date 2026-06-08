"""Aggregate collected data and LLM signals into a grounded profile."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ProfileSynthesizer:
    """Aggregate analyzed signals and raw profile data into a unified profile."""

    def synthesize(
        self,
        raw_data: dict[str, Any],
        analyzed_signals: dict[str, Any],
    ) -> dict[str, Any]:
        resolved = raw_data.get("resolved_profile", {})
        notes = raw_data.get("notes", [])
        extraction_status = raw_data.get("extraction_status", {})
        manual_profile = self._normalize_manual_profile(
            raw_data.get("user_context", {}).get("manual_profile", {})
            if isinstance(raw_data.get("user_context", {}), dict)
            else {}
        )

        skills_data = analyzed_signals.get("skills", {}) or {}
        style_data = analyzed_signals.get("style", {}) or {}
        topics_data = analyzed_signals.get("topics", {}) or {}
        audience_data = analyzed_signals.get("audience", {}) or {}
        commercial_data = analyzed_signals.get("commercial", {}) or {}

        basic_info = {
            "display_name": resolved.get("nickname", ""),
            "platforms": raw_data.get("platforms", []),
            "bio": resolved.get("bio", ""),
            "profile_url": resolved.get("profile_url", ""),
        }
        if "platform_profiles" in resolved:
            basic_info["platform_profiles"] = resolved["platform_profiles"]

        content_topics = self._build_content_topics(topics_data)
        education, possible_education = self._build_education(skills_data, manual_profile, notes)
        career_domains, possible_domains = self._build_career_domains(skills_data)
        possible_signals = self._build_possible_signals(
            skills_data.get("possible_signals", {}),
            possible_education,
            possible_domains,
            manual_profile,
        )

        inferred_signals = {
            "education": education,
            "career_domains": career_domains,
            "skills_inferred": self._clean_string_list(skills_data.get("skills_inferred", []), limit=12),
            "interests": self._clean_string_list(skills_data.get("interests", []), limit=12),
            "industry_signals": self._clean_string_list(skills_data.get("industry_signals", []), limit=12),
            "content_roles": self._clean_content_roles(skills_data.get("content_roles", [])),
            "stated_goal": manual_profile.get("goal") or "unknown",
        }

        style_profile = {
            "writing_style": self._clean_string_list(style_data.get("writing_style", []), limit=8),
            "visual_style": self._clean_string_list(style_data.get("visual_style", []), limit=8),
            "tone": self._clean_string_list(style_data.get("tone", []), limit=8),
            "title_patterns": style_data.get("title_patterns", []),
            "language_complexity": style_data.get("language_complexity", "moderate"),
            "emoji_usage": style_data.get("emoji_usage", "minimal"),
            "hashtag_usage": style_data.get("hashtag_usage", "minimal"),
            "avg_post_length": style_data.get("avg_post_length", "medium"),
        }

        audience_guess = {
            "description": audience_data.get("description", ""),
            "segments": self._clean_string_list(audience_data.get("segments", []), limit=8),
            "confidence": audience_data.get("confidence", 0.5),
            "evidence": self._clean_string_list(audience_data.get("evidence", []), limit=5),
            "content_appeal": audience_data.get("content_appeal", ""),
        }

        commercial_signals = {
            "has_brand_or_product_signal": commercial_data.get("has_commercial_signal", False),
            "categories": self._clean_string_list(commercial_data.get("categories", []), limit=8),
            "evidence": self._clean_string_list(commercial_data.get("evidence", []), limit=8),
            "overall_confidence": commercial_data.get("overall_confidence", 0.0),
            "note": commercial_data.get("note", ""),
        }

        limitations = self._assess_limitations(notes, extraction_status, analyzed_signals, possible_signals)
        confidence = self._compute_confidence(extraction_status, len(notes), analyzed_signals)

        return {
            "basic_info": basic_info,
            "declared_profile": {
                "school": manual_profile.get("school") or "",
                "major": manual_profile.get("major") or "",
                "gpa": manual_profile.get("gpa") or "",
                "goal": manual_profile.get("goal") or "",
                "source": "user_input" if any(manual_profile.values()) else "none",
            },
            "content_topics": content_topics,
            "inferred_signals": inferred_signals,
            "possible_signals": possible_signals,
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
                    key for key in ["topics", "skills", "style", "audience", "commercial"]
                    if "error" in analyzed_signals.get(key, {})
                ],
                "collection_diagnostics": raw_data.get("diagnostics", {}),
            },
        }

    def _build_content_topics(self, topics_data: dict[str, Any]) -> list[dict[str, Any]]:
        topics: list[dict[str, Any]] = []
        for item in topics_data.get("topics", []) or []:
            if not isinstance(item, dict):
                continue
            topic = str(item.get("topic", "")).strip()
            if not topic:
                continue
            topics.append(
                {
                    "topic": topic,
                    "post_count": item.get("post_count", 0),
                    "confidence": item.get("confidence", 0.5),
                    "evidence": self._clean_string_list(item.get("evidence", []), limit=5),
                }
            )
        topics.sort(key=lambda value: value.get("post_count", 0), reverse=True)
        return topics

    def _build_education(
        self,
        skills_data: dict[str, Any],
        manual_profile: dict[str, str],
        notes: list[dict[str, Any]],
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        raw_education = skills_data.get("education", {}) if isinstance(skills_data.get("education", {}), dict) else {}
        evidence = self._clean_string_list(raw_education.get("evidence", []), limit=8)
        note_texts = self._flatten_note_texts(notes)
        education_confidence = self._to_float(raw_education.get("confidence"), fallback=self._to_float(skills_data.get("confidence"), 0.0))

        manual_school = manual_profile.get("school", "")
        manual_major = manual_profile.get("major", "")
        manual_gpa = manual_profile.get("gpa", "")
        manual_goal = manual_profile.get("goal", "")

        education = {
            "school": [manual_school] if manual_school else [],
            "major": [manual_major] if manual_major else [],
            "grade_level": [],
            "gpa": [manual_gpa] if manual_gpa else [],
            "certifications": self._clean_string_list(raw_education.get("certifications", []), limit=8),
            "goal": [manual_goal] if manual_goal else [],
            "evidence": [],
            "source": "user_input" if any([manual_school, manual_major, manual_gpa, manual_goal]) else "unknown",
            "status": "user_provided" if any([manual_school, manual_major, manual_gpa, manual_goal]) else "unknown",
            "confidence": 1.0 if any([manual_school, manual_major, manual_gpa, manual_goal]) else 0.0,
        }

        possible_education: dict[str, Any] = {}
        possible_notes: list[str] = []
        for field in ("school", "major", "grade_level"):
            candidates = self._clean_string_list(raw_education.get(field, []), limit=4)
            if not candidates:
                continue
            manual_value = manual_profile.get(field, "") if field in ("school", "major") else ""
            confirmed: list[str] = []
            weak: list[str] = []
            for candidate in candidates:
                if field in ("school", "major") and manual_value:
                    if self._same_text(candidate, manual_value):
                        continue
                    weak.append(candidate)
                    possible_notes.append(f"Social inference for {field} conflicted with user input and was demoted.")
                    continue
                if self._is_high_risk_candidate_confirmed(candidate, evidence, note_texts, education_confidence):
                    confirmed.append(candidate)
                else:
                    weak.append(candidate)
            if confirmed and not education.get(field):
                education[field] = confirmed[:1]
                education["evidence"] = self._supporting_evidence_for_candidates(confirmed, evidence, note_texts)
                education["source"] = "social_evidence"
                education["status"] = "social_evidence"
                education["confidence"] = max(education["confidence"], round(education_confidence, 2))
            if weak:
                possible_education[field] = weak

        if not education["grade_level"] and possible_education.get("grade_level"):
            possible_notes.append("Grade level evidence did not meet the confirmation threshold.")

        if possible_education:
            possible_education["evidence"] = evidence
            possible_education["confidence"] = round(education_confidence, 2)
            if possible_notes:
                possible_education["notes"] = possible_notes

        return education, possible_education

    def _build_career_domains(self, skills_data: dict[str, Any]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
        raw_domains = skills_data.get("career_domains", {})
        skills_confidence = self._to_float(skills_data.get("confidence"), 0.0)
        confirmed: dict[str, list[str]] = {}
        possible: dict[str, list[str]] = {}

        if isinstance(raw_domains, dict) and (
            isinstance(raw_domains.get("confirmed"), dict) or isinstance(raw_domains.get("possible"), dict)
        ):
            for domain, evidence in (raw_domains.get("confirmed", {}) or {}).items():
                cleaned = self._clean_string_list(evidence, limit=6)
                if cleaned:
                    confirmed[str(domain).strip()] = cleaned
            for domain, evidence in (raw_domains.get("possible", {}) or {}).items():
                cleaned = self._clean_string_list(evidence, limit=6)
                if cleaned:
                    possible[str(domain).strip()] = cleaned
        elif isinstance(raw_domains, dict):
            for domain, evidence in raw_domains.items():
                domain_name = str(domain).strip()
                cleaned = self._clean_string_list(evidence, limit=6)
                if not domain_name or not cleaned:
                    continue
                if len(cleaned) >= 2 and skills_confidence >= 0.75:
                    confirmed[domain_name] = cleaned
                else:
                    possible[domain_name] = cleaned

        return confirmed, possible

    def _build_possible_signals(
        self,
        raw_possible: Any,
        possible_education: dict[str, Any],
        possible_domains: dict[str, list[str]],
        manual_profile: dict[str, str],
    ) -> dict[str, Any]:
        result = {
            "education": {},
            "career_domains": {},
            "notes": [],
        }
        if isinstance(raw_possible, dict):
            raw_education = raw_possible.get("education", {})
            if isinstance(raw_education, dict):
                result["education"] = {
                    **{k: v for k, v in raw_education.items() if v},
                    **possible_education,
                }
            else:
                result["education"] = possible_education

            raw_domains = raw_possible.get("career_domains", {})
            if isinstance(raw_domains, dict):
                cleaned_domains = {
                    str(key).strip(): self._clean_string_list(value, limit=6)
                    for key, value in raw_domains.items()
                    if str(key).strip()
                }
                result["career_domains"] = {
                    **{k: v for k, v in cleaned_domains.items() if v},
                    **possible_domains,
                }
            else:
                result["career_domains"] = possible_domains

            result["notes"] = self._clean_string_list(raw_possible.get("notes", []), limit=8)
        else:
            result["education"] = possible_education
            result["career_domains"] = possible_domains

        if any(manual_profile.values()) and result["education"]:
            result["notes"] = result["notes"] + [
                "User-declared school/major/GPA/goal were treated as ground truth and conflicting social guesses were downgraded."
            ]

        result["notes"] = self._clean_string_list(result["notes"], limit=10)
        result["education"] = {key: value for key, value in result["education"].items() if value}
        result["career_domains"] = {key: value for key, value in result["career_domains"].items() if value}
        return result

    @staticmethod
    def _assess_limitations(
        notes: list[dict[str, Any]],
        status: dict[str, Any],
        signals: dict[str, Any],
        possible_signals: dict[str, Any],
    ) -> list[str]:
        limitations: list[str] = []

        if not notes:
            limitations.append("No public notes were extracted; profile is limited to homepage-level evidence.")
        elif len(notes) < 5:
            limitations.append("Only a small number of notes were extracted; avoid over-generalizing the profile.")

        if status.get("partial"):
            limitations.append("Extraction completed with partial warnings; inspect raw evidence before matching.")

        body_count = sum(
            1 for note in notes if str(note.get("text", "")) != str(note.get("title", ""))
        )
        if not body_count:
            limitations.append("Note body text could not be extracted; signals are inferred from titles alone.")
        elif body_count < len(notes):
            limitations.append(
                f"Body text extracted for {body_count} notes; remaining notes have title-only evidence."
            )

        if possible_signals.get("education") or possible_signals.get("career_domains"):
            limitations.append("Some education or career signals were downgraded to possible_signals because evidence was weak.")

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

    @staticmethod
    def _normalize_manual_profile(manual_profile: dict[str, Any]) -> dict[str, str]:
        keys = ("school", "major", "gpa", "goal")
        return {
            key: str(manual_profile.get(key, "") or "").strip()
            for key in keys
        }

    @staticmethod
    def _clean_string_list(values: Any, limit: int = 10) -> list[str]:
        if not isinstance(values, list):
            return []
        out: list[str] = []
        seen: set[str] = set()
        for value in values:
            text = str(value or "").strip()
            if not text:
                continue
            lowered = text.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            out.append(text)
            if len(out) >= limit:
                break
        return out

    @staticmethod
    def _clean_content_roles(values: Any) -> list[dict[str, str]]:
        if not isinstance(values, list):
            return []
        roles: list[dict[str, str]] = []
        seen: set[str] = set()
        for value in values:
            if not isinstance(value, dict):
                continue
            role = str(value.get("role", "") or "").strip()
            evidence = str(value.get("evidence", "") or "").strip()
            if not role or role.lower() in seen:
                continue
            seen.add(role.lower())
            roles.append({"role": role, "evidence": evidence})
        return roles[:10]

    @staticmethod
    def _flatten_note_texts(notes: list[dict[str, Any]]) -> list[str]:
        out: list[str] = []
        for note in notes:
            if not isinstance(note, dict):
                continue
            title = str(note.get("title", "") or "").strip()
            text = str(note.get("text", "") or "").strip()
            tags = note.get("tags", [])
            combined = "\n".join(
                part for part in [
                    title,
                    text if text and text != title else "",
                    ", ".join(str(tag).strip() for tag in tags[:10]) if isinstance(tags, list) else "",
                ] if part
            )
            if combined:
                out.append(combined)
        return out

    @staticmethod
    def _same_text(left: str, right: str) -> bool:
        return left.strip().lower() == right.strip().lower()

    @staticmethod
    def _to_float(value: Any, fallback: float = 0.0) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return fallback

    def _is_high_risk_candidate_confirmed(
        self,
        candidate: str,
        evidence: list[str],
        note_texts: list[str],
        confidence: float,
    ) -> bool:
        candidate_lower = candidate.strip().lower()
        if not candidate_lower:
            return False
        if confidence < 0.8:
            return False
        if any(candidate_lower in text.lower() for text in note_texts):
            return True
        evidence_hits = sum(1 for item in evidence if candidate_lower in item.lower())
        return evidence_hits >= 1

    def _supporting_evidence_for_candidates(
        self,
        candidates: list[str],
        evidence: list[str],
        note_texts: list[str],
    ) -> list[str]:
        candidate_lowers = [candidate.lower() for candidate in candidates]
        supports: list[str] = []
        for item in evidence + note_texts:
            lowered = item.lower()
            if any(candidate in lowered for candidate in candidate_lowers):
                supports.append(item.strip())
        return self._clean_string_list(supports, limit=6)

    def save_profile(self, profile: dict[str, Any], path: Path | None = None) -> Path:
        out_path = path or Path("outputs/final_profile.json")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(
            json.dumps(profile, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return out_path
