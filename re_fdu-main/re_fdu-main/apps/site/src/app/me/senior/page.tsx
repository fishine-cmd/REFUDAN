"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PublicJunior {
  id: string;
  displayName: string;
  avatar?: string | null;
}

interface InboxItem {
  chatId: string;
  createdAt: number;
  lastMessageAt: number;
  summary: string;
  unread: boolean;
  junior: PublicJunior | null;
}

interface Persona {
  background: string;
  expertise: string;
}

export default function SeniorHome() {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [me, setMe] = useState<{ displayName: string; persona: Persona | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/inbox").then((r) => r.json()),
    ])
      .then(([meRes, ibRes]) => {
        const u = meRes?.user ?? meRes;
        setMe({
          displayName: u?.displayName ?? "",
          persona: u?.persona ?? null,
        });
        setInbox(ibRes?.inbox ?? []);
        setUnreadCount(ibRes?.unreadCount ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="me-shell"><p>加载中…</p></main>;

  return (
    <main className="me-shell">
      <header className="me-hero">
        <p className="me-eyebrow">学长主页</p>
        <h1>你好,{me?.displayName ?? ""}。</h1>
        <p>
          你的 Agent 已和 <strong>{inbox.length}</strong> 位学弟聊过,
          <strong style={{ color: "var(--accent)" }}>{unreadCount}</strong> 条未读。
        </p>
      </header>

      <section className="me-section">
        <h2>收件箱</h2>
        {inbox.length === 0 ? (
          <p className="me-muted">还没有学弟来找你。先去 workbench 完善你的画像 →</p>
        ) : (
          <ul className="me-inbox">
            {inbox.map((it) => (
              <li key={it.chatId} className={it.unread ? "me-inbox-unread" : ""}>
                <Link href={`/chat/${it.chatId}`}>
                  <span className={`me-dot ${it.unread ? "me-dot-on" : ""}`} />
                  <strong>{it.junior?.displayName ?? "匿名学弟"}</strong>
                  <span className="me-muted">{it.summary || "(空对话)"}</span>
                  <time>{new Date(it.lastMessageAt).toLocaleString()}</time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="me-section">
        <h2>我的 Agent persona</h2>
        {me?.persona ? (
          <div className="me-card" style={{ display: "block" }}>
            <p><strong>背景:</strong>{me.persona.background}</p>
            <p><strong>专长:</strong>{me.persona.expertise}</p>
            <Link className="me-cta" href="/agent-workbench">更新我的资料</Link>
          </div>
        ) : (
          <p className="me-muted">
            还没生成 persona。<Link className="me-inline-cta" href="/agent-workbench">去 workbench →</Link>
          </p>
        )}
      </section>
    </main>
  );
}
