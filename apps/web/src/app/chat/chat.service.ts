import { Injectable, computed, signal } from '@angular/core';

import {
  Conversation,
  LoadState,
  Message,
  MessageStatus,
  MessageType,
  Reaction,
  ReplyRef,
} from './chat.models';
import { buildSeed } from './chat.seed';

const BOT_REPLIES = [
  'Ok bạn nhé!',
  'Mình đã nhận được rồi, cảm ơn bạn.',
  'Để mình xem lại rồi báo bạn sau nha.',
  'Haha, đúng rồi đó 😄',
];

export const DELETE_FOR_ALL_MS = 15 * 60_000;

/** Chỉ xóa cho mọi người trong 15 phút, với tin của mình đã gửi. */
export function canDeleteForAll(message: Message, meId: string, now = Date.now()): boolean {
  return message.senderId === meId && !message.recalledAt &&
    ['sent', 'delivered', 'seen'].includes(message.status) &&
    now >= message.createdAt && now - message.createdAt < DELETE_FOR_ALL_MS;
}

/** Chỉ sửa được tin văn bản của chính mình, chưa thu hồi và không còn đang gửi. */
export function canEditMessage(message: Message, meId: string): boolean {
  return (
    message.senderId === meId &&
    message.type === 'text' &&
    !message.recalledAt &&
    message.status !== 'queued' &&
    message.status !== 'sending'
  );
}

/** Đọc tỉ lệ ảnh thật để giữ chỗ trước khi tải. */
function readImageRatio(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalHeight ? img.naturalWidth / img.naturalHeight : undefined);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    img.src = url;
  });
}

