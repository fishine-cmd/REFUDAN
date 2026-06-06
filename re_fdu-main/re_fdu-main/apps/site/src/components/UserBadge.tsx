"use client";

import { useEffect, useState } from "react";

interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: "senior" | "junior";
}

export function UserBadge() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    window.location.href = "/";
  }

  if (!loaded) {
    return null;
  }

  if (!user) {
    return (
      <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
        <a className="frame__button" href="/login">登录</a>
        <a className="frame__button" href="/signup">注册</a>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center", fontSize: "0.8rem" }}>
      <span>
        {user.displayName} · <span style={{ opacity: 0.7 }}>{user.role === "senior" ? "学长" : "学弟"}</span>
      </span>
      <button
        type="button"
        onClick={logout}
        className="frame__button"
        style={{ cursor: "pointer", background: "transparent", border: "1px solid var(--border-default, #888)" }}
      >
        登出
      </button>
    </span>
  );
}
