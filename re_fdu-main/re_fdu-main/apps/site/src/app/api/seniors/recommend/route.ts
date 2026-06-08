export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listIntentAssessmentsBySenior, mergeBaseScoreWithAssessment } from "@/lib/a2a-chat";
import { rankSeniors, type MatchIntent } from "@/lib/match";
import { getRedis, K, MATCH_CACHE_TTL_SEC } from "@/lib/redis";
import { listUsersByRole, toPublicUser } from "@/lib/users-redis";

export async function GET(req: NextRequest) {
  let me;
  try {
    me = await requireRole("junior");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const topN = Number(url.searchParams.get("topN") ?? "6") || 6;
  const intent: MatchIntent = {
    direction: url.searchParams.get("direction") ?? undefined,
    question: url.searchParams.get("question") ?? undefined,
  };
  const hasIntent = !!intent.direction || !!intent.question;
  const redis = getRedis();
  const graphVersionRaw = await redis.get<string | number>(K.agentGraphVersion());
  const graphVersion = Number(graphVersionRaw ?? 0) || 0;
  const cacheKey = hasIntent
    ? `${K.matchCache(me.row.id)}:v${graphVersion}:${encodeURIComponent(`${intent.direction ?? ""}|${intent.question ?? ""}`)}`
    : `${K.matchCache(me.row.id)}:v${graphVersion}`;

  if (!hasIntent) {
    const cached = await redis.get<string | object>(cacheKey);
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      return NextResponse.json(parsed);
    }
  }

  const seniors = await listUsersByRole("senior");
  const seniorMap = new Map(seniors.map((senior) => [senior.id, senior]));
  const ranked = rankSeniors(me.row, seniors, topN, intent);
  const { bySenior } = await listIntentAssessmentsBySenior({
    juniorId: me.row.id,
    intent,
  });

  const recommendations = ranked
    .map((match) => {
      const senior = seniorMap.get(match.seniorId);
      if (!senior) return null;

      const assessment = bySenior.get(match.seniorId) ?? null;
      const displayScore = mergeBaseScoreWithAssessment(match.score, assessment);
      const starterReason = match.reasons[0] ?? "与你当前的方向较匹配";
      const suggestedOpeningQuestion = intent.question
        ? `你可以从“${intent.question.slice(0, 40)}”继续追问这位学长的真实经验。`
        : intent.direction
          ? `建议先围绕“${intent.direction}”发出第一句判断性问题。`
          : "建议先问一个真正决定下一步行动的问题，而不是一次性问太多。";

      return {
        senior: toPublicUser(senior),
        score: displayScore,
        scores: match.scores,
        reasons: match.reasons,
        starterReason,
        suggestedOpeningQuestion,
        handoffPotential: displayScore >= 82 ? "high" : displayScore >= 68 ? "medium" : "low",
        a2aStatus: assessment?.status ?? "idle",
        a2aAdjustedScore: assessment?.adjustedScore ?? null,
        a2aSummary: assessment?.summary ?? "",
        a2aVerdict: assessment?.verdict ?? null,
        a2aSessionId: assessment?.sessionId ?? null,
        a2aCoveredSlots: assessment?.coveredSlots ?? [],
        a2aInsights: assessment?.insights ?? [],
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.score - a.score);

  const payload = { recommendations, intent };
  await redis.set(cacheKey, JSON.stringify(payload), { ex: MATCH_CACHE_TTL_SEC });
  return NextResponse.json(payload);
}
