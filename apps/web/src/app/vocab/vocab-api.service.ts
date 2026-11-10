import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { API_BASE_URL } from '../api-base-url';
import { AuthStore } from '../auth/auth.store';

export type VocabLanguage = 'en' | 'zh';

export interface VocabTopic {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  language: VocabLanguage;
  levelSlug: string | null;
  groupSlug: string;
  groupName: string;
  groupOrder: number;
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
    continueLesson: {
      topicId: string;
      mode: 'flashcard' | 'fill_blank' | 'listen_fill';
      wordCount: 10 | 15 | 30;
    } | null;
  };
}

export interface VocabGrammarCourse {
  level: string;
  title: string;
  proficiency: string;
  grammarItems: Array<{ title: string; explanation: string }>;
  skills: string[];
}

export interface VocabStatsDay {
  date: string;
  sessions: number;
  wordsStudied: number;
  avgScorePercent: number;
  studyMinutes: number;
}

export interface VocabStats {
  language: VocabLanguage;
  days: 7 | 14 | 30;
  daily: VocabStatsDay[];
  summary: {
    totalWords: number;
    avgScore: number;
    streak: number;
    dueToday: number;
    deltaVsPreviousPercent: number;
  };
  topWrongWords: Array<{ word: string; meaningVi: string; wrongCount: number }>;
}

export interface VocabWrongReview {
  words: Array<{
    id: string;
    topicId: string;
    topic: string;
    language: VocabLanguage;
    word: string;
    phonetic: string;
    meaningVi: string;
    exampleEn: string;
    exampleTarget: string;
    audioUrl: string | null;
    userAnswer: string;
  }>;
}

export interface VocabStudyWord {
  id: string;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaningVi: string;
  exampleEn: string;
  exampleTarget?: string;
  exampleVi: string;
  audioUrl: string | null;
  alternativeAnswers?: string[];
  userAnswer?: string;
}

export interface VocabStudySession {
  sessionId: string;
  topicId: string;
  topic: string;
  language: VocabLanguage;
  level: string | null;
  groupName: string;
  mode: 'flashcard' | 'fill_blank' | 'listen_fill';
  wordCount: number;
  startedAt: string;
  words: VocabStudyWord[];
}

export interface VocabStudyResult {
  sessionId: string;
  topic: string;
  language: VocabLanguage;
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
  private readonly pronunciationCache = new Map<string, Promise<Blob>>();

  constructor(
    @Inject(AuthStore) private readonly auth: InstanceType<typeof AuthStore>,
    private readonly router: Router,
  ) {}

  overview(language: VocabLanguage = 'en'): Promise<VocabOverview> {
    return this.request(`/v1/vocab/overview?language=${language}`);
  }

  grammar(language: VocabLanguage, level?: string): Promise<{ courses: VocabGrammarCourse[] }> {
    const params = new URLSearchParams({ language });
    if (level) {
      params.set('level', level);
    }
    return this.request(`/v1/vocab/grammar?${params.toString()}`);
  }

  stats(days: 7 | 14 | 30, language: VocabLanguage = 'en'): Promise<VocabStats> {
    return this.request(`/v1/vocab/stats?days=${days}&language=${language}`);
  }

  wrongReview(language: VocabLanguage = 'en'): Promise<VocabWrongReview> {
    return this.request(`/v1/vocab/review/wrong?language=${language}`);
  }

  pronunciation(text: string): Promise<Blob> {
    const key = text.trim();
    const cached = this.pronunciationCache.get(key);
    if (cached) {
      return cached;
    }

    const request = this.requestAudio('/v1/vocab/pronunciation/audio', {
      method: 'POST',
      body: JSON.stringify({ text: key }),
    });
    this.pronunciationCache.set(key, request);
    request.catch(() => {
      if (this.pronunciationCache.get(key) === request) {
        this.pronunciationCache.delete(key);
      }
    });
    if (this.pronunciationCache.size > 40) {
      const oldest = this.pronunciationCache.keys().next().value;
      if (oldest) {
        this.pronunciationCache.delete(oldest);
      }
    }
    return request;
  }

  warmPronunciation(text: string): void {
    void this.pronunciation(text).catch((error: unknown) => {
      console.warn('Không tải trước được phát âm tiếng Trung', error);
    });
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
      this.navigateToLogin();
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

    if (response.status === 401) {
      if (canRefresh) {
        try {
          await this.refreshAccessToken();
        } catch (error) {
          this.navigateToLogin();
          throw error;
        }
        return this.request<T>(path, init, false);
      }
      this.navigateToLogin();
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

  private async requestAudio(path: string, init: RequestInit, canRefresh = true): Promise<Blob> {
    const accessToken = this.auth.accessToken();
    if (!accessToken) {
      this.navigateToLogin();
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
      throw new VocabApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : 'Không kết nối được máy chủ.');
    }

    if (response.status === 401) {
      if (canRefresh) {
        try {
          await this.refreshAccessToken();
        } catch (error) {
          this.navigateToLogin();
          throw error;
        }
        return this.requestAudio(path, init, false);
      }
      this.navigateToLogin();
    }
    if (!response.ok) {
      let payload: { code?: string; message?: string };
      try {
        payload = await response.json() as { code?: string; message?: string };
      } catch {
        throw new VocabApiError(502, 'INVALID_RESPONSE', 'Máy chủ trả về dữ liệu phát âm không hợp lệ.');
      }
      throw new VocabApiError(
        response.status,
        payload.code ?? 'PRONUNCIATION_FAILED',
        payload.message ?? 'Không tải được phát âm tiếng Trung.',
      );
    }

    const audio = await response.blob();
    if (!audio.size || !audio.type.startsWith('audio/')) {
      throw new VocabApiError(502, 'INVALID_AUDIO', 'Máy chủ không trả về dữ liệu âm thanh hợp lệ.');
    }
    return audio;
  }

  private refreshAccessToken(): Promise<string> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.auth.refreshAccessToken().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  private navigateToLogin(): void {
    void this.router.navigate(['/auth/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
