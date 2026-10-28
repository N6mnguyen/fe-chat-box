import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, Inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { ThemeService } from '../shared/theme.service';

type Language = 'vi' | 'en';

const LANGUAGES: readonly { code: Language; label: string }[] = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
];

@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink, RouterOutlet, TranslocoPipe],
  templateUrl: './auth-layout.component.html',
  styleUrl: './auth-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent {
  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly transloco: TranslocoService,
    private readonly themeService: ThemeService,
  ) {
    this.language = toSignal(this.transloco.langChanges$, {
      initialValue: this.transloco.getActiveLang(),
    });
    effect(() => {
      this.document.documentElement.lang = this.language();
    });
  }

  readonly languages = LANGUAGES;
  readonly year = new Date().getFullYear();

  readonly language: Signal<string>;
  readonly isDarkTheme = computed(() => this.themeService.theme() === 'dark');

  toggleTheme(): void {
    this.themeService.setTheme(this.isDarkTheme() ? 'light' : 'dark');
  }

  setLanguage(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (LANGUAGES.some((lang) => lang.code === value)) {
      this.transloco.setActiveLang(value);
    }
  }
}