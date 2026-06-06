// POST /api/chat — 学弟向某学长发问。
// Body: { seniorId, question, chatId? }
// 1) requireRole("junior")    2) 校验 senior 存在
// 3) 新对话则 createChat,老对话则校验 owner   4) 写 user msg
// 5) 组 system prompt(persona + builtProfile 提示)+ 调 DeepSeek
// 6) 写 assistant msg(同步更新 inbox + 学长未读)
// 7) 返回 { chatId, reply }
//
// Phase 3a 的 persona 推导帮助器保留(derive*/extract* From BuiltProfile)。
// 同时提供向后兼容 shim:旧的 { mentorId, messages, builtProfile } 入参 → 映射成新形状。
// 该 shim 将在 Task 26 / Phase 5.4 cleanup 时一并删除。
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { findUserById, type UserRow } from "@/lib/users-redis";
import {
  createChat,
  getChatMeta,
  getChatMessages,
  appendUserMessage,
  appendAssistantMessage,
} from "@/lib/chat-redis";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
// Base URL must NOT include /v1 — the route appends it. This matches the
// convention used by services/profile-extraction/llm_client.py so a single
// .env.local DEEPSEEK_BASE_URL works for both backends.
const DEEPSEEK_BASE_URL = (
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
).replace(/\/+$/, "").replace(/\/v1$/, "");

interface Persona {
  name: string;
  background: string;
  expertise: string;
}

function buildSystemPrompt(persona: Persona, extraContext?: string): string {
  let prompt = `你是${persona.name}，${persona.background}
你的专长领域：${persona.expertise}

你正在通过 Agent 代理与一位学弟/学妹对话，他们可能在准备保研、实习、申请或科研。
请严格基于你的真实经历和知识来回答问题，给出具体、可操作的实用建议。

回复要求：
- 使用中文，亲切真诚的口吻
- 如果提问涉及你的亲身经历，请引用具体细节
- 如果提问超出你的经验范围，诚实说明并给出通用建议
- 控制在200字以内`;

  if (extraContext) {
    prompt += `\n\n【你的关键经历（请据此回复）】\n${extraContext}`;
  }

  return prompt;
}

function extractKeyExperiences(profile: Record<string, unknown>): string {
  const parts: string[] = [];

  if (profile.education) {
    const edu = profile.education as Record<string, unknown>;
    parts.push(`教育背景：${edu.school}，${edu.major || edu.grade}。${edu.certifications ? "证书：" + (Array.isArray(edu.certifications) ? edu.certifications.join("；") : edu.certifications) : ""}${edu.note ? "备注：" + edu.note : ""}`);
  }

  if (profile.career_domains) {
    const domains = profile.career_domains as Record<string, { label: string; experiences: string[] }>;
    for (const [, domain] of Object.entries(domains)) {
      if (domain.experiences?.length) {
        parts.push(`【${domain.label}】${domain.experiences.join("；")}`);
      }
    }
  }

  if (profile.key_experiences) {
    const exp = profile.key_experiences as { title: string; detail: string }[];
    parts.push("关键经历：" + exp.map((e) => `${e.title}：${e.detail}`).join("；"));
  }

  if (profile.skills && Array.isArray(profile.skills)) {
    parts.push("核心能力：" + (profile.skills as string[]).join("、"));
  }

  return parts.join("\n");
}

