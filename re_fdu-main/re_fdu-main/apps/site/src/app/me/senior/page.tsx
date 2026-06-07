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
    Promise.all([fetch("/api/auth/me").then((r) => r.json()), fetch("/api/inbox").then((r) => r.json())])
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

  if (loading) return <main className="dashboard-shell"><p>加载中...</p></main>;

  return (
    <main className="dashboard-shell">
      <section className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <p className="dashboard-eyebrow">Senior dashboard</p>
          <h1>{me?.displayName ? `${me.displayName}，你的经验正在替你先抵达。` : "你的经验正在替你先抵达。"}</h1>
          <p className="dashboard-summary">
            你的 Agent 先处理第一轮沟通，你只在值得的时候接力。这一页更像收件箱和 persona 控制台，而不是普通社交首页。
          </p>
          <div className="dashboard-actions">
            <Link className="dashboard-primary" href="/agent-workbench">
              更新我的 persona
            </Link>
            <Link className="dashboard-secondary" href="/me/senior">
              刷新当前视图
            </Link>
          </div>
        </div>

        <div className="dashboard-hero__meta">
          <div className="dashboard-stat-card">
            <span>Inbox threads</span>
            <strong>{inbox.length}</strong>
          </div>
          <div className="dashboard-stat-card">
            <span>Unread</span>
            <strong>{unreadCount}</strong>
          </div>
          <div className="dashboard-stat-card">
            <span>Persona</span>
            <strong>{me?.persona ? "Ready" : "Missing"}</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid--two">
        <div className="dashboard-section dashboard-section--stretch">
          <div className="dashboard-section__head">
            <div>
              <p className="dashboard-kicker">Inbox view</p>
              <h2>收件箱</h2>
            </div>
          </div>
          {inbox.length === 0 ? (
            <p className="dashboard-empty">
              还没有学弟来找你。先去 <Link href="/agent-workbench">workbench 完善画像</Link>。
            </p>
          ) : (
            <div className="conversation-list">
              {inbox.map((it) => (
                <Link key={it.chatId} href={`/chat/${it.chatId}`} className={it.unread ? "conversation-row is-unread" : "conversation-row"}>
                  <div>
                    <strong>{it.junior?.displayName ?? "匿名学弟"}</strong>
                    <p>{it.summary || "(空对话)"}</p>
                  </div>
                  <div className="conversation-row__meta">
                    {it.unread ? <span className="conversation-pill">Unread</span> : null}
                    <time>{new Date(it.lastMessageAt).toLocaleString()}</time>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__head">
            <div>
              <p className="dashboard-kicker">Persona preview</p>
              <h2>我的 Agent persona</h2>
            </div>
          </div>
          {me?.persona ? (
            <div className="dashboard-card dashboard-card--stacked">
              <div className="dashboard-card__block">
                <span>背景</span>
                <p>{me.persona.background}</p>
              </div>
              <div className="dashboard-card__block">
                <span>专长</span>
                <p>{me.persona.expertise}</p>
              </div>
              <Link className="dashboard-primary dashboard-primary--compact" href="/agent-workbench">
                更新我的资料
              </Link>
            </div>
          ) : (
            <p className="dashboard-empty">
              还没生成 persona。<Link href="/agent-workbench">去 workbench</Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
