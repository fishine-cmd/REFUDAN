"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type MentorStatus = {
  mentorId: string;
  name: string;
  consent_status: "granted" | "pending" | "revoked";
  secondme_linked: boolean;
  secondme_user_id: string | null;
  granted_at: string | null;
};

type StatusResponse = {
  secondme_configured: boolean;
  mentors: MentorStatus[];
};

function CallbackBanner() {
  const params = useSearchParams();
  const status = params.get("status");
  const mentor = params.get("mentor");
  const user = params.get("user");
  const reason = params.get("reason");

  if (!status) return null;

  if (status === "success") {
    return (
      <div className="onboard-banner onboard-banner--ok">
        ✅ 已绑定：mentor <strong>{mentor}</strong> 与 SecondMe 账号{" "}
        <strong>{user}</strong>。该 mentor 的对话将通过其本人授权的 SecondMe 分身进行。
      </div>
    );
  }
  if (status === "denied") {
    return (
      <div className="onboard-banner onboard-banner--warn">
        ⚠️ 学长本人在 SecondMe 授权页拒绝了授权（{reason ?? "user_denied"}）。无授权将无法启用 SecondMe 对话。
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="onboard-banner onboard-banner--err">
        ❌ 授权回调失败：{reason ?? "unknown error"}。请检查 Client ID/Secret/redirect URI 是否一致。
      </div>
    );
  }
  return null;
}

