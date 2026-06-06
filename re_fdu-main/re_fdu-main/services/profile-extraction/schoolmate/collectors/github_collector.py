# schoolmate/collectors/github_collector.py
"""GitHub public profile collector via Edge CDP."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from extract_xhs_profile import create_tab, close_tab, navigate, eval_js
from schoolmate.collectors.base import BaseCollector, normalize_note


class GitHubCollector(BaseCollector):
    """Scrape public GitHub profile: pinned repos, popular repos, and READMEs."""

    platform = "github"

    def collect(
        self,
        username: str,
        max_repos: int = 10,
        max_readme_chars: int = 5000,
    ) -> dict[str, Any]:
        warnings: list[str] = []
        notes: list[dict[str, Any]] = []

        target = create_tab(f"https://github.com/{username}")
        try:
            time.sleep(5)
            profile_data = self._scrape_profile_page(target, username)
            if profile_data.get("not_found"):
                return self.empty_result(
                    "github", username, warnings,
                    f"GitHub user '{username}' not found or profile is private."
                )

            repo_urls = self._collect_repo_urls(target, max_repos)

            for repo_url in repo_urls:
                try:
                    navigate(target, repo_url)
                    time.sleep(3)
                    readme = self._extract_readme(target, max_readme_chars)
                    repo_info = self._extract_repo_info(target)

                    note_text = readme if readme else repo_info.get("description", "")
                    notes.append(normalize_note({
                        "note_id": repo_url.rstrip("/").rsplit("/", 1)[-1],
                        "url": repo_url,
                        "title": repo_info.get("name", repo_url),
                        "text": note_text,
                        "tags": repo_info.get("topics", []),
                        "publish_time": repo_info.get("last_updated", ""),
                        "like_count": repo_info.get("stars"),
                        "comment_count": None,
                        "favorite_count": repo_info.get("forks"),
                    }))
                except Exception as e:
                    warnings.append(f"Failed to scrape repo {repo_url}: {e}")

            return {
                "platform": "github",
                "input": {"identifier": username, "display_name_hint": None},
                "resolved_profile": {
                    "nickname": profile_data.get("name", username),
                    "bio": profile_data.get("bio", ""),
                    "profile_url": f"https://github.com/{username}",
                    "github_username": username,
                    "avatar_url": profile_data.get("avatar_url", ""),
                    "followers": profile_data.get("followers"),
                    "following": profile_data.get("following"),
                    "location": profile_data.get("location", ""),
                    "company": profile_data.get("company", ""),
                },
                "notes": notes,
                "diagnostics": {
                    "repos_found": len(repo_urls),
                    "readmes_extracted": sum(1 for n in notes if n.get("text")),
                },
                "extraction_status": {
                    "success": bool(notes or profile_data.get("name")),
                    "partial": bool(warnings),
                    "failure_reason": "" if notes else "no repos found",
                    "warnings": warnings,
                },
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
        finally:
            close_tab(target)

    def _scrape_profile_page(self, target: str, username: str) -> dict[str, Any]:
        script = r"""
        (() => {
            const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const nameEl = document.querySelector('[itemprop="name"], .p-name, .vcard-fullname');
            const bioEl = document.querySelector('[itemprop="description"], .p-note, .user-profile-bio');
            const locEl = document.querySelector('[itemprop="homeLocation"], .p-label');
            const orgEl = document.querySelector('[itemprop="worksFor"], .p-org');
            const avatarEl = document.querySelector('avatar-img img, .avatar-user');
            const followerEls = document.querySelectorAll('.text-bold[href*="followers"], a[href*="followers"] .text-bold');
            let followers = null, following = null;
            followerEls.forEach(el => {
                const parent = el.closest('a');
                if (parent && /followers/.test(parent.href)) followers = clean(el.textContent);
                if (parent && /following/.test(parent.href)) following = clean(el.textContent);
            });
            return {
                name: clean(nameEl?.textContent || document.title.split('·')[0] || ''),
                bio: clean(bioEl?.textContent || ''),
                location: clean(locEl?.textContent || ''),
                company: clean(orgEl?.textContent || ''),
                avatar_url: avatarEl?.src || '',
                followers: followers,
                following: following,
                not_found: document.title.includes('Page not found') || document.body?.innerText.includes('This is not the web page you are looking for')
            };
        })()
        """
        result = eval_js(target, script, timeout=20)
        return result if isinstance(result, dict) else {}

    def _collect_repo_urls(self, target: str, max_repos: int) -> list[str]:
        script = r"""
        (() => {
            const repos = new Set();
            document.querySelectorAll('.pinned-item-list-item-content a, [class*=pinned] a[href*="/"]').forEach(a => {
                const href = a.href || a.getAttribute('href') || '';
                const m = href.match(/\/([^/]+\/[^/]+?)(?:$|\?|#)/);
                if (m && !/\/search\//.test(href)) repos.add('https://github.com/' + m[1]);
            });
            document.querySelectorAll('[itemprop="owns"] a, ol[class*=repo] a[itemprop], #user-repositories-list a[itemprop="name codeRepository"]').forEach(a => {
                const href = a.href || a.getAttribute('href') || '';
                const m = href.match(/\/([^/]+\/[^/]+?)(?:$|\?|#)/);
                if (m) repos.add('https://github.com/' + m[1]);
            });
            if (repos.size === 0) {
                document.querySelectorAll('a[href*="/"]').forEach(a => {
                    const href = a.href || a.getAttribute('href') || '';
                    const m = href.match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:$|\?|#)/);
                    if (m && !/\/search\//.test(href) && !/\/features\//.test(href) && !repos.has('https://github.com/' + m[1])) {
                        repos.add('https://github.com/' + m[1]);
                    }
                });
            }
            return Array.from(repos).slice(0, 20);
        })()
        """
        repos = eval_js(target, script, timeout=20)
        if isinstance(repos, list):
            return [r for r in repos if isinstance(r, str)][:max_repos]
        return []

    def _extract_readme(self, target: str, max_chars: int) -> str:
        script = r"""
        (() => {
            const article = document.querySelector('article.markdown-body, .readme, [data-target="readme-toc.content"], #readme');
            if (!article) return '';
            return (article.innerText || article.textContent || '').trim();
        })()
        """
        text = eval_js(target, script, timeout=20)
        return str(text)[:max_chars] if text else ""

    def _extract_repo_info(self, target: str) -> dict[str, Any]:
        script = r"""
        (() => {
            const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const nameEl = document.querySelector('strong[itemprop="name"] a, h1 strong a, [data-component="text"][data-content]');
            const descEl = document.querySelector('[itemprop="about"], .f4.my-3, p.f4');
            const topics = Array.from(document.querySelectorAll('.topic-tag, a[data-ga-click*="topic"]')).map(t => clean(t.textContent));
            const starsEl = document.querySelector('a[href*="/stargazers"] strong, #repo-stars-counter-star');
            const forksEl = document.querySelector('a[href*="/forks"] strong, #repo-network-counter');
            const timeEl = document.querySelector('relative-time, time-ago');
            const langEl = document.querySelector('[itemprop="programmingLanguage"], .d-inline-flex.flex-items-center [class*=Progress] ~ span');
            return {
                name: clean(nameEl?.textContent || document.title.split('/').pop() || ''),
                description: clean(descEl?.textContent || ''),
                topics: topics.slice(0, 15),
                stars: parseInt(starsEl?.textContent?.replace(/,/g, '') || '0', 10) || null,
                forks: parseInt(forksEl?.textContent?.replace(/,/g, '') || '0', 10) || null,
                last_updated: timeEl?.getAttribute('datetime') || clean(timeEl?.textContent) || '',
                language: clean(langEl?.textContent || ''),
            };
        })()
        """
        result = eval_js(target, script, timeout=15)
        return result if isinstance(result, dict) else {}
