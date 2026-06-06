import { NextResponse } from "next/server";
import { loadMentor } from "@/data/mentors";
import { getMentorToken, streamChat as secondmeStreamChat } from "@/lib/secondme";

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


async function secondmeChatResponse(
  accessToken: string,
  messages: { role: string; content: string }[],
  mentorId: string,
): Promise<Response> {
  // SecondMe chat/stream 只接受单条 message，取最后一条 user 输入
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userMessage = lastUser?.content ?? "";

  let collected = "";
  try {
    await secondmeStreamChat(accessToken, userMessage, (delta) => {
      collected += delta;
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("SecondMe streamChat failed:", message);
    return NextResponse.json(
      {
        error: `SecondMe 分身响应失败：${message}`,
        source: "secondme",
        mentorId,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    reply: collected || "（SecondMe 分身未返回内容）",
    source: "secondme",
    mentorId,
  });
}

export async function POST(request: Request) {
  let body: { messages?: unknown; mentorId?: unknown; persona?: unknown; builtProfile?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, mentorId, persona: fallbackPersona, builtProfile } = body as {
    messages?: { role: string; content: string }[];
    mentorId?: string;
    persona?: Persona;
    builtProfile?: Record<string, unknown>;
  };

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "messages array is required" },
      { status: 400 }
    );
  }

  // ─── SecondMe 主路径 ──────────────────────────────────────────
  // 当 mentor 已授权且已绑定 SecondMe token，走 SSE 流式分身对话
  if (mentorId) {
    const profile = loadMentor(mentorId);
    if (profile?.consent_status === "granted") {
      const token = getMentorToken(mentorId);
      if (token) {
        return await secondmeChatResponse(token.accessToken, messages, mentorId);
      }
    }
  }

  // ─── DeepSeek 兜底路径 ────────────────────────────────────────
  if (!DEEPSEEK_API_KEY) {
    return NextResponse.json(
      {
        error:
          "未配置任何 LLM 后端。请在 .env.local 设置 DEEPSEEK_API_KEY 或为该 mentor 完成 SecondMe 授权。",
      },
      { status: 500 }
    );
  }

  // Resolve persona: priority order
  //   1. mentorId → load from mentor JSON (mentor's curated persona)
  //   2. builtProfile → derive from Phase 2 extraction (user's real AI 分身)
  //   3. fallbackPersona → frontend's hardcoded generic persona
  let persona: Persona;
  let extraContext: string | undefined;

  if (mentorId) {
    const profile = loadMentor(mentorId);
    if (profile) {
      persona = profile.persona;
      if (profile.detailed_profile) {
        extraContext = extractKeyExperiences(profile.detailed_profile as Record<string, unknown>);
      }
    } else if (builtProfile) {
      persona = derivePersonaFromBuiltProfile(builtProfile);
      extraContext = extractKeyExperiencesFromBuiltProfile(builtProfile);
    } else if (fallbackPersona?.name) {
      persona = fallbackPersona;
    } else {
      return NextResponse.json(
        { error: `Mentor "${mentorId}" not found` },
        { status: 400 }
      );
    }
  } else if (builtProfile) {
    persona = derivePersonaFromBuiltProfile(builtProfile);
    extraContext = extractKeyExperiencesFromBuiltProfile(builtProfile);
  } else if (fallbackPersona?.name) {
    persona = fallbackPersona;
  } else {
    return NextResponse.json(
      { error: "mentorId, builtProfile, or persona is required" },
      { status: 400 }
    );
  }

  const systemPrompt = buildSystemPrompt(persona, extraContext);

  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  try {
    const response = await fetch(
      `${DEEPSEEK_BASE_URL}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 800,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DeepSeek API error:", response.status, errorText);
      return NextResponse.json(
        { error: `DeepSeek API returned ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const reply =
      data.choices?.[0]?.message?.content || "（未生成回复，请稍后重试）";

    return NextResponse.json({ reply });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Chat API error:", message);

    if (message.includes("timeout") || message.includes("abort")) {
      return NextResponse.json(
        { error: "DeepSeek API 响应超时，请稍后重试" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
