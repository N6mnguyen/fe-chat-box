import { ChangeDetectionStrategy, Component, Inject, OnInit, Signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { AuthStore } from './auth/auth.store';
import { Conversation, Message } from './chat/chat.models';
import { ChatWindowComponent } from './chat/chat-window/chat-window.component';
import { ChatService } from './chat/chat.service';
import { ConversationListComponent } from './chat/conversation-list/conversation-list.component';
import { ThemeService } from './shared/theme.service';
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

  // ThemeService được inject để effect áp dụng theme/wallpaper chạy ngay khi khởi động.
  constructor(
    private readonly chat: ChatService,
    private readonly theme: ThemeService,
    @Inject(AuthStore) private readonly auth: InstanceType<typeof AuthStore>,
    private readonly router: Router,
  ) {
    void this.theme;
    this.selected = chat.selected;
    this.messages = chat.selectedMessages;
    this.typingId = chat.typingId;
    this.totalUnread = chat.totalUnread;
    this.meName = computed(() => this.auth.user()?.name ?? chat.meName);
  }

  ngOnInit(): void {
    void this.chat.load();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/auth/login');
  }

  open(id: string): void {
    this.chat.select(id);
  }

  close(): void {
    this.chat.select(null);
  }
}
