# schoolmate/collectors/github_collector.py
"""GitHub public profile collector via REST API.

Replaces the older CDP-based implementation (which scraped github.com
through a headless browser). Uses the public REST API at api.github.com
which is faster, more reliable, and does not require Edge to be running.

Anonymous calls are rate-limited to 60 requests/hour. Set the
GITHUB_TOKEN environment variable to a personal access token (no scopes
needed for public data) to get 5000 requests/hour.
"""

from __future__ import annotations

import base64
import os
import time
from datetime import datetime, timezone
from typing import Any

import requests

from schoolmate.collectors.base import BaseCollector, normalize_note

API_ROOT = "https://api.github.com"
_DEFAULT_TIMEOUT = 20
_RATE_LIMIT_RETRIES = 1


class GitHubCollector(BaseCollector):
    """Fetch a public GitHub profile + most-recently-updated repos via REST."""

    platform = "github"

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "schoolmate-profile-extractor/1.0",
        })
        token = os.environ.get("GITHUB_TOKEN")
        if token:
            self.session.headers["Authorization"] = f"Bearer {token}"

    def collect(
        self,
        username: str,
        max_repos: int = 10,
        max_readme_chars: int = 5000,
    ) -> dict[str, Any]:
        warnings: list[str] = []
        notes: list[dict[str, Any]] = []

        username = username.strip().lstrip("@")
        if "/" in username or not username:
            return self.empty_result(
                "github", username, warnings,
                f"Invalid GitHub username: '{username}'"
            )

        # 1. User profile
        user_data = self._get_user(username, warnings)
        if user_data is None:
            return self.empty_result(
                "github", username, warnings,
                f"GitHub user '{username}' not found or API error"
            )

        # 2. Repo list (skip forks; sort by updated_at desc)
        repos = self._get_repos(username, max_repos, warnings)

        # 3. README for each repo
        for repo in repos:
            owner_login = repo.get("owner", {}).get("login", username)
            repo_name = repo.get("name", "")
            full_name = repo.get("full_name", f"{owner_login}/{repo_name}")
            if not repo_name:
                continue

            readme_text = self._get_readme(owner_login, repo_name, max_readme_chars, warnings)
            description = (repo.get("description") or "").strip()
            note_text = readme_text or description

            notes.append(normalize_note({
                "note_id": repo_name,
                "url": repo.get("html_url", f"https://github.com/{full_name}"),
                "title": repo_name,
                "text": note_text,
                "tags": repo.get("topics", []) or [],
                "publish_time": repo.get("updated_at", ""),
                "like_count": repo.get("stargazers_count"),
                "comment_count": repo.get("open_issues_count"),
                "favorite_count": repo.get("forks_count"),
            }))

        return {
            "platform": "github",
            "input": {"identifier": username, "display_name_hint": None},
            "resolved_profile": {
                "nickname": user_data.get("name") or username,
                "bio": user_data.get("bio") or "",
                "profile_url": user_data.get("html_url") or f"https://github.com/{username}",
                "github_username": username,
                "avatar_url": user_data.get("avatar_url") or "",
                "followers": user_data.get("followers"),
                "following": user_data.get("following"),
                "location": user_data.get("location") or "",
                "company": user_data.get("company") or "",
                "blog": user_data.get("blog") or "",
                "public_repos": user_data.get("public_repos"),
                "created_at": user_data.get("created_at") or "",
            },
            "notes": notes,
            "diagnostics": {
                "repos_found": len(repos),
                "readmes_extracted": sum(1 for n in notes if n.get("text")),
                "auth_mode": "token" if "Authorization" in self.session.headers else "anonymous",
            },
            "extraction_status": {
                "success": bool(notes or user_data.get("name")),
                "partial": bool(warnings),
                "failure_reason": "" if (notes or user_data.get("name")) else "no public data",
                "warnings": warnings,
            },
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }

    # ────────────────────────────────────────────────────────────────
    # Internals
    # ────────────────────────────────────────────────────────────────

    def _get_user(self, username: str, warnings: list[str]) -> dict[str, Any] | None:
        resp = self._get_with_retry(f"{API_ROOT}/users/{username}", warnings)
        if resp is None:
            return None
        if resp.status_code == 404:
            return None
        if not resp.ok:
            warnings.append(f"GET /users/{username} → HTTP {resp.status_code}")
            return None
        return resp.json()

    def _get_repos(
        self,
        username: str,
        max_repos: int,
        warnings: list[str],
    ) -> list[dict[str, Any]]:
        params = {"sort": "updated", "per_page": max(max_repos * 2, 30), "type": "owner"}
        resp = self._get_with_retry(f"{API_ROOT}/users/{username}/repos", warnings, params=params)
        if resp is None or not resp.ok:
            if resp is not None:
                warnings.append(f"GET /users/{username}/repos → HTTP {resp.status_code}")
            return []
        data = resp.json()
        if not isinstance(data, list):
            return []
        non_forks = [r for r in data if not r.get("fork")]
        return non_forks[:max_repos]

    def _get_readme(
        self,
        owner: str,
        repo: str,
        max_chars: int,
        warnings: list[str],
    ) -> str:
        resp = self._get_with_retry(
            f"{API_ROOT}/repos/{owner}/{repo}/readme",
            warnings,
            allow_404=True,
        )
        if resp is None:
            return ""
        if resp.status_code == 404:
            return ""
        if not resp.ok:
            warnings.append(f"GET /repos/{owner}/{repo}/readme → HTTP {resp.status_code}")
            return ""
        body = resp.json()
        encoded = body.get("content", "")
        if body.get("encoding") != "base64" or not encoded:
            return ""
        try:
            decoded = base64.b64decode(encoded).decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001
            warnings.append(f"README decode failed for {owner}/{repo}: {e}")
            return ""
        return decoded[:max_chars]

    def _get_with_retry(
        self,
        url: str,
        warnings: list[str],
        params: dict[str, Any] | None = None,
        allow_404: bool = False,
    ) -> requests.Response | None:
        for attempt in range(_RATE_LIMIT_RETRIES + 1):
            try:
                resp = self.session.get(url, params=params, timeout=_DEFAULT_TIMEOUT)
            except requests.RequestException as e:
                warnings.append(f"Request failed for {url}: {e}")
                return None

            if resp.status_code == 404 and allow_404:
                return resp

            if resp.status_code in (403, 429):
                reset_at = resp.headers.get("X-RateLimit-Reset")
                remaining = resp.headers.get("X-RateLimit-Remaining", "?")
                if attempt < _RATE_LIMIT_RETRIES:
                    wait_s = self._compute_wait_seconds(reset_at)
                    warnings.append(
                        f"Rate-limited at {url} (remaining={remaining}); "
                        f"sleeping {wait_s}s before retry"
                    )
                    time.sleep(wait_s)
                    continue
                warnings.append(
                    f"Rate-limited at {url} (remaining={remaining}); "
                    "set GITHUB_TOKEN env var for 5000 req/hr"
                )
                return resp

            return resp
        return None

    @staticmethod
    def _compute_wait_seconds(reset_at: str | None) -> int:
        if not reset_at:
            return 30
        try:
            reset_ts = int(reset_at)
            now_ts = int(time.time())
            return max(5, min(reset_ts - now_ts + 2, 60))
        except (ValueError, TypeError):
            return 30
