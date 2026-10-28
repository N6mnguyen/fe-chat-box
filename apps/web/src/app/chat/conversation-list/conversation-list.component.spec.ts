import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';

// Loader giả: trả về từ điển rỗng, pipe sẽ hiển thị key.
class EmptyLoader implements TranslocoLoader {
  getTranslation() {
    return of({});
  }
}

import { Conversation } from '../chat.models';
import { ChatService } from '../chat.service';
import { ConversationListComponent } from './conversation-list.component';

const base: Conversation = {
  id: 'x',
  name: 'An',
  memberNames: [],
  lastSender: '',
  lastMine: false,
  lastKind: 'text',
  lastText: 'hi',
  lastAt: Date.now(),
  unread: 0,
  pinned: false,
  muted: false,
  online: false,
  isGroup: false,
  memberCount: 2,
} as Conversation;

function setup(list: Conversation[]) {
  const conversations = signal(list);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideTransloco({ config: { availableLangs: ['vi'], defaultLang: 'vi' }, loader: EmptyLoader }),
      {
        provide: ChatService,
        useValue: {
          loadState: signal('ready'),
          selectedId: signal(null),
          conversations,
          sortedConversations: conversations,
          load: () => Promise.resolve(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ConversationListComponent);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('ConversationListComponent rows', () => {
  it('giữ nguyên tên 200 ký tự (CSS cắt "…") và đặt tooltip', () => {
    const name = 'A'.repeat(200);
    const row = setup([{ ...base, name }]).rows()[0];
    expect(row.conversation.name).toHaveLength(200);
    expect(row.title).toBe(name);
  });

  it('tin cuối rất dài vẫn là một chuỗi, không xuống dòng', () => {
    const lastText = 'https://example.com/' + 'a'.repeat(500);
    const row = setup([{ ...base, lastText }]).rows()[0];
    expect(row.conversation.lastText).toBe(lastText);
  });

  it('không có tin nhắn: lastText rỗng, không lỗi', () => {
    const row = setup([{ ...base, lastText: '', unread: 0 }]).rows()[0];
    expect(row.senderPrefix).toBe('');
    expect(row.unreadLabel).toBe('0');
  });

  it('badge chưa đọc giới hạn 99+', () => {
    expect(setup([{ ...base, unread: 150 }]).rows()[0].unreadLabel).toBe('99+');
  });

  it('tiền tố người gửi: Bạn / tên thành viên nhóm', () => {
    const c = setup([
      { ...base, id: 'a', lastMine: true },
      { ...base, id: 'b', isGroup: true, lastSender: 'Lan Phương' },
    ]);
    expect(c.rows().map((r) => r.senderPrefix)).toEqual(['list.you', 'Lan Phương']);
  });
});
