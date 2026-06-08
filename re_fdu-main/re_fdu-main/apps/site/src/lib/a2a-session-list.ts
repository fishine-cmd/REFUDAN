import { getHandoffDetail, listJuniorChats, listSeniorInbox } from "./chat-redis";
import { findUserById, toPublicUser } from "./users-redis";
import { toA2ASessionCardBase, type A2ASessionCardBase } from "./a2a-session-view";

type PublicUser = ReturnType<typeof toPublicUser>;

export interface JuniorSessionCard extends A2ASessionCardBase {
  senior: PublicUser | null;
}

export interface SeniorInboxCard extends A2ASessionCardBase {
  unread: boolean;
  junior: PublicUser | null;
}

export async function listJuniorSessionCards(juniorId: string): Promise<JuniorSessionCard[]> {
  const chats = await listJuniorChats(juniorId);
  const [handoffs, seniors] = await Promise.all([
    Promise.all(chats.map((chat) => getHandoffDetail(chat.chatId))),
    Promise.all(
      [...new Set(chats.map((chat) => chat.seniorId))].map((id) => findUserById(id)),
    ),
  ]);

  const seniorMap = new Map(
    seniors
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((row) => [row.id, toPublicUser(row)]),
  );

  return chats.map((chat, index) => ({
    ...toA2ASessionCardBase(chat, {
      referralPrepared: handoffs[index]?.referralPrepared,
      connectionCompleted: handoffs[index]?.connectionCompleted,
    }),
    senior: seniorMap.get(chat.seniorId) ?? null,
  }));
}

export async function listSeniorInboxCards(seniorId: string): Promise<{
  unreadCount: number;
  inbox: SeniorInboxCard[];
}> {
  const { chats, unreadCount } = await listSeniorInbox(seniorId);
  const [handoffs, juniors] = await Promise.all([
    Promise.all(chats.map((chat) => getHandoffDetail(chat.chatId))),
    Promise.all(
      [...new Set(chats.map((chat) => chat.juniorId))].map((id) => findUserById(id)),
    ),
  ]);

  const juniorMap = new Map(
    juniors
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((row) => [row.id, toPublicUser(row)]),
  );

  return {
    unreadCount,
    inbox: chats.map((chat, index) => ({
      ...toA2ASessionCardBase(chat, {
        referralPrepared: handoffs[index]?.referralPrepared,
        connectionCompleted: handoffs[index]?.connectionCompleted,
      }),
      unread: chat.unread,
      junior: juniorMap.get(chat.juniorId) ?? null,
    })),
  };
}
