# schoolmate/collectors/base.py
"""Base collector class and platform auto-detection."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

# ── Platform auto-detection patterns ──

# ── URL-based patterns (high confidence) ──
_URL_PLATFORM_PATTERNS: list[tuple[str, str]] = [
    ("xiaohongshu", r"xiaohongshu\.com|xhslink\.com"),
    ("github", r"github\.com|github\.io"),
    ("linkedin", r"linkedin\.com/in"),
    ("zhihu", r"zhihu\.com/(?:people|p)/"),
]

# ── Non-URL heuristics (lower confidence, only for unambiguous formats) ──
# XHS user IDs are purely numeric, 8-12 digits.
_XHS_ID_PATTERN = re.compile(r"^\d{8,12}$")


def detect_platform(identifier: str) -> str | None:
    """Auto-detect the platform from an account identifier string.

    URLs are detected by domain matching. Non-URL identifiers are only
    auto-detected for unambiguous formats (e.g., all-digit XHS IDs).
    For plain usernames, use explicit 'platform:identifier' syntax.

    >>> detect_platform("https://github.com/torvalds")
    'github'
    >>> detect_platform("https://www.xiaohongshu.com/user/profile/12345678")
    'xiaohongshu'
    >>> detect_platform("https://www.linkedin.com/in/johndoe")
    'linkedin'
    >>> detect_platform("https://www.zhihu.com/people/zhangsan")
    'zhihu'
    >>> detect_platform("193190562")  # pure digit XHS ID
    'xiaohongshu'
    >>> detect_platform("someuser")  # ambiguous — returns None
    """
    # URL-based detection (highest confidence)
    if "://" in identifier:
        for platform, pattern in _URL_PLATFORM_PATTERNS:
            if re.search(pattern, identifier, re.IGNORECASE):
                return platform

    # Also check for URLs without protocol
    for platform, pattern in _URL_PLATFORM_PATTERNS:
        if re.search(pattern, identifier, re.IGNORECASE):
            return platform

    # Non-URL heuristics
    if _XHS_ID_PATTERN.match(identifier):
        return "xiaohongshu"

    return None


def classify_identifiers(
    accounts: list[str],
) -> dict[str, list[str]]:
    """Classify a list of identifiers into {platform: [identifiers]}.

    Unknown identifiers are returned under key '__unknown__'.
    """
    classified: dict[str, list[str]] = {}
    for ident in accounts:
        plat = detect_platform(ident)
        if plat:
            classified.setdefault(plat, []).append(ident)
        else:
            classified.setdefault("__unknown__", []).append(ident)
    return classified


# ── Base collector ──

_STANDARD_NOTE_KEYS = (
    "note_id", "url", "title", "text", "tags",
    "publish_time", "like_count", "comment_count", "favorite_count",
)


def normalize_note(note: dict[str, Any]) -> dict[str, Any]:
    """Ensure a note dict conforms to the standard schema."""
    return {
        k: note.get(k, "" if k in ("note_id", "url", "title", "text") else (
            [] if k == "tags" else None
        ))
        for k in _STANDARD_NOTE_KEYS
    }


class BaseCollector(ABC):
    """Abstract base for all platform collectors."""

    platform: str = "__base__"

    @abstractmethod
    def collect(self, identifier: str, **kwargs: Any) -> dict[str, Any]:
        """Collect profile data for the given identifier.

        Returns a dict with keys:
          platform, input, resolved_profile, notes, diagnostics,
          extraction_status, collected_at
        """
        ...

    @staticmethod
    def empty_result(
        platform: str,
        identifier: str,
        warnings: list[str] | None = None,
        reason: str = "collection failed",
    ) -> dict[str, Any]:
        """Create an empty/failed result dict."""
        return {
            "platform": platform,
            "input": {"identifier": identifier, "display_name_hint": None},
            "resolved_profile": {"nickname": "", "bio": "", "profile_url": ""},
            "notes": [],
            "diagnostics": {},
            "extraction_status": {
                "success": False,
                "partial": True,
                "failure_reason": reason,
                "warnings": warnings or [],
            },
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }
