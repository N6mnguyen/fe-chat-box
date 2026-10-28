import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Output,
  QueryList,
  Signal,
  ViewChild,
  ViewChildren,
  computed,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, map, startWith } from 'rxjs';

import { AvatarComponent } from '../../shared/avatar.component';
import { IconComponent } from '../../shared/icon.component';
import { RelativeTimePipe } from '../../shared/relative-time.pipe';
import { normalizeText } from '../../shared/text.util';
import { Conversation, LoadState } from '../chat.models';
import { ChatService } from '../chat.service';

const ITEM_HEIGHT = 72;
const SEARCH_DEBOUNCE_MS = 150;
const SKELETON_COUNT = 7;

/** Dữ liệu hiển thị đã tính sẵn để template không phải gọi hàm. */
interface ConversationRow {
  conversation: Conversation;
  /** Người gửi tin cuối (ví dụ "Bạn", "Lan Phương"); rỗng nếu chat 1-1 từ đối phương. */
  senderPrefix: string;
  unreadLabel: string;
  title: string;
}

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ScrollingModule,
    CdkContextMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    TranslocoPipe,
    AvatarComponent,
    IconComponent,
    RelativeTimePipe,
  ],
  templateUrl: './conversation-list.component.html',
  styleUrl: './conversation-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationListComponent {
  @Output() conversationOpened = new EventEmitter<string>();

  @ViewChild(CdkVirtualScrollViewport) private readonly viewport?: CdkVirtualScrollViewport;
  @ViewChildren('itemButton') private readonly itemButtons?: QueryList<ElementRef<HTMLButtonElement>>;

  readonly itemHeight = ITEM_HEIGHT;
  readonly skeletons = Array.from({ length: SKELETON_COUNT }, (_, i) => i);

  readonly searchForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
  });

  readonly state: Signal<LoadState>;
  readonly selectedId: Signal<string | null>;
  readonly rows: Signal<ConversationRow[]>;
  readonly total: Signal<number>;

  private readonly query = toSignal(
    this.searchForm.controls.query.valueChanges.pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      map((value) => normalizeText(value.trim())),
      startWith(''),
    ),
    { initialValue: '' },
  );

  readonly hasQuery = computed(() => this.query().length > 0);
  private readonly focusedId = signal<string | null>(null);

  constructor(private readonly chat: ChatService) {
    this.state = chat.loadState;
    this.selectedId = chat.selectedId;
    this.total = computed(() => chat.conversations().length);
    this.rows = computed(() => {
      const q = this.query();
      const list = chat.sortedConversations();
      const filtered = q ? list.filter((c) => normalizeText(c.name).includes(q)) : list;
      return filtered.map((c) => this.toRow(c));
    });
  }

  open(row: ConversationRow): void {
    this.conversationOpened.emit(row.conversation.id);
  }

  togglePinned(id: string): void {
    this.chat.togglePinned(id);
  }

  toggleMuted(id: string): void {
    this.chat.toggleMuted(id);
  }

  reload(): void {
    void this.chat.load();
  }

  onFocus(id: string): void {
    this.focusedId.set(id);
  }

  trackById(_: number, row: ConversationRow): string {
    return row.conversation.id;
  }

  /** Mũi tên lên/xuống di chuyển focus giữa các hội thoại; Home/End về đầu/cuối. */
  onKeydown(event: KeyboardEvent): void {
    const rows = this.rows();
    if (!rows.length) {
      return;
    }
    const current = rows.findIndex((r) => r.conversation.id === this.focusedId());
    let next = current;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(rows.length - 1, current + 1);
        break;
      case 'ArrowUp':
        next = Math.max(0, current - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = rows.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.focusIndex(next);
  }

  private focusIndex(index: number): void {
    const id = this.rows()[index]?.conversation.id;
    if (!id) {
      return;
    }
    this.viewport?.scrollToIndex(index);
    // Chờ virtual scroll render xong rồi mới focus.
    requestAnimationFrame(() => {
      this.itemButtons?.find((b) => b.nativeElement.dataset['id'] === id)?.nativeElement.focus();
    });
  }

  private toRow(c: Conversation): ConversationRow {
    let senderPrefix = '';
    if (c.lastMine) {
      senderPrefix = 'list.you';
    } else if (c.isGroup && c.lastSender) {
      senderPrefix = c.lastSender;
    }
    return {
      conversation: c,
      senderPrefix,
      unreadLabel: c.unread > 99 ? '99+' : String(c.unread),
      title: `${c.name}${c.tag ? ` · ${c.tag}` : ''}`,
    };
  }
}
