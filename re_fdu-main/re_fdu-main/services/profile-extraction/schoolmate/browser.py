"""Playwright-backed browser primitives with optional Chrome CDP attach."""

from __future__ import annotations

import atexit
import os
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlparse

from playwright.sync_api import BrowserContext, Page, Playwright, sync_playwright

from schoolmate.config import (
    BROWSER_CDP_ENDPOINT,
    BROWSER_HEADLESS_DEFAULT,
    BROWSER_USE_CDP,
    BROWSER_USER_DATA_DIR,
    BROWSER_VIEWPORT_HEIGHT,
    BROWSER_VIEWPORT_WIDTH,
    CDP_ENDPOINT_CACHE_PATH,
)


class LoginRequired(RuntimeError):
    """Raised when the collector determines the browser login is unusable."""


_state_lock = threading.Lock()
_playwright: Playwright | None = None
_context: BrowserContext | None = None
_context_headless: bool | None = None
_cdp_browser: Any = None
_is_cdp = False

_STEALTH_JS = r"""
(() => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch (e) {}
  try {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
  } catch (e) {}
  try { Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] }); } catch (e) {}
  try { Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] }); } catch (e) {}
  try {
    const orig = navigator.permissions && navigator.permissions.query;
    if (orig) {
      navigator.permissions.query = (p) =>
        (p && p.name === 'notifications')
          ? Promise.resolve({ state: Notification.permission })
          : orig(p);
    }
  } catch (e) {}
})()
"""


def _ensure_user_data_dir() -> Path:
    path = Path(BROWSER_USER_DATA_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def is_cdp_mode() -> bool:
    return _is_cdp


def _context_score(ctx: BrowserContext) -> tuple[int, int]:
    pages = ctx.pages
    xhs_hits = 0
    for page in pages:
      try:
          url = (page.url or "").lower()
      except Exception:
          url = ""
      if "xiaohongshu.com" in url or "rednote.com" in url:
          xhs_hits += 1
    return (xhs_hits, len(pages))


def _select_cdp_context(browser: Any) -> BrowserContext:
    contexts = list(browser.contexts)
    if not contexts:
        return browser.new_context()
    contexts.sort(key=_context_score, reverse=True)
    return contexts[0]


def _append_candidate(candidates: list[str], candidate: str | None) -> None:
    value = (candidate or "").strip()
    if value and value not in candidates:
        candidates.append(value)


def _read_cached_cdp_endpoint() -> str:
    cache_path = Path(CDP_ENDPOINT_CACHE_PATH)
    if cache_path.exists():
        try:
            return cache_path.read_text(encoding="utf-8").strip()
        except Exception:
            return ""
    return ""


def _runtime_cdp_endpoint() -> str:
    return (
        os.environ.get("SCHOOLMATE_CDP_ENDPOINT", "").strip()
        or os.environ.get("CDP_PROXY_URL", "").strip()
        or BROWSER_CDP_ENDPOINT
    )


def _candidate_cdp_endpoints(endpoint: str | None = None) -> list[str]:
    candidates: list[str] = []
    _append_candidate(candidates, os.environ.get("SCHOOLMATE_CDP_ENDPOINT"))
    _append_candidate(candidates, _read_cached_cdp_endpoint())
    _append_candidate(candidates, endpoint)
    _append_candidate(candidates, _runtime_cdp_endpoint())
    _append_candidate(candidates, BROWSER_CDP_ENDPOINT)

    snapshot = list(candidates)
    for candidate in snapshot:
        parsed = urlparse(candidate)
        if parsed.scheme in ("http", "https") and parsed.netloc:
            ws_scheme = "wss" if parsed.scheme == "https" else "ws"
            _append_candidate(candidates, f"{ws_scheme}://{parsed.netloc}")
    return candidates


def _connect_cdp_browser(playwright: Playwright, endpoint: str | None = None) -> tuple[Any, str]:
    attempts: list[str] = []
    for candidate in _candidate_cdp_endpoints(endpoint):
        try:
            return playwright.chromium.connect_over_cdp(candidate), candidate
        except Exception as exc:  # noqa: BLE001
            attempts.append(f"{candidate}: {exc}")
            continue
    tried = "\n".join(f"  - {attempt}" for attempt in attempts) or "  - <none>"
    raise RuntimeError(f"All CDP attach attempts failed:\n{tried}")


def get_context(*, headless: bool | None = None) -> BrowserContext:
    global _playwright, _context, _context_headless, _cdp_browser, _is_cdp

    headless_resolved = BROWSER_HEADLESS_DEFAULT if headless is None else headless

    with _state_lock:
        if _context is not None:
            if not _is_cdp and _context_headless != headless_resolved:
                raise RuntimeError(
                    f"Browser context already running in headless={_context_headless}; "
                    f"cannot switch to headless={headless_resolved} in the same process."
                )
            return _context

        if BROWSER_USE_CDP:
            _playwright = sync_playwright().start()
            cdp_endpoint = _runtime_cdp_endpoint()
            try:
                _cdp_browser, attached_endpoint = _connect_cdp_browser(_playwright, cdp_endpoint)
            except Exception as exc:  # noqa: BLE001
                try:
                    _playwright.stop()
                except Exception:
                    pass
                _playwright = None
                raise RuntimeError(
                    "Unable to attach to Chrome over CDP "
                    f"(configured: {cdp_endpoint}): {exc}\n"
                    "Make sure Chrome is running, remote debugging is enabled at "
                    "`chrome://inspect/#remote-debugging`, and the page shows "
                    "`Server running at: 127.0.0.1:9222`. If your local CDP service is "
                    "WebSocket-only, set SCHOOLMATE_CDP_ENDPOINT to a `ws://...` endpoint."
                ) from exc

            _context = _select_cdp_context(_cdp_browser)
            _is_cdp = True
            _context_headless = False
            try:
                _context.add_init_script(_STEALTH_JS)
            except Exception:
                pass
            os.environ["SCHOOLMATE_CDP_ENDPOINT"] = attached_endpoint
            atexit.register(_shutdown)
            return _context

        _playwright = sync_playwright().start()
        user_data_dir = _ensure_user_data_dir()
        _context = _playwright.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            headless=headless_resolved,
            viewport={"width": BROWSER_VIEWPORT_WIDTH, "height": BROWSER_VIEWPORT_HEIGHT},
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-features=IsolateOrigins,site-per-process",
                "--no-default-browser-check",
                "--no-first-run",
            ],
            ignore_default_args=["--enable-automation"],
        )
        try:
            _context.add_init_script(_STEALTH_JS)
        except Exception:
            pass
        _context_headless = headless_resolved
        atexit.register(_shutdown)
        return _context


