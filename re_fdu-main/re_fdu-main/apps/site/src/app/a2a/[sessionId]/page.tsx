"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { getA2AFlowStageLabel } from "@/lib/a2a-session-view";
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

interface SessionTurn {
  id: string;
  speaker: "junior_agent" | "senior_agent" | "orchestrator" | "system";
  kind: string;
  content: string;
  privacyLevel: "public" | "handshake" | "owner_only";
  visibleTo?: "junior" | "senior" | "both";
  citations?: string[];
  traceRefs?: string[];
  source?: "manual" | "autoplay";
  slot?: string;
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
  referralPrepared?: boolean;
  connectionCompleted?: boolean;
  referralPreparedByName?: string;
  connectionCompletedByName?: string;
}

interface AutoplayState {
  enabled: boolean;
  status: "idle" | "running" | "completed" | "degraded";
  round: number;
  maxRounds: number;
  coveredSlots: string[];
  currentSlot?: string;
  done: boolean;
  lastError?: string;
}

interface Assessment {
  status: string;
  verdict: string;
  adjustedScore: number;
  summary: string;
  insights: string[];
  coveredSlots: string[];
}

interface SessionDetail {
  sessionId: string;
  summary: string;
  status: string;
  provider: string;
  privacyLevel: "public" | "handshake" | "owner_only";
  handoffStatus: "pending" | "approved" | "rejected";
  handoff: HandoffDetail;
  createdAt: number;
  lastMessageAt: number;
  junior: SessionParty | null;
  senior: SessionParty | null;
  originSurface?: string;
  autoplayState: AutoplayState;
  assessment: Assessment | null;
  turns: SessionTurn[];
  trace: TraceItem[];
}

const speakerLabels: Record<SessionTurn["speaker"], string> = {
  junior_agent: "学弟 Agent",
  senior_agent: "学长 Agent",
  orchestrator: "编排器",
  system: "系统轨迹",
};

const privacyLabels: Record<SessionTurn["privacyLevel"], string> = {
  public: "公开",
  handshake: "握手后可见",
  owner_only: "仅本人确认后可见",
};

function verdictLabel(verdict?: string) {
  switch (verdict) {
    case "strong_match":
      return "值得继续引荐";
    case "promising":
      return "有潜力";
    case "not_now":
      return "暂不建议直推";
    case "needs_clarification":
      return "仍需补充信息";
    default:
      return "待评估";
  }
}

function getReferralStageLabel(session: SessionDetail) {
  if (session.handoffStatus === "rejected") return getA2AFlowStageLabel("rejected");
  if (session.handoffStatus !== "approved") return "P3 进行中";
  if (session.handoff.connectionCompleted) return "P4 已完成";
  if (session.handoff.referralPrepared) return "P4 已准备";
  return "P4 待准备";
}

