type JsonRecord = Record<string, unknown>;

export interface ProfileInsights {
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
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asStringArray(value: unknown, limit = 8): string[] {
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

function firstText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) return item.trim();
    }
  }
  return "";
}

function collectTopics(profile: JsonRecord): string[] {
  const topics = profile.content_topics;
  if (!Array.isArray(topics)) return [];
  const labels: string[] = [];
  for (const item of topics) {
    if (item && typeof item === "object") {
      const label = firstText((item as JsonRecord).topic);
      if (label) labels.push(label);
    }
  }
  return [...new Set(labels)].slice(0, 6);
}

function collectTopicEvidence(profile: JsonRecord): string[] {
  const topics = profile.content_topics;
  if (!Array.isArray(topics)) return [];
  const evidence: string[] = [];
  for (const item of topics) {
    if (!item || typeof item !== "object") continue;
    const topicEvidence = asStringArray((item as JsonRecord).evidence, 2);
    evidence.push(...topicEvidence);
    if (evidence.length >= 6) break;
  }
  return [...new Set(evidence)].slice(0, 6);
}

function collectCareerDomains(profile: JsonRecord): string[] {
  const inferred = asRecord(profile.inferred_signals);
  const domains = asRecord(inferred.career_domains);
  return Object.keys(domains).map((item) => item.trim()).filter(Boolean).slice(0, 6);
}

function collectRoleSignals(profile: JsonRecord): string[] {
  const inferred = asRecord(profile.inferred_signals);
  const roles = inferred.content_roles;
  if (!Array.isArray(roles)) return [];
  const labels: string[] = [];
  for (const item of roles) {
    if (!item || typeof item !== "object") continue;
    const role = firstText((item as JsonRecord).role);
    if (role) labels.push(role.replace(/[:：].*$/, "").trim());
  }
  return [...new Set(labels)].slice(0, 5);
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.map((item) => (item ?? "").trim()).filter(Boolean).join("，");
}

function buildFallbackInsights(profileInput: unknown): ProfileInsights {
  const profile = asRecord(profileInput);
  const basic = asRecord(profile.basic_info);
  const declared = asRecord(profile.declared_profile);
  const inferred = asRecord(profile.inferred_signals);
  const style = asRecord(profile.style_profile);
  const audience = asRecord(profile.audience_guess);
  const sources = asRecord(profile.sources);

  const topics = collectTopics(profile);
  const skills = asStringArray(inferred.skills_inferred, 6);
  const tones = asStringArray(style.tone, 4);
  const writingStyle = asStringArray(style.writing_style, 4);
  const interests = [
    ...topics,
    ...asStringArray(inferred.interests, 4),
    ...collectCareerDomains(profile),
  ].filter(Boolean);
  const motivations = [
    firstText(declared.goal),
    firstText(inferred.stated_goal),
    ...collectCareerDomains(profile).slice(0, 3),
  ].filter((item) => item && item !== "unknown");
  const personality = [
    ...tones,
    ...collectRoleSignals(profile),
  ].filter(Boolean);
  const communicationStyle = [
    ...writingStyle,
    ...asStringArray(style.visual_style, 3),
    firstText(audience.description),
  ].filter(Boolean);
  const strengths = [
    ...skills,
    ...collectRoleSignals(profile),
  ].filter(Boolean);
  const evidence = collectTopicEvidence(profile);
  const limitations = asStringArray(profile.limitations, 3);
  const noteCount = typeof sources.notes_collected === "number" ? `${sources.notes_collected} 条内容` : "现有公开内容";
  const headline =
    firstText(basic.display_name) ||
    joinParts([firstText(declared.school), firstText(declared.major)]) ||
    "社交画像分析";
  const summary = joinParts([
    topics.length > 0 ? `内容重心集中在 ${topics.slice(0, 3).join("、")}` : "",
    tones.length > 0 ? `整体气质偏 ${tones.slice(0, 2).join("、")}` : "",
    skills.length > 0 ? `擅长输出 ${skills.slice(0, 2).join("、")}` : "",
  ]) || `已基于 ${noteCount} 整理出这个用户的社交画像。`;
  const caution =
    limitations[0] ||
    `当前判断主要来自 ${noteCount}，更适合用于把握风格、兴趣和表达习惯，不适合做高风险结论。`;

  return {
    source: "fallback",
    headline,
    summary,
    personality: personality.slice(0, 5),
    interests: [...new Set(interests)].slice(0, 6),
    motivations: [...new Set(motivations)].slice(0, 5),
    communicationStyle: [...new Set(communicationStyle)].slice(0, 5),
    strengths: [...new Set(strengths)].slice(0, 6),
    suggestedTopics: [...new Set([...topics, ...collectCareerDomains(profile), ...asStringArray(inferred.interests, 3)])].slice(0, 6),
    caution,
    evidence,
  };
}

