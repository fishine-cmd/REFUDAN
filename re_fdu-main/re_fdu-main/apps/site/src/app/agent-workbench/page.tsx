"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

type AgentProfileData = {
  resumeFileName?: string | null;
  resumeText?: string;
  school?: string;
  major?: string;
  gpa?: string;
  goal?: string;
  promptText?: string;
  accounts?: {
    xhsId?: string;
    githubUser?: string;
    linkedinUrl?: string;
    zhihuId?: string;
  };
  knowledgeItems?: { id: string; title: string; source: string; privacy: string }[];
  createdAt?: number;
  updatedAt?: number;
};

type Message = { id: string; sender: "agent" | "user" | "system"; content: string };

type SessionTurn = {
  id: string;
  speaker: "junior_agent" | "senior_agent" | "orchestrator" | "system";
  content: string;
  visibleTo?: "junior" | "senior" | "both";
  source?: "manual" | "autoplay";
  slot?: string;
};

type SessionDetail = {
  sessionId: string;
  summary?: string;
  autoplayState?: {
    status?: "idle" | "running" | "completed" | "degraded";
    round?: number;
    maxRounds?: number;
    coveredSlots?: string[];
    currentSlot?: string;
    done?: boolean;
    lastError?: string;
  };
  assessment?: {
    summary?: string;
    verdict?: string;
    adjustedScore?: number;
    coveredSlots?: string[];
  } | null;
  turns?: SessionTurn[];
};

type ChatProgress = {
  busy: boolean;
  label: string;
};

type ProfileEditorMode = "create" | "overview" | "rebuild" | "enrich";

type ProfileInsights = {
  source: "ai" | "fallback";
  headline: string;
  summary: string;
  personality: string[];
  interests: string[];
  motivations: string[];
  communicationStyle: string[];
  strengths: string[];
  suggestedTopics: string[];
  caution: string;
  evidence: string[];
};

type ProfileStatCard = {
  label: string;
  value: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) return item.trim();
    }
  }
  return "";
}

function toStringArray(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item == null) return "";
      return String(item).trim();
    })
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, limit);
}

function getBuiltProfileStatCards(builtProfile: Record<string, unknown> | null): ProfileStatCard[] {
  if (!builtProfile) return [];
  const basic = asRecord(builtProfile.basic_info);
  const sources = asRecord(builtProfile.sources);
  const platforms = toStringArray(builtProfile.platforms_used, 4);
  const fallbackPlatforms = toStringArray(basic.platforms, 4);
  const confidence =
    typeof builtProfile.confidence === "number"
      ? `${Math.round(builtProfile.confidence * 100)}%`
      : "TBD";
  const displayName = firstText(basic.display_name) || "Current profile";
  const noteCount =
    typeof sources.notes_collected === "number"
      ? `${sources.notes_collected} posts`
      : "Unknown";
  const bodyCount =
    typeof sources.notes_with_body === "number"
      ? `${sources.notes_with_body} bodies`
      : "Unknown";

  return [
    { label: "Profile", value: displayName },
    { label: "Platforms", value: (platforms.length > 0 ? platforms : fallbackPlatforms).join(" / ") || "Unknown" },
    { label: "Samples", value: noteCount },
    { label: "Body Coverage", value: bodyCount },
    { label: "Confidence", value: confidence },
  ];
}

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

function buildTurnMessage(turn: SessionTurn): Message | null {
  if (turn.visibleTo === "senior") return null;

  if (turn.speaker === "orchestrator" || turn.speaker === "system") {
    return {
      id: turn.id,
      sender: "system",
      content: turn.content,
    };
  }

  if (turn.speaker === "junior_agent") {
    return {
      id: turn.id,
      sender: "user",
      content: turn.source === "autoplay" ? `[AI 自动追问] ${turn.content}` : turn.content,
    };
  }

  return {
    id: turn.id,
    sender: "agent",
    content: turn.source === "autoplay" && turn.slot ? `[${turn.slot}] ${turn.content}` : turn.content,
  };
}