export default function A2ASessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const [viewer, setViewer] = useState<ViewerUser | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [question, setQuestion] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function loadAll() {
    const [meRes, sessionRes] = await Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch(`/api/a2a/sessions/${sessionId}`).then((r) => r.json()),
    ]);
    const user = meRes?.user ?? meRes;
    setViewer(user ? { id: user.id, displayName: user.displayName, role: user.role } : null);
    setSession(sessionRes?.sessionId ? sessionRes : null);
    setNote(sessionRes?.handoff?.note ?? "");
  }

  useEffect(() => {
    loadAll();
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.turns.length]);

  const isJunior = viewer?.role === "junior";
  const cameFromCreated = searchParams.get("from") === "created";

  const visibleTurns = useMemo(() => {
    if (!session || !viewer) return [];
    return session.turns.filter((turn) => {
      if (!turn.visibleTo || turn.visibleTo === "both") return true;
      if (turn.visibleTo === "junior") return viewer.role === "junior";
      if (turn.visibleTo === "senior") return viewer.role === "senior";
      return true;
    });
  }, [session, viewer]);

  async function sendFollowUp() {
    if (!question.trim() || !session || !isJunior) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/a2a/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data?.error ?? "发送失败");
        return;
      }
      setQuestion("");
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function decideHandoff(status: "approved" | "rejected") {
    if (!session || isJunior) return;
    setHandoffBusy(true);
    try {
      const response = await fetch(`/api/a2a/sessions/${sessionId}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data?.error ?? "提交失败");
        return;
      }
      await loadAll();
    } finally {
      setHandoffBusy(false);
    }
  }

  if (!session || !viewer) {
    return (
      <main className="chat-room-shell">
        <p>正在加载 {surfaceNames.sessionCenter}...</p>
      </main>
    );
  }

  const peer = isJunior ? session.senior : session.junior;

  return (
    <main className="chat-room-shell a2a-shell">
      <section className="chat-room-hero">
        <div>
          <p className="dashboard-eyebrow">P3 / {surfaceNames.sessionCenter}</p>
          <h1>{peer?.displayName ?? "当前会话对象"}</h1>
          <p className="dashboard-summary">
            这里保留完整 A2A 轨迹。你可以区分第一条人工发起消息与后续自动多轮追问，也可以直接看到本轮已确认的关键槽位和当前评估。
          </p>
        </div>
        <div className="chat-room-hero__meta">
          <span className="conversation-pill">{session.status}</span>
          <span className="conversation-pill">{session.provider}</span>
          <span className="conversation-pill">{getReferralStageLabel(session)}</span>
        </div>
      </section>

      {cameFromCreated ? (
        <section className="dashboard-banner dashboard-banner--success">
          A2A 会话已经创建完成，并从需求匹配页自动进入了多轮预沟通。
        </section>
      ) : null}

      <section className="a2a-stage">
        <aside className="a2a-panel">
          <div className="chat-room-side__card">
            <p className="dashboard-kicker">会话概览</p>
            <h2>{session.summary || "等待系统生成会话摘要"}</h2>
            <p>可见范围：{privacyLabels[session.privacyLevel]}</p>
            <p>来源入口：{session.originSurface || "legacy"}</p>
            <p>最近更新：{new Date(session.lastMessageAt).toLocaleString()}</p>
          </div>

          <div className="chat-room-side__card">
            <p className="dashboard-kicker">A2A 自动编排</p>
            <h2>{session.autoplayState.enabled ? "已启用" : "未启用"}</h2>
            <p>状态：{session.autoplayState.status}</p>
            <p>
              轮次：{session.autoplayState.round}/{session.autoplayState.maxRounds || 0}
            </p>
            {session.autoplayState.currentSlot ? <p>当前探测：{session.autoplayState.currentSlot}</p> : null}
            {session.autoplayState.lastError ? <p>降级原因：{session.autoplayState.lastError}</p> : null}
          </div>

          <div className="chat-room-side__card">
            <p className="dashboard-kicker">已确认槽位</p>
            {session.autoplayState.coveredSlots.length === 0 ? (
              <p>还没有完成关键槽位确认。</p>
            ) : (
              <div className="dashboard-token-row">
                {session.autoplayState.coveredSlots.map((slot) => (
                  <span key={slot} className="conversation-pill">
                    {slot}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="chat-room-side__card">
            <p className="dashboard-kicker">当前评估</p>
            <h2>{verdictLabel(session.assessment?.verdict)}</h2>
            <p>{session.assessment?.summary || "等待评估生成"}</p>
            {session.assessment ? <p>回流评分：{session.assessment.adjustedScore}</p> : null}
          </div>
        </aside>

        <div className="chat-room-stream a2a-stream" ref={scrollRef}>
          {visibleTurns.map((turn) => (
            <article key={turn.id} className={`a2a-turn a2a-turn--${turn.speaker.replace("_", "-")}`}>
              <div className="a2a-turn__meta">
                <span>{speakerLabels[turn.speaker]}</span>
                <span>{turn.kind}</span>
                <span>{privacyLabels[turn.privacyLevel]}</span>
                {turn.source ? <span>{turn.source === "manual" ? "manual" : "autoplay"}</span> : null}
                {turn.slot ? <span>{turn.slot}</span> : null}
              </div>
              <p>{turn.content}</p>
              {turn.citations?.length ? (
                <div className="dashboard-token-row">
                  {turn.citations.map((cite) => (
                    <span key={cite} className="dashboard-token">
                      {cite}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <aside className="a2a-panel">
          <div className="chat-room-side__card">
            <p className="dashboard-kicker">评估洞察</p>
            {session.assessment?.insights?.length ? (
              <div className="conversation-list">
                {session.assessment.insights.map((item) => (
                  <div key={item} className="conversation-row">
                    <div>
                      <strong>Insight</strong>
                      <p>{item}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>当前还没有结构化洞察。</p>
            )}
          </div>

          <div className="chat-room-side__card">
            <p className="dashboard-kicker">轨迹记录</p>
            <div className="conversation-list">
              {session.trace.map((item) => (
                <div key={item.id} className="conversation-row">
                  <div>
                    <strong>{item.stage}</strong>
                    <p>{item.payload}</p>
                  </div>
                  <time>{new Date(item.ts).toLocaleTimeString()}</time>
                </div>
              ))}
            </div>
          </div>

          <div className="chat-room-side__card">
            <p className="dashboard-kicker">人工接力</p>
            <h2>{getReferralStageLabel(session)}</h2>
            <p>{session.handoff?.brief || "等待 handoff 摘要"}</p>
            {session.handoffStatus === "approved" ? (
              <Link className="dashboard-primary dashboard-primary--compact" href={`/a2a/${session.sessionId}/referral`}>
                打开{surfaceNames.referralBrief}
              </Link>
            ) : null}

            {isJunior ? (
              <p>当前正在等待 senior 判断是否进入下一阶段的人际连接。</p>
            ) : (
              <>
                <textarea
                  className="question-panel__textarea"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="给学弟或系统留下 handoff 说明"
                />
                <div className="dashboard-actions">
                  <button
                    className="dashboard-primary dashboard-primary--compact"
                    disabled={handoffBusy}
                    onClick={() => decideHandoff("approved")}
                  >
                    {handoffBusy ? "处理中..." : "批准进入 P4"}
                  </button>
                  <button
                    className="dashboard-secondary dashboard-secondary--compact"
                    disabled={handoffBusy}
                    onClick={() => decideHandoff("rejected")}
                  >
                    拒绝并继续 A2A
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
      </section>

      {isJunior ? (
        <section className="chat-room-composer">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendFollowUp();
              }
            }}
            placeholder="继续向这位学长的 Agent 追问一个更具体的问题"
          />
          <button className="dashboard-primary" disabled={busy || !question.trim()} onClick={sendFollowUp}>
            {busy ? "发送中..." : "继续 A2A"}
          </button>
        </section>
      ) : null}
    </main>
  );
}
