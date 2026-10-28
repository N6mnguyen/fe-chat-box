import { z } from 'zod';
import { Cursor, DisplayName, Id, Limit, Page, Seq, Timestamp, Username } from './common.ts';

export const PublicUser = z
  .object({ id: Id, username: Username, displayName: DisplayName.nullable() })
  .meta({ id: 'PublicUser' });
export const UserLookup = PublicUser.nullable().meta({ id: 'UserLookup' });
// Không có trường suppressed: người gửi thấy lời mời suppressed y như lời mời đang chờ.
export const FriendRequest = z
  .object({ id: Id, sender: PublicUser, recipient: PublicUser, status: z.literal('pending'), createdAt: Timestamp, expiresAt: Timestamp })
  .meta({ id: 'FriendRequest' });
export const Friend = z.object({ user: PublicUser, since: Timestamp }).meta({ id: 'Friend' });
export const Block = z.object({ user: PublicUser, createdAt: Timestamp }).meta({ id: 'Block' });
export const FriendRequestCreate = z.object({ username: Username }).meta({ id: 'FriendRequestCreate' });
export const UserDirectoryQuery = z.object({
  q: z.string().trim().min(2).max(80).optional(),
  cursor: Cursor.optional(),
  limit: Limit(100, 30),
}).meta({ id: 'UserDirectoryQuery' });
export const BlockCreate = z.object({ username: Username }).meta({ id: 'BlockCreate' });

// Trích dẫn đọc từ tin gốc lúc truy vấn (không lưu bản sao). Tin gốc thu hồi hoặc bị tôi ẩn:
// available=false, body=null -> UI hiện "Tin nhắn không còn khả dụng".
export const ReplyPreview = z
  .object({ id: Id, senderId: Id, available: z.boolean(), body: z.string().max(200).nullable() })
  .meta({ id: 'ReplyPreview' });

export const Reaction = z
  .object({ emoji: z.string().min(1).max(8), count: z.number().int().positive(), mine: z.boolean() })
  .meta({ id: 'Reaction' });

