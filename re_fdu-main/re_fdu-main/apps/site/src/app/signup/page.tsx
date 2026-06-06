"use client";

import { useState } from "react";

type Role = "senior" | "junior";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("junior");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password, role, displayName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "注册失败");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch (err) {
      setError(`Network error: ${String(err)}`);
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 460, margin: "5rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: "0.25rem" }}>注册 RE:FUDAN 账号</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
        学长可以提取自己社媒画像作为 AI 分身资料；学弟用于和学长对话获取经验。
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <fieldset style={{ border: "1px solid var(--border-default, #888)", borderRadius: 4, padding: "0.6rem 1rem" }}>
          <legend style={{ fontSize: "0.8rem", padding: "0 0.5rem" }}>身份</legend>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", marginRight: "1.2rem" }}>
            <input type="radio" name="role" value="senior" checked={role === "senior"} onChange={() => setRole("senior")} />
            <span>学长</span>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <input type="radio" name="role" value="junior" checked={role === "junior"} onChange={() => setRole("junior")} />
            <span>学弟</span>
          </label>
        </fieldset>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8rem" }}>用户名（3-30 字母/数字/下划线）</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例如 xiaodi2025"
            pattern="^[a-zA-Z0-9_]{3,30}$"
            autoComplete="username"
            required
            style={{ padding: "0.6rem 0.75rem", border: "1px solid var(--border-default, #888)", borderRadius: 4, background: "transparent", color: "inherit" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8rem" }}>显示名</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例如 小弟"
            required
            maxLength={50}
            style={{ padding: "0.6rem 0.75rem", border: "1px solid var(--border-default, #888)", borderRadius: 4, background: "transparent", color: "inherit" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8rem" }}>密码（≥6 位，不能与用户名相同）</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
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
          {busy ? "注册中..." : "注册并登录"}
        </button>

        <p style={{ textAlign: "center", fontSize: "0.85rem", marginTop: "0.5rem" }}>
          已有账号？<a href="/login" style={{ color: "var(--accent, #7ECDC4)" }}>去登录</a>
        </p>
      </form>
    </main>
  );
}
