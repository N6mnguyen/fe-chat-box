import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthStore } from './auth.store';
import { authErrorMessage } from './auth-error-message';
import { PasswordResetFlowService } from './password-reset-flow.service';

@Component({
  selector: 'app-forgot-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  template: `
    <div class="auth-form">
      <span class="auth-form__eyebrow">{{ 'auth.forgotEyebrow' | transloco }}</span>
      <h2 class="auth-form__title">{{ 'auth.forgotTitle' | transloco }}</h2>
      <p class="auth-form__description">{{ 'auth.forgotDescription' | transloco }}</p>
      @if (serverError()) {
        <div class="auth-form__alert" role="alert" aria-live="assertive">{{ serverError() }}</div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="auth-field">
          <label for="forgot-email">{{ 'auth.emailLabel' | transloco }}</label>
          <input #emailInput id="forgot-email" type="email" formControlName="email" autocomplete="email"
            [placeholder]="'auth.emailPlaceholder' | transloco"
            [attr.aria-invalid]="form.controls.email.touched && form.controls.email.invalid"
            [attr.aria-describedby]="form.controls.email.touched && form.controls.email.invalid ? 'forgot-email-error' : null" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <span id="forgot-email-error" class="auth-field__error" aria-live="polite">{{ 'auth.errors.emailInvalid' | transloco }}</span>
          }
        </div>
        <button class="auth-submit" type="submit" [disabled]="pending()">
          @if (pending()) { <span class="auth-submit__spinner" aria-hidden="true"></span> {{ 'auth.sending' | transloco }} }
          @else { {{ 'auth.sendResetCode' | transloco }} }
        </button>
      </form>
      @if (neutralNotice()) {
        <p class="auth-form__notice" role="status" aria-live="polite">{{ 'auth.resetNeutralNotice' | transloco }}</p>
        <button class="auth-submit" type="button" (click)="continueToReset()">{{ 'auth.continueReset' | transloco }}</button>
      }
      <p class="auth-form__switch"><a routerLink="/auth/login">{{ 'auth.backToLogin' | transloco }}</a></p>
    </div>
  `,
  styleUrl: './auth-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPageComponent implements AfterViewInit {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly flow = inject(PasswordResetFlowService);
  private readonly transloco = inject(TranslocoService);
  @ViewChild('emailInput') private readonly emailInput?: ElementRef<HTMLInputElement>;

  readonly pending = signal(false);
  readonly neutralNotice = signal(false);
  readonly serverError = signal('');
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(254)] }),
  });

  ngAfterViewInit(): void {
    queueMicrotask(() => this.emailInput?.nativeElement.focus());
  }

  async submit(): Promise<void> {
    this.serverError.set('');
    this.neutralNotice.set(false);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.emailInput?.nativeElement.focus();
      return;
    }

    this.pending.set(true);
    const email = this.form.controls.email.value.trim().toLowerCase();
    this.flow.email.set(email);
    try {
      await this.auth.requestPasswordReset(email);
      this.neutralNotice.set(true);
    } catch (error) {
      this.serverError.set(authErrorMessage(error, this.transloco).message);
    } finally {
      this.pending.set(false);
    }
  }

  continueToReset(): void {
    void this.router.navigateByUrl('/auth/reset');
  }
}
