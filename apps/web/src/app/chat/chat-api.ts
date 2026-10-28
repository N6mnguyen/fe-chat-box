import { Inject, Injectable } from '@angular/core';

import { AuthStore } from '../auth/auth.store';
import { API_BASE_URL } from '../api-base-url';
import { Conversation, Reaction, ReplyRef } from './chat.models';

export interface ApiUser {
  id: string;
  username: string;
  displayName: string | null;
}

export interface ApiMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  clientMsgId: string;
  createdSeq: string;
  latestSeq: string;
  body: string | null;
  deleted: boolean;
  replyTo: {
    id: string;
    senderId: string;
    available: boolean;
    body: string | null;
  } | null;
  attachments: never[];
  reactions: Reaction[];
  status: 'sent' | 'delivered' | 'seen';
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiConversation {
  id: string;
  type: 'direct';
  peer: ApiUser | null;
  peerDeleted: boolean;
  lastSeq: string;
  lastDeliveredSeq: string;
  lastReadSeq: string;
  peerDeliveredSeq: string;
  peerReadSeq: string | null;
  unreadCount: number;
  lastMessage: ApiMessage | null;
  pinned: boolean;
  muted: boolean;
  createdAt: string;
}

export interface ApiFriendRequest {
  id: string;
  sender: ApiUser;
  recipient: ApiUser;
  status: 'pending';
  createdAt: string;
  expiresAt: string;
}

export interface ApiFriend {
  user: ApiUser;
  since: string;
}

export interface ApiPage<T> {
  items: T[];
  nextCursor: string | null;
}

export type ApiUserPage = ApiPage<ApiUser>;

export interface ApiMe {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
}

interface SendMessageResponse {
  message: ApiMessage;
  duplicate: boolean;
}

export interface ChatPort {
  me(): Promise<ApiMe>;
  conversations(): Promise<ApiConversation[]>;
  discoverUsers(query: string, cursor?: string | null): Promise<ApiUserPage>;
  friends(): Promise<ApiFriend[]>;
  incomingFriendRequests(): Promise<ApiFriendRequest[]>;
  outgoingFriendRequests(): Promise<ApiFriendRequest[]>;
  sendFriendRequest(username: string): Promise<void>;
  acceptFriendRequest(requestId: string): Promise<ApiConversation>;
  declineFriendRequest(requestId: string): Promise<void>;
  cancelFriendRequest(requestId: string): Promise<void>;
  removeFriend(userId: string): Promise<void>;
  messages(conversationId: string): Promise<ApiMessage[]>;
  sendMessage(conversationId: string, clientMsgId: string, body: string, replyTo?: ReplyRef): Promise<ApiMessage>;
  updateConversation(conversationId: string, changes: { pinned?: boolean; muted?: boolean }): Promise<ApiConversation>;
  updateReceipts(conversationId: string, seq: string): Promise<void>;
  editMessage(conversationId: string, messageId: string, body: string): Promise<ApiMessage>;
  hideMessage(conversationId: string, messageId: string): Promise<void>;
  recallMessage(conversationId: string, messageId: string): Promise<ApiMessage>;
  toggleReaction(conversationId: string, messageId: string, emoji: string): Promise<ApiMessage>;
  toConversation(api: ApiConversation, meId: string): Conversation;
}

export class ChatApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ChatApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class ChatApi implements ChatPort {
  private refreshInFlight?: Promise<string>;

  constructor(@Inject(AuthStore) private readonly auth: InstanceType<typeof AuthStore>) {}

  async me(): Promise<ApiMe> {
    return this.request('/v1/me');
  }

  async conversations(): Promise<ApiConversation[]> {
    const items: ApiConversation[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) {
        params.set('cursor', cursor);
      }
      const page = await this.request<ApiPage<ApiConversation>>(`/v1/conversations?${params}`);
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  }

  async discoverUsers(query: string, cursor: string | null = null): Promise<ApiUserPage> {
    const params = new URLSearchParams({ limit: '50' });
    if (query) {
      params.set('q', query);
    }
    if (cursor) {
      params.set('cursor', cursor);
    }
    return this.request(`/v1/users?${params}`);
  }

  async friends(): Promise<ApiFriend[]> {
    return this.collectPages<ApiFriend>('/v1/friends');
  }

  async incomingFriendRequests(): Promise<ApiFriendRequest[]> {
    return this.collectPages<ApiFriendRequest>('/v1/friend-requests/incoming');
  }

  async outgoingFriendRequests(): Promise<ApiFriendRequest[]> {
    return this.collectPages<ApiFriendRequest>('/v1/friend-requests/outgoing');
  }

