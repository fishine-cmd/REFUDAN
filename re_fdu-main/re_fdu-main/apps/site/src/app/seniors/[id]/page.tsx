"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { surfaceNames } from "@/lib/product-language";

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
  const searchParams = useSearchParams();
  const id = params.id;
  const direction = searchParams.get("direction") ?? "";
  const question = searchParams.get("question") ?? "";
  const [senior, setSenior] = useState<SeniorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/seniors/${id}`)
      .then((r) => r.json())
      .then((data) => setSenior(data?.senior ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const launchHref = useMemo(() => {
    if (!senior) return "#";
    return `/a2a/new?seniorId=${senior.id}${direction ? `&direction=${encodeURIComponent(direction)}` : ""}${question ? `&question=${encodeURIComponent(question)}` : ""}`;
  }, [direction, question, senior]);

  if (loading) {
    return (
      <main className="detail-shell">
        <p>正在加载学长资料...</p>
      </main>
    );
  }

  if (!senior) {
    return (
      <main className="detail-shell">
        <p>没有找到这位学长。</p>
      </main>
    );
  }

  return (
    <main className="detail-shell">
      <section className="detail-hero">
        <div className="detail-hero__identity">
          {senior.avatar ? (
            <img className="detail-avatar" src={senior.avatar} alt={senior.displayName} />
          ) : (
            <div className="detail-avatar detail-avatar--placeholder" />
          )}
            <div>
            <p className="dashboard-eyebrow">学长详情</p>
            <h1>{senior.displayName}</h1>
            <p className="detail-subtitle">{senior.title}</p>
            <p className="dashboard-summary">
              这是进入 {surfaceNames.launchPad} 前的确认页。你可以先快速判断这位学长是否适合你当前的问题方向，再决定让自己的 Agent 先去完成第一轮预沟通。
            </p>
          </div>
        </div>

        <div className="detail-actions">
          <Link className="dashboard-primary" href={launchHref}>
            让我的 Agent 发起 A2A
          </Link>
          <Link className="dashboard-secondary" href="/me/junior">
            返回推荐页
          </Link>
        </div>
      </section>

      <section className="detail-grid">
        <article className="detail-card detail-card--lead">
          <p className="dashboard-kicker">匹配理由</p>
          <h2>这位学长适合承接什么问题</h2>
          <p>{senior.highlight || "当前暂无公开摘要。"}</p>
          <div className="dashboard-token-row">
            {(senior.tags ?? []).map((tag) => (
              <span key={tag} className="dashboard-token">
                {tag}
              </span>
            ))}
          </div>
        </article>

        <article className="detail-card">
          <p className="dashboard-kicker">公开信号</p>
          <h2>公开标签与信号</h2>
          <div className="dashboard-token-row">
            {(senior.badges ?? []).map((badge) => (
              <span key={badge} className="conversation-pill">
                {badge}
              </span>
            ))}
          </div>
          <p className="dashboard-empty">
            这些标签会帮助你判断这位学长更适合回答路径选择、经验复盘，还是更具体的实操问题。
          </p>
        </article>

        <article className="detail-card">
          <p className="dashboard-kicker">发起预览</p>
          <h2>进入 {surfaceNames.launchPad} 前的上下文</h2>
          {direction ? <p>主要方向：{direction}</p> : <p>尚未指定主要方向。</p>}
          {question ? <p>问题草稿：{question}</p> : <p>你还没有带入具体问题，下一页可以继续补充。</p>}
        </article>

        <article className="detail-card">
          <p className="dashboard-kicker">后续流程</p>
          <h2>点击后会发生什么</h2>
          <p>系统会先进入 {surfaceNames.launchPad}，确认你的第一句问题。</p>
          <p>提交后会自动创建 P3 会话，让学长 Agent 先完成第一轮预沟通。</p>
          <p>如果人工接力被批准，后续会进入 {surfaceNames.referralBrief}。</p>
        </article>

        {senior.persona ? (
          <article className="detail-card detail-card--wide">
            <p className="dashboard-kicker">调用档案</p>
            <h2>对话时会被注入的 Agent 档案</h2>
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