def _shutdown() -> None:
    global _playwright, _context, _cdp_browser, _is_cdp

    if _is_cdp:
        try:
            if _cdp_browser is not None:
                _cdp_browser.close()
        except Exception:
            pass
    else:
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
    _cdp_browser = None
    _is_cdp = False


def new_page(url: str | None = None, *, headless: bool | None = None) -> Page:
    ctx = get_context(headless=headless)
    page = ctx.new_page()
    if url is not None:
        navigate(page, url)
    return page


def navigate(
    page: Page,
    url: str,
    *,
    wait_until: str = "domcontentloaded",
    timeout: int = 30_000,
) -> None:
    page.goto(url, wait_until=wait_until, timeout=timeout)


def eval_js(page: Page, script: str) -> Any:
    return page.evaluate(script)


def scroll(page: Page, dy: int = 2000) -> None:
    page.evaluate(f"window.scrollBy(0, {int(dy)})")


def click(page: Page, selector: str, *, timeout: int = 5_000) -> None:
    page.click(selector, timeout=timeout)


def go_back(page: Page) -> None:
    page.go_back(wait_until="domcontentloaded")


def close(page: Page) -> None:
    try:
        page.close()
    except Exception:
        pass


def page_snapshot(page: Page) -> dict[str, Any]:
    try:
        return {
            "url": page.url,
            "text": page.evaluate("document.body ? document.body.innerText : ''"),
            "title": page.title(),
        }
    except Exception:
        return {"url": "", "text": "", "title": ""}


@contextmanager
def login_session(initial_url: str) -> Iterator[Page]:
    page = new_page(initial_url, headless=False)
    try:
        yield page
    finally:
        close(page)


create_tab = new_page
close_tab = close
