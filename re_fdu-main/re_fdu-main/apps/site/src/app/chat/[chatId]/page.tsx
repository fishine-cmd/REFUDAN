"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface Msg {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

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
    if (u.role === "senior") {
      fetch(`/api/inbox/${chatId}/read`, { method: "POST" }).catch(() => {});
    }
  }

  useEffect(() => {
    loadAll();
  }, [chatId]);

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

  if (!data || !me) return <main className="chat-room-shell"><p>加载中...</p></main>;

  const isJunior = me.role === "junior";
  const peer = isJunior ? data.senior : data.junior;

  return (
    <main className="chat-room-shell">
      <section className="chat-room-hero">
        <div>
          <p className="dashboard-eyebrow">{isJunior ? "A2A conversation" : "Inbox thread"}</p>
          <h1>{peer?.displayName ?? "已离开"}</h1>
          <p className="dashboard-summary">
            {isJunior
              ? "继续围绕一个问题深入，不要把这页变成聊天软件。它更像被结构化过的对话工作台。"
              : "你正在查看学弟与 Agent 的对话记录。这一页对学长是只读的收件箱视图。"}
          </p>
        </div>
        <div className="chat-room-hero__meta">
          <span className="conversation-pill">{isJunior ? "Writable" : "Read only"}</span>
          <span className="conversation-pill">{data.messages.length} messages</span>
        </div>
      </section>

      <section className="chat-room-stage">
        <div className="chat-room-stream" ref={scrollRef}>
          {data.messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "chat-message is-user" : "chat-message is-agent"}>
              <span className="chat-message__role">{m.role === "user" ? "You" : "Agent"}</span>
              <p>{m.content}</p>
              <time>{new Date(m.ts).toLocaleTimeString()}</time>
            </div>
          ))}
        </div>

        <aside className="chat-room-side">
          <div className="chat-room-side__card">
            <p className="dashboard-kicker">Conversation mode</p>
            <h2>{isJunior ? "提问继续推进" : "收件箱只读查看"}</h2>
            <p>{isJunior ? "尽量保持每次追问都更具体。" : "如果需要真人接力，建议在未来版本中增加人工介面。"}</p>
          </div>

          <div className="chat-room-side__card">
            <p className="dashboard-kicker">Thread id</p>
            <h2>{chatId}</h2>
          </div>
        </aside>
      </section>

      {isJunior ? (
        <section className="chat-room-composer">
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="继续问点什么？Enter 发送，Shift+Enter 换行。"
          />
          <button className="dashboard-primary" disabled={busy || !q.trim()} onClick={send}>
            {busy ? "发送中..." : "发送"}
          </button>
        </section>
      ) : (
        <p className="dashboard-empty">这条对话对学长侧为只读查看。</p>
      )}
    </main>
  );
}
