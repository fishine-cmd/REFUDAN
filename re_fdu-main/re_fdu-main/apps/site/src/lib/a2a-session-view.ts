import type {
  A2AProvider,
  A2ASessionStatus,
  HandoffStatus,
  PrivacyLevel,
} from "@re-fudan/contracts";
import type { ChatMeta } from "./chat-redis";

export type A2AFlowStage =
  | "pending"
  | "rejected"
  | "p4-ready"
  | "p4-prepared"
  | "p4-completed";

export interface A2ASessionProgressState {
  handoffStatus: HandoffStatus;
  referralPrepared?: boolean;
  connectionCompleted?: boolean;
}

export interface A2ASessionCardBase extends A2ASessionProgressState {
  chatId: string;
  createdAt: number;
  lastMessageAt: number;
  summary: string;
  status: A2ASessionStatus;
  provider: A2AProvider;
  privacyLevel: PrivacyLevel;
  flowStage: A2AFlowStage;
  entryHref: string;
}

export function getA2AFlowStage(state: A2ASessionProgressState): A2AFlowStage {
  if (state.handoffStatus === "rejected") return "rejected";
  if (state.handoffStatus !== "approved") return "pending";
  if (state.connectionCompleted) return "p4-completed";
  if (state.referralPrepared) return "p4-prepared";
  return "p4-ready";
}

export function getA2AFlowStageLabel(stage: A2AFlowStage): string {
  switch (stage) {
    case "pending":
      return "待审批 handoff";
    case "rejected":
      return "已拒绝，继续 A2A";
    case "p4-ready":
      return "P4 待准备";
    case "p4-prepared":
      return "P4 已准备";
    case "p4-completed":
      return "P4 已完成";
  }
}

export function getA2ASessionEntryHref(sessionId: string, handoffStatus: HandoffStatus): string {
  return handoffStatus === "approved"
    ? `/a2a/${sessionId}/referral`
    : `/a2a/${sessionId}`;
}

export function getA2ASessionStatusForState(
  state: A2ASessionProgressState,
): A2ASessionStatus {
  if (state.connectionCompleted) return "completed";
  if (state.handoffStatus === "rejected") return "running";
  return "handoff_ready";
}

export function toA2ASessionCardBase(
  chat: ChatMeta,
  handoff?: Pick<A2ASessionProgressState, "referralPrepared" | "connectionCompleted">,
): A2ASessionCardBase {
  const referralPrepared = handoff?.referralPrepared ?? false;
  const connectionCompleted = handoff?.connectionCompleted ?? false;
  const state: A2ASessionProgressState = {
    handoffStatus: chat.handoffStatus,
    referralPrepared,
    connectionCompleted,
  };

  return {
    chatId: chat.chatId,
    createdAt: chat.createdAt,
    lastMessageAt: chat.lastMessageAt,
    summary: chat.summary,
    status: chat.status,
    provider: chat.provider,
    privacyLevel: chat.privacyLevel,
    handoffStatus: chat.handoffStatus,
    referralPrepared,
    connectionCompleted,
    flowStage: getA2AFlowStage(state),
    entryHref: getA2ASessionEntryHref(chat.chatId, chat.handoffStatus),
  };
}
