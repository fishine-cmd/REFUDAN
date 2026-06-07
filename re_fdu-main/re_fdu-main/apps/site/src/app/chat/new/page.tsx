"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function NewChatForm() {
  const sp = useSearchParams();
  const seniorId = sp.get("seniorId") ?? "";
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!q.trim() || !seniorId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seniorId, question: q }),
      });
      const d = await r.json();
      if (d?.chatId) {
        router.push(`/chat/${d.chatId}`);
      } else {
        alert(d?.error ?? "发送失败");
        setBusy(false);
      }
    } catch (e) {
      alert(String(e));
      setBusy(false);
    }
  }

  return (
    <main className="chat-compose-shell">
      <section className="chat-compose-card">
        <div className="chat-compose-card__head">
          <p className="dashboard-eyebrow">New conversation</p>
          <h1>先写下第一句真正值得问的问题。</h1>
          <p className="dashboard-summary">
            你的第一句提问会决定接下来这场 A2A 对话的方向。建议聚焦一个明确问题，而不是一次性问很多泛泛内容。
          </p>
        </div>

        <div className="chat-compose-target">
          <span>Target senior</span>
          <strong>{seniorId || "未指定对象"}</strong>
        </div>

        <textarea
          className="chat-compose-textarea"
          rows={6}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="例如：如果我现在目标是保研到相关方向，你觉得我最该补的不是成绩，而是什么？"
        />

        <div className="chat-compose-actions">
          <button className="dashboard-primary" disabled={busy || !q.trim()} onClick={send}>
            {busy ? "发送中..." : "让我的 Agent 发问"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default function NewChatPage() {
  return (
    <Suspense fallback={<main className="chat-compose-shell"><p>加载中...</p></main>}>
      <NewChatForm />
    </Suspense>
  );
}
