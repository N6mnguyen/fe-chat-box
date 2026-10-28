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
  effect,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged, map, startWith } from 'rxjs';

import { AvatarComponent } from '../../shared/avatar.component';
import { IconComponent } from '../../shared/icon.component';
import { RelativeTimePipe } from '../../shared/relative-time.pipe';
import { normalizeText } from '../../shared/text.util';
import { UiFeedbackService } from '../../shared/ui-feedback.service';
import { ApiFriend, ApiFriendRequest, ApiUser } from '../chat-api';
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
  readonly friendPanelOpen = signal(false);
  readonly friendSearch = new FormControl('', { nonNullable: true });
  readonly friendCandidates = signal<ApiUser[]>([]);
  readonly friendCandidatesCursor = signal<string | null>(null);
  readonly friendCandidatesLoading = signal(false);
  readonly friendCandidatesError = signal(false);
  readonly sendingRequests = signal<ReadonlySet<string>>(new Set());
  readonly pendingRelationshipActions = signal<ReadonlySet<string>>(new Set());
  readonly incomingFriendRequests: Signal<ApiFriendRequest[]>;
  readonly outgoingFriendRequests: Signal<ApiFriendRequest[]>;
  readonly friends: Signal<ApiFriend[]>;

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
  private friendSearchVersion = 0;
  private lastRelationshipKey: string | null = null;

  constructor(
    private readonly chat: ChatService,
    private readonly feedback: UiFeedbackService,
    private readonly transloco: TranslocoService,
  ) {
    this.state = chat.loadState;
    this.selectedId = chat.selectedId;
    this.incomingFriendRequests = chat.incomingFriendRequests;
    this.outgoingFriendRequests = chat.outgoingFriendRequests;
    this.friends = chat.friends;
    effect(() => {
      const key = [
        ...chat.friends().map((friend) => `f:${friend.user.id}`),
        ...chat.incomingFriendRequests().map((request) => `i:${request.id}`),
        ...chat.outgoingFriendRequests().map((request) => `o:${request.id}`),
      ].sort().join('|');
      const isOpen = this.friendPanelOpen();
      if (this.lastRelationshipKey === null) {
        this.lastRelationshipKey = key;
      } else if (this.lastRelationshipKey !== key) {
        this.lastRelationshipKey = key;
        if (isOpen) {
          void this.loadFriendCandidates(this.friendSearch.value.trim());
        }
      }
    });
    this.friendSearch.valueChanges
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        map((value) => value.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((query) => void this.loadFriendCandidates(query));
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

  async togglePinned(id: string): Promise<void> {
    try {
      await this.chat.togglePinned(id);
    } catch (error) {
      console.error('Không lưu được trạng thái ghim hội thoại', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    }
  }

  async toggleMuted(id: string): Promise<void> {
    try {
      await this.chat.toggleMuted(id);
    } catch (error) {
      console.error('Không lưu được trạng thái thông báo hội thoại', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    }
  }

  reload(): void {
    void this.chat.load();
  }

  toggleFriendPanel(): void {
    const opening = !this.friendPanelOpen();
    this.friendPanelOpen.set(opening);
    if (opening) {
      this.friendSearch.setValue('', { emitEvent: false });
      void this.loadFriendCandidates('');
    }
  }

  async sendFriendRequest(user: ApiUser): Promise<void> {
    if (this.sendingRequests().has(user.id)) {
      return;
    }
    this.sendingRequests.update((pending) => new Set(pending).add(user.id));
    try {
      await this.chat.sendFriendRequest(user.username);
      this.friendCandidates.update((users) => users.filter((item) => item.id !== user.id));
      this.feedback.success(this.transloco.translate('list.friendRequestSubmitted'));
    } catch (error) {
      console.error('Không gửi được lời mời kết bạn', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    } finally {
      this.sendingRequests.update((pending) => {
        const next = new Set(pending);
        next.delete(user.id);
        return next;
      });
    }
  }

  retryFriendSearch(): void {
    void this.loadFriendCandidates(this.friendSearch.value.trim());
  }

  async refreshFriends(): Promise<void> {
    try {
      await this.chat.refreshRelationships();
      await this.loadFriendCandidates(this.friendSearch.value.trim());
    } catch (error) {
      console.error('Không đồng bộ được danh sách bạn bè', error);
      this.feedback.error(this.transloco.translate('list.friendDirectoryError'));
    }
  }

  loadMoreFriendCandidates(): void {
    const cursor = this.friendCandidatesCursor();
    if (cursor && !this.friendCandidatesLoading()) {
      void this.loadFriendCandidates(this.friendSearch.value.trim(), cursor);
    }
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    if (this.pendingRelationshipActions().has(requestId)) {
      return;
    }
    this.setRelationshipAction(requestId, true);
    try {
      const conversationId = await this.chat.acceptFriendRequest(requestId);
      this.conversationOpened.emit(conversationId);
      this.feedback.success(this.transloco.translate('list.friendRequestAccepted'));
    } catch (error) {
      console.error('Không chấp nhận được lời mời kết bạn', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    } finally {
      this.setRelationshipAction(requestId, false);
    }
  }

  async declineFriendRequest(requestId: string): Promise<void> {
    if (this.pendingRelationshipActions().has(requestId)) {
      return;
    }
    this.setRelationshipAction(requestId, true);
    try {
      await this.chat.declineFriendRequest(requestId);
      this.feedback.success(this.transloco.translate('list.friendRequestDeclined'));
    } catch (error) {
      console.error('Không từ chối được lời mời kết bạn', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    } finally {
      this.setRelationshipAction(requestId, false);
    }
  }

  async cancelFriendRequest(requestId: string): Promise<void> {
    if (this.pendingRelationshipActions().has(requestId)) {
      return;
    }
    this.setRelationshipAction(requestId, true);
    try {
      await this.chat.cancelFriendRequest(requestId);
      this.feedback.success(this.transloco.translate('list.friendRequestCancelled'));
    } catch (error) {
      console.error('Không hủy được lời mời kết bạn', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    } finally {
      this.setRelationshipAction(requestId, false);
    }
  }

  confirmRemoveFriend(friend: ApiFriend): void {
    this.feedback.confirm({
      nzTitle: this.transloco.translate('list.removeFriendTitle'),
      nzContent: this.transloco.translate('list.removeFriendConfirm', {
        name: friend.user.displayName || friend.user.username,
      }),
      nzOkText: this.transloco.translate('list.removeFriend'),
      nzOkDanger: true,
      nzCancelText: this.transloco.translate('messages.cancel'),
      nzOnOk: () => this.removeFriend(friend),
    });
  }

  private async removeFriend(friend: ApiFriend): Promise<void> {
    const userId = friend.user.id;
    if (this.pendingRelationshipActions().has(userId)) {
      return;
    }
    this.setRelationshipAction(userId, true);
    try {
      await this.chat.removeFriend(userId);
      await this.loadFriendCandidates(this.friendSearch.value.trim());
      this.feedback.success(this.transloco.translate('list.friendRemoved'));
    } catch (error) {
      console.error('Không xóa được bạn', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    } finally {
      this.setRelationshipAction(userId, false);
    }
  }

  private setRelationshipAction(id: string, pending: boolean): void {
    this.pendingRelationshipActions.update((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
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

  private async loadFriendCandidates(query: string, cursor: string | null = null): Promise<void> {
    const version = ++this.friendSearchVersion;
    if (query && query.length < 2) {
      this.friendCandidates.set([]);
      this.friendCandidatesCursor.set(null);
      this.friendCandidatesLoading.set(false);
      this.friendCandidatesError.set(false);
      return;
    }

    if (!cursor) {
      this.friendCandidates.set([]);
      this.friendCandidatesCursor.set(null);
    }
    this.friendCandidatesLoading.set(true);
    this.friendCandidatesError.set(false);
    try {
      const page = await this.chat.discoverUsers(query, cursor);
      if (version !== this.friendSearchVersion) {
        return;
      }
      this.friendCandidates.update((users) =>
        cursor ? [...users, ...page.items] : page.items,
      );
      this.friendCandidatesCursor.set(page.nextCursor);
    } catch (error) {
      if (version !== this.friendSearchVersion) {
        return;
      }
      console.error('Không tải được danh sách tài khoản có thể kết bạn', error);
      this.friendCandidatesError.set(true);
    } finally {
      if (version === this.friendSearchVersion) {
        this.friendCandidatesLoading.set(false);
      }
    }
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