function buildPrompt(profile: unknown, fallback: ProfileInsights): string {
  return [
    "你是一个谨慎的社交画像分析助手，需要根据用户的结构化社媒画像，输出中文摘要。",
    "目标不是复述字段名，而是把这个人可能的性格、偏好、动机、表达方式和擅长话题讲清楚。",
    "请遵守：",
    "1. 只依据输入证据推断，不要脑补经历或身份。",
    "2. 语气具体、克制、像产品里的卡片文案。",
    "3. 每个列表项尽量 6-18 个中文字符。",
    "4. 如果证据不足，请在 caution 里明确提示。",
    "5. 只返回 JSON，不要 markdown 代码块。",
    "",
    "返回格式：",
    JSON.stringify(
      {
        headline: "一句话标签",
        summary: "2-3句总览",
        personality: ["..."],
        interests: ["..."],
        motivations: ["..."],
        communicationStyle: ["..."],
        strengths: ["..."],
        suggestedTopics: ["..."],
        caution: "风险提示",
        evidence: ["..."],
      },
      null,
      2,
    ),
    "",
    "已有保守归纳（可参考但不要照抄）：",
    JSON.stringify(fallback, null, 2),
    "",
    "结构化画像：",
    JSON.stringify(profile, null, 2),
  ].join("\n");
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function mergeInsights(parsed: unknown, fallback: ProfileInsights): ProfileInsights {
  const json = asRecord(parsed);
  return {
    source: "ai",
    headline: firstText(json.headline) || fallback.headline,
    summary: firstText(json.summary) || fallback.summary,
    personality: asStringArray(json.personality, 6).length > 0 ? asStringArray(json.personality, 6) : fallback.personality,
    interests: asStringArray(json.interests, 6).length > 0 ? asStringArray(json.interests, 6) : fallback.interests,
    motivations: asStringArray(json.motivations, 6).length > 0 ? asStringArray(json.motivations, 6) : fallback.motivations,
    communicationStyle:
      asStringArray(json.communicationStyle, 6).length > 0
        ? asStringArray(json.communicationStyle, 6)
        : fallback.communicationStyle,
    strengths: asStringArray(json.strengths, 6).length > 0 ? asStringArray(json.strengths, 6) : fallback.strengths,
    suggestedTopics:
      asStringArray(json.suggestedTopics, 6).length > 0
        ? asStringArray(json.suggestedTopics, 6)
        : fallback.suggestedTopics,
    caution: firstText(json.caution) || fallback.caution,
    evidence: asStringArray(json.evidence, 6).length > 0 ? asStringArray(json.evidence, 6) : fallback.evidence,
  };
}

async function callDeepseek(prompt: string): Promise<string> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.35,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是一个谨慎、克制、擅长写中文用户画像摘要的分析助手。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("DeepSeek API returned empty content");
  }
  return content;
}

export async function generateProfileInsights(profile: unknown): Promise<ProfileInsights> {
  const fallback = buildFallbackInsights(profile);
  try {
    const prompt = buildPrompt(profile, fallback);
    const raw = await callDeepseek(prompt);
    const parsed = JSON.parse(extractJsonObject(raw));
    return mergeInsights(parsed, fallback);
  } catch {
    return fallback;
  }
}
