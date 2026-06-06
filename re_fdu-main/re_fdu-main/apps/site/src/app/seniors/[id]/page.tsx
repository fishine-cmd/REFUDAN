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

  if (loading) return <main className="me-shell"><p>加载中…</p></main>;
  if (!senior) return <main className="me-shell"><p>没找到该学长。</p></main>;

  return (
    <main className="me-shell">
      <header className="me-hero">
        <p className="me-eyebrow">学长资料</p>
        <h1>{senior.displayName}</h1>
        <p className="me-muted">{senior.title}</p>
      </header>
      <section className="me-section">
        <p>{senior.highlight}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "1rem" }}>
          {(senior.tags ?? []).map((t) => (
            <span key={t} style={{
              border: "1px solid var(--border-default)",
              borderRadius: "999px",
              padding: "0.2rem 0.65rem",
              fontSize: "0.7rem",
              color: "var(--accent)",
            }}>{t}</span>
          ))}
        </div>
      </section>
      {senior.persona && (
        <section className="me-section">
          <h2>背景</h2>
          <p>{senior.persona.background}</p>
          <h2>专长</h2>
          <p>{senior.persona.expertise}</p>
        </section>
      )}
      <section className="me-section">
        <Link className="me-cta" href={`/chat/new?seniorId=${senior.id}`}>
          让我的 Agent 去聊聊
        </Link>
      </section>
    </main>
  );
}
