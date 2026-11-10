import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { IconComponent } from '../shared/icon.component';
import { VocabApiService, VocabStudyResult, VocabStudySession, VocabStudyWord } from './vocab-api.service';
import { findVocabSpeechVoice, playVocabAudioBlob } from './vocab-study.utils';

interface FlashcardQueueItem {
  word: VocabStudyWord;
  questionIndex: number;
  firstPass: boolean;
  retryCount: number;
}

@Component({
  selector: 'app-flashcard-study',
  standalone: true,
  imports: [IconComponent, RouterLink],
  templateUrl: './flashcard-study.component.html',
  styleUrl: './flashcard-study.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardStudyComponent implements OnInit, OnDestroy {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly finishing = signal(false);
  readonly pendingAnswer = signal<boolean | null>(null);
  readonly error = signal('');
  readonly audioNotice = signal('');
  readonly session = signal<VocabStudySession | null>(null);
  readonly result = signal<VocabStudyResult | null>(null);
  readonly queue = signal<FlashcardQueueItem[]>([]);
  readonly currentIndex = signal(0);
  readonly flipped = signal(false);
  readonly autoSpeak = signal(false);
  readonly shuffled = signal(false);
  readonly completionPending = signal(false);
  readonly botSending = signal(false);
  readonly botSent = signal(false);
  readonly botError = signal('');
  readonly firstPassAnswered = signal(0);
  readonly firstPassCorrect = signal(0);
  readonly elapsedSeconds = signal(0);

  readonly currentCard = computed(() => this.queue()[this.currentIndex()] ?? null);
  readonly progressPercent = computed(() => {
    const total = this.session()?.wordCount ?? 0;
    return total ? Math.round((this.firstPassAnswered() / total) * 100) : 0;
  });
  readonly firstPassScorePercent = computed(() => {
    const answered = this.firstPassAnswered();
    return answered ? Math.round((this.firstPassCorrect() / answered) * 100) : 0;
  });
  readonly resultPercent = computed(() => {
    const result = this.result();
    return result?.total ? Math.round((result.score / result.total) * 100) : 0;
  });

  private nextQuestionIndex = 0;
  private timer?: ReturnType<typeof setInterval>;
  private touchStartX: number | null = null;

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
  }

  async loadSession(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const topicId = params.get('topicId');
    const wordCount = Number(params.get('wordCount'));
    if (!topicId || ![10, 15, 30].includes(wordCount) || params.get('mode') !== 'flashcard') {
      this.error.set('Cấu hình bài học không hợp lệ. Hãy chọn lại chủ đề và chế độ học.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      const session = await this.api.startSession(topicId, wordCount);
      this.session.set(session);
      this.queue.set(session.words.map((word, index) => ({
        word,
        questionIndex: index + 1,
        firstPass: true,
        retryCount: 0,
      })));
      if (session.language === 'zh' && session.words[0]) {
        this.api.warmPronunciation(session.words[0].word);
      }
      this.nextQuestionIndex = session.words.length;
      this.startTimer(session.startedAt);
    } catch (error) {
      console.error('Không thể bắt đầu bài flashcard', error);
      this.error.set(error instanceof Error ? error.message : 'Không thể bắt đầu bài học. Vui lòng thử lại.');
    } finally {
      this.loading.set(false);
    }
  }

  flip(): void {
    if (!this.loading() && !this.saving() && !this.result() && this.currentCard()) {
      this.flipped.update((value) => !value);
    }
  }

  onCardKeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) {
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      this.flip();
    } else if (this.flipped() && event.key === 'ArrowLeft') {
      event.preventDefault();
      void this.answer(false);
    } else if (this.flipped() && event.key === 'ArrowRight') {
      event.preventDefault();
      void this.answer(true);
    }
  }

  onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  onTouchEnd(event: TouchEvent): void {
    if (this.touchStartX === null || !this.flipped() || this.saving()) {
      this.touchStartX = null;
      return;
    }
    const delta = event.changedTouches[0]?.clientX - this.touchStartX;
    this.touchStartX = null;
    if (delta !== undefined && Math.abs(delta) > 60) {
      void this.answer(delta > 0);
    }
  }

  async answer(remembered: boolean): Promise<void> {
    const session = this.session();
    const card = this.currentCard();
    if (!session || !card || this.saving() || !this.flipped()) {
      return;
    }

    this.saving.set(true);
    this.pendingAnswer.set(remembered);
    this.error.set('');
    try {
      await this.api.saveAnswer(session.sessionId, {
        wordId: card.word.id,
        questionIndex: card.questionIndex,
        isCorrect: remembered,
        userAnswer: remembered ? 'remembered' : 'not_remembered',
      });
      this.pendingAnswer.set(null);

      if (card.firstPass) {
        this.firstPassAnswered.update((count) => count + 1);
        if (remembered) {
          this.firstPassCorrect.update((count) => count + 1);
        }
      }

      if (!remembered && card.retryCount < 1) {
        this.nextQuestionIndex += 1;
        this.queue.update((queue) => [
          ...queue,
          { ...card, questionIndex: this.nextQuestionIndex, firstPass: false, retryCount: card.retryCount + 1 },
        ]);
      }

      this.currentIndex.update((index) => index + 1);
      const nextWord = this.currentCard()?.word;
      if (nextWord && session.language === 'zh') {
        this.api.warmPronunciation(nextWord.word);
      }
      this.flipped.set(false);
      if (this.currentIndex() >= this.queue().length) {
        this.completionPending.set(true);
        await this.finish();
      } else if (this.autoSpeak()) {
        void this.speak();
      }
    } catch (error) {
      console.error('Không lưu được tiến độ từ vựng', error);
      this.error.set(error instanceof Error ? error.message : 'Không lưu được tiến độ. Hãy thử lại.');
    } finally {
      this.saving.set(false);
    }
  }

  shuffleRemaining(): void {
    if (this.saving()) {
      return;
    }
    const index = this.currentIndex();
    const queue = [...this.queue()];
    const remaining = queue.slice(index + 1);
    for (let cursor = remaining.length - 1; cursor > 0; cursor -= 1) {
      const swap = Math.floor(Math.random() * (cursor + 1));
      [remaining[cursor], remaining[swap]] = [remaining[swap], remaining[cursor]];
    }
    this.queue.set([...queue.slice(0, index + 1), ...remaining]);
    this.shuffled.update((value) => !value);
  }

  async speak(): Promise<void> {
    const word = this.currentCard()?.word;
    if (!word) {
      return;
    }
    this.audioNotice.set('');
    if (word.audioUrl) {
      try {
        await new Audio(word.audioUrl).play();
        return;
      } catch {
        // Fall through to speech synthesis when the audio file cannot be played.
      }
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.audioNotice.set('Trình duyệt này chưa hỗ trợ phát âm tự động.');
      return;
    }

    const language = this.session()?.language === 'zh' ? 'zh' : 'en';
    if (language === 'zh') {
      try {
        await playVocabAudioBlob(await this.api.pronunciation(word.word));
        return;
      } catch {
        this.audioNotice.set('Chưa phát được âm thanh. Bấm nghe lại hoặc kiểm tra kết nối mạng.');
        return;
      }
    }
    const voice = await findVocabSpeechVoice(language);

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = 'en-US';
    if (voice) {
      utterance.voice = voice;
    }
    utterance.onerror = () => this.audioNotice.set('Không phát được âm thanh. Hãy bấm nghe lại.');
    window.speechSynthesis.speak(utterance);
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

  retryFinish(): void {
    void this.finish();
  }

  retryBotResult(): void {
    const session = this.session();
    if (session) {
      void this.sendBotResult(session.sessionId);
    }
  }

  private async finish(): Promise<void> {
    const session = this.session();
    if (!session || this.finishing()) {
      return;
    }
    this.finishing.set(true);
    try {
      const completed = await this.api.finishSession(session.sessionId);
      this.result.set(completed);
      this.completionPending.set(false);
      this.error.set('');
      await this.sendBotResult(session.sessionId);
    } catch (error) {
      console.error('Không thể hoàn tất bài flashcard', error);
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

  private startTimer(startedAt: string): void {
    const start = Date.parse(startedAt);
    this.timer = setInterval(() => {
      this.elapsedSeconds.set(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
  }

  @HostListener('document:keydown.escape')
  stopSpeechOnEscape(): void {
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
  }
}
