import { Inject, Injectable } from '@angular/core';

import { API_BASE_URL } from '../api-base-url';
import { AuthStore } from '../auth/auth.store';

export interface VocabTopic {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  wordCount: number;
  masteredCount: number;
  learningCount: number;
  progressPercent: number;
}

export interface VocabOverview {
  topics: VocabTopic[];
  summary: {
    streak: number;
    dueToday: number;
    continueTopicId: string | null;
  };
}

export interface VocabStudyWord {
  id: string;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaningVi: string;
  exampleEn: string;
  exampleVi: string;
  audioUrl: string | null;
  alternativeAnswers?: string[];
  userAnswer?: string;
}

export interface VocabStudySession {
  sessionId: string;
  topicId: string;
  topic: string;
  mode: 'flashcard' | 'fill_blank' | 'listen_fill';
  wordCount: number;
  startedAt: string;
  words: VocabStudyWord[];
}

export interface VocabStudyResult {
  sessionId: string;
  topic: string;
  mode: 'flashcard' | 'fill_blank' | 'listen_fill';
  wordCount: number;
  score: number;
  total: number;
  durationSec: number;
  wrongWords: VocabStudyWord[];
}

export interface NQuizletResultResponse {
  conversationId: string;
  messageId: string;
  fallbackText: string;
  duplicate: boolean;
}

export class VocabApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VocabApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class VocabApiService {
  private refreshInFlight?: Promise<string>;

  constructor(@Inject(AuthStore) private readonly auth: InstanceType<typeof AuthStore>) {}

  overview(): Promise<VocabOverview> {
    return this.request('/v1/vocab/overview');
  }

  startSession(
    topicId: string,
    wordCount: number,
    mode: 'flashcard' | 'fill_blank' | 'listen_fill' = 'flashcard',
  ): Promise<VocabStudySession> {
    return this.request('/v1/vocab/sessions', {
      method: 'POST',
      body: JSON.stringify({ topicId, mode, wordCount }),
    });
  }

  saveAnswer(
    sessionId: string,
    answer: { wordId: string; questionIndex: number; isCorrect: boolean; userAnswer: string; hintCount?: number },
  ): Promise<{ saved: boolean; duplicate: boolean }> {
    return this.request(`/v1/vocab/sessions/${encodeURIComponent(sessionId)}/answers`, {
      method: 'POST',
      body: JSON.stringify(answer),
    });
  }

  finishSession(sessionId: string): Promise<VocabStudyResult> {
    return this.request(`/v1/vocab/sessions/${encodeURIComponent(sessionId)}/finish`, {
      method: 'POST',
    });
  }

  sendStudyResult(sessionId: string): Promise<NQuizletResultResponse> {
    return this.request('/v1/vocab/study-result', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}, canRefresh = true): Promise<T> {
    const accessToken = this.auth.accessToken();
    if (!accessToken) {
      throw new VocabApiError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập lại.');
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
      throw new VocabApiError(
        0,
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Không kết nối được máy chủ.',
      );
    }

    if (response.status === 401 && canRefresh) {
      await this.refreshAccessToken();
      return this.request<T>(path, init, false);
    }

    let payload: { error?: { code?: string; message?: string } } | T;
    try {
      payload = await response.json() as { error?: { code?: string; message?: string } } | T;
    } catch {
      throw new VocabApiError(502, 'INVALID_RESPONSE', 'Máy chủ trả về dữ liệu không hợp lệ.');
    }
    if (!response.ok) {
      const error = payload as { error?: { code?: string; message?: string } };
      throw new VocabApiError(
        response.status,
        error.error?.code ?? 'REQUEST_FAILED',
        error.error?.message ?? 'Không tải được dữ liệu từ vựng.',
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
