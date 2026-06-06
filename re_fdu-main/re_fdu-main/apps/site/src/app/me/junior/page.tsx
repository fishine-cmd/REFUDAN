"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PublicSenior {
  id: string;
  displayName: string;
  title?: string | null;
  avatar?: string | null;
  tags?: string[];
  highlight?: string | null;
}

interface Recommendation {
  senior: PublicSenior;
  score: number;
  scores: [number, number, number, number];
  reasons: string[];
}

interface ChatSummary {
  chatId: string;
  lastMessageAt: number;
  summary: string;
  senior: PublicSenior | null;
}

const axes = ["院校匹配", "专业匹配", "目标重合", "经历相似"] as const;

function getRadarPoints(values: [number, number, number, number]) {
  const center = 50, radius = 38;
  return values
    .map((value, index) => {
      const angle = (Math.PI * 2 * index) / values.length - Math.PI / 2;
      const ratio = value / 100;
      const x = center + Math.cos(angle) * radius * ratio;
      const y = center + Math.sin(angle) * radius * ratio;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function JuniorHome() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [all, setAll] = useState<PublicSenior[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [me, setMe] = useState<{ displayName: string; hasBuiltProfile: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/seniors/recommend").then((r) => r.json()),
      fetch("/api/seniors").then((r) => r.json()),
      fetch("/api/chats").then((r) => r.json()),
      fetch("/api/profile/me").then((r) => r.json()),
    ])
      .then(([meRes, recRes, allRes, chatsRes, profRes]) => {
        const u = meRes?.user ?? meRes;
        setMe({
          displayName: u?.displayName ?? "",
          hasBuiltProfile: !!(profRes?.builtProfile ?? profRes?.built_profile_json ?? null),
        });
        setRecs(recRes?.recommendations ?? []);
        // /api/seniors 返回 MentorSummary[],适配
        setAll((allRes?.mentors ?? []).map((m: { id: string; name: string; title?: string | null; avatar?: string | null; tags?: string[]; highlight?: string | null }) => ({
          id: m.id, displayName: m.name, title: m.title, avatar: m.avatar,
          tags: m.tags, highlight: m.highlight,
        })));
        setChats(chatsRes?.chats ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="me-shell"><p>加载中…</p></main>;

  const filtered = all.filter((s) => {
    if (!q.trim()) return true;
    const hay = [s.displayName, s.title ?? "", ...(s.tags ?? []), s.highlight ?? ""].join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <main className="me-shell">
      <header className="me-hero">
        <p className="me-eyebrow">学弟主页</p>
        <h1>你好,{me?.displayName ?? ""}。</h1>
        {me?.hasBuiltProfile ? (
          <p>已完成社媒提取,下方推荐基于你的真实画像。</p>
        ) : (
          <p>
            完成社媒提取后推荐会更准 ——
            <Link className="me-inline-cta" href="/agent-workbench">去 workbench →</Link>
          </p>
        )}
      </header>

      <section className="me-section">
        <h2>为你推荐的学长</h2>
        {recs.length === 0 ? (
          <p className="me-muted">暂无推荐。</p>
        ) : (
          <div className="me-grid">
            {recs.map((r) => (
              <article key={r.senior.id} className="me-card">
                <div className="me-card-head">
                  {r.senior.avatar ? (
                    <img className="me-avatar" src={r.senior.avatar} alt={r.senior.displayName} />
                  ) : (
                    <div className="me-avatar me-avatar-placeholder" />
                  )}
                  <div>
                    <p className="me-card-name">{r.senior.displayName}</p>
                    <p className="me-card-title">{r.senior.title ?? ""}</p>
                  </div>
                  <span className="me-score">{r.score}</span>
                </div>
                <div className="me-radar" role="img">
                  <svg viewBox="0 0 100 100">
                    <polygon className="radar__frame" points="50,12 88,50 50,88 12,50" />
                    <polygon className="radar__data" points={getRadarPoints(r.scores)} />
                  </svg>
                  <div className="me-radar-labels">
                    {axes.map((a) => <span key={a}>{a}</span>)}
                  </div>
                </div>
                <ul className="me-reasons">
                  {r.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                </ul>
                <Link className="me-cta" href={`/seniors/${r.senior.id}`}>
                  查看 · 向 ta 提问
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="me-section">
        <h2>全部学长</h2>
        <input
          className="me-search"
          placeholder="搜索姓名 / 标签 / 院校"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="me-grid">
          {filtered.map((s) => (
            <article key={s.id} className="me-card me-card-compact">
              <p className="me-card-name">{s.displayName}</p>
              <p className="me-card-title">{s.title ?? ""}</p>
              <p className="me-muted">{s.highlight ?? ""}</p>
              <Link className="me-cta" href={`/seniors/${s.id}`}>查看</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="me-section">
        <h2>我的对话</h2>
        {chats.length === 0 ? (
          <p className="me-muted">还没发起过对话。挑一位学长去聊聊吧。</p>
        ) : (
          <ul className="me-chatlist">
            {chats.map((c) => (
              <li key={c.chatId}>
                <Link href={`/chat/${c.chatId}`}>
                  <strong>{c.senior?.displayName ?? "已离开"}</strong>
                  <span className="me-muted">{c.summary}</span>
                  <time>{new Date(c.lastMessageAt).toLocaleString()}</time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
