"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */
type SectionId = "profile" | "match" | "plaza" | "more";

type Contact = {
  id: string;
  name: string;
  meta: string;
  isUserAgent?: boolean;
};

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

type Message = { id: string; sender: "agent" | "user"; content: string };

/* ═══════════════════════════════════════════════════════════════
   Static config
   ═══════════════════════════════════════════════════════════════ */
const navItems: { id: SectionId; title: string; description: string }[] = [
  { id: "profile", title: "个人档案", description: "实时查看与编辑 AI 自动提取的档案信息。" },
  { id: "match", title: "需求匹配", description: "调整核心诉求后自动匹配路径相似的 Agent。" },
  { id: "plaza", title: "Agent 广场", description: "发现并搜索公开 Agent，拓展对话对象。" },
  { id: "more", title: "更多功能", description: "预留功能扩展位，支持后续新增。" },
];

const selfContact: Contact = {
  id: "self",
  name: "我的 Agent",
  meta: "你的专属 Agent 工作台",
  isUserAgent: true,
};

const axes = ["院校匹配", "专业匹配", "目标重合", "经历相似"] as const;

const generationSteps = [
  "正在解析你的简历...",
  "提取关键经历...",
  "构建你的数字分身...",
];

const privacyOptions = ["公开", "握手后可见", "仅本人确认后可见"] as const;

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════ */
function AgentWorkbenchInner() {
  const searchParams = useSearchParams();

  /* ── Data ── */
  const [mentors, setMentors] = useState<MentorSummary[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  /* ── Navigation ── */
  const [activeSection, setActiveSection] = useState<SectionId>("profile");
  const [activeMentorId, setActiveMentorId] = useState("");

  /* ── Contacts ── */
  const [contacts, setContacts] = useState<Contact[]>([selfContact]);
  const [activeId, setActiveId] = useState(selfContact.id);

  /* ── Chat ── */
  const [conversationState, setConversationState] = useState<Record<string, Message[]>>({});
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

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

  const [knowledgeItems, setKnowledgeItems] = useState([
    { id: "k1", title: "夏令营面试笔记.pdf", source: "本地上传", privacy: "公开" },
    { id: "k2", title: "实习复盘总结.md", source: "本地上传", privacy: "握手后可见" },
    { id: "k3", title: "AI 对话记录 - 科研讨论", source: "历史导入", privacy: "仅本人确认后可见" },
  ]);

  /* ── Load mentors ── */
  useEffect(() => {
    fetch("/api/mentors")
      .then((res) => res.json())
      .then((data) => {
        const list: MentorSummary[] = data.mentors ?? [];
        setMentors(list);
        const mentorContacts: Contact[] = list.map((m) => ({
          id: m.id,
          name: m.name,
          meta: m.title,
        }));
        setContacts([selfContact, ...mentorContacts]);

        // Pre-select mentor from query param
        const paramMentor = searchParams.get("mentor");
        if (paramMentor && list.find((m) => m.id === paramMentor)) {
          setActiveId(paramMentor);
          setActiveMentorId(paramMentor);
          setActiveSection("match");
        } else if (list.length > 0) {
          setActiveMentorId(list[0].id);
        }
        setDataLoaded(true);
      })
      .catch(() => setDataLoaded(true));
  }, [searchParams]);

  /* ── Derived ── */
  const activeContact = useMemo(
    () => contacts.find((c) => c.id === activeId) ?? contacts[0],
    [activeId, contacts]
  );
  const activeMentor = useMemo(
    () => mentors.find((m) => m.id === activeMentorId) ?? mentors[0],
    [activeMentorId, mentors]
  );
  const messages = conversationState[activeContact.id] ?? [];

  /* ── Agent generation simulation ── */
  useEffect(() => {
    if (!isGenerating) return;
    setGenerationStep(0);
    const interval = window.setInterval(() => {
      setGenerationStep((prev) => Math.min(prev + 1, generationSteps.length - 1));
    }, 1000);
    const timeout = window.setTimeout(() => {
      setIsGenerating(false);
      const newAgent: Contact = {
        id: `agent-${Date.now()}`,
        name: "新生成 Agent",
        meta: "已就绪 · 可开始匹配",
        isUserAgent: true,
      };
      setContacts((prev) => [selfContact, newAgent, ...prev.slice(1)]);
      setActiveId(newAgent.id);
      setActiveSection("match");
    }, 3000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [isGenerating]);

  /* ── Chat: send message ── */
  const handleSendMessage = useCallback(async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || isChatLoading) return;

    const userMessage: Message = {
      id: `${activeContact.id}-${Date.now()}`,
      sender: "user",
      content: trimmed,
    };

    setConversationState((prev) => {
      const next = prev[activeContact.id] ? [...prev[activeContact.id]] : [];
      next.push(userMessage);
      return { ...prev, [activeContact.id]: next };
    });
    setChatInput("");
    setIsChatLoading(true);

    try {
      const history = conversationState[activeContact.id] ?? [];
      const apiMessages = [
        ...history.map((m) => ({
          role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        })),
        { role: "user" as const, content: trimmed },
      ];

      const isMentorChat = !activeContact.isUserAgent && activeContact.id !== "self";
      const body: Record<string, unknown> = { messages: apiMessages };
      if (isMentorChat) {
        body.mentorId = activeContact.id;
      } else {
        body.persona = {
          name: "我的 Agent",
          background: "复旦大学在校生 AI 数字分身，了解你的全部背景与需求",
          expertise: "根据你的档案信息，提供个性化建议和路径匹配",
        };
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      const replyContent = data.reply ?? data.error ?? "（对方暂时无法回复，请稍后重试）";

      const agentMessage: Message = {
        id: `${activeContact.id}-${Date.now()}-reply`,
        sender: "agent",
        content: replyContent,
      };

      setConversationState((prev) => {
        const next = prev[activeContact.id] ? [...prev[activeContact.id]] : [];
        next.push(agentMessage);
        return { ...prev, [activeContact.id]: next };
      });
    } catch {
      setConversationState((prev) => {
        const next = prev[activeContact.id] ? [...prev[activeContact.id]] : [];
        next.push({
          id: `${activeContact.id}-${Date.now()}-reply`,
          sender: "agent",
          content: "（网络异常，请稍后重试）",
        });
        return { ...prev, [activeContact.id]: next };
      });
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, activeContact, conversationState]);

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
        合规提示：本工作台中由 SecondMe 分身或兜底 LLM 生成的回复均为「AI 助手代为表达」，非学长学姐本人直接发言；所有学长资料来源于本人主动填写或本人授权的 SecondMe 分身调用。
      </div>
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
                  setActiveId(mentor.id);
                  setActiveSection("match");
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
                <h3>✅ 画像提取结果</h3>
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
        /* ── Match / More (chat + contact list) ── */
        <>
          <section className="workbench-list">
            <div className="workbench-list__header">
              <h3>Agent / 联系人</h3>
              <p>点击切换对话对象</p>
            </div>
            <div className="workbench-list__items">
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  className={contact.id === activeId ? "workbench-list__item is-active" : "workbench-list__item"}
                  type="button"
                  onClick={() => setActiveId(contact.id)}
                >
                  <span>{contact.name}</span>
                  <small>{contact.meta}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="workbench-chat">
            <header className="workbench-chat__profile">
              <div>
                <h2>{activeContact.name}</h2>
                <p>{activeContact.meta}</p>
              </div>
              <span className="workbench-chat__tag">ACTIVE</span>
            </header>

            <div className="workbench-chat__messages">
              {messages.length === 0 && !isChatLoading && (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "2rem" }}>
                  {activeContact.isUserAgent
                    ? "发送消息开始与你的 Agent 对话"
                    : `向${activeContact.name}提问，获取基于真实经历的个性化建议`}
                </p>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={message.sender === "user" ? "workbench-chat__message is-user" : "workbench-chat__message"}
                >
                  <p>{message.content}</p>
                </div>
              ))}
              {isChatLoading && (
                <div className="workbench-chat__message typing-indicator" aria-label="对方正在输入">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              )}
            </div>

            <footer className="workbench-chat__actions">
              {activeSection === "match" ? (
                <div className="workbench-chat__composer">
                  <input
                    type="text"
                    placeholder={isChatLoading ? "对方正在输入..." : "输入消息..."}
                    value={chatInput}
                    disabled={isChatLoading}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSendMessage(); }}
                  />
                  <button type="button" disabled={isChatLoading} onClick={handleSendMessage}>
                    {isChatLoading ? "等待中" : "发送"}
                  </button>
                </div>
              ) : (
                <button className="workbench-chat__summary" type="button">一键总结</button>
              )}
              <button className="workbench-chat__fab" type="button" aria-label="新建对话">+</button>
            </footer>
          </section>
        </>
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
