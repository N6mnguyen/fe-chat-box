import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';

import { AUTH_API, AuthApiError } from './auth-api';
import { authErrorMessage } from './auth-error-message';
import { AuthStore } from './auth.store';

const USERNAME_PATTERN = /^(?!\.)(?!.*\.\.)[a-z0-9_.]{3,30}(?<!\.)$/;

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './register-page.component.html',
  styleUrl: './auth-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPageComponent implements AfterViewInit, OnDestroy {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(AUTH_API);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  @ViewChild('usernameInput') private readonly usernameInput?: ElementRef<HTMLInputElement>;

  readonly pending = signal(false);
  readonly checkingUsername = signal(false);
  readonly usernameTaken = signal(false);
  readonly showPassword = signal(false);
  readonly serverError = signal('');
  readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(30),
        Validators.pattern(USERNAME_PATTERN),
      ],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)],
    }),
  });

  private usernameCheck = '';
  private checkSequence = 0;
  private readonly normalization = new Subscription();

  constructor() {
    this.normalization.add(this.form.controls.username.valueChanges.subscribe((value) => {
      const normalized = value.toLowerCase();
      if (value !== normalized) {
        this.form.controls.username.setValue(normalized, { emitEvent: false });
      }
      if (normalized !== this.usernameCheck) {
        this.usernameTaken.set(false);
      }
    }));
    this.normalization.add(this.form.controls.email.valueChanges.subscribe((value) => {
      const normalized = value.trim().toLowerCase();
      if (value !== normalized) {
        this.form.controls.email.setValue(normalized, { emitEvent: false });
      }
    }));
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.usernameInput?.nativeElement.focus());
  }

  ngOnDestroy(): void {
    this.normalization.unsubscribe();
  }

  async checkUsername(): Promise<void> {
    const control = this.form.controls.username;
    control.markAsTouched();
    if (control.invalid) {
      return;
    }

    const username = control.value;
    const sequence = ++this.checkSequence;
    this.checkingUsername.set(true);
    this.serverError.set('');
    try {
      const available = await this.api.isUsernameAvailable(username);
      if (sequence === this.checkSequence && this.form.controls.username.value === username) {
        this.usernameCheck = username;
        this.usernameTaken.set(!available);
      }
    } catch (error) {
      if (sequence === this.checkSequence) {
        this.serverError.set(authErrorMessage(error, this.transloco).message);
      }
    } finally {
      if (sequence === this.checkSequence) {
        this.checkingUsername.set(false);
      }
    }
  }

  togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }

  async submit(): Promise<void> {
    this.serverError.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.focusFirstInvalid();
      return;
    }

    const username = this.form.controls.username.value;
    if (this.usernameCheck !== username) {
      await this.checkUsername();
    }
    if (this.usernameTaken() || this.serverError()) {
      this.usernameInput?.nativeElement.focus();
      return;
    }

    this.pending.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.register({ username, email, password });
      await this.router.navigateByUrl('/auth/verify');
    } catch (error) {
      const mapped = authErrorMessage(error, this.transloco);
      this.serverError.set(mapped.message);
      if (error instanceof AuthApiError && error.details.code === 'USERNAME_TAKEN') {
        this.usernameTaken.set(true);
        this.usernameCheck = username;
        this.usernameInput?.nativeElement.focus();
      }
    } finally {
      this.pending.set(false);
    }
  }

  errorFor(controlName: 'username' | 'email' | 'password'): string {
    const control = this.form.controls[controlName];
    if (!control.touched) {
      return '';
    }
    if (control.hasError('required')) {
      return this.transloco.translate(`auth.errors.${controlName}Required`);
    }
    if (control.hasError('minlength')) {
      return this.transloco.translate(controlName === 'password' ? 'auth.errors.passwordTooShort' : 'auth.errors.usernameLength');
    }
    if (control.hasError('maxlength')) {
      return this.transloco.translate(controlName === 'password' ? 'auth.errors.passwordTooLong' : 'auth.errors.usernameLength');
    }
    if (control.hasError('email')) {
      return this.transloco.translate('auth.errors.emailInvalid');
    }
    if (control.hasError('pattern')) {
      return this.transloco.translate('auth.errors.usernameInvalid');
    }
    if (controlName === 'username' && this.usernameTaken()) {
      return this.transloco.translate('auth.errors.usernameTaken');
    }
    return '';
  }

  private focusFirstInvalid(): void {
    if (this.form.controls.username.invalid) {
      this.usernameInput?.nativeElement.focus();
    } else if (this.form.controls.email.invalid) {
      document.getElementById('register-email')?.focus();
    } else {
      document.getElementById('register-password')?.focus();
    }
  }
}
