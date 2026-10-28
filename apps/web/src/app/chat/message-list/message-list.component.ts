import { DatePipe } from '@angular/common';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';

import { AvatarComponent } from '../../shared/avatar.component';
import { IconComponent } from '../../shared/icon.component';
import { formatFileSize, normalizeText, splitLinks, TextPart } from '../../shared/text.util';
import { canDeleteForAll, canEditMessage } from '../chat.service';
import { Attachment, Conversation, Message } from '../chat.models';

interface DayRow {
  kind: 'day';
  key: string;
  /** 'messages.today' | 'messages.yesterday' | null (dùng `date`). */
  labelKey: string | null;
  date: string;
}

/** Vị trí của bong bóng trong một cụm tin liên tiếp, quyết định bo góc. */
type RunPosition = 'single' | 'first' | 'middle' | 'last';

interface MessageRow {
  kind: 'message';
  key: string;
  message: Message;
  mine: boolean;
  position: RunPosition;
  showAvatar: boolean;
  /** Chỉ hiện giờ ở tin cuối của cụm. */
  showTime: boolean;
  isLastMine: boolean;
  parts: TextPart[];
  sizeLabel: string;
  /** Tỉ lệ khung ảnh, dạng "w / h", để giữ chỗ trước khi ảnh tải xong. */
  ratio: string;
  senderLabel: string;
  canEdit: boolean;
  canRetry: boolean;
  canDeleteForAll: boolean;
  canShare: boolean;
}

