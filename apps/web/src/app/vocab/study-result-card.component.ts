import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';

import { IconComponent } from '../shared/icon.component';
import { StudyResultPayload, StudyResultWrongWord } from '../chat/chat.models';

export type StudyResultAction = 'review' | 'stats' | 'study';

@Component({
  selector: 'app-study-result-card',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './study-result-card.component.html',
  styleUrl: './study-result-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudyResultCardComponent {
  @Input({ required: true }) result!: StudyResultPayload;
  @Output() action = new EventEmitter<StudyResultAction>();

  readonly showAllWrong = signal(false);
  readonly audioError = signal('');

  get modeLabel(): string {
    switch (this.result.mode) {
      case 'fill_blank': return 'Điền từ';
      case 'listen_fill': return 'Nghe và điền từ';
      default: return 'Flashcard';
    }
  }

  get durationLabel(): string {
    const minutes = Math.floor(this.result.durationSec / 60);
    const seconds = this.result.durationSec % 60;
    return minutes ? `${minutes} phút ${seconds} giây` : `${seconds} giây`;
  }

  get visibleWrongWords(): StudyResultWrongWord[] {
    return this.showAllWrong() ? this.result.wrongWords : this.result.wrongWords.slice(0, 5);
  }

  async speak(word: StudyResultWrongWord): Promise<void> {
    this.audioError.set('');
    if (word.audioUrl) {
      try {
        await new Audio(word.audioUrl).play();
        return;
      } catch {
        this.audioError.set('Không phát được âm thanh. Thử lại bằng nút nghe.');
        return;
      }
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.audioError.set('Trình duyệt này chưa hỗ trợ phát âm.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = 'en-US';
    utterance.onerror = () => this.audioError.set('Không phát được âm thanh. Hãy thử lại.');
    window.speechSynthesis.speak(utterance);
  }
}
