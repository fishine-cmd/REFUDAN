"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "登录失败");
        setBusy(false);
        return;
      }
      window.location.href = "/me";
    } catch (err) {
      setError(`Network error: ${String(err)}`);
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "5rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: "0.25rem" }}>登录 RE:FUDAN</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
        6 个 demo 学长账号默认密码 <code>demo123</code>（详见 README）
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8rem" }}>用户名</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例如 chenxiaoyuan"
            autoComplete="username"
            required
            style={{ padding: "0.6rem 0.75rem", border: "1px solid var(--border-default, #888)", borderRadius: 4, background: "transparent", color: "inherit" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8rem" }}>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{ padding: "0.6rem 0.75rem", border: "1px solid var(--border-default, #888)", borderRadius: 4, background: "transparent", color: "inherit" }}
          />
        </label>

        {error && (
          <p style={{ color: "rgb(239, 68, 68)", fontSize: "0.85rem", margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "0.7rem 1rem",
            borderRadius: 4,
            border: "1px solid var(--accent, #7ECDC4)",
            background: "var(--accent, #7ECDC4)",
            color: "#000",
            cursor: busy ? "wait" : "pointer",
            fontWeight: 500,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "登录中..." : "登录"}
        </button>

        <p style={{ textAlign: "center", fontSize: "0.85rem", marginTop: "0.5rem" }}>
          还没有账号？<a href="/signup" style={{ color: "var(--accent, #7ECDC4)" }}>去注册</a>
        </p>
      </form>
    </main>
  );
}
