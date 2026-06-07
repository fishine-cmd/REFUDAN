// GET /api/seniors/recommend?topN=6 — 学弟视角推荐 + 1h 缓存
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listUsersByRole, toPublicUser } from "@/lib/users-redis";
import { rankSeniors, type MatchIntent } from "@/lib/match";
import { getRedis, K, MATCH_CACHE_TTL_SEC } from "@/lib/redis";

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
  const r = getRedis();
  const cacheKey = hasIntent
    ? `${K.matchCache(me.row.id)}:${encodeURIComponent(`${intent.direction ?? ""}|${intent.question ?? ""}`)}`
    : K.matchCache(me.row.id);

  if (!hasIntent) {
    const cached = await r.get<string | object>(cacheKey);
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      return NextResponse.json(parsed);
    }
  }

  const seniors = await listUsersByRole("senior");
  const seniorMap = new Map(seniors.map((s) => [s.id, s]));
  const results = rankSeniors(me.row, seniors, topN, intent);

  const recommendations = results
    .map((m) => {
      const s = seniorMap.get(m.seniorId);
      if (!s) return null;
      return {
        senior: toPublicUser(s),
        score: m.score,
        scores: m.scores,
        reasons: m.reasons,
      };
    })
    .filter(Boolean);

  const payload = { recommendations, intent };
  await r.set(cacheKey, JSON.stringify(payload), { ex: MATCH_CACHE_TTL_SEC });
  return NextResponse.json(payload);
}
