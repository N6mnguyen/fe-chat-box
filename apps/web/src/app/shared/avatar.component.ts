import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';

const HUE_COUNT = 8;

/** Avatar chữ cái đầu. Màu ổn định theo `seed` (id người dùng), không dùng ảnh/brand bên ngoài. */
@Component({
  selector: 'app-avatar',
  standalone: true,
  templateUrl: './avatar.component.html',
  styleUrl: './avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarComponent implements OnChanges {
  @Input({ required: true }) name = '';
  /** Khóa sinh màu; mặc định dùng tên. */
  @Input() seed = '';
  @Input() online = false;
  @Input() showPresence = false;

  initial = '?';
  hue = 0;

  ngOnChanges(): void {
    const trimmed = this.name.trim();
    this.initial = trimmed ? (Array.from(trimmed)[0] ?? '?').toUpperCase() : '?';
    const key = this.seed || trimmed;
    this.hue = Array.from(key).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % HUE_COUNT;
  }
}
