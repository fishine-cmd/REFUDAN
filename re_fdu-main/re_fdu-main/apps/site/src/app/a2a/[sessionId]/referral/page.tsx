"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusStrip } from "@/components/status-strip";
import { surfaceNames } from "@/lib/product-language";

interface ViewerUser {
  id: string;
  displayName: string;
  role: "junior" | "senior";
}

interface SessionParty {
  id: string;
  displayName: string;
  role: "junior" | "senior";
  title?: string | null;
}

interface TraceItem {
  id: string;
  stage: string;
  actor: string;
  payload: string;
  ts: number;
}

interface HandoffDetail {
  status: "pending" | "approved" | "rejected";
  updatedAt: number;
  note: string;
  brief: string;
  referralPrepared: boolean;
  referralPreparedAt: number;
  referralPreparedBy: string;
  referralPreparedByName?: string;
  connectionCompleted: boolean;
  connectionCompletedAt: number;
  connectionCompletedBy: string;
  connectionCompletedByName?: string;
}

interface SessionTurn {
  id: string;
  speaker: "junior_agent" | "senior_agent" | "orchestrator" | "system";
  kind: string;
  content: string;
  citations?: string[];
}

interface SessionDetail {
  sessionId: string;
  summary: string;
  status: string;
  provider: string;
  handoffStatus: "pending" | "approved" | "rejected";
  handoff: HandoffDetail | null;
  createdAt: number;
  lastMessageAt: number;
  junior: SessionParty | null;
  senior: SessionParty | null;
  turns: SessionTurn[];
  trace: TraceItem[];
}

function formatDateTime(value?: number) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString();
}

