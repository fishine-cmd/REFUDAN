import { createHash } from "node:crypto";
import type {
  A2AAssessment,
  A2AAutoplayState,
  A2AProvider,
  A2ASlot,
  A2ATurn,
  HandoffStatus,
  PrivacyLevel,
} from "@re-fudan/contracts";
import {
  buildA2AIntentHash,
  buildAssessmentFromTurns,
  buildAutoplayQuestion,
  deriveCoveredSlots,
  mergeBaseScoreWithAssessment,
  planNextAutoplaySlot,
  shouldStopAutoplay,
  type A2AIntentInput,
} from "./a2a-orchestrator";
import { buildAgentSnapshot } from "./agent-snapshot";
import type { ChatMessage, ChatMeta } from "./chat-redis";
import { findUserById, type UserRow } from "./users-redis";
import {
  appendAssistantMessage,
  appendTraceEvent,
  appendUserMessage,
  createChat,
  getA2AAssessment,
  getA2ASessionDetail,
  getChatMessages,
  getChatMeta,
  getHandoffDetail,
  listA2AAssessmentsForIntent,
  listJuniorChats,
  setA2AAssessment,
  setChatMeta,
  setHandoffBrief,
} from "./chat-redis";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = (
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
).replace(/\/+$/, "").replace(/\/v1$/, "");

const DEFAULT_AUTOPLAY_MAX_ROUNDS = 7;

interface Persona {
  name: string;
  background: string;
  expertise: string;
}

interface SeniorEvidence {
  context: string;
  citations: string[];
}

interface CounterpartyContext {
  context: string;
  citations: string[];
}

interface HandoffDetailView {
  status: HandoffStatus;
  updatedAt: number;
  note: string;
  brief: string;
  referralPrepared: boolean;
  referralPreparedAt: number;
  referralPreparedBy: string;
  connectionCompleted: boolean;
  connectionCompletedAt: number;
  connectionCompletedBy: string;
}

export interface A2AReplyResult {
  sessionId: string;
  reply: string;
  provider: A2AProvider;
  handoffStatus: HandoffStatus;
  summary: string;
  citations: string[];
  traceRefs: string[];
  brief: string;
  autoplayState: A2AAutoplayState;
  assessment: A2AAssessment | null;
}

export interface A2ASessionViewer {
  sessionId: string;
  juniorId: string;
  seniorId: string;
  status: string;
  provider: A2AProvider;
  privacyLevel: PrivacyLevel;
  handoffStatus: HandoffStatus;
  handoff: HandoffDetailView;
  summary: string;
  turns: A2ATurn[];
  trace: Array<{ id: string; stage: string; actor: string; payload: string; ts: number }>;
  createdAt: number;
  lastMessageAt: number;
  originSurface: string;
  intentHash: string;
  autoplayState: A2AAutoplayState;
  assessment: A2AAssessment | null;
}

export interface CreateOrContinueA2ASessionInput {
  juniorId: string;
  seniorId: string;
  question: string;
  sessionId?: string;
  privacyLevel?: PrivacyLevel;
  source?: "manual" | "autoplay";
  slot?: A2ASlot;
  origin?: "matching" | "launchpad" | "legacy";
  intent?: A2AIntentInput;
  autoplay?: boolean;
  autoplayMaxRounds?: number;
}

