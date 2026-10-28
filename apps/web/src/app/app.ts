import { ChangeDetectionStrategy, Component, OnInit, Signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

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
  readonly meName: string;

  // ThemeService được inject để effect áp dụng theme/wallpaper chạy ngay khi khởi động.
  constructor(
    private readonly chat: ChatService,
    private readonly theme: ThemeService,
  ) {
    void this.theme;
    this.selected = chat.selected;
    this.messages = chat.selectedMessages;
    this.typingId = chat.typingId;
    this.totalUnread = chat.totalUnread;
    this.meName = chat.meName;
  }

  ngOnInit(): void {
    void this.chat.load();
  }

  open(id: string): void {
    this.chat.select(id);
  }

  close(): void {
    this.chat.select(null);
  }
}
