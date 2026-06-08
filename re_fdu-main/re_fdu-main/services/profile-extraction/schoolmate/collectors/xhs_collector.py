"""Xiaohongshu collector with Chrome CDP + network-response fallbacks."""

from __future__ import annotations

import json
import random
import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs, urlparse

from schoolmate.browser import LoginRequired, close, eval_js, is_cdp_mode, navigate, new_page, scroll
from schoolmate.collectors.base import BaseCollector, normalize_note
from schoolmate.xhs_auth import HOME_URL, ensure_home_login_ready, format_login_markers, read_login_markers

PROFILE_URL_TEMPLATE = "https://www.xiaohongshu.com/user/profile/{xhs_id}"
_BARE_ID = re.compile(r"^(?:[0-9a-f]{24}|\d{6,15})$", re.IGNORECASE)
_PROFILE_PATH_RE = re.compile(r"user/profile/([0-9a-fA-F]{24}|\d{6,15})")
_URL_RE = re.compile(r"https?://[^\s]+", re.IGNORECASE)

JS_EXTRACT_STATE = r"""
(() => {
  const unref = (x) => (x && typeof x === 'object' && x.__v_isRef)
    ? (x._value !== undefined ? x._value : x._rawValue) : x;
  const S = window.__INITIAL_STATE__;
  if (!S || !S.user) return null;
  const U = S.user;
  const upd = unref(U.userPageData) || {};
  const uinfo = unref(U.userInfo) || {};
  const basic = upd.basicInfo || {};
  const cleanDesc = (d) => (d && d !== '还没有简介') ? d : '';
  const nickname = basic.nickname || uinfo.nickname || '';
  const desc = cleanDesc(basic.desc) || cleanDesc(uinfo.desc) || '';
  const avatar = basic.imageb || basic.images || uinfo.imageb || uinfo.images || '';
  const redId = basic.redId || uinfo.redId || '';
  let fans = null, follows = null, interaction = null;
  (Array.isArray(upd.interactions) ? upd.interactions : []).forEach((it) => {
    if (!it) return;
    if (it.type === 'fans') fans = it.count;
    else if (it.type === 'follows') follows = it.count;
    else if (it.type === 'interaction') interaction = it.count;
  });
  const rawNotes = unref(U.notes) || [];
  const seen = new Set();
  const list = [];
  (Array.isArray(rawNotes) ? rawNotes : []).forEach((tab) => {
    (Array.isArray(tab) ? tab : []).forEach((item) => {
      const nc = (item && (item.noteCard || item.note)) || item || {};
      const id = nc.noteId || (item && item.id) || '';
      if (!id || seen.has(id)) return;
      seen.add(id);
      const ii = nc.interactInfo || {};
      list.push({
        note_id: id,
        xsec_token: (item && item.xsecToken) || nc.xsecToken || '',
        title: nc.displayTitle || nc.title || '',
        type: nc.type || '',
        like_count: (ii.likedCount !== undefined ? ii.likedCount : null),
        cover: (nc.cover && (nc.cover.urlDefault || nc.cover.urlPre || nc.cover.url)) || '',
      });
    });
  });
  return {
    nickname, desc, avatar, redId,
    fans, follows, interaction,
    user_fetching_status: unref(U.userFetchingStatus) || '',
    notes: list,
  };
})()
"""

JS_EXTRACT_NOTE_STATE = r"""
(() => {
  const unref = (x) => (x && typeof x === 'object' && x.__v_isRef)
    ? (x._value !== undefined ? x._value : x._rawValue) : x;
  const S = window.__INITIAL_STATE__;
  if (!S || !S.note) return null;
  const ndm = unref(S.note.noteDetailMap) || {};
  const ids = Object.keys(ndm);
  if (!ids.length) return null;
  const firstId = unref(S.note.firstNoteId) || ids[0];
  const entry = ndm[firstId] || ndm[ids[0]] || {};
  const note = entry.note || {};
  const ii = note.interactInfo || {};
  const tags = (Array.isArray(note.tagList) ? note.tagList : [])
    .map((t) => t && (t.name || t.title)).filter(Boolean);
  return {
    note_id: note.noteId || firstId || '',
    title: note.title || '',
    text: note.desc || '',
    tags: tags,
    publish_time: note.time ? String(note.time) : '',
    like_count: (ii.likedCount !== undefined ? ii.likedCount : null),
    comment_count: (ii.commentCount !== undefined ? ii.commentCount : null),
    favorite_count: (ii.collectedCount !== undefined ? ii.collectedCount : null),
  };
})()
"""


