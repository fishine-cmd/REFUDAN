import { NextResponse } from "next/server";
import { ensureSeeded, listUsersByRole, toPublicUser } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  await ensureSeeded();
  const rows = listUsersByRole("senior");
  // 保留 MentorSummary 形状(id, name, title, avatar, scores, tags, badges, highlight, meta)
  // 给现有 mentors 页面 + agent-workbench 用,避免前端大改
  const mentors = rows.map((row) => {
    const pub = toPublicUser(row);
    return {
      id: pub.id,
      name: pub.displayName,
      title: pub.title ?? "",
      avatar: pub.avatar,
      scores: pub.scores ?? [0, 0, 0, 0],
      tags: pub.tags ?? [],
      badges: pub.badges ?? [],
      highlight: pub.highlight ?? "",
      meta: pub.title ?? "",
    };
  });
  return NextResponse.json({ mentors });
}