export const Message = z
  .object({
    id: Id,
    conversationId: Id,
    senderId: Id,
    clientMsgId: Id,
    createdSeq: Seq,
    latestSeq: Seq, // latest change seq, createdSeq khi chưa sửa/thu hồi
    body: z.string().nullable(),
    deleted: z.boolean(),
    replyTo: ReplyPreview.nullable(),
    attachments: z.array(z.never()).max(0), // file sau MVP; chỉ [] trong v1
    senderName: z.string().max(80).optional(),
    reactions: z.array(Reaction).optional(),
    status: z.enum(['sent', 'delivered', 'seen']).optional(),
    editedAt: Timestamp.nullable().optional(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .meta({ id: 'Message' });

export const SendMessageRequest = z
  .object({ clientMsgId: Id, body: z.string().min(1).max(10_000), replyToId: Id.nullable().default(null), attachments: z.array(z.never()).max(0).default([]) })
  .meta({ id: 'SendMessageRequest' });
export const SendMessageResponse = z.object({ message: Message, duplicate: z.boolean() }).meta({ id: 'SendMessageResponse' });
export const EditMessageRequest = z.object({ body: z.string().min(1).max(10_000) }).meta({ id: 'EditMessageRequest' });
export const ReactionToggle = z.object({ emoji: z.string().min(1).max(8) }).meta({ id: 'ReactionToggle' });

export const Conversation = z
  .object({
    id: Id,
    type: z.literal('direct'),
    peer: PublicUser.nullable(), // null khi peer đã xóa tài khoản
    peerDeleted: z.boolean(),
    lastSeq: Seq,
    lastDeliveredSeq: Seq,
    lastReadSeq: Seq,
    peerDeliveredSeq: Seq,
    // null khi một trong hai bên tắt "đã xem" (đối xứng)
    peerReadSeq: Seq.nullable(),
    unreadCount: z.number().int().nonnegative(), // tin của peer có createdSeq > lastReadSeq, chưa thu hồi, chưa ẩn
    lastMessage: Message.nullable(),
    pinned: z.boolean(),
    muted: z.boolean(),
    createdAt: Timestamp,
  })
  .meta({ id: 'Conversation' });

export const ConversationPatch = z
  .object({ pinned: z.boolean().optional(), muted: z.boolean().optional() })
  .refine((x) => x.pinned !== undefined || x.muted !== undefined)
  .meta({ id: 'ConversationPatch' });
export const GroupCreate = z.object({ type: z.literal('group') }).meta({ id: 'GroupCreate' });
export const DirectCreate = z.object({ type: z.literal('direct'), peerId: Id }).meta({ id: 'DirectCreate' });
export const ConversationCreate = z.union([DirectCreate, GroupCreate]).meta({ id: 'ConversationCreate' });

export const ReceiptUpdate = z
  .object({ deliveredSeq: Seq.optional(), readSeq: Seq.optional() })
  .refine((x) => x.deliveredSeq !== undefined || x.readSeq !== undefined)
  .meta({ id: 'ReceiptUpdate' });
export const Receipt = z
  .object({ conversationId: Id, userId: Id, deliveredSeq: Seq, readSeq: Seq, updatedAt: Timestamp })
  .meta({ id: 'Receipt' });

export const ReportCreate = z
  .object({ targetUserId: Id.optional(), messageId: Id.optional(), reason: z.enum(['spam', 'harassment', 'other']), note: z.string().max(1000).optional() })
  .refine((x) => Number(!!x.targetUserId) + Number(!!x.messageId) === 1)
  .meta({ id: 'ReportCreate' });
export const ReportAccepted = z.object({ reportId: Id, status: z.literal('received') }).meta({ id: 'ReportAccepted' });

export const Change = z
  .object({ seq: Seq, messageId: Id, kind: z.enum(['created', 'edited', 'recalled', 'purged', 'redacted']), message: Message })
  .meta({ id: 'Change' });
export const EntityChange = z
  .object({ seq: Seq, entityType: z.enum(['profile', 'settings', 'device', 'friend_request', 'friendship', 'block', 'conversation', 'message_visibility']), entityId: Id, kind: z.enum(['upsert', 'delete']) })
  .meta({ id: 'EntityChange' });
export const SyncPage = z
  .object({
    items: z.array(EntityChange),
    nextCursor: Cursor.nullable(),
    conversations: z.array(z.object({ id: Id, lastSeq: Seq })),
    initial: z.boolean(),
    recentMessages: z.array(Message).optional(), // initial=true: tối đa 20 tin mới nhất mỗi hội thoại
  })
  .meta({ id: 'SyncPage' });

export const UserSearchQuery = z.object({ username: Username });
export const PaginationQuery = z.object({ cursor: Cursor.optional(), limit: Limit(100, 30) });
export const MessageHistoryQuery = z.object({ cursor: Cursor.optional(), limit: Limit(100, 50) });
export const ChangesQuery = z.object({ afterSeq: Seq, limit: Limit(200, 100) });
export const SyncQuery = z.object({ cursor: Cursor.optional(), limit: Limit(200, 100) });

export const FriendRequestPage = Page(FriendRequest).meta({ id: 'FriendRequestPage' });
export const FriendPage = Page(Friend).meta({ id: 'FriendPage' });
export const BlockPage = Page(Block).meta({ id: 'BlockPage' });
export const ConversationPage = Page(Conversation).meta({ id: 'ConversationPage' });
export const MessagePage = Page(Message).meta({ id: 'MessagePage' });
export const ChangePage = Page(Change).meta({ id: 'ChangePage' });

export type Message = z.infer<typeof Message>;
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;
export type SendMessageResponse = z.infer<typeof SendMessageResponse>;
export type Conversation = z.infer<typeof Conversation>;
export type Receipt = z.infer<typeof Receipt>;
export type SyncPage = z.infer<typeof SyncPage>;
