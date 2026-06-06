# schoolmate/collectors/zhihu_collector.py
"""Zhihu (知乎) user profile collector.

WIP: implementation pending Phase 3. DOM selectors and flow are
unverified and the scraping logic below is the legacy CDP-based skeleton.
collect() will likely return empty_result() until rewritten with
Playwright-aware selectors.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from schoolmate.browser import create_tab, close_tab, navigate, eval_js, scroll
from schoolmate.collectors.base import BaseCollector, normalize_note


class ZhihuCollector(BaseCollector):
    """Scrape Zhihu user profile: posts, answers, and basic info."""

    platform = "zhihu"

    def collect(
        self,
        identifier: str,
        max_items: int = 20,
    ) -> dict[str, Any]:
        warnings: list[str] = []
        notes: list[dict[str, Any]] = []

        profile_url = identifier if "zhihu.com" in identifier else f"https://www.zhihu.com/people/{identifier}"
        target = create_tab(profile_url)
        try:
            time.sleep(5)

            for _ in range(4):
                scroll(target, 2000)
                time.sleep(1.2)

            profile_data = self._scrape_profile(target)
            posts = self._scrape_activities(target, max_items)

            for i, post in enumerate(posts):
                notes.append(normalize_note({
                    "note_id": post.get("id", f"zhihu-{i}"),
                    "url": post.get("url", ""),
                    "title": post.get("title", ""),
                    "text": post.get("content", ""),
                    "tags": post.get("tags", []),
                    "publish_time": post.get("time", ""),
                    "like_count": post.get("likes"),
                    "comment_count": post.get("comments"),
                    "favorite_count": None,
                }))

            return {
                "platform": "zhihu",
                "input": {"identifier": identifier, "display_name_hint": None},
                "resolved_profile": {
                    "nickname": profile_data.get("name", ""),
                    "bio": profile_data.get("bio", ""),
                    "profile_url": profile_url,
                    "headline": profile_data.get("headline", ""),
                    "location": profile_data.get("location", ""),
                    "follower_count": profile_data.get("followers"),
                    "following_count": profile_data.get("following"),
                },
                "notes": notes,
                "diagnostics": {"posts_found": len(posts)},
                "extraction_status": {
                    "success": bool(notes or profile_data.get("name")),
                    "partial": bool(warnings),
                    "failure_reason": "" if (notes or profile_data.get("name")) else "no content found",
                    "warnings": warnings,
                },
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
        finally:
            close_tab(target)

    def _scrape_profile(self, target: str) -> dict[str, Any]:
        script = r"""
        (() => {
            const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const body = clean(document.body?.innerText || '');
            const lines = body.split(/\n/).map(l => l.trim()).filter(Boolean);
            let name = '', headline = '', bio = '', location = '';
            let followers = null, following = null;
            for (let i = 0; i < Math.min(lines.length, 30); i++) {
                const l = lines[i];
                if (!name && l.length >= 2 && l.length <= 20 && !/知乎|关注|粉丝|回答|文章|视频|想法|问题|赞同/.test(l)) {
                    name = l;
                }
                const followerMatch = l.match(/获得\s*([\d,]+)\s*次赞同/);
                if (followerMatch) followers = followerMatch[1];
                const followingMatch = l.match(/([\d,]+)\s*关注者/);
                if (followingMatch) followers = followers || followingMatch[1];
            }
            for (let i = 1; i < Math.min(lines.length, 10); i++) {
                const l = lines[i];
                if (l.length > 20 && l.length < 200 && !/关注|粉丝|回答|文章|视频|赞同/.test(l)) {
                    if (!headline) headline = l;
                    else if (!bio) bio = l;
                    break;
                }
            }
            const nameEl = document.querySelector('.ProfileHeader-name, .UserLink-link, [class*="ProfileHeader"] h1, [class*="profile"] h1');
            const bioEl = document.querySelector('.ProfileHeader-headline, .RichText, [class*="bio"], [class*="headline"]');
            return {
                name: nameEl ? clean(nameEl.textContent) : name,
                headline: bioEl ? clean(bioEl.textContent) : headline,
                bio: bio,
                location: location,
                followers: followers ? parseInt(String(followers).replace(/,/g, ''), 10) || null : null,
                following: following ? parseInt(String(following).replace(/,/g, ''), 10) || null : null,
            };
        })()
        """
        result = eval_js(target, script, timeout=20)
        return result if isinstance(result, dict) else {}

    def _scrape_activities(self, target: str, max_items: int) -> list[dict[str, Any]]:
        script = r"""
        (() => {
            const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const items = [];
            document.querySelectorAll('a[href*="/answer/"], a[href*="/p/"], a[href*="/question/"]').forEach(a => {
                const href = a.href || a.getAttribute('href') || '';
                if (!href) return;
                let url = href;
                if (!url.startsWith('http')) url = 'https://www.zhihu.com' + url;
                const card = a.closest('[class*="item"], [class*="card"], [class*="List"], div') || a;
                const cardText = clean(card.innerText || card.textContent || '');
                const titleEl = a.querySelector('h2, h3, [class*="title"], [class*="question"]');
                const title = titleEl ? clean(titleEl.textContent) : (clean(a.textContent) || '').slice(0, 120);
                const tags = Array.from(card.querySelectorAll('[class*="tag"], [class*="Topic"]'))
                    .map(t => clean(t.textContent))
                    .filter(t => t && t.length < 20);
                const nums = cardText.match(/([\d,]+)\s*(?:赞同|赞|评论|喜欢)/g) || [];
                let likes = null, comments = null;
                for (const n of nums) {
                    const val = parseInt(n.replace(/[,赞同评论喜欢赞]/g, ''), 10);
                    if (/赞同|赞/.test(n)) likes = likes || val;
                    if (/评论/.test(n)) comments = comments || val;
                }
                const exist = items.find(i => i.url === url);
                if (!exist) {
                    items.push({
                        id: url.split('/').filter(Boolean).pop() || '',
                        url, title,
                        content: cardText.slice(0, 1500),
                        tags: tags.slice(0, 8),
                        time: '', likes, comments,
                    });
                }
            });
            return items.slice(0, 30);
        })()
        """
        items = eval_js(target, script, timeout=20)
        return items if isinstance(items, list) else []
