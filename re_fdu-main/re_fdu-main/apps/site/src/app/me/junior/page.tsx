"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { StatusStrip } from "@/components/status-strip";
import { getA2AFlowStageLabel } from "@/lib/a2a-session-view";
import { surfaceNames } from "@/lib/product-language";

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
  starterReason?: string;
  suggestedOpeningQuestion?: string;
  handoffPotential?: "high" | "medium" | "low";
  a2aStatus?: "idle" | "running" | "completed" | "degraded";
  a2aAdjustedScore?: number | null;
  a2aSummary?: string;
  a2aVerdict?: string | null;
  a2aSessionId?: string | null;
  a2aCoveredSlots?: string[];
  a2aInsights?: string[];
}

interface SessionSummary {
  chatId: string;
  lastMessageAt: number;
  summary: string;
  entryHref: string;
  flowStage: "pending" | "rejected" | "p4-ready" | "p4-prepared" | "p4-completed";
  status?: string;
  provider?: string;
  privacyLevel?: string;
  handoffStatus?: string;
  senior: PublicSenior | null;
}

interface ComposerState {
  text: string;
  busy: boolean;
  expanded: boolean;
  progressLabel: string;
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

function verdictLabel(verdict?: string | null) {
  switch (verdict) {
    case "strong_match":
      return "值得继续引荐";
    case "promising":
      return "有潜力";
    case "not_now":
      return "暂不建议直推";
    case "needs_clarification":
      return "还需补充信息";
    default:
      return "";
  }
}

export default function JuniorHome() {
  const searchParams = useSearchParams();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [all, setAll] = useState<PublicSenior[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [me, setMe] = useState<{ displayName: string; hasAgent: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState(searchParams.get("direction") ?? directionOptions[0]);
  const [question, setQuestion] = useState(searchParams.get("question") ?? "");
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [composers, setComposers] = useState<Record<string, ComposerState>>({});

  async function loadSessions() {
    const sessionsRes = await fetch("/api/a2a/junior-sessions").then((r) => r.json());
    setSessions(sessionsRes?.sessions ?? []);
  }

  async function loadRecommendations(signal?: AbortSignal) {
    if (!me?.hasAgent) return;
    setRecommendationBusy(true);
    try {
      const params = new URLSearchParams();
      if (direction.trim()) params.set("direction", direction.trim());
      if (question.trim()) params.set("question", question.trim());
      const response = await fetch(`/api/seniors/recommend?${params.toString()}`, { signal });
      const data = await response.json();
      setRecs(data?.recommendations ?? []);
    } catch {
      if (!signal?.aborted) setRecs([]);
    } finally {
      if (!signal?.aborted) setRecommendationBusy(false);
    }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/seniors").then((r) => r.json()),
      fetch("/api/a2a/junior-sessions").then((r) => r.json()),
      fetch("/api/profile/me").then((r) => r.json()),
    ])
      .then(([meRes, allRes, sessionsRes, profileRes]) => {
        const user = meRes?.user ?? meRes;
        setMe({
          displayName: user?.displayName ?? "",
          hasAgent: !!(profileRes?.hasAgent ?? profileRes?.builtProfile ?? profileRes?.agentProfile ?? null),
        });
        setAll(
          (allRes?.mentors ?? []).map(
            (mentor: {
              id: string;
              name: string;
              title?: string | null;
              avatar?: string | null;
              tags?: string[];
              highlight?: string | null;
            }) => ({
              id: mentor.id,
              displayName: mentor.name,
              title: mentor.title,
              avatar: mentor.avatar,
              tags: mentor.tags,
              highlight: mentor.highlight,
            }),
          ),
        );
        setSessions(sessionsRes?.sessions ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadRecommendations(controller.signal);
    return () => controller.abort();
  }, [direction, question, me?.hasAgent]);

  function updateComposer(id: string, patch: Partial<ComposerState>) {
    setComposers((prev) => ({
      ...prev,
      [id]: {
        text: prev[id]?.text ?? "",
        busy: prev[id]?.busy ?? false,
        expanded: prev[id]?.expanded ?? false,
        progressLabel: prev[id]?.progressLabel ?? "",
        ...patch,
      },
    }));
  }

  async function runAutoplay(recommendation: Recommendation) {
    const current = composers[recommendation.senior.id];
    const text = current?.text?.trim() || recommendation.suggestedOpeningQuestion || question.trim();
    if (!text) return;

    updateComposer(recommendation.senior.id, {
      busy: true,
      expanded: true,
      progressLabel: "正在发出首条消息并启动 A2A…",
    });

    try {
      const createResponse = await fetch("/api/a2a/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seniorId: recommendation.senior.id,
          question: text,
          origin: "matching",
          autoplay: true,
          intent: {
            direction,
            question,
          },
        }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok || !created?.sessionId) {
        updateComposer(recommendation.senior.id, {
          busy: false,
          progressLabel: created?.error ?? "A2A 创建失败",
        });
        return;
      }

      let done = created?.autoplayState?.done ?? false;
      let round = created?.autoplayState?.round ?? 1;
      let covered = created?.autoplayState?.coveredSlots ?? [];
      updateComposer(recommendation.senior.id, {
        progressLabel: `A2A 第 ${round} 轮进行中，已确认 ${covered.length}/5 个槽位`,
      });

      while (!done) {
        const autoplayResponse = await fetch(`/api/a2a/sessions/${created.sessionId}/autoplay`, {
          method: "POST",
        });
        const advanced = await autoplayResponse.json();
        if (!autoplayResponse.ok) {
          updateComposer(recommendation.senior.id, {
            busy: false,
            progressLabel: advanced?.error ?? "自动推进失败",
          });
          return;
        }
        done = !!advanced.done;
        round = advanced.round ?? round;
        covered = advanced.coveredSlots ?? covered;
        updateComposer(recommendation.senior.id, {
          progressLabel: done
            ? `A2A 已完成，共 ${round} 轮，覆盖 ${covered.length}/5 个槽位`
            : `A2A 第 ${round} 轮进行中，已确认 ${covered.length}/5 个槽位`,
        });
      }

      await Promise.all([loadRecommendations(), loadSessions()]);
      updateComposer(recommendation.senior.id, {
        busy: false,
        text: "",
      });
    } catch {
      updateComposer(recommendation.senior.id, {
        busy: false,
        progressLabel: "网络异常，请稍后重试",
      });
    }
  }

  if (loading) {
    return (
      <main className="dashboard-shell">
        <p>正在加载你的推荐工作台...</p>
      </main>
    );
  }

  const filtered = all.filter((senior) => {
    if (!q.trim()) return true;
    const haystack = [senior.displayName, senior.title ?? "", ...(senior.tags ?? []), senior.highlight ?? ""]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q.toLowerCase());
  });

  const cameFromBuild = searchParams.get("from") === "agent-built";

  return (
    <main className="dashboard-shell">
      <section className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <p className="dashboard-eyebrow">{surfaceNames.recommendationHub}</p>
          <h1>{me?.displayName ? `${me.displayName}，先明确你现在最想问的方向。` : "先明确你现在最想问的方向。"}</h1>
          <p className="dashboard-summary">
            先锁定问题方向，再让系统基于你的画像重排学长 Agent。现在推荐卡片支持从这里直接发出第一条消息，
            随后由你的 Agent 自动与对方 Agent 完成多轮预沟通，并把判断结果回流到匹配结论里。
          </p>
          <div className="dashboard-actions">
            <Link className="dashboard-primary" href="/agent-workbench">
              更新我的 Agent 档案
            </Link>
            <Link className="dashboard-secondary" href="/agent-workbench?section=plaza">
              打开{surfaceNames.plaza}
            </Link>
          </div>
        </div>

        <div className="dashboard-hero__meta">
          <div className="dashboard-stat-card">
            <span>档案状态</span>
            <strong>{me?.hasAgent ? "已就绪" : "待完善"}</strong>
          </div>
          <div className="dashboard-stat-card">
            <span>推荐结果</span>
            <strong>{recs.length}</strong>
          </div>
          <div className="dashboard-stat-card">
            <span>进行中会话</span>
            <strong>{sessions.length}</strong>
          </div>
        </div>
      </section>

      {cameFromBuild ? (
        <StatusStrip
          tone="success"
          message="你的 Agent 已经生成成功。下一步请选择你最想问的主要方向，系统会据此重组推荐。"
        />
      ) : null}

      {!me?.hasAgent ? (
        <StatusStrip message={`完成 ${surfaceNames.profile} 构建后，推荐会明显更准。前往 ${surfaceNames.workspace} 继续完善。`} />
      ) : null}

      <section className="dashboard-section">
        <div className="dashboard-section__head">
          <div>
            <p className="dashboard-kicker">Step 2 / 问题设置</p>
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
            placeholder="补充一句更具体的问题，比如：如果我背景一般，但想冲更强的实验室，最应该先补什么？"
          />
          <p className="dashboard-empty">
            {recommendationBusy ? "系统正在根据你的问题方向重排推荐..." : "方向和问题会直接影响下面学长 Agent 的排序与建议开场方式。"}
          </p>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__head">
          <div>
            <p className="dashboard-kicker">个性化推荐</p>
            <h2>围绕当前问题方向推荐的学长</h2>
          </div>
        </div>
        {recs.length === 0 ? (
          <p className="dashboard-empty">暂时没有可用推荐。</p>
        ) : (
          <div className="dashboard-grid dashboard-grid--featured">
            {recs.map((recommendation) => {
              const composer = composers[recommendation.senior.id];
              return (
                <article key={recommendation.senior.id} className="dashboard-card dashboard-card--featured">
                  <div className="dashboard-card__head">
                    <div className="dashboard-identity">
                      {recommendation.senior.avatar ? (
                        <img
                          className="dashboard-avatar"
                          src={recommendation.senior.avatar}
                          alt={recommendation.senior.displayName}
                        />
                      ) : (
                        <div className="dashboard-avatar dashboard-avatar--placeholder" />
                      )}
                      <div>
                        <p className="dashboard-card__name">{recommendation.senior.displayName}</p>
                        <p className="dashboard-card__title">{recommendation.senior.title ?? ""}</p>
                      </div>
                    </div>
                    <span className="dashboard-score">{recommendation.score}</span>
                  </div>

                  <div className="dashboard-radar" role="img" aria-label="match radar">
                    <svg viewBox="0 0 100 100">
                      <polygon className="radar__frame" points="50,12 88,50 50,88 12,50" />
                      <polygon className="radar__data" points={getRadarPoints(recommendation.scores)} />
                    </svg>
                    <div className="dashboard-radar__labels">
                      {axes.map((axis) => (
                        <span key={axis}>{axis}</span>
                      ))}
                    </div>
                  </div>

                  <ul className="dashboard-reasons">
                    {recommendation.reasons.map((reason, index) => (
                      <li key={`${recommendation.senior.id}-${index}`}>{reason}</li>
                    ))}
                  </ul>

                  <div className="dashboard-token-row">
                    {recommendation.handoffPotential ? (
                      <span className="conversation-pill">handoff {recommendation.handoffPotential}</span>
                    ) : null}
                    {recommendation.starterReason ? (
                      <span className="conversation-pill">{recommendation.starterReason}</span>
                    ) : null}
                    {recommendation.a2aStatus && recommendation.a2aStatus !== "idle" ? (
                      <span className="conversation-pill">A2A {recommendation.a2aStatus}</span>
                    ) : null}
                  </div>

                  {recommendation.suggestedOpeningQuestion ? (
                    <p className="dashboard-card__body">{recommendation.suggestedOpeningQuestion}</p>
                  ) : null}

                  {recommendation.a2aSummary ? (
                    <div className="dashboard-banner dashboard-banner--success">
                      <strong>{verdictLabel(recommendation.a2aVerdict)}</strong>
                      <p>{recommendation.a2aSummary}</p>
                      {recommendation.a2aAdjustedScore != null ? (
                        <p>回流评分：{recommendation.a2aAdjustedScore}</p>
                      ) : null}
                      {recommendation.a2aCoveredSlots?.length ? (
                        <div className="dashboard-token-row">
                          {recommendation.a2aCoveredSlots.map((slot) => (
                            <span key={slot} className="conversation-pill">
                              {slot}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {composer?.expanded ? (
                    <div className="chat-compose-brief">
                      <div>
                        <span>首条消息</span>
                        <textarea
                          className="question-panel__textarea"
                          value={composer.text}
                          onChange={(e) => updateComposer(recommendation.senior.id, { text: e.target.value })}
                          placeholder={recommendation.suggestedOpeningQuestion || "写下第一句真正想问的问题"}
                        />
                      </div>
                      {composer.progressLabel ? (
                        <div>
                          <span>运行状态</span>
                          <p>{composer.progressLabel}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="dashboard-actions">
                    <button
                      type="button"
                      className="dashboard-primary dashboard-primary--compact"
                      disabled={composer?.busy}
                      onClick={() => {
                        if (!composer?.expanded) {
                          updateComposer(recommendation.senior.id, {
                            expanded: true,
                            text: recommendation.suggestedOpeningQuestion || question,
                          });
                          return;
                        }
                        runAutoplay(recommendation);
                      }}
                    >
                      {composer?.busy ? "A2A 运行中..." : composer?.expanded ? "发送首条消息并启动 A2A" : "从这里启动 A2A"}
                    </button>
                    <Link
                      className="dashboard-secondary dashboard-secondary--compact"
                      href={
                        recommendation.a2aSessionId
                          ? `/a2a/${recommendation.a2aSessionId}`
                          : `/seniors/${recommendation.senior.id}?direction=${encodeURIComponent(direction)}&question=${encodeURIComponent(question)}`
                      }
                    >
                      {recommendation.a2aSessionId ? "查看完整会话" : "查看详情"}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__head">
          <div>
            <p className="dashboard-kicker">学长目录</p>
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
          {filtered.map((senior) => (
            <article key={senior.id} className="dashboard-card">
              <div className="dashboard-card__head">
                <div>
                  <p className="dashboard-card__name">{senior.displayName}</p>
                  <p className="dashboard-card__title">{senior.title ?? ""}</p>
                </div>
              </div>
              <p className="dashboard-card__body">{senior.highlight ?? ""}</p>
              <div className="dashboard-token-row">
                {(senior.tags ?? []).slice(0, 4).map((tag) => (
                  <span key={tag} className="dashboard-token">
                    {tag}
                  </span>
                ))}
              </div>
              <Link className="dashboard-secondary dashboard-secondary--compact" href={`/seniors/${senior.id}`}>
                查看资料
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__head">
          <div>
            <p className="dashboard-kicker">{surfaceNames.sessionCenter} 记录</p>
            <h2>我的 A2A 会话</h2>
          </div>
        </div>
        {sessions.length === 0 ? (
          <p className="dashboard-empty">你还没有发起过 A2A 会话。</p>
        ) : (
          <div className="conversation-list">
            {sessions.map((session) => (
              <Link key={session.chatId} href={session.entryHref} className="conversation-row">
                <div>
                  <strong>{session.senior?.displayName ?? "已离开"}</strong>
                  <p>{session.summary || "等待系统生成会话摘要"}</p>
                  <div className="dashboard-token-row">
                    {session.status ? <span className="conversation-pill">{session.status}</span> : null}
                    {session.provider ? <span className="conversation-pill">{session.provider}</span> : null}
                    {session.handoffStatus ? <span className="conversation-pill">{session.handoffStatus}</span> : null}
                    <span className="conversation-pill">{getA2AFlowStageLabel(session.flowStage)}</span>
                  </div>
                </div>
                <time>{new Date(session.lastMessageAt).toLocaleString()}</time>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
