"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface SeniorDetail {
  id: string;
  displayName: string;
  title?: string | null;
  avatar?: string | null;
  tags?: string[];
  badges?: string[];
  highlight?: string | null;
  persona?: { background: string; expertise: string } | null;
}

export default function SeniorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [senior, setSenior] = useState<SeniorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/seniors/${id}`)
      .then((r) => r.json())
      .then((d) => setSenior(d?.senior ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <main className="detail-shell"><p>加载中...</p></main>;
  if (!senior) return <main className="detail-shell"><p>没有找到这位学长。</p></main>;

  return (
    <main className="detail-shell">
      <section className="detail-hero">
        <div className="detail-hero__identity">
          {senior.avatar ? <img className="detail-avatar" src={senior.avatar} alt={senior.displayName} /> : <div className="detail-avatar detail-avatar--placeholder" />}
          <div>
            <p className="dashboard-eyebrow">Senior profile</p>
            <h1>{senior.displayName}</h1>
            <p className="detail-subtitle">{senior.title}</p>
          </div>
        </div>

        <div className="detail-actions">
          <Link className="dashboard-primary" href={`/chat/new?seniorId=${senior.id}`}>
            让我的 Agent 去提问
          </Link>
        </div>
      </section>

      <section className="detail-grid">
        <article className="detail-card detail-card--lead">
          <p className="dashboard-kicker">Profile summary</p>
          <h2>这位学长的公开画像</h2>
          <p>{senior.highlight}</p>
          <div className="dashboard-token-row">
            {(senior.tags ?? []).map((t) => (
              <span key={t} className="dashboard-token">
                {t}
              </span>
            ))}
          </div>
        </article>

        <article className="detail-card">
          <p className="dashboard-kicker">Badges</p>
          <h2>标签层</h2>
          <div className="dashboard-token-row">
            {(senior.badges ?? []).map((badge) => (
              <span key={badge} className="conversation-pill">
                {badge}
              </span>
            ))}
          </div>
        </article>

        {senior.persona ? (
          <article className="detail-card detail-card--wide">
            <p className="dashboard-kicker">Injected persona</p>
            <h2>对话时会被调用的 persona</h2>
            <div className="detail-copy-grid">
              <div>
                <span>背景</span>
                <p>{senior.persona.background}</p>
              </div>
              <div>
                <span>专长</span>
                <p>{senior.persona.expertise}</p>
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
