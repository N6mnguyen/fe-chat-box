import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';

export type NQuizletCommand = 'weekly_stats' | 'review_wrong' | 'disable_reminders';

@Component({
  selector: 'app-nquizlet-quick-commands',
  standalone: true,
  template: `
    <nav class="quick-commands" aria-label="Lệnh nhanh với NQuizlet">
      <button type="button" (click)="commandSelected.emit('weekly_stats')">Thống kê tuần này</button>
      <button type="button" (click)="commandSelected.emit('review_wrong')">Ôn từ sai hôm nay</button>
      <button type="button" (click)="commandSelected.emit('disable_reminders')">Tắt nhắc học</button>
    </nav>
  `,
  styleUrl: './nquizlet-quick-commands.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NQuizletQuickCommandsComponent {
  @Output() commandSelected = new EventEmitter<NQuizletCommand>();
}
