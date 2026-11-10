import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { IconComponent } from '../shared/icon.component';
import { VocabApiService, VocabStudyResult, VocabStudySession, VocabStudyWord } from './vocab-api.service';
import { findVocabSpeechVoice, normalizeVocabAnswer, playVocabAudioBlob } from './vocab-study.utils';

type ListenStyle = 'word' | 'sentence';

interface PendingAnswer {
  answer: string;
  isCorrect: boolean;
}

@Component({
  selector: 'app-listen-fill-study',
  standalone: true,
  imports: [IconComponent, RouterLink],
  templateUrl: './listen-fill-study.component.html',
  styleUrl: './listen-fill-study.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListenFillStudyComponent implements OnInit, OnDestroy {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly finishing = signal(false);
  readonly completionPending = signal(false);
  readonly botSending = signal(false);
  readonly botSent = signal(false);
  readonly botError = signal('');
  readonly error = signal('');
  readonly audioNotice = signal('');
  readonly session = signal<VocabStudySession | null>(null);
  readonly result = signal<VocabStudyResult | null>(null);
  readonly currentIndex = signal(0);
  readonly answerText = signal('');
  readonly submittedAnswer = signal('');
  readonly checked = signal<boolean | null>(null);
  readonly pendingAnswer = signal<PendingAnswer | null>(null);
  readonly listenStyle = signal<ListenStyle>('word');
  readonly limitListens = signal(false);
  readonly listenCount = signal(0);
  readonly playing = signal(false);
  readonly elapsedSeconds = signal(0);

  readonly words = computed(() => this.session()?.words ?? []);
  readonly currentWord = computed(() => this.words()[this.currentIndex()] ?? null);
  readonly promptText = computed(() => {
    const word = this.currentWord();
    return !word ? '' : this.listenStyle() === 'word' ? word.word : word.exampleTarget ?? word.exampleEn;
  });
  readonly contextText = computed(() => {
    const word = this.currentWord();
    return !word ? '' : this.listenStyle() === 'word' ? word.meaningVi : word.exampleVi;
  });
  readonly progressPercent = computed(() => {
    const total = this.words().length;
    const completed = this.currentIndex() + (this.checked() !== null ? 1 : 0);
    return total ? Math.round((completed / total) * 100) : 0;
  });
  readonly resultPercent = computed(() => {
    const result = this.result();
    return result?.total ? Math.round((result.score / result.total) * 100) : 0;
  });

  private readonly audioCache = new Map<string, HTMLAudioElement>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly api: VocabApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    void this.loadSession();
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
    for (const audio of this.audioCache.values()) {
      audio.pause();
    }
  }

  async loadSession(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const topicId = params.get('topicId');
    const wordCount = Number(params.get('wordCount'));
    if (!topicId || ![10, 15, 30].includes(wordCount) || params.get('mode') !== 'listen_fill') {
      this.error.set('Cấu hình bài học không hợp lệ. Hãy chọn lại chủ đề và chế độ học.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      const session = await this.api.startSession(topicId, wordCount, 'listen_fill');
      this.session.set(session);
      if (session.language === 'zh' && session.words[0]) {
        this.api.warmPronunciation(session.words[0].word);
      }
      this.preloadAudio(session.words);
      this.startTimer(session.startedAt);
    } catch (error) {
      console.error('Không thể bắt đầu bài nghe và điền từ', error);
      this.error.set(error instanceof Error ? error.message : 'Không thể bắt đầu bài học. Vui lòng thử lại.');
    } finally {
      this.loading.set(false);
    }
  }

  setAnswer(event: Event): void {
    if (event.target instanceof HTMLInputElement && this.checked() === null && this.pendingAnswer() === null) {
      this.answerText.set(event.target.value);
    }
  }

  chooseListenStyle(style: ListenStyle): void {
    this.listenStyle.set(style);
    this.audioNotice.set('');
    if (this.session()?.language === 'zh') {
      this.api.warmPronunciation(this.promptText());
    }
  }

  async playPrompt(slow = false): Promise<void> {
    const word = this.currentWord();
    if (!word || this.playing()) {
      return;
    }
    if (this.limitListens() && this.listenCount() >= 3) {
      this.audioNotice.set('Đã dùng hết 3 lượt nghe cho từ này.');
      return;
    }

    this.listenCount.update((count) => count + 1);
    this.audioNotice.set('');
    const audio = this.listenStyle() === 'word' && word.audioUrl
      ? this.audioCache.get(word.audioUrl)
      : undefined;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = slow ? 0.75 : 1;
        this.playing.set(true);
        await audio.play();
        audio.onended = () => this.playing.set(false);
        return;
      } catch {
        this.playing.set(false);
      }
    }

    if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      this.audioNotice.set('Trình duyệt này chưa hỗ trợ phát âm. Bạn vẫn có thể nhập đáp án.');
      return;
    }

    const language = this.session()?.language === 'zh' ? 'zh' : 'en';
    if (language === 'zh') {
      try {
        const audio = await playVocabAudioBlob(await this.api.pronunciation(this.promptText()), slow ? 0.75 : 1);
        this.playing.set(true);
        audio.onended = () => this.playing.set(false);
        audio.onerror = () => {
          this.playing.set(false);
          this.audioNotice.set('Chưa phát được âm thanh. Bấm nghe lại hoặc kiểm tra kết nối mạng.');
        };
        return;
      } catch {
        this.playing.set(false);
        this.audioNotice.set('Chưa phát được âm thanh. Bấm nghe lại hoặc kiểm tra kết nối mạng.');
        return;
      }
    }
    const voice = await findVocabSpeechVoice(language);

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(this.promptText());
    utterance.lang = 'en-US';
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = slow ? 0.75 : 1;
    utterance.onstart = () => this.playing.set(true);
    utterance.onend = () => this.playing.set(false);
    utterance.onerror = () => {
      this.playing.set(false);
      this.audioNotice.set('Không phát được âm thanh. Hãy bấm nghe lại.');
    };
    window.speechSynthesis.speak(utterance);
  }

  checkAnswer(): void {
    this.submitAnswer(this.answerText());
  }

  skip(): void {
    this.submitAnswer('');
  }

  retrySave(): void {
    const pending = this.pendingAnswer();
    if (pending) {
      void this.persistAnswer(pending);
    }
  }

  async next(): Promise<void> {
    if (this.checked() === null || this.saving()) {
      return;
    }
    if (this.currentIndex() + 1 >= this.words().length) {
      this.completionPending.set(true);
      await this.finish();
      return;
    }
    this.currentIndex.update((index) => index + 1);
    if (this.session()?.language === 'zh') {
      this.api.warmPronunciation(this.promptText());
    }
    this.answerText.set('');
    this.submittedAnswer.set('');
    this.checked.set(null);
    this.pendingAnswer.set(null);
    this.listenCount.set(0);
    this.audioNotice.set('');
    this.error.set('');
  }

  elapsedLabel(): string {
    const seconds = this.result()?.durationSec ?? this.elapsedSeconds();
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  returnToCourses(): void {
    void this.router.navigate(['/vocab'], {
      queryParams: { language: this.session()?.language ?? 'en' },
    });
  }

  retryBotResult(): void {
    const session = this.session();
    if (session) {
      void this.sendBotResult(session.sessionId);
    }
  }

  private submitAnswer(answer: string): void {
    const word = this.currentWord();
    if (!word || this.checked() !== null || this.saving() || this.pendingAnswer() !== null) {
      return;
    }
    const accepted = [word.word, ...(word.alternativeAnswers ?? [])];
    const pending = {
      answer,
      isCorrect: accepted.some((candidate) => normalizeVocabAnswer(candidate) === normalizeVocabAnswer(answer)),
    };
    this.pendingAnswer.set(pending);
    void this.persistAnswer(pending);
  }

  private async persistAnswer(pending: PendingAnswer): Promise<void> {
    const session = this.session();
    const word = this.currentWord();
    if (!session || !word || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.saveAnswer(session.sessionId, {
        wordId: word.id,
        questionIndex: this.currentIndex() + 1,
        isCorrect: pending.isCorrect,
        userAnswer: pending.answer,
      });
      this.checked.set(pending.isCorrect);
      this.submittedAnswer.set(pending.answer);
      this.pendingAnswer.set(null);
    } catch (error) {
      console.error('Không lưu được câu trả lời nghe từ', error);
      this.error.set(error instanceof Error ? error.message : 'Không lưu được câu trả lời. Hãy thử lại.');
    } finally {
      this.saving.set(false);
    }
  }

  private async finish(): Promise<void> {
    const session = this.session();
    if (!session || this.finishing()) {
      return;
    }
    this.finishing.set(true);
    this.error.set('');
    try {
      const completed = await this.api.finishSession(session.sessionId);
      this.result.set(completed);
      this.completionPending.set(false);
      await this.sendBotResult(session.sessionId);
    } catch (error) {
      console.error('Không thể hoàn tất bài nghe và điền từ', error);
      this.error.set(error instanceof Error ? error.message : 'Không thể hoàn tất bài học. Hãy thử lại.');
    } finally {
      this.finishing.set(false);
    }
  }

  private async sendBotResult(sessionId: string): Promise<void> {
    if (this.botSending()) {
      return;
    }
    this.botSending.set(true);
    this.botError.set('');
    try {
      await this.api.sendStudyResult(sessionId);
      this.botSent.set(true);
    } catch (error) {
      console.error('Không gửi được kết quả học cho NQuizlet', error);
      this.botError.set(error instanceof Error ? error.message : 'Chưa gửi được kết quả cho NQuizlet.');
    } finally {
      this.botSending.set(false);
    }
  }

  private preloadAudio(words: readonly VocabStudyWord[]): void {
    if (typeof Audio === 'undefined') {
      return;
    }
    for (const url of new Set(words.flatMap((word) => word.audioUrl ? [word.audioUrl] : []))) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      this.audioCache.set(url, audio);
    }
  }

  private startTimer(startedAt: string): void {
    const start = Date.parse(startedAt);
    this.timer = setInterval(() => {
      this.elapsedSeconds.set(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
  }
}
