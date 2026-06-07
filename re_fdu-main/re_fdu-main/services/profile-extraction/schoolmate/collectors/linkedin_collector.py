# schoolmate/collectors/linkedin_collector.py
"""LinkedIn public profile collector.

WIP: implementation pending Phase 4. DOM selectors and flow are
unverified and the scraping logic below is the legacy CDP-based skeleton.
collect() will likely return empty_result() until rewritten with
Playwright-aware selectors and LinkedIn-specific anti-bot handling.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from schoolmate.browser import create_tab, close_tab, page_snapshot, eval_js, scroll
from schoolmate.collectors.base import BaseCollector, normalize_note


class LinkedInCollector(BaseCollector):
    """Scrape public LinkedIn profile (no login — public-view data only)."""

    platform = "linkedin"

    def collect(
        self,
        profile_url: str,
        max_sections: int = 10,
    ) -> dict[str, Any]:
        warnings: list[str] = []
        notes: list[dict[str, Any]] = []

        if "linkedin.com" not in profile_url:
            profile_url = f"https://www.linkedin.com/in/{profile_url}"

        target = create_tab(profile_url)
        try:
            time.sleep(5)
            snapshot = page_snapshot(target)

            text = snapshot.get("text", "")
            if "sign-in" in text.lower() and "experience" not in text.lower():
                warnings.append(
                    "LinkedIn returned login/sign-in page; public profile may not be accessible. "
                    "Try viewing the profile in an incognito window first."
                )

            profile_data = self._scrape_public_profile(target)
            section_notes = self._scrape_sections(target, max_sections)

            if profile_data.get("name"):
                notes.append(normalize_note({
                    "note_id": "linkedin-headline",
                    "url": profile_url,
                    "title": f"{profile_data.get('name', '')} — {profile_data.get('headline', '')}",
                    "text": profile_data.get("about", ""),
                    "tags": profile_data.get("skills", []),
                    "publish_time": "",
                    "like_count": None,
                    "comment_count": None,
                    "favorite_count": None,
                }))

            notes.extend(section_notes)

            return {
                "platform": "linkedin",
                "input": {"identifier": profile_url, "display_name_hint": None},
                "resolved_profile": {
                    "nickname": profile_data.get("name", ""),
                    "bio": profile_data.get("about", "")[:500],
                    "profile_url": profile_url,
                    "headline": profile_data.get("headline", ""),
                    "location": profile_data.get("location", ""),
                    "skills": profile_data.get("skills", [])[:20],
                },
                "notes": notes,
                "diagnostics": {
                    "sections_found": len(section_notes),
                    "has_about": bool(profile_data.get("about")),
                },
                "extraction_status": {
                    "success": bool(profile_data.get("name")),
                    "partial": bool(warnings) or not profile_data.get("about"),
                    "failure_reason": "" if profile_data.get("name") else "could not extract public profile",
                    "warnings": warnings,
                },
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
        finally:
            close_tab(target)

    def _scrape_public_profile(self, target: str) -> dict[str, Any]:
        script = r"""
        (() => {
            const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const body = clean(document.body?.innerText || '');
            let name = '', headline = '', about = '', location = '';
            const lines = body.split(/\n/).map(l => l.trim()).filter(Boolean);
            if (lines.length > 0) name = lines[0].slice(0, 80);
            if (lines.length > 1) headline = lines[1].slice(0, 200);
            const aboutIdx = lines.findIndex(l => /^about$/i.test(l));
            if (aboutIdx >= 0 && lines.length > aboutIdx + 1) {
                about = lines.slice(aboutIdx + 1, aboutIdx + 8).join(' ').slice(0, 1000);
            }
            const locIdx = lines.findIndex(l => /location/i.test(l));
            if (locIdx >= 0 && lines.length > locIdx + 1) {
                location = lines[locIdx + 1] || '';
            }
            const skillsText = body.slice(0, 3000);
            const skillPatterns = [
                'Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'Vue',
                'Angular', 'Node', 'Django', 'Spring', 'Machine Learning',
                'Deep Learning', 'AI', 'Data Science', 'SQL', 'AWS', 'Azure',
                'GCP', 'Docker', 'Kubernetes', 'CI/CD', 'Git', 'Agile',
                'Product Management', 'Strategy', 'Leadership', 'Marketing',
                'Sales', 'Finance', 'Operations', 'Design', 'Research',
                'C\\+\\+', 'C#', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin',
            ];
            const foundSkills = [];
            for (const s of skillPatterns) {
                if (new RegExp('\\b' + s.replace(/[+]/g, '\\+') + '\\b', 'i').test(skillsText)) {
                    foundSkills.push(s);
                }
            }
            return { name, headline, about, location, skills: foundSkills.slice(0, 20) };
        })()
        """
        result = eval_js(target, script, timeout=20)
        return result if isinstance(result, dict) else {}

    def _scrape_sections(self, target: str, max_sections: int) -> list[dict[str, Any]]:
        notes: list[dict[str, Any]] = []
        for _ in range(3):
            scroll(target, 2000)
            time.sleep(0.8)

        script = r"""
        (() => {
            const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const sections = [];
            const body = clean(document.body?.innerText || '');
            const markers = ['Experience', 'Education', 'Licenses', 'Projects', 'Publications', 'Skills', 'Languages'];
            for (const marker of markers) {
                const idx = body.indexOf(marker);
                if (idx >= 0) {
                    sections.push({ marker, content: body.slice(idx, idx + 1500) });
                }
            }
            return sections;
        })()
        """
        sections = eval_js(target, script, timeout=15)
        if not isinstance(sections, list):
            return notes

        for i, sec in enumerate(sections[:max_sections]):
            if not isinstance(sec, dict):
                continue
            marker = sec.get("marker", "")
            content = sec.get("content", "")
            if content:
                notes.append(normalize_note({
                    "note_id": f"linkedin-{marker.lower()}-{i}",
                    "url": "",
                    "title": f"LinkedIn {marker}",
                    "text": content[:2000],
                    "tags": [marker],
                    "publish_time": "",
                    "like_count": None,
                    "comment_count": None,
                    "favorite_count": None,
                }))
        return notes
