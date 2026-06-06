# schoolmate/agents/embedding.py
"""EmbeddingGenerator — generates vector embeddings for profile matching.

After ProfileSynthesizer produces a unified profile, this agent generates
a dense embedding vector stored in FAISS for local similarity search.

Uses DeepSeek embedding API (same API key as LLM analysis).
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np

from schoolmate.config import EMBEDDING_DIM, LLM_API_KEY, LLM_BASE_URL


class EmbeddingGenerator:
    """Generate vector embeddings from unified profile JSON.

    Uses the DeepSeek embedding API to produce dense vectors for
    FAISS-based similarity matching.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        embedding_dim: int | None = None,
    ):
        import urllib.request
        import urllib.error

        self.api_key = api_key or LLM_API_KEY
        self.base_url = (base_url or LLM_BASE_URL).rstrip("/")
        self.embedding_dim = embedding_dim or EMBEDDING_DIM

    def generate(self, profile: dict[str, Any]) -> np.ndarray:
        """Generate an embedding vector for a unified profile.

        Converts the profile into a text representation and calls the
        DeepSeek embeddings API. Falls back to a TF-IDF-based embedding
        if the API is unavailable.
        """
        text = self._profile_to_text(profile)

        try:
            return self._embed_via_api(text)
        except Exception as e:
            print(f"[Embedding] API failed ({e}), using fallback TF-IDF embedding.")
            return self._embed_fallback(text)

    def generate_batch(self, profiles: list[dict[str, Any]]) -> list[np.ndarray]:
        """Generate embeddings for multiple profiles."""
        return [self.generate(p) for p in profiles]

    # ── Internals ──

    def _profile_to_text(self, profile: dict[str, Any]) -> str:
        """Convert a structured profile into a text representation for embedding."""
        parts = []

        bi = profile.get("basic_info", {})
        if bi.get("display_name"):
            parts.append(f"Name: {bi['display_name']}")
        if bi.get("bio"):
            parts.append(f"Bio: {bi['bio']}")

        # Content topics
        topics = profile.get("content_topics", [])
        if topics:
            topic_strs = [f"{t.get('topic', '')} (confidence: {t.get('confidence', 0)})"
                         for t in topics[:10]]
            parts.append("Topics: " + "; ".join(topic_strs))

        # Skills
        inferred = profile.get("inferred_signals", {})
        skills = inferred.get("skills_inferred", [])
        if skills:
            parts.append("Skills: " + ", ".join(skills[:20]))

        # Career domains
        domains = inferred.get("career_domains", {})
        if domains:
            parts.append("Career domains: " + ", ".join(domains.keys()))

        # Education
        edu = inferred.get("education", {})
        if edu:
            edu_parts = []
            for k, v in edu.items():
                edu_parts.append(f"{k}: {v}")
            parts.append("Education: " + "; ".join(edu_parts))

        # Interests
        interests = inferred.get("interests", [])
        if interests:
            parts.append("Interests: " + ", ".join(interests[:15]))

        # Industry signals
        industry = inferred.get("industry_signals", [])
        if industry:
            parts.append("Industry signals: " + ", ".join(industry[:10]))

        # Content roles
        roles = inferred.get("content_roles", [])
        if roles:
            role_strs = [r.get("role", "") if isinstance(r, dict) else str(r) for r in roles[:10]]
            parts.append("Content roles: " + ", ".join(filter(None, role_strs)))

        # Style
        style = profile.get("style_profile", {})
        tone = style.get("tone", [])
        if tone:
            parts.append("Tone: " + ", ".join(tone))

        # Audience
        audience = profile.get("audience_guess", {})
        if audience.get("description"):
            parts.append(f"Audience: {audience['description']}")

        return "\n".join(parts)[:4000]

    def _embed_via_api(self, text: str) -> np.ndarray:
        """Call DeepSeek embedding API."""
        import urllib.request
        import urllib.error

        url = f"{self.base_url}/v1/embeddings"
        payload = json.dumps({
            "model": "deepseek-chat",
            "input": text,
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            embedding = data["data"][0]["embedding"]
            vec = np.array(embedding, dtype=np.float32)
            # Normalize for cosine similarity (inner product)
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            return vec
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"Embedding API HTTP {e.code}: {body}") from e

    def _embed_fallback(self, text: str) -> np.ndarray:
        """Fallback: TF-IDF-like character n-gram embedding.

        Generates a fixed-dimension embedding using character n-gram hashing.
        No external dependencies required.
        """
        dim = self.embedding_dim
        vec = np.zeros(dim, dtype=np.float32)

        # Character n-grams (n=2,3,4)
        for n in [2, 3, 4]:
            for i in range(len(text) - n + 1):
                ngram = text[i:i + n]
                h = hash(ngram) % dim
                vec[h] += 1.0

        # Normalize
        total = np.sum(vec)
        if total > 0:
            vec = vec / total

        # L2 normalize for inner product similarity
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm

        return vec.astype(np.float32)
