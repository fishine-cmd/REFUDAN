import type {
  A2AAssessment,
  A2AAssessmentStatus,
  A2ASlot,
  A2ATurn,
  A2AVerdict,
} from "@re-fudan/contracts";

export interface A2AIntentInput {
  direction?: string;
  question?: string;
}

export interface SlotDefinition {
  id: A2ASlot;
  label: string;
  keywords: string[];
  buildQuestion: (seedQuestion: string) => string;
  insight: string;
}

export const slotDefinitions: Record<A2ASlot, SlotDefinition> = {
  camp_difficulty: {
    id: "camp_difficulty",
    label: "入营与整体难度",
    keywords: ["夏令营", "难度", "保研", "入营", "竞争", "bar"],
    buildQuestion: (seedQuestion) =>
      `如果围绕“${clip(seedQuestion, 18)}”先判断整体门槛，你会怎么描述入营和筛选难度？`,
    insight: "已补充整体难度和竞争强度判断。",
  },
  question_types: {
    id: "question_types",
    label: "真题与题型",
    keywords: ["真题", "题目", "笔试", "面试", "考核", "算法", "数学"],
    buildQuestion: () => "如果继续追问到更实操的一层，常见题型或考核方式一般会落在哪几类？",
    insight: "已补充题型、考核方式或真题风格。",
  },
  mentor_style: {
    id: "mentor_style",
    label: "导师与沟通风格",
    keywords: ["导师", "风格", "沟通", "组会", "带人", "实验室"],
    buildQuestion: () => "除了硬条件之外，如果站在真实体验角度，这里的导师或合作风格通常更像什么样？",
    insight: "已补充导师风格、沟通节奏或合作体验。",
  },
  trust_gated: {
    id: "trust_gated",
    label: "信任升级后信息",
    keywords: ["隐私", "内幕", "内部", "信任", "握手", "深入"],
    buildQuestion: () => "有没有哪类信息通常要在更高信任级别下才适合展开，但你现在可以先给一个边界内的判断？",
    insight: "已补充哪些信息需要更高信任级别才能展开。",
  },
  gpa_threshold: {
    id: "gpa_threshold",
    label: "GPA 与硬门槛",
    keywords: ["gpa", "绩点", "门槛", "硬条件", "成绩", "排名"],
    buildQuestion: () => "如果只看 GPA 或其他硬门槛，通常会在哪个区间开始更有竞争力？",
    insight: "已补充 GPA 或硬门槛判断。",
  },
};

const autoplayOrder: A2ASlot[] = [
  "camp_difficulty",
  "question_types",
  "mentor_style",
  "trust_gated",
  "gpa_threshold",
];

function clip(value: string, max: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word.toLowerCase()));
}

function getRelevantText(intent: A2AIntentInput) {
  return `${intent.direction ?? ""} ${intent.question ?? ""}`.toLowerCase();
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildA2AIntentHash(intent: A2AIntentInput) {
  return `${intent.direction?.trim() ?? ""}|${intent.question?.trim() ?? ""}`;
}

export function deriveCoveredSlots(turns: A2ATurn[]): A2ASlot[] {
  const covered = new Set<A2ASlot>();
  for (const turn of turns) {
    if (turn.slot) covered.add(turn.slot);
  }
  return autoplayOrder.filter((slot) => covered.has(slot));
}

export function rankSlotsForIntent(intent: A2AIntentInput): A2ASlot[] {
  const text = getRelevantText(intent);
  const ranked = autoplayOrder
    .map((slot, index) => {
      const definition = slotDefinitions[slot];
      const hits = includesAny(text, definition.keywords) ? 1 : 0;
      return { slot, score: hits * 10 - index };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.slot);

  return ranked;
}

export function planNextAutoplaySlot(input: {
  intent: A2AIntentInput;
  coveredSlots: A2ASlot[];
}): A2ASlot | null {
  const covered = new Set(input.coveredSlots);
  return rankSlotsForIntent(input.intent).find((slot) => !covered.has(slot)) ?? null;
}

export function buildAutoplayQuestion(input: {
  intent: A2AIntentInput;
  nextSlot: A2ASlot;
}) {
  const seedQuestion = input.intent.question?.trim() || input.intent.direction?.trim() || "当前问题";
  return slotDefinitions[input.nextSlot].buildQuestion(seedQuestion);
}

function countMatches(text: string, phrases: string[]) {
  let total = 0;
  for (const phrase of phrases) {
    if (text.includes(phrase)) total += 1;
  }
  return total;
}

export function buildAssessmentFromTurns(input: {
  sessionId: string;
  intentHash: string;
  turns: A2ATurn[];
  coveredSlots: A2ASlot[];
  round: number;
  status: A2AAssessmentStatus;
}): A2AAssessment {
  const assistantText = input.turns
    .filter((turn) => turn.speaker === "senior_agent")
    .map((turn) => turn.content.toLowerCase())
    .join("\n");

  const positiveSignals = countMatches(assistantText, [
    "值得",
    "适合",
    "推荐",
    "可以争取",
    "机会",
    "建议继续",
    "匹配",
  ]);
  const cautionSignals = countMatches(assistantText, [
    "不建议",
    "门槛高",
    "难度很大",
    "不太适合",
    "需要更高信任",
    "不确定",
    "看情况",
  ]);

  let verdict: A2AVerdict = "needs_clarification";
  if (cautionSignals >= 2 && input.coveredSlots.length >= 3) {
    verdict = "not_now";
  } else if (input.coveredSlots.length >= 4 || (positiveSignals >= 2 && input.coveredSlots.length >= 3)) {
    verdict = "strong_match";
  } else if (input.coveredSlots.length >= 3) {
    verdict = "promising";
  }

  const adjustedScore = clampScore(
    56 + input.coveredSlots.length * 7 + positiveSignals * 4 - cautionSignals * 5,
  );

  const summaryParts = [
    input.coveredSlots.length > 0
      ? `已覆盖 ${input.coveredSlots.length}/5 个关键槽位`
      : "已完成首轮对话，仍需继续探测关键槽位",
    verdict === "strong_match"
      ? "当前判断值得继续推进引荐。"
      : verdict === "promising"
        ? "当前判断有较强潜力，但还建议补一到两项关键信息。"
        : verdict === "not_now"
          ? "当前判断暂不建议直接进入引荐。"
          : "当前信息还不足以形成稳定结论。",
  ];

  return {
    sessionId: input.sessionId,
    status: input.status,
    verdict,
    adjustedScore,
    summary: summaryParts.join(" "),
    insights: input.coveredSlots.map((slot) => slotDefinitions[slot].insight),
    coveredSlots: input.coveredSlots,
    round: input.round,
    intentHash: input.intentHash,
    updatedAt: Date.now(),
  };
}

export function shouldStopAutoplay(input: {
  round: number;
  maxRounds: number;
  coveredSlots: A2ASlot[];
  assessment: A2AAssessment;
}) {
  if (input.round >= input.maxRounds) return true;
  if (input.coveredSlots.length >= autoplayOrder.length) return true;
  if (
    input.round >= 3 &&
    (input.assessment.verdict === "strong_match" || input.assessment.verdict === "not_now")
  ) {
    return true;
  }
  return false;
}

export function mergeBaseScoreWithAssessment(baseScore: number, assessment?: A2AAssessment | null) {
  if (!assessment || assessment.status !== "completed") return baseScore;
  return clampScore(baseScore * 0.55 + assessment.adjustedScore * 0.45);
}
