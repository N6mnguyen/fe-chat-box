import { canDeleteForAll, canEditMessage, ChatService, DELETE_FOR_ALL_MS } from './chat.service';
import { Message } from './chat.models';

const base: Message = {
  id: 'c1-9',
  clientMsgId: 'c1-9',
  conversationId: 'c1',
  seq: 9,
  senderId: 'me',
  senderName: 'Minh Anh',
  type: 'text',
  content: 'xin chào',
  status: 'sent',
  createdAt: 0,
};

describe('ChatService – gửi lại, sửa, xóa', () => {
  let chat: ChatService;

  beforeEach(async () => {
    vi.useFakeTimers();
    chat = new ChatService();
    const loading = chat.load();
    await vi.advanceTimersByTimeAsync(500);
    await loading;
    chat.select('c1');
  });

  afterEach(() => vi.useRealTimers());

  const find = (id: string) => chat.selectedMessages().find((m) => m.id === id);

  it('ghim hội thoại và bật/tắt thông báo theo trạng thái', () => {
    const conversation = chat.conversations().find((item) => item.id === 'c2');
    expect(conversation?.pinned).toBe(false);
    chat.togglePinned('c2');
    expect(chat.conversations().find((item) => item.id === 'c2')?.pinned).toBe(true);

    const unreadBeforeMute = chat.totalUnread();
    expect(chat.conversations().find((item) => item.id === 'c2')?.muted).toBe(false);
    chat.toggleMuted('c2');
    expect(chat.conversations().find((item) => item.id === 'c2')?.muted).toBe(true);
    expect(chat.totalUnread()).toBe(unreadBeforeMute - 3);
    chat.toggleMuted('c2');
    expect(chat.conversations().find((item) => item.id === 'c2')?.muted).toBe(false);
    expect(chat.totalUnread()).toBe(unreadBeforeMute);
  });

  it('chặn gửi lại tin của đối phương và tin của mình chưa lỗi', () => {
    chat.retry('c1', 'c1-1'); // tin người khác
    chat.retry('c1', 'c1-2'); // tin của mình đã xem
    expect(find('c1-1')?.status).toBe('seen');
    expect(find('c1-2')?.status).toBe('seen');
  });

  it('chỉ cho sửa tin văn bản của mình', () => {
    expect(chat.editMessage('c1', 'c1-1', 'hack')).toBe(false);
    expect(chat.editMessage('c1', 'c1-2', '  mới  ')).toBe(true);
    expect(find('c1-2')?.content).toBe('mới');
    expect(find('c1-2')?.editedAt).toBeTypeOf('number');
    expect(chat.editMessage('c1', 'c1-2', '   ')).toBe(false);
  });

  it('xóa phía tôi áp dụng cho tin của bất kỳ ai', () => {
    chat.deleteMessage('c1', 'c1-1');
    expect(find('c1-1')).toBeUndefined();
  });

  it('thu hồi đúng trong 15 phút, chặn tin người khác/quá hạn/đã thu hồi', () => {
    const now = DELETE_FOR_ALL_MS + 1_000;
    expect(canDeleteForAll({ ...base, createdAt: now - DELETE_FOR_ALL_MS + 1 }, 'me', now)).toBe(true);
    expect(canDeleteForAll({ ...base, createdAt: now - DELETE_FOR_ALL_MS }, 'me', now)).toBe(false);
    expect(canDeleteForAll(base, 'other', 1_000)).toBe(false);
    expect(canDeleteForAll({ ...base, recalledAt: 2 }, 'me', 1_000)).toBe(false);
    expect(canDeleteForAll({ ...base, status: 'sending' }, 'me', 1_000)).toBe(false);
  });

  it('thu hồi bảo toàn vị trí, xóa nội dung và không cho sửa lại', async () => {
    expect(chat.deleteForAll('c1', 'c1-1')).toBe(false);
    const sending = chat.send('c1', 'tin mới', []);
    await vi.advanceTimersByTimeAsync(300);
    await sending;
    const id = chat.selectedMessages().at(-1)?.id ?? '';
    expect(id).not.toBe('');
    expect(chat.deleteForAll('c1', id)).toBe(true);
    expect(find(id)?.content).toBe('');
    expect(find(id)?.recalledAt).toBeTypeOf('number');
    expect(chat.editMessage('c1', id, 'hack')).toBe(false);
    expect(chat.deleteForAll('c1', id)).toBe(false);
  });

  it('trả lời tạo trích dẫn và ẩn nội dung trích dẫn sau khi thu hồi', async () => {
    const sending = chat.send('c1', 'tin gốc', []);
    await vi.advanceTimersByTimeAsync(300);
    await sending;
    const originalId = chat.selectedMessages().at(-1)?.id ?? '';
    expect(originalId).not.toBe('');
    const replying = chat.send('c1', 'đã hiểu', [], {
      messageId: originalId, senderName: 'Minh Anh', text: 'tin gốc',
    });
    await vi.advanceTimersByTimeAsync(300);
    await replying;
    const replyId = chat.selectedMessages().at(-1)?.id ?? '';
    expect(find(replyId)?.replyTo?.text).toBe('tin gốc');
    expect(chat.deleteForAll('c1', originalId)).toBe(true);
    expect(find(replyId)?.replyTo?.text).toBe('');
  });

  it('chuyển tiếp tạo tin mới với clientMsgId mới; một nơi lỗi vẫn gửi nơi còn lại', async () => {
    const sending = chat.forwardMessage('c1-3', 'c1', ['missing', 'c2']);
    await vi.advanceTimersByTimeAsync(300);
    const result = await sending;
    expect(result).toEqual({ missing: false, c2: true });
    chat.select('c2');
    const forwarded = chat.selectedMessages().at(-1);
    expect(forwarded?.forwardedFrom).toBe('c1');
    expect(forwarded?.clientMsgId).not.toBe('c1-3');
    expect(chat.selectedMessages().filter((m) => m.id === forwarded?.id)).toHaveLength(1);
  });

  it('không chuyển tiếp tin đã thu hồi', async () => {
    const sending = chat.send('c1', 'tin mới', []);
    await vi.advanceTimersByTimeAsync(300);
    await sending;
    const id = chat.selectedMessages().at(-1)?.id ?? '';
    expect(id).not.toBe('');
    chat.deleteForAll('c1', id);
    expect(await chat.forwardMessage(id, 'c1', ['c2'])).toEqual({ c2: false });
  });

  it('canEditMessage loại trừ tin đang gửi, đã thu hồi, không phải văn bản', () => {
    expect(canEditMessage(base, 'me')).toBe(true);
    expect(canEditMessage({ ...base, status: 'sending' }, 'me')).toBe(false);
    expect(canEditMessage({ ...base, recalledAt: 1 }, 'me')).toBe(false);
    expect(canEditMessage({ ...base, type: 'image' }, 'me')).toBe(false);
    expect(canEditMessage(base, 'other')).toBe(false);
  });
});
