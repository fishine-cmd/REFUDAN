# llm_client.py
"""DeepSeek API client for LLM-powered content analysis.

Configure via environment variable or pass directly:
    DEEPSEEK_API_KEY = "sk-..."
    DEEPSEEK_BASE_URL = "https://api.deepseek.com"  (optional)

Usage:
    client = LLMClient(api_key="sk-...")
    result = client.chat(prompt, system="You are an analyst.")
    # Returns parsed JSON when response_format='json_object'
"""

from __future__ import annotations

import json
import os
from typing import Any

import urllib.request
import urllib.error


class LLMClient:
    """Minimal DeepSeek API client with zero external dependencies."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str = "deepseek-chat",
        timeout: int = 120,
    ):
        self.api_key = api_key or os.environ.get("DEEPSEEK_API_KEY", "")
        self.base_url = (base_url or os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")).rstrip("/")
        self.model = model
        self.timeout = timeout

    # ---- low-level ----

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"DeepSeek API HTTP {e.code}: {body[:500]}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"DeepSeek API unreachable: {e}") from e

    # ---- high-level ----

    def chat(
        self,
        user_message: str,
        system: str = "You are a careful, precise analyst.",
        temperature: float = 0.3,
        json_mode: bool = True,
    ) -> dict[str, Any]:
        """Send a single-turn chat request. Returns parsed JSON dict by default."""
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user_message})

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 4096,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        response = self._post("/v1/chat/completions", payload)

        # Extract content from OpenAI-compatible response
        try:
            content = response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise RuntimeError(f"Unexpected API response structure: {json.dumps(response, ensure_ascii=False)[:500]}")

        if json_mode:
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                # Sometimes the model wraps JSON in markdown fences
                if "```json" in content:
                    block = content.split("```json", 1)[1].split("```", 1)[0]
                    return json.loads(block)
                if "```" in content:
                    block = content.split("```", 1)[1].split("```", 1)[0]
                    return json.loads(block)
                raise RuntimeError(f"Failed to parse JSON from response: {content[:500]}")
        return {"content": content}

    def analyze_batch(
        self,
        items: list[str],
        system: str,
        temperature: float = 0.3,
    ) -> dict[str, Any]:
        """Send multiple items joined together for batch analysis."""
        joined = "\n\n---\n\n".join(
            f"[Item {i+1}]\n{item}" for i, item in enumerate(items)
        )
        return self.chat(joined, system=system, temperature=temperature)


def load_prompt(name: str, prompts_dir: str | None = None) -> str:
    """Load a prompt template from the prompts/ folder."""
    import os as _os
    base = prompts_dir or _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "prompts")
    path = _os.path.join(base, name)
    if not _os.path.exists(path):
        raise FileNotFoundError(f"Prompt file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()
