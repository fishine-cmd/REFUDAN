"use client";

import { useEffect, useState } from "react";

type MentorSummary = {
  id: string;
  name: string;
  title: string;
  avatar: string | null;
  scores: [number, number, number, number];
  tags: string[];
  badges: string[];
  highlight: string;
  meta: string;
};

const axes = ["院校匹配", "专业匹配", "目标重合", "经历相似"] as const;

function getRadarPoints(values: MentorSummary["scores"]) {
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

export default function MentorMatchPage() {
  const [mentors, setMentors] = useState<MentorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/mentors")
      .then((res) => res.json())
      .then((data) => setMentors(data.mentors ?? []))
      .catch(() => setMentors([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mentor-page">
      <header className="mentor-hero">
        <p className="mentor-hero__eyebrow">PATH MATCHING</p>
        <h1>为你推荐的 {mentors.length} 位学长学姐</h1>
        <p className="mentor-hero__sub">
          依据路径相似度与目标重合度筛选，先让 Agent 去聊，再决定是否进一步见面。
        </p>
      </header>

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem" }}>
          正在加载学长学姐资料...
        </p>
      ) : (
        <section className="mentor-grid" aria-label="Mentor recommendations">
          {mentors.map((mentor) => (
            <article key={mentor.id} className="mentor-card">
              <div className="mentor-card__header">
                {mentor.avatar ? (
                  <img
                    className="mentor-card__avatar"
                    src={mentor.avatar}
                    alt={mentor.name}
                  />
                ) : (
                  <div
                    className="mentor-card__avatar mentor-card__avatar--placeholder"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p className="mentor-card__alias">{mentor.name}</p>
                  <p className="mentor-card__title">{mentor.title}</p>
                </div>
              </div>

              <div className="mentor-card__radar" role="img" aria-label="匹配雷达图">
                <svg viewBox="0 0 100 100" className="radar">
                  <polygon className="radar__frame" points="50,12 88,50 50,88 12,50" />
                  <polygon className="radar__data" points={getRadarPoints(mentor.scores)} />
                </svg>
                <div className="radar__labels">
                  {axes.map((axis) => (
                    <span key={axis}>{axis}</span>
                  ))}
                </div>
              </div>

              <div className="mentor-card__tags" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {mentor.tags.map((tag) => (
                  <span key={tag} style={{
                    border: "1px solid var(--border-default)",
                    borderRadius: "999px",
                    padding: "0.2rem 0.65rem",
                    fontSize: "0.65rem",
                    fontWeight: 500,
                    color: "var(--accent)",
                  }}>{tag}</span>
                ))}
              </div>

              <p className="mentor-card__highlight">{mentor.highlight}</p>

              <a className="mentor-card__cta" href={`/agent-workbench?mentor=${mentor.id}`}>
                让我的 Agent 去聊聊
              </a>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
