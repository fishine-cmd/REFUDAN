/**
 * /api/profile/agent
 *
 * 用户在工作台录入的"主 Agent"档案（简历 / 标准化信息 / 外部账号 /
 * 知识库 / 对话定位）的持久化。每个用户只有一个主 Agent。
 *
 *   GET    读取当前 agentProfile（未登录 401）
 *   POST   创建 / 更新 agentProfile（合并写入，保留 createdAt）
 *   DELETE 仅清除手填档案（社交画像 built_profile_json 不动）
 */

import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  type AgentProfile,
  getAgentProfile,
  updateUserAgentProfile,
} from "@/lib/users-redis";

export const runtime = "nodejs";

export async function GET() {
  try {
    const u = await requireUser();
    const agentProfile = await getAgentProfile(u.pub.id);
    return NextResponse.json({ agentProfile, hasAgent: Boolean(agentProfile) });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Partial<AgentProfile>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const u = await requireUser();
    const existing = await getAgentProfile(u.pub.id);
    const now = Date.now();

    const merged: AgentProfile = {
      resumeFileName: body.resumeFileName ?? existing?.resumeFileName ?? null,
      resumeText: body.resumeText ?? existing?.resumeText ?? "",
      school: body.school ?? existing?.school ?? "",
      major: body.major ?? existing?.major ?? "",
      gpa: body.gpa ?? existing?.gpa ?? "",
      goal: body.goal ?? existing?.goal ?? "",
      promptText: body.promptText ?? existing?.promptText ?? "",
      accounts: { ...(existing?.accounts ?? {}), ...(body.accounts ?? {}) },
      knowledgeItems: body.knowledgeItems ?? existing?.knowledgeItems ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await updateUserAgentProfile(u.pub.id, merged);
    return NextResponse.json({ success: true, agentProfile: merged });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const u = await requireUser();
    await updateUserAgentProfile(u.pub.id, null);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
