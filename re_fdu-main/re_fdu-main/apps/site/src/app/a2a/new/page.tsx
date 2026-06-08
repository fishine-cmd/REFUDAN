"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { surfaceNames } from "@/lib/product-language";

function NewA2AForm() {
  const searchParams = useSearchParams();
  const seniorId = searchParams.get("seniorId") ?? "";
  const direction = searchParams.get("direction") ?? "";
  const presetQuestion = searchParams.get("question") ?? "";
  const router = useRouter();
  const [question, setQuestion] = useState(presetQuestion);
  const [busy, setBusy] = useState(false);

  const helperCopy = useMemo(() => {
    if (direction && presetQuestion) {
      return `当前主要方向是“${direction}”。你可以直接沿着下面这句继续发起，也可以稍作修改后再发送。`;
    }
    if (direction) {
      return `当前主要方向是“${direction}”。建议把第一句问题收敛到一个判断点，而不是一次性问很多泛问题。`;
    }
    return "你的第一句问题会决定这场 A2A 预沟通的方向。建议先聚焦一个最关键的判断问题。";
  }, [direction, presetQuestion]);

  async function send() {
    if (!question.trim() || !seniorId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/a2a/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seniorId, question }),
      });
      const data = await response.json();
      if (data?.sessionId) {
        router.push(`/a2a/${data.sessionId}?from=created`);
        return;
      }
      alert(data?.error ?? "发送失败");
      setBusy(false);
    } catch (error) {
      alert(String(error));
      setBusy(false);
    }
  }

  return (
    <main className="chat-compose-shell">
      <section className="chat-compose-card">
        <div className="chat-compose-card__head">
          <p className="dashboard-eyebrow">{surfaceNames.launchPad}</p>
          <h1>写下第一句真正值得问的问题</h1>
          <p className="dashboard-summary">{helperCopy}</p>
        </div>

        <div className="chat-compose-target">
          <span>目标学长</span>
          <strong>{seniorId || "未指定对象"}</strong>
        </div>

        {(direction || presetQuestion) && (
          <div className="chat-compose-brief">
            <div>
              <span>问题方向</span>
              <p>{direction || "未指定"}</p>
            </div>
            <div>
              <span>当前草稿</span>
              <p>{presetQuestion || "尚未预填问题"}</p>
            </div>
          </div>
        )}

        <textarea
          className="chat-compose-textarea"
          rows={6}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="例如：如果我现在的目标是保研到相关方向，你觉得我最该补的不是成绩，而是什么？"
        />

        <div className="chat-compose-actions">
          <button className="dashboard-primary" disabled={busy || !question.trim()} onClick={send}>
            {busy ? "发送中..." : "让我的 Agent 发起 A2A"}
          </button>
          <Link className="dashboard-secondary" href={seniorId ? `/seniors/${seniorId}` : "/me/junior"}>
            返回上一页
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function NewA2APage() {
  return (
    <Suspense
      fallback={
        <main className="chat-compose-shell">
          <p>正在加载 {surfaceNames.launchPad}...</p>
        </main>
      }
    >
      <NewA2AForm />
    </Suspense>
  );
}