// ─── builtProfile → persona derivation (Phase 3a) ───────────────────
// Phase 1/2's extraction pipeline emits a JSON with sections basic_info /
// content_topics / inferred_signals / style_profile / audience_guess.
// Derive a Persona and a Chinese fact-sheet extraContext so the user's
// real platform data shapes every DeepSeek system prompt.

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function derivePersonaFromBuiltProfile(profile: Record<string, unknown>): Persona {
  const basic = (profile.basic_info ?? {}) as Record<string, unknown>;
  const inferred = (profile.inferred_signals ?? {}) as Record<string, unknown>;
  const topics = (profile.content_topics ?? []) as { topic?: string; confidence?: number }[];

  const displayName = (basic.display_name as string) || "我的 Agent";

  // background pieces
  const bgPieces: string[] = [];
  const edu = (inferred.education ?? {}) as Record<string, unknown>;
  const schools = asStringArray(edu.school);
  const majors = asStringArray(edu.major);
  const grades = asStringArray(edu.grade_level);
  const eduSummary = [schools[0], majors[0], grades[0]].filter(Boolean).join(" ");
  if (eduSummary) bgPieces.push(eduSummary);

  const platformProfiles = (basic.platform_profiles ?? {}) as Record<string, Record<string, unknown>>;
  const platformHandles: string[] = [];
  for (const [plat, info] of Object.entries(platformProfiles)) {
    if (plat === "github" && info.github_username) platformHandles.push(`GitHub @${info.github_username}`);
    if (plat === "xiaohongshu" && info.nickname) platformHandles.push(`小红书 @${info.nickname}`);
    if (plat === "zhihu" && info.nickname) platformHandles.push(`知乎 @${info.nickname}`);
    if (plat === "linkedin" && info.nickname) platformHandles.push(`LinkedIn ${info.nickname}`);
  }
  if (platformHandles.length) bgPieces.push(platformHandles.join(" / "));

  const topTopics = topics
    .filter((t) => typeof t.topic === "string" && (t.confidence ?? 0) >= 0.4)
    .slice(0, 2)
    .map((t) => t.topic as string);
  if (topTopics.length) bgPieces.push(`核心方向：${topTopics.join("、")}`);

  const background = bgPieces.length > 0 ? bgPieces.join("，") : "校园 AI 数字分身";

  // expertise: skills + content topics
  const skills = asStringArray(inferred.skills_inferred).slice(0, 5);
  const topicLabels = topics.slice(0, 3).map((t) => t.topic).filter((t): t is string => typeof t === "string");
  const expertisePieces: string[] = [];
  if (skills.length) expertisePieces.push(skills.join("、"));
  if (topicLabels.length) expertisePieces.push(topicLabels.join("、"));
  const expertise = expertisePieces.length > 0
    ? expertisePieces.join(" | ")
    : "校园经验与个人成长";

  return { name: displayName, background, expertise };
}

function extractKeyExperiencesFromBuiltProfile(profile: Record<string, unknown>): string {
  const parts: string[] = [];
  const basic = (profile.basic_info ?? {}) as Record<string, unknown>;
  const inferred = (profile.inferred_signals ?? {}) as Record<string, unknown>;
  const style = (profile.style_profile ?? {}) as Record<string, unknown>;
  const audience = (profile.audience_guess ?? {}) as Record<string, unknown>;

  const bio = basic.bio as string | undefined;
  if (bio && bio.trim()) parts.push(`Bio：${bio.trim().slice(0, 200)}`);

  const edu = (inferred.education ?? {}) as Record<string, unknown>;
  const schools = asStringArray(edu.school);
  const majors = asStringArray(edu.major);
  const grades = asStringArray(edu.grade_level);
  const certs = asStringArray(edu.certifications);
  if (schools.length || majors.length || grades.length || certs.length) {
    const segs: string[] = [];
    if (schools.length) segs.push(schools.join("、"));
    if (majors.length) segs.push(majors.join("、"));
    if (grades.length) segs.push(grades.join("、"));
    if (certs.length) segs.push(`证书：${certs.join("、")}`);
    parts.push(`教育背景：${segs.join("，")}`);
  }

  const domains = (inferred.career_domains ?? {}) as Record<string, { label?: string; experiences?: string[] }>;
  const domainEntries = Object.values(domains).filter((d) => d.label && (d.experiences?.length ?? 0) > 0);
  if (domainEntries.length) {
    const lines = domainEntries.slice(0, 3).map((d) => `${d.label}：${(d.experiences ?? []).slice(0, 2).join("；")}`);
    parts.push(`职业方向：${lines.join("；")}`);
  }

  const topics = (profile.content_topics ?? []) as { topic?: string; confidence?: number }[];
  const goodTopics = topics
    .filter((t) => typeof t.topic === "string" && (t.confidence ?? 0) >= 0.5)
    .slice(0, 8)
    .map((t) => `${t.topic}(${Math.round((t.confidence ?? 0) * 100)}%)`);
  if (goodTopics.length) parts.push(`关注话题：${goodTopics.join("、")}`);

  const skills = asStringArray(inferred.skills_inferred).slice(0, 8);
  if (skills.length) parts.push(`核心能力：${skills.join("、")}`);

  const interests = asStringArray(inferred.interests).slice(0, 8);
  if (interests.length) parts.push(`兴趣：${interests.join("、")}`);

  const tone = asStringArray(style.tone).slice(0, 5);
  const writingStyle = asStringArray(style.writing_style).slice(0, 5);
  const styleSeg: string[] = [];
  if (tone.length) styleSeg.push(`语气：${tone.join("、")}`);
  if (writingStyle.length) styleSeg.push(`风格：${writingStyle.join("、")}`);
  if (styleSeg.length) parts.push(`表达风格：${styleSeg.join("；")}`);

  const audienceDesc = audience.description as string | undefined;
  if (audienceDesc && audienceDesc.trim()) parts.push(`目标受众：${audienceDesc.trim().slice(0, 150)}`);

  return parts.join("\n").slice(0, 2000);
}

