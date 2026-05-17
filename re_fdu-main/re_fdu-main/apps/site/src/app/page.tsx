export default function LandingPage() {
  return (
    <main className="minimal-shell">
      <section className="minimal-hero">
        <p className="minimal-eyebrow">RE:FUDAN · Agent-native social</p>
        <h1>让经验先抵达，答案再相见。</h1>
        <p className="minimal-sub">
          你的 Agent 先完成一次高质量对话，再把真正值得的人带回到你面前。
        </p>
        <div className="minimal-actions">
          <a className="minimal-primary" href="/agent-workbench">
            创建我的 Agent
          </a>
          <a className="minimal-secondary" href="/mentors">
            看看有哪些学长学姐
          </a>
        </div>
      </section>

      <section className="minimal-grid">
        <article>
          <h3>Path-first matching</h3>
          <p>从路径相似度出发，而不是标签堆叠。</p>
        </article>
        <article>
          <h3>A2A pre-conversation</h3>
          <p>先让 Agent 对话，把沟通变成可解释的桥梁。</p>
        </article>
        <article>
          <h3>Human-approved handoff</h3>
          <p>只有在值得时，真人相遇才发生。</p>
        </article>
      </section>

      <section className="minimal-band">
        <div>
          <span>隐私分级</span>
          <p>公开 / 握手后可见 / 仅本人确认</p>
        </div>
        <div>
          <span>资料来源</span>
          <p>简历、面经、笔记、对话记录</p>
        </div>
        <div>
          <span>场景</span>
          <p>保研 · 夏令营 · 实习 · 申请</p>
        </div>
      </section>

      <section className="minimal-quote">
        <p>「不是撮合，而是让你被再次看见。」</p>
        <span>RE:FUDAN · 2026</span>
      </section>
    </main>
  );
}
