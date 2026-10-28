import {
  ChatPort,
  ApiConversation,
  ApiFriend,
  ApiFriendRequest,
  ApiMe,
  ApiMessage,
  ApiUserPage,
} from './chat-api';
import { canDeleteForAll, canEditMessage, ChatService, DELETE_FOR_ALL_MS } from './chat.service';
import { Conversation, Message } from './chat.models';

const now = Date.now();

function message(overrides: Partial<ApiMessage> = {}): ApiMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'me',
    senderName: 'Minh Anh',
    clientMsgId: 'client-1',
    createdSeq: '1',
    latestSeq: '1',
    body: 'Tin từ server',
    deleted: false,
    replyTo: null,
    attachments: [],
    reactions: [],
    status: 'sent',
    editedAt: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...overrides,
  };
}

function conversation(overrides: Partial<ApiConversation> = {}): ApiConversation {
  return {
    id: 'c1',
    type: 'direct',
    peer: { id: 'friend', username: 'friend_name', displayName: 'Lan Phương' },
    peerDeleted: false,
    lastSeq: '1',
    lastDeliveredSeq: '0',
    lastReadSeq: '0',
    peerDeliveredSeq: '0',
    peerReadSeq: '0',
    unreadCount: 2,
    lastMessage: message({ senderId: 'friend', senderName: 'Lan Phương' }),
    pinned: false,
    muted: false,
    createdAt: new Date(now).toISOString(),
    ...overrides,
  };
}

class FakeChatApi implements ChatPort {
  readonly account: ApiMe = {
    id: 'me',
    username: 'minh_anh',
    displayName: 'Minh Anh',
    email: 'minh@example.com',
  };
  readonly conversationData = conversation();
  readonly storedMessages = new Map<string, ApiMessage[]>([['c1', [message({
    senderId: 'friend',
    senderName: 'Lan Phương',
    status: 'seen',
  })]]]);
  friendsData: ApiFriend[] = [];
  readonly sentIds: string[] = [];

  async me(): Promise<ApiMe> {
    return this.account;
  }

  async conversations(): Promise<ApiConversation[]> {
    return [this.conversationData];
  }

  async discoverUsers(): Promise<ApiUserPage> {
    return { items: [], nextCursor: null };
  }

  async friends(): Promise<ApiFriend[]> {
    return this.friendsData;
  }

  async incomingFriendRequests(): Promise<ApiFriendRequest[]> {
    return [];
  }

  async outgoingFriendRequests(): Promise<ApiFriendRequest[]> {
    return [];
  }

  async sendFriendRequest(): Promise<void> {
    await Promise.resolve();
  }

  async acceptFriendRequest(): Promise<ApiConversation> {
    return this.conversationData;
  }

  async declineFriendRequest(): Promise<void> {
    await Promise.resolve();
  }

  async cancelFriendRequest(): Promise<void> {
    await Promise.resolve();
  }

  async removeFriend(): Promise<void> {
    this.friendsData = [];
  }

  async messages(conversationId: string): Promise<ApiMessage[]> {
    return [...(this.storedMessages.get(conversationId) ?? [])].reverse();
  }

  async sendMessage(
    conversationId: string,
    clientMsgId: string,
    body: string,
  ): Promise<ApiMessage> {
    this.sentIds.push(clientMsgId);
    const saved = message({
      id: `saved-${clientMsgId}`,
      clientMsgId,
      conversationId,
      createdSeq: String((this.storedMessages.get(conversationId)?.length ?? 0) + 1),
      body,
      status: 'sent',
      createdAt: new Date(Date.now() + 1).toISOString(),
      updatedAt: new Date(Date.now() + 1).toISOString(),
    });
    this.storedMessages.set(conversationId, [...(this.storedMessages.get(conversationId) ?? []), saved]);
    return saved;
  }

  async updateConversation(
    _conversationId: string,
    changes: { pinned?: boolean; muted?: boolean },
  ): Promise<ApiConversation> {
    Object.assign(this.conversationData, changes);
    return this.conversationData;
  }

  async updateReceipts(): Promise<void> {
    await Promise.resolve();
  }

  async editMessage(_conversationId: string, messageId: string, body: string): Promise<ApiMessage> {
    const updated = message({ body, editedAt: new Date().toISOString() });
    const list = this.storedMessages.get('c1') ?? [];
    this.storedMessages.set('c1', list.map((item) => item.id === messageId ? updated : item));
    return updated;
  }

  async hideMessage(): Promise<void> {
    await Promise.resolve();
  }