// ─── senior(UserRow) → system prompt ─────────────────────────────────
// 学长的 persona / detailed_profile / built_profile 都来自 Redis,在 seed 阶段
// 由 mentor JSON 写入。优先级:
//   1) persona_json 作为基础 persona(seed 自 mentor.persona)
//   2) detailed_profile_json 存在 → 复用 mentor JSON 的 extractKeyExperiences
//   3) 否则 built_profile_json 存在 → 复用 Phase 3a 的 derive*/extract* From BuiltProfile
//   4) 若 persona 缺失,用 displayName 兜底
function buildSystemPromptFromSenior(senior: UserRow): string {
  let persona: Persona | null = null;
  if (senior.persona_json) {
    try {
      const p = JSON.parse(senior.persona_json) as Partial<Persona>;
      if (p && p.name && p.background && p.expertise) {
        persona = { name: p.name, background: p.background, expertise: p.expertise };
      }
    } catch { /* ignore */ }
  }

  let extraContext: string | undefined;

  if (senior.detailed_profile_json) {
    try {
      const detailed = JSON.parse(senior.detailed_profile_json) as Record<string, unknown>;
      extraContext = extractKeyExperiences(detailed);
    } catch { /* ignore */ }
  }

  if (!extraContext && senior.built_profile_json) {
    try {
      const built = JSON.parse(senior.built_profile_json) as Record<string, unknown>;
      if (!persona) persona = derivePersonaFromBuiltProfile(built);
      extraContext = extractKeyExperiencesFromBuiltProfile(built);
    } catch { /* ignore */ }
  }

  if (!persona) {
    persona = {
      name: senior.display_name || senior.username,
      background: senior.bio ?? "复旦大学的学长/学姐",
      expertise: senior.title ?? "学业、保研、实习、申请等校园经验",
    };
  }

  return buildSystemPrompt(persona, extraContext);
}

// ─── DeepSeek call ──────────────────────────────────────────────────
// Non-streaming. Returns the assistant text or throws.
async function callDeepseek(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<string> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error(
      "未配置 DEEPSEEK_API_KEY，请在 apps/site/.env.local 设置后重启 dev server。",
    );
  }
  const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 0.7,
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("DeepSeek API error:", response.status, errorText);
    throw new Error(`DeepSeek API returned ${response.status}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "（未生成回复，请稍后重试）";
}

// ─── POST handler ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let me;
  try {
    me = await requireRole("junior");
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 401;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status },
    );
  }

  let body: {
    seniorId?: string;
    question?: string;
    chatId?: string;
    mentorId?: string;
    messages?: { role: string; content: string }[];
    builtProfile?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Backward-compat shim — DELETE in Task 26 (5.4 cleanup).
  // Old shape: { mentorId, messages, builtProfile } where messages is the
  // full history; last user message is the new question.
  if (body.mentorId && Array.isArray(body.messages)) {
    body.seniorId = body.seniorId ?? body.mentorId;
    if (body.question == null) {
      const lastUser = [...body.messages]
        .reverse()
        .find((m) => m.role === "user");
      body.question = lastUser?.content ?? "";
    }
  }

  if (!body.seniorId || !body.question || !body.question.trim()) {
    return NextResponse.json(
      { error: "seniorId and question required" },
      { status: 400 },
    );
  }

  const senior = await findUserById(body.seniorId);
  if (!senior || senior.role !== "senior") {
    return NextResponse.json({ error: "senior not found" }, { status: 404 });
  }

  let chatId = body.chatId;
  if (!chatId) {
    chatId = await createChat(me.row.id, senior.id);
  } else {
    const meta = await getChatMeta(chatId);
    if (!meta || meta.juniorId !== me.row.id || meta.seniorId !== senior.id) {
      return NextResponse.json({ error: "chat not found" }, { status: 404 });
    }
  }

  await appendUserMessage(chatId, body.question);

  const history = await getChatMessages(chatId);
  const systemPrompt = buildSystemPromptFromSenior(senior);

  const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  let reply: string;
  try {
    reply = await callDeepseek(apiMessages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Chat API error:", message);
    if (message.includes("DEEPSEEK_API_KEY")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    if (message.includes("timeout") || message.includes("abort")) {
      return NextResponse.json(
        { error: "DeepSeek API 响应超时，请稍后重试" },
        { status: 504 },
      );
    }
    if (message.startsWith("DeepSeek API returned ")) {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await appendAssistantMessage(chatId, reply, body.question);

  return NextResponse.json({ chatId, reply });
}
