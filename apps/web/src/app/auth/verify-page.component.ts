import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { authErrorMessage } from './auth-error-message';
import { AuthStore } from './auth.store';

@Component({
  selector: 'app-verify-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './verify-page.component.html',
  styleUrl: './auth-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyPageComponent implements AfterViewInit, OnDestroy {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  readonly challenge = signal(this.auth.challenge());
  readonly isDeviceChallenge = this.challenge()?.kind === 'device-verification';
  readonly otp = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{6}$/)],
  });
  readonly trustDevice = signal(true);
  readonly pending = signal(false);
  readonly serverError = signal('');
  readonly resendSeconds = signal(this.challenge()?.resendAfterSeconds ?? 45);
  @ViewChild('otpInput') private readonly otpInput?: ElementRef<HTMLInputElement>;
  private resendTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.startResendCountdown();
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.otpInput?.nativeElement.focus());
  }

  ngOnDestroy(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }
  }

  async submit(): Promise<void> {
    this.serverError.set('');
    this.otp.markAsTouched();
    const challenge = this.challenge();
    if (this.otp.invalid || !challenge || this.pending()) {
      return;
    }

    this.pending.set(true);
    const request = { challengeId: challenge.id, otp: this.otp.value };
    try {
      if (this.isDeviceChallenge) {
        await this.auth.verifyDevice({ ...request, trustDevice: this.trustDevice() });
      } else {
        await this.auth.verifyEmail(request);
      }
      await this.router.navigateByUrl('/');
    } catch (error) {
      const details = authErrorMessage(error, this.transloco);
      this.serverError.set(details.message);
      this.otp.setValue('');
      this.otp.markAsTouched();
      this.otpInput?.nativeElement.focus();
      if (error instanceof Error && 'details' in error &&
          (error as { details?: { code?: string } }).details?.code === 'OTP_ATTEMPTS_EXCEEDED') {
        await this.router.navigateByUrl(this.isDeviceChallenge ? '/auth/login' : '/auth/register');
      }
    } finally {
      this.pending.set(false);
    }
  }

  updateOtp(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    this.otp.setValue(digits);
    input.value = digits;
    if (digits.length === 6) {
      void this.submit();
    }
  }

  async resend(): Promise<void> {
    const challenge = this.challenge();
    if (!challenge || this.resendSeconds() > 0 || this.pending()) {
      return;
    }
    this.serverError.set('');
    this.pending.set(true);
    try {
      const next = await this.auth.resendCode(challenge.id);
      this.challenge.set(next);
      this.otp.setValue('');
      this.resendSeconds.set(next.resendAfterSeconds);
      this.startResendCountdown();
    } catch (error) {
      this.serverError.set(authErrorMessage(error, this.transloco).message);
    } finally {
      this.pending.set(false);
    }
  }

  setTrustDevice(event: Event): void {
    this.trustDevice.set((event.target as HTMLInputElement).checked);
  }

  private startResendCountdown(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }
    if (this.resendSeconds() <= 0) {
      return;
    }
    this.resendTimer = setInterval(() => {
      this.resendSeconds.update((seconds) => Math.max(0, seconds - 1));
      if (!this.resendSeconds() && this.resendTimer) {
        clearInterval(this.resendTimer);
      }
    }, 1000);
  }
}