  async recallMessage(_conversationId: string, messageId: string): Promise<ApiMessage> {
    const recalled = message({
      id: messageId,
      body: null,
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
    return recalled;
  }

  async toggleReaction(_conversationId: string, messageId: string, emoji: string): Promise<ApiMessage> {
    return message({
      id: messageId,
      reactions: [{ emoji, count: 1, mine: true }],
    });
  }

  toConversation(api: ApiConversation, meId: string): Conversation {
    const name = api.peer?.displayName ?? api.peer?.username ?? '';
    return {
      id: api.id,
      name,
      isGroup: false,
      memberCount: 2,
      memberNames: [name],
      online: false,
      unread: api.unreadCount,
      pinned: api.pinned,
      muted: api.muted,
      lastKind: 'text',
      lastText: api.lastMessage?.body ?? '',
      lastMine: api.lastMessage?.senderId === meId,
      lastSender: api.lastMessage?.senderName ?? name,
      lastAt: Date.parse(api.lastMessage?.createdAt ?? api.createdAt),
    };
  }
}

const base: Message = {
  id: 'm1',
  clientMsgId: 'c1-9',
  conversationId: 'c1',
  seq: 9,
  senderId: 'me',
  senderName: 'Minh Anh',
  type: 'text',
  content: 'xin chào',
  status: 'sent',
  createdAt: now,
};

describe('ChatService with API-backed data', () => {
  let chat: ChatService;
  let api: FakeChatApi;

  beforeEach(async () => {
    api = new FakeChatApi();
    chat = new ChatService(api);
    await chat.load();
  });

  afterEach(() => chat.stop());

  it('loads identity and conversations from the API, not seed data', () => {
    expect(chat.meId).toBe('me');
    expect(chat.meName).toBe('Minh Anh');
    expect(chat.conversations().map((item) => item.name)).toEqual(['Lan Phương']);
    expect(chat.selectedMessages()).toEqual([]);
  });

  it('persists pin and mute changes before updating the view', async () => {
    await chat.togglePinned('c1');
    await chat.toggleMuted('c1');
    expect(chat.conversations()[0].pinned).toBe(true);
    expect(chat.conversations()[0].muted).toBe(true);
    expect(chat.totalUnread()).toBe(0);
  });

  it('refreshes friend relationships immediately after removing a friend', async () => {
    api.friendsData = [{
      user: { id: 'friend', username: 'friend_name', displayName: 'Lan Phương' },
      since: new Date(now).toISOString(),
    }];

    await chat.refreshRelationships();
    expect(chat.friends()).toHaveLength(1);

    await chat.removeFriend('friend');
    expect(chat.friends()).toEqual([]);
  });

  it('loads history, receipts and persisted messages from the API', async () => {
    chat.select('c1');
    await vi.waitFor(() => expect(chat.selectedMessages()).toHaveLength(1));
    expect(chat.selectedMessages()[0].content).toBe('Tin từ server');

    await chat.send('c1', 'Tin mới', []);
    expect(chat.selectedMessages()).toHaveLength(2);
    expect(chat.selectedMessages().at(-1)?.content).toBe('Tin mới');
    expect(chat.selectedMessages().at(-1)?.status).toBe('sent');
    expect(api.sentIds).toHaveLength(1);
    expect(chat.conversations()[0].lastText).toBe('Tin mới');
  });

  it('rejects attachments until the storage API is available', async () => {
    await expect(chat.send('c1', '', [new File(['data'], 'sample.txt')]))
      .rejects.toThrow('Tệp đính kèm chưa được hỗ trợ.');
    expect(api.sentIds).toHaveLength(0);
  });

  it('enforces the edit and recall guards', () => {
    expect(canEditMessage(base, 'me')).toBe(true);
    expect(canEditMessage({ ...base, status: 'sending' }, 'me')).toBe(false);
    expect(canEditMessage({ ...base, recalledAt: 1 }, 'me')).toBe(false);
    expect(canEditMessage({ ...base, type: 'image' }, 'me')).toBe(false);
    expect(canEditMessage(base, 'other')).toBe(false);

    const currentTime = now + DELETE_FOR_ALL_MS + 1_000;
    expect(canDeleteForAll({ ...base, createdAt: currentTime - DELETE_FOR_ALL_MS + 1 }, 'me', currentTime)).toBe(true);
    expect(canDeleteForAll({ ...base, createdAt: currentTime - DELETE_FOR_ALL_MS }, 'me', currentTime)).toBe(false);
    expect(canDeleteForAll(base, 'other', now + 1)).toBe(false);
  });
});
