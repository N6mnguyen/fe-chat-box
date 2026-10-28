import { z } from 'zod';
import { Id, Seq, Timestamp } from './common.ts';
import { Message, Receipt, SendMessageRequest, FriendRequest, PublicUser } from './chat.ts';

// Socket.IO, transports: ['websocket']. Handshake: auth = { accessToken }.
// Server join `user:<userId>` + `device:<deviceId>`. Sự kiện chỉ là gợi ý; REST + seq là nguồn chân lý.

export const WsAck = <T extends z.ZodType>(data: T) =>
  z.union([
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: z.object({ code: z.string(), retryAfterMs: z.number().int().optional() }) }),
  ]);

// Client -> server
export const ClientEvents = {
  'message.send': SendMessageRequest.extend({ conversationId: Id }),
  typing: z.object({ conversationId: Id, state: z.enum(['start', 'stop']) }),
  'presence.ping': z.object({}),
  'receipt.update': z.object({ conversationId: Id, deliveredSeq: Seq.optional(), readSeq: Seq.optional() }),
  'auth.refresh': z.object({ accessToken: z.string() }),
} as const;

export const ClientAcks = {
  'message.send': WsAck(z.object({ messageId: Id, seq: Seq, duplicate: z.boolean(), createdAt: Timestamp })),
  typing: WsAck(z.object({})),
  'presence.ping': WsAck(z.object({ serverTime: Timestamp })),
  'receipt.update': WsAck(Receipt),
  'auth.refresh': WsAck(z.object({ expiresAt: Timestamp })),
} as const;

// Server -> client
export const ServerEvents = {
  'message.new': z.object({ message: Message }),
  'message.recalled': z.object({ conversationId: Id, messageId: Id, seq: Seq }), // một lần thu hồi
  // Purge: một sự kiện tổng mỗi hội thoại bị ảnh hưởng, phát khi job xong; client gọi /changes.
  'messages.purged': z.object({ conversationId: Id, lastSeq: Seq }),
  'message.hidden': z.object({ conversationId: Id, messageId: Id }), // chỉ tới device của chính user
  'receipt.updated': Receipt,
  'friend.request': z.object({ request: FriendRequest }),
  'friend.accepted': z.object({ user: PublicUser, conversationId: Id }),
  presence: z.object({ userId: Id, online: z.boolean() }),
  typing: z.object({ conversationId: Id, userId: Id, state: z.enum(['start', 'stop']) }),
  'session.revoked': z.object({ reason: z.enum(['logout', 'remote_logout', 'password_reset', 'account_deleted', 'token_reuse']) }),
  'auth.expiring': z.object({ expiresAt: Timestamp }),
  'sync.hint': z.object({ scope: z.enum(['user', 'conversation']), conversationId: Id.optional(), seq: Seq }),
} as const;

export type ClientEventName = keyof typeof ClientEvents;
export type ServerEventName = keyof typeof ServerEvents;
export type ClientPayload<E extends ClientEventName> = z.infer<(typeof ClientEvents)[E]>;
export type ClientAck<E extends ClientEventName> = z.infer<(typeof ClientAcks)[E]>;
export type ServerPayload<E extends ServerEventName> = z.infer<(typeof ServerEvents)[E]>;