  private async collectPages<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) {
        params.set('cursor', cursor);
      }
      const page = await this.request<ApiPage<T>>(`${path}?${params}`);
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  }

  async sendFriendRequest(username: string): Promise<void> {
    await this.request('/v1/friend-requests', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }

  async acceptFriendRequest(requestId: string): Promise<ApiConversation> {
    return this.request(`/v1/friend-requests/${encodeURIComponent(requestId)}/accept`, {
      method: 'POST',
    });
  }

  async declineFriendRequest(requestId: string): Promise<void> {
    await this.request(`/v1/friend-requests/${encodeURIComponent(requestId)}/decline`, {
      method: 'POST',
    });
  }

  async cancelFriendRequest(requestId: string): Promise<void> {
    await this.request(`/v1/friend-requests/${encodeURIComponent(requestId)}/cancel`, {
      method: 'POST',
    });
  }

  async removeFriend(userId: string): Promise<void> {
    await this.request(`/v1/friends/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  async messages(conversationId: string): Promise<ApiMessage[]> {
    const page = await this.request<ApiPage<ApiMessage>>(
      `/v1/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`,
    );
    return page.items;
  }

  async sendMessage(
    conversationId: string,
    clientMsgId: string,
    body: string,
    replyTo?: ReplyRef,
  ): Promise<ApiMessage> {
    const result = await this.request<SendMessageResponse>(
      `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          clientMsgId,
          body,
          replyToId: replyTo?.messageId ?? null,
          attachments: [],
        }),
      },
    );
    return result.message;
  }

  async updateConversation(
    conversationId: string,
    changes: { pinned?: boolean; muted?: boolean },
  ): Promise<ApiConversation> {
    return this.request(
      `/v1/conversations/${encodeURIComponent(conversationId)}`,
      { method: 'PATCH', body: JSON.stringify(changes) },
    );
  }

  async updateReceipts(conversationId: string, seq: string): Promise<void> {
    await this.request(`/v1/conversations/${encodeURIComponent(conversationId)}/receipts`, {
      method: 'PUT',
      body: JSON.stringify({ deliveredSeq: seq, readSeq: seq }),
    });
  }

  async editMessage(conversationId: string, messageId: string, body: string): Promise<ApiMessage> {
    return this.request(
      `/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'PATCH', body: JSON.stringify({ body }) },
    );
  }

  async hideMessage(conversationId: string, messageId: string): Promise<void> {
    await this.request(
      `/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/hide`,
      { method: 'POST' },
    );
  }

  async recallMessage(conversationId: string, messageId: string): Promise<ApiMessage> {
    return this.request(
      `/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/recall`,
      { method: 'POST' },
    );
  }

  async toggleReaction(conversationId: string, messageId: string, emoji: string): Promise<ApiMessage> {
    return this.request(
      `/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji }) },
    );
  }

  toConversation(api: ApiConversation, meId: string): Conversation {
    const peerName = api.peer?.displayName || api.peer?.username || 'Tài khoản đã xóa';
    const last = api.lastMessage;
    return {
      id: api.id,
      name: peerName,
      isGroup: false,
      memberCount: 2,
      memberNames: [peerName],
      online: false,
      unread: api.unreadCount,
      pinned: api.pinned,
      muted: api.muted,
      lastKind: 'text',
      lastText: last?.body ?? '',
      lastMine: last?.senderId === meId,
      lastSender: last?.senderName ?? peerName,
      lastAt: last ? Date.parse(last.createdAt) : Date.parse(api.createdAt),
    };
  }

  private async request<T>(path: string, init: RequestInit = {}, canRefresh = true): Promise<T> {
    const accessToken = this.auth.accessToken();
    if (!accessToken) {
      throw new ChatApiError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập lại.');
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${accessToken}`,
          ...init.headers,
        },
      });
    } catch (error) {
      throw new ChatApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : 'Không kết nối được máy chủ.');
    }

    if (response.status === 401 && canRefresh) {
      await this.refreshAccessToken();
      return this.request<T>(path, init, false);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    let payload: { error?: { code?: string; message?: string } } | null;
    try {
      payload = await response.json() as { error?: { code?: string; message?: string } };
    } catch {
      throw new ChatApiError(502, 'INVALID_RESPONSE', 'Máy chủ trả về dữ liệu không hợp lệ.');
    }
    if (!response.ok) {
      throw new ChatApiError(
        response.status,
        payload?.error?.code ?? 'REQUEST_FAILED',
        payload?.error?.message ?? 'Yêu cầu không thành công.',
      );
    }
    return payload as T;
  }

  private refreshAccessToken(): Promise<string> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.auth.refreshAccessToken().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }
}
