"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
const directionOptions = [
  "保研 / 夏令营策略",
  "实习 / 求职准备",
  "科研方向 / 读研判断",
  "跨专业 / 转轨选择",
];

function getRadarPoints(values: [number, number, number, number]) {
  const center = 50;
  const radius = 38;
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
  const searchParams = useSearchParams();

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [all, setAll] = useState<PublicSenior[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [me, setMe] = useState<{ displayName: string; hasBuiltProfile: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState(searchParams.get("direction") ?? directionOptions[0]);
  const [question, setQuestion] = useState("");
  const [recommendationBusy, setRecommendationBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/seniors").then((r) => r.json()),
      fetch("/api/chats").then((r) => r.json()),
      fetch("/api/profile/me").then((r) => r.json()),
    ])
      .then(([meRes, allRes, chatsRes, profRes]) => {
        const u = meRes?.user ?? meRes;
        setMe({
          displayName: u?.displayName ?? "",
          hasBuiltProfile: !!(profRes?.builtProfile ?? profRes?.built_profile_json ?? null),
        });
        setAll(
          (allRes?.mentors ?? []).map(
            (m: { id: string; name: string; title?: string | null; avatar?: string | null; tags?: string[]; highlight?: string | null }) => ({
              id: m.id,
              displayName: m.name,
              title: m.title,
              avatar: m.avatar,
              tags: m.tags,
              highlight: m.highlight,
            }),
          ),
        );
        setChats(chatsRes?.chats ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!me?.hasBuiltProfile) return;
    const controller = new AbortController();
    const run = async () => {
      setRecommendationBusy(true);
      try {
        const params = new URLSearchParams();
        if (direction.trim()) params.set("direction", direction.trim());
        if (question.trim()) params.set("question", question.trim());
        const res = await fetch(`/api/seniors/recommend?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setRecs(data?.recommendations ?? []);
      } catch {
        if (!controller.signal.aborted) setRecs([]);
      } finally {
        if (!controller.signal.aborted) setRecommendationBusy(false);
      }
    };
    run();
    return () => controller.abort();
  }, [direction, question, me?.hasBuiltProfile]);

  if (loading) return <main className="dashboard-shell"><p>加载中...</p></main>;

  const filtered = all.filter((s) => {
    if (!q.trim()) return true;
    const hay = [s.displayName, s.title ?? "", ...(s.tags ?? []), s.highlight ?? ""].join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const cameFromBuild = searchParams.get("from") === "agent-built";

  return (
    <main className="dashboard-shell">
      <section className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <p className="dashboard-eyebrow">Junior dashboard</p>
          <h1>{me?.displayName ? `${me.displayName}，先明确你最想问哪一类问题。` : "先明确你最想问哪一类问题。"}</h1>
          <p className="dashboard-summary">
            先定问题方向，再让系统基于你的画像重排学长 Agent。这样推荐不是泛泛展示，而是围绕你下一步真正要问的内容组织。
          </p>
          <div className="dashboard-actions">
            <Link className="dashboard-primary" href="/agent-workbench">
              更新我的画像
            </Link>
            <Link className="dashboard-secondary" href="/agent-workbench?section=plaza">
              打开 Agent Plaza
            </Link>
          </div>
        </div>

        <div className="dashboard-hero__meta">
          <div className="dashboard-stat-card">
            <span>Profile</span>
            <strong>{me?.hasBuiltProfile ? "Ready" : "Missing"}</strong>
          </div>
          <div className="dashboard-stat-card">
            <span>Recommendations</span>
            <strong>{recs.length}</strong>
          </div>
          <div className="dashboard-stat-card">
            <span>Active chats</span>
            <strong>{chats.length}</strong>
          </div>
        </div>
      </section>

      {cameFromBuild ? (
        <section className="dashboard-banner dashboard-banner--success">
          你的 Agent 已生成成功。下一步请选择你最想问的主要方向，系统会据此重排推荐。
        </section>
      ) : null}

      {!me?.hasBuiltProfile ? (
        <section className="dashboard-banner">
          完成社媒提取后，推荐会显著更准。<Link href="/agent-workbench">前往 workbench</Link>
        </section>
      ) : null}

      <section className="dashboard-section">
        <div className="dashboard-section__head">
          <div>
            <p className="dashboard-kicker">Step 2 / Question setup</p>
            <h2>你现在最想问什么方向？</h2>
          </div>
        </div>
        <div className="question-panel">
          <div className="question-panel__directions">
            {directionOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={direction === option ? "question-chip is-active" : "question-chip"}
                onClick={() => setDirection(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <textarea
            className="question-panel__textarea"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="补充一句更具体的问题，例如：如果我背景一般，但想冲更强的实验室，最该先补什么？"
          />
          <p className="dashboard-empty">
            {recommendationBusy ? "正在根据你的问题方向重排推荐..." : "方向和问题会直接影响下面学长 Agent 的排序。"}
          </p>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__head">
          <div>
            <p className="dashboard-kicker">Personalized top picks</p>
            <h2>围绕当前问题方向推荐的学长</h2>
          </div>
        </div>
        {recs.length === 0 ? (
          <p className="dashboard-empty">暂无推荐。</p>
        ) : (
          <div className="dashboard-grid dashboard-grid--featured">
            {recs.map((r) => (
              <article key={r.senior.id} className="dashboard-card dashboard-card--featured">
                <div className="dashboard-card__head">
                  <div className="dashboard-identity">
                    {r.senior.avatar ? (
                      <img className="dashboard-avatar" src={r.senior.avatar} alt={r.senior.displayName} />
                    ) : (
                      <div className="dashboard-avatar dashboard-avatar--placeholder" />
                    )}
                    <div>
                      <p className="dashboard-card__name">{r.senior.displayName}</p>
                      <p className="dashboard-card__title">{r.senior.title ?? ""}</p>
                    </div>
                  </div>
                  <span className="dashboard-score">{r.score}</span>
                </div>

                <div className="dashboard-radar" role="img" aria-label="match radar">
                  <svg viewBox="0 0 100 100">
                    <polygon className="radar__frame" points="50,12 88,50 50,88 12,50" />
                    <polygon className="radar__data" points={getRadarPoints(r.scores)} />
                  </svg>
                  <div className="dashboard-radar__labels">
                    {axes.map((a) => (
                      <span key={a}>{a}</span>
                    ))}
                  </div>
                </div>

                <ul className="dashboard-reasons">
                  {r.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>

                <Link className="dashboard-primary dashboard-primary--compact" href={`/seniors/${r.senior.id}`}>
                  查看详情并提问
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__head">
          <div>
            <p className="dashboard-kicker">Searchable directory</p>
            <h2>全部学长</h2>
          </div>
          <input
            className="dashboard-search"
            placeholder="搜索姓名 / 标签 / 方向"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="dashboard-grid">
          {filtered.map((s) => (
            <article key={s.id} className="dashboard-card">
              <div className="dashboard-card__head">
                <div>
                  <p className="dashboard-card__name">{s.displayName}</p>
                  <p className="dashboard-card__title">{s.title ?? ""}</p>
                </div>
              </div>
              <p className="dashboard-card__body">{s.highlight ?? ""}</p>
              <div className="dashboard-token-row">
                {(s.tags ?? []).slice(0, 4).map((tag) => (
                  <span key={tag} className="dashboard-token">
                    {tag}
                  </span>
                ))}
              </div>
              <Link className="dashboard-secondary dashboard-secondary--compact" href={`/seniors/${s.id}`}>
                查看资料
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__head">
          <div>
            <p className="dashboard-kicker">Conversation log</p>
            <h2>我的对话</h2>
          </div>
        </div>
        {chats.length === 0 ? (
          <p className="dashboard-empty">还没有发起过对话。</p>
        ) : (
          <div className="conversation-list">
            {chats.map((c) => (
              <Link key={c.chatId} href={`/chat/${c.chatId}`} className="conversation-row">
                <div>
                  <strong>{c.senior?.displayName ?? "已离开"}</strong>
                  <p>{c.summary}</p>
                </div>
                <time>{new Date(c.lastMessageAt).toLocaleString()}</time>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
