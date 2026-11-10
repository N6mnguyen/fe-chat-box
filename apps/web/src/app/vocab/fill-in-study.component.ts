import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { IconComponent } from '../shared/icon.component';
import { VocabApiService, VocabStudyResult, VocabStudySession, VocabStudyWord } from './vocab-api.service';
import { normalizeVocabAnswer } from './vocab-study.utils';

interface PendingAnswer {
  answer: string;
  isCorrect: boolean;
  hintCount: number;
}

@Component({
  selector: 'app-fill-in-study',
  standalone: true,
  imports: [IconComponent, RouterLink],
  templateUrl: './fill-in-study.component.html',
  styleUrl: './fill-in-study.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FillInStudyComponent implements OnInit, OnDestroy {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly finishing = signal(false);
  readonly completionPending = signal(false);
  readonly botSending = signal(false);
  readonly botSent = signal(false);
  readonly botError = signal('');
  readonly error = signal('');
  readonly session = signal<VocabStudySession | null>(null);
  readonly result = signal<VocabStudyResult | null>(null);
  readonly currentIndex = signal(0);
  readonly answerText = signal('');
  readonly checked = signal<boolean | null>(null);
  readonly submittedAnswer = signal('');
  readonly hintCount = signal(0);
  readonly multipleChoice = signal(false);
  readonly pendingAnswer = signal<PendingAnswer | null>(null);
  readonly elapsedSeconds = signal(0);

  readonly words = computed(() => this.session()?.words ?? []);
  readonly currentWord = computed(() => this.words()[this.currentIndex()] ?? null);
  readonly questionText = computed(() => {
    const word = this.currentWord();
    return word ? maskWord(word.exampleEn, word.word) : '';
  });
  readonly hintText = computed(() => {
    const word = this.currentWord();
    if (!word) {
      return '';
    }
    const characters = Array.from(word.word);
    const revealedCount = Math.min(characters.length, this.hintCount() + 1);
    const revealed = characters.slice(0, revealedCount).join('');
    return `${revealed}${'_'.repeat(Math.max(0, characters.length - revealedCount))} (${characters.length} ký tự)`;
  });
  readonly options = computed(() => {
    const word = this.currentWord();
    if (!word) {
      return [];
    }
    const distractors = this.words()
      .filter((item) => item.id !== word.id)
      .map((item) => item.word);
    for (let index = distractors.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [distractors[index], distractors[swap]] = [distractors[swap], distractors[index]];
    }
    const choices = [word.word, ...distractors.slice(0, 3)];
    for (let index = choices.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [choices[index], choices[swap]] = [choices[swap], choices[index]];
    }
    return choices;
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
  }

  async loadSession(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const topicId = params.get('topicId');
    const wordCount = Number(params.get('wordCount'));
    if (!topicId || ![10, 15, 30].includes(wordCount) || params.get('mode') !== 'fill_blank') {
      this.error.set('Cấu hình bài học không hợp lệ. Hãy chọn lại chủ đề và chế độ học.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      const session = await this.api.startSession(topicId, wordCount, 'fill_blank');
      this.session.set(session);
      this.startTimer(session.startedAt);
    } catch (error) {
      console.error('Không thể bắt đầu bài điền từ', error);
      this.error.set(error instanceof Error ? error.message : 'Không thể bắt đầu bài học. Vui lòng thử lại.');
    } finally {
      this.loading.set(false);
    }
  }

  setAnswer(event: Event): void {
    if (event.target instanceof HTMLInputElement && this.checked() === null) {
      this.answerText.set(event.target.value);
    }
  }

  checkAnswer(): void {
    this.submitAnswer(this.answerText());
  }

  skip(): void {
    this.submitAnswer('');
  }

  selectOption(option: string): void {
    this.answerText.set(option);
    this.submitAnswer(option);
  }

  revealHint(): void {
    const word = this.currentWord();
    if (word && this.checked() === null && this.hintCount() < Math.min(20, Array.from(word.word).length - 1)) {
      this.hintCount.update((count) => count + 1);
    }
  }

  maxHints(word: VocabStudyWord): number {
    return Math.min(20, Array.from(word.word).length - 1);
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
    this.answerText.set('');
    this.submittedAnswer.set('');
    this.checked.set(null);
    this.hintCount.set(0);
    this.error.set('');
  }

  elapsedLabel(): string {
    const seconds = this.result()?.durationSec ?? this.elapsedSeconds();
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  returnToCourses(): void {
    void this.router.navigateByUrl('/vocab');
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
    const acceptedAnswers = [word.word, ...(word.alternativeAnswers ?? [])];
    const isCorrect = acceptedAnswers.some((accepted) => normalizeVocabAnswer(accepted) === normalizeVocabAnswer(answer));
    const pending = { answer, isCorrect, hintCount: this.hintCount() };
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
        hintCount: pending.hintCount,
      });
      this.checked.set(pending.isCorrect);
      this.submittedAnswer.set(pending.answer);
      this.pendingAnswer.set(null);
    } catch (error) {
      console.error('Không lưu được câu trả lời từ vựng', error);
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
      console.error('Không thể hoàn tất bài điền từ', error);
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
}

function maskWord(sentence: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sentence.replace(new RegExp(escaped, 'i'), '________');
}
