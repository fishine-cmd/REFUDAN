# config.py
"""Unified configuration for the RE:FUDAN SchoolMate pipeline.

All platform analysis shares a single LLM API key.
Configure via environment variables or set defaults here.
"""

from __future__ import annotations

import os
from pathlib import Path

# ── Project paths ──
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = PROJECT_ROOT / "prompts"
OUTPUT_DIR = PROJECT_ROOT / "outputs"
DB_DIR = PROJECT_ROOT / "data"

# ── LLM API (DeepSeek) ──
# All platform analysis uses this single key — no per-collector keys.
LLM_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
LLM_BASE_URL = os.environ.get(
    "DEEPSEEK_BASE_URL",
    "https://api.deepseek.com",
)
LLM_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
LLM_TIMEOUT = int(os.environ.get("LLM_TIMEOUT", "120"))

# ── Database ──
DATABASE_PATH = os.environ.get(
    "SCHOOLMATE_DB_PATH",
    str(DB_DIR / "schoolmate.db"),
)
FAISS_INDEX_PATH = os.environ.get(
    "SCHOOLMATE_FAISS_PATH",
    str(DB_DIR / "profiles.faiss"),
)
EMBEDDING_DIM = int(os.environ.get("SCHOOLMATE_EMBEDDING_DIM", "1024"))

# ── Browser (Playwright persistent context) ──
BROWSER_USER_DATA_DIR = os.environ.get(
    "SCHOOLMATE_BROWSER_USER_DATA_DIR",
    str(DB_DIR / "browser_profile"),
)
BROWSER_HEADLESS_DEFAULT = os.environ.get("SCHOOLMATE_BROWSER_HEADLESS", "true").lower() in ("1", "true", "yes")
BROWSER_VIEWPORT_WIDTH = int(os.environ.get("SCHOOLMATE_BROWSER_VIEWPORT_WIDTH", "1280"))
BROWSER_VIEWPORT_HEIGHT = int(os.environ.get("SCHOOLMATE_BROWSER_VIEWPORT_HEIGHT", "800"))

# ── CDP Proxy (legacy; kept for older collectors transitioning to Playwright) ──
CDP_PROXY_URL = os.environ.get(
    "CDP_PROXY_URL",
    "http://localhost:3456",
)

# ── Second Me ──
SECOND_ME_BASE_URL = os.environ.get(
    "SECOND_ME_BASE_URL",
    "https://api.second.me/v1",
)

# ── Collection defaults ──
MAX_NOTES_PER_PLATFORM = 20
MAX_REPOS_GITHUB = 10
MAX_SECTIONS_LINKEDIN = 10
MAX_ITEMS_ZHIHU = 20


def ensure_dirs() -> None:
    """Create required directories if they don't exist."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def get_api_key() -> str:
    """Return the unified LLM API key."""
    key = LLM_API_KEY
    if not key:
        raise RuntimeError(
            "No LLM API key configured. Set DEEPSEEK_API_KEY environment variable."
        )
    return key
