import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Wallpaper = 'none' | 'mist' | 'silk' | 'lotus' | 'night';

export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];
export const WALLPAPERS: readonly Wallpaper[] = ['none', 'mist', 'silk', 'lotus', 'night'];

const STORAGE_KEY = 'vchat.appearance';

/** Quản lý giao diện (sáng/tối/hệ thống + hình nền chat), lưu lựa chọn cục bộ. Không chứa dữ liệu nhạy cảm. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<ThemeMode>('dark');
  readonly wallpaper = signal<Wallpaper>('none');

  constructor(@Inject(DOCUMENT) private readonly document: Document) {
    this.restore();
    // Áp dụng lên <html> để toàn bộ CSS variables đổi theo.
    effect(() => {
      const root = this.document.documentElement;
      root.dataset['theme'] = this.theme();
      root.dataset['wallpaper'] = this.wallpaper();
      this.persist();
    });
  }

  setTheme(mode: ThemeMode): void {
    this.theme.set(mode);
  }

  setWallpaper(wallpaper: Wallpaper): void {
    this.wallpaper.set(wallpaper);
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const saved = JSON.parse(raw) as { theme?: ThemeMode; wallpaper?: Wallpaper };
      if (saved.theme && THEME_MODES.includes(saved.theme)) {
        this.theme.set(saved.theme);
      }
      if (saved.wallpaper && WALLPAPERS.includes(saved.wallpaper)) {
        this.wallpaper.set(saved.wallpaper);
      }
    } catch {
      // Storage bị chặn hoặc dữ liệu hỏng: dùng mặc định.
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ theme: this.theme(), wallpaper: this.wallpaper() }),
      );
    } catch {
      // Bỏ qua khi không ghi được (chế độ riêng tư).
    }
  }
}
