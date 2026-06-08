"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { productPrinciple } from "@/lib/product-language";

type Role = "senior" | "junior";

function SignupForm() {
  const sp = useSearchParams();
  const presetRole: Role = sp.get("role") === "senior" ? "senior" : "junior";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>(presetRole);
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
      window.location.href = "/me";
    } catch (err) {
      setError(`Network error: ${String(err)}`);
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel auth-panel--copy">
        <p className="landing-eyebrow">Create account</p>
        <h1>把你的经验系统化，或让你的问题更早抵达。</h1>
        <p className="auth-copy">
          学长侧会把 Agent 档案变成可注入的经验接口，学弟侧会把个人画像变成更精准的推荐和更高质量的提问。
          {" "}整个系统的核心原则是“{productPrinciple}”。
        </p>
        <div className="auth-role-preview">
          <button
            type="button"
            className={role === "junior" ? "auth-role-chip is-active" : "auth-role-chip"}
            onClick={() => setRole("junior")}
          >
            学弟 / 学妹
          </button>
          <button
            type="button"
            className={role === "senior" ? "auth-role-chip is-active" : "auth-role-chip"}
            onClick={() => setRole("senior")}
          >
            学长 / 学姐
          </button>
        </div>
      </section>

      <section className="auth-panel auth-panel--form">
        <div className="auth-panel__head">
          <p className="landing-eyebrow">身份设置</p>
          <h2>注册 RE:FUDAN 账号</h2>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <fieldset className="auth-segment">
            <legend>身份</legend>
            <label className="auth-radio">
              <input type="radio" name="role" value="senior" checked={role === "senior"} onChange={() => setRole("senior")} />
              <span>学长 / 学姐</span>
            </label>
            <label className="auth-radio">
              <input type="radio" name="role" value="junior" checked={role === "junior"} onChange={() => setRole("junior")} />
              <span>学弟 / 学妹</span>
            </label>
          </fieldset>

          <label className="auth-field">
            <span>用户名</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如 xiaodi2025"
              pattern="^[a-zA-Z0-9_]{3,30}$"
              autoComplete="username"
              required
            />
          </label>

          <label className="auth-field">
            <span>显示名</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如 小弟"
              required
              maxLength={50}
            />
          </label>

          <label className="auth-field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" disabled={busy} className="auth-submit">
            {busy ? "注册中..." : "注册并登录"}
          </button>

          <p className="auth-switch">
            已有账号？<a href="/login">去登录</a>
          </p>
        </form>
      </section>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
