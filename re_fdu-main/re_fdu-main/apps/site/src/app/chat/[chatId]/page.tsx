"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface Msg { role: "user" | "assistant"; content: string; ts: number }
interface ChatDetail {
  chatId: string;
  junior: { id: string; displayName: string } | null;
  senior: { id: string; displayName: string } | null;
  messages: Msg[];
}

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const [data, setData] = useState<ChatDetail | null>(null);
  const [me, setMe] = useState<{ id: string; role: "senior" | "junior" } | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function loadAll() {
    const [meRes, chatRes] = await Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch(`/api/chats/${chatId}`).then((r) => r.json()),
    ]);
    const u = meRes?.user ?? meRes;
    setMe({ id: u.id, role: u.role });
    setData(chatRes);
    // 学长进来标已读
    if (u.role === "senior") {
      fetch(`/api/inbox/${chatId}/read`, { method: "POST" }).catch(() => {});
    }
  }

  useEffect(() => { loadAll(); }, [chatId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [data?.messages.length]);

  async function send() {
    if (!q.trim() || !data?.senior) return;
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seniorId: data.senior.id, question: q, chatId }),
      });
      const d = await r.json();
      if (d?.reply) {
        setQ("");
        await loadAll();
      } else {
        alert(d?.error ?? "发送失败");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!data || !me) return <main className="me-shell"><p>加载中…</p></main>;

  const isJunior = me.role === "junior";
  const peer = isJunior ? data.senior : data.junior;

  return (
    <main className="chat-shell">
      <header className="chat-head">
        <p className="me-eyebrow">{isJunior ? "对话学长" : "学弟提问"}</p>
        <h2>{peer?.displayName ?? "(已离开)"}</h2>
      </header>
      <div className="chat-stream" ref={scrollRef}>
        {data.messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
            <p>{m.content}</p>
            <time>{new Date(m.ts).toLocaleTimeString()}</time>
          </div>
        ))}
      </div>
      {isJunior ? (
        <div className="chat-input">
          <textarea
            rows={2}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="继续问点什么…(Enter 发送 · Shift+Enter 换行)"
          />
          <button className="minimal-primary" disabled={busy || !q.trim()} onClick={send}>
            {busy ? "发送中…" : "发送"}
          </button>
        </div>
      ) : (
        <p className="me-muted" style={{ padding: "1rem" }}>
          你正在查看学弟与你 Agent 的对话(只读)。
        </p>
      )}
    </main>
  );
}
