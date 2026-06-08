import { randomUUID } from "node:crypto";
import type {
  A2AAssessment,
  A2AAutoplayState,
  A2AProvider,
  A2ASessionStatus,
  A2ATraceEvent,
  A2ASlot,
  A2ATurn,
  A2ATurnKind,
  HandoffStatus,
  PrivacyLevel,
  Speaker,
} from "@re-fudan/contracts";
import { getRedis, K } from "./redis";
import { getA2ASessionStatusForState } from "./a2a-session-view";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
  citations?: string[];
  traceRefs?: string[];
  privacyLevel?: PrivacyLevel;
  source?: "manual" | "autoplay";
  slot?: A2ASlot;
}

export interface ChatMeta {
  chatId: string;
  juniorId: string;
  seniorId: string;
  createdAt: number;
  lastMessageAt: number;
  summary: string;
  status: A2ASessionStatus;
  provider: A2AProvider;
  privacyLevel: PrivacyLevel;
  handoffStatus: HandoffStatus;
  originSurface: string;
  intentHash: string;
  autoplayState: A2AAutoplayState;
}

export interface A2ASessionDetail extends ChatMeta {
  turns: A2ATurn[];
  trace: A2ATraceEvent[];
  assessment: A2AAssessment | null;
}

type StoredTraceEvent = A2ATraceEvent;
type StoredTurn = A2ATurn;

function safeParseJson<T>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

function toChatRole(speaker: Speaker): ChatMessage["role"] {
  return speaker === "senior_agent" ? "assistant" : "user";
}

function fromChatRole(role: ChatMessage["role"]): Speaker {
  return role === "assistant" ? "senior_agent" : "junior_agent";
}

function inferTurnKind(role: ChatMessage["role"]): A2ATurnKind {
  return role === "assistant" ? "response" : "question";
}

function normalizeTraceEvent(raw: unknown): StoredTraceEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as Partial<StoredTraceEvent>;
  if (!event.id || !event.sessionId || !event.stage || !event.actor || typeof event.payload !== "string") {
    return null;
  }
  return {
    id: event.id,
    sessionId: event.sessionId,
    stage: event.stage,
    actor: event.actor,
    payload: event.payload,
    ts: typeof event.ts === "number" ? event.ts : Date.now(),
  };
}

function normalizeTurn(raw: unknown): StoredTurn | null {
  if (!raw || typeof raw !== "object") return null;
  const turn = raw as Partial<StoredTurn>;
  if (!turn.id || !turn.speaker || typeof turn.content !== "string") return null;
  return {
    id: turn.id,
    speaker: turn.speaker,
    kind: turn.kind ?? (turn.speaker === "system" ? "retrieval" : turn.speaker === "orchestrator" ? "intent" : "response"),
    content: turn.content,
    privacyLevel: turn.privacyLevel ?? "public",
    visibleTo: turn.visibleTo ?? "both",
    citations: Array.isArray(turn.citations) ? turn.citations : undefined,
    traceRefs: Array.isArray(turn.traceRefs) ? turn.traceRefs : undefined,
    cite: typeof turn.cite === "string" ? turn.cite : undefined,
    source: turn.source ?? "manual",
    slot: turn.slot,
  };
}

function chatMessageToTurn(chatId: string, index: number, message: ChatMessage): StoredTurn {
  const speaker = fromChatRole(message.role);
  const enriched = message;
  return {
    id: `${chatId}:legacy:${index}`,
    speaker,
    kind: inferTurnKind(message.role),
    content: message.content,
    privacyLevel: enriched.privacyLevel ?? "public",
    visibleTo: "both",
    citations: enriched.citations,
    traceRefs: enriched.traceRefs,
    cite: enriched.citations?.[0],
    source: enriched.source ?? "manual",
    slot: enriched.slot,
  };
}

function turnToChatMessage(turn: StoredTurn, ts: number): ChatMessage {
  if (turn.speaker === "system" || turn.speaker === "orchestrator") {
    return {
      role: "assistant",
      content: turn.content,
      ts,
    };
  }

  return {
    role: toChatRole(turn.speaker),
    content: turn.content,
    ts,
  };
}

