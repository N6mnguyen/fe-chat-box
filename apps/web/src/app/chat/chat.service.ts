import { Inject, Injectable, computed, signal } from '@angular/core';

import {
  ApiConversation,
  ApiAttachment,
  AttachmentDownloadUrl,
  ApiFriend,
  ApiFriendRequest,
  ApiMessage,
  ApiUserPage,
  ChatApi,
  ChatPort,
} from './chat-api';
import {
  Conversation,
  LoadState,
  Message,
  ReplyRef,
  StudyResultPayload,
} from './chat.models';
import { RealtimeClient } from './realtime-client';

export const DELETE_FOR_ALL_MS = 15 * 60_000;

export type AttachmentSendStage = 'upload' | 'send' | 'download-url';

export class AttachmentSendError extends Error {
  constructor(
    readonly sentFiles: number,
    readonly textSent: boolean,
    readonly stage: AttachmentSendStage,
    options?: ErrorOptions,
  ) {
    super('Gửi tệp đính kèm không hoàn tất.', options);
    this.name = 'AttachmentSendError';
  }
}

interface PendingAttachmentUpload {
  attachment: ApiAttachment;
  clientMsgId: string;
  signature: string;
}

/** Chỉ xóa cho mọi người trong 15 phút, với tin của mình đã gửi. */
export function canDeleteForAll(message: Message, meId: string, now = Date.now()): boolean {
  return message.senderId === meId && !message.recalledAt &&
    ['sent', 'delivered', 'seen'].includes(message.status) &&
    now >= message.createdAt && now - message.createdAt < DELETE_FOR_ALL_MS;
}

/** Chỉ sửa được tin văn bản của chính mình, chưa thu hồi và không còn đang gửi. */
export function canEditMessage(message: Message, meId: string): boolean {
  return message.senderId === meId &&
    message.type === 'text' &&
    !message.recalledAt &&
    message.status !== 'queued' &&
    message.status !== 'sending';
}

function isStudyResultPayload(value: unknown): value is StudyResultPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const result = value as Record<string, unknown>;
  return typeof result['sessionId'] === 'string'
    && typeof result['topic'] === 'string'
    && (result['mode'] === 'flashcard' || result['mode'] === 'fill_blank' || result['mode'] === 'listen_fill')
    && Number.isInteger(result['wordCount'])
    && typeof result['score'] === 'number'
    && typeof result['total'] === 'number'
    && typeof result['percent'] === 'number'
    && typeof result['durationSec'] === 'number'
    && typeof result['streak'] === 'number'
    && Array.isArray(result['wrongWords'])
    && typeof result['botText'] === 'string'
    && typeof result['fallbackText'] === 'string';
}

// Poll chỉ là dự phòng. Có realtime: 60s/lần (tự chữa nếu lỡ ping); không có: 5s/lần.
const POLL_MS = 5000;
const POLL_MS_WITH_REALTIME = 60_000;
const RELATIONSHIP_POLL_EVERY = 6;

@Injectable({ providedIn: 'root' })
export class ChatService {
  meId = '';
  meName = '';
  readonly meUsername = signal('');
  readonly loadState = signal<LoadState>('loading');
  readonly selectedId = signal<string | null>(null);
  readonly typingId = signal<string | null>(null);
  readonly conversations = signal<Conversation[]>([]);
  readonly friends = signal<ApiFriend[]>([]);
  readonly incomingFriendRequests = signal<ApiFriendRequest[]>([]);
  readonly outgoingFriendRequests = signal<ApiFriendRequest[]>([]);

  private readonly messageMap = signal<Record<string, Message[]>>({});
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private refreshTask: Promise<void> | null = null;
  private refreshAgain = false;
  private relationshipsWanted = false;
  private pollTicks = 0;
  private realtime: RealtimeClient | null = null;
  private readonly pendingAttachmentUploads = new WeakMap<File, PendingAttachmentUpload>();

