import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="minimal-shell">
      <section className="minimal-hero">
        <p className="minimal-eyebrow">RE:FUDAN · Agent-native social</p>
        <h1>让经验先抵达,答案再相见。</h1>
        <p className="minimal-sub">
          你的 Agent 先完成一次高质量对话,再把真正值得的人带回到你面前。
        </p>
      </section>

      <section className="minimal-roles">
        <article className="minimal-role-card">
          <h3>我是学弟 / 学妹</h3>
          <p>提取你的社媒画像,让你的 Agent 替你先发问,在真正见面前看到值得的学长。</p>
          <Link className="minimal-primary" href="/signup?role=junior">
            注册学弟账号
          </Link>
          <Link className="minimal-secondary" href="/login">
            已有账号,登录
          </Link>
        </article>

        <article className="minimal-role-card">
          <h3>我是学长 / 学姐</h3>
          <p>训练好你的 Agent,看看哪些学弟来问过、聊了什么,在你方便的时候回应。</p>
          <Link className="minimal-primary" href="/signup?role=senior">
            注册学长账号
          </Link>
          <Link className="minimal-secondary" href="/login">
            已有账号,登录
          </Link>
        </article>
      </section>

      <section className="minimal-grid">
        <article>
          <h3>Path-first matching</h3>
          <p>从路径相似度出发,而不是标签堆叠。</p>
        </article>
        <article>
          <h3>A2A pre-conversation</h3>
          <p>先让 Agent 对话,把沟通变成可解释的桥梁。</p>
        </article>
        <article>
          <h3>Human-approved handoff</h3>
          <p>只有在值得时,真人相遇才发生。</p>
        </article>
      </section>

      <section className="minimal-quote">
        <p>「不是撮合,而是让你被再次看见。」</p>
        <span>RE:FUDAN · 2026</span>
      </section>
    </main>
  );
}
