// /chat/new?seniorId=... — 不创 chat,引导填首条问题
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
    <main className="me-shell">
      <header className="me-hero">
        <p className="me-eyebrow">新对话</p>
        <h1>对 {seniorId} 说点什么</h1>
        <p className="me-muted">你的第一句问题:</p>
      </header>
      <section className="me-section">
        <textarea
          className="me-search"
          rows={5}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="想问的问题…"
        />
        <button className="minimal-primary" disabled={busy || !q.trim()} onClick={send}>
          {busy ? "发送中…" : "让我的 Agent 发问"}
        </button>
      </section>
    </main>
  );
}

export default function NewChatPage() {
  return (
    <Suspense fallback={<main className="me-shell"><p>加载中…</p></main>}>
      <NewChatForm />
    </Suspense>
  );
}
