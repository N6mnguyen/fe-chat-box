import { ChangeDetectionStrategy, Component, EventEmitter, Inject, Input, Output, signal } from '@angular/core';

import { VocabApiService, VocabWrongReview } from './vocab-api.service';
import { findVocabSpeechVoice, playVocabAudioBlob } from './vocab-study.utils';

@Component({
  selector: 'app-nquizlet-wrong-review',
  standalone: true,
  templateUrl: './nquizlet-wrong-review.component.html',
  styleUrl: './nquizlet-wrong-review.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NQuizletWrongReviewComponent {
  @Input({ required: true }) review!: VocabWrongReview;
  @Output() continueRequested = new EventEmitter<string | null>();

  readonly audioError = signal('');

  constructor(@Inject(VocabApiService) private readonly api: VocabApiService) {}

  get firstTopicId(): string | null {
    return this.review.words[0]?.topicId ?? null;
  }

  async speak(word: VocabWrongReview['words'][number]): Promise<void> {
    this.audioError.set('');
    if (word.audioUrl) {
      try {
        await new Audio(word.audioUrl).play();
        return;
      } catch {
        // Fall through to speech synthesis when the audio file cannot be played.
      }
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.audioError.set('Trình duyệt này chưa hỗ trợ phát âm.');
      return;
    }
    const language = word.language === 'zh' ? 'zh' : 'en';
    if (language === 'zh') {
      try {
        await playVocabAudioBlob(await this.api.pronunciation(word.word));
        return;
      } catch {
        this.audioError.set('Chưa phát được âm thanh. Bấm nghe lại hoặc kiểm tra kết nối mạng.');
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
    utterance.onerror = () => this.audioError.set('Không phát được âm thanh. Hãy thử lại.');
    window.speechSynthesis.speak(utterance);
  }
}
