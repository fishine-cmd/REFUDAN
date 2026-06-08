"""Shared Xiaohongshu login-state helpers for real Chrome/CDP flows."""

from __future__ import annotations

import time
from typing import Any

from schoolmate.browser import navigate

HOME_URL = "https://www.xiaohongshu.com"

JS_CHECK_LOGIN_READY = r"""
(() => {
  const unref = (x) => (x && typeof x === 'object' && x.__v_isRef)
    ? (x._value !== undefined ? x._value : x._rawValue) : x;
  const S = window.__INITIAL_STATE__;
  let loginState = 'unknown';
  if (S && S.user) {
    const li = unref(S.user.loggedIn);
    if (li === true) loginState = 'logged_in';
    else if (li === false) loginState = 'logged_out';
  }
  const text = (document.body && document.body.innerText) || '';
  const hasProfileLink = !!document.querySelector('a[href*="/user/profile/"]');
  const hasCaptchaText = text.includes('请通过验证');
  const hasWebSession = document.cookie.includes('web_session=');
  return { loginState, hasProfileLink, hasCaptchaText, hasWebSession, url: location.href };
})()
"""


def cookies_to_dict(cookies: list[dict[str, object]]) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in cookies:
        name = str(item.get("name", "")).strip()
        value = str(item.get("value", "")).strip()
        if name:
            result[name] = value
    return result


def read_login_markers(page: Any, eval_js_fn: Any) -> dict[str, Any]:
    current_url = page.url or ""
    cookie_has_web_session = False
    try:
        cookie_dict = cookies_to_dict(page.context.cookies())
        cookie_has_web_session = bool(cookie_dict.get("web_session"))
    except Exception:
        cookie_has_web_session = False

    try:
        state = eval_js_fn(page, JS_CHECK_LOGIN_READY) or {}
    except Exception:
        state = {}

    markers = state if isinstance(state, dict) else {}
    login_state = str(markers.get("loginState", "unknown"))
    has_profile_link = bool(markers.get("hasProfileLink"))
    has_web_session = bool(markers.get("hasWebSession")) or cookie_has_web_session
    has_captcha_text = bool(markers.get("hasCaptchaText"))
    redirected = any(token in current_url for token in ("website-login", "captcha", "error_code"))

    return {
        "ready": login_state == "logged_in" or has_profile_link or has_web_session,
        "login_state": login_state,
        "has_profile_link": has_profile_link,
        "has_web_session": has_web_session,
        "has_captcha_text": has_captcha_text,
        "redirected": redirected,
        "url": current_url,
    }


def ensure_home_login_ready(
    page: Any,
    eval_js_fn: Any,
    *,
    attempts: int = 14,
    sleep_seconds: float = 0.5,
) -> dict[str, Any]:
    navigate(page, HOME_URL)
    time.sleep(2)

    last = read_login_markers(page, eval_js_fn)
    for _ in range(max(1, attempts)):
        if last["ready"] or last["has_captcha_text"] or last["redirected"]:
            return last
        time.sleep(sleep_seconds)
        last = read_login_markers(page, eval_js_fn)
    return last


def format_login_markers(markers: dict[str, Any]) -> str:
    return (
        f"url={markers.get('url', '')}, "
        f"login_state={markers.get('login_state', 'unknown')}, "
        f"profile_link={bool(markers.get('has_profile_link'))}, "
        f"cookie={bool(markers.get('has_web_session'))}, "
        f"captcha={bool(markers.get('has_captcha_text'))}"
    )
