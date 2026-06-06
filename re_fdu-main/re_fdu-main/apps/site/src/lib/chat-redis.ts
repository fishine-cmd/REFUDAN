// Chat / Inbox 数据访问层。所有写操作都同步更新两侧 inbox sorted set。

import { randomUUID } from "node:crypto";
import { getRedis, K } from "./redis";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export interface ChatMeta {
  chatId: string;
  juniorId: string;
  seniorId: string;
  createdAt: number;
  lastMessageAt: number;
  summary: string;
}

export async function getChatMeta(chatId: string): Promise<ChatMeta | null> {
  const r = getRedis();
  const h = await r.hgetall<Record<string, string>>(K.chat(chatId));
  if (!h || !h.junior_id) return null;
  return {
    chatId,
    juniorId: h.junior_id,
    seniorId: h.senior_id,
    createdAt: Number(h.created_at) || 0,
    lastMessageAt: Number(h.last_message_at) || 0,
    summary: h.summary ?? "",
  };
}

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  const r = getRedis();
  const items = await r.lrange<string>(K.chatMsgs(chatId), 0, -1);
  return items.map((s) => JSON.parse(s) as ChatMessage);
}

/** 创建新对话(首条用户消息前调用)。返回 chatId。 */
export async function createChat(juniorId: string, seniorId: string): Promise<string> {
  const r = getRedis();
  const chatId = randomUUID();
  const now = Date.now();
  await Promise.all([
    r.hset(K.chat(chatId), {
      junior_id: juniorId,
      senior_id: seniorId,
      created_at: String(now),
      last_message_at: String(now),
      summary: "",
    }),
    r.zadd(K.inboxJunior(juniorId), { score: now, member: chatId }),
    r.zadd(K.inboxSenior(seniorId), { score: now, member: chatId }),
  ]);
  return chatId;
}

/** 追加用户消息(学弟发问)。 */
export async function appendUserMessage(
  chatId: string,
  content: string,
  ts: number = Date.now(),
): Promise<void> {
  const r = getRedis();
  await r.rpush(K.chatMsgs(chatId), JSON.stringify({ role: "user", content, ts }));
}

/** 追加助手消息 + 更新 chat meta + 两侧 inbox score + 学长未读集。 */
export async function appendAssistantMessage(
  chatId: string,
  content: string,
  questionPreview: string,
  ts: number = Date.now(),
): Promise<void> {
  const r = getRedis();
  const meta = await getChatMeta(chatId);
  if (!meta) throw new Error(`chat ${chatId} not found`);
  await Promise.all([
    r.rpush(K.chatMsgs(chatId), JSON.stringify({ role: "assistant", content, ts })),
    r.hset(K.chat(chatId), {
      last_message_at: String(ts),
      summary: questionPreview.slice(0, 60),
    }),
    r.zadd(K.inboxJunior(meta.juniorId), { score: ts, member: chatId }),
    r.zadd(K.inboxSenior(meta.seniorId), { score: ts, member: chatId }),
    r.sadd(K.inboxSeniorUnread(meta.seniorId), chatId),
  ]);
}

/** 学长侧:取收件箱(按时间倒序),并附带未读判定。 */
export async function listSeniorInbox(seniorId: string): Promise<{
  chats: Array<ChatMeta & { unread: boolean }>;
  unreadCount: number;
}> {
  const r = getRedis();
  const [ids, unreadSet] = await Promise.all([
    r.zrange<string[]>(K.inboxSenior(seniorId), 0, -1, { rev: true }),
    r.smembers(K.inboxSeniorUnread(seniorId)),
  ]);
  const unread = new Set(unreadSet);
  const metas = await Promise.all(ids.map((id) => getChatMeta(id)));
  return {
    chats: metas
      .filter((m): m is ChatMeta => m !== null)
      .map((m) => ({ ...m, unread: unread.has(m.chatId) })),
    unreadCount: unread.size,
  };
}

/** 学弟侧:取我发起的对话列表(按时间倒序)。 */
export async function listJuniorChats(juniorId: string): Promise<ChatMeta[]> {
  const r = getRedis();
  const ids = await r.zrange<string[]>(K.inboxJunior(juniorId), 0, -1, { rev: true });
  const metas = await Promise.all(ids.map((id) => getChatMeta(id)));
  return metas.filter((m): m is ChatMeta => m !== null);
}

/** 学长标已读。 */
export async function markChatRead(seniorId: string, chatId: string): Promise<void> {
  await getRedis().srem(K.inboxSeniorUnread(seniorId), chatId);
}
