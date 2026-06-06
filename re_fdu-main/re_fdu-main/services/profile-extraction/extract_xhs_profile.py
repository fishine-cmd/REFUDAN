from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROXY = "http://localhost:3456"
ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "outputs"
RAW_PATH = OUTPUT_DIR / "xhs_raw_evidence.json"
PROFILE_PATH = OUTPUT_DIR / "xhs_profile.json"
REPORT_PATH = OUTPUT_DIR / "xhs_extraction_report.md"


def proxy_request(path: str, body: str | None = None, timeout: int = 30) -> Any:
    data = body.encode("utf-8") if body is not None else None
    request = urllib.request.Request(f"{PROXY}{path}", data=data, method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            text = response.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as error:
        raise RuntimeError("Edge CDP not connected") from error

    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def create_tab(url: str) -> str:
    result = proxy_request("/new", body=url, timeout=60)
    if isinstance(result, dict):
        for key in ("id", "targetId", "target"):
            if result.get(key):
                return str(result[key])
    if isinstance(result, str):
        return result.strip()
    raise RuntimeError(f"Unexpected /new response: {result!r}")


def eval_js(target: str, script: str, timeout: int = 30) -> Any:
    target_q = urllib.parse.quote(target)
    result = proxy_request(f"/eval?target={target_q}", body=script, timeout=timeout)
    if isinstance(result, dict):
        value = result.get("value") or result.get("result")
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
        if value is not None:
            return value
    return result


def navigate(target: str, url: str) -> None:
    target_q = urllib.parse.quote(target)
    proxy_request(f"/navigate?target={target_q}", body=url, timeout=60)


def scroll(target: str, y: int = 2600) -> None:
    target_q = urllib.parse.quote(target)
    proxy_request(f"/scroll?target={target_q}&y={y}", timeout=20)


def click(target: str, selector: str) -> dict[str, Any]:
    target_q = urllib.parse.quote(target)
    result = proxy_request(f"/click?target={target_q}", body=selector, timeout=20)
    return result if isinstance(result, dict) else {}


def go_back(target: str) -> None:
    target_q = urllib.parse.quote(target)
    proxy_request(f"/back?target={target_q}", timeout=20)


def close_tab(target: str) -> None:
    try:
        target_q = urllib.parse.quote(target)
        proxy_request(f"/close?target={target_q}", timeout=10)
    except Exception:
        pass


def page_snapshot(target: str) -> dict[str, Any]:
    script = r"""
(() => {
  const visible = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    title: document.title,
    url: location.href,
    text: visible.slice(0, 5000),
    links: Array.from(document.querySelectorAll('a')).slice(0, 160).map((a) => ({
      text: (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      href: a.href,
      aria: a.getAttribute('aria-label') || ''
    }))
  };
})()
"""
    value = eval_js(target, script)
    return value if isinstance(value, dict) else {"title": "", "url": "", "text": str(value), "links": []}


def search_user(target: str, keyword: str) -> dict[str, Any]:
    encoded = urllib.parse.quote(keyword)
    candidates = [
        f"https://www.xiaohongshu.com/search_result?keyword={encoded}&type=user",
        f"https://www.xiaohongshu.com/search_result?keyword={encoded}",
        "https://www.xiaohongshu.com/explore",
    ]

    for url in candidates:
        navigate(target, url)
        time.sleep(4)
        snapshot = page_snapshot(target)
        if "登录" in snapshot.get("text", "") and "小红书号" not in snapshot.get("text", "") and "P.L.U.M" not in snapshot.get("text", ""):
            snapshot["login_possible"] = True
        links = find_profile_links(snapshot, keyword)
        if links:
            return {"keyword": keyword, "url": url, "snapshot": snapshot, "links": links}

    fill_script = f"""
(async () => {{
  const keyword = {js_string(keyword)};
  const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
  const input = inputs.find((el) => !el.disabled && el.offsetParent !== null) || inputs[0];
  if (!input) return {{ ok: false, reason: 'no input' }};
  input.focus();
  if ('value' in input) input.value = keyword;
  else input.textContent = keyword;
  input.dispatchEvent(new InputEvent('input', {{ bubbles: true, inputType: 'insertText', data: keyword }}));
  input.dispatchEvent(new KeyboardEvent('keydown', {{ bubbles: true, key: 'Enter', code: 'Enter' }}));
  input.dispatchEvent(new KeyboardEvent('keyup', {{ bubbles: true, key: 'Enter', code: 'Enter' }}));
  return {{ ok: true, tag: input.tagName, className: input.className || '' }};
}})()
"""
    eval_js(target, fill_script)
    time.sleep(5)
    snapshot = page_snapshot(target)
    return {"keyword": keyword, "url": snapshot.get("url", ""), "snapshot": snapshot, "links": find_profile_links(snapshot, keyword)}


def find_profile_links(snapshot: dict[str, Any], keyword: str) -> list[dict[str, str]]:
    links: list[dict[str, str]] = []
    for link in snapshot.get("links", []):
        href = str(link.get("href", ""))
        text = str(link.get("text", ""))
        if not href:
            continue
        looks_user = "/user/profile/" in href or "user/profile" in href
        mentions = keyword in text or "P.L.U.M" in text or "193190562" in text
        if looks_user or mentions:
            links.append({"href": href, "text": text})
    unique: list[dict[str, str]] = []
    seen = set()
    for link in links:
        if link["href"] not in seen:
            seen.add(link["href"])
            unique.append(link)
    return unique[:10]


def choose_profile_link(searches: list[dict[str, Any]], display_name_hint: str | None, identifier: str) -> str | None:
    scored: list[tuple[int, str]] = []
    for result in searches:
        for link in result.get("links", []):
            text = link.get("text", "")
            href = link.get("href", "")
            score = 0
            if "/user/profile/" in href:
                score += 3
            if identifier and identifier in text:
                score += 4
            if display_name_hint and display_name_hint in text:
                score += 4
            scored.append((score, href))
    if not scored:
        return None
    scored.sort(reverse=True)
    return scored[0][1]


def extract_profile_page(target: str, identifier: str, display_name_hint: str | None, max_notes: int) -> dict[str, Any]:
    for _ in range(4):
        scroll(target, 2600)
        time.sleep(1.2)

    script = r"""
(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const text = clean(document.body?.innerText || '');
  const meta = Array.from(document.querySelectorAll('meta')).map((m) => ({
    name: m.getAttribute('name') || m.getAttribute('property') || '',
    content: m.getAttribute('content') || ''
  }));
  const anchors = Array.from(document.querySelectorAll('a'));
  const noteLinks = anchors.map((a) => {
    const href = a.href || '';
    const card = a.closest('[class*=note], [class*=card], section, div') || a;
    const cardText = clean(card.innerText || a.innerText || a.textContent || '');
    return { href, text: cardText.slice(0, 600) };
  }).filter((x) => /\/explore\//.test(x.href) || /\/discovery\/item\//.test(x.href));
  const imgs = Array.from(document.images).slice(0, 80).map((img) => clean(img.alt || img.getAttribute('aria-label') || ''));
  return {
    title: document.title,
    url: location.href,
    text,
    meta,
    noteLinks,
    imageAlts: imgs.filter(Boolean)
  };
})()
"""
    data = eval_js(target, script, timeout=40)
    if not isinstance(data, dict):
        data = {"title": "", "url": "", "text": str(data), "meta": [], "noteLinks": [], "imageAlts": []}

    text = str(data.get("text", ""))
    nickname = display_name_hint or first_match(text, [r"^([^\s]+)\s+小红书号", r"昵称[:：]\s*([^\s]+)"])
    xhs_id = first_match(text, [r"小红书号[:：]?\s*([A-Za-z0-9_.-]+)", r"RED ID[:：]?\s*([A-Za-z0-9_.-]+)"]) or identifier
    counts = extract_counts(text)
    notes = extract_notes(data.get("noteLinks", []), max_notes)

    if not notes:
        notes = extract_notes_from_text(text, max_notes)

    return {
        "nickname": nickname or "",
        "xhs_id": xhs_id or "",
        "profile_url": str(data.get("url", "")),
        "bio": extract_bio(text, nickname or "", xhs_id or ""),
        "following_count": counts.get("following"),
        "follower_count": counts.get("followers"),
        "likes_and_collections_count": counts.get("likes"),
        "location": extract_location(text),
        "notes": notes,
        "page_title": str(data.get("title", "")),
        "visible_text_excerpt": text[:3000],
    }


def first_match(text: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, re.I | re.M)
        if match:
            return match.group(1).strip()
    return None


def extract_counts(text: str) -> dict[str, int | None]:
    def parse(label_patterns: list[str]) -> int | None:
        for pattern in label_patterns:
            match = re.search(pattern, text)
            if match:
                return parse_count(match.group(1))
        return None

    return {
        "following": parse([r"([\d.万kK]+)\s*关注"]),
        "followers": parse([r"([\d.万kK]+)\s*粉丝"]),
        "likes": parse([r"([\d.万kK]+)\s*获赞与收藏", r"([\d.万kK]+)\s*赞与收藏"]),
    }


def parse_count(value: str) -> int | None:
    cleaned = value.strip().lower()
    try:
        if "万" in cleaned:
            return int(float(cleaned.replace("万", "")) * 10000)
        if "k" in cleaned:
            return int(float(cleaned.replace("k", "")) * 1000)
        return int(float(cleaned))
    except ValueError:
        return None


def extract_bio(text: str, nickname: str, xhs_id: str) -> str:
    bio_match = re.search(r"IP属地[：:]\s*\S+\s+(.+?)(?:\s+\d+\s+(?:关注|粉丝|获赞))", text)
    if bio_match:
        return bio_match.group(1).strip()
    lines = [line.strip() for line in re.split(r"[\n。]", text) if line.strip()]
    filtered = []
    for line in lines[:80]:
        if nickname and line == nickname:
            continue
        if xhs_id and xhs_id in line:
            continue
        if any(token in line for token in ["关注", "粉丝", "获赞", "收藏", "笔记", "登录", "发现"]):
            continue
        if 4 <= len(line) <= 100:
            filtered.append(line)
    return filtered[0] if filtered else ""


def extract_location(text: str) -> str:
    match = re.search(r"IP属地[:：]?\s*([一-龥A-Za-z ]{2,20})", text)
    return match.group(1).strip() if match else ""


def extract_notes(note_links: list[Any], max_notes: int) -> list[dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    seen = set()
    for item in note_links:
        if not isinstance(item, dict):
            continue
        url = str(item.get("href", ""))
        text = str(item.get("text", "")).strip()
        if not url or url in seen:
            continue
        seen.add(url)
        title = derive_title(text)
        tags = sorted(set(re.findall(r"#[\w一-龥_-]+", text)))[:12]
        notes.append({
            "note_id": extract_note_id(url),
            "url": url,
            "title": title,
            "text": text,
            "tags": tags,
            "publish_time": "",
            "like_count": extract_metric(text, ["赞", "点赞"]),
            "comment_count": extract_metric(text, ["评论"]),
            "favorite_count": extract_metric(text, ["收藏"]),
        })
        if len(notes) >= max_notes:
            break
    return notes


def extract_note_body(target: str) -> dict[str, Any]:
    script = r"""
(() => {
  const bodyEl = document.querySelector("[class*=note-text]");
  const dateEl = document.querySelector(".bottom-container");
  const tags = Array.from(document.querySelectorAll("[class*=tag], .hash-tag"))
    .map(el => (el.innerText || el.textContent || '').trim())
    .filter(t => t && !/^(作者|\d+岁|\d+岁\\n|关注|粉丝|获赞)$/.test(t) && t.length < 30);

  const engageBar = document.querySelector(".engage-bar");
  let likeCount = null, collectCount = null, commentCount = null;
  if (engageBar) {
    const nums = (engageBar.innerText || '').match(/\d+/g);
    if (nums && nums.length >= 3) {
      likeCount = parseInt(nums[0], 10);
      collectCount = parseInt(nums[1], 10);
      commentCount = parseInt(nums[2], 10);
    }
  }

  return {
    url: location.href,
    bodyText: (bodyEl?.innerText || '').trim(),
    dateText: (dateEl?.innerText || '').trim(),
    tags: tags.slice(0, 20),
    likeCount: likeCount,
    collectCount: collectCount,
    commentCount: commentCount
  };
})()
"""
    result = eval_js(target, script, timeout=15)
    return result if isinstance(result, dict) else {}


def enrich_notes_from_profile(target: str, note_ids: list[str], max_enrich: int = 10) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for i, note_id in enumerate(note_ids[:max_enrich]):
        try:
            selector = f'a[href*="{note_id}"].cover.mask'
            clicked = click(target, selector)
            if not clicked.get("clicked"):
                continue
            time.sleep(3)
            body_data = extract_note_body(target)
            body_data["note_id"] = note_id
            enriched.append(body_data)
            go_back(target)
            time.sleep(3)
            scroll(target, 1000 + i * 600)
            time.sleep(1)
        except Exception:
            try:
                go_back(target)
                time.sleep(2)
            except Exception:
                pass
    return enriched


def extract_notes_from_text(text: str, max_notes: int) -> list[dict[str, Any]]:
    pieces = [p.strip() for p in re.split(r"(?=#[\w一-龥_-]+)|\s{2,}", text) if len(p.strip()) > 12]
    notes = []
    for index, piece in enumerate(pieces[:max_notes]):
        notes.append({
            "note_id": f"text-{index + 1}",
            "url": "",
            "title": derive_title(piece),
            "text": piece[:600],
            "tags": sorted(set(re.findall(r"#[\w一-龥_-]+", piece)))[:12],
            "publish_time": "",
            "like_count": extract_metric(piece, ["赞", "点赞"]),
            "comment_count": extract_metric(piece, ["评论"]),
            "favorite_count": extract_metric(piece, ["收藏"]),
        })
    return notes


def derive_title(text: str) -> str:
    clean = re.sub(r"#[\w一-龥_-]+", "", text).strip()
    for sep in ["\n", "。", "！", "？", "|"]:
        if sep in clean:
            clean = clean.split(sep)[0]
    return clean[:80]


def extract_note_id(url: str) -> str:
    match = re.search(r"/(?:explore|discovery/item)/([^/?#]+)", url)
    return match.group(1) if match else ""


def extract_metric(text: str, labels: list[str]) -> int | None:
    for label in labels:
        match = re.search(rf"([\d.万kK]+)\s*{label}|{label}\s*([\d.万kK]+)", text)
        if match:
            return parse_count(next(group for group in match.groups() if group))
    return None


# ── All topic classification, skill extraction, style analysis, audience ──
# inference, and commercial signal detection have been moved to the LLM-based
# ContentAnalyzer agent (content_analyzer.py).  See run_extraction.py for the
# full NoteCollector -> ContentAnalyzer -> ProfileSynthesizer pipeline.


def extract_xhs_profile(identifier: str, display_name_hint: str | None = None, max_notes: int = 20) -> dict[str, Any]:
    warnings: list[str] = []
    searches: list[dict[str, Any]] = []
    target = create_tab("https://www.xiaohongshu.com/explore")
    try:
        time.sleep(4)
        initial = page_snapshot(target)
        if "登录" in initial.get("text", "") and "搜索" not in initial.get("text", ""):
            warnings.append("Page contains login text; extraction proceeds because public content may still be visible.")

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
            profile_data = extract_profile_page(target, identifier, display_name_hint, max_notes)
            matched = bool(
                (identifier and identifier in json.dumps(profile_data, ensure_ascii=False))
                or (display_name_hint and display_name_hint in json.dumps(profile_data, ensure_ascii=False))
            )
            if not matched:
                warnings.append("Opened a candidate profile but could not strongly verify nickname or Xiaohongshu ID from visible text.")

            notes = profile_data.pop("notes", [])
            note_ids = [n.get("note_id", "") for n in notes if n.get("note_id")]
            if note_ids:
                body_data_list = enrich_notes_from_profile(target, note_ids, max_enrich=min(8, max_notes))
                body_by_id: dict[str, dict[str, Any]] = {bd.get("note_id", ""): bd for bd in body_data_list}
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
            warnings.append("No matching user profile link was found from Xiaohongshu search results.")
            notes = []

        raw = {
            "platform": "xiaohongshu",
            "input": {"identifier": identifier, "display_name_hint": display_name_hint},
            "resolved_profile": {key: profile_data.get(key) for key in [
                "nickname",
                "xhs_id",
                "profile_url",
                "bio",
                "following_count",
                "follower_count",
                "likes_and_collections_count",
                "location",
            ]},
            "notes": notes[:max_notes],
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
                "failure_reason": "" if (profile_url or profile_data.get("nickname") or profile_data.get("xhs_id")) else "search user failed",
                "warnings": warnings,
            },
        }
        return raw
    finally:
        close_tab(target)


def write_raw_outputs(raw: dict[str, Any]) -> None:
    """Write raw evidence JSON and a summary report. (CDP scraping only — no analysis.)"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_PATH.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT_PATH.write_text(build_raw_report(raw), encoding="utf-8")


def build_raw_report(raw: dict[str, Any]) -> str:
    status = raw.get("extraction_status", {})
    resolved = raw.get("resolved_profile", {})
    notes = raw.get("notes", [])
    warnings = status.get("warnings", [])
    complete_fields = [key for key, value in resolved.items() if value not in (None, "", [])]
    partial_fields = [key for key, value in resolved.items() if value in (None, "", [])]
    lines = [
        "# Xiaohongshu Raw Extraction Report",
        "",
        f"- Input identifier: {raw.get('input', {}).get('identifier', '')}",
        f"- Display name hint: {raw.get('input', {}).get('display_name_hint', '')}",
        f"- Located user: {'yes' if resolved.get('profile_url') else 'partial/no direct profile URL'}",
        f"- Resolved nickname: {resolved.get('nickname', '')}",
        f"- Resolved Xiaohongshu ID: {resolved.get('xhs_id', '')}",
        f"- Extracted notes: {len(notes)}",
        f"- Success: {status.get('success')}",
        f"- Partial: {status.get('partial')}",
        "",
        "## Complete fields",
        "",
        *(f"- {field}" for field in complete_fields),
        "",
        "## Partial fields",
        "",
        *(f"- {field}" for field in partial_fields),
        "",
        "## Warnings",
        "",
        *(f"- {warning}" for warning in warnings),
    ]
    if not warnings:
        lines.append("- none")
    lines.extend([
        "",
        "## Note",
        "",
        "This file contains raw CDP-scraped evidence only.  For analyzed profile,",
        "run:  python run_extraction.py --raw-input outputs/xhs_raw_evidence.json --api-key <KEY>",
        "",
        "## Output files",
        "",
        f"- {RAW_PATH.as_posix()}",
        f"- {REPORT_PATH.as_posix()}",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract a Xiaohongshu profile through Edge CDP/web-access.")
    parser.add_argument("--identifier", required=True)
    parser.add_argument("--display-name-hint", default=None)
    parser.add_argument("--max-notes", type=int, default=20)
    args = parser.parse_args()

    try:
        raw = extract_xhs_profile(args.identifier, args.display_name_hint, args.max_notes)
    except RuntimeError as error:
        if str(error) == "Edge CDP not connected":
            raw = {
                "platform": "xiaohongshu",
                "input": {"identifier": args.identifier, "display_name_hint": args.display_name_hint},
                "resolved_profile": {
                    "nickname": "",
                    "xhs_id": "",
                    "profile_url": "",
                    "bio": "",
                    "following_count": None,
                    "follower_count": None,
                    "likes_and_collections_count": None,
                    "location": "",
                },
                "notes": [],
                "extraction_status": {
                    "success": False,
                    "partial": True,
                    "failure_reason": "Edge CDP not connected",
                    "warnings": [
                        "Run: node D:\\SchoolMate\\.claude\\skills\\web-access\\scripts\\check-deps.mjs --browser edge"
                    ],
                },
            }
            write_raw_outputs(raw)
            print("Edge CDP not connected")
            return 1
        raise

    write_raw_outputs(raw)
    print(json.dumps({
        "success": raw["extraction_status"]["success"],
        "partial": raw["extraction_status"]["partial"],
        "profile_url": raw["resolved_profile"].get("profile_url"),
        "notes": len(raw.get("notes", [])),
        "outputs": [str(RAW_PATH), str(REPORT_PATH)],
    }, ensure_ascii=False, indent=2))
    return 0 if raw["extraction_status"]["success"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
