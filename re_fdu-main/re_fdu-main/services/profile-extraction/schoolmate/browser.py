# schoolmate/browser.py
"""Playwright-backed browser primitives, singleton-managed.

Wraps `playwright.sync_api` for the synchronous collector code style used
elsewhere in this package. The persistent context (cookies, localStorage,
extension state) is stored at `BROWSER_USER_DATA_DIR` so the user logs in
once via `xhs_login.bat` and subsequent headless collect runs reuse it.

Public surface (kept deliberately small, mirroring the 7 primitives the
legacy `extract_xhs_profile.py` exposed plus a login helper):

    get_context(headless=True) -> BrowserContext
    new_page(url=None, headless=True) -> Page
    navigate(page, url, wait_until="networkidle")
    eval_js(page, script) -> Any
    scroll(page, dy=2000)
    click(page, selector, timeout=5000)
    go_back(page)
    close(page)
    login_session(initial_url) -> contextmanager yielding Page

The module also exports legacy aliases (`create_tab`, `close_tab`) so the
linkedin/zhihu collectors can transition with a single import-line change.
"""

from __future__ import annotations

import atexit
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from playwright.sync_api import (
    BrowserContext,
    Page,
    Playwright,
    sync_playwright,
)

from schoolmate.config import (
    BROWSER_HEADLESS_DEFAULT,
    BROWSER_USER_DATA_DIR,
    BROWSER_VIEWPORT_HEIGHT,
    BROWSER_VIEWPORT_WIDTH,
)


class LoginRequired(RuntimeError):
    """Raised when a collector detects the persistent context is logged out.

    The caller should surface a clear message instructing the user to
    re-run the platform's login helper (e.g. xhs_login.bat).
    """


_state_lock = threading.Lock()
_playwright: Playwright | None = None
_context: BrowserContext | None = None
_context_headless: bool | None = None


def _ensure_user_data_dir() -> Path:
    path = Path(BROWSER_USER_DATA_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_context(*, headless: bool | None = None) -> BrowserContext:
    """Lazily start Playwright and launch the persistent context.

    Subsequent calls within the same process reuse the cached context.
    Changing the headless mode mid-process is unsupported (raises) since
    Playwright doesn't allow swapping it on a running context — collectors
    and login-mode tools live in separate process invocations anyway.
    """
    global _playwright, _context, _context_headless

    headless_resolved = BROWSER_HEADLESS_DEFAULT if headless is None else headless

    with _state_lock:
        if _context is not None:
            if _context_headless != headless_resolved:
                raise RuntimeError(
                    f"Browser context already running in headless={_context_headless}; "
                    f"cannot switch to headless={headless_resolved} in the same process."
                )
            return _context

        _playwright = sync_playwright().start()
        user_data_dir = _ensure_user_data_dir()
        _context = _playwright.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            headless=headless_resolved,
            viewport={"width": BROWSER_VIEWPORT_WIDTH, "height": BROWSER_VIEWPORT_HEIGHT},
            args=[
                "--disable-blink-features=AutomationControlled",  # softens basic bot detection
            ],
        )
        _context_headless = headless_resolved
        atexit.register(_shutdown)
        return _context


def _shutdown() -> None:
    """Best-effort cleanup at interpreter exit."""
    global _playwright, _context
    try:
        if _context is not None:
            _context.close()
    except Exception:
        pass
    try:
        if _playwright is not None:
            _playwright.stop()
    except Exception:
        pass
    _context = None
    _playwright = None


# ────────────────────────────────────────────────────────────────────────
# Primitives
# ────────────────────────────────────────────────────────────────────────

def new_page(url: str | None = None, *, headless: bool | None = None) -> Page:
    """Open a new tab in the persistent context, optionally navigating to URL."""
    ctx = get_context(headless=headless)
    page = ctx.new_page()
    if url is not None:
        navigate(page, url)
    return page


def navigate(page: Page, url: str, *, wait_until: str = "networkidle", timeout: int = 30_000) -> None:
    page.goto(url, wait_until=wait_until, timeout=timeout)


def eval_js(page: Page, script: str) -> Any:
    """Evaluate a JavaScript expression in the page context.

    Playwright auto-handles `() => {...}` arrow IIFEs; passing the raw
    expression is the most legacy-compatible form.
    """
    return page.evaluate(script)


def scroll(page: Page, dy: int = 2000) -> None:
    page.evaluate(f"window.scrollBy(0, {int(dy)})")


def click(page: Page, selector: str, *, timeout: int = 5_000) -> None:
    page.click(selector, timeout=timeout)


def go_back(page: Page) -> None:
    page.go_back(wait_until="networkidle")


def close(page: Page) -> None:
    try:
        page.close()
    except Exception:
        pass


def page_snapshot(page: Page) -> dict[str, Any]:
    """Legacy compatibility stub for the old CDP page_snapshot primitive.

    The original returned a full DOM snapshot for offline analysis. With
    Playwright, prefer eval_js + targeted selectors. This stub returns the
    visible text + URL so WIP collectors (linkedin/zhihu) import cleanly
    and can be rewritten in Phase 3/4.
    """
    try:
        return {
            "url": page.url,
            "text": page.evaluate("document.body ? document.body.innerText : ''"),
            "title": page.title(),
        }
    except Exception:
        return {"url": "", "text": "", "title": ""}


# ────────────────────────────────────────────────────────────────────────
# Login helper
# ────────────────────────────────────────────────────────────────────────

@contextmanager
def login_session(initial_url: str) -> Iterator[Page]:
    """Open a headed page on `initial_url` for the user to manually log in.

    Yields the Page to the caller, which is expected to block on stdin
    (e.g. `input("...")`) until the user finishes the login flow. On exit
    the page is closed; cookies and localStorage persist in the user data
    directory automatically.
    """
    page = new_page(initial_url, headless=False)
    try:
        yield page
    finally:
        close(page)


# ────────────────────────────────────────────────────────────────────────
# Legacy aliases (drop-in for `from extract_xhs_profile import ...`)
# ────────────────────────────────────────────────────────────────────────

# These let linkedin_collector.py / zhihu_collector.py transition with a
# single import-line change. The semantics differ slightly from the
# original CDP-proxy primitives (page-object oriented vs string targets),
# but their collect() flows are WIP and will be rewritten in Phase 3/4.

create_tab = new_page
close_tab = close
