import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthStore } from './auth.store';
import { authErrorMessage } from './auth-error-message';
import { PasswordResetFlowService } from './password-reset-flow.service';

@Component({
  selector: 'app-reset-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  template: `
    <div class="auth-form">
      <span class="auth-form__eyebrow">{{ 'auth.resetEyebrow' | transloco }}</span>
      <h2 class="auth-form__title">{{ 'auth.resetTitle' | transloco }}</h2>
      <p class="auth-form__description">{{ 'auth.resetDescription' | transloco }} <strong>{{ maskedEmail() }}</strong></p>
      @if (serverError()) {
        <div class="auth-form__alert" role="alert" aria-live="assertive">{{ serverError() }}</div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="auth-field">
          <label for="reset-code">{{ 'auth.otpLabel' | transloco }}</label>
          <input #otpInput id="reset-code" class="auth-otp" type="text" inputmode="numeric" autocomplete="one-time-code"
            maxlength="6" formControlName="otp" [placeholder]="'auth.otpPlaceholder' | transloco"
            [attr.aria-invalid]="form.controls.otp.touched && form.controls.otp.invalid"
            [attr.aria-describedby]="form.controls.otp.touched && form.controls.otp.invalid ? 'reset-code-error' : null"
            (input)="sanitizeOtp($event)" />
          @if (form.controls.otp.touched && form.controls.otp.invalid) {
            <span id="reset-code-error" class="auth-field__error" aria-live="polite">{{ 'auth.errors.otpFormat' | transloco }}</span>
          }
        </div>
        <div class="auth-field">
          <label for="reset-password">{{ 'auth.newPasswordLabel' | transloco }}</label>
          <input id="reset-password" type="password" formControlName="password" autocomplete="new-password"
            [placeholder]="'auth.passwordPlaceholder' | transloco"
            [attr.aria-invalid]="form.controls.password.touched && form.controls.password.invalid"
            [attr.aria-describedby]="form.controls.password.touched && form.controls.password.invalid ? 'reset-password-error' : null" />
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <span id="reset-password-error" class="auth-field__error" aria-live="polite">{{ 'auth.errors.passwordTooShort' | transloco }}</span>
          }
        </div>
        <button class="auth-submit" type="submit" [disabled]="pending()">
          @if (pending()) { <span class="auth-submit__spinner" aria-hidden="true"></span> {{ 'auth.resettingPassword' | transloco }} }
          @else { {{ 'auth.setNewPassword' | transloco }} }
        </button>
      </form>
      <p class="auth-form__switch"><a routerLink="/auth/forgot">{{ 'auth.useDifferentEmail' | transloco }}</a></p>
    </div>
  `,
  styleUrl: './auth-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPageComponent implements AfterViewInit {
  private readonly auth = inject(AuthStore);
  private readonly flow = inject(PasswordResetFlowService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  @ViewChild('otpInput') private readonly otpInput?: ElementRef<HTMLInputElement>;

  readonly pending = signal(false);
  readonly serverError = signal('');
  readonly maskedEmail = signal(this.mask(this.flow.email()));
  readonly form = new FormGroup({
    otp: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)] }),
  });

  ngAfterViewInit(): void {
    queueMicrotask(() => this.otpInput?.nativeElement.focus());
  }

  sanitizeOtp(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(0, 6);
    input.value = value;
    this.form.controls.otp.setValue(value);
  }

  async submit(): Promise<void> {
    this.serverError.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      if (this.form.controls.otp.invalid) {
        this.otpInput?.nativeElement.focus();
      } else {
        document.getElementById('reset-password')?.focus();
      }
      return;
    }

    this.pending.set(true);
    try {
      const { otp, password } = this.form.getRawValue();
      await this.auth.resetPassword({
        email: this.flow.email(),
        otp,
        newPassword: password,
      });
      this.flow.email.set('');
      await this.router.navigateByUrl('/auth/login');
    } catch (error) {
      this.serverError.set(authErrorMessage(error, this.transloco).message);
      this.form.controls.otp.setValue('');
      this.otpInput?.nativeElement.focus();
    } finally {
      this.pending.set(false);
    }
  }

  private mask(email: string): string {
    if (!email.includes('@')) {
      return '';
    }
    const [local = '', domain = ''] = email.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }
}