export async function getChatMeta(chatId: string): Promise<ChatMeta | null> {
  const r = getRedis();
  const h = await r.hgetall<Record<string, string>>(K.chat(chatId));
  if (!h || !h.junior_id) return null;
  const autoplaySlots = safeParseJson<A2ASlot[]>(h.autoplay_slots) ?? [];
  return {
    chatId,
    juniorId: h.junior_id,
    seniorId: h.senior_id,
    createdAt: Number(h.created_at) || 0,
    lastMessageAt: Number(h.last_message_at) || 0,
    summary: h.summary ?? "",
    status: (h.status as A2ASessionStatus) ?? "running",
    provider: (h.provider as A2AProvider) ?? "local_persona",
    privacyLevel: (h.privacy_level as PrivacyLevel) ?? "handshake",
    handoffStatus: (h.handoff_status as HandoffStatus) ?? "pending",
    originSurface: h.origin_surface ?? "legacy",
    intentHash: h.intent_hash ?? "",
    autoplayState: {
      enabled: h.autoplay_enabled === "1",
      status: (h.autoplay_status as A2AAutoplayState["status"]) ?? "idle",
      round: Number(h.autoplay_round) || 0,
      maxRounds: Number(h.autoplay_max_rounds) || 0,
      coveredSlots: autoplaySlots,
      currentSlot: h.autoplay_current_slot ? (h.autoplay_current_slot as A2ASlot) : undefined,
      done: h.autoplay_done === "1",
      lastError: h.autoplay_last_error ?? "",
    },
  };
}

export async function setChatMeta(
  chatId: string,
  patch: Partial<
    Pick<
      ChatMeta,
      | "lastMessageAt"
      | "summary"
      | "status"
      | "provider"
      | "privacyLevel"
      | "handoffStatus"
      | "originSurface"
      | "intentHash"
      | "autoplayState"
    >
  >,
): Promise<void> {
  const fields: Record<string, string> = {};
  if (patch.lastMessageAt != null) fields.last_message_at = String(patch.lastMessageAt);
  if (patch.summary != null) fields.summary = patch.summary;
  if (patch.status != null) fields.status = patch.status;
  if (patch.provider != null) fields.provider = patch.provider;
  if (patch.privacyLevel != null) fields.privacy_level = patch.privacyLevel;
  if (patch.handoffStatus != null) fields.handoff_status = patch.handoffStatus;
  if (patch.originSurface != null) fields.origin_surface = patch.originSurface;
  if (patch.intentHash != null) fields.intent_hash = patch.intentHash;
  if (patch.autoplayState != null) {
    fields.autoplay_enabled = patch.autoplayState.enabled ? "1" : "0";
    fields.autoplay_status = patch.autoplayState.status;
    fields.autoplay_round = String(patch.autoplayState.round);
    fields.autoplay_max_rounds = String(patch.autoplayState.maxRounds);
    fields.autoplay_slots = JSON.stringify(patch.autoplayState.coveredSlots ?? []);
    fields.autoplay_current_slot = patch.autoplayState.currentSlot ?? "";
    fields.autoplay_done = patch.autoplayState.done ? "1" : "0";
    fields.autoplay_last_error = patch.autoplayState.lastError ?? "";
  }
  if (Object.keys(fields).length === 0) return;
  await getRedis().hset(K.chat(chatId), fields);
}

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  const items = await getRedis().lrange<unknown>(K.chatMsgs(chatId), 0, -1);
  return items
    .map((s) => {
      if (typeof s === "string") return safeParseJson<ChatMessage>(s);
      return s as ChatMessage;
    })
    .filter((item): item is ChatMessage => item !== null);
}

