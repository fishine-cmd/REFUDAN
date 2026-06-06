import { NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  fetchUserInfo,
  saveMentorToken,
} from "@/lib/secondme";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/mentor-onboard?status=denied&reason=${encodeURIComponent(error)}`,
        request.url,
      ),
    );
  }
  if (!code || !stateParam) {
    return NextResponse.json(
      { error: "缺少 code 或 state" },
      { status: 400 },
    );
  }

  // state 形如 "<random>:<mentorId>"
  const sep = stateParam.lastIndexOf(":");
  if (sep < 0) {
    return NextResponse.json({ error: "state 格式非法" }, { status: 400 });
  }
  const stateRandom = stateParam.slice(0, sep);
  const mentorId = stateParam.slice(sep + 1);

  // CSRF: 验证 state 与 cookie 一致
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("secondme_oauth_state="))
    ?.split("=")[1];

  if (!cookieState || cookieState !== stateRandom) {
    return NextResponse.json(
      { error: "state 校验失败 (可能是 CSRF 或会话超时)" },
      { status: 400 },
    );
  }

  try {
    const token = await exchangeCodeForToken(code);
    const userInfo = await fetchUserInfo(token.access_token);

    saveMentorToken(mentorId, {
      mentorId,
      secondmeUserId: userInfo.userId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      scope: token.scope,
      grantedAt: new Date().toISOString(),
    });

    return NextResponse.redirect(
      new URL(
        `/mentor-onboard?status=success&mentor=${encodeURIComponent(mentorId)}&user=${encodeURIComponent(userInfo.name)}`,
        request.url,
      ),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.redirect(
      new URL(
        `/mentor-onboard?status=failed&reason=${encodeURIComponent(message)}`,
        request.url,
      ),
    );
  }
}
