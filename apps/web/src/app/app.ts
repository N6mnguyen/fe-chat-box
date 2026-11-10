import { ChangeDetectionStrategy, Component, Inject, OnInit, Signal, computed, effect } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthStore } from './auth/auth.store';
import { Conversation, Message } from './chat/chat.models';
import { ChatWindowComponent } from './chat/chat-window/chat-window.component';
import { ChatService } from './chat/chat.service';
import { ConversationListComponent } from './chat/conversation-list/conversation-list.component';
import { ThemeService } from './shared/theme.service';
import { UiFeedbackService } from './shared/ui-feedback.service';
import { NavSidebarComponent } from './shell/nav-sidebar/nav-sidebar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ConversationListComponent, ChatWindowComponent, NavSidebarComponent, TranslocoPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  readonly selected: Signal<Conversation | null>;
  readonly messages: Signal<Message[]>;
  readonly typingId: Signal<string | null>;
  readonly totalUnread: Signal<number>;
  readonly meName: Signal<string>;
  readonly meEmail: Signal<string>;
  readonly meUsername: Signal<string>;

  // ThemeService được inject để effect áp dụng theme/wallpaper chạy ngay khi khởi động.
  constructor(
    private readonly chat: ChatService,
    private readonly theme: ThemeService,
    @Inject(AuthStore) private readonly auth: InstanceType<typeof AuthStore>,
    private readonly router: Router,
    private readonly feedback: UiFeedbackService,
    private readonly transloco: TranslocoService,
  ) {
    void this.theme;
    // Phiên bị thu hồi/hết hạn (refresh thất bại) -> về trang đăng nhập.
    effect(() => {
      if (this.auth.status() === 'unauthenticated') {
        void this.router.navigateByUrl('/auth/login');
      }
    });
    this.selected = chat.selected;
    this.messages = chat.selectedMessages;
    this.typingId = chat.typingId;
    this.totalUnread = chat.totalUnread;
    this.meName = computed(() => this.auth.user()?.name ?? chat.meName);
    this.meEmail = computed(() => this.auth.user()?.email ?? '');
    this.meUsername = chat.meUsername;
  }

  ngOnInit(): void {
    void this.chat.load().then(() => {
      if (this.chat.loadState() === 'ready') {
        const firstConversation = this.chat.sortedConversations()[0];
        if (firstConversation) {
          this.chat.select(firstConversation.id);
        }
      }
    });
  }

  async logout(): Promise<void> {
    try {
      await this.auth.logout();
    } catch (error) {
      console.error('Không thu hồi được phiên ở máy chủ', error);
      this.feedback.error(this.transloco.translate('common.actionError'));
    } finally {
      await this.router.navigateByUrl('/auth/login');
    }
  }

  open(id: string): void {
    this.chat.select(id);
  }

  close(): void {
    this.chat.select(null);
  }
}