export async function createChat(
  juniorId: string,
  seniorId: string,
  options?: {
    provider?: A2AProvider;
    privacyLevel?: PrivacyLevel;
    status?: A2ASessionStatus;
    handoffStatus?: HandoffStatus;
    summary?: string;
    originSurface?: string;
    intentHash?: string;
    autoplayState?: A2AAutoplayState;
  },
): Promise<string> {
  const r = getRedis();
  const chatId = randomUUID();
  const now = Date.now();
  const autoplayState = options?.autoplayState ?? {
    enabled: false,
    status: "idle",
    round: 0,
    maxRounds: 0,
    coveredSlots: [],
    done: false,
  };
  await Promise.all([
    r.hset(K.chat(chatId), {
      junior_id: juniorId,
      senior_id: seniorId,
      created_at: String(now),
      last_message_at: String(now),
      summary: options?.summary ?? "",
      status: options?.status ?? "running",
      provider: options?.provider ?? "local_persona",
      privacy_level: options?.privacyLevel ?? "handshake",
      handoff_status: options?.handoffStatus ?? "pending",
      origin_surface: options?.originSurface ?? "legacy",
      intent_hash: options?.intentHash ?? "",
      autoplay_enabled: autoplayState.enabled ? "1" : "0",
      autoplay_status: autoplayState.status,
      autoplay_round: String(autoplayState.round),
      autoplay_max_rounds: String(autoplayState.maxRounds),
      autoplay_slots: JSON.stringify(autoplayState.coveredSlots),
      autoplay_current_slot: autoplayState.currentSlot ?? "",
      autoplay_done: autoplayState.done ? "1" : "0",
      autoplay_last_error: autoplayState.lastError ?? "",
    }),
    r.zadd(K.inboxJunior(juniorId), { score: now, member: chatId }),
    r.zadd(K.inboxSenior(seniorId), { score: now, member: chatId }),
    r.hset(K.a2aHandoff(chatId), {
      status: options?.handoffStatus ?? "pending",
      updated_at: String(now),
      note: "",
      brief: "",
      referral_prepared: "0",
      referral_prepared_at: "0",
      referral_prepared_by: "",
      connection_completed: "0",
      connection_completed_at: "0",
      connection_completed_by: "",
    }),
  ]);
  return chatId;
}

export async function appendUserMessage(
  chatId: string,
  content: string,
  ts: number = Date.now(),
  options?: {
    privacyLevel?: PrivacyLevel;
    traceRefs?: string[];
    source?: "manual" | "autoplay";
    slot?: A2ASlot;
  },
): Promise<void> {
  await getRedis().rpush(
    K.chatMsgs(chatId),
    JSON.stringify({
      role: "user",
      content,
      ts,
      privacyLevel: options?.privacyLevel,
      traceRefs: options?.traceRefs,
      source: options?.source,
      slot: options?.slot,
    }),
  );
}

export async function appendAssistantMessage(
  chatId: string,
  content: string,
  questionPreview: string,
  ts: number = Date.now(),
  options?: {
    citations?: string[];
    traceRefs?: string[];
    privacyLevel?: PrivacyLevel;
    source?: "manual" | "autoplay";
    slot?: A2ASlot;
  },
): Promise<void> {
  const meta = await getChatMeta(chatId);
  if (!meta) throw new Error(`chat ${chatId} not found`);
  await Promise.all([
    getRedis().rpush(
      K.chatMsgs(chatId),
      JSON.stringify({
        role: "assistant",
        content,
        ts,
        citations: options?.citations,
        traceRefs: options?.traceRefs,
        privacyLevel: options?.privacyLevel,
        source: options?.source,
        slot: options?.slot,
      }),
    ),
    setChatMeta(chatId, {
      lastMessageAt: ts,
      summary: questionPreview.slice(0, 60),
      status: "handoff_ready",
    }),
    getRedis().zadd(K.inboxJunior(meta.juniorId), { score: ts, member: chatId }),
    getRedis().zadd(K.inboxSenior(meta.seniorId), { score: ts, member: chatId }),
    getRedis().sadd(K.inboxSeniorUnread(meta.seniorId), chatId),
  ]);
}

