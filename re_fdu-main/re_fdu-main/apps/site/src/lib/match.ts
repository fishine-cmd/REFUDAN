// 推荐打分(v1 纯启发式)。
// 4 个轴各 0-100,综合 = 等权平均。

import synonyms from "../data/major-synonyms.json";
import type { UserRow } from "./users-redis";

export interface MatchResult {
  seniorId: string;
  score: number;
  scores: [number, number, number, number];
  reasons: string[];
}

const SYN_GROUPS: string[][] = synonyms.groups;

// ─── 工具 ───────────────────────────────────────────────────────────

function normalizeStr(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
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
    // GitHub repos topics
    if (Array.isArray(p?.github?.repos)) {
      for (const r of p.github.repos) {
        if (Array.isArray(r?.topics)) {
          for (const t of r.topics) out.add(String(t).toLowerCase());
        }
      }
    }
    // XHS notes 关键词
    if (Array.isArray(p?.xhs?.tags)) {
      for (const t of p.xhs.tags) out.add(String(t).toLowerCase());
    }
    // builtProfile 派生的 expertise / interests
    if (Array.isArray(p?.expertise)) {
      for (const t of p.expertise) out.add(String(t).toLowerCase());
    }
    if (Array.isArray(p?.interests)) {
      for (const t of p.interests) out.add(String(t).toLowerCase());
    }
    return new Set([...out].filter((s) => s.length >= 2));
  } catch {
    return new Set();
  }
}

function extractGoals(detailedProfileJson: string | null): Set<string> {
  if (!detailedProfileJson) return new Set();
  try {
    const dp = JSON.parse(detailedProfileJson);
    const v = dp?.goals ?? dp?.target ?? "";
    if (typeof v === "string") {
      return new Set(v.toLowerCase().split(/[\s,;、，；]+/).filter((s) => s.length >= 2));
    }
    if (Array.isArray(v)) {
      return new Set(v.map((s) => String(s).toLowerCase()).filter((s) => s.length >= 2));
    }
    return new Set();
  } catch {
    return new Set();
  }
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

// ─── 主算法 ──────────────────────────────────────────────────────────

export function scoreOne(junior: UserRow, senior: UserRow): MatchResult {
  const jSchool = getSchool(junior.detailed_profile_json);
  const sSchool = getSchool(senior.detailed_profile_json);
  const jMajor = getMajor(junior.detailed_profile_json);
  const sMajor = getMajor(senior.detailed_profile_json);
  const jGoals = extractGoals(junior.detailed_profile_json);
  const jTags = extractJuniorTags(junior.built_profile_json);
  const sTags = tokensFromTags(senior.tags_json);
  // 学长 persona.expertise 也作为 tag 池
  let sExpertise = new Set<string>();
  if (senior.persona_json) {
    try {
      const p = JSON.parse(senior.persona_json);
      if (typeof p?.expertise === "string") {
        for (const w of p.expertise.toLowerCase().split(/[\s,;、，；]+/)) {
          if (w.length >= 2) sExpertise.add(w);
        }
      }
    } catch {}
  }
  const sPool = new Set([...sTags, ...sExpertise]);

  const reasons: string[] = [];

  // 1. 院校匹配
  let schoolScore = 50;
  if (jSchool && sSchool && normalizeStr(jSchool) === normalizeStr(sSchool)) {
    schoolScore = 100;
    reasons.push(`同为${jSchool}`);
  } else if (!jSchool) {
    schoolScore = 50;
  }

  // 2. 专业匹配
  let majorScore = 30;
  if (jMajor && sMajor) {
    if (normalizeStr(jMajor) === normalizeStr(sMajor)) {
      majorScore = 100;
      reasons.push(`同专业:${jMajor}`);
    } else if (inSameMajorGroup(jMajor, sMajor)) {
      majorScore = 70;
      reasons.push(`专业相近:${jMajor} ↔ ${sMajor}`);
    }
  } else {
    majorScore = 50;
  }

  // 3. 目标重合
  let goalScore = 20;
  if (jGoals.size > 0 && sPool.size > 0) {
    const overlap = [...jGoals].filter((g) => sPool.has(g));
    goalScore = Math.max(20, Math.round(jaccard(jGoals, sPool) * 100));
    if (overlap.length > 0) {
      reasons.push(`目标重合:${overlap.slice(0, 3).join("、")}`);
    }
  }

  // 4. 经历相似
  let expScore = 20;
  if (jTags.size > 0 && sTags.size > 0) {
    const overlap = [...jTags].filter((t) => sTags.has(t));
    expScore = Math.max(20, Math.round(jaccard(jTags, sTags) * 100));
    if (overlap.length > 0) {
      reasons.push(`经历相近:${overlap.slice(0, 3).join("、")}`);
    }
  }

  const scores: [number, number, number, number] = [
    schoolScore,
    majorScore,
    goalScore,
    expScore,
  ];
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
): MatchResult[] {
  // 冷启动:学弟 builtProfile + detailed_profile 都空 → 给中性结果 + 引导文案
  const hasAnyJuniorData =
    !!junior.built_profile_json || !!junior.detailed_profile_json;
  if (!hasAnyJuniorData) {
    return seniors.slice(0, topN).map((s) => ({
      seniorId: s.id,
      score: 50,
      scores: [50, 50, 50, 50],
      reasons: ["完成社媒提取后可获得个性化匹配"],
    }));
  }
  return seniors
    .map((s) => scoreOne(junior, s))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
