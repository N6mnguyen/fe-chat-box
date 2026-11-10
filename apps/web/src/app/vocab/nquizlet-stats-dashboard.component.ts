import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { VocabStats, VocabStatsDay } from './vocab-api.service';

@Component({
  selector: 'app-nquizlet-stats-dashboard',
  standalone: true,
  templateUrl: './nquizlet-stats-dashboard.component.html',
  styleUrl: './nquizlet-stats-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NQuizletStatsDashboardComponent {
  @Input({ required: true }) stats!: VocabStats;
  @Output() studyRequested = new EventEmitter<void>();

  get periodLabel(): string {
    return this.stats.days === 30 ? '1 tháng' : `${this.stats.days} ngày`;
  }

  get chartMax(): number {
    return Math.max(1, ...this.stats.daily.map((day) => day.wordsStudied));
  }

  dayLabel(day: VocabStatsDay): string {
    const date = new Date(`${day.date}T12:00:00`);
    return new Intl.DateTimeFormat('vi-VN', {
      weekday: this.stats.days === 7 ? 'short' : undefined,
      day: 'numeric',
      month: this.stats.days === 7 ? undefined : 'numeric',
    }).format(date);
  }

  barHeight(day: VocabStatsDay): number {
    return day.wordsStudied === 0 ? 0 : Math.max(8, (day.wordsStudied / this.chartMax) * 100);
  }
}
