# schoolmate/collectors/dispatcher.py
"""Multi-platform parallel collector dispatcher.

Users input any number of accounts from any supported platform.
The dispatcher auto-detects each platform type and triggers parallel
CDP scraping. Platform failures are isolated — one failing collector
does not block others.

Supported platforms: xiaohongshu, github, linkedin, zhihu
"""

from __future__ import annotations

import traceback
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from schoolmate.collectors.base import detect_platform
from schoolmate.collectors.github_collector import GitHubCollector
from schoolmate.collectors.linkedin_collector import LinkedInCollector
from schoolmate.collectors.xhs_collector import XHSCollector
from schoolmate.collectors.zhihu_collector import ZhihuCollector


class CollectorDispatcher:
    """Auto-detect platform types and run all collectors in parallel.

    Usage:
        dispatcher = CollectorDispatcher()
        result = dispatcher.dispatch([
            "193190562",                          # XHS ID
            "https://github.com/someuser",         # GitHub URL
            "https://www.linkedin.com/in/name",    # LinkedIn URL
            "https://www.zhihu.com/people/abc",    # Zhihu URL
        ])
    """

    def __init__(
        self,
        max_workers: int = 6,
        xhs_max_notes: int = 20,
        github_max_repos: int = 10,
        linkedin_max_sections: int = 10,
        zhihu_max_items: int = 20,
    ):
        self.max_workers = max_workers
        self.defaults = {
            "xiaohongshu": {"max_notes": xhs_max_notes},
            "github": {"max_repos": github_max_repos},
            "linkedin": {"max_sections": linkedin_max_sections},
            "zhihu": {"max_items": zhihu_max_items},
        }

    def dispatch(
        self,
        accounts: list[dict[str, str]] | list[str],
        display_name_hint: str | None = None,
    ) -> dict[str, Any]:
        """Dispatch all accounts to their respective collectors in parallel.

        Args:
            accounts: List of identifiers. Each can be a plain string or
                      {"platform": "github", "identifier": "torvalds"}.
                      Plain strings are auto-detected.
            display_name_hint: Optional display name for XHS search.

        Returns:
            Aggregated dict with all platform results merged.
        """
        # Normalize to dict format
        tasks: list[dict[str, Any]] = []
        unknowns: list[str] = []

        for item in accounts:
            if isinstance(item, dict):
                plat = item.get("platform", "")
                ident = item.get("identifier", "")
                if plat and ident:
                    tasks.append({"platform": plat, "identifier": ident})
                elif ident:
                    detected = detect_platform(ident)
                    if detected:
                        tasks.append({"platform": detected, "identifier": ident})
                    else:
                        unknowns.append(ident)
            elif isinstance(item, str):
                detected = detect_platform(item)
                if detected:
                    tasks.append({"platform": detected, "identifier": item})
                else:
                    unknowns.append(item)

        if unknowns:
            print(f"[Dispatcher] Could not detect platform for: {unknowns}")

        if not tasks:
            return self._empty_aggregate(unknowns)

        # Group tasks by platform for better logging
        by_platform = defaultdict(list)
        for t in tasks:
            by_platform[t["platform"]].append(t["identifier"])

        print(f"[Dispatcher] Dispatching {len(tasks)} account(s) across "
              f"{len(by_platform)} platform(s)...")
        for plat, idents in by_platform.items():
            print(f"  {plat}: {idents}")

        # ── Parallel execution ──
        all_raw: list[dict[str, Any]] = []
        combined_notes: list[dict[str, Any]] = []
        resolved_profiles: dict[str, dict[str, Any]] = {}
        all_warnings: list[str] = []
        success_count = 0

        with ThreadPoolExecutor(max_workers=min(self.max_workers, len(tasks))) as executor:
            future_map: dict[Any, dict[str, Any]] = {}
            for task in tasks:
                future = executor.submit(self._collect_one, task)
                future_map[future] = task

            for future in as_completed(future_map):
                task = future_map[future]
                plat = task["platform"]
                ident = task["identifier"]
                try:
                    raw = future.result()
                except Exception as e:
                    tb = traceback.format_exc()
                    raw = {
                        "platform": plat,
                        "input": {"identifier": ident, "display_name_hint": None},
                        "resolved_profile": {"nickname": "", "bio": "", "profile_url": ""},
                        "notes": [],
                        "diagnostics": {},
                        "extraction_status": {
                            "success": False, "partial": False,
                            "failure_reason": f"Exception: {e}",
                            "warnings": [f"[{plat}] {ident}: {e}\n{tb[:500]}"],
                        },
                        "collected_at": datetime.now(timezone.utc).isoformat(),
                    }

                all_raw.append(raw)
                combined_notes.extend(raw.get("notes", []))
                if raw.get("resolved_profile"):
                    resolved_profiles[plat] = raw["resolved_profile"]
                if raw.get("extraction_status", {}).get("success"):
                    success_count += 1
                for w in raw.get("extraction_status", {}).get("warnings", []):
                    all_warnings.append(f"[{plat}] {w}")

                status = "OK" if raw.get("extraction_status", {}).get("success") else "FAIL"
                print(f"  [{status}] {plat}:{ident} ({len(raw.get('notes', []))} notes)")

        # ── Aggregate ──
        platforms_used = list(set(t["platform"] for t in tasks))
        display_name = self._resolve_display_name(resolved_profiles, display_name_hint)

        aggregated = {
            "platforms": platforms_used,
            "successful_platforms": success_count,
            "input": {
                "accounts": tasks,
                "display_name_hint": display_name_hint,
                "unknowns": unknowns,
            },
            "resolved_profile": {
                "nickname": display_name,
                "bio": self._resolve_bio(resolved_profiles),
                "profile_url": "",
                "platform_profiles": resolved_profiles,
            },
            "notes": combined_notes,
            "diagnostics": {
                "per_platform": [
                    {
                        "platform": r.get("platform", ""),
                        "note_count": len(r.get("notes", [])),
                        "success": r.get("extraction_status", {}).get("success", False),
                        "warnings": r.get("extraction_status", {}).get("warnings", []),
                    }
                    for r in all_raw
                ],
            },
            "extraction_status": {
                "success": success_count > 0,
                "partial": success_count < len(tasks) or bool(all_warnings),
                "failure_reason": "" if success_count > 0 else "all platforms failed",
                "warnings": all_warnings,
            },
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }

        return aggregated

    # ── Internals ──

    def _collect_one(self, task: dict[str, Any]) -> dict[str, Any]:
        """Run a single collector task. Called from thread pool."""
        plat = task["platform"]
        ident = task["identifier"]

        if plat == "xiaohongshu":
            xc = XHSCollector()
            return xc.collect(identifier=ident, max_notes=self.defaults["xiaohongshu"]["max_notes"])

        elif plat == "github":
            gc = GitHubCollector()
            return gc.collect(username=ident, max_repos=self.defaults["github"]["max_repos"])

        elif plat == "linkedin":
            lc = LinkedInCollector()
            return lc.collect(profile_url=ident, max_sections=self.defaults["linkedin"]["max_sections"])

        elif plat == "zhihu":
            zc = ZhihuCollector()
            return zc.collect(identifier=ident, max_items=self.defaults["zhihu"]["max_items"])

        else:
            raise ValueError(f"Unknown platform: {plat}")

    @staticmethod
    def _resolve_display_name(
        profiles: dict[str, dict[str, Any]],
        hint: str | None = None,
    ) -> str:
        """Pick the best display name from resolved profiles."""
        for plat in ["xiaohongshu", "github", "linkedin", "zhihu"]:
            rp = profiles.get(plat, {})
            name = rp.get("nickname", "") or rp.get("name", "")
            if name:
                return name
        return hint or "Unknown"

    @staticmethod
    def _resolve_bio(profiles: dict[str, dict[str, Any]]) -> str:
        for plat in ["xiaohongshu", "github", "linkedin", "zhihu"]:
            rp = profiles.get(plat, {})
            bio = rp.get("bio", "")
            if bio:
                return bio
        return ""

    @staticmethod
    def _empty_aggregate(unknowns: list[str]) -> dict[str, Any]:
        return {
            "platforms": [],
            "successful_platforms": 0,
            "input": {"accounts": [], "unknowns": unknowns},
            "resolved_profile": {"nickname": "", "bio": "", "profile_url": "", "platform_profiles": {}},
            "notes": [],
            "diagnostics": {"per_platform": []},
            "extraction_status": {
                "success": False, "partial": False,
                "failure_reason": "no accounts to collect",
                "warnings": [f"Unknown platform for: {u}" for u in unknowns],
            },
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }
