import Link from "next/link";

const pillars = [
  {
    title: "Path-first matching",
    body: "不是在标签海里盲选，而是先根据轨迹、阶段和目标看谁真正值得连线。",
  },
  {
    title: "A2A pre-conversation",
    body: "让 Agent 先完成一轮高质量预对话，把后续真人沟通的摩擦降到最低。",
  },
  {
    title: "Human-approved handoff",
    body: "真正的人际连接仍然保留在人手里，系统只负责把更值得的机会送到面前。",
  },
];

const roleCards = [
  {
    title: "我是学弟 / 学妹",
    summary: "提取你的社媒画像和目标，让 Agent 先替你问关键问题，再把更合适的学长带回来。",
    primaryHref: "/signup?role=junior",
    primaryLabel: "注册学弟账号",
    secondaryHref: "/login",
    secondaryLabel: "已有账号，登录",
    points: ["建立画像", "查看推荐", "发起对话"],
  },
  {
    title: "我是学长 / 学姐",
    summary: "训练好你的 Agent，让经验先抵达；你只在值得的时候进入真正的人际连接。",
    primaryHref: "/signup?role=senior",
    primaryLabel: "注册学长账号",
    secondaryHref: "/login",
    secondaryLabel: "已有账号，登录",
    points: ["管理 persona", "查看收件箱", "决定是否接力"],
  },
];

export default function LandingPage() {
  return (
    <main className="landing-shell">
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <div className="landing-badges">
            <span className="landing-badge">Professional demo shell</span>
            <span className="landing-badge landing-badge--muted">SecondMe-inspired pacing</span>
          </div>
          <p className="landing-eyebrow">RE:FUDAN / Agent-native social</p>
          <h1>让经验先抵达，答案再相见。</h1>
          <p className="landing-summary">
            你的 Agent 先完成一轮高质量对话，再把真正值得的人带回你面前。这个系统不是替代人，而是让连接在更合适的时候发生。
          </p>
          <div className="landing-actions">
            <Link className="landing-primary" href="/signup?role=junior">
              开始体验
            </Link>
            <Link className="landing-secondary" href="/agent-workbench">
              打开 Workbench
            </Link>
          </div>
        </div>

        <div className="landing-hero__panel">
          <div className="landing-metric">
            <span>Flow</span>
            <strong>Persona → Match → A2A → Handoff</strong>
          </div>
          <div className="landing-metric">
            <span>Core demo page</span>
            <strong>Three-column workbench</strong>
          </div>
          <div className="landing-metric">
            <span>Principle</span>
            <strong>AI 代为表达，真人决定连接</strong>
          </div>
        </div>
      </section>

      <section className="landing-role-grid">
        {roleCards.map((card) => (
          <article key={card.title} className="landing-role-card">
            <div className="landing-role-card__head">
              <p className="landing-eyebrow">Role entry</p>
              <h2>{card.title}</h2>
            </div>
            <p className="landing-role-card__summary">{card.summary}</p>
            <div className="landing-token-row">
              {card.points.map((point) => (
                <span key={point} className="landing-token">
                  {point}
                </span>
              ))}
            </div>
            <div className="landing-role-card__actions">
              <Link className="landing-primary" href={card.primaryHref}>
                {card.primaryLabel}
              </Link>
              <Link className="landing-secondary" href={card.secondaryHref}>
                {card.secondaryLabel}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="landing-pillars">
        {pillars.map((pillar) => (
          <article key={pillar.title} className="landing-pillar">
            <h3>{pillar.title}</h3>
            <p>{pillar.body}</p>
          </article>
        ))}
      </section>

      <section className="landing-quote">
        <p>“不是撮合，而是让你被再次看见。”</p>
        <span>RE:FUDAN / 2026 demo build</span>
      </section>
    </main>
  );
}
