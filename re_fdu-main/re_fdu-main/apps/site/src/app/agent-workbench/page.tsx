"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

const navItems: { id: SectionId; title: string; description: string; label: string }[] = [
  { id: "profile", title: "Persona Studio", description: "整理资料、抽取画像、定义 Agent 风格。", label: "P1" },
  { id: "match", title: "Match Logic", description: "校准你的目标，让后续推荐更可信。", label: "P2" },
  { id: "plaza", title: "Agent Plaza", description: "浏览公开学长画像，挑选进入对话的对象。", label: "P3" },
  { id: "more", title: "Expansion", description: "为后续工作流和能力扩展预留接口。", label: "P4" },
];

const generationSteps = [
  "正在解析你的简历和公开资料...",
  "提取可复用经历与表达风格...",
  "构建你的数字分身与推荐上下文...",
];

const privacyOptions = ["公开", "握手后可见", "仅本人确认后可见"] as const;

const goalLabels: Record<string, string> = {
  summer: "夏令营",
  intern: "实习",
  apply: "申请",
};

const nextStepByGoal: Record<string, string> = {
  summer: "保研 / 夏令营策略",
  intern: "实习 / 求职准备",
  apply: "申请 / 路径选择",
};

function AgentWorkbenchInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [me, setMe] = useState<{ role: "senior" | "junior" } | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const u = d?.user ?? d;
        if (u?.role) setMe({ role: u.role });
      })
      .catch(() => {});
  }, []);

  const [mentors, setMentors] = useState<MentorSummary[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("profile");
  const [activeMentorId, setActiveMentorId] = useState("");

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [xhsId, setXhsId] = useState("");
  const [githubUser, setGithubUser] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [zhihuId, setZhihuId] = useState("");
  const [builtProfile, setBuiltProfile] = useState<Record<string, unknown> | null>(null);

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
      } catch {}
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

  useEffect(() => {
    fetch("/api/seniors")
      .then((res) => res.json())
      .then((data) => {
        const list: MentorSummary[] = data.mentors ?? [];
        setMentors(list);

        const paramMentor = searchParams.get("mentor");
        if (paramMentor && list.find((m) => m.id === paramMentor)) {
          setActiveMentorId(paramMentor);
          setActiveSection("plaza");
        } else if (list.length > 0) {
          setActiveMentorId(list[0].id);
        }
      })
      .catch(() => {});
  }, [searchParams]);

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
    if (!resumeFileName && resumeText.trim().length === 0) nextErrors.push("请上传简历文件或粘贴简历内容。");
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
      window.setTimeout(() => {
        setIsGenerating(false);
        if (me?.role === "junior") {
          const direction = encodeURIComponent(nextStepByGoal[goal] ?? "研究方向与问题梳理");
          setSuccessMessage("你的 Agent 已更新，正在带你进入下一步推荐。");
          window.setTimeout(() => {
            router.push(`/me/junior?from=agent-built&direction=${direction}`);
          }, 900);
        } else {
          setSuccessMessage("你的 Agent 已更新，画像已写入当前工作台。");
        }
      }, 3000);
      return;
    }

    setErrors([]);
    setSuccessMessage(null);
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
        if (me?.role === "junior") {
          const direction = encodeURIComponent(nextStepByGoal[goal] ?? "研究方向与问题梳理");
          setSuccessMessage("画像生成成功，正在进入“选择问题方向”这一步。");
          window.setTimeout(() => {
            router.push(`/me/junior?from=agent-built&direction=${direction}`);
          }, 1100);
        } else {
          setSuccessMessage("画像生成成功，你的 Agent 已可用于后续对话与收件箱场景。");
        }
      } else {
        setErrors([data.error ?? `Profile build failed (HTTP ${res.status})`]);
      }
    } catch (err) {
      setErrors([`Network error: ${String(err)}`]);
    } finally {
      window.setTimeout(() => setIsGenerating(false), 800);
    }
  };

  const activeMentor = mentors.find((mentor) => mentor.id === activeMentorId) ?? mentors[0] ?? null;
  const platformCount = [githubUser, xhsId, linkedinUrl, zhihuId].filter((value) => value.trim()).length;
  const profileCompletion = [resumeFileName || resumeText.trim(), school, major, gpa, goal].filter(Boolean).length;
  const profileReadiness = Math.round((profileCompletion / 5) * 100);
  const builtProfilePreview = useMemo(() => {
    if (!builtProfile) return [];
    return Object.entries(builtProfile).slice(0, 6);
  }, [builtProfile]);

  const renderRightPanel = () => {
    if (activeSection === "plaza") {
      return (
        <>
          <section className="wb-panel-card wb-panel-card--accent">
            <p className="wb-kicker">Selected agent</p>
            {activeMentor ? (
              <>
                <h3>{activeMentor.name}</h3>
                <p className="wb-muted">{activeMentor.title}</p>
                <p>{activeMentor.highlight}</p>
                <div className="wb-token-row">
                  {activeMentor.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="wb-token">
                      {tag}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="wb-muted">还没有可展示的学长画像。</p>
            )}
          </section>

          <section className="wb-panel-card">
            <p className="wb-kicker">Plaza mode</p>
            <h3>进入对话前先看清画像和轨迹</h3>
            <ul className="wb-bullet-list">
              <li>先暴露标签、方向和亮点，再引导用户进入聊天。</li>
              <li>卡片交互保持轻量，避免在这里塞过多操作按钮。</li>
              <li>保持工作台与公开广场同一视觉语言，降低切换成本。</li>
            </ul>
          </section>
        </>
      );
    }

    if (activeSection !== "profile") {
      return (
        <>
          <section className="wb-panel-card wb-panel-card--accent">
            <p className="wb-kicker">Module status</p>
            <h3>Conversation has moved out</h3>
            <p>实际对话流程已经迁移到独立页面，这里更适合作为准备与分发中心。</p>
          </section>
          <section className="wb-panel-card">
            <p className="wb-kicker">Next step</p>
            <h3>{me?.role === "junior" ? "前往学弟主页查看推荐" : "前往学长主页查看收件箱"}</h3>
            <a className="wb-side-link" href={me?.role === "junior" ? "/me/junior" : me?.role === "senior" ? "/me/senior" : "/me"}>
              打开对应主页
            </a>
          </section>
        </>
      );
    }

    return (
      <>
        <section className="wb-panel-card wb-panel-card--accent">
          <p className="wb-kicker">Live persona status</p>
          <h3>{builtProfile ? "画像已生成，可用于匹配和对话注入" : "正在准备你的数字分身"}</h3>
          <div className="wb-stat-stack">
            <div className="wb-stat">
              <span>Profile readiness</span>
              <strong>{profileReadiness}%</strong>
            </div>
            <div className="wb-stat">
              <span>Connected platforms</span>
              <strong>{platformCount}</strong>
            </div>
            <div className="wb-stat">
              <span>Knowledge items</span>
              <strong>{knowledgeItems.length}</strong>
            </div>
          </div>
        </section>

        <section className="wb-panel-card">
          <p className="wb-kicker">Prompt direction</p>
          <h3>Agent 应该如何替你表达</h3>
          <p className="wb-muted">
            {promptText.trim() || "还没有写入额外 prompt。建议明确你想让 Agent 优先追问的问题和语气。"}
          </p>
          <div className="wb-mini-grid">
            <div>
              <span>School</span>
              <strong>{school || "待补充"}</strong>
            </div>
            <div>
              <span>Major</span>
              <strong>{major || "待补充"}</strong>
            </div>
            <div>
              <span>Goal</span>
              <strong>{goalLabels[goal] ?? "待补充"}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{me?.role === "senior" ? "Senior" : me?.role === "junior" ? "Junior" : "Unknown"}</strong>
            </div>
          </div>
        </section>

        <section className="wb-panel-card">
          <div className="wb-panel-head">
            <div>
              <p className="wb-kicker">Profile snapshot</p>
              <h3>Structured output preview</h3>
            </div>
            {builtProfile ? (
              <button
                type="button"
                className="wb-inline-button"
                onClick={async () => {
                  try {
                    await fetch("/api/profile/me", {
                      method: "DELETE",
                      credentials: "same-origin",
                    });
                  } catch {}
                  setBuiltProfile(null);
                }}
              >
                清除画像
              </button>
            ) : null}
          </div>
          {builtProfile ? (
            <>
              <div className="wb-preview-list">
                {builtProfilePreview.map(([key, value]) => (
                  <div key={key} className="wb-preview-item">
                    <span>{key}</span>
                    <strong>{typeof value === "object" ? "Structured data" : String(value)}</strong>
                  </div>
                ))}
              </div>
              <pre className="wb-json-preview">{JSON.stringify(builtProfile, null, 2)}</pre>
            </>
          ) : (
            <p className="wb-muted">右侧会在生成画像后展示结构化结果和调试预览。</p>
          )}
        </section>
      </>
    );
  };

  return (
    <main className="workbench-shell">
      <section className="workbench-hero">
        <div className="workbench-hero__copy">
          <div className="workbench-badge-row">
            <span className="workbench-badge">SecondMe-inspired shell</span>
            <span className="workbench-badge workbench-badge--muted">P3 core demo language</span>
          </div>
          <p className="workbench-hero__eyebrow">A2A workbench</p>
          <h1>让画像、协议和后续对话入口在同一个专业工作台里发生。</h1>
          <p className="workbench-hero__summary">
            这个页面现在不是单纯的表单，而是核心演示台。左侧负责流程，中间负责创作与编辑，右侧负责状态、解释和结构化结果。
          </p>
        </div>

        <div className="workbench-hero__meta">
          <div className="workbench-meta-card">
            <span>Current role</span>
            <strong>{me?.role === "senior" ? "Senior agent owner" : me?.role === "junior" ? "Junior agent builder" : "Loading role"}</strong>
          </div>
          <div className="workbench-meta-card">
            <span>Core objective</span>
            <strong>{goalLabels[goal] ?? "Build a trustworthy persona"}</strong>
          </div>
          <div className="workbench-meta-card">
            <span>Compliance</span>
            <strong>AI 代为表达，非真人直发</strong>
          </div>
        </div>
      </section>

      <div className="workbench-compliance">
        合规提示：本工作台中由 AI 助手生成的回复均为“AI 代为表达”，非学长学姐本人直接发言；所有学长资料来源于本人主动填写或本人授权抓取的公开社媒画像。
      </div>

      <div className="workbench-stage">
        <aside className="workbench-stage__nav">
          {me?.role === "senior" ? (
            <div className="workbench-role-banner">
              <strong>学长视角</strong>
              <p>你的 persona 会在学弟提问时注入回答，决定回复的质感和可信度。</p>
            </div>
          ) : me?.role === "junior" ? (
            <div className="workbench-role-banner">
              <strong>学弟视角</strong>
              <p>你的画像将用于推荐更匹配的学长，并帮助 Agent 更早问到关键问题。</p>
            </div>
          ) : null}

          <nav className="workbench-nav workbench-nav--enhanced">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={item.id === activeSection ? "workbench-nav__card is-active" : "workbench-nav__card"}
                type="button"
                onClick={() => setActiveSection(item.id)}
              >
                <span className="workbench-nav__label">{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </button>
            ))}
          </nav>

          <section className="workbench-rail-card">
            <p className="wb-kicker">Readiness</p>
            <div className="workbench-progress">
              <div className="workbench-progress__bar">
                <span style={{ width: `${profileReadiness}%` }} />
              </div>
              <strong>{profileReadiness}% complete</strong>
            </div>
            <ul className="wb-bullet-list">
              <li>简历或文字材料决定基础 persona 的稳定性。</li>
              <li>社媒账号越完整，推荐与问答越容易个性化。</li>
              <li>Prompt 应聚焦“Agent 先替我问什么”。</li>
            </ul>
          </section>
        </aside>

        {activeSection === "plaza" ? (
          <section className="workbench-plaza workbench-plaza--pro" aria-label="Agent plaza">
            <header className="workbench-plaza__header workbench-plaza__header--pro">
              <div>
                <p className="wb-kicker">Public agent layer</p>
                <h2>Agent Plaza</h2>
                <p>先看路径和画像，再进入正式对话或详情页。</p>
              </div>
              <span className="workbench-chat__tag">P3 plaza</span>
            </header>
            <div className="workbench-plaza__grid">
              {mentors.map((mentor) => (
                <article
                  key={mentor.id}
                  className={mentor.id === activeMentorId ? "plaza-card is-active" : "plaza-card"}
                  onClick={() => {
                    setActiveMentorId(mentor.id);
                    window.location.href = `/seniors/${mentor.id}`;
                  }}
                >
                  <div className="plaza-card__media">
                    {mentor.avatar ? <img src={mentor.avatar} alt={mentor.name} /> : <div className="plaza-card__media-placeholder" />}
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
          <section className="workbench-chat workbench-profile workbench-profile--pro">
            <header className="workbench-chat__profile workbench-chat__profile--pro">
              <div>
                <p className="wb-kicker">Persona studio</p>
                <h2>个人档案与 Agent 创建</h2>
                <p>把简历、社媒和知识库整理成一个可注入、可解释、可持续更新的工作版本。</p>
              </div>
              <span className="workbench-chat__tag">Core workspace</span>
            </header>

            <div className="workbench-profile__content workbench-profile__content--pro">
              <section className="profile-section profile-section--hero">
                <div className="profile-section__head">
                  <div>
                    <p className="wb-kicker">Input channel</p>
                    <h3>简历录入区</h3>
                  </div>
                  <span className="wb-chip">{resumeFileName ? "File attached" : "No file yet"}</span>
                </div>
                <div className="profile-upload" onDragOver={(e) => e.preventDefault()} onDrop={handleResumeDrop}>
                  <label className="profile-upload__button" htmlFor="resume-upload">上传 PDF</label>
                  <input id="resume-upload" type="file" accept=".pdf" onChange={(e) => handleResumeFile(e.target.files?.[0] ?? null)} />
                  <p>支持拖拽上传，也可以只用文字草稿先跑通 persona 生成流程。</p>
                </div>
                {resumeFileName ? (
                  <div className="profile-file">
                    <span>{resumeFileName}</span>
                    <button type="button" onClick={() => setResumeFileName(null)}>移除</button>
                  </div>
                ) : null}
                <textarea
                  className="profile-textarea"
                  placeholder="或者粘贴简历文本内容，帮助系统快速抽取经历、方向和表达风格。"
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                />
              </section>

              <section className="profile-section">
                <div className="profile-section__head">
                  <div>
                    <p className="wb-kicker">Structured fields</p>
                    <h3>标准化信息确认</h3>
                  </div>
                </div>
                <div className="profile-grid">
                  <label className="profile-field">学校<input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="例如：复旦大学" /></label>
                  <label className="profile-field">专业<input value={major} onChange={(e) => setMajor(e.target.value)} placeholder="例如：计算机科学" /></label>
                  <label className="profile-field">GPA<input value={gpa} onChange={(e) => setGpa(e.target.value)} placeholder="例如：3.7 / 4.0" /></label>
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
                <div className="profile-section__head">
                  <div>
                    <p className="wb-kicker">External signals</p>
                    <h3>社媒账号与画像抽取</h3>
                  </div>
                  <span className="wb-chip">{platformCount} connected</span>
                </div>
                <p className="profile-section__caption">
                  填任一字段即可触发 Profile Extraction。GitHub 直接走公开 API，其他平台按现有管线处理。
                </p>
                <div className="profile-grid">
                  <label className="profile-field">GitHub 用户名<input value={githubUser} onChange={(e) => setGithubUser(e.target.value)} placeholder="例如：torvalds" /></label>
                  <label className="profile-field">小红书 ID<input value={xhsId} onChange={(e) => setXhsId(e.target.value)} placeholder="纯数字 8-12 位" /></label>
                  <label className="profile-field">LinkedIn URL<input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." /></label>
                  <label className="profile-field">知乎 ID 或 URL<input value={zhihuId} onChange={(e) => setZhihuId(e.target.value)} placeholder="https://zhihu.com/people/..." /></label>
                </div>
              </section>

              <section className="profile-section">
                <div className="profile-section__head">
                  <div>
                    <p className="wb-kicker">Knowledge layer</p>
                    <h3>专属知识库构建</h3>
                  </div>
                </div>
                <div className="profile-actions">
                  <button type="button">本地资料上传</button>
                  <button type="button">外部数据源接入</button>
                  <button type="button">历史内容导入</button>
                </div>
                <div className="profile-knowledge">
                  {knowledgeItems.map((item) => (
                    <div key={item.id} className="profile-knowledge__row">
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.source}</span>
                      </div>
                      <select
                        value={item.privacy}
                        onChange={(e) =>
                          setKnowledgeItems((prev) =>
                            prev.map((entry) => (entry.id === item.id ? { ...entry, privacy: e.target.value } : entry)),
                          )
                        }
                      >
                        {privacyOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </section>

              <section className="profile-section">
                <div className="profile-section__head">
                  <div>
                    <p className="wb-kicker">Interaction brief</p>
                    <h3>Agent 对话定位输入区</h3>
                  </div>
                </div>
                <textarea
                  className="profile-textarea profile-textarea--large"
                  placeholder="你想让 Agent 先替你问什么？例如：帮我了解保研面试最关键的判断标准，以及我现在最该补的短板。"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                />
              </section>
            </div>

            {errors.length > 0 ? (
              <div className="profile-errors">{errors.map((err) => <p key={err}>{err}</p>)}</div>
            ) : null}

            {successMessage ? (
              <div className="profile-success">
                <p>{successMessage}</p>
              </div>
            ) : null}

            <footer className="profile-footer profile-footer--pro">
              <div className="profile-footer__hint">
                <span>生成后结果会写入当前用户资料，并用于推荐与问答。</span>
              </div>
              <button className="profile-submit" type="button" onClick={handleGenerate}>生成我的 Agent</button>
            </footer>
          </section>
        ) : (
          <section className="workbench-chat workbench-chat--placeholder">
            <div className="workbench-placeholder">
              <p className="wb-kicker">Module handoff</p>
              <h2>对话流程已迁移到独立页面</h2>
              <p className="wb-muted">
                这个区域保留为工作台模块入口，真正的聊天、收件箱和推荐浏览已经拆到各自页面，避免把所有能力揉成一个拥挤界面。
              </p>
              <a className="wb-side-link" href={me?.role === "junior" ? "/me/junior" : me?.role === "senior" ? "/me/senior" : "/me"}>
                打开我的主页
              </a>
            </div>
          </section>
        )}

        <aside className="workbench-stage__inspector">
          {renderRightPanel()}
        </aside>
      </div>

      {isGenerating ? (
        <div className="generation-overlay" aria-live="polite">
          <div className="generation-overlay__panel">
            <span className="generation-overlay__dot" />
            <p>{generationSteps[generationStep]}</p>
          </div>
        </div>
      ) : null}
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
