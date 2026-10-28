import { Conversation, Message } from './chat.models';

// Dữ liệu mẫu cho bản mock (xoá khi có backend).

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Ảnh giả lập (SVG data URI) để không phụ thuộc mạng. */
function placeholderImage(label: string, hue: number, width: number, height: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="hsl(${hue} 55% 55%)"/>` +
    `<text x="50%" y="50%" font-size="36" text-anchor="middle" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function buildSeed(meName: string): { conversations: Conversation[]; messages: Record<string, Message[]> } {
  const now = Date.now();
  const names: Record<string, string> = {
    me: meName,
    c1: 'Lan Phương',
    u2: 'Trần Văn Minh Quang',
    c2: 'Trần Văn Minh Quang',
    c3: 'Anh Minh',
    u3: 'Anh Minh',
    u5: 'Bố Nam',
  };
  const m = (
    conversationId: string,
    seq: number,
    senderId: string,
    ago: number,
    content: string,
    extra: Partial<Message> = {},
  ): Message => ({
    id: `${conversationId}-${seq}`,
    clientMsgId: `${conversationId}-${seq}`,
    conversationId,
    seq,
    senderId,
    senderName: names[senderId] ?? senderId,
    type: 'text',
    content,
    status: 'seen',
    createdAt: now - ago,
    ...extra,
  });

  const messages: Record<string, Message[]> = {
    c1: [
      m('c1', 1, 'c1', DAY + 3 * HOUR, 'Chào bạn, hôm qua họp xong mình có gửi tài liệu rồi nha.'),
      m('c1', 2, 'me', DAY + 2 * HOUR, 'Mình nhận được rồi, cảm ơn Phương.'),
      m('c1', 3, 'c1', 40 * MINUTE, 'Mọi người xem bản dựng mới chưa? Giao diện native nhìn đã thật 👀'),
      m('c1', 4, 'me', 39 * MINUTE, 'Xem rồi, mượt hơn hẳn bản Electron', {
        reactions: [{ emoji: '❤️', count: 2 }],
      }),
      m('c1', 5, 'c1', 38 * MINUTE, 'Có vài chỗ mình chưa chắc, xem tại https://example.com/thiet-ke giúp mình.'),
      m('c1', 6, 'c1', 37 * MINUTE, '', {
        type: 'image',
        attachment: {
          name: 'man-hinh.png',
          size: 245_000,
          url: placeholderImage('Ảnh mẫu', 210, 640, 400),
          ratio: 1.6,
        },
      }),
      m('c1', 7, 'c1', 36 * MINUTE, '', {
        type: 'file',
        attachment: { name: 'Olaz-landing.fig', size: 25_300_000, url: '#' },
      }),
      m('c1', 8, 'me', 20 * MINUTE, 'Ổn, mình đồng bộ xong hồi sáng. Xác nhận trên điện thoại là chạy ngay.', {
        replyTo: { messageId: 'c1-3', senderName: 'Lan Phương', text: 'Mọi người xem bản dựng mới chưa?' },
      }),
    ],
    c2: [
      m('c2', 1, 'u2', 3 * HOUR, 'Anh ơi, file báo cáo quý này đây ạ.'),
      m('c2', 2, 'u2', 3 * HOUR - MINUTE, '', {
        type: 'file',
        attachment: {
          name: 'bao-cao-quy-3-2026-ban-cuoi-cung-da-duyet-hop-dong-ky-ngay-15.xlsx',
          size: 3_400_000,
          url: '#',
        },
      }),
      m('c2', 3, 'me', 2 * HOUR, 'Cảm ơn em, anh sẽ xem.'),
    ],
    c3: [
      m('c3', 1, 'u3', 2 * DAY, 'Cuối tuần này đi cà phê không?'),
      m('c3', 2, 'me', 2 * DAY - HOUR, 'Được chứ, 9h sáng Chủ nhật nhé.'),
      m('c3', 3, 'u3', 5 * MINUTE, 'Nhớ mang theo laptop nha, mình có việc nhờ bạn. Đây là một tin nhắn khá dài để kiểm tra việc xuống dòng trong bong bóng chat khi nội dung vượt quá chiều rộng tối đa của khung hiển thị trên màn hình nhỏ, kèm đường dẫn rất dài https://example.com/duong-dan-rat-dai/khong-co-khoang-trang/de-kiem-tra-tran-layout/abcdefghijklmnopqrstuvwxyz0123456789.'),
    ],
    c4: [
      m('c4', 1, 'u4', 4 * HOUR, 'Mọi người nhớ nộp báo cáo tuần trước 17h hôm nay.', { senderName: 'Hoàng Nam' }),
      m('c4', 2, 'u5', 3 * HOUR, 'Mình nộp rồi nhé.', { senderName: 'Thu Hà' }),
    ],
  };

  const make = (id: string, name: string, extra: Partial<Conversation> = {}): Conversation => {
    const msgs = messages[id] ?? [];
    const tail = msgs[msgs.length - 1];
    return {
      id,
      name,
      isGroup: false,
      memberCount: 2,
      memberNames: [],
      online: false,
      unread: 0,
      pinned: false,
      muted: false,
      lastKind: tail?.type ?? 'text',
      lastText: tail ? (tail.type === 'file' ? (tail.attachment?.name ?? '') : tail.content) : '',
      lastMine: tail?.senderId === 'me',
      lastSender: tail?.senderName ?? '',
      lastAt: tail?.createdAt ?? now - 30 * DAY,
      ...extra,
    };
  };

  return {
    messages,
    conversations: [
      make('c1', 'Nhóm Thiết kế', {
        tag: 'Dự án Olaz',
        isGroup: true,
        memberCount: 5,
        memberNames: ['Lan Phương', 'Anh Minh', 'Bố Nam'],
        pinned: true,
        online: true,
      }),
      make('c2', 'Trần Văn Minh Quang', { unread: 3 }),
      make('c3', 'Anh Minh', { online: true, unread: 120 }),
      make('c4', 'Nhóm Dự án Chatbot - Phòng Công nghệ Thông tin và Chuyển đổi số', {
        isGroup: true,
        memberCount: 48,
        memberNames: ['Hoàng Nam', 'Thu Hà'],
        muted: true,
      }),
      make('c5', 'Lê Quốc Bảo'),
      make('c6', 'Đặng Thu Hà', { online: true }),
    ],
  };
}