function buildConversationFromSession(detail: SessionDetail): Message[] {
  const messages = (detail.turns ?? [])
    .map(buildTurnMessage)
    .filter((message): message is Message => Boolean(message));

  if (detail.assessment?.summary) {
    const covered = detail.assessment.coveredSlots?.length
      ? ` 已确认 ${detail.assessment.coveredSlots.join(" / ")}。`
      : "";
    const score =
      typeof detail.assessment.adjustedScore === "number"
        ? ` 回流评分 ${detail.assessment.adjustedScore}。`
        : "";
    messages.push({
      id: `${detail.sessionId}-assessment`,
      sender: "system",
      content: `[A2A 结论] ${detail.assessment.summary}${covered}${score}`.trim(),
    });
  }

  return messages;
}

function AgentWorkbenchInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [me, setMe] = useState<{ role: "senior" | "junior" } | null>(null);
  const [mentors, setMentors] = useState<MentorSummary[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("profile");
  const [activeMentorId, setActiveMentorId] = useState("");

  const [contacts, setContacts] = useState<Contact[]>([selfContact]);
  const [activeId, setActiveId] = useState(selfContact.id);

  const [conversationState, setConversationState] = useState<Record<string, Message[]>>({});
  const [chatSessionIds, setChatSessionIds] = useState<Record<string, string>>({});
  const [chatInput, setChatInput] = useState("");
  const [chatProgress, setChatProgress] = useState<Record<string, ChatProgress>>({});

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
  const [agentProfile, setAgentProfile] = useState<AgentProfileData | null>(null);
  const [hasAgent, setHasAgent] = useState(false);
  const [profileEditorMode, setProfileEditorMode] = useState<ProfileEditorMode>("create");
  const [profileInsights, setProfileInsights] = useState<ProfileInsights | null>(null);
  const [insightsState, setInsightsState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const [knowledgeItems, setKnowledgeItems] = useState([
    { id: "k1", title: "夏令营面试笔记.pdf", source: "本地上传", privacy: "公开" },
    { id: "k2", title: "实习复盘总结.md", source: "本地上传", privacy: "握手后可见" },
    { id: "k3", title: "AI 对话记录 - 科研讨论", source: "历史导入", privacy: "仅本人确认后可见" },
  ]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const user = d?.user ?? d;
        if (user?.role) setMe({ role: user.role });
      })
      .catch(() => {});
  }, []);

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
        if (data?.agentProfile) {
          const ap = data.agentProfile as AgentProfileData;
          setAgentProfile(ap);
          // 回填表单,便于"管理 / 编辑"
          if (ap.resumeFileName) setResumeFileName(ap.resumeFileName);
          if (ap.resumeText) setResumeText(ap.resumeText);
          if (ap.school) setSchool(ap.school);
          if (ap.major) setMajor(ap.major);
          if (ap.gpa) setGpa(ap.gpa);
          if (ap.goal) setGoal(ap.goal);
          if (ap.promptText) setPromptText(ap.promptText);
          if (ap.accounts?.xhsId) setXhsId(ap.accounts.xhsId);
          if (ap.accounts?.githubUser) setGithubUser(ap.accounts.githubUser);
          if (ap.accounts?.linkedinUrl) setLinkedinUrl(ap.accounts.linkedinUrl);
          if (ap.accounts?.zhihuId) setZhihuId(ap.accounts.zhihuId);
          if (ap.knowledgeItems?.length) setKnowledgeItems(ap.knowledgeItems);
        }
        if (data?.hasAgent) {
          setHasAgent(true);
          setProfileEditorMode("overview");
        } else {
          setProfileEditorMode("create");
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section === "profile" || section === "match" || section === "plaza" || section === "more") {
      setActiveSection(section);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/seniors")
      .then((res) => res.json())
      .then((data) => {
        const list: MentorSummary[] = data.mentors ?? [];
        setMentors(list);

        const mentorContacts: Contact[] = list.map((mentor) => ({
          id: mentor.id,
          name: mentor.name,
          meta: mentor.title || "已开放协作",
        }));
        setContacts([selfContact, ...mentorContacts]);

        const paramMentor = searchParams.get("mentor");
        if (paramMentor && list.find((mentor) => mentor.id === paramMentor)) {
          setActiveId(paramMentor);
          setActiveMentorId(paramMentor);
          setActiveSection("match");
        } else if (list.length > 0) {
          setActiveMentorId(list[0].id);
        }
      })
      .catch(() => {});
  }, [searchParams]);

  useEffect(() => {
    if (!isGenerating) return;
    setGenerationStep(0);
    // 仅推进文案动画;isGenerating 的结束由 handleGenerate 真实流程控制。
    const interval = window.setInterval(() => {
      setGenerationStep((prev) => Math.min(prev + 1, generationSteps.length - 1));
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [isGenerating]);

  useEffect(() => {
    if (!builtProfile) {
      setProfileInsights(null);
      setInsightsState("idle");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setInsightsState("loading");
    fetch("/api/profile/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ builtProfile }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { insights?: ProfileInsights };
        if (cancelled) return;
        if (response.ok && data.insights) {
          setProfileInsights(data.insights);
          setInsightsState("ready");
          return;
        }
        setInsightsState("error");
      })
      .catch(() => {
        if (!cancelled) setInsightsState("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [builtProfile]);

  const activeContact = useMemo(
    () => contacts.find((contact) => contact.id === activeId) ?? contacts[0] ?? selfContact,
    [activeId, contacts],
  );
  const activeMentor = useMemo(
    () => mentors.find((mentor) => mentor.id === activeMentorId) ?? mentors[0] ?? null,
    [activeMentorId, mentors],
  );
  const messages = conversationState[activeContact.id] ?? [];
  const activeChatProgress = chatProgress[activeContact.id] ?? { busy: false, label: "" };
  const isChatLoading = activeChatProgress.busy;
  const builtProfileStatCards = useMemo(() => getBuiltProfileStatCards(builtProfile), [builtProfile]);
  const profileCompletion = [resumeFileName || resumeText.trim(), school, major, gpa, goal].filter(Boolean).length;
  const profileReadiness = Math.round((profileCompletion / 5) * 100);
  const platformCount = [githubUser, xhsId, linkedinUrl, zhihuId].filter((value) => value.trim()).length;
  const isRebuildMode = profileEditorMode === "rebuild";
  const isEnrichMode = profileEditorMode === "enrich";
  const currentSubmitLabel = !hasAgent
    ? "生成我的 Agent"
    : isRebuildMode
      ? "确认更新 Agent 信息"
      : isEnrichMode
        ? "确认新增资料"
        : "更新 Agent 信息";

  const updateChatProgress = useCallback((contactId: string, patch: Partial<ChatProgress>) => {
    setChatProgress((prev) => ({
      ...prev,
      [contactId]: {
        busy: prev[contactId]?.busy ?? false,
        label: prev[contactId]?.label ?? "",
        ...patch,
      },
    }));
  }, []);

  const syncConversationFromSession = useCallback(async (contactId: string, sessionId: string) => {
    const response = await fetch(`/api/a2a/sessions/${sessionId}`);
    const detail = (await response.json()) as SessionDetail & { error?: string };
    if (!response.ok || !detail?.sessionId) {
      throw new Error(detail?.error ?? "Failed to load A2A session");
    }

    setConversationState((prev) => ({
      ...prev,
      [contactId]: buildConversationFromSession(detail),
    }));
    setChatSessionIds((prev) => ({
      ...prev,
      [contactId]: detail.sessionId,
    }));

    return detail;
  }, []);

  const runAutoplayLoop = useCallback(
    async (contactId: string, sessionId: string, initialState?: SessionDetail["autoplayState"]) => {
      let done = !!initialState?.done;
      let round = initialState?.round ?? 1;
      let covered = initialState?.coveredSlots ?? [];
      let currentSlot = initialState?.currentSlot;

      while (!done) {
        updateChatProgress(contactId, {
          busy: true,
          label: `A2A running: round ${round}, covered ${covered.length}/5 slots${
            currentSlot ? `, current topic: ${currentSlot}` : ""
          }`,
        });

        const autoplayResponse = await fetch(`/api/a2a/sessions/${sessionId}/autoplay`, {
          method: "POST",
        });
        const advanced = (await autoplayResponse.json()) as {
          error?: string;
          done?: boolean;
          round?: number;
          coveredSlots?: string[];
          autoplayState?: SessionDetail["autoplayState"];
        };

        if (!autoplayResponse.ok) {
          throw new Error(advanced?.error ?? "Autoplay failed");
        }

        done = !!advanced.done;
        round = advanced.round ?? round;
        covered = advanced.coveredSlots ?? advanced.autoplayState?.coveredSlots ?? covered;
        currentSlot = advanced.autoplayState?.currentSlot;

        await syncConversationFromSession(contactId, sessionId);
      }

      const finalDetail = await syncConversationFromSession(contactId, sessionId);
      updateChatProgress(contactId, {
        busy: false,
        label:
          finalDetail.autoplayState?.status === "degraded"
            ? `A2A ended in degraded mode${finalDetail.autoplayState.lastError ? `: ${finalDetail.autoplayState.lastError}` : ""}`
            : `A2A completed in ${finalDetail.autoplayState?.round ?? round} rounds with ${
                finalDetail.autoplayState?.coveredSlots?.length ?? covered.length
              }/5 slots covered`,
      });
    },
    [syncConversationFromSession, updateChatProgress],
  );

  const handleSendMessage = useCallback(async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || isChatLoading || activeContact.isUserAgent) return;

    const contactId = activeContact.id;
    const existingSessionId = chatSessionIds[contactId];

    const userMessage: Message = {
      id: `${contactId}-${Date.now()}`,
      sender: "user",
      content: trimmed,
    };

    setConversationState((prev) => ({
      ...prev,
      [contactId]: [...(prev[contactId] ?? []), userMessage],
    }));
    setChatInput("");
    updateChatProgress(contactId, {
      busy: true,
      label: existingSessionId ? "Continuing current A2A session..." : "Sending first message and starting A2A...",
    });

    try {
      if (existingSessionId) {
        const followUpResponse = await fetch(`/api/a2a/sessions/${existingSessionId}/turns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const followUp = await followUpResponse.json();
        if (!followUpResponse.ok) {
          throw new Error(followUp?.error ?? "Failed to continue A2A session");
        }

        await syncConversationFromSession(contactId, existingSessionId);
        updateChatProgress(contactId, {
          busy: false,
          label: "Session updated. Open the full trace for details.",
        });
        return;
      }

      const createResponse = await fetch("/api/a2a/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seniorId: contactId,
          question: trimmed,
          origin: "legacy",
          autoplay: true,
          intent: {
            direction: nextStepByGoal[goal] ?? "legacy-chat",
            question: trimmed,
          },
        }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok || !created?.sessionId) {
        throw new Error(created?.error ?? "Failed to start A2A session");
      }

      setChatSessionIds((prev) => ({ ...prev, [contactId]: created.sessionId }));

      const agentMessage: Message = {
        id: `${contactId}-${Date.now()}-reply`,
        sender: "agent",
        content: created.reply ?? created.error ?? "（对方暂时无法回复，请稍后重试）",
      };

      setConversationState((prev) => ({
        ...prev,
        [contactId]: [...(prev[contactId] ?? []), agentMessage],
      }));

      await syncConversationFromSession(contactId, created.sessionId);

      if (created.autoplayState?.enabled && !created.autoplayState?.done) {
        await runAutoplayLoop(contactId, created.sessionId, created.autoplayState);
        return;
      }

      updateChatProgress(contactId, {
        busy: false,
        label: "A2A completed. Open the full trace for details.",
      });
    } catch (error) {
      setConversationState((prev) => ({
        ...prev,
        [contactId]: [
          ...(prev[contactId] ?? []),
          {
            id: `${contactId}-${Date.now()}-reply`,
            sender: "agent",
            content: "（网络异常，请稍后重试）",
          },
        ],
      }));
      updateChatProgress(contactId, {
        busy: false,
        label: error instanceof Error ? error.message : "A2A failed to start. Please retry.",
      });
    }
  }, [
    activeContact.id,
    activeContact.isUserAgent,
    chatInput,
    chatSessionIds,
    goal,
    isChatLoading,
    runAutoplayLoop,
    syncConversationFromSession,
    updateChatProgress,
  ]);

  const handleResumeFile = (file: File | null) => {
    if (!file) return;
    setResumeFileName(file.name);
  };

  const handleResumeDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) handleResumeFile(file);
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
    const hadExistingAgent = hasAgent;
    const accounts = collectPlatformAccounts();

    // 统一校验:核心标准化信息必填;简历与外部账号至少有其一作为画像来源。
    const nextErrors: string[] = [];
    if (!school.trim()) nextErrors.push("请填写学校。");
    if (!major.trim()) nextErrors.push("请填写专业。");
    if (!gpa.trim()) nextErrors.push("请填写 GPA。");
    if (!goal.trim()) nextErrors.push("请选择核心目标。");
    if (!resumeFileName && resumeText.trim().length === 0 && accounts.length === 0) {
      nextErrors.push("请上传简历、粘贴简历内容，或至少连接一个外部账号。");
    }
    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors([]);
    setSuccessMessage(null);
    setIsGenerating(true);

    const buildWarnings: string[] = [];

    try {
      if (hadExistingAgent && profileEditorMode === "rebuild") {
        await Promise.all([
          fetch("/api/profile/agent", { method: "DELETE", credentials: "same-origin" }),
          fetch("/api/profile/me", { method: "DELETE", credentials: "same-origin" }),
        ]);
        setBuiltProfile(null);
        setProfileInsights(null);
      }

      // 1) 有外部账号 → 跑社交画像合成管线,得到 builtProfile。
      if (accounts.length > 0) {
        setBuiltProfile(null);
        setProfileInsights(null);
        try {
          const res = await fetch("/api/profile/build", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accounts,
              displayName: [school, major, goal].filter(Boolean).join(" ").trim() || undefined,
              school: school.trim() || undefined,
              major: major.trim() || undefined,
              gpa: gpa.trim() || undefined,
              goal: goal.trim() || undefined,
            }),
          });
          const data = await res.json();
          if (res.ok && data.profile) {
            setBuiltProfile(data.profile);
          } else {
            buildWarnings.push(data.error ?? `社交画像生成失败 (HTTP ${res.status})`);
          }
        } catch (err) {
          buildWarnings.push(`社交画像生成网络异常: ${String(err)}`);
        }
      }

      // 2) 始终持久化手填档案 → 这样档案栏才会显示当前 Agent。
      const agentPayload = {
        resumeFileName,
        resumeText,
        school,
        major,
        gpa,
        goal,
        promptText,
        accounts: {
          xhsId: xhsId.trim(),
          githubUser: githubUser.trim(),
          linkedinUrl: linkedinUrl.trim(),
          zhihuId: zhihuId.trim(),
        },
        knowledgeItems,
      };

      const saveRes = await fetch("/api/profile/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(agentPayload),
      });
      const saved = await saveRes.json();

      if (saveRes.ok && saved.agentProfile) {
        const wasUpdate = hadExistingAgent;
        setAgentProfile(saved.agentProfile as AgentProfileData);
        setHasAgent(true);
        setProfileEditorMode("overview");
        if (buildWarnings.length > 0) {
          setErrors(buildWarnings);
        }
        if (me?.role === "junior" && !wasUpdate) {
          const direction = encodeURIComponent(nextStepByGoal[goal] ?? "科研方向与问题梳理");
          setSuccessMessage("你的 Agent 已生成并保存，系统正在带你进入下一步问题方向与学长推荐。");
          window.setTimeout(() => {
            router.push(`/me/junior?from=agent-built&direction=${direction}`);
          }, 1200);
        } else {
          setSuccessMessage(
            wasUpdate ? "Agent 信息已更新并保存到工作台。" : "你的 Agent 已生成并保存到工作台。",
          );
        }
      } else {
        setErrors([saved.error ?? `保存 Agent 失败 (HTTP ${saveRes.status})`, ...buildWarnings]);
      }
    } catch (err) {
      setErrors([`Network error: ${String(err)}`]);
    } finally {
      setIsGenerating(false);
    }
  };

  const openMentorFromPlaza = (mentor: MentorSummary) => {
    setActiveMentorId(mentor.id);
    setActiveId(mentor.id);
    setActiveSection("match");
  };

  return (
    <main className={activeSection === "profile" ? "workbench workbench--legacy workbench--profile" : "workbench workbench--legacy"}>
      <aside className="workbench-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={item.id === activeSection ? "workbench-nav__card is-active" : "workbench-nav__card"}
            type="button"
            onClick={() => setActiveSection(item.id)}
          >
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </button>
        ))}
      </aside>

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
                className={mentor.id === activeMentorId ? "plaza-card is-active" : "plaza-card"}
                onClick={() => openMentorFromPlaza(mentor)}
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
        <section className="workbench-chat workbench-profile">
          <header className="workbench-chat__profile">
            <div>
              <h2>个人档案与 Agent 创建</h2>
              <p>实时查看 AI 提取结果，并在这里继续编辑</p>
            </div>
            <span className="workbench-chat__tag">PROFILE</span>
          </header>

          <div className="workbench-profile__content">
            {hasAgent ? (
              <section className="profile-section profile-agent-card">
                <div className="profile-section__head">
                  <div>
                    <h3>当前 Agent</h3>
                    <p className="wb-muted">每位用户拥有一个主 Agent，可在下方编辑后点击「更新」。</p>
                  </div>
                  <button
                    type="button"
                    className="wb-inline-button"
                    onClick={async () => {
                      if (!window.confirm("确定删除当前 Agent 吗？将清除已保存的档案与社交画像。")) return;
                      try {
                        await Promise.all([
                          fetch("/api/profile/agent", { method: "DELETE", credentials: "same-origin" }),
                          fetch("/api/profile/me", { method: "DELETE", credentials: "same-origin" }),
                        ]);
                      } catch {}
                      setBuiltProfile(null);
                      setAgentProfile(null);
                      setHasAgent(false);
                      setSuccessMessage(null);
                    }}
                  >
                    删除 Agent
                  </button>
                </div>

                <div className="profile-summary-grid">
                  <div className="profile-summary-card">
                    <span>名称</span>
                    <strong>{[school, major].filter(Boolean).join(" · ") || "我的 Agent"}</strong>
                  </div>
                  <div className="profile-summary-card">
                    <span>核心目标</span>
                    <strong>{goalLabels[goal] ?? goal ?? "—"}</strong>
                  </div>
                  <div className="profile-summary-card">
                    <span>GPA</span>
                    <strong>{gpa || "—"}</strong>
                  </div>
                  <div className="profile-summary-card">
                    <span>外部来源</span>
                    <strong>{platformCount > 0 ? `${platformCount} 个已连接` : "未连接"}</strong>
                  </div>
                  <div className="profile-summary-card">
                    <span>社交画像</span>
                    <strong>{builtProfile ? "已生成" : "未生成"}</strong>
                  </div>
                  {agentProfile?.updatedAt ? (
                    <div className="profile-summary-card">
                      <span>最近更新</span>
                      <strong>{new Date(agentProfile.updatedAt).toLocaleString("zh-CN")}</strong>
                    </div>
                  ) : null}
                </div>
                <div className="profile-action-row">
                  <button type="button" className="wb-inline-button" onClick={() => setProfileEditorMode("rebuild")}>
                    重建 Agent
                  </button>
                  <button type="button" className="wb-inline-button" onClick={() => setProfileEditorMode("enrich")}>
                    新增资料
                  </button>
                </div>
                {(isRebuildMode || isEnrichMode) ? (
                  <p className="profile-mode-hint">
                    {isRebuildMode
                      ? "当前是重建模式，提交后会删除旧 Agent 并用当前信息重建。"
                      : "当前是新增资料模式，新的社媒和资料会补充到现有 Agent。"}
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="profile-section">
              <div className="profile-section__head">
                <div>
                  <h3>社交画像预览</h3>
                  <p className="wb-muted">这里会同步 AI 从外部账号提取出的主 profile。</p>
                </div>
                {builtProfile ? (
                  <button
                    type="button"
                    className="wb-inline-button"
                    onClick={async () => {
                      try {
                        await fetch("/api/profile/me", { method: "DELETE", credentials: "same-origin" });
                      } catch {}
                      setBuiltProfile(null);
                      setProfileInsights(null);
                      setInsightsState("idle");
                    }}
                  >
                    清除画像
                  </button>
                ) : null}
              </div>

              {builtProfile ? (
                <>
                  <div className="profile-summary-grid">
                    {builtProfileStatCards.map((item) => (
                      <div key={item.label} className="profile-summary-card">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                  {insightsState === "loading" ? (
                    <p className="workbench-chat__empty">AI 正在整理这个用户的性格喜好与表达方式…</p>
                  ) : profileInsights ? (
                    <div className="profile-insights-grid">
                      <article className="profile-insight-card profile-insight-card--hero">
                        <span className="profile-insight-badge">{profileInsights.source === "ai" ? "AI 解读" : "画像归纳"}</span>
                        <h4>{profileInsights.headline}</h4>
                        <p>{profileInsights.summary}</p>
                      </article>
                      <article className="profile-insight-card">
                        <h4>性格气质</h4>
                        <div className="profile-chip-row">
                          {profileInsights.personality.map((item) => (
                            <span key={item} className="profile-chip">{item}</span>
                          ))}
                        </div>
                      </article>
                      <article className="profile-insight-card">
                        <h4>兴趣偏好</h4>
                        <div className="profile-chip-row">
                          {profileInsights.interests.map((item) => (
                            <span key={item} className="profile-chip">{item}</span>
                          ))}
                        </div>
                      </article>
                      <article className="profile-insight-card">
                        <h4>近期动机</h4>
                        <div className="profile-chip-row">
                          {profileInsights.motivations.map((item) => (
                            <span key={item} className="profile-chip">{item}</span>
                          ))}
                        </div>
                      </article>
                      <article className="profile-insight-card">
                        <h4>表达方式</h4>
                        <div className="profile-chip-row">
                          {profileInsights.communicationStyle.map((item) => (
                            <span key={item} className="profile-chip">{item}</span>
                          ))}
                        </div>
                      </article>
                      <article className="profile-insight-card">
                        <h4>可能优势</h4>
                        <div className="profile-chip-row">
                          {profileInsights.strengths.map((item) => (
                            <span key={item} className="profile-chip">{item}</span>
                          ))}
                        </div>
                      </article>
                      <article className="profile-insight-card">
                        <h4>适合继续补充的话题</h4>
                        <div className="profile-chip-row">
                          {profileInsights.suggestedTopics.map((item) => (
                            <span key={item} className="profile-chip">{item}</span>
                          ))}
                        </div>
                      </article>
                      <article className="profile-insight-card">
                        <h4>谨慎说明</h4>
                        <p>{profileInsights.caution}</p>
                      </article>
                    </div>
                  ) : null}
                  <details className="profile-raw-toggle">
                    <summary>查看原始结构化数据</summary>
                    <pre className="wb-json-preview">{JSON.stringify(builtProfile, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <p className="workbench-chat__empty">
                  {hasAgent
                    ? "当前 Agent 暂无社交画像。连接外部账号后点击「更新」即可生成。"
                    : "还没有可展示的画像结果。填写下方信息后即可生成。"}
                </p>
              )}
            </section>

            <section className="profile-section">
              <h3>简历录入区</h3>
              <div className="profile-upload" onDragOver={(e) => e.preventDefault()} onDrop={handleResumeDrop}>
                <label className="profile-upload__button" htmlFor="resume-upload">PDF 文件上传</label>
                <input id="resume-upload" type="file" accept=".pdf" onChange={(e) => handleResumeFile(e.target.files?.[0] ?? null)} />
                <p>支持拖拽上传，或点击按钮选择文件</p>
              </div>
              {resumeFileName ? (
                <div className="profile-file">
                  <span>{resumeFileName}</span>
                  <button type="button" onClick={() => setResumeFileName(null)}>删除</button>
                </div>
              ) : null}
              <textarea className="profile-textarea" placeholder="或粘贴简历文本内容" value={resumeText} onChange={(e) => setResumeText(e.target.value)} />
            </section>

            <section className="profile-section">
              <h3>标准化信息确认</h3>
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
                  <h3>外部画像来源</h3>
                  <p className="wb-muted">已连接 {platformCount} 个来源</p>
                </div>
              </div>
              <div className="profile-grid">
                <label className="profile-field">GitHub 用户名<input value={githubUser} onChange={(e) => setGithubUser(e.target.value)} placeholder="例如：torvalds" /></label>
                <label className="profile-field">小红书主页链接<input value={xhsId} onChange={(e) => setXhsId(e.target.value)} placeholder="粘贴含 xsec_token 的主页分享链接（App 里点「分享·复制链接」）" /></label>
                <label className="profile-field">LinkedIn URL<input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." /></label>
                <label className="profile-field">知乎 ID 或 URL<input value={zhihuId} onChange={(e) => setZhihuId(e.target.value)} placeholder="https://zhihu.com/people/..." /></label>
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
              <h3>Agent 对话定位输入区</h3>
              <textarea
                className="profile-textarea profile-textarea--large"
                placeholder="你想让 Agent 帮你问什么？例如：帮我了解保研面试的重点..."
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

          <footer className="profile-footer">
            <button
              className="profile-submit"
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? "处理中…" : currentSubmitLabel}
            </button>
          </footer>
        </section>
      ) : (
        <>
          <section className="workbench-list">
            <div className="workbench-list__header">
              <h3>Agent / 联系人</h3>
              <p>点击切换当前协作对象</p>
            </div>
            <div className="workbench-list__items">
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  className={contact.id === activeId ? "workbench-list__item is-active" : "workbench-list__item"}
                  type="button"
                  onClick={() => {
                    setActiveId(contact.id);
                    if (!contact.isUserAgent) setActiveMentorId(contact.id);
                  }}
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
                <p>{activeContact.isUserAgent ? "查看自己的主画像和当前匹配状态" : activeContact.meta}</p>
              </div>
              <span className="workbench-chat__tag">{activeSection === "match" ? "ACTIVE" : "SUMMARY"}</span>
            </header>

            <div className="workbench-chat__messages">
              {activeContact.isUserAgent ? (
                <div className="workbench-chat__empty-panel">
                  <p className="workbench-chat__empty">
                    这里展示你自己的 Agent 视角。先在左侧档案区完善信息，再从联系人里切到具体学长开始协作。
                  </p>
                  <div className="profile-summary-grid">
                    <div className="profile-summary-card">
                      <span>学校</span>
                      <strong>{school || "待补充"}</strong>
                    </div>
                    <div className="profile-summary-card">
                      <span>专业</span>
                      <strong>{major || "待补充"}</strong>
                    </div>
                    <div className="profile-summary-card">
                      <span>目标</span>
                      <strong>{goalLabels[goal] ?? "待补充"}</strong>
                    </div>
                    <div className="profile-summary-card">
                      <span>画像完成度</span>
                      <strong>{profileReadiness}%</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {messages.length === 0 && !isChatLoading ? (
                    <p className="workbench-chat__empty">
                      向 {activeContact.name} 发起第一条提问，获取基于真实经历的个性化建议。
                    </p>
                  ) : null}
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.sender === "user"
                          ? "workbench-chat__message is-user"
                          : message.sender === "system"
                            ? "workbench-chat__message is-system"
                            : "workbench-chat__message"
                      }
                    >
                      <p>{message.content}</p>
                    </div>
                  ))}
                  {isChatLoading ? (
                    <div className="workbench-chat__message typing-indicator" aria-label="对方正在输入">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <footer className="workbench-chat__actions">
              {activeSection === "match" && !activeContact.isUserAgent ? (
                <>
                <div className="workbench-chat__composer-wrap">
                  <div className="workbench-chat__composer">
                  <input
                    type="text"
                    placeholder={isChatLoading ? "对方正在输入..." : "输入消息..."}
                    value={chatInput}
                    disabled={isChatLoading}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendMessage();
                    }}
                  />
                  <button type="button" disabled={isChatLoading} onClick={handleSendMessage}>
                    {isChatLoading ? "等待中" : "发送"}
                  </button>
                  </div>
                  {activeChatProgress.label ? <p className="workbench-chat__status">{activeChatProgress.label}</p> : null}
                </div>
                {chatSessionIds[activeContact.id] ? (
                  <Link className="workbench-chat__summary" href={`/a2a/${chatSessionIds[activeContact.id]}`}>
                    查看完整 A2A
                  </Link>
                ) : null}
                </>
              ) : (
                <button
                  className="workbench-chat__summary"
                  type="button"
                  onClick={() => {
                    if (activeContact.isUserAgent) {
                      setActiveSection("profile");
                    }
                  }}
                >
                  {activeContact.isUserAgent ? "回到档案编辑" : "一键总结"}
                </button>
              )}
              <button
                className="workbench-chat__fab"
                type="button"
                aria-label="新建对话"
                onClick={() => setActiveSection("plaza")}
              >
                +
              </button>
            </footer>
          </section>
        </>
      )}

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
