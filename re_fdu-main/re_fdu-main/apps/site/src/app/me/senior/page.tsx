"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getA2AFlowStageLabel } from "@/lib/a2a-session-view";
import { surfaceNames } from "@/lib/product-language";

interface PublicJunior {
  id: string;
  displayName: string;
  avatar?: string | null;
}

interface InboxItem {
  chatId: string;
  createdAt: number;
  lastMessageAt: number;
  summary: string;
  entryHref: string;
  flowStage: "pending" | "rejected" | "p4-ready" | "p4-prepared" | "p4-completed";
  status?: string;
  provider?: string;
  privacyLevel?: string;
  handoffStatus?: string;
  referralPrepared?: boolean;
  connectionCompleted?: boolean;
  unread: boolean;
  junior: PublicJunior | null;
}

interface Persona {
  background: string;
  expertise: string;
}

type StageFilter = "all" | "pending" | "rejected" | "p4-ready" | "p4-prepared" | "p4-completed";

export default function SeniorHome() {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [me, setMe] = useState<{ displayName: string; persona: Persona | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/a2a/senior-inbox").then((r) => r.json()),
    ])
      .then(([meRes, inboxRes]) => {
        const user = meRes?.user ?? meRes;
        setMe({
          displayName: user?.displayName ?? "",
          persona: user?.persona ?? null,
        });
        setInbox(inboxRes?.inbox ?? []);
        setUnreadCount(inboxRes?.unreadCount ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stageStats = useMemo(() => {
    const stats: Record<StageFilter, number> = {
      all: inbox.length,
      pending: 0,
      rejected: 0,
      "p4-ready": 0,
      "p4-prepared": 0,
      "p4-completed": 0,
    };

    inbox.forEach((item) => {
      stats[item.flowStage] += 1;
    });

    return stats;
  }, [inbox]);

  const filteredInbox = useMemo(() => {
    if (stageFilter === "all") return inbox;
    return inbox.filter((item) => item.flowStage === stageFilter);
  }, [inbox, stageFilter]);

  const groupedInbox = useMemo(
    () =>
      ([
        { key: "pending", label: getA2AFlowStageLabel("pending"), items: [] as InboxItem[] },
        { key: "rejected", label: getA2AFlowStageLabel("rejected"), items: [] as InboxItem[] },
        { key: "p4-ready", label: getA2AFlowStageLabel("p4-ready"), items: [] as InboxItem[] },
        { key: "p4-prepared", label: getA2AFlowStageLabel("p4-prepared"), items: [] as InboxItem[] },
        { key: "p4-completed", label: getA2AFlowStageLabel("p4-completed"), items: [] as InboxItem[] },
      ] as Array<{ key: Exclude<StageFilter, "all">; label: string; items: InboxItem[] }>),
    [],
  );

  const inboxGroups = useMemo(() => {
    const groups = groupedInbox.map((group) => ({ ...group, items: [] as InboxItem[] }));

    inbox.forEach((item) => {
      const group = groups.find((entry) => entry.key === item.flowStage);
      if (group) group.items.push(item);
    });

    return groups.filter((group) => group.items.length > 0);
  }, [groupedInbox, inbox]);

  if (loading) {
    return (
      <main className="dashboard-shell">
        <p>正在加载 senior 工作台...</p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <p className="dashboard-eyebrow">{surfaceNames.inbox}</p>
          <h1>
            {me?.displayName
              ? `${me.displayName}，你的经验正在先替你接住第一轮问题。`
              : "你的经验正在先替你接住第一轮问题。"}
          </h1>
          <p className="dashboard-summary">
            Agent 会先完成第一轮预沟通，你只需要在值得接力的时候进入。
            这个页面现在更像一个专业收件台和协作台，帮助你按阶段处理人工接力与连接任务。
          </p>
          <div className="dashboard-actions">
            <Link className="dashboard-primary" href="/agent-workbench">
              更新我的 Agent 档案
            </Link>
            <Link className="dashboard-secondary" href="/me/senior">
              刷新当前视图
            </Link>
          </div>
        </div>

        <div className="dashboard-hero__meta">
          <div className="dashboard-stat-card">
            <span>收件会话</span>
            <strong>{inbox.length}</strong>
          </div>
          <div className="dashboard-stat-card">
            <span>未读</span>
            <strong>{unreadCount}</strong>
          </div>
          <div className="dashboard-stat-card">
            <span>档案状态</span>
            <strong>{me?.persona ? "已就绪" : "待完善"}</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid--two">
        <div className="dashboard-section dashboard-section--stretch">
          <div className="dashboard-section__head">
            <div>
              <p className="dashboard-kicker">收件视图</p>
              <h2>{surfaceNames.inbox}</h2>
            </div>
          </div>

          <div className="dashboard-filter-row">
            {(
              [
                ["all", "全部会话"],
                ["pending", getA2AFlowStageLabel("pending")],
                ["rejected", getA2AFlowStageLabel("rejected")],
                ["p4-ready", getA2AFlowStageLabel("p4-ready")],
                ["p4-prepared", getA2AFlowStageLabel("p4-prepared")],
                ["p4-completed", getA2AFlowStageLabel("p4-completed")],
              ] as Array<[StageFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={stageFilter === value ? "question-chip is-active" : "question-chip"}
                onClick={() => setStageFilter(value)}
              >
                {label}
                <span className="dashboard-filter-row__count">{stageStats[value]}</span>
              </button>
            ))}
          </div>

          {inbox.length === 0 ? (
            <p className="dashboard-empty">
              还没有学弟进入你的收件台。可以先去 <Link href="/agent-workbench">{surfaceNames.workspace}</Link> 完善 Agent 档案。
            </p>
          ) : stageFilter === "all" ? (
            <div className="dashboard-stack">
              {inboxGroups.map((group) => (
                <section key={group.key} className="dashboard-group">
                  <div className="dashboard-group__head">
                    <h3>{group.label}</h3>
                    <span>{group.items.length}</span>
                  </div>
                  <div className="conversation-list">
                    {group.items.map((item) => (
                      <Link
                        key={item.chatId}
                        href={item.entryHref}
                        className={item.unread ? "conversation-row is-unread" : "conversation-row"}
                      >
                        <div>
                          <strong>{item.junior?.displayName ?? "匿名学弟"}</strong>
                          <p>{item.summary || "等待系统生成会话摘要"}</p>
                          <div className="dashboard-token-row">
                            {item.status ? <span className="conversation-pill">{item.status}</span> : null}
                            {item.provider ? <span className="conversation-pill">{item.provider}</span> : null}
                            {item.handoffStatus ? (
                              <span className="conversation-pill">{item.handoffStatus}</span>
                            ) : null}
                            <span className="conversation-pill">{getA2AFlowStageLabel(item.flowStage)}</span>
                          </div>
                        </div>
                        <div className="conversation-row__meta">
                          {item.unread ? <span className="conversation-pill">未读</span> : null}
                          <time>{new Date(item.lastMessageAt).toLocaleString()}</time>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : filteredInbox.length === 0 ? (
            <p className="dashboard-empty">当前筛选下还没有会话。</p>
          ) : (
            <div className="conversation-list">
              {filteredInbox.map((item) => (
                <Link
                  key={item.chatId}
                  href={item.entryHref}
                  className={item.unread ? "conversation-row is-unread" : "conversation-row"}
                >
                  <div>
                    <strong>{item.junior?.displayName ?? "匿名学弟"}</strong>
                    <p>{item.summary || "等待系统生成会话摘要"}</p>
                    <div className="dashboard-token-row">
                      {item.status ? <span className="conversation-pill">{item.status}</span> : null}
                      {item.provider ? <span className="conversation-pill">{item.provider}</span> : null}
                      {item.handoffStatus ? <span className="conversation-pill">{item.handoffStatus}</span> : null}
                      <span className="conversation-pill">{getA2AFlowStageLabel(item.flowStage)}</span>
                    </div>
                  </div>
                  <div className="conversation-row__meta">
                    {item.unread ? <span className="conversation-pill">未读</span> : null}
                    <time>{new Date(item.lastMessageAt).toLocaleString()}</time>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__head">
            <div>
              <p className="dashboard-kicker">档案预览</p>
              <h2>我的 Agent 档案</h2>
            </div>
          </div>
          {me?.persona ? (
            <div className="dashboard-card dashboard-card--stacked">
              <div className="dashboard-card__block">
                <span>背景</span>
                <p>{me.persona.background}</p>
              </div>
              <div className="dashboard-card__block">
                <span>专长</span>
                <p>{me.persona.expertise}</p>
              </div>
              <Link className="dashboard-primary dashboard-primary--compact" href="/agent-workbench">
                更新我的资料
              </Link>
            </div>
          ) : (
            <p className="dashboard-empty">
              还没有生成 Agent 档案。前往 <Link href="/agent-workbench">{surfaceNames.workspace}</Link> 完成配置。
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
