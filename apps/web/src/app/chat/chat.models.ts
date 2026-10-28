// Mô hình dữ liệu dùng chung cho tính năng chat (sẽ chuyển sang libs/shared/models khi có backend).

export type MessageType = 'text' | 'image' | 'file';
/** Máy trạng thái gửi: queued → sending → sent → delivered → seen; nhánh failed / cancelled. */
export type MessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'seen'
  | 'failed'
  | 'cancelled';
export type FailureReason = 'network' | 'too_large' | 'blocked' | 'session';
export type LoadState = 'loading' | 'ready' | 'error';

export interface Attachment {
  name: string;
  size: number;
  url: string;
  /** Tỉ lệ rộng/cao của ảnh, để giữ chỗ và không nhảy layout. */
  ratio?: number;
}

export interface ReplyRef {
  messageId: string;
  senderName: string;
  text: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  /** Mình đã thả reaction này (bấm lại để bỏ). */
  mine?: boolean;
}

export interface Message {
  id: string;
  clientMsgId: string;
  conversationId: string;
  /** Số thứ tự tăng dần theo hội thoại, dùng để sắp xếp và đồng bộ. */
  seq: number;
  senderId: string;
  senderName: string;
  type: MessageType;
  content: string;
  status: MessageStatus;
  attachment?: Attachment;
  replyTo?: ReplyRef;
  /** Hội thoại nguồn; không tiết lộ tác giả của tin gốc. */
  forwardedFrom?: string;
  /** Tin bị thu hồi vẫn giữ vị trí trong hội thoại. */
  deletedForMe?: boolean;
  reactions?: Reaction[];
  createdAt: number;
  /** Lý do gửi lỗi (chỉ khi status = failed). */
  failureReason?: FailureReason;
  /** Số lần đã thử gửi. */
  attempts?: number;
  /** Thời điểm tự thử lại kế tiếp (ms), khi đang chờ backoff. */
  retryAt?: number;
  /** Tiến độ tải tệp lên, 0–100. */
  progress?: number;
  /** Thời điểm sửa gần nhất; có giá trị thì hiện nhãn "Đã sửa". */
  editedAt?: number;
  /** Thời điểm thu hồi (dùng ở nhóm 4). */
  recalledAt?: number;
}

export interface Conversation {
  id: string;
  name: string;
  /** Mô tả ngắn hiển thị cạnh tên (ví dụ tên dự án). */
  tag?: string;
  isGroup: boolean;
  memberCount: number;
  memberNames: string[];
  online: boolean;
  unread: number;
  pinned: boolean;
  muted: boolean;
  lastKind: MessageType;
  lastText: string;
  lastMine: boolean;
  lastSender: string;
  lastAt: number;
}

export interface OutgoingMessage {
  content: string;
  files: File[];
  replyTo?: ReplyRef;
}