export interface A2AAutoplayAdvanceResult {
  sessionId: string;
  done: boolean;
  round: number;
  coveredSlots: A2ASlot[];
  autoplayState: A2AAutoplayState;
  latestAssessment: A2AAssessment | null;
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function clip(value: string, max: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function sha1(input: string) {
  return createHash("sha1").update(input).digest("hex");
}

function buildIntentDigest(question: string): string {
  return `intent-${sha1(question).slice(0, 8)}`;
}

function buildSummary(question: string, reply: string) {
  return `问题: ${clip(question, 28)} | 回应: ${clip(reply, 44)}`;
}

function buildHandoffBrief(question: string, reply: string, citations: string[]) {
  const citeText =
    citations.length > 0
      ? `主要依据：${citations.slice(0, 3).join("；")}`
      : "主要依据：学长公开 persona 与已授权资料。";
  return `本轮聚焦“${clip(question, 30)}”，当前建议结论为“${clip(reply, 72)}”。${citeText}`;
}

function buildSnapshotFromRow(user: UserRow) {
  return buildAgentSnapshot({
    displayName: user.display_name,
    bio: user.bio,
    title: user.title,
    highlight: user.highlight,
    avatar: user.avatar,
    tagsJson: user.tags_json,
    personaJson: user.persona_json,
    detailedProfileJson: user.detailed_profile_json,
    builtProfileJson: user.built_profile_json,
    agentProfileJson: user.agent_profile_json,
  });
}

function collectSeniorEvidence(senior: UserRow): SeniorEvidence {
  const snapshot = buildSnapshotFromRow(senior);
  const snippets = unique([
    snapshot.school || snapshot.major || snapshot.goal
      ? `Agent 档案: ${[snapshot.school, snapshot.major, snapshot.goal].filter(Boolean).join(" / ")}`
      : "",
    snapshot.personaBackground ? `Agent 背景: ${snapshot.personaBackground}` : "",
    snapshot.personaExpertise ? `Agent 专长: ${snapshot.personaExpertise}` : "",
    snapshot.skills.length > 0 ? `核心技能: ${snapshot.skills.slice(0, 4).join(" / ")}` : "",
    snapshot.topics.length > 0 ? `内容主题: ${snapshot.topics.slice(0, 4).join(" / ")}` : "",
    snapshot.interests.length > 0 ? `兴趣偏好: ${snapshot.interests.slice(0, 4).join(" / ")}` : "",
    snapshot.styleCues.length > 0 ? `表达风格: ${snapshot.styleCues.slice(0, 3).join(" / ")}` : "",
    snapshot.knowledgeTitles.length > 0 ? `知识条目: ${snapshot.knowledgeTitles.slice(0, 3).join(" / ")}` : "",
    snapshot.promptText ? `自定义设定: ${clip(snapshot.promptText, 120)}` : "",
    senior.bio ? `公开简介: ${senior.bio}` : "",
    senior.title ? `公开头衔: ${senior.title}` : "",
  ]);

  const citations = unique(snippets).slice(0, 6);
  return {
    context: citations.map((item) => `- ${item}`).join("\n"),
    citations,
  };
}

function buildPersona(senior: UserRow): Persona {
  const snapshot = buildSnapshotFromRow(senior);
  return {
    name: snapshot.displayName || senior.display_name || senior.username,
    background: snapshot.personaBackground || senior.bio || "复旦学长 / 学姐",
    expertise: snapshot.personaExpertise || senior.title || "学业、保研、实习与申请经验",
  };
}

function buildCounterpartyContext(junior: UserRow): CounterpartyContext {
  const snapshot = buildSnapshotFromRow(junior);
  const lines = unique([
    snapshot.displayName ? `对方 Agent: ${snapshot.displayName}` : "",
    snapshot.school || snapshot.major || snapshot.goal
      ? `对方档案: ${[snapshot.school, snapshot.major, snapshot.goal].filter(Boolean).join(" / ")}`
      : "",
    snapshot.skills.length > 0 ? `对方能力: ${snapshot.skills.slice(0, 4).join(" / ")}` : "",
    snapshot.interests.length > 0 ? `对方兴趣: ${snapshot.interests.slice(0, 4).join(" / ")}` : "",
    snapshot.topics.length > 0 ? `对方内容主题: ${snapshot.topics.slice(0, 4).join(" / ")}` : "",
    snapshot.promptText ? `对方自定义设定: ${clip(snapshot.promptText, 120)}` : "",
    junior.bio ? `对方公开简介: ${junior.bio}` : "",
  ]).slice(0, 6);
  return {
    context: lines.map((item) => `- ${item}`).join("\n"),
    citations: lines,
  };
}

function buildSystemPrompt(
  persona: Persona,
  evidenceContext: string,
  counterpartyContext: string,
  ownerPromptText: string,
) {
  return [
    `你是 ${persona.name} 的 senior-side Agent，需要代表这位学长 / 学姐与对方 junior Agent 进行 A2A 预沟通。`,
    `背景信息: ${persona.background}`,
    `擅长方向: ${persona.expertise}`,
    ownerPromptText ? `主人补充设定: ${ownerPromptText}` : "",
    "",
    "回答要求:",
    "1. 使用中文，语气真诚、专业，像真人学长 / 学姐的分身在沟通。",
    "2. 只基于已提供的 Agent 档案、社交画像、历史对话与证据回答；不确定时明确说明需要本人确认。",
    "3. 充分考虑对方 junior Agent 的目标、专业背景和兴趣，再给出个性化回应。",
    "4. 先回应最关键的问题，再给 1 到 3 条可执行建议。",
    "5. 不编造联系方式、具体承诺，不能越过真人 handoff 边界。",
    "6. 单次回复尽量控制在 220 字左右，必要时可以分点。",
    "",
    counterpartyContext ? `对方 Agent 画像:\n${counterpartyContext}` : "对方 Agent 画像: 当前仅有基础信息。",
    evidenceContext ? `可引用资料:\n${evidenceContext}` : "可引用资料: 当前只有公开 persona 与基础信息。",
  ].join("\n");
}

function buildConversationMessages(
  systemPrompt: string,
  history: ChatMessage[],
  question: string,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const recentTurns = history
    .filter((item) => item.content.trim().length > 0)
    .slice(-8)
    .map((item) => ({
      role: item.role,
      content: item.content,
    }));

  return [{ role: "system", content: systemPrompt }, ...recentTurns, { role: "user", content: question }];
}

function buildFallbackReply(input: {
  question: string;
  persona: Persona;
  evidence: SeniorEvidence;
}) {
  const evidenceLine = input.evidence.citations.slice(0, 2).join("；");
  return [
    `我先基于 ${input.persona.name} 当前公开资料给你一个保守判断。`,
    `围绕“${clip(input.question, 24)}”，这位学长更适合承接与 ${clip(input.persona.expertise, 24)} 相关的问题。`,
    evidenceLine ? `目前可确认的信息主要有：${clip(evidenceLine, 48)}。` : "",
    "如果你愿意，我建议你把问题再收窄到一个具体判断点，我这边可以继续完成下一轮 A2A。",
  ]
    .filter(Boolean)
    .join("");
}

async function callDeepseek(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("未配置 DEEPSEEK_API_KEY，请先在 apps/site/.env.local 中设置。");
  }

  const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.7,
      max_tokens: 800,
      messages,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API returned ${response.status}`);
  }

  const rawText = await response.text();
  if (!rawText.trim()) {
    throw new Error("DeepSeek API returned empty body");
  }

  let data: {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  try {
    data = JSON.parse(rawText) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
  } catch {
    throw new Error("DeepSeek API returned invalid JSON");
  }

  return data.choices?.[0]?.message?.content || "暂时没有生成可用回复，请稍后重试。";
}

function buildAutoplayState(meta: ChatMeta, turns: A2ATurn[]) {
  const coveredSlots =
    meta.autoplayState.coveredSlots.length > 0
      ? meta.autoplayState.coveredSlots
      : deriveCoveredSlots(turns);

  return {
    ...meta.autoplayState,
    coveredSlots,
  };
}

async function loadSessionBundle(sessionId: string) {
  const detail = await getA2ASessionDetail(sessionId);
  if (!detail) return null;
  return {
    detail,
    autoplayState: buildAutoplayState(detail, detail.turns),
    assessment: detail.assessment,
  };
}

async function buildAssessmentForSession(input: {
  juniorId: string;
  sessionId: string;
  intentHash: string;
  round: number;
  status: A2AAssessment["status"];
}) {
  const detail = await getA2ASessionDetail(input.sessionId);
  if (!detail) return null;
  const coveredSlots = deriveCoveredSlots(detail.turns);
  const assessment = buildAssessmentFromTurns({
    sessionId: input.sessionId,
    intentHash: input.intentHash,
    turns: detail.turns,
    coveredSlots,
    round: input.round,
    status: input.status,
  });
  await setA2AAssessment(input.juniorId, input.sessionId, assessment);
  return { detail, coveredSlots, assessment };
}

async function generateSeniorReply(input: {
  sessionId: string;
  junior: UserRow;
  senior: UserRow;
  question: string;
  privacyLevel: PrivacyLevel;
  source: "manual" | "autoplay";
  slot?: A2ASlot;
}) {
  const history = await getChatMessages(input.sessionId);
  const persona = buildPersona(input.senior);
  const evidence = collectSeniorEvidence(input.senior);
  const counterparty = buildCounterpartyContext(input.junior);
  const seniorSnapshot = buildSnapshotFromRow(input.senior);
  const systemPrompt = buildSystemPrompt(
    persona,
    evidence.context,
    counterparty.context,
    seniorSnapshot.promptText,
  );
  const intentRef = buildIntentDigest(input.question);

  await appendUserMessage(input.sessionId, input.question, Date.now(), {
    privacyLevel: input.privacyLevel,
    source: input.source,
    slot: input.slot,
  });

  const intentTrace = await appendTraceEvent(input.sessionId, {
    stage: input.source === "autoplay" ? "autoplay_intent" : "intent",
    actor: "orchestrator",
    payload: `Question packet ${intentRef}: ${input.question}`,
  });

  const retrievalTrace = await appendTraceEvent(input.sessionId, {
    stage: "retrieval",
    actor: "provider",
    payload:
      evidence.citations.length > 0
        ? `Loaded ${evidence.citations.length} evidence snippets for ${input.senior.display_name || input.senior.username}: ${evidence.citations.slice(0, 3).join(" | ")}`
        : `Fallback to public persona for ${input.senior.display_name || input.senior.username}`,
  });

  await appendTraceEvent(input.sessionId, {
    stage: "counterparty_context",
    actor: "orchestrator",
    payload:
      counterparty.citations.length > 0
        ? `Loaded junior Agent context: ${counterparty.citations.slice(0, 3).join(" | ")}`
        : "No junior Agent context available; using the question alone.",
  });

  if (input.slot) {
    await appendTraceEvent(input.sessionId, {
      stage: "autoplay_slot",
      actor: "orchestrator",
      payload: `Autoplay probing slot: ${input.slot}`,
    });
  }

  let reply: string;
  let degraded = false;
  try {
    reply = await callDeepseek(buildConversationMessages(systemPrompt, history, input.question));
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    if (
      message === "fetch failed" ||
      message === "DeepSeek API returned empty body" ||
      message === "DeepSeek API returned invalid JSON" ||
      message.startsWith("DeepSeek API returned ")
    ) {
      degraded = true;
      reply = buildFallbackReply({
        question: input.question,
        persona,
        evidence,
      });
      await appendTraceEvent(input.sessionId, {
        stage: "fallback",
        actor: "system",
        payload: `Provider unavailable, fallback reply used: ${message}`,
      });
    } else {
      throw error;
    }
  }
  const summary = buildSummary(input.question, reply);
  const brief = buildHandoffBrief(input.question, reply, evidence.citations);

  const summaryTrace = await appendTraceEvent(input.sessionId, {
    stage: "summary",
    actor: "system",
    payload: brief,
  });

  await setHandoffBrief(input.sessionId, brief);
  await appendAssistantMessage(input.sessionId, reply, summary, Date.now(), {
    citations: evidence.citations,
    traceRefs: [intentTrace.id, retrievalTrace.id, summaryTrace.id],
    privacyLevel: input.privacyLevel,
    source: input.source,
    slot: input.slot,
  });

  await setChatMeta(input.sessionId, {
    provider: "local_persona",
    status: degraded ? "running" : "handoff_ready",
    handoffStatus: "pending",
    privacyLevel: input.privacyLevel,
    summary,
  });

  return {
    reply,
    summary,
    brief,
    citations: evidence.citations,
    traceRefs: [intentTrace.id, retrievalTrace.id, summaryTrace.id],
    degraded,
  };
}

async function getSessionIntent(meta: ChatMeta, sessionId: string): Promise<A2AIntentInput> {
  const messages = await getChatMessages(sessionId);
  const firstManualQuestion =
    messages.find((message) => message.role === "user" && message.source !== "autoplay")?.content ?? "";
  return {
    question: firstManualQuestion,
    direction: meta.summary,
  };
}

export async function createOrContinueA2ASession(
  input: CreateOrContinueA2ASessionInput,
): Promise<A2AReplyResult> {
  const junior = await findUserById(input.juniorId);
  if (!junior || junior.role !== "junior") {
    throw new Error("junior not found");
  }
  const senior = await findUserById(input.seniorId);
  if (!senior || senior.role !== "senior") {
    throw new Error("senior not found");
  }

  let sessionId = input.sessionId;
  let privacyLevel = input.privacyLevel ?? "handshake";
  let meta: ChatMeta | null = null;
  const intentHash = buildA2AIntentHash(input.intent ?? { question: input.question });

  if (!sessionId) {
    sessionId = await createChat(input.juniorId, senior.id, {
      provider: "local_persona",
      privacyLevel,
      status: "running",
      handoffStatus: "pending",
      summary: "",
      originSurface: input.origin ?? "legacy",
      intentHash,
      autoplayState: input.autoplay
        ? {
            enabled: true,
            status: "running",
            round: 1,
            maxRounds: input.autoplayMaxRounds ?? DEFAULT_AUTOPLAY_MAX_ROUNDS,
            coveredSlots: [],
            done: false,
          }
        : {
            enabled: false,
            status: "idle",
            round: 0,
            maxRounds: 0,
            coveredSlots: [],
            done: false,
          },
    });
  } else {
    meta = await getChatMeta(sessionId);
    if (!meta || meta.juniorId !== input.juniorId || meta.seniorId !== senior.id) {
      throw new Error("session not found");
    }
    privacyLevel = input.privacyLevel ?? meta.privacyLevel;
  }

  const turnResult = await generateSeniorReply({
    sessionId,
    junior,
    senior,
    question: input.question,
    privacyLevel,
    source: input.source ?? "manual",
    slot: input.slot,
  });

  const currentMeta = meta ?? (await getChatMeta(sessionId));
  if (!currentMeta) {
    throw new Error("session not found");
  }

  let autoplayState = currentMeta.autoplayState;
  let assessment = await getA2AAssessment(sessionId);

  if (currentMeta.autoplayState.enabled) {
    const nextRound = Math.max(1, currentMeta.autoplayState.round);
    const assessmentResult = await buildAssessmentForSession({
      juniorId: input.juniorId,
      sessionId,
      intentHash: currentMeta.intentHash || intentHash,
      round: nextRound,
      status: "running",
    });
    assessment = assessmentResult?.assessment ?? null;
    autoplayState = {
      ...currentMeta.autoplayState,
      round: nextRound,
      coveredSlots: assessment?.coveredSlots ?? [],
      done: false,
      status: "running",
    };
    await setChatMeta(sessionId, {
      autoplayState,
      intentHash: currentMeta.intentHash || intentHash,
    });
  }

  return {
    sessionId,
    reply: turnResult.reply,
    provider: "local_persona",
    handoffStatus: "pending",
    summary: turnResult.summary,
    citations: turnResult.citations,
    traceRefs: turnResult.traceRefs,
    brief: turnResult.brief,
    autoplayState,
    assessment,
  };
}

export async function advanceA2AAutoplaySession(input: {
  juniorId: string;
  sessionId: string;
}): Promise<A2AAutoplayAdvanceResult> {
  const meta = await getChatMeta(input.sessionId);
  if (!meta || meta.juniorId !== input.juniorId) {
    throw new Error("session not found");
  }
  if (!meta.autoplayState.enabled) {
    throw new Error("autoplay not enabled");
  }

  const currentBundle = await loadSessionBundle(input.sessionId);
  if (!currentBundle) {
    throw new Error("session not found");
  }

  if (currentBundle.autoplayState.done || currentBundle.autoplayState.status === "completed") {
    return {
      sessionId: input.sessionId,
      done: true,
      round: currentBundle.autoplayState.round,
      coveredSlots: currentBundle.autoplayState.coveredSlots,
      autoplayState: currentBundle.autoplayState,
      latestAssessment: currentBundle.assessment,
    };
  }

  const intent = await getSessionIntent(meta, input.sessionId);
  const nextSlot = planNextAutoplaySlot({
    intent,
    coveredSlots: currentBundle.autoplayState.coveredSlots,
  });

  if (!nextSlot) {
    const finalAssessment =
      (await buildAssessmentForSession({
        juniorId: input.juniorId,
        sessionId: input.sessionId,
        intentHash: meta.intentHash,
        round: currentBundle.autoplayState.round,
        status: "completed",
      }))?.assessment ?? currentBundle.assessment;

    const completedState: A2AAutoplayState = {
      ...currentBundle.autoplayState,
      status: "completed",
      done: true,
      currentSlot: undefined,
      coveredSlots: finalAssessment?.coveredSlots ?? currentBundle.autoplayState.coveredSlots,
    };
    await setChatMeta(input.sessionId, { autoplayState: completedState });
    return {
      sessionId: input.sessionId,
      done: true,
      round: completedState.round,
      coveredSlots: completedState.coveredSlots,
      autoplayState: completedState,
      latestAssessment: finalAssessment,
    };
  }

  const senior = await findUserById(meta.seniorId);
  if (!senior || senior.role !== "senior") {
    throw new Error("senior not found");
  }
  const junior = await findUserById(meta.juniorId);
  if (!junior || junior.role !== "junior") {
    throw new Error("junior not found");
  }

  const inFlightState: A2AAutoplayState = {
    ...currentBundle.autoplayState,
    status: "running",
    currentSlot: nextSlot,
  };
  await setChatMeta(input.sessionId, { autoplayState: inFlightState });

  try {
    await generateSeniorReply({
      sessionId: input.sessionId,
      junior,
      senior,
      question: buildAutoplayQuestion({ intent, nextSlot }),
      privacyLevel: meta.privacyLevel,
      source: "autoplay",
      slot: nextSlot,
    });

    const round = currentBundle.autoplayState.round + 1;
    const assessmentResult = await buildAssessmentForSession({
      juniorId: input.juniorId,
      sessionId: input.sessionId,
      intentHash: meta.intentHash,
      round,
      status: "running",
    });

    const latestAssessment = assessmentResult?.assessment ?? null;
    const coveredSlots = latestAssessment?.coveredSlots ?? deriveCoveredSlots(assessmentResult?.detail.turns ?? []);
    const done =
      latestAssessment != null
        ? shouldStopAutoplay({
            round,
            maxRounds: meta.autoplayState.maxRounds || DEFAULT_AUTOPLAY_MAX_ROUNDS,
            coveredSlots,
            assessment: latestAssessment,
          })
        : round >= (meta.autoplayState.maxRounds || DEFAULT_AUTOPLAY_MAX_ROUNDS);

    if (done && latestAssessment) {
      latestAssessment.status = "completed";
      latestAssessment.updatedAt = Date.now();
      await setA2AAssessment(input.juniorId, input.sessionId, latestAssessment);
    }

    const autoplayState: A2AAutoplayState = {
      enabled: true,
      status: done ? "completed" : "running",
      round,
      maxRounds: meta.autoplayState.maxRounds || DEFAULT_AUTOPLAY_MAX_ROUNDS,
      coveredSlots,
      currentSlot: done ? undefined : nextSlot,
      done,
    };

    await setChatMeta(input.sessionId, { autoplayState });

    return {
      sessionId: input.sessionId,
      done,
      round,
      coveredSlots,
      autoplayState,
      latestAssessment,
    };
  } catch (error) {
    const degradedAssessment =
      (await buildAssessmentForSession({
        juniorId: input.juniorId,
        sessionId: input.sessionId,
        intentHash: meta.intentHash,
        round: currentBundle.autoplayState.round,
        status: "degraded",
      }))?.assessment ?? currentBundle.assessment;

    const autoplayState: A2AAutoplayState = {
      ...currentBundle.autoplayState,
      status: "degraded",
      done: true,
      currentSlot: undefined,
      lastError: error instanceof Error ? error.message : "autoplay failed",
    };
    await setChatMeta(input.sessionId, { autoplayState });

    return {
      sessionId: input.sessionId,
      done: true,
      round: autoplayState.round,
      coveredSlots: degradedAssessment?.coveredSlots ?? currentBundle.autoplayState.coveredSlots,
      autoplayState,
      latestAssessment: degradedAssessment,
    };
  }
}

export async function runA2AAutoplayToCompletion(input: {
  juniorId: string;
  sessionId: string;
  maxSteps?: number;
}): Promise<A2AAutoplayAdvanceResult | null> {
  const meta = await getChatMeta(input.sessionId);
  if (!meta || meta.juniorId !== input.juniorId) {
    throw new Error("session not found");
  }
  if (!meta.autoplayState.enabled) {
    return null;
  }

  const initialBundle = await loadSessionBundle(input.sessionId);
  if (!initialBundle) {
    throw new Error("session not found");
  }

  if (initialBundle.autoplayState.done || initialBundle.autoplayState.status === "completed") {
    return {
      sessionId: input.sessionId,
      done: true,
      round: initialBundle.autoplayState.round,
      coveredSlots: initialBundle.autoplayState.coveredSlots,
      autoplayState: initialBundle.autoplayState,
      latestAssessment: initialBundle.assessment,
    };
  }

  const safetyLimit =
    input.maxSteps ?? Math.max(1, meta.autoplayState.maxRounds || DEFAULT_AUTOPLAY_MAX_ROUNDS);

  let latest: A2AAutoplayAdvanceResult | null = null;
  for (let step = 0; step < safetyLimit; step += 1) {
    latest = await advanceA2AAutoplaySession({
      juniorId: input.juniorId,
      sessionId: input.sessionId,
    });
    if (latest.done) {
      return latest;
    }
  }

  return latest;
}

export async function getA2ASessionForViewer(sessionId: string): Promise<A2ASessionViewer | null> {
  const detail = await getA2ASessionDetail(sessionId);
  if (!detail) return null;

  const handoff = await getHandoffDetail(sessionId);
  return {
    sessionId: detail.chatId,
    juniorId: detail.juniorId,
    seniorId: detail.seniorId,
    status: detail.status,
    provider: detail.provider,
    privacyLevel: detail.privacyLevel,
    handoffStatus: detail.handoffStatus,
    handoff,
    summary: detail.summary,
    turns: detail.turns,
    trace: detail.trace,
    createdAt: detail.createdAt,
    lastMessageAt: detail.lastMessageAt,
    originSurface: detail.originSurface,
    intentHash: detail.intentHash,
    autoplayState: buildAutoplayState(detail, detail.turns),
    assessment: detail.assessment,
  };
}

export async function listIntentAssessmentsBySenior(input: {
  juniorId: string;
  intent: A2AIntentInput;
}) {
  const intentHash = buildA2AIntentHash(input.intent);
  const assessments = await listA2AAssessmentsForIntent(input.juniorId, intentHash);
  const chats = await listJuniorChats(input.juniorId);
  const chatMap = new Map(chats.map((chat) => [chat.chatId, chat]));
  const bySenior = new Map<string, A2AAssessment>();

  for (const assessment of assessments) {
    const chat = chatMap.get(assessment.sessionId);
    if (!chat) continue;
    const existing = bySenior.get(chat.seniorId);
    if (!existing || existing.updatedAt < assessment.updatedAt) {
      bySenior.set(chat.seniorId, assessment);
    }
  }

  return { intentHash, bySenior };
}

export { mergeBaseScoreWithAssessment };
