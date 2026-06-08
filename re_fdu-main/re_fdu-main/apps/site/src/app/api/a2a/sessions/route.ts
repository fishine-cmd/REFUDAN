export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { createOrContinueA2ASession } from "@/lib/a2a-chat";
import { apiSurfaceLabels } from "@/lib/product-language";

export async function POST(req: NextRequest) {
  let me;
  try {
    me = await requireRole("junior");
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 401;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auth failed" },
      { status },
    );
  }

  let body: {
    seniorId?: string;
    question?: string;
    origin?: "matching" | "launchpad" | "legacy";
    autoplay?: boolean;
    intent?: {
      direction?: string;
      question?: string;
    };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.seniorId || !body.question?.trim()) {
    return NextResponse.json({ error: "seniorId and question required" }, { status: 400 });
  }

  try {
    const result = await createOrContinueA2ASession({
      juniorId: me.row.id,
      seniorId: body.seniorId,
      question: body.question,
      origin: body.origin ?? "legacy",
      intent: body.intent,
      autoplay: body.autoplay ?? false,
      source: "manual",
    });

    return NextResponse.json({
      source: apiSurfaceLabels.canonical,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("A2A session API error:", message);

    if (message === "senior not found" || message === "session not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message.includes("DEEPSEEK_API_KEY")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (message.includes("timeout") || message.includes("abort")) {
      return NextResponse.json({ error: "DeepSeek API 响应超时，请稍后重试" }, { status: 504 });
    }

    if (message.startsWith("DeepSeek API returned ")) {
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (message === "DeepSeek API returned empty body" || message === "DeepSeek API returned invalid JSON") {
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
