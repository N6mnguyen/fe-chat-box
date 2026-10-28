import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AvatarComponent } from '../../shared/avatar.component';
import { IconComponent } from '../../shared/icon.component';
import { UiFeedbackService } from '../../shared/ui-feedback.service';

import { Conversation, Message, OutgoingMessage } from '../chat.models';
import { ChatService } from '../chat.service';
import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { InfoPanelComponent } from '../info-panel/info-panel.component';
import { MessageComposerComponent } from '../message-composer/message-composer.component';
import { MessageListComponent } from '../message-list/message-list.component';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [
    TranslocoPipe, NzModalModule, NzButtonModule, NzInputModule,
    AvatarComponent, IconComponent, ChatHeaderComponent, MessageListComponent,
    MessageComposerComponent, InfoPanelComponent,
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
  readonly replyMessage = signal<Message | null>(null);
  readonly forwardMessage = signal<Message | null>(null);
  readonly forwardTargets = signal<ReadonlySet<string>>(new Set());
  readonly forwarding = signal(false);
  readonly forwardSearch = signal('');
  readonly targetConversations: ChatService['conversations'];
  readonly filteredTargets = computed(() => this.targetConversations()
    .filter((target) => target.name.toLocaleLowerCase('vi').includes(this.forwardSearch().trim().toLocaleLowerCase('vi'))));

  constructor(
    private readonly transloco: TranslocoService,
    private readonly feedback: UiFeedbackService,
    private readonly chat: ChatService,
  ) {
    this.targetConversations = chat.conversations;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['conversation'] && !changes['conversation'].firstChange) {
      this.replyMessage.set(null);
      this.forwardMessage.set(null);
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
    try {
      await this.chat.send(this.conversation.id, outgoing.content, outgoing.files, outgoing.replyTo);
    } catch (error) {
      console.error('Gửi tin nhắn thất bại', error);
      this.errorKey.set('composer.sendError');
    } finally {
      this.sending.set(false);
    }
  }
}
