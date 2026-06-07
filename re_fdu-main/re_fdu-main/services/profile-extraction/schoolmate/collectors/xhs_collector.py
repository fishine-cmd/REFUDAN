# schoolmate/collectors/xhs_collector.py
"""XHS (xiaohongshu.com) public profile + notes collector via Playwright.

Reads the user profile page, scrolls to load note cards, then clicks into
each note to extract body text, tags, and engagement counts. Uses the
shared persistent Playwright context from `schoolmate.browser` so cookies
from a prior `xhs_login.bat` run carry over.

Output schema conforms to `BaseCollector` — same shape as the GitHub /
LinkedIn / Zhihu collectors so the downstream `ProfileSynthesizer` is
platform-agnostic.
"""

from __future__ import annotations

import random
import re
import time
from datetime import datetime, timezone
from typing import Any

from schoolmate.browser import (
    LoginRequired,
    close,
    eval_js,
    navigate,
    new_page,
    scroll,
)
from schoolmate.collectors.base import BaseCollector, normalize_note

PROFILE_URL_TEMPLATE = "https://www.xiaohongshu.com/user/profile/{xhs_id}"

# Heuristic JS to detect login modal / wall.
JS_DETECT_LOGIN_WALL = """
(() => {
  const sels = [
    '.login-container',
    '[class*="login-modal"]',
    '[class*="LoginModal"]',
    '.css-1bnxg6t',  // observed login-wall class
  ];
  return sels.some(s => document.querySelector(s));
})()
"""

# Single eval_js that returns the whole profile header — robust to a few
# class-name variants XHS has shipped over the years.
JS_EXTRACT_PROFILE = r"""
(() => {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const qs = (...sels) => {
    for (const s of sels) { const el = document.querySelector(s); if (el) return el; }
    return null;
  };
  const text = (...sels) => clean(qs(...sels)?.textContent || '');
  const attr = (a, ...sels) => qs(...sels)?.getAttribute(a) || '';

  const nick = text('.user-nickname', '.nickname', '[class*="userNickname"]') ||
               clean((document.querySelector('meta[property="og:title"]')?.content || '').split('-')[0]);
  const bio = text('.user-desc', '.desc', '[class*="userDesc"]', '[class*="description"]');
  const avatar = attr('src', '.user-avatar img', '.avatar img', '[class*="avatar"] img') ||
                 (document.querySelector('meta[property="og:image"]')?.content || '');

  // Stats — XHS uses "关注 / 粉丝 / 获赞与收藏"; numbers can be "1.2万" etc.
  const parseNum = s => {
    if (!s) return null;
    s = s.replace(/[,\s]/g, '');
    const m = s.match(/^(\d+(?:\.\d+)?)(万|亿)?$/);
    if (!m) return null;
    const base = parseFloat(m[1]);
    if (m[2] === '万') return Math.round(base * 10000);
    if (m[2] === '亿') return Math.round(base * 1e8);
    return Math.round(base);
  };
  let following = null, followers = null, liked = null;
  const statNodes = document.querySelectorAll('.user-statistics > *, .stats > *, [class*="userStat"] > *');
  statNodes.forEach(n => {
    const t = clean(n.textContent);
    if (/关注/.test(t)) following = parseNum(t.match(/[\d.,万亿]+/)?.[0]);
    if (/粉丝/.test(t)) followers = parseNum(t.match(/[\d.,万亿]+/)?.[0]);
    if (/获赞|赞与收藏/.test(t)) liked = parseNum(t.match(/[\d.,万亿]+/)?.[0]);
  });

  return { nickname: nick, bio, avatar_url: avatar, following, followers, liked };
})()
"""

