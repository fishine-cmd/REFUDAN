import { NextResponse } from "next/server";
import { revokeMentorToken, getMentorToken } from "@/lib/secondme";

export async function POST(request: Request) {
  let body: { mentorId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mentorId } = body;
  if (!mentorId) {
    return NextResponse.json({ error: "mentorId 必填" }, { status: 400 });
  }

  const existing = getMentorToken(mentorId);
  if (!existing) {
    return NextResponse.json(
      { ok: true, message: "该 mentor 当前未绑定 SecondMe，无需撤销" },
      { status: 200 },
    );
  }

  // 注: SecondMe 官方未提供 revoke endpoint 的公开文档，
  // 当前实现仅清除本地 token；生产应同时调用平台撤销接口。
  revokeMentorToken(mentorId);

  return NextResponse.json({
    ok: true,
    mentorId,
    revokedAt: new Date().toISOString(),
    note: "本地 token 已清除。用户可在 SecondMe 平台进一步撤销应用授权。",
  });
}