def _sleep(lo: float, hi: float) -> None:
    time.sleep(random.uniform(lo, hi))


def _extract_share_url(text: str) -> str:
    match = _URL_RE.search(text)
    if not match:
        return text.strip()
    return match.group(0).rstrip("'\"),.;!?]}")


def _extract_profile_id(text: str) -> str:
    candidate = _extract_share_url(text)
    if _BARE_ID.match(candidate):
        return candidate
    match = _PROFILE_PATH_RE.search(candidate)
    return match.group(1) if match else ""


def _parse_count(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).replace(",", "").replace(" ", "").strip()
    match = re.match(r"^(\d+(?:\.\d+)?)(万|亿)?$", text)
    if not match:
        return None
    base = float(match.group(1))
    suffix = match.group(2)
    if suffix == "万":
        return int(base * 10_000)
    if suffix == "亿":
        return int(base * 100_000_000)
    return int(base)


def _extract_initial_state_from_html(html: str) -> dict[str, Any]:
    match = re.search(r"window\.__INITIAL_STATE__=({.*})</script>", html, re.DOTALL)
    if not match:
        return {}
    raw = match.group(1).replace(":undefined", ":null")
    try:
        data = json.loads(raw)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _extract_creator_from_initial_state(html: str) -> dict[str, Any]:
    state = _extract_initial_state_from_html(html)
    user_state = state.get("user") if isinstance(state, dict) else None
    if not isinstance(user_state, dict):
        return {}
    user_page_data = user_state.get("userPageData") or {}
    if not isinstance(user_page_data, dict):
        return {}
    basic = user_page_data.get("basicInfo") or {}
    interactions = user_page_data.get("interactions") or []
    stats: dict[str, Any] = {}
    for item in interactions if isinstance(interactions, list) else []:
        if not isinstance(item, dict):
            continue
        key = item.get("type")
        if key:
            stats[key] = item.get("count")
    return {
        "nickname": basic.get("nickname") or "",
        "bio": "" if basic.get("desc") == "还没有简介" else (basic.get("desc") or ""),
        "avatar_url": basic.get("imageb") or basic.get("images") or "",
        "followers": _parse_count(stats.get("fans")),
        "following": _parse_count(stats.get("follows")),
        "liked": _parse_count(stats.get("interaction")),
        "user_fetching_status": user_state.get("userFetchingStatus") or "",
    }


def _extract_note_from_initial_state(html: str, note_id: str) -> dict[str, Any]:
    state = _extract_initial_state_from_html(html)
    note_state = state.get("note") if isinstance(state, dict) else None
    if not isinstance(note_state, dict):
        return {}
    detail_map = note_state.get("noteDetailMap") or {}
    if not isinstance(detail_map, dict):
        return {}
    entry = detail_map.get(note_id) or next(iter(detail_map.values()), {})
    if not isinstance(entry, dict):
        return {}
    note = entry.get("note") or {}
    if not isinstance(note, dict):
        return {}
    interact = note.get("interactInfo") or {}
    return {
        "note_id": note.get("noteId") or note_id,
        "title": note.get("title") or "",
        "text": note.get("desc") or "",
        "tags": [tag.get("name") or tag.get("title") for tag in (note.get("tagList") or []) if isinstance(tag, dict)],
        "publish_time": str(note.get("time") or ""),
        "like_count": interact.get("likedCount"),
        "comment_count": interact.get("commentCount"),
        "favorite_count": interact.get("collectedCount"),
    }


