import { NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  generateState,
  isConfigured,
} from "@/lib/secondme";
import { loadMentor } from "@/data/mentors";

export async function GET(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      {
        error:
          "SecondMe OAuth2 未配置。请在 apps/site/.env.local 设置 SECONDME_CLIENT_ID 与 SECONDME_CLIENT_SECRET。",
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const mentorId = searchParams.get("mentor");
  if (!mentorId) {
    return NextResponse.json({ error: "mentor 参数必填" }, { status: 400 });
  }

  const mentor = loadMentor(mentorId);
  if (!mentor) {
    return NextResponse.json(
      { error: `Mentor "${mentorId}" 不存在` },
      { status: 404 },
    );
  }

  if (mentor.consent_status !== "granted") {
    return NextResponse.json(
      {
        error: `Mentor "${mentorId}" 当前授权状态为 ${mentor.consent_status}，无法发起 SecondMe 绑定`,
      },
      { status: 403 },
    );
  }

  const state = generateState();
  const url = buildAuthorizeUrl(state, mentorId);

  const res = NextResponse.redirect(url);
  res.cookies.set("secondme_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