  readonly sortedConversations = computed(() =>
    [...this.conversations()].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.lastAt - a.lastAt,
    ),
  );
  readonly selected = computed(
    () => this.conversations().find((c) => c.id === this.selectedId()) ?? null,
  );
  readonly selectedMessages = computed(
    () => (this.messageMap()[this.selectedId() ?? ''] ?? []).filter((m) => !m.deletedForMe),
  );
  readonly totalUnread = computed(() =>
    this.conversations()
      .filter((c) => !c.muted)
      .reduce((sum, c) => sum + c.unread, 0),
  );

  constructor(@Inject(ChatApi) private readonly api: ChatPort) {}

  async load(): Promise<void> {
    this.loadState.set('loading');
    try {
      const me = await this.api.me();
      this.meId = me.id;
      this.meName = me.displayName || me.email;
      this.meUsername.set(me.username);
      const [items, requests, friends, outgoingRequests] = await Promise.all([
        this.api.conversations(),
        this.api.incomingFriendRequests(),
        this.api.friends(),
        this.api.outgoingFriendRequests(),
      ]);
      this.conversations.set(items.map((item) => this.toConversation(item)));
      this.incomingFriendRequests.set(requests);
      this.friends.set(friends);
      this.outgoingFriendRequests.set(outgoingRequests);
      this.messageMap.set({});
      this.loadState.set('ready');
      this.startPolling();
    } catch (error) {
      console.error('Không tải được dữ liệu hội thoại', error);
      this.loadState.set('error');
    }
  }

  select(id: string | null): void {
    this.selectedId.set(id);
    if (id) {
      void this.loadMessages(id).catch((error: unknown) => {
        console.error('Không tải được lịch sử tin nhắn', error);
      });
    }
  }

  async togglePinned(id: string): Promise<void> {
    const conversation = this.conversations().find((item) => item.id === id);
    if (!conversation) {
      return;
    }
    const updated = await this.api.updateConversation(id, { pinned: !conversation.pinned });
    this.replaceConversation(updated);
  }

  async toggleMuted(id: string): Promise<void> {
    const conversation = this.conversations().find((item) => item.id === id);
    if (!conversation) {
      return;
    }
    const updated = await this.api.updateConversation(id, { muted: !conversation.muted });
    this.replaceConversation(updated);
  }

  async sendFriendRequest(username: string): Promise<void> {
    await this.api.sendFriendRequest(username.trim());
    await this.refreshConversationList();
  }

  async declineFriendRequest(requestId: string): Promise<void> {
    await this.api.declineFriendRequest(requestId);
    await this.refreshConversationList();
  }

  async cancelFriendRequest(requestId: string): Promise<void> {
    await this.api.cancelFriendRequest(requestId);
    await this.refreshConversationList();
  }

  async removeFriend(userId: string): Promise<void> {
    await this.api.removeFriend(userId);
    await this.refreshConversationList();
  }

  discoverUsers(query: string, cursor?: string | null): Promise<ApiUserPage> {
    return this.api.discoverUsers(query.trim(), cursor);
  }

  async acceptFriendRequest(requestId: string): Promise<string> {
    const apiConversation = await this.api.acceptFriendRequest(requestId);
    const conversation = this.toConversation(apiConversation);
    this.conversations.update((items) => [
      conversation,
      ...items.filter((item) => item.id !== conversation.id),
    ]);
    this.incomingFriendRequests.update((requests) =>
      requests.filter((request) => request.id !== requestId),
    );
    await this.refreshConversationList();
    return conversation.id;
  }

  async send(
    conversationId: string,
    content: string,
    files: File[],
    replyTo?: ReplyRef,
  ): Promise<void> {
    const text = content.trim();
    if (!text && !files.length) {
      return;
    }
    if (files.length > 20) {
      throw new Error('Mỗi tin nhắn chỉ được gửi tối đa 20 tệp.');
    }

    if (files.length) {
      let sentFiles = 0;
      let textSent = false;
      let stage: AttachmentSendStage = 'upload';
      try {
        for (const file of files) {
          const messageContent = sentFiles === 0 ? text : '';
          const messageReply = sentFiles === 0 ? replyTo : undefined;
          const signature = JSON.stringify({
            body: messageContent,
            replyToId: messageReply?.messageId ?? null,
          });
          let pending = this.pendingAttachmentUploads.get(file);
          if (!pending || pending.signature !== signature) {
            stage = 'upload';
            pending = {
              attachment: await this.api.uploadAttachment(file),
              clientMsgId: crypto.randomUUID(),
              signature,
            };
            this.pendingAttachmentUploads.set(file, pending);
          }

          stage = 'send';
          const apiMessage = await this.api.sendMessage(
            conversationId,
            pending.clientMsgId,
            messageContent,
            messageReply,
            [pending.attachment.id],
          );
          sentFiles += 1;
          textSent ||= !!messageContent;
          stage = 'download-url';
          const urls = await this.api.attachmentDownloadUrls([pending.attachment.id]);
          this.appendMessage(this.toMessage(apiMessage, conversationId, urls));
          this.syncPreview(conversationId);
          this.pendingAttachmentUploads.delete(file);
        }
      } catch (error) {
        throw new AttachmentSendError(sentFiles, textSent, stage, { cause: error });
      }
      return;
    }

    const clientMsgId = crypto.randomUUID();
    const optimistic: Message = {
      id: clientMsgId,
      clientMsgId,
      conversationId,
      seq: this.nextSequence(conversationId),
      senderId: this.meId,
      senderName: this.meName,
      type: 'text',
      content: text,
      status: 'sending',
      replyTo,
      createdAt: Date.now(),
    };
    this.appendMessage(optimistic);
    this.syncPreview(conversationId);
    await this.persistMessage(optimistic, replyTo);
  }

  async retry(conversationId: string, messageId: string): Promise<void> {
    const message = this.findMessage(conversationId, messageId);
    if (!message || message.senderId !== this.meId || message.status !== 'failed') {
      return;
    }
    this.updateMessage(conversationId, messageId, { status: 'sending', failureReason: undefined });
    await this.persistMessage(message, message.replyTo);
  }

  async editMessage(conversationId: string, messageId: string, content: string): Promise<boolean> {
    const text = content.trim();
    const message = this.findMessage(conversationId, messageId);
    if (!text || !message || !canEditMessage(message, this.meId)) {
      return false;
    }
    const updated = await this.api.editMessage(conversationId, messageId, text);
    this.updateMessage(conversationId, messageId, this.toMessage(updated, conversationId));
    this.syncPreview(conversationId);
    return true;
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<boolean> {
    const message = this.findMessage(conversationId, messageId);
    if (!message || message.deletedForMe) {
      return false;
    }
    await this.api.hideMessage(conversationId, messageId);
    this.updateMessage(conversationId, messageId, { deletedForMe: true });
    this.syncPreview(conversationId);
    return true;
  }

  async deleteForAll(conversationId: string, messageId: string): Promise<boolean> {
    const message = this.findMessage(conversationId, messageId);
    if (!message || !canDeleteForAll(message, this.meId)) {
      return false;
    }
    const recalled = await this.api.recallMessage(conversationId, messageId);
    this.updateMessage(conversationId, messageId, this.toMessage(recalled, conversationId));
    this.messageMap.update((map) => Object.fromEntries(Object.entries(map).map(([id, messages]) => [
      id,
      messages.map((item) => item.replyTo?.messageId === messageId
        ? { ...item, replyTo: { ...item.replyTo, text: '' } }
        : item),
    ])));
    this.syncPreview(conversationId);
    return true;
  }

  async forwardMessage(messageId: string, sourceId: string, targets: string[]): Promise<Record<string, boolean>> {
    const source = this.findMessage(sourceId, messageId);
    if (!source || source.recalledAt || source.deletedForMe || !source.content.trim()) {
      return Object.fromEntries(targets.map((id) => [id, false]));
    }
    const result: Record<string, boolean> = {};
    for (const id of [...new Set(targets)]) {
      try {
        await this.send(id, source.content, []);
        result[id] = true;
      } catch (error) {
        console.error(`Không chuyển được tin sang hội thoại ${id}`, error);
        result[id] = false;
      }
    }
    return result;
  }

  async react(conversationId: string, messageId: string, emoji: string): Promise<void> {
    const updated = await this.api.toggleReaction(conversationId, messageId, emoji);
    this.updateMessage(conversationId, messageId, this.toMessage(updated, conversationId));
  }

  stop(): void {
    this.selectedId.set(null);
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.realtime?.close();
    this.realtime = null;
  }

  private async loadMessages(conversationId: string): Promise<void> {
    const apiMessages = await this.api.messages(conversationId);
    const attachmentIds = [...new Set(apiMessages.flatMap((message) =>
      message.attachments.map((attachment) => attachment.id),
    ))];
    const attachmentUrls = attachmentIds.length
      ? await this.api.attachmentDownloadUrls(attachmentIds)
      : [];
    const persistedMessages = apiMessages
      .map((message) => this.toMessage(message, conversationId, attachmentUrls))
      .sort((a, b) => a.seq - b.seq);
    const persistedIds = new Set(persistedMessages.map((message) => message.id));
    const persistedClientIds = new Set(persistedMessages.map((message) => message.clientMsgId));
    const pending = (this.messageMap()[conversationId] ?? []).filter((message) =>
      (message.status === 'sending' || message.status === 'failed') &&
      !persistedIds.has(message.id) &&
      !persistedClientIds.has(message.clientMsgId),
    );
    const messages = [...persistedMessages, ...pending].sort((a, b) => a.seq - b.seq);
    this.messageMap.update((map) => ({ ...map, [conversationId]: messages }));
    const lastIncoming = [...apiMessages].find((message) => message.senderId !== this.meId);
    if (apiMessages.length) {
      const newestSeq = apiMessages.reduce(
        (latest, message) => BigInt(message.createdSeq) > BigInt(latest) ? message.createdSeq : latest,
        '0',
      );
      await this.api.updateReceipts(conversationId, newestSeq);
    }
    if (this.selectedId() === conversationId && lastIncoming) {
      this.patchConversation(conversationId, { unread: 0 });
    }
  }

  private async persistMessage(message: Message, replyTo?: ReplyRef): Promise<void> {
    try {
      const apiMessage = await this.api.sendMessage(
        message.conversationId,
        message.clientMsgId,
        message.content,
        replyTo,
      );
      const persisted = this.toMessage(apiMessage, message.conversationId);
      this.messageMap.update((map) => ({
        ...map,
        [message.conversationId]: [
          ...(map[message.conversationId] ?? []).filter((item) =>
            item.id !== message.id && item.clientMsgId !== message.clientMsgId && item.id !== persisted.id,
          ),
          persisted,
        ].sort((a, b) => a.seq - b.seq),
      }));
      this.syncPreview(message.conversationId);
    } catch (error) {
      const alreadyLoaded = this.messageMap()[message.conversationId]?.some((item) =>
        item.clientMsgId === message.clientMsgId && item.id !== message.id,
      );
      if (alreadyLoaded) {
        return;
      }
      this.updateMessage(message.conversationId, message.id, {
        status: 'failed',
        failureReason: 'network',
        attempts: (message.attempts ?? 0) + 1,
      });
      throw error;
    }
  }

  refreshRelationships(): Promise<void> {
    return this.refreshConversationList();
  }

  private refreshConversationList(withRelationships = true): Promise<void> {
    this.relationshipsWanted ||= withRelationships;
    if (this.refreshTask) {
      this.refreshAgain = true;
      return this.refreshTask.then(() =>
        this.refreshAgain ? this.refreshConversationList(false) : undefined,
      );
    }
    const task = this.performRefresh();
    this.refreshTask = task;
    return task.finally(() => {
      if (this.refreshTask === task) {
        this.refreshTask = null;
      }
    });
  }

  private async performRefresh(): Promise<void> {
    do {
      this.refreshAgain = false;
      const withRelationships = this.relationshipsWanted;
      this.relationshipsWanted = false;
      const [items, relationships] = await Promise.all([
        this.api.conversations(),
        withRelationships
          ? Promise.all([
              this.api.incomingFriendRequests(),
              this.api.friends(),
              this.api.outgoingFriendRequests(),
            ])
          : null,
      ]);
      const conversations = items.map((item) => this.toConversation(item));
      this.conversations.set(conversations);
      if (relationships) {
        this.incomingFriendRequests.set(relationships[0]);
        this.friends.set(relationships[1]);
        this.outgoingFriendRequests.set(relationships[2]);
      }
      const selectedId = this.selectedId();
      if (selectedId && !conversations.some((item) => item.id === selectedId)) {
        this.selectedId.set(null);
      } else if (selectedId) {
        await this.loadMessages(selectedId);
      }
    } while (this.refreshAgain);
  }

  /** Realtime báo có thay đổi -> tải lại ngay. Poll chỉ là dự phòng, thưa hơn khi realtime đang nối. */
  private startPolling(): void {
    if (this.pollHandle) {
      return;
    }
    this.schedulePoll(POLL_MS);
    void this.startRealtime();
  }

  private schedulePoll(ms: number): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }
    this.pollHandle = setInterval(() => {
      if (document.hidden) {
        return;
      }
      this.pollTicks += 1;
      // Không realtime: bạn bè/lời mời làm mới mỗi 6 nhịp. Có realtime: mỗi nhịp (đã thưa 60s).
      const every = this.realtime?.connected ? 1 : RELATIONSHIP_POLL_EVERY;
      void this.refreshConversationList(this.pollTicks % every === 0).catch((error: unknown) => {
        console.error('Không đồng bộ được hội thoại', error);
      });
    }, ms);
  }

  private async startRealtime(): Promise<void> {
    try {
      const config = (await this.api.realtimeConfig?.()) ?? {};
      if (!config.url || !config.key || !config.topic || this.realtime) {
        return;
      }
      this.realtime = new RealtimeClient(
        { url: config.url, key: config.key, topic: config.topic },
        () => {
          void this.refreshConversationList(true).catch((error: unknown) => {
            console.error('Không đồng bộ được hội thoại', error);
          });
        },
        (connected: boolean) => {
          this.schedulePoll(connected ? POLL_MS_WITH_REALTIME : POLL_MS);
          if (connected) {
            // Bù những ping bị lỡ trong lúc mất kết nối.
            void this.refreshConversationList(true).catch(() => undefined);
          }
        },
      );
    } catch {
      // Không có realtime: vẫn poll 5s.
    }
  }

  private toConversation(api: ApiConversation): Conversation {
    return this.api.toConversation(api, this.meId);
  }

  private replaceConversation(api: ApiConversation): void {
    const updated = this.toConversation(api);
    this.conversations.update((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  private toMessage(
    api: ApiMessage,
    conversationId: string,
    attachmentUrls: AttachmentDownloadUrl[] = [],
  ): Message {
    const conversation = this.conversations().find((item) => item.id === conversationId);
    const url = attachmentUrls.find((item) => item.id === api.attachments[0]?.id);
    const existing = this.findMessage(conversationId, api.id)?.attachment;
    const metadata = api.attachments[0];
    const attachment = metadata
      ? {
          id: metadata.id,
          name: metadata.name,
          size: metadata.size,
          mimeType: metadata.mimeType,
          url: url?.url ?? existing?.url ?? '',
          downloadUrl: url?.downloadUrl ?? existing?.downloadUrl ?? '',
        }
      : undefined;
    const deletedAt = api.deleted ? Date.parse(api.updatedAt) : undefined;
    const studyResult = isStudyResultPayload(api.structuredPayload) ? api.structuredPayload : undefined;
    return {
      id: api.id,
      clientMsgId: api.clientMsgId,
      conversationId,
      seq: Number(api.createdSeq),
      senderId: api.senderId,
      senderName: api.senderName,
      senderIsBot: api.senderIsBot,
      type: studyResult
        ? 'study_result'
        : attachment
          ? (attachment.mimeType?.startsWith('image/') ? 'image' : 'file')
          : 'text',
      content: api.body ?? studyResult?.fallbackText ?? '',
      studyResult,
      status: api.status,
      attachment,
      replyTo: api.replyTo
        ? {
            messageId: api.replyTo.id,
            senderName: api.replyTo.senderId === this.meId ? this.meName : conversation?.name ?? '',
            text: api.replyTo.available ? api.replyTo.body ?? '' : '',
          }
        : undefined,
      reactions: api.reactions,
      recalledAt: deletedAt,
      editedAt: api.editedAt ? Date.parse(api.editedAt) : undefined,
      createdAt: Date.parse(api.createdAt),
    };
  }

  private nextSequence(conversationId: string): number {
    return (this.messageMap()[conversationId]?.at(-1)?.seq ?? 0) + 1;
  }

  private findMessage(conversationId: string, messageId: string): Message | undefined {
    return this.messageMap()[conversationId]?.find((message) => message.id === messageId);
  }

  private appendMessage(message: Message): void {
    this.messageMap.update((map) => ({
      ...map,
      [message.conversationId]: [...(map[message.conversationId] ?? []), message],
    }));
  }

  private updateMessage(conversationId: string, id: string, patch: Partial<Message>): void {
    this.messageMap.update((map) => ({
      ...map,
      [conversationId]: (map[conversationId] ?? []).map((message) =>
        message.id === id ? { ...message, ...patch } : message,
      ),
    }));
  }

  private patchConversation(id: string, patch: Partial<Conversation>): void {
    this.conversations.update((items) =>
      items.map((conversation) => conversation.id === id ? { ...conversation, ...patch } : conversation),
    );
  }

  private syncPreview(conversationId: string): void {
    const last = this.messageMap()[conversationId]?.filter((message) => !message.deletedForMe).at(-1);
    if (!last) {
      this.patchConversation(conversationId, { lastText: '', lastKind: 'text' });
      return;
    }
    this.patchConversation(conversationId, {
      lastKind: last.type,
      lastText: last.recalledAt ? '' : last.content,
      lastMine: last.senderId === this.meId,
      lastSender: last.senderName,
      lastAt: last.createdAt,
    });
  }
}