export async function listSeniorInbox(seniorId: string): Promise<{
  chats: Array<ChatMeta & { unread: boolean }>;
  unreadCount: number;
}> {
  const [ids, unreadSet] = await Promise.all([
    getRedis().zrange<string[]>(K.inboxSenior(seniorId), 0, -1, { rev: true }),
    getRedis().smembers(K.inboxSeniorUnread(seniorId)),
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

export async function listJuniorChats(juniorId: string): Promise<ChatMeta[]> {
  const ids = await getRedis().zrange<string[]>(K.inboxJunior(juniorId), 0, -1, { rev: true });
  const metas = await Promise.all(ids.map((id) => getChatMeta(id)));
  return metas.filter((m): m is ChatMeta => m !== null);
}

export async function markChatRead(seniorId: string, chatId: string): Promise<void> {
  await getRedis().srem(K.inboxSeniorUnread(seniorId), chatId);
}

export async function appendTraceEvent(
  sessionId: string,
  event: Omit<StoredTraceEvent, "id" | "sessionId" | "ts"> & { id?: string; ts?: number },
): Promise<StoredTraceEvent> {
  const normalized: StoredTraceEvent = {
    id: event.id ?? randomUUID(),
    sessionId,
    stage: event.stage,
    actor: event.actor,
    payload: event.payload,
    ts: event.ts ?? Date.now(),
  };
  await getRedis().rpush(K.a2aTrace(sessionId), JSON.stringify(normalized));
  return normalized;
}

export async function getTraceEvents(sessionId: string): Promise<StoredTraceEvent[]> {
  const items = await getRedis().lrange<unknown>(K.a2aTrace(sessionId), 0, -1);
  return items
    .map((item) => (typeof item === "string" ? safeParseJson<unknown>(item) : item))
    .map(normalizeTraceEvent)
    .filter((event): event is StoredTraceEvent => event !== null);
}

export async function getA2ATurns(sessionId: string): Promise<StoredTurn[]> {
  const trace = await getTraceEvents(sessionId);
  const chatMessages = await getChatMessages(sessionId);
  const turns = chatMessages.map((message, index) => chatMessageToTurn(sessionId, index, message));

  const traceTurns = trace.map<StoredTurn>((event) => ({
    id: `${sessionId}:trace:${event.id}`,
    speaker: event.actor === "provider" ? "system" : event.actor,
    kind: event.stage === "retrieval" ? "retrieval" : event.stage === "privacy" ? "privacy_gate" : "intent",
    content: event.payload,
    privacyLevel: "public",
    visibleTo: "both",
    traceRefs: [event.id],
  }));

  return [...turns, ...traceTurns].sort((a, b) => {
    const aIndex = turns.findIndex((turn) => turn.id === a.id);
    const bIndex = turns.findIndex((turn) => turn.id === b.id);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return a.id.localeCompare(b.id);
  });
}

export async function getA2ASessionDetail(sessionId: string): Promise<A2ASessionDetail | null> {
  const meta = await getChatMeta(sessionId);
  if (!meta) return null;
  const [turns, trace, assessment] = await Promise.all([
    getA2ATurns(sessionId),
    getTraceEvents(sessionId),
    getA2AAssessment(sessionId),
  ]);
  return {
    ...meta,
    turns,
    trace,
    assessment,
  };
}

export async function getLegacyChatMessagesFromTurns(sessionId: string): Promise<ChatMessage[]> {
  const turns = await getA2ATurns(sessionId);
  return turns
    .filter((turn) => turn.speaker !== "system" || turn.kind !== "retrieval")
    .map((turn, index) => turnToChatMessage(turn, Date.now() + index));
}

export async function setHandoffStatus(
  sessionId: string,
  status: HandoffStatus,
  note: string = "",
): Promise<void> {
  const now = Date.now();
  await Promise.all([
    getRedis().hset(K.a2aHandoff(sessionId), {
      status,
      updated_at: String(now),
      note,
    }),
    setChatMeta(sessionId, {
      handoffStatus: status,
      status: getA2ASessionStatusForState({ handoffStatus: status }),
    }),
  ]);
}

export async function getHandoffState(sessionId: string): Promise<{
  status: HandoffStatus;
  updatedAt: number;
  note: string;
}> {
  const data = await getRedis().hgetall<Record<string, string>>(K.a2aHandoff(sessionId));
  return {
    status: (data?.status as HandoffStatus) ?? "pending",
    updatedAt: Number(data?.updated_at) || 0,
    note: data?.note ?? "",
  };
}

export async function setHandoffBrief(sessionId: string, brief: string): Promise<void> {
  const now = Date.now();
  await getRedis().hset(K.a2aHandoff(sessionId), {
    brief,
    updated_at: String(now),
  });
}

export async function getHandoffDetail(sessionId: string): Promise<{
  status: HandoffStatus;
  updatedAt: number;
  note: string;
  brief: string;
  referralPrepared: boolean;
  referralPreparedAt: number;
  referralPreparedBy: string;
  connectionCompleted: boolean;
  connectionCompletedAt: number;
  connectionCompletedBy: string;
}> {
  const data = await getRedis().hgetall<Record<string, string>>(K.a2aHandoff(sessionId));
  return {
    status: (data?.status as HandoffStatus) ?? "pending",
    updatedAt: Number(data?.updated_at) || 0,
    note: data?.note ?? "",
    brief: data?.brief ?? "",
    referralPrepared: data?.referral_prepared === "1",
    referralPreparedAt: Number(data?.referral_prepared_at) || 0,
    referralPreparedBy: data?.referral_prepared_by ?? "",
    connectionCompleted: data?.connection_completed === "1",
    connectionCompletedAt: Number(data?.connection_completed_at) || 0,
    connectionCompletedBy: data?.connection_completed_by ?? "",
  };
}

export async function setReferralPrepared(
  sessionId: string,
  prepared: boolean,
  actorId: string,
): Promise<void> {
  const now = Date.now();
  await getRedis().hset(K.a2aHandoff(sessionId), {
    referral_prepared: prepared ? "1" : "0",
    referral_prepared_at: String(prepared ? now : 0),
    referral_prepared_by: prepared ? actorId : "",
    connection_completed: prepared ? "0" : "0",
    connection_completed_at: "0",
    connection_completed_by: "",
    updated_at: String(now),
  });
}

export async function setConnectionCompleted(
  sessionId: string,
  completed: boolean,
  actorId: string,
): Promise<void> {
  const now = Date.now();
  await Promise.all([
    getRedis().hset(K.a2aHandoff(sessionId), {
      connection_completed: completed ? "1" : "0",
      connection_completed_at: String(completed ? now : 0),
      connection_completed_by: completed ? actorId : "",
      updated_at: String(now),
    }),
    setChatMeta(sessionId, {
      status: getA2ASessionStatusForState({
        handoffStatus: "approved",
        connectionCompleted: completed,
      }),
    }),
  ]);
}

export async function setA2AAssessment(
  juniorId: string,
  sessionId: string,
  assessment: A2AAssessment,
): Promise<void> {
  await Promise.all([
    getRedis().set(K.a2aAssessment(sessionId), JSON.stringify(assessment)),
    getRedis().hset(K.a2aAssessmentByIntent(juniorId, assessment.intentHash), {
      [sessionId]: JSON.stringify(assessment),
    }),
  ]);
}

export async function getA2AAssessment(sessionId: string): Promise<A2AAssessment | null> {
  const raw = await getRedis().get<string | object>(K.a2aAssessment(sessionId));
  if (!raw) return null;
  try {
    return typeof raw === "string" ? safeParseJson<A2AAssessment>(raw) : (raw as A2AAssessment);
  } catch {
    return null;
  }
}

export async function listA2AAssessmentsForIntent(
  juniorId: string,
  intentHash: string,
): Promise<A2AAssessment[]> {
  const raw = await getRedis().hgetall<Record<string, string>>(K.a2aAssessmentByIntent(juniorId, intentHash));
  if (!raw) return [];
  return Object.values(raw)
    .map((item) => safeParseJson<A2AAssessment>(item))
    .filter((item): item is A2AAssessment => item !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