export default function ReferralPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [viewer, setViewer] = useState<ViewerUser | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const [meRes, sessionRes] = await Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch(`/api/a2a/sessions/${sessionId}`).then((r) => r.json()),
    ]);
    const user = meRes?.user ?? meRes;
    setViewer(user ? { id: user.id, displayName: user.displayName, role: user.role } : null);
    setSession(sessionRes?.sessionId ? sessionRes : null);
  }

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, [sessionId]);

  const citedTurns = useMemo(() => {
    if (!session) return [];
    return session.turns.filter((turn) => (turn.citations?.length ?? 0) > 0).slice(-3);
  }, [session]);

  const latestTrace = useMemo(() => {
    if (!session) return [];
    return [...session.trace].slice(-3).reverse();
  }, [session]);

  async function updateReferral(body: { prepared?: boolean; completed?: boolean }) {
    if (!session || !session.handoff || session.handoffStatus !== "approved") return;
    setBusy(true);
    try {
      const response = await fetch(`/api/a2a/sessions/${session.sessionId}/referral`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data?.error ?? "更新失败");
        return;
      }
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="dashboard-shell">
        <p>正在加载{surfaceNames.referralBrief}...</p>
      </main>
    );
  }

  if (!session || !session.handoff) {
    return (
      <main className="dashboard-shell">
        <section className="dashboard-section">
          <p>没有找到这条会话。</p>
        </section>
      </main>
    );
  }

  const handoff = session.handoff;
  const canOperate = session.handoffStatus === "approved" && viewer?.role === "senior";
  const stageLabel = handoff.connectionCompleted
    ? "Completed"
    : handoff.referralPrepared
      ? "Prepared"
      : "Ready";
  const preparedBy = handoff.referralPreparedByName || session.senior?.displayName || "当前 senior";
  const completedBy =
    handoff.connectionCompletedByName || session.senior?.displayName || "当前 senior";

  return (
    <main className="dashboard-shell">
      <section className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <p className="dashboard-eyebrow">P4 / {surfaceNames.referralBrief}</p>
          <h1>进入下一阶段前的人际连接简报</h1>
          <p className="dashboard-summary">
            这里承接 P3 已批准的 handoff，用一页把会话背景、接力说明、证据片段和连接状态整理清楚。
            senior 可以在这里确认“准备完成”和“连接完成”，让后续协作有明确节点。
          </p>
          <div className="dashboard-actions">
            <Link className="dashboard-secondary" href={`/a2a/${session.sessionId}`}>
              返回{surfaceNames.sessionCenter}
            </Link>
            {canOperate ? (
              <>
                <button
                  type="button"
                  className="dashboard-primary dashboard-primary--compact"
                  disabled={busy}
                  onClick={() =>
                    updateReferral({
                      prepared: !handoff.referralPrepared,
                      completed: false,
                    })
                  }
                >
                  {busy
                    ? "处理中..."
                    : handoff.referralPrepared
                      ? "撤销准备完成"
                      : "标记为准备完成"}
                </button>
                {handoff.referralPrepared ? (
                  <button
                    type="button"
                    className="dashboard-secondary dashboard-secondary--compact"
                    disabled={busy}
                    onClick={() => updateReferral({ completed: !handoff.connectionCompleted })}
                  >
                    {handoff.connectionCompleted ? "撤销连接完成" : "标记为连接完成"}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="dashboard-hero__meta">
          <div className="dashboard-stat-card">
            <span>接力状态</span>
            <strong>{session.handoffStatus}</strong>
          </div>
          <div className="dashboard-stat-card">
            <span>连接阶段</span>
            <strong>{stageLabel === "Completed" ? "已完成" : stageLabel === "Prepared" ? "已准备" : "待准备"}</strong>
          </div>
          <div className="dashboard-stat-card">
            <span>最近更新</span>
            <strong>{new Date(session.lastMessageAt).toLocaleDateString()}</strong>
          </div>
        </div>
      </section>

      {session.handoffStatus !== "approved" ? (
        <StatusStrip message="当前会话还没有进入“已批准的人际连接”状态。请先回到 P3 完成 handoff 决策。" />
      ) : handoff.connectionCompleted ? (
        <StatusStrip
          tone="success"
          message={`当前连接流程已标记为完成。${handoff.connectionCompletedAt ? ` 完成时间：${formatDateTime(handoff.connectionCompletedAt)}。` : ""}`}
        />
      ) : handoff.referralPrepared ? (
        <StatusStrip
          tone="success"
          message={`这份连接简报已经准备完成，可以作为真实接力前的标准底稿。${handoff.referralPreparedAt ? ` 标记时间：${formatDateTime(handoff.referralPreparedAt)}。` : ""}`}
        />
      ) : (
        <StatusStrip tone="success" message="当前 handoff 已获批准。这份摘要现在可以直接进入人工连接准备阶段。" />
      )}

      <section className="dashboard-grid dashboard-grid--two">
        <article className="dashboard-section dashboard-section--stretch">
          <div className="dashboard-section__head">
            <div>
              <p className="dashboard-kicker">Referral brief</p>
              <h2>连接摘要</h2>
            </div>
          </div>
          <div className="dashboard-card dashboard-card--stacked">
            <div className="dashboard-card__block">
              <span>Participants</span>
              <p>
                {session.junior?.displayName ?? "Junior"} → {session.senior?.displayName ?? "Senior"}
              </p>
            </div>
            <div className="dashboard-card__block">
              <span>Session summary</span>
              <p>{session.summary || "暂无会话摘要"}</p>
            </div>
            <div className="dashboard-card__block">
              <span>Handoff brief</span>
              <p>{handoff.brief || "暂无接力摘要"}</p>
            </div>
            {handoff.note ? (
              <div className="dashboard-card__block">
                <span>Senior note</span>
                <p>{handoff.note}</p>
              </div>
            ) : null}
          </div>
        </article>

        <article className="dashboard-section">
          <div className="dashboard-section__head">
            <div>
              <p className="dashboard-kicker">Progress state</p>
              <h2>阶段状态</h2>
            </div>
          </div>
          <div className="dashboard-card dashboard-card--stacked">
            <div className="dashboard-card__block">
              <span>Prepared</span>
              <p>
                {handoff.referralPrepared
                  ? `已准备完成，处理人：${preparedBy}，时间：${formatDateTime(handoff.referralPreparedAt)}`
                  : "尚未完成连接准备"}
              </p>
            </div>
            <div className="dashboard-card__block">
              <span>Completed</span>
              <p>
                {handoff.connectionCompleted
                  ? `已完成连接，处理人：${completedBy}，时间：${formatDateTime(handoff.connectionCompletedAt)}`
                  : "尚未完成真实连接"}
              </p>
            </div>
            <div className="dashboard-card__block">
              <span>Owner boundary</span>
              <p>当前只有 senior 侧可以推进 P4 的“准备完成”和“连接完成”状态。</p>
            </div>
            <div className="dashboard-card__block">
              <span>Suggested next step</span>
              <p>
                {handoff.connectionCompleted
                  ? "本次连接已闭环，可以回到 P3 或首页继续查看后续追踪。"
                  : handoff.referralPrepared
                    ? "简报已经准备好，接下来建议尽快完成真实连接并更新状态。"
                    : "建议 senior 先核对摘要、补充 note，再标记为准备完成。"}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid--two">
        <article className="dashboard-section dashboard-section--stretch">
          <div className="dashboard-section__head">
            <div>
              <p className="dashboard-kicker">Decision trace</p>
              <h2>关键节点</h2>
            </div>
          </div>
          <div className="conversation-list">
            {latestTrace.map((item) => (
              <div key={item.id} className="conversation-row">
                <div>
                  <strong>{item.stage}</strong>
                  <p>{item.payload}</p>
                </div>
                <time>{new Date(item.ts).toLocaleString()}</time>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-section">
          <div className="dashboard-section__head">
            <div>
              <p className="dashboard-kicker">Evidence snippets</p>
              <h2>证据片段</h2>
            </div>
          </div>
          {citedTurns.length === 0 ? (
            <p className="dashboard-empty">当前会话还没有可展示的证据片段。</p>
          ) : (
            <div className="conversation-list">
              {citedTurns.map((turn) => (
                <div key={turn.id} className="conversation-row">
                  <div>
                    <strong>{turn.kind}</strong>
                    <p>{turn.content}</p>
                    <div className="dashboard-token-row">
                      {(turn.citations ?? []).map((cite) => (
                        <span key={cite} className="conversation-pill">
                          {cite}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