/**
 * Kho dữ liệu chat dùng MOCK (chưa có backend).
 * Khi có API thật: thay load()/send() bằng ChatApi + ChatSocket, giữ nguyên signal công khai.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  readonly meId = 'me';
  readonly meName = 'Minh Anh';
  readonly loadState = signal<LoadState>('loading');
  readonly selectedId = signal<string | null>(null);
  readonly typingId = signal<string | null>(null);
  readonly conversations = signal<Conversation[]>([]);

  private readonly messageMap = signal<Record<string, Message[]>>({});

  /** Ghim lên đầu, sau đó theo thời gian mới nhất. */
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
  /** Tổng số tin chưa đọc (bỏ qua hội thoại tắt thông báo). */
  readonly totalUnread = computed(() =>
    this.conversations()
      .filter((c) => !c.muted)
      .reduce((sum, c) => sum + c.unread, 0),
  );

  /** Tải dữ liệu mẫu; lỗi được ghi log và chuyển sang trạng thái error. */
  async load(): Promise<void> {
    this.loadState.set('loading');
    try {
      await this.delay(500);
      const { conversations, messages } = buildSeed(this.meName);
      this.conversations.set(conversations);
      this.messageMap.set(messages);
      this.loadState.set('ready');
    } catch (error) {
      console.error('Không tải được hội thoại', error);
      this.loadState.set('error');
    }
  }

  select(id: string | null): void {
    this.selectedId.set(id);
    if (id) {
      this.patchConversation(id, { unread: 0 });
    }
  }

  togglePinned(id: string): void {
    const conversation = this.conversations().find((item) => item.id === id);
    if (conversation) {
      this.patchConversation(id, { pinned: !conversation.pinned });
    }
  }

  toggleMuted(id: string): void {
    const conversation = this.conversations().find((item) => item.id === id);
    if (conversation) {
      this.patchConversation(id, { muted: !conversation.muted });
    }
  }

  /** Gửi tin: hiện ngay (đang gửi) rồi chuyển dần sang đã gửi/đã nhận/đã xem. */
  async send(
    conversationId: string,
    content: string,
    files: File[],
    replyTo?: ReplyRef,
  ): Promise<void> {
    const text = content.trim();
    const created: Message[] = [];
    if (text) {
      created.push(this.createMessage(conversationId, 'text', text, undefined, replyTo));
    }
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const ratio = isImage ? await readImageRatio(file) : undefined;
      created.push(
        this.createMessage(conversationId, isImage ? 'image' : 'file', '', {
          name: file.name,
          size: file.size,
          url: URL.createObjectURL(file),
          ratio,
        }),
      );
    }
    if (!created.length) {
      return;
    }
    created.forEach((m) => this.appendMessage(m));
    const last = created[created.length - 1];
    this.patchConversation(conversationId, {
      lastKind: last.type,
      lastText: last.type === 'file' ? (last.attachment?.name ?? '') : last.content,
      lastMine: true,
      lastSender: this.meName,
      lastAt: last.createdAt,
    });

    await this.delay(300);
    // ponytail: mock coi "offline" là lỗi mạng; thay bằng outbox + backoff khi có ChatApi thật.
    if (!navigator.onLine) {
      created.forEach((m) => this.markFailed(conversationId, m.id));
      return;
    }
    created.forEach((m) => this.setStatus(conversationId, m.id, 'sent'));
    void this.advanceStatus(conversationId, created);
    void this.botReply(conversationId);
  }

  /** Gửi lại tin lỗi, giữ nguyên id/clientMsgId (không tạo tin mới). */
  retry(conversationId: string, messageId: string): void {
    const message = this.findMessage(conversationId, messageId);
    // Chỉ tin của mình đang lỗi: chặn tin người khác, tin đã gửi và bấm lặp khi đang gửi.
    if (!message || message.senderId !== this.meId || message.status !== 'failed') {
      return;
    }
    this.setStatus(conversationId, messageId, 'sending');
    void this.delay(400).then(() =>
      navigator.onLine
        ? this.updateMessage(conversationId, messageId, { status: 'sent', failureReason: undefined })
        : this.markFailed(conversationId, messageId),
    );
  }

  /** Sửa tin văn bản của mình; trả về false nếu không được phép hoặc nội dung rỗng. */
  editMessage(conversationId: string, messageId: string, content: string): boolean {
    const text = content.trim();
    const message = this.findMessage(conversationId, messageId);
    if (!text || !message || !canEditMessage(message, this.meId)) {
      return false;
    }
    this.updateMessage(conversationId, messageId, { content: text, editedAt: Date.now() });
    this.syncPreview(conversationId);
    return true;
  }

  /** Xóa phía tôi: giữ tombstone cục bộ để tin không xuất hiện lại khi đồng bộ. */
  deleteMessage(conversationId: string, messageId: string): boolean {
    const message = this.findMessage(conversationId, messageId);
    if (!message || message.deletedForMe) {
      return false;
    }
    this.updateMessage(conversationId, messageId, { deletedForMe: true });
    this.syncPreview(conversationId);
    return true;
  }

  /** Mock thu hồi toàn cục: bảo toàn seq, xóa nội dung/tệp và chặn tin cũ hiện lại. */
  deleteForAll(conversationId: string, messageId: string): boolean {
    const message = this.findMessage(conversationId, messageId);
    if (!message || !canDeleteForAll(message, this.meId)) {
      return false;
    }
    this.updateMessage(conversationId, messageId, {
      content: '', attachment: undefined, replyTo: undefined, reactions: undefined,
      recalledAt: Date.now(),
    });
    // Xóa cả bản trích dẫn; tránh lộ lại nội dung đã thu hồi qua tin trả lời.
    this.messageMap.update((map) => Object.fromEntries(Object.entries(map).map(([id, messages]) => [
      id,
      messages.map((item) => item.replyTo?.messageId === messageId
        ? { ...item, replyTo: { ...item.replyTo, text: '' } }
        : item),
    ])));
    if (message.attachment?.url.startsWith('blob:') &&
        !Object.values(this.messageMap()).flat().some((m) =>
          m.id !== messageId && !m.recalledAt && m.attachment?.url === message.attachment?.url,
        )) {
      URL.revokeObjectURL(message.attachment.url);
    }
    this.syncPreview(conversationId);
    return true;
  }

  /** Chuyển tiếp thành tin mới theo từng hội thoại; lỗi một nơi không ảnh hưởng nơi khác. */
  async forwardMessage(messageId: string, sourceId: string, targets: string[]): Promise<Record<string, boolean>> {
    const source = this.findMessage(sourceId, messageId);
    if (!source || source.recalledAt || source.deletedForMe ||
        !['sent', 'delivered', 'seen'].includes(source.status)) {
      return Object.fromEntries(targets.map((id) => [id, false]));
    }
    const result: Record<string, boolean> = {};
    for (const id of [...new Set(targets)]) {
      if (!this.conversations().some((c) => c.id === id)) {
        result[id] = false;
        continue;
      }
      const message = this.createMessage(id, source.type, source.content, source.attachment);
      message.forwardedFrom = sourceId;
      this.appendMessage(message);
      this.syncPreview(id);
      await this.delay(300);
      if (!navigator.onLine) {
        this.markFailed(id, message.id);
        result[id] = false;
        continue;
      }
      this.setStatus(id, message.id, 'sent');
      void this.advanceStatus(id, [message]);
      result[id] = true;
    }
    return result;
  }

  /** Bật/tắt reaction của mình trên một tin (của mình hoặc người khác). */
  react(conversationId: string, messageId: string, emoji: string): void {
    this.messageMap.update((map) => ({
      ...map,
      [conversationId]: (map[conversationId] ?? []).map((m) =>
        m.id === messageId ? { ...m, reactions: this.toggleReaction(m.reactions ?? [], emoji) } : m,
      ),
    }));
  }

  private findMessage(conversationId: string, messageId: string): Message | undefined {
    return this.messageMap()[conversationId]?.find((m) => m.id === messageId);
  }

  private markFailed(conversationId: string, messageId: string): void {
    const attempts = (this.findMessage(conversationId, messageId)?.attempts ?? 0) + 1;
    this.updateMessage(conversationId, messageId, { status: 'failed', failureReason: 'network', attempts });
  }

  /** Cập nhật dòng xem trước mà không làm lộ tin đã ẩn hay đã thu hồi. */
  private syncPreview(conversationId: string): void {
    const last = this.messageMap()[conversationId]?.filter((m) => !m.deletedForMe).at(-1);
    if (!last) {
      this.patchConversation(conversationId, { lastText: '', lastKind: 'text' });
      return;
    }
    this.patchConversation(conversationId, {
      lastKind: last.type,
      lastText: last.recalledAt ? '' : last.type === 'file' ? (last.attachment?.name ?? '') : last.content,
      lastMine: last.senderId === this.meId,
      lastSender: last.senderName,
      lastAt: last.createdAt,
    });
  }

  private toggleReaction(list: Reaction[], emoji: string): Reaction[] {
    const found = list.find((r) => r.emoji === emoji);
    if (!found) {
      return [...list, { emoji, count: 1, mine: true }];
    }
    if (!found.mine) {
      return list.map((r) => (r === found ? { ...r, count: r.count + 1, mine: true } : r));
    }
    // Bỏ reaction của mình; hết người thả thì xoá chip.
    return list
      .map((r) => (r === found ? { ...r, count: r.count - 1, mine: false } : r))
      .filter((r) => r.count > 0);
  }

  private async advanceStatus(conversationId: string, sent: Message[]): Promise<void> {
    await this.delay(600);
    sent.forEach((m) => this.setStatus(conversationId, m.id, 'delivered'));
    await this.delay(1200);
    sent.forEach((m) => this.setStatus(conversationId, m.id, 'seen'));
  }

  /** Bot giả lập: gõ rồi trả lời. */
  private async botReply(conversationId: string): Promise<void> {
    const conversation = this.conversations().find((c) => c.id === conversationId);
    if (!conversation || conversation.isGroup) {
      return;
    }
    await this.delay(1000);
    this.typingId.set(conversationId);
    await this.delay(1500);
    this.typingId.set(null);
    const reply = this.createMessage(
      conversationId,
      'text',
      BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)],
      undefined,
      undefined,
      { id: conversationId, name: conversation.name },
    );
    this.appendMessage(reply);
    const isOpen = this.selectedId() === conversationId;
    this.patchConversation(conversationId, {
      lastKind: 'text',
      lastText: reply.content,
      lastMine: false,
      lastSender: conversation.name,
      lastAt: reply.createdAt,
      unread: isOpen ? 0 : conversation.unread + 1,
    });
  }

  private createMessage(
    conversationId: string,
    type: MessageType,
    content: string,
    attachment?: Message['attachment'],
    replyTo?: ReplyRef,
    sender: { id: string; name: string } = { id: this.meId, name: this.meName },
  ): Message {
    const seq = (this.messageMap()[conversationId]?.at(-1)?.seq ?? 0) + 1;
    return {
      id: crypto.randomUUID(),
      clientMsgId: crypto.randomUUID(),
      conversationId,
      seq,
      senderId: sender.id,
      senderName: sender.name,
      type,
      content,
      attachment,
      replyTo,
      status: sender.id === this.meId ? 'sending' : 'seen',
      createdAt: Date.now(),
    };
  }

  private appendMessage(message: Message): void {
    this.messageMap.update((map) => ({
      ...map,
      [message.conversationId]: [...(map[message.conversationId] ?? []), message],
    }));
  }

  private setStatus(conversationId: string, id: string, status: MessageStatus): void {
    this.updateMessage(conversationId, id, { status });
  }

  private updateMessage(conversationId: string, id: string, patch: Partial<Message>): void {
    this.messageMap.update((map) => ({
      ...map,
      [conversationId]: (map[conversationId] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  private patchConversation(id: string, patch: Partial<Conversation>): void {
    this.conversations.update((list) =>
      list.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