# Extract note cards from feed area. Each card returns href + cover + title + likes if visible.
JS_EXTRACT_NOTE_CARDS = r"""
(() => {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const cards = [];
  // Multiple class variants
  const items = document.querySelectorAll(
    'section.note-item, .feeds-container .note-item, [class*="noteItem"], a[href*="/explore/"]'
  );
  const seen = new Set();
  items.forEach(el => {
    const a = el.tagName === 'A' ? el : el.querySelector('a[href*="/explore/"], a[href*="/discovery/"]');
    if (!a) return;
    const href = a.href || a.getAttribute('href') || '';
    if (!href || seen.has(href)) return;
    seen.add(href);
    const idMatch = href.match(/(?:explore|discovery)\/([a-z0-9]+)/i);
    const note_id = idMatch ? idMatch[1] : href;
    const titleEl = el.querySelector('.title, .footer .title, [class*="title"]');
    const coverEl = el.querySelector('img');
    const likeEl = el.querySelector('.like-wrapper .count, [class*="like"] .count, [class*="LikeCount"]');
    cards.push({
      note_id,
      url: href.startsWith('http') ? href : ('https://www.xiaohongshu.com' + href),
      title: clean(titleEl?.textContent || ''),
      cover_url: coverEl?.src || '',
      like_count_text: clean(likeEl?.textContent || ''),
    });
  });
  return cards;
})()
"""

# Extract note detail from the open modal/page after clicking a card.
JS_EXTRACT_NOTE_DETAIL = r"""
(() => {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const qs = (...sels) => { for (const s of sels) { const el = document.querySelector(s); if (el) return el; } return null; };
  const text = (...sels) => clean(qs(...sels)?.textContent || '');

  const body = text(
    '.note-content .desc',
    '.note-content',
    '[class*="noteContent"]',
    '[class*="content"] > .desc',
    '#detail-desc',
  );

  const tags = Array.from(document.querySelectorAll(
    '.tag-list a, .tag, [class*="topic"] a, [class*="tag"] > a'
  )).map(a => clean(a.textContent)).filter(t => t && !/^\s*$/.test(t));

  const publish_time = text('.date', 'time', '[class*="publishTime"]', '[class*="date"]') ||
                       (qs('time')?.getAttribute('datetime') || '');

  const parseNum = s => {
    if (!s) return null;
    s = s.replace(/[,\s]/g, '');
    const m = s.match(/^(\d+(?:\.\d+)?)(万|亿)?$/);
    if (!m) return null;
    const base = parseFloat(m[1]);
    if (m[2] === '万') return Math.round(base * 10000);
    if (m[2] === '亿') return Math.round(base * 1e8);
    return Math.round(base);
  };
  const numAt = (...sels) => parseNum(text(...sels));

  return {
    text: body,
    tags: Array.from(new Set(tags)),
    publish_time,
    like_count: numAt('.like-wrapper .count', '[class*="like"] .count'),
    comment_count: numAt('.chat-wrapper .count', '[class*="comment"] .count'),
    favorite_count: numAt('.collect-wrapper .count', '[class*="collect"] .count'),
  };
})()
"""


def _sleep(lo: float, hi: float) -> None:
    time.sleep(random.uniform(lo, hi))


def _parse_int(text_val: str) -> int | None:
    if not text_val:
        return None
    m = re.match(r"^(\d+(?:\.\d+)?)\s*(万|亿)?", text_val.replace(",", "").replace(" ", ""))
    if not m:
        return None
    base = float(m.group(1))
    if m.group(2) == "万":
        return int(base * 10_000)
    if m.group(2) == "亿":
        return int(base * 1e8)
    return int(base)


