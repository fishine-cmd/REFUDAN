"use client";

import { useState } from "react";
import { productPrinciple, surfaceNames } from "@/lib/product-language";

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
    <main className="auth-shell">
      <section className="auth-panel auth-panel--copy">
        <p className="landing-eyebrow">Sign in</p>
        <h1>回到你的 Agent 工作流。</h1>
        <p className="auth-copy">
          登录后你会回到自己的 {surfaceNames.workspace}、{surfaceNames.recommendationHub} 或{" "}
          {surfaceNames.inbox}。整个系统围绕“{productPrinciple}”来组织体验。
        </p>
        <div className="auth-note">
          <span>Demo note</span>
          <strong>默认学长测试账号密码为 `demo123`</strong>
        </div>
      </section>

      <section className="auth-panel auth-panel--form">
        <div className="auth-panel__head">
          <p className="landing-eyebrow">账号访问</p>
          <h2>登录 RE:FUDAN</h2>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>用户名</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如 chenxiaoyuan"
              autoComplete="username"
              required
            />
          </label>

          <label className="auth-field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" disabled={busy} className="auth-submit">
            {busy ? "登录中..." : "登录"}
          </button>

          <p className="auth-switch">
            还没有账号？<a href="/signup">去注册</a>
          </p>
        </form>
      </section>
    </main>
  );
}