type Row = DayRow | MessageRow;

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];
const GROUP_GAP_MS = 5 * 60_000;
const NEAR_BOTTOM_PX = 120;
const DEFAULT_RATIO = 4 / 3;

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [
    DatePipe,
    TranslocoPipe,
    AvatarComponent,
    IconComponent,
    CdkContextMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
  ],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageListComponent implements OnChanges, AfterViewChecked {
  @Input({ required: true }) conversation!: Conversation;
  @Input({ required: true }) messages: Message[] = [];
  @Input({ required: true }) meId = '';
  @Input() typing = false;
  @Input() query = '';

  @Output() retryRequested = new EventEmitter<string>();
  @Output() editRequested = new EventEmitter<{ messageId: string; content: string }>();
  @Output() deleteRequested = new EventEmitter<string>();
  @Output() deleteForAllRequested = new EventEmitter<string>();
  @Output() replyRequested = new EventEmitter<Message>();
  @Output() forwardRequested = new EventEmitter<Message>();
  @Output() reacted = new EventEmitter<{ messageId: string; emoji: string }>();

  /** Bộ reaction nhanh, đặt ở hằng số để template không tự tạo mảng mỗi lần render. */
  readonly quickReactions = QUICK_REACTIONS;
  /** Id tin đang mở bảng chọn reaction (null = đóng). */
  readonly pickerId = signal<string | null>(null);
  /** Id tin đang sửa tại chỗ (null = không sửa). */
  readonly editingId = signal<string | null>(null);
  readonly editText = signal('');

  @ViewChild('scroller', { static: true }) private readonly scroller!: ElementRef<HTMLElement>;
  @ViewChild('closeButton') private readonly closeButton?: ElementRef<HTMLButtonElement>;

  rows: Row[] = [];
  searching = false;

  readonly showJump = signal(false);
  readonly newCount = signal(0);
  readonly lightbox = signal<Attachment | null>(null);

  private stickToBottom = true;
  private forceScroll = false;
  private lastCount = 0;
  private focusLightbox = false;

  constructor(
    private readonly transloco: TranslocoService,
    private readonly notices: NzMessageService,
    private readonly modal: NzModalService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    const switched = !!changes['conversation'] && !changes['conversation'].firstChange;
    if (switched) {
      // Đổi hội thoại: luôn xuống cuối và xoá bộ đếm tin mới.
      this.forceScroll = true;
      this.lastCount = 0;
      this.newCount.set(0);
      this.showJump.set(false);
      this.lightbox.set(null);
    }
    this.searching = this.query.trim().length > 0;
    this.rows = this.buildRows();

    const added = this.messages.length - this.lastCount;
    const last = this.messages[this.messages.length - 1];
    if (added > 0 && !switched) {
      if (this.stickToBottom || last?.senderId === this.meId) {
        this.forceScroll = true;
      } else {
        this.newCount.update((n) => n + added);
        this.showJump.set(true);
      }
    }
    this.lastCount = this.messages.length;
  }

  ngAfterViewChecked(): void {
    if (this.forceScroll) {
      this.forceScroll = false;
      this.scrollToBottom();
    }
    if (this.focusLightbox && this.closeButton) {
      this.focusLightbox = false;
      this.closeButton.nativeElement.focus();
    }
  }

  onScroll(): void {
    const el = this.scroller.nativeElement;
    this.stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (this.stickToBottom) {
      this.showJump.set(false);
      this.newCount.set(0);
    } else {
      this.showJump.set(true);
    }
  }

  jumpToLatest(): void {
    this.scrollToBottom();
  }

  openImage(file: Attachment): void {
    this.lightbox.set(file);
    this.focusLightbox = true;
  }

  closeImage(): void {
    this.lightbox.set(null);
  }

  /** Chỉ đóng khi bấm vào nền, không đóng khi bấm vào ảnh. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeImage();
    }
  }

  /** Esc đóng lightbox. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.lightbox()) {
      this.closeImage();
    }
    this.pickerId.set(null);
    this.editingId.set(null);
    this.closeImage();
  }

  /** Giữ focus trong lightbox (chỉ có một nút) nên Tab không thoát ra ngoài. */
  trapFocus(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      event.preventDefault();
      this.closeButton?.nativeElement.focus();
    }
  }

  togglePicker(id: string): void {
    this.pickerId.update((current) => (current === id ? null : id));
  }

  react(messageId: string, emoji: string): void {
    this.reacted.emit({ messageId, emoji });
    this.pickerId.set(null);
  }

  startEdit(row: MessageRow): void {
    if (!row.canEdit) {
      return;
    }
    this.editingId.set(row.message.id);
    this.editText.set(row.message.content);
  }

  updateEdit(event: Event): void {
    this.editText.set((event.target as HTMLTextAreaElement).value);
  }

  /** Enter lưu, Shift+Enter xuống dòng, Esc hủy; bỏ qua khi đang gõ IME. */
  onEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.editingId.set(null);
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
      return;
    }
    event.preventDefault();
    this.saveEdit();
  }

  saveEdit(): void {
    const id = this.editingId();
    const text = this.editText().trim();
    if (!id || !text) {
      return;
    }
    this.editRequested.emit({ messageId: id, content: text });
    this.editingId.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  confirmDelete(id: string, forAll: boolean): void {
    const message = this.messages.find((m) => m.id === id);
    if (!message || (forAll && !canDeleteForAll(message, this.meId))) {
      this.notices.warning(this.transloco.translate('messages.deleteExpired'));
      return;
    }
    this.modal.confirm({
      nzTitle: this.transloco.translate(forAll ? 'messages.deleteForAll' : 'messages.deleteForMe'),
      nzContent: this.transloco.translate(forAll ? 'messages.deleteForAllConfirm' : 'messages.deleteForMeConfirm'),
      nzWidth: 420,
      nzCentered: true,
      nzWrapClassName: 'delete-confirm-modal',
      nzIconType: 'exclamation-circle',
      nzOkText: this.transloco.translate('messages.delete'),
      nzOkDanger: true,
      nzCancelText: this.transloco.translate('messages.cancel'),
      nzAutofocus: 'cancel',
      nzOnOk: () => forAll ? this.deleteForAllRequested.emit(id) : this.deleteRequested.emit(id),
    });
  }

  jumpToMessage(id: string): void {
    const target = this.scroller.nativeElement.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
    if (!target) {
      this.notices.info(this.transloco.translate('messages.unavailable'));
      return;
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.focus({ preventScroll: true });
  }

  retry(id: string): void {
    this.retryRequested.emit(id);
  }

  private scrollToBottom(): void {
    const el = this.scroller.nativeElement;
    el.scrollTop = el.scrollHeight;
  }

  private buildRows(): Row[] {
    const q = normalizeText(this.query.trim());
    const source = q
      ? this.messages.filter((m) => normalizeText(m.content + ' ' + (m.attachment?.name ?? '')).includes(q))
      : this.messages;
    const now = Date.now();

    const lastMineId = [...this.messages].reverse().find((m) => m.senderId === this.meId)?.id;
    const rows: Row[] = [];
    let prevDay = '';

    source.forEach((message, index) => {
      const day = new Date(message.createdAt).toDateString();
      if (day !== prevDay) {
        rows.push({ kind: 'day', key: `day-${day}`, ...this.dayLabel(message.createdAt) });
        prevDay = day;
      }
      const prev = source[index - 1];
      const next = source[index + 1];
      const joinsPrev = !!prev && this.sameRun(prev, message);
      const joinsNext = !!next && this.sameRun(message, next);
      const mine = message.senderId === this.meId;
      const attachment = message.attachment;

      rows.push({
        kind: 'message',
        key: message.id,
        message,
        mine,
        position: this.position(joinsPrev, joinsNext),
        // Avatar chỉ hiện ở tin cuối của cụm (kiểu Zalo).
        showAvatar: !mine && !joinsNext,
        showTime: !joinsNext,
        isLastMine: message.id === lastMineId,
        parts: message.type === 'text' ? splitLinks(message.content) : [],
        canEdit: canEditMessage(message, this.meId),
        // Chỉ tin của mình đang lỗi mới được gửi lại.
        canRetry: mine && message.status === 'failed',
        canDeleteForAll: canDeleteForAll(message, this.meId, now),
        canShare: !message.recalledAt && ['sent', 'delivered', 'seen'].includes(message.status),
        sizeLabel: attachment ? formatFileSize(attachment.size) : '',
        ratio: `${attachment?.ratio ?? DEFAULT_RATIO}`,
        // Tên người gửi chỉ cần ở đầu cụm trong nhóm.
        senderLabel: this.conversation.isGroup && !mine && !joinsPrev ? message.senderName : '',
      });
    });
    return rows;
  }

  private position(joinsPrev: boolean, joinsNext: boolean): RunPosition {
    if (joinsPrev && joinsNext) {
      return 'middle';
    }
    if (joinsPrev) {
      return 'last';
    }
    return joinsNext ? 'first' : 'single';
  }

  private sameRun(a: Message, b: Message): boolean {
    return (
      a.senderId === b.senderId &&
      b.createdAt - a.createdAt < GROUP_GAP_MS &&
      new Date(a.createdAt).toDateString() === new Date(b.createdAt).toDateString()
    );
  }

  private dayLabel(timestamp: number): Pick<DayRow, 'labelKey' | 'date'> {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const dayMs = 24 * 3_600_000;
    if (timestamp >= startOfToday) {
      return { labelKey: 'messages.today', date: '' };
    }
    if (timestamp >= startOfToday - dayMs) {
      return { labelKey: 'messages.yesterday', date: '' };
    }
    const d = new Date(timestamp);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return { labelKey: null, date: `${dd}/${mm}/${d.getFullYear()}` };
  }
}
