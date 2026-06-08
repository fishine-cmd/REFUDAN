import synonyms from "../data/major-synonyms.json";
import { buildAgentSnapshot, tokenizeProfileText } from "./agent-snapshot";
import type { UserRow } from "./users-redis";

export interface MatchResult {
  seniorId: string;
  score: number;
  scores: [number, number, number, number];
  reasons: string[];
}

export interface MatchIntent {
  direction?: string;
  question?: string;
}

const SYN_GROUPS: string[][] = synonyms.groups;

function normalizeStr(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function splitIntentText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;:!?./\\|()[\]{}"'`~@#$%^&*+=<>_-]+|[，。；：！？、（）【】《》“”‘’]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

function inSameMajorGroup(a: string, b: string): boolean {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return false;
  return SYN_GROUPS.some((g) => {
    const lower = g.map((x) => x.toLowerCase());
    return lower.some((x) => na.includes(x)) && lower.some((x) => nb.includes(x));
  });
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  return inter / (a.size + b.size - inter);
}

function tokensFromTags(json: string | null): Set<string> {
  if (!json) return new Set();
  try {
    const arr = JSON.parse(json) as string[];
    return new Set(arr.map((s) => s.toLowerCase()).filter((s) => s.length >= 2));
  } catch {
    return new Set();
  }
}

function extractJuniorTags(builtProfileJson: string | null): Set<string> {
  if (!builtProfileJson) return new Set();
  try {
    const p = JSON.parse(builtProfileJson);
    const out = new Set<string>();

    if (Array.isArray(p?.github?.repos)) {
      for (const repo of p.github.repos) {
        if (Array.isArray(repo?.topics)) {
          for (const topic of repo.topics) out.add(String(topic).toLowerCase());
        }
      }
    }

    if (Array.isArray(p?.xhs?.tags)) {
      for (const tag of p.xhs.tags) out.add(String(tag).toLowerCase());
    }

    if (Array.isArray(p?.expertise)) {
      for (const item of p.expertise) out.add(String(item).toLowerCase());
    }

    if (Array.isArray(p?.interests)) {
      for (const item of p.interests) out.add(String(item).toLowerCase());
    }

    return new Set([...out].filter((s) => s.length >= 2));
  } catch {
    return new Set();
  }
}

function buildSnapshot(user: UserRow) {
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

function extractGoals(detailedProfileJson: string | null): Set<string> {
  if (!detailedProfileJson) return new Set();
  try {
    const dp = JSON.parse(detailedProfileJson);
    const v = dp?.goals ?? dp?.target ?? "";
    if (typeof v === "string") {
      return new Set(v.toLowerCase().split(/[\s,;，、]+/).filter((s) => s.length >= 2));
    }
    if (Array.isArray(v)) {
      return new Set(v.map((s) => String(s).toLowerCase()).filter((s) => s.length >= 2));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function extractIntentTokens(intent?: MatchIntent): Set<string> {
  if (!intent) return new Set();
  const out = new Set<string>();

  if (intent.direction) {
    out.add(normalizeStr(intent.direction));
    for (const token of splitIntentText(intent.direction)) out.add(token);
  }

  if (intent.question) {
    for (const token of splitIntentText(intent.question)) out.add(token);
  }

  return new Set([...out].filter(Boolean));
}

function getSchool(detailedProfileJson: string | null): string {
  if (!detailedProfileJson) return "";
  try {
    const dp = JSON.parse(detailedProfileJson);
    return String(dp?.education?.school ?? dp?.school ?? "");
  } catch {
    return "";
  }
}

function getMajor(detailedProfileJson: string | null): string {
  if (!detailedProfileJson) return "";
  try {
    const dp = JSON.parse(detailedProfileJson);
    return String(dp?.education?.major ?? dp?.major ?? "");
  } catch {
    return "";
  }
}

function extractSeniorExpertise(personaJson: string | null): Set<string> {
  const out = new Set<string>();
  if (!personaJson) return out;
  try {
    const persona = JSON.parse(personaJson);
    if (typeof persona?.expertise === "string") {
      for (const token of splitIntentText(persona.expertise)) out.add(token);
    }
  } catch {
    return out;
  }
  return out;
}

function findIntentMatches(tokens: Set<string>, texts: Array<string | null | undefined>): string[] {
  const corpus = texts.map((text) => normalizeStr(text)).filter(Boolean);
  const matches: string[] = [];

  for (const token of tokens) {
    if (corpus.some((text) => text.includes(token) || token.includes(text))) {
      matches.push(token);
    }
  }

  return [...new Set(matches)];
}

export function scoreOne(junior: UserRow, senior: UserRow, intent?: MatchIntent): MatchResult {
  const juniorSnapshot = buildSnapshot(junior);
  const seniorSnapshot = buildSnapshot(senior);
  const jSchool = juniorSnapshot.school || getSchool(junior.detailed_profile_json);
  const sSchool = seniorSnapshot.school || getSchool(senior.detailed_profile_json);
  const jMajor = juniorSnapshot.major || getMajor(junior.detailed_profile_json);
  const sMajor = seniorSnapshot.major || getMajor(senior.detailed_profile_json);
  const jGoals = tokenizeProfileText([
    juniorSnapshot.goal,
    ...Array.from(extractGoals(junior.detailed_profile_json)),
  ]);
  const jTags = tokenizeProfileText([
    ...Array.from(extractJuniorTags(junior.built_profile_json)),
    ...juniorSnapshot.skills,
    ...juniorSnapshot.interests,
    ...juniorSnapshot.topics,
    ...juniorSnapshot.knowledgeTitles,
  ]);
  const sTags = tokenizeProfileText([
    ...tokensFromTags(senior.tags_json),
    ...seniorSnapshot.tags,
  ]);
  const sExpertise = tokenizeProfileText([
    ...Array.from(extractSeniorExpertise(senior.persona_json)),
    seniorSnapshot.personaExpertise,
    seniorSnapshot.goal,
    seniorSnapshot.title,
    seniorSnapshot.highlight,
  ]);
  const sPool = new Set([...sTags, ...sExpertise]);
  const intentTokens = extractIntentTokens(intent);
  const intentMatches = findIntentMatches(intentTokens, [
    ...sPool,
    seniorSnapshot.title,
    seniorSnapshot.highlight,
    seniorSnapshot.bio,
    seniorSnapshot.personaBackground,
    seniorSnapshot.personaExpertise,
  ]);

  const reasons: string[] = [];

  let schoolScore = 50;
  if (jSchool && sSchool && normalizeStr(jSchool) === normalizeStr(sSchool)) {
    schoolScore = 100;
    reasons.push(`同为${jSchool}`);
  }

  let majorScore = 30;
  if (jMajor && sMajor) {
    if (normalizeStr(jMajor) === normalizeStr(sMajor)) {
      majorScore = 100;
      reasons.push(`同专业：${jMajor}`);
    } else if (inSameMajorGroup(jMajor, sMajor)) {
      majorScore = 70;
      reasons.push(`专业相近：${jMajor} -> ${sMajor}`);
    }
  } else {
    majorScore = 50;
  }

  let goalScore = 20;
  if (jGoals.size > 0 && sPool.size > 0) {
    const overlap = [...jGoals].filter((g) => sPool.has(g));
    goalScore = Math.max(20, Math.round(jaccard(jGoals, sPool) * 100));
    if (overlap.length > 0) {
      reasons.push(`目标重合：${overlap.slice(0, 3).join("、")}`);
    }
  }

  let expScore = 20;
  if (jTags.size > 0 && sTags.size > 0) {
    const overlap = [...jTags].filter((t) => sTags.has(t));
    expScore = Math.max(20, Math.round(jaccard(jTags, sTags) * 100));
    if (overlap.length > 0) {
      reasons.push(`经历相近：${overlap.slice(0, 3).join("、")}`);
    }
  }

  if (intentTokens.size > 0) {
    const goalBoost = Math.min(18, intentMatches.length * 6);
    const expBoost = Math.min(14, intentMatches.length * 5);
    goalScore = clampScore(Math.max(goalScore, 30) + goalBoost);
    expScore = clampScore(Math.max(expScore, 25) + expBoost);

    if (intentMatches.length > 0) {
      reasons.unshift(`问题方向匹配：${intentMatches.slice(0, 3).join("、")}`);
    } else if (intent?.direction) {
      reasons.unshift(`已按“${intent.direction}”重排推荐`);
    }
  }

  const scores: [number, number, number, number] = [schoolScore, majorScore, goalScore, expScore];
  const score = Math.round(scores.reduce((a, b) => a + b, 0) / 4);

  return {
    seniorId: senior.id,
    score,
    scores,
    reasons,
  };
}

export function rankSeniors(
  junior: UserRow,
  seniors: UserRow[],
  topN = 6,
  intent?: MatchIntent,
): MatchResult[] {
  const hasAnyJuniorData =
    !!junior.built_profile_json ||
    !!junior.detailed_profile_json ||
    !!junior.agent_profile_json ||
    !!intent?.direction ||
    !!intent?.question;

  if (!hasAnyJuniorData) {
    return seniors.slice(0, topN).map((s) => ({
      seniorId: s.id,
      score: 50,
      scores: [50, 50, 50, 50],
      reasons: ["完成社媒提取后可获得个性化匹配"],
    }));
  }

  return seniors
    .map((s) => scoreOne(junior, s, intent))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
