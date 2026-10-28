import { ChangeDetectionStrategy, Component, Inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { authErrorMessage } from './auth-error-message';
import { AuthStore } from './auth.store';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './login-page.component.html',
  styleUrl: './auth-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  constructor(
    @Inject(AuthStore) private readonly auth: InstanceType<typeof AuthStore>,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly transloco: TranslocoService,
  ) {}

  readonly pending = signal(false);
  readonly serverError = signal('');

  async loginWithGoogle(): Promise<void> {
    if (this.pending()) {
      return;
    }
    this.serverError.set('');
    this.pending.set(true);
    try {
      await this.auth.loginWithGoogle();
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(this.safeReturnUrl(returnUrl));
    } catch (error) {
      this.serverError.set(authErrorMessage(error, this.transloco).message);
    } finally {
      this.pending.set(false);
    }
  }

  private safeReturnUrl(value: string | null): string {
    return value?.startsWith('/') && !value.startsWith('//') && !value.startsWith('/auth')
      ? value
      : '/';
  }
}