def _merge_note(primary: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    merged = dict(primary or {})
    for key, value in (fallback or {}).items():
        if merged.get(key) in (None, "", [], {}):
            merged[key] = value
    return merged


def _normalize_note_from_api(item: dict[str, Any]) -> dict[str, Any]:
    note_card = item.get("note_card") or item.get("noteCard") or item.get("note") or item
    if not isinstance(note_card, dict):
        return {}
    interact = note_card.get("interact_info") or note_card.get("interactInfo") or {}
    cover = note_card.get("cover") or {}
    return {
        "note_id": note_card.get("note_id") or note_card.get("noteId") or item.get("id") or "",
        "xsec_token": item.get("xsec_token") or item.get("xsecToken") or note_card.get("xsec_token") or note_card.get("xsecToken") or "",
        "title": note_card.get("display_title") or note_card.get("displayTitle") or note_card.get("title") or "",
        "text": note_card.get("desc") or "",
        "tags": [
            tag.get("name") or tag.get("title")
            for tag in (note_card.get("tag_list") or note_card.get("tagList") or [])
            if isinstance(tag, dict)
        ],
        "publish_time": str(note_card.get("time") or ""),
        "like_count": interact.get("liked_count") if isinstance(interact, dict) else None,
        "comment_count": interact.get("comment_count") if isinstance(interact, dict) else None,
        "favorite_count": interact.get("collected_count") if isinstance(interact, dict) else None,
        "cover_url": cover.get("url_default") or cover.get("urlDefault") or cover.get("url_pre") or cover.get("urlPre") or cover.get("url") or "",
        "type": note_card.get("type") or "",
    }


class _ResponseCapture:
    def __init__(self) -> None:
        self.note_list_response: dict[str, Any] | None = None
        self.note_details: dict[str, dict[str, Any]] = {}

    def bind(self, page: Any) -> None:
        page.on("response", self._handle_response)

    def _handle_response(self, response: Any) -> None:
        url = response.url or ""
        if "xiaohongshu.com" not in url and "rednote.com" not in url:
            return
        if not any(fragment in url for fragment in ("/api/sns/web/v1/user_posted", "/api/sns/web/v1/feed")):
            return
        try:
            payload = response.json()
        except Exception:
            return
        data = payload.get("data", payload) if isinstance(payload, dict) else payload
        if "/api/sns/web/v1/user_posted" in url and isinstance(data, dict):
            self.note_list_response = data
            return
        if "/api/sns/web/v1/feed" in url and isinstance(data, dict):
            items = data.get("items") or []
            if not isinstance(items, list):
                return
            for item in items:
                normalized = _normalize_note_from_api(item if isinstance(item, dict) else {})
                note_id = normalized.get("note_id") or ""
                if note_id:
                    self.note_details[note_id] = normalized


class XHSCollector(BaseCollector):
    platform = "xiaohongshu"

    def collect(
        self,
        identifier: str,
        max_notes: int = 10,
        max_text_chars: int = 5000,
    ) -> dict[str, Any]:
        warnings: list[str] = []
        notes: list[dict[str, Any]] = []

        identifier = _extract_share_url(identifier)
        xhs_id = identifier.strip()
        if not _BARE_ID.match(xhs_id):
            matched = re.search(r"user/profile/([0-9a-fA-F]{24}|\d{6,15})", xhs_id)
            if matched:
                xhs_id = matched.group(1)
            else:
                return self.empty_result(
                    "xiaohongshu",
                    identifier,
                    warnings,
                    f"Invalid XHS identifier: '{identifier}'",
                )

        profile_url = PROFILE_URL_TEMPLATE.format(xhs_id=xhs_id)
        xsec_token = ""
        xsec_source = ""
        if "xsec_token=" in identifier:
            query = parse_qs(urlparse(identifier).query)
            xsec_token = (query.get("xsec_token") or [""])[0]
            xsec_source = (query.get("xsec_source") or [""])[0]

        nav_url = profile_url
        if xsec_token:
            nav_url = f"{profile_url}?xsec_token={xsec_token}&xsec_source={xsec_source or 'pc_user'}"

        page = new_page(HOME_URL)
        capture = _ResponseCapture()
        capture.bind(page)
        used_creator_html_fallback = False
        used_note_html_fallback = False
        used_response_note_list = False
        used_response_note_detail = False

        try:
            home_markers = ensure_home_login_ready(page, eval_js)
            if not home_markers["ready"]:
                if home_markers["has_captcha_text"] or home_markers["redirected"]:
                    raise LoginRequired(
                        "XHS homepage login is not usable for collection yet. "
                        "Complete login and any captcha on the Xiaohongshu homepage in the attached real Chrome window, then retry. "
                        f"Observed state: {format_login_markers(home_markers)}"
                    )
                raise LoginRequired(
                    "XHS homepage login could not be confirmed. "
                    "Reuse the same real Chrome/CDP profile, verify you are logged in on the Xiaohongshu homepage, then retry. "
                    f"Observed state: {format_login_markers(home_markers)}"
                )

            _sleep(0.8, 1.2)
            navigate(page, nav_url)
            _sleep(1.5, 2.5)

            resolved_url = page.url or nav_url
            resolved_xhs_id = _extract_profile_id(resolved_url)
            if resolved_xhs_id and resolved_xhs_id != xhs_id:
                xhs_id = resolved_xhs_id
                profile_url = PROFILE_URL_TEMPLATE.format(xhs_id=xhs_id)
            if not xsec_token and "xsec_token=" in resolved_url:
                query = parse_qs(urlparse(resolved_url).query)
                xsec_token = (query.get("xsec_token") or [""])[0]
                xsec_source = (query.get("xsec_source") or [""])[0]

            login_markers = read_login_markers(page, eval_js)
            current_url = str(login_markers.get("url") or resolved_url)
            if login_markers["redirected"]:
                if "error_code" in current_url:
                    raise LoginRequired(
                        "XHS redirected the collector to a risk-control page during profile access. "
                        "Keep using the same trusted real Chrome/CDP profile and pass the full profile share URL with xsec_token. "
                        f"Observed state: {format_login_markers(login_markers)}"
                    )
                raise LoginRequired(
                    "XHS redirected the collector to a login/captcha page during profile access. "
                    "Keep the homepage logged in first, then retry collection. "
                    f"Observed state: {format_login_markers(login_markers)}"
                )
            if not login_markers["ready"]:
                warnings.append(f"Homepage login markers weakened after profile navigation: {format_login_markers(login_markers)}")
            login_state = login_markers.get("login_state")

            for _ in range(3):
                scroll(page, dy=2400)
                _sleep(1.2, 2.0)
            _sleep(1.0, 1.5)

            try:
                state = eval_js(page, JS_EXTRACT_STATE) or {}
            except Exception as exc:  # noqa: BLE001
                state = {}
                warnings.append(f"__INITIAL_STATE__ profile extraction failed: {exc}")

            if not state:
                html = page.content()
                state = _extract_creator_from_initial_state(html)
                if state:
                    used_creator_html_fallback = True
                    warnings.append("Fell back to HTML __INITIAL_STATE__ parsing for creator page.")

            nickname = state.get("nickname") or ""
            bio = state.get("desc") or state.get("bio") or ""
            avatar_url = state.get("avatar") or state.get("avatar_url") or ""
            followers = _parse_count(state.get("fans") if "fans" in state else state.get("followers"))
            following = _parse_count(state.get("follows") if "follows" in state else state.get("following"))
            liked = _parse_count(state.get("interaction") if "interaction" in state else state.get("liked"))
            user_fetching_status = state.get("user_fetching_status") or ""

            note_list = list(state.get("notes") or [])
            if not note_list and capture.note_list_response:
                response_notes = capture.note_list_response.get("notes") or []
                note_list = [_normalize_note_from_api(item) for item in response_notes if isinstance(item, dict)]
                note_list = [item for item in note_list if item.get("note_id")]
                if note_list:
                    used_response_note_list = True
                    warnings.append("Recovered note list from XHS network responses.")

            note_list = note_list[:max_notes]

            if user_fetching_status == "rejected":
                if not xsec_token:
                    warnings.append(
                        "XHS rejected homepage detail fetch. Use the full profile share URL copied from the Xiaohongshu app, including xsec_token."
                    )
                else:
                    warnings.append(
                        "XHS rejected homepage detail fetch even with xsec_token. This usually means the current browser session was flagged."
                    )

            for idx, item in enumerate(note_list):
                nid = item.get("note_id") or ""
                if not nid:
                    continue
                token = item.get("xsec_token") or ""
                note_url = "https://www.xiaohongshu.com/explore/" + nid
                if token:
                    note_url += f"?xsec_token={token}&xsec_source=pc_user"

                detail: dict[str, Any] = {}
                try:
                    navigate(page, note_url)
                    _sleep(1.5, 2.8)
                    detail = eval_js(page, JS_EXTRACT_NOTE_STATE) or {}
                except Exception as exc:  # noqa: BLE001
                    warnings.append(f"note-detail #{idx} ({nid}) state extraction failed: {exc}")

                response_detail = capture.note_details.get(nid) or {}
                if response_detail:
                    detail = _merge_note(detail, response_detail)
                    used_response_note_detail = True

                if not detail:
                    html = page.content()
                    detail = _extract_note_from_initial_state(html, nid)
                    if detail:
                        used_note_html_fallback = True
                        warnings.append(f"note-detail #{idx} ({nid}) used HTML fallback parsing.")

                detail = _merge_note(detail, item)
                note_text = (detail.get("text") or "")[:max_text_chars]
                notes.append(
                    normalize_note(
                        {
                            "note_id": nid,
                            "url": note_url,
                            "title": detail.get("title") or "",
                            "text": note_text,
                            "tags": detail.get("tags") or [],
                            "publish_time": detail.get("publish_time") or "",
                            "like_count": _parse_count(detail.get("like_count")),
                            "comment_count": _parse_count(detail.get("comment_count")),
                            "favorite_count": _parse_count(detail.get("favorite_count")),
                        }
                    )
                )

                try:
                    navigate(page, nav_url)
                    _sleep(1.0, 1.8)
                except Exception:
                    pass

            success = bool(notes or nickname or avatar_url)
            failure_reason = ""
            if not success:
                if user_fetching_status == "rejected":
                    failure_reason = "profile detail API rejected by XHS risk-control"
                elif "未连接到服务器" in (page.content() or ""):
                    failure_reason = "xhs page shell loaded but backend data requests failed in-browser"
                else:
                    failure_reason = "profile page yielded no usable data"

            diagnostics = {
                "notes_attempted": len(note_list),
                "notes_succeeded": len(notes),
                "notes_with_body": sum(1 for n in notes if n.get("text")),
                "login_state": "valid" if login_state == "logged_in" else str(login_state),
                "user_fetching_status": user_fetching_status,
                "browser_mode": "cdp" if is_cdp_mode() else "persistent",
                "had_xsec_token": bool(xsec_token),
                "resolved_url": resolved_url,
                "used_creator_html_fallback": used_creator_html_fallback,
                "used_note_html_fallback": used_note_html_fallback,
                "used_response_note_list": used_response_note_list,
                "used_response_note_detail": used_response_note_detail,
                "captured_note_detail_count": len(capture.note_details),
            }

            return {
                "platform": "xiaohongshu",
                "input": {"identifier": xhs_id, "display_name_hint": None},
                "resolved_profile": {
                    "nickname": nickname,
                    "bio": bio,
                    "profile_url": profile_url,
                    "avatar_url": avatar_url,
                    "followers": followers,
                    "following": following,
                    "liked": liked,
                },
                "notes": notes,
                "diagnostics": diagnostics,
                "extraction_status": {
                    "success": success,
                    "partial": bool(warnings),
                    "failure_reason": failure_reason,
                    "warnings": warnings,
                },
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
        finally:
            close(page)
