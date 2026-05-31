# note_collector.py
"""NoteCollector Agent — CDP-based Xiaohongshu note scraper.

Input:  XHS identifier (XHS ID or nickname) + optional display_name_hint
Output: Standardized raw notes list (title, body, tags, time, engagement metrics)

Delegates CDP communication to extract_xhs_profile.py functions.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from extract_xhs_profile import (
    create_tab,
    close_tab,
    navigate,
    page_snapshot,
    search_user,
    choose_profile_link,
    extract_profile_page,
    enrich_notes_from_profile,
    OUTPUT_DIR,
)


class NoteCollector:
    """Collect raw notes from a Xiaohongshu profile via Edge CDP."""

    def __init__(self, output_dir: Path | None = None):
        self.output_dir = output_dir or OUTPUT_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def collect(
        self,
        identifier: str,
        display_name_hint: str | None = None,
        max_notes: int = 20,
        max_enrich: int = 8,
    ) -> dict[str, Any]:
        """Main entry point: collect notes and return structured raw data.

        Returns:
            dict with keys:
              - platform, input, resolved_profile, notes, diagnostics,
              - extraction_status, collected_at
        """
        warnings: list[str] = []
        searches: list[dict[str, Any]] = []
        target = create_tab("https://www.xiaohongshu.com/explore")

        try:
            time.sleep(4)
            initial = page_snapshot(target)
            if "登录" in initial.get("text", "") and "搜索" not in initial.get("text", ""):
                warnings.append(
                    "Page contains login elements; public content may still be visible."
                )

            # ---- Search for user ----
            for keyword in [identifier, display_name_hint or ""]:
                if not keyword:
                    continue
                result = search_user(target, keyword)
                searches.append(result)
                if result.get("links"):
                    break

            profile_url = choose_profile_link(searches, display_name_hint, identifier)

            if profile_url:
                navigate(target, profile_url)
                time.sleep(5)
                profile_data = extract_profile_page(
                    target, identifier, display_name_hint, max_notes
                )

                # Verify match
                matched = bool(
                    (identifier and identifier in json.dumps(profile_data, ensure_ascii=False))
                    or (display_name_hint and display_name_hint in json.dumps(profile_data, ensure_ascii=False))
                )
                if not matched:
                    warnings.append(
                        "Opened candidate profile but could not strongly verify match from visible text."
                    )

                notes = profile_data.pop("notes", [])
                note_ids = [n.get("note_id", "") for n in notes if n.get("note_id")]

                if note_ids:
                    body_data_list = enrich_notes_from_profile(
                        target, note_ids, max_enrich=min(max_enrich, max_notes)
                    )
                    body_by_id: dict[str, dict[str, Any]] = {
                        bd.get("note_id", ""): bd for bd in body_data_list
                    }
                    for note in notes:
                        bd = body_by_id.get(note.get("note_id", ""))
                        if bd:
                            body_text = bd.get("bodyText", "").strip()
                            if body_text:
                                note["text"] = body_text[:3000]
                            tags_from_body = bd.get("tags", [])
                            if tags_from_body:
                                existing = set(note.get("tags", []))
                                for t in tags_from_body:
                                    if t not in existing:
                                        note.setdefault("tags", []).append(t)
                            if bd.get("dateText"):
                                note["publish_time"] = bd["dateText"]
                            if bd.get("likeCount") is not None:
                                note["like_count"] = bd["likeCount"]
                            if bd.get("collectCount") is not None:
                                note["favorite_count"] = bd["collectCount"]
                            if bd.get("commentCount") is not None:
                                note["comment_count"] = bd["commentCount"]
                else:
                    notes = []
            else:
                profile_data = {
                    "nickname": display_name_hint or "",
                    "xhs_id": identifier,
                    "profile_url": "",
                    "bio": "",
                    "following_count": None,
                    "follower_count": None,
                    "likes_and_collections_count": None,
                    "location": "",
                    "notes": [],
                    "page_title": initial.get("title", ""),
                    "visible_text_excerpt": initial.get("text", "")[:3000],
                }
                warnings.append(
                    "No matching user profile link found in Xiaohongshu search results."
                )
                notes = []

            # ---- Normalize notes to standard format ----
            normalized_notes = self._normalize_notes(notes)

            result = {
                "platform": "xiaohongshu",
                "input": {
                    "identifier": identifier,
                    "display_name_hint": display_name_hint,
                },
                "resolved_profile": {
                    k: profile_data.get(k)
                    for k in [
                        "nickname", "xhs_id", "profile_url", "bio",
                        "following_count", "follower_count",
                        "likes_and_collections_count", "location",
                    ]
                },
                "notes": normalized_notes[:max_notes],
                "diagnostics": {
                    "searches": [
                        {
                            "keyword": item.get("keyword"),
                            "url": item.get("url"),
                            "title": item.get("snapshot", {}).get("title"),
                            "text_excerpt": item.get("snapshot", {}).get("text", "")[:1000],
                            "candidate_links": item.get("links", []),
                        }
                        for item in searches
                    ],
                    "page_title": profile_data.get("page_title", ""),
                    "visible_text_excerpt": profile_data.get("visible_text_excerpt", ""),
                },
                "extraction_status": {
                    "success": bool(profile_url or profile_data.get("nickname") or profile_data.get("xhs_id")),
                    "partial": bool(warnings) or not notes,
                    "failure_reason": (
                        ""
                        if (profile_url or profile_data.get("nickname") or profile_data.get("xhs_id"))
                        else "search user failed"
                    ),
                    "warnings": warnings,
                },
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }

            return result

        finally:
            close_tab(target)

    # ---- internal ----

    @staticmethod
    def _normalize_notes(notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Ensure every note has a consistent field schema."""
        out: list[dict[str, Any]] = []
        for n in notes:
            out.append({
                "note_id": n.get("note_id", ""),
                "url": n.get("url", ""),
                "title": n.get("title", ""),
                "text": n.get("text", ""),
                "tags": n.get("tags", []),
                "publish_time": n.get("publish_time", ""),
                "like_count": n.get("like_count"),
                "comment_count": n.get("comment_count"),
                "favorite_count": n.get("favorite_count"),
            })
        return out

    def save_raw(self, data: dict[str, Any], path: Path | None = None) -> Path:
        """Save raw collected data to JSON."""
        out_path = path or (self.output_dir / "raw_notes.json")
        out_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return out_path


# ---- CLI ----

def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description="NoteCollector - scrape XHS notes")
    parser.add_argument("--identifier", required=True)
    parser.add_argument("--display-name-hint", default=None)
    parser.add_argument("--max-notes", type=int, default=20)
    parser.add_argument("--max-enrich", type=int, default=8)
    args = parser.parse_args()

    collector = NoteCollector()
    try:
        data = collector.collect(
            identifier=args.identifier,
            display_name_hint=args.display_name_hint,
            max_notes=args.max_notes,
            max_enrich=args.max_enrich,
        )
    except RuntimeError as e:
        if str(e) == "Edge CDP not connected":
            print("Edge CDP not connected. Run check-deps.mjs first.")
            return 1
        raise

    out_path = collector.save_raw(data)
    print(json.dumps({
        "status": "ok" if data["extraction_status"]["success"] else "partial",
        "notes_collected": len(data.get("notes", [])),
        "warnings": data["extraction_status"].get("warnings", []),
        "output": str(out_path),
    }, ensure_ascii=False, indent=2))
    return 0 if data["extraction_status"]["success"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