class XHSCollector(BaseCollector):
    """Scrape XHS public profile + first N note bodies via Playwright."""

    platform = "xiaohongshu"

    def collect(
        self,
        identifier: str,
        max_notes: int = 10,
        max_text_chars: int = 5000,
    ) -> dict[str, Any]:
        warnings: list[str] = []
        notes: list[dict[str, Any]] = []

        xhs_id = identifier.strip()
        if not re.match(r"^\d{6,15}$", xhs_id):
            # Support full URL too
            url_match = re.search(r"user/profile/(\d+)", xhs_id)
            if url_match:
                xhs_id = url_match.group(1)
            else:
                return self.empty_result(
                    "xiaohongshu", identifier, warnings,
                    f"Invalid XHS identifier: '{identifier}' (expected numeric ID)"
                )

        profile_url = PROFILE_URL_TEMPLATE.format(xhs_id=xhs_id)
        page = new_page(profile_url)
        try:
            _sleep(1.5, 2.5)

            # Login wall / IP-risk redirect check
            try:
                current_url = page.url
                logged_out = (
                    "/website-login/" in current_url
                    or "/login" in current_url
                    or eval_js(page, JS_DETECT_LOGIN_WALL)
                )
            except Exception as e:
                warnings.append(f"login-check eval failed: {e}")
                logged_out = False
            if logged_out:
                # Distinguish IP-risk error from plain logged-out wall
                if "error_code" in (page.url or ""):
                    raise LoginRequired(
                        "XHS 检测到自动化浏览器/IP 风险,被重定向到风险提示页。"
                        "请双击 services/profile-extraction/xhs_login.bat 在带头浏览器里完成一次正常登录,"
                        "之后 XHS 会信任本机指纹"
                    )
                raise LoginRequired(
                    "XHS 登录态失效或未登录,请双击 services/profile-extraction/xhs_login.bat 完成登录后重试"
                )

            # Profile header
            try:
                profile_data = eval_js(page, JS_EXTRACT_PROFILE) or {}
            except Exception as e:
                profile_data = {}
                warnings.append(f"profile-header extract failed: {e}")

            nickname = profile_data.get("nickname") or ""
            bio = profile_data.get("bio") or ""
            avatar_url = profile_data.get("avatar_url") or ""

            # Scroll to load notes
            for _ in range(3):
                scroll(page, dy=2000)
                _sleep(1.5, 2.5)

            # Note cards
            try:
                cards = eval_js(page, JS_EXTRACT_NOTE_CARDS) or []
            except Exception as e:
                cards = []
                warnings.append(f"note-cards extract failed: {e}")
            cards = cards[:max_notes]

            # Iterate each card → click → extract → back
            for idx, card in enumerate(cards):
                try:
                    href = card.get("url") or ""
                    if not href:
                        continue
                    # Navigate directly to the note URL (more robust than clicking the card,
                    # which sometimes opens a modal and sometimes a new page depending on
                    # XHS A/B bucket).
                    navigate(page, href)
                    _sleep(2.0, 3.5)

                    try:
                        detail = eval_js(page, JS_EXTRACT_NOTE_DETAIL) or {}
                    except Exception as e:
                        detail = {}
                        warnings.append(f"note-detail extract failed for {card.get('note_id')}: {e}")

                    note_text = (detail.get("text") or "")[:max_text_chars]

                    notes.append(normalize_note({
                        "note_id": card.get("note_id") or "",
                        "url": href,
                        "title": card.get("title") or "",
                        "text": note_text,
                        "tags": detail.get("tags") or [],
                        "publish_time": detail.get("publish_time") or "",
                        "like_count": detail.get("like_count") or _parse_int(card.get("like_count_text", "")),
                        "comment_count": detail.get("comment_count"),
                        "favorite_count": detail.get("favorite_count"),
                    }))

                    # Return to profile for next iteration
                    navigate(page, profile_url)
                    _sleep(1.5, 2.5)
                except Exception as e:  # noqa: BLE001
                    warnings.append(f"note iteration #{idx} failed: {e}")

            return {
                "platform": "xiaohongshu",
                "input": {"identifier": xhs_id, "display_name_hint": None},
                "resolved_profile": {
                    "nickname": nickname,
                    "bio": bio,
                    "profile_url": profile_url,
                    "avatar_url": avatar_url,
                    "followers": profile_data.get("followers"),
                    "following": profile_data.get("following"),
                    "liked": profile_data.get("liked"),
                },
                "notes": notes,
                "diagnostics": {
                    "notes_attempted": len(cards),
                    "notes_succeeded": len(notes),
                    "notes_with_body": sum(1 for n in notes if n.get("text")),
                    "login_state": "valid",
                },
                "extraction_status": {
                    "success": bool(notes or nickname),
                    "partial": bool(warnings),
                    "failure_reason": "" if (notes or nickname) else "profile page yielded no data",
                    "warnings": warnings,
                },
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
        finally:
            close(page)
