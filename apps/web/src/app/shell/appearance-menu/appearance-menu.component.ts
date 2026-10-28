import { ChangeDetectionStrategy, Component, Signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import {
  THEME_MODES,
  ThemeMode,
  ThemeService,
  WALLPAPERS,
  Wallpaper,
} from '../../shared/theme.service';

/** Bảng chọn giao diện: chế độ màu và hình nền chat. */
@Component({
  selector: 'app-appearance-menu',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './appearance-menu.component.html',
  styleUrl: './appearance-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearanceMenuComponent {
  readonly modes = THEME_MODES;
  readonly wallpapers = WALLPAPERS;
  readonly theme: Signal<ThemeMode>;
  readonly wallpaper: Signal<Wallpaper>;

  constructor(private readonly themeService: ThemeService) {
    this.theme = themeService.theme;
    this.wallpaper = themeService.wallpaper;
  }

  setTheme(mode: ThemeMode): void {
    this.themeService.setTheme(mode);
  }

  setWallpaper(wallpaper: Wallpaper): void {
    this.themeService.setWallpaper(wallpaper);
  }
}
