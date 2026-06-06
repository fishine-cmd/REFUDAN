"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */
type SectionId = "profile" | "match" | "plaza" | "more";

type MentorSummary = {
  id: string;
  name: string;
  title: string;
  avatar: string | null;
  scores: [number, number, number, number];
  tags: string[];
  badges: string[];
  highlight: string;
  meta: string;
};

/* ═══════════════════════════════════════════════════════════════
   Static config
   ═══════════════════════════════════════════════════════════════ */
const navItems: { id: SectionId; title: string; description: string }[] = [
  { id: "profile", title: "个人档案", description: "实时查看与编辑 AI 自动提取的档案信息。" },
  { id: "match", title: "需求匹配", description: "调整核心诉求后自动匹配路径相似的 Agent。" },
  { id: "plaza", title: "Agent 广场", description: "发现并搜索公开 Agent，拓展对话对象。" },
  { id: "more", title: "更多功能", description: "预留功能扩展位，支持后续新增。" },
];

const generationSteps = [
  "正在解析你的简历...",
  "提取关键经历...",
  "构建你的数字分身...",
];

const privacyOptions = ["公开", "握手后可见", "仅本人确认后可见"] as const;

/* ═══════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════ */
function AgentWorkbenchInner() {
  const searchParams = useSearchParams();

  /* ── Role banner ── */
  const [me, setMe] = useState<{ role: "senior" | "junior" } | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const u = d?.user ?? d;
        if (u?.role) setMe({ role: u.role });
      })
      .catch(() => {
        // ignore; banner just won't render
      });
  }, []);

  /* ── Data ── */
  const [mentors, setMentors] = useState<MentorSummary[]>([]);

  /* ── Navigation ── */
  const [activeSection, setActiveSection] = useState<SectionId>("profile");
  const [activeMentorId, setActiveMentorId] = useState("");

  /* ── Profile form ── */
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [school, setSchool] = useState("");
  const [major, setMajor] = useState("");
  const [gpa, setGpa] = useState("");
  const [goal, setGoal] = useState("");
  const [promptText, setPromptText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);

  /* ── Platform accounts for Profile Extraction (Phase 1: GitHub real, others WIP) ── */
  const [xhsId, setXhsId] = useState("");
  const [githubUser, setGithubUser] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [zhihuId, setZhihuId] = useState("");
  const [builtProfile, setBuiltProfile] = useState<Record<string, unknown> | null>(null);

  /* ── Auth + server-side builtProfile (Phase 4) ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile/me", { credentials: "same-origin" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data?.builtProfile) setBuiltProfile(data.builtProfile);
      } catch {
        // network error; do nothing, user can still use the page in degraded state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [knowledgeItems, setKnowledgeItems] = useState([
    { id: "k1", title: "夏令营面试笔记.pdf", source: "本地上传", privacy: "公开" },
    { id: "k2", title: "实习复盘总结.md", source: "本地上传", privacy: "握手后可见" },
    { id: "k3", title: "AI 对话记录 - 科研讨论", source: "历史导入", privacy: "仅本人确认后可见" },
  ]);

  /* ── Load mentors (Plaza only; chat panel removed) ── */
  useEffect(() => {
    fetch("/api/mentors")
      .then((res) => res.json())
      .then((data) => {
        const list: MentorSummary[] = data.mentors ?? [];
        setMentors(list);

        // Pre-select mentor from query param (for Plaza highlight)
        const paramMentor = searchParams.get("mentor");
        if (paramMentor && list.find((m) => m.id === paramMentor)) {
          setActiveMentorId(paramMentor);
          setActiveSection("plaza");
        } else if (list.length > 0) {
          setActiveMentorId(list[0].id);
        }
      })
      .catch(() => {
        // ignore; plaza will just be empty
      });
  }, [searchParams]);

  /* ── Agent generation simulation ── */
  useEffect(() => {
    if (!isGenerating) return;
    setGenerationStep(0);
    const interval = window.setInterval(() => {
      setGenerationStep((prev) => Math.min(prev + 1, generationSteps.length - 1));
    }, 1000);
    const timeout = window.setTimeout(() => {
      setIsGenerating(false);
    }, 3000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [isGenerating]);

  /* ── Profile handlers ── */
  const handleResumeFile = (file: File | null) => {
    if (!file) return;
    setResumeFileName(file.name);
  };
  const handleResumeDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) handleResumeFile(file);
  };
  const validateProfile = () => {
    const nextErrors: string[] = [];
    if (!resumeFileName && resumeText.trim().length === 0)
      nextErrors.push("请上传简历文件或粘贴简历内容。");
    if (!school.trim()) nextErrors.push("请填写学校。");
    if (!major.trim()) nextErrors.push("请填写专业。");
    if (!gpa.trim()) nextErrors.push("请填写 GPA。");
    if (!goal.trim()) nextErrors.push("请选择核心目标。");
    setErrors(nextErrors);
    return nextErrors.length === 0;
  };
  const collectPlatformAccounts = (): string[] => {
    const accounts: string[] = [];
    if (xhsId.trim()) accounts.push(xhsId.trim());
    if (githubUser.trim()) accounts.push(`github:${githubUser.trim()}`);
    if (linkedinUrl.trim()) accounts.push(linkedinUrl.trim());
    if (zhihuId.trim()) accounts.push(zhihuId.trim());
    return accounts;
  };
  const handleGenerate = async () => {
    const accounts = collectPlatformAccounts();

    if (accounts.length === 0) {
      if (!validateProfile()) return;
      setIsGenerating(true);
      return;
    }

    setErrors([]);
    setIsGenerating(true);
    setBuiltProfile(null);

    try {
      const res = await fetch("/api/profile/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accounts,
          displayName: [school, major, goal].filter(Boolean).join(" ").trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.profile) {
        setBuiltProfile(data.profile);
        // Backend already persisted to current user's row via /api/profile/build.
        // No localStorage write needed in multi-user mode.
      } else {
        setErrors([data.error ?? `Profile build failed (HTTP ${res.status})`]);
      }
    } catch (err) {
      setErrors([`Network error: ${String(err)}`]);
    } finally {
      window.setTimeout(() => setIsGenerating(false), 800);
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════════ */
  return (
    <main className={activeSection === "profile" ? "workbench workbench--profile" : "workbench"}>
      <div
        style={{
          gridColumn: "1 / -1",
          padding: "0.4rem 0.75rem",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--border-default)",
          background: "rgba(148, 163, 184, 0.05)",
          textAlign: "center",
        }}
      >
        合规提示：本工作台中由 AI 助手生成的回复均为「AI 代为表达」，非学长学姐本人直接发言；所有学长资料来源于本人主动填写或本人授权抓取的公开社媒画像。
      </div>

      {/* ── Role banner (Phase 5.4) ── */}
      {me?.role === "senior" ? (
        <div
          style={{
            gridColumn: "1 / -1",
            background: "rgba(0,0,0,0.03)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "0.8rem 1rem",
            marginBottom: "1.5rem",
          }}
        >
          <strong style={{ color: "var(--accent)" }}>学长视角:</strong>
          你提取的画像会作为你 Agent 的 persona,在学弟向你提问时被注入到回答。
        </div>
      ) : me?.role === "junior" ? (
        <div
          style={{
            gridColumn: "1 / -1",
            background: "rgba(0,0,0,0.03)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "0.8rem 1rem",
            marginBottom: "1.5rem",
          }}
        >
          <strong style={{ color: "var(--accent)" }}>学弟视角:</strong>
          你提取的画像用于在 /me/junior 推荐更匹配的学长。
        </div>
      ) : null}

      {/* ── Nav ── */}
      <aside className="workbench-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={
              item.id === activeSection
                ? "workbench-nav__card is-active"
                : "workbench-nav__card"
            }
            type="button"
            onClick={() => setActiveSection(item.id)}
          >
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </button>
        ))}
      </aside>

      {/* ── Plaza ── */}
      {activeSection === "plaza" ? (
        <section className="workbench-plaza" aria-label="Agent plaza">
          <header className="workbench-plaza__header">
            <div>
              <h2>Agent 广场</h2>
              <p>精选学长学姐 · 基于路径相似度推荐</p>
            </div>
            <span className="workbench-chat__tag">PLAZA</span>
          </header>
          <div className="workbench-plaza__grid">
            {mentors.map((mentor) => (
              <article
                key={mentor.id}
                className={
                  mentor.id === activeMentorId ? "plaza-card is-active" : "plaza-card"
                }
                onClick={() => {
                  setActiveMentorId(mentor.id);
                  // Plaza click now navigates to public senior page for chat creation
                  window.location.href = `/seniors/${mentor.id}`;
                }}
              >
                <div className="plaza-card__media">
                  {mentor.avatar ? (
                    <img src={mentor.avatar} alt={mentor.name} />
                  ) : (
                    <div className="plaza-card__media-placeholder" />
                  )}
                  <div className="plaza-card__badges">
                    {mentor.badges.map((badge) => (
                      <span key={badge}>{badge}</span>
                    ))}
                  </div>
                </div>
                <div className="plaza-card__body">
                  <h3>{mentor.name}</h3>
                  <p className="plaza-card__title">{mentor.title}</p>
                  <div className="plaza-card__tags">
                    {mentor.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <p className="plaza-card__highlight">{mentor.highlight}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : activeSection === "profile" ? (
        /* ── Profile ── */
        <section className="workbench-chat workbench-profile">
          <header className="workbench-chat__profile">
            <div>
              <h2>个人档案与 Agent 创建</h2>
              <p>自动保存草稿 · 支持随时编辑</p>
            </div>
            <span className="workbench-chat__tag">PROFILE</span>
          </header>
          <div className="workbench-profile__content">
            <section className="profile-section">
              <h3>简历录入区</h3>
              <div className="profile-upload" onDragOver={(e) => e.preventDefault()} onDrop={handleResumeDrop}>
                <label className="profile-upload__button" htmlFor="resume-upload">PDF 文件上传</label>
                <input id="resume-upload" type="file" accept=".pdf" onChange={(e) => handleResumeFile(e.target.files?.[0] ?? null)} />
                <p>支持拖拽上传，或点击按钮选择文件</p>
              </div>
              {resumeFileName && (
                <div className="profile-file">
                  <span>{resumeFileName}</span>
                  <button type="button" onClick={() => setResumeFileName(null)}>删除</button>
                </div>
              )}
              <textarea className="profile-textarea" placeholder="或粘贴简历文本内容" value={resumeText} onChange={(e) => setResumeText(e.target.value)} />
            </section>
            <section className="profile-section">
              <h3>标准化信息确认</h3>
              <div className="profile-grid">
                <label className="profile-field">学校 <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="例如：复旦大学" /></label>
                <label className="profile-field">专业 <input value={major} onChange={(e) => setMajor(e.target.value)} placeholder="例如：计算机科学" /></label>
                <label className="profile-field">GPA <input value={gpa} onChange={(e) => setGpa(e.target.value)} placeholder="例如：3.7 / 4.0" /></label>
                <label className="profile-field">
                  核心目标
                  <select value={goal} onChange={(e) => setGoal(e.target.value)}>
                    <option value="">请选择</option>
                    <option value="summer">夏令营</option>
                    <option value="intern">实习</option>
                    <option value="apply">申请</option>
                  </select>
                </label>
              </div>
            </section>
            <section className="profile-section">
              <h3>社媒账号 · 画像提取</h3>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "-0.25rem", marginBottom: "0.75rem" }}>
                填任一字段即可触发 Profile Extraction 管线。GitHub 走公开 REST API，无需 Edge；其他平台需 Edge CDP 已启动。
              </p>
              <div className="profile-grid">
                <label className="profile-field">GitHub 用户名 <input value={githubUser} onChange={(e) => setGithubUser(e.target.value)} placeholder="例如：torvalds" /></label>
                <label className="profile-field">小红书 ID <input value={xhsId} onChange={(e) => setXhsId(e.target.value)} placeholder="纯数字 8-12 位" /></label>
                <label className="profile-field">LinkedIn URL <input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." /></label>
                <label className="profile-field">知乎 ID 或 URL <input value={zhihuId} onChange={(e) => setZhihuId(e.target.value)} placeholder="https://zhihu.com/people/..." /></label>
              </div>
            </section>
            <section className="profile-section">
              <h3>专属知识库构建</h3>
              <div className="profile-actions">
                <button type="button">本地资料上传</button>
                <button type="button">外部数据源接入</button>
                <button type="button">历史内容导入</button>
              </div>
              <div className="profile-knowledge">
                {knowledgeItems.map((item) => (
                  <div key={item.id} className="profile-knowledge__row">
                    <div><strong>{item.title}</strong><span>{item.source}</span></div>
                    <select value={item.privacy} onChange={(e) => setKnowledgeItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, privacy: e.target.value } : entry)))}>
                      {privacyOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
            <section className="profile-section">
              <h3>Agent 对话定位输入区</h3>
              <textarea className="profile-textarea profile-textarea--large" placeholder="你想让 Agent 帮你问什么？例如：帮我了解保研面试的重点..." value={promptText} onChange={(e) => setPromptText(e.target.value)} />
            </section>
            {builtProfile && (
              <section className="profile-section" style={{ background: "rgba(126, 205, 196, 0.05)", border: "1px solid var(--accent, #7ECDC4)", borderRadius: "8px", padding: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <h3 style={{ margin: 0 }}>✅ 画像提取结果（已持久化）</h3>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await fetch("/api/profile/me", {
                          method: "DELETE",
                          credentials: "same-origin",
                        });
                      } catch {
                        // network error; local UI still clears
                      }
                      setBuiltProfile(null);
                    }}
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem", borderRadius: "4px", border: "1px solid var(--border-default, #888)", background: "transparent", color: "inherit", cursor: "pointer" }}
                  >
                    清除画像
                  </button>
                </div>
                <pre style={{ maxHeight: "400px", overflow: "auto", fontSize: "0.75rem", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "rgba(0,0,0,0.3)", padding: "0.75rem", borderRadius: "4px", color: "var(--foreground, #fff)" }}>
                  {JSON.stringify(builtProfile, null, 2)}
                </pre>
              </section>
            )}
          </div>
          {errors.length > 0 && (
            <div className="profile-errors">{errors.map((err) => (<p key={err}>{err}</p>))}</div>
          )}
          <footer className="profile-footer">
            <button className="profile-submit" type="button" onClick={handleGenerate}>生成我的 Agent</button>
          </footer>
        </section>
      ) : (
        /* ── Match / More: chat panel removed; see /chat/[chatId] ── */
        <section
          className="workbench-chat"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}
        >
          <div>
            <h2 style={{ marginBottom: "0.75rem" }}>对话功能已迁移</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
              和学长学姐的对话现在统一在独立的对话页中进行。
            </p>
            <p style={{ fontSize: "0.85rem" }}>
              {me?.role === "junior" ? (
                <a href="/me/junior">前往我的主页查看推荐学长 →</a>
              ) : me?.role === "senior" ? (
                <a href="/me/senior">前往我的主页查看收件箱 →</a>
              ) : (
                <a href="/me">前往我的主页 →</a>
              )}
            </p>
          </div>
        </section>
      )}

      {/* ── Generation overlay ── */}
      {isGenerating && (
        <div className="generation-overlay" aria-live="polite">
          <div className="generation-overlay__panel">
            <span className="generation-overlay__dot" />
            <p>{generationSteps[generationStep]}</p>
          </div>
        </div>
      )}
    </main>
  );
}

export default function AgentWorkbenchPage() {
  return (
    <Suspense fallback={null}>
      <AgentWorkbenchInner />
    </Suspense>
  );
}
