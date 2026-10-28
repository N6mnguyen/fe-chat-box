import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { ThemeService } from '../shared/theme.service';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet, TranslocoPipe],
  template: `
    <main class="auth">
      <header class="auth__toolbar">
        <label class="auth__language">
          <span class="visually-hidden">{{ 'auth.language' | transloco }}</span>
          <select [value]="language()" (change)="setLanguage($event)">
            <option value="vi">VI</option>
            <option value="en">EN</option>
          </select>
        </label>
        <button type="button" class="auth__theme" (click)="toggleTheme()">
          {{ (theme.theme() === 'dark' ? 'auth.lightTheme' : 'auth.darkTheme') | transloco }}
        </button>
      </header>
      <section class="auth__card">
        <aside class="auth__intro">
          <a class="auth__brand" routerLink="/auth/login" aria-label="NChat">
            <img class="auth__brand-mark" src="/favicon.png" alt="" />
            <span>NChat</span>
          </a>
          <div class="auth__welcome">
            <span class="auth__eyebrow">{{ 'auth.welcomeEyebrow' | transloco }}</span>
            <h1>{{ 'auth.welcomeTitle' | transloco }}</h1>
            <p>{{ 'auth.welcomeText' | transloco }}</p>
            <div class="auth__art" aria-hidden="true">
              <span class="auth__bubble auth__bubble--one"></span>
              <span class="auth__bubble auth__bubble--two"></span>
              <span class="auth__bubble auth__bubble--three"></span>
              <span class="auth__orbit"></span>
            </div>
          </div>
          <span class="auth__footnote">{{ 'auth.privateByDesign' | transloco }}</span>
        </aside>
        <section class="auth__form-panel">
          <router-outlet />
        </section>
      </section>
    </main>
  `,
  styleUrl: './auth-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent {
  readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);
  readonly language = signal(this.transloco.getActiveLang());

  toggleTheme(): void {
    this.theme.setTheme(this.theme.theme() === 'dark' ? 'light' : 'dark');
  }

  setLanguage(event: Event): void {
    const language = (event.target as HTMLSelectElement).value;
    if (language === 'vi' || language === 'en') {
      this.language.set(language);
      this.transloco.setActiveLang(language);
    }
  }
}
