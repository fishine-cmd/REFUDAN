// GET /api/seniors → 列出所有 role=senior 用户公开资料
// 用于学弟主页和搜索。
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { listUsersByRole, toPublicUser } from "@/lib/users-redis";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const rows = await listUsersByRole("senior");
  const mentors = rows.map((row) => {
    const pub = toPublicUser(row);
    const agentTags = pub.agent
      ? [...(pub.agent.skills ?? []), ...(pub.agent.topics ?? []), ...(pub.agent.interests ?? [])]
      : [];
    // 兼容旧 mentor-card 期望的 MentorSummary 形状:
    return {
      id: pub.id,
      name: pub.displayName,
      title:
        pub.title ??
        [pub.agent?.school, pub.agent?.major, pub.agent?.goal].filter(Boolean).join(" / "),
      avatar: pub.avatarUrl ?? pub.avatar,
      scores: pub.scores ?? [50, 50, 50, 50],
      tags: (pub.tags && pub.tags.length > 0 ? pub.tags : agentTags).slice(0, 6),
      badges: pub.badges ?? [],
      highlight:
        pub.highlight ??
        pub.agent?.promptText ??
        [pub.agent?.goal, ...(pub.agent?.styleCues ?? []).slice(0, 2)].filter(Boolean).join(" · "),
      meta:
        [pub.agent?.school, pub.agent?.major, pub.agent?.goal].filter(Boolean).join(" · ") ||
        "",
    };
  });
  return NextResponse.json({ mentors });
}
