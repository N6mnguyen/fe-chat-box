import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { authErrorMessage } from './auth-error-message';
import { AuthStore } from './auth.store';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './login-page.component.html',
  styleUrl: './auth-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent implements AfterViewInit, OnDestroy {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  @ViewChild('identifierInput') private readonly identifierInput?: ElementRef<HTMLInputElement>;

  readonly pending = signal(false);
  readonly showPassword = signal(false);
  readonly serverError = signal('');
  readonly retrySeconds = signal(0);
  readonly form = new FormGroup({
    identifier: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(128)] }),
  });

  private retryTimer?: ReturnType<typeof setInterval>;

  ngAfterViewInit(): void {
    queueMicrotask(() => this.identifierInput?.nativeElement.focus());
  }

  ngOnDestroy(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }
  }

  togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }

  async submit(): Promise<void> {
    this.serverError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }

    this.pending.set(true);
    try {
      const { identifier, password } = this.form.getRawValue();
      const result = await this.auth.login({
        identifier: identifier.trim().toLowerCase(),
        password,
      });
      if (result.kind === 'otp-required') {
        await this.router.navigateByUrl('/auth/verify-device');
        return;
      }
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(this.safeReturnUrl(returnUrl));
    } catch (error) {
      const mapped = authErrorMessage(error, this.transloco);
      this.serverError.set(mapped.message);
      if (mapped.retryAfterSeconds) {
        this.startRetryCountdown(mapped.retryAfterSeconds);
      }
    } finally {
      this.pending.set(false);
    }
  }

  errorFor(controlName: 'identifier' | 'password'): string {
    const control = this.form.controls[controlName];
    if (!control.touched) {
      return '';
    }
    if (control.hasError('required')) {
      return this.transloco.translate(controlName === 'identifier' ? 'auth.errors.identifierRequired' : 'auth.errors.passwordRequired');
    }
    if (control.hasError('maxlength')) {
      return this.transloco.translate('auth.errors.passwordTooLong');
    }
    return '';
  }

  private safeReturnUrl(value: string | null): string {
    return value?.startsWith('/') && !value.startsWith('//') && !value.startsWith('/auth')
      ? value
      : '/';
  }

  private focusFirstInvalid(): void {
    const first = Object.values(this.form.controls).find((control) => control.invalid);
    const name = Object.entries(this.form.controls).find(([, control]) => control === first)?.[0];
    const target = name === 'password'
      ? document.getElementById('login-password')
      : this.identifierInput?.nativeElement;
    target?.focus();
  }

  private startRetryCountdown(seconds: number): void {
    this.retrySeconds.set(Math.max(0, seconds));
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }
    this.retryTimer = setInterval(() => {
      this.retrySeconds.update((value) => Math.max(0, value - 1));
      if (!this.retrySeconds()) {
        clearInterval(this.retryTimer);
      }
    }, 1000);
  }
}