function MentorOnboardInner() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMentor, setBusyMentor] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/auth/secondme/status", { cache: "no-store" });
      const json = (await res.json()) as StatusResponse;
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleRevoke(mentorId: string) {
    setBusyMentor(mentorId);
    try {
      await fetch("/api/auth/secondme/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentorId }),
      });
      await refresh();
    } finally {
      setBusyMentor(null);
    }
  }

  return (
    <main className="minimal-shell">
      <section className="minimal-hero">
        <p className="minimal-eyebrow">MENTOR ONBOARD · SecondMe</p>
        <h1>学长学姐授权管理</h1>
        <p className="minimal-sub">
          学长学姐本人通过 SecondMe 平台完成数字分身训练后，在此页面授权 RE:FUDAN 调用其分身能力。授权可随时撤销。
        </p>
      </section>

      <CallbackBanner />

      {!data?.secondme_configured && !loading && (
        <div className="onboard-banner onboard-banner--warn">
          ⚠️ SecondMe 未配置。请在 <code>apps/site/.env.local</code> 设置 SECONDME_CLIENT_ID 与 SECONDME_CLIENT_SECRET 后重启服务。
        </div>
      )}

      {loading ? (
        <p className="onboard-loading">正在加载授权状态…</p>
      ) : (
        <section className="onboard-grid">
          {(data?.mentors ?? []).map((m) => {
            const linked = m.secondme_linked;
            const grantedDate = m.granted_at
              ? new Date(m.granted_at).toLocaleString("zh-CN")
              : null;
            return (
              <article key={m.mentorId} className="onboard-card">
                <header className="onboard-card__head">
                  <div>
                    <p className="onboard-card__name">{m.name}</p>
                    <p className="onboard-card__id">
                      <code>{m.mentorId}</code>
                    </p>
                  </div>
                  <span
                    className={`onboard-pill ${
                      linked
                        ? "onboard-pill--ok"
                        : m.consent_status === "granted"
                          ? "onboard-pill--pending"
                          : "onboard-pill--off"
                    }`}
                  >
                    {linked
                      ? "SecondMe 已接入"
                      : m.consent_status === "granted"
                        ? "本人已同意 · 待 SecondMe 绑定"
                        : `授权: ${m.consent_status}`}
                  </span>
                </header>

                {linked && (
                  <dl className="onboard-card__meta">
                    <div>
                      <dt>SecondMe userId</dt>
                      <dd>
                        <code>{m.secondme_user_id}</code>
                      </dd>
                    </div>
                    {grantedDate && (
                      <div>
                        <dt>绑定时间</dt>
                        <dd>{grantedDate}</dd>
                      </div>
                    )}
                  </dl>
                )}

                <div className="onboard-card__actions">
                  {!linked ? (
                    <a
                      className="minimal-primary"
                      href={`/api/auth/secondme/authorize?mentor=${encodeURIComponent(m.mentorId)}`}
                    >
                      开始 SecondMe 授权
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="minimal-secondary"
                      onClick={() => handleRevoke(m.mentorId)}
                      disabled={busyMentor === m.mentorId}
                    >
                      {busyMentor === m.mentorId ? "撤销中…" : "撤销授权"}
                    </button>
                  )}
                  <a className="minimal-secondary" href={`/agent-workbench?mentor=${m.mentorId}`}>
                    去对话页
                  </a>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="onboard-notice">
        <h3>合规说明</h3>
        <ul>
          <li>所有学长学姐的资料来源均为本人主动填写或本人 SecondMe 分身授权调用；不进行任何形式的第三方信息爬取。</li>
          <li>授权可随时撤销，本地存储的 access token 将立即清除。</li>
          <li>由 SecondMe 分身生成的回复均标注「AI 助手代为表达，非本人直接发言」。</li>
        </ul>
      </section>

      <style>{`
        .onboard-banner {
          margin: 1.5rem 0;
          padding: 1rem 1.25rem;
          border-radius: 12px;
          border: 1px solid var(--border-default);
          font-size: 0.9rem;
        }
        .onboard-banner--ok { background: rgba(34, 197, 94, 0.08); border-color: rgba(34, 197, 94, 0.4); }
        .onboard-banner--warn { background: rgba(234, 179, 8, 0.08); border-color: rgba(234, 179, 8, 0.4); }
        .onboard-banner--err { background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.4); }
        .onboard-banner code { background: rgba(255,255,255,0.06); padding: 0 0.3rem; border-radius: 4px; }
        .onboard-loading { padding: 3rem 0; text-align: center; color: var(--text-muted); }
        .onboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.25rem;
          margin: 2rem 0 3rem;
        }
        .onboard-card {
          border: 1px solid var(--border-default);
          border-radius: 14px;
          padding: 1.25rem;
          background: var(--surface);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .onboard-card__head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .onboard-card__name { font-weight: 600; font-size: 1.05rem; }
        .onboard-card__id { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem; }
        .onboard-pill {
          font-size: 0.7rem;
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          border: 1px solid var(--border-default);
          white-space: nowrap;
        }
        .onboard-pill--ok { background: rgba(34, 197, 94, 0.12); border-color: rgba(34, 197, 94, 0.4); color: rgb(74, 222, 128); }
        .onboard-pill--pending { background: rgba(234, 179, 8, 0.12); border-color: rgba(234, 179, 8, 0.4); color: rgb(234, 179, 8); }
        .onboard-pill--off { background: rgba(148, 163, 184, 0.12); color: var(--text-muted); }
        .onboard-card__meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem 1rem;
          font-size: 0.8rem;
          margin: 0;
        }
        .onboard-card__meta dt { color: var(--text-muted); font-size: 0.7rem; }
        .onboard-card__meta dd { margin: 0; font-family: ui-monospace, monospace; }
        .onboard-card__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .onboard-card__actions .minimal-primary,
        .onboard-card__actions .minimal-secondary {
          font-size: 0.8rem;
          padding: 0.5rem 0.9rem;
        }
        .onboard-notice {
          border-top: 1px solid var(--border-default);
          padding-top: 1.5rem;
          color: var(--text-muted);
          font-size: 0.85rem;
        }
        .onboard-notice h3 { color: var(--text-body); margin-bottom: 0.5rem; }
        .onboard-notice li { margin: 0.4rem 0; }
      `}</style>
    </main>
  );
}

export default function MentorOnboardPage() {
  return (
    <Suspense fallback={<p className="onboard-loading">加载中…</p>}>
      <MentorOnboardInner />
    </Suspense>
  );
}
