import { NextResponse } from "next/server";
import { loadMentor } from "@/data/mentors";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";

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

export async function POST(request: Request) {
  if (!DEEPSEEK_API_KEY) {
    return NextResponse.json(
      { error: "DeepSeek API key not configured. Set DEEPSEEK_API_KEY in .env.local" },
      { status: 500 }
    );
  }

  let body: { messages?: unknown; mentorId?: unknown; persona?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, mentorId, persona: fallbackPersona } = body as {
    messages?: { role: string; content: string }[];
    mentorId?: string;
    persona?: Persona;
  };

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "messages array is required" },
      { status: 400 }
    );
  }

  // Resolve persona: prefer loading from mentorId JSON, fall back to passed persona
  let persona: Persona;
  let extraContext: string | undefined;

  if (mentorId) {
    const profile = loadMentor(mentorId);
    if (profile) {
      persona = profile.persona;
      if (profile.detailed_profile) {
        extraContext = extractKeyExperiences(profile.detailed_profile as Record<string, unknown>);
      }
    } else if (fallbackPersona?.name) {
      persona = fallbackPersona;
    } else {
      return NextResponse.json(
        { error: `Mentor "${mentorId}" not found` },
        { status: 400 }
      );
    }
  } else if (fallbackPersona?.name) {
    persona = fallbackPersona;
  } else {
    return NextResponse.json(
      { error: "mentorId or persona is required" },
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
      `${DEEPSEEK_BASE_URL}/chat/completions`,
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
