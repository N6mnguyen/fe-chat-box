import { TranslocoService } from '@jsverse/transloco';

import { AuthApiError, AuthApiErrorDetails } from './auth-api';

export function authErrorMessage(
  error: unknown,
  transloco: TranslocoService,
): { message: string; retryAfterSeconds?: number } {
  const details: AuthApiErrorDetails = error instanceof AuthApiError
    ? error.details
    : { code: 'UNKNOWN' };
  const keys: Record<AuthApiErrorDetails['code'], string> = {
    INVALID_CREDENTIALS: 'auth.errors.invalidCredentials',
    USERNAME_TAKEN: 'auth.errors.usernameTaken',
    OTP_INVALID: 'auth.errors.otpInvalid',
    OTP_EXPIRED: 'auth.errors.otpExpired',
    OTP_ATTEMPTS_EXCEEDED: 'auth.errors.otpAttemptsExceeded',
    TOO_MANY_REQUESTS: 'auth.errors.tooManyRequests',
    SERVICE_UNAVAILABLE: 'auth.errors.serviceUnavailable',
    NETWORK_ERROR: 'auth.errors.network',
    UNKNOWN: 'auth.errors.unknown',
  };
  const safeRequestId = details.requestId?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const message = transloco.translate(keys[details.code], {
    requestId: safeRequestId || transloco.translate('auth.errors.requestIdUnavailable'),
    seconds: details.retryAfterSeconds ?? 0,
  });
  return {
    message,
    retryAfterSeconds: details.retryAfterSeconds,
  };
}
