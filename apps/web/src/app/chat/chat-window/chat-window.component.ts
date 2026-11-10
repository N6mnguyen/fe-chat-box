import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { Router } from '@angular/router';
import { AvatarComponent } from '../../shared/avatar.component';
import { IconComponent } from '../../shared/icon.component';
import { UiFeedbackService } from '../../shared/ui-feedback.service';

import { ChatApiError } from '../chat-api';
import { Conversation, Message, OutgoingMessage } from '../chat.models';
import { AttachmentSendError, ChatService } from '../chat.service';
import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { InfoPanelComponent } from '../info-panel/info-panel.component';
import { MessageComposerComponent } from '../message-composer/message-composer.component';
import { MessageListComponent } from '../message-list/message-list.component';
import { NQuizletCommand, NQuizletQuickCommandsComponent } from './nquizlet-quick-commands.component';
import { StudyResultAction } from '../../vocab/study-result-card.component';
import { VocabApiService, VocabLanguage, VocabStats, VocabWrongReview } from '../../vocab/vocab-api.service';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [
    TranslocoPipe, NzModalModule, NzButtonModule, NzInputModule,
    AvatarComponent, IconComponent, ChatHeaderComponent, MessageListComponent,
    MessageComposerComponent, InfoPanelComponent,
    NQuizletQuickCommandsComponent,
  ],
  templateUrl: './chat-window.component.html',
  styleUrl: './chat-window.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWindowComponent implements OnChanges {
  @Input({ required: true }) conversation!: Conversation;
  @Input({ required: true }) messages: Message[] = [];
  @Input() typing = false;

  @Output() backRequested = new EventEmitter<void>();

  readonly infoOpen = signal(typeof window !== 'undefined' && window.innerWidth >= 1280);
  readonly query = signal('');
  readonly sending = signal(false);
  readonly errorKey = signal('');
  readonly errorDetail = signal('');
  readonly replyMessage = signal<Message | null>(null);
  readonly forwardMessage = signal<Message | null>(null);
  readonly forwardTargets = signal<ReadonlySet<string>>(new Set());
  readonly forwarding = signal(false);
  readonly forwardSearch = signal('');
  readonly showStatsRanges = signal(false);
  readonly vocabLanguage = signal<VocabLanguage>('en');
  readonly selectedStatsDays = signal<7 | 14 | 30 | null>(null);
  readonly statsDashboard = signal<VocabStats | null>(null);
  readonly statsLoading = signal(false);
  readonly statsError = signal('');
  readonly wrongReview = signal<VocabWrongReview | null>(null);
  readonly wrongReviewLoading = signal(false);
  readonly wrongReviewError = signal('');
  readonly targetConversations: ChatService['conversations'];
  @ViewChild(MessageComposerComponent) private composer?: MessageComposerComponent;
  readonly filteredTargets = computed(() => this.targetConversations()
    .filter((target) => target.name.toLocaleLowerCase('vi').includes(this.forwardSearch().trim().toLocaleLowerCase('vi'))));

  constructor(
    private readonly transloco: TranslocoService,
    private readonly feedback: UiFeedbackService,
    private readonly chat: ChatService,
    private readonly router: Router,
    private readonly vocabApi: VocabApiService,
  ) {
    this.targetConversations = chat.conversations;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['conversation'] && !changes['conversation'].firstChange) {
      this.replyMessage.set(null);
      this.forwardMessage.set(null);
      this.showStatsRanges.set(false);
      this.selectedStatsDays.set(null);
      this.statsDashboard.set(null);
      this.statsError.set('');
      this.wrongReview.set(null);
      this.wrongReviewError.set('');
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.forwardMessage.set(null);
    this.replyMessage.set(null);
  }

  get meId(): string {
    return this.chat.meId;
  }

  toggleInfo(): void {
    this.infoOpen.update((open) => !open);
  }

  onNQuizletCommand(command: NQuizletCommand | StudyResultAction): void {
    const action = typeof command === 'string' ? command : command.action;
    if (typeof command !== 'string') {
      this.vocabLanguage.set(command.language);
    }
    if (action === 'disable_reminders') {
      this.feedback.info('Cài đặt nhắc học sẽ có ở giai đoạn tiếp theo.');
      return;
    }
    if (action === 'stats') {
      this.showStatsRanges.update((open) => !open);
      return;
    }
    if (action === 'review_wrong') {
      void this.loadWrongReview();
      return;
    }
    if (action === 'review') {
      void this.loadWrongReview();
      return;
    }
    void this.router.navigate(['/vocab'], { queryParams: { language: this.vocabLanguage() } });
  }

  async loadStats(days = this.selectedStatsDays()): Promise<void> {
    if (days === null) {
      return;
    }
    this.selectedStatsDays.set(days);
    this.statsLoading.set(true);
    this.statsError.set('');
    this.statsDashboard.set(null);
    try {
      this.statsDashboard.set(await this.vocabApi.stats(days, this.vocabLanguage()));
    } catch (error) {
      console.error('Không tải được thống kê NQuizlet', error);
      this.statsError.set(error instanceof Error ? error.message : 'Không tải được thống kê. Vui lòng thử lại.');
    } finally {
      this.statsLoading.set(false);
    }
  }

  startStudyFromStats(): void {
    void this.router.navigate(['/vocab'], { queryParams: { language: this.vocabLanguage() } });
  }

  async loadWrongReview(): Promise<void> {
    this.showStatsRanges.set(false);
    this.statsDashboard.set(null);
    this.statsError.set('');
    this.wrongReview.set(null);
    this.wrongReviewLoading.set(true);
    this.wrongReviewError.set('');
    try {
      this.wrongReview.set(await this.vocabApi.wrongReview(this.vocabLanguage()));
    } catch (error) {
      console.error('Không tải được danh sách từ sai của NQuizlet', error);
      this.wrongReviewError.set(error instanceof Error ? error.message : 'Không tải được danh sách từ sai. Vui lòng thử lại.');
    } finally {
      this.wrongReviewLoading.set(false);
    }
  }

  continueWrongReview(topicId: string | null): void {
    void this.router.navigate(['/vocab'], {
      queryParams: {
        language: this.vocabLanguage(),
        ...(topicId ? { review: 'wrong', topicId } : { review: 'wrong' }),
      },
    });
  }

  async onReact(event: { messageId: string; emoji: string }): Promise<void> {
    try {
      await this.chat.react(this.conversation.id, event.messageId, event.emoji);
    } catch (error) {
      console.error('Không lưu được reaction', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    }
  }

  async onRetry(messageId: string): Promise<void> {
    try {
      await this.chat.retry(this.conversation.id, messageId);
    } catch (error) {
      console.error('Gửi lại tin nhắn thất bại', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    }
  }

  async onEdit(event: { messageId: string; content: string }): Promise<void> {
    try {
      await this.chat.editMessage(this.conversation.id, event.messageId, event.content);
    } catch (error) {
      console.error('Không sửa được tin nhắn', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    }
  }

  onReply(message: Message): void {
    if (message.recalledAt) {
      return;
    }
    this.replyMessage.set(message);
  }

  async onDelete(messageId: string): Promise<void> {
    try {
      if (await this.chat.deleteMessage(this.conversation.id, messageId)) {
        this.feedback.success(this.transloco.translate('messages.deletedForMe'));
      }
    } catch (error) {
      console.error('Không xóa được tin nhắn', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    }
  }

  async onDeleteForAll(messageId: string): Promise<void> {
    try {
      if (await this.chat.deleteForAll(this.conversation.id, messageId)) {
        this.feedback.success(this.transloco.translate('messages.deletedForAll'));
      } else {
        this.feedback.error(this.transloco.translate('messages.deleteExpired'));
      }
    } catch (error) {
      console.error('Không thu hồi được tin nhắn', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    }
  }

  onForward(message: Message): void {
    if (message.recalledAt || message.deletedForMe ||
        !['sent', 'delivered', 'seen'].includes(message.status)) {
      return;
    }
    this.forwardTargets.set(new Set());
    this.forwardSearch.set('');
    this.forwardMessage.set(message);
  }

  updateForwardSearch(event: Event): void {
    this.forwardSearch.set((event.target as HTMLInputElement).value);
  }

  toggleForwardTarget(id: string): void {
    this.forwardTargets.update((targets) => {
      const next = new Set(targets);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async submitForward(): Promise<void> {
    const message = this.forwardMessage();
    if (!message || !this.forwardTargets().size || this.forwarding()) {
      return;
    }
    this.forwarding.set(true);
    try {
      const result = await this.chat.forwardMessage(message.id, message.conversationId, [...this.forwardTargets()]);
      const succeeded = Object.values(result).filter(Boolean).length;
      const failed = Object.values(result).length - succeeded;
      if (succeeded) {
        this.feedback.success(this.transloco.translate('messages.forwardSuccess', { n: succeeded }));
      }
      if (failed) {
        this.feedback.error(this.transloco.translate('messages.forwardFailure', { n: failed }));
      }
      this.forwardMessage.set(null);
    } catch (error) {
      console.error('Không chuyển tiếp được tin nhắn', error);
      this.feedback.error(this.transloco.translate('messages.forwardError'));
    } finally {
      this.forwarding.set(false);
    }
  }

  async onSend(outgoing: OutgoingMessage): Promise<void> {
    this.sending.set(true);
    this.errorKey.set('');
    this.errorDetail.set('');
    try {
      await this.chat.send(this.conversation.id, outgoing.content, outgoing.files, outgoing.replyTo);
      this.composer?.clearAfterSend();
    } catch (error) {
      if (error instanceof AttachmentSendError) {
        this.composer?.removeFiles(outgoing.files.slice(0, error.sentFiles));
        if (error.textSent) {
          this.composer?.clearTextAfterPartialSend();
        }
        if (error.sentFiles) {
          this.feedback.error(this.transloco.translate('composer.partialSend', {
            n: error.sentFiles,
          }));
        }
        this.errorKey.set(`composer.${error.stage}StageError`);
        const cause = error.cause;
        if (cause instanceof ChatApiError) {
          this.errorDetail.set(`${cause.status ? `HTTP ${cause.status}: ` : ''}${cause.message}`);
        } else if (cause instanceof Error) {
          this.errorDetail.set(cause.message);
        }
      } else {
        this.errorKey.set('composer.sendError');
      }
      console.error('Gửi tin nhắn thất bại', error);
    } finally {
      this.sending.set(false);
    }
  }
}
