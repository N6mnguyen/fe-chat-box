import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { VocabLanguage } from '../../vocab/vocab-api.service';

export type NQuizletCommand = 'stats' | 'review_wrong' | 'disable_reminders';

@Component({
  selector: 'app-nquizlet-quick-commands',
  standalone: true,
  template: `
    <nav class="quick-commands" [class.quick-commands--ranges]="showStatsRanges" aria-label="Lệnh nhanh với NQuizlet">
      <div class="quick-commands__languages" role="group" aria-label="Chọn ngôn ngữ thống kê và ôn tập">
        <button type="button" [attr.aria-pressed]="selectedLanguage === 'en'" (click)="languageSelected.emit('en')">English</button>
        <button type="button" [attr.aria-pressed]="selectedLanguage === 'zh'" (click)="languageSelected.emit('zh')">中文</button>
      </div>
      <button
        type="button"
        [attr.aria-expanded]="showStatsRanges"
        (click)="commandSelected.emit('stats')"
      >Thống kê</button>
      <button type="button" (click)="commandSelected.emit('review_wrong')">Ôn từ sai hôm nay</button>
      <button type="button" (click)="commandSelected.emit('disable_reminders')">Tắt nhắc học</button>
      @if (showStatsRanges) {
        <div class="quick-commands__ranges" role="group" aria-label="Chọn khoảng thời gian thống kê">
          <span>NQuizlet sẽ xem thống kê trong:</span>
          <button type="button" [attr.aria-pressed]="selectedStatsDays === 7" [disabled]="loadingStats" (click)="statsRangeSelected.emit(7)">7 ngày</button>
          <button type="button" [attr.aria-pressed]="selectedStatsDays === 14" [disabled]="loadingStats" (click)="statsRangeSelected.emit(14)">14 ngày</button>
          <button type="button" [attr.aria-pressed]="selectedStatsDays === 30" [disabled]="loadingStats" (click)="statsRangeSelected.emit(30)">1 tháng</button>
        </div>
      }
    </nav>
  `,
  styleUrl: './nquizlet-quick-commands.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NQuizletQuickCommandsComponent {
  @Input() showStatsRanges = false;
  @Input() selectedLanguage: VocabLanguage = 'en';
  @Input() selectedStatsDays: 7 | 14 | 30 | null = null;
  @Input() loadingStats = false;

  @Output() commandSelected = new EventEmitter<NQuizletCommand>();
  @Output() languageSelected = new EventEmitter<VocabLanguage>();
  @Output() statsRangeSelected = new EventEmitter<7 | 14 | 30>();
}
