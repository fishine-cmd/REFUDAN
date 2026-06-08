import Link from "next/link";
import { productFlow, productPrinciple, surfaceNames } from "@/lib/product-language";

const pillars = [
  {
    title: "路径优先推荐",
    body: "不是在标签海里盲选，而是先根据轨迹、阶段和目标判断谁真正值得进入下一步交流。",
  },
  {
    title: "A2A 预沟通",
    body: "让 Agent 先完成一轮高质量预沟通，把后续真人交流前的试探和重复问题降到最低。",
  },
  {
    title: "人工决定接力",
    body: "真正的人际连接仍然保留在人手里，系统只负责把更值得接住的机会送到面前。",
  },
];

const roleCards = [
  {
    title: "我是学弟 / 学妹",
    summary: "完善你的 Agent 档案和目标，让系统先围绕关键问题重排推荐，再把更合适的学长带回来。",
    primaryHref: "/signup?role=junior",
    primaryLabel: "注册学弟账号",
    secondaryHref: "/login",
    secondaryLabel: "已有账号，登录",
    points: ["建立 Agent 档案", "查看推荐", "发起 A2A"],
  },
  {
    title: "我是学长 / 学姐",
    summary: "整理好你的 Agent 档案，让经验先抵达；你只在值得的时候进入真正的人际连接。",
    primaryHref: "/signup?role=senior",
    primaryLabel: "注册学长账号",
    secondaryHref: "/login",
    secondaryLabel: "已有账号，登录",
    points: ["管理 Agent 档案", "查看接力收件台", "决定是否接力"],
  },
];

export default function LandingPage() {
  return (
    <main className="landing-shell">
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <div className="landing-badges">
            <span className="landing-badge">Professional demo shell</span>
            <span className="landing-badge landing-badge--muted">SecondMe-inspired rhythm</span>
          </div>
          <p className="landing-eyebrow">RE:FUDAN / Agent-native campus network</p>
          <h1>让经验先抵达，答案再相见。</h1>
          <p className="landing-summary">
            你的 Agent 先完成一轮高质量对话，再把真正值得的人带回你面前。这个系统不是替代人，而是让连接在更合适的时候发生。
          </p>
          <div className="landing-actions">
            <Link className="landing-primary" href="/signup?role=junior">
              开始体验
            </Link>
            <Link className="landing-secondary" href="/agent-workbench">
              打开{surfaceNames.workspace}
            </Link>
          </div>
        </div>

        <div className="landing-hero__panel">
          <div className="landing-metric">
            <span>Flow</span>
            <strong>{productFlow}</strong>
          </div>
          <div className="landing-metric">
            <span>核心演示页</span>
            <strong>三栏 Agent 工作台</strong>
          </div>
          <div className="landing-metric">
            <span>产品原则</span>
            <strong>{productPrinciple}</strong>
          </div>
        </div>
      </section>

      <section className="landing-role-grid">
        {roleCards.map((card) => (
          <article key={card.title} className="landing-role-card">
            <div className="landing-role-card__head">
              <p className="landing-eyebrow">角色入口</p>
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
        <span>RE:FUDAN / 2026 working demo</span>
      </section>
    </main>
  );
}
