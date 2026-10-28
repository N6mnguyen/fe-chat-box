import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import {
  AUTH_API,
  AuthApiError,
  AuthApiErrorDetails,
  AuthChallenge,
  AuthResult,
  AuthSession,
  AuthUser,
  LoginRequest,
  OtpRequest,
  PasswordResetRequestResult,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyDeviceRequest,
} from './auth-api';
import { SECURE_TOKEN_STORE } from './secure-token-store';
import { clearStoredSession, loadStoredSession, saveStoredSession } from './session-storage';

export type AuthStatus = 'unauthenticated' | 'authenticating' | 'otp-required' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: AuthUser | null;
  challenge: AuthChallenge | null;
  error: AuthApiErrorDetails | null;
}

const initialState: AuthState = {
  status: 'unauthenticated',
  accessToken: null,
  user: null,
  challenge: null,
  error: null,
};

/** Khôi phục phiên đã lưu (còn hạn) để F5 không phải đăng nhập lại. */
function restoredState(): AuthState {
  const stored = loadStoredSession();
  return stored
    ? { ...initialState, status: 'authenticated', accessToken: stored.accessToken, user: stored.user }
    : initialState;
}

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(restoredState()),
  withMethods((store, api = inject(AUTH_API), secureTokens = inject(SECURE_TOKEN_STORE)) => {
    const saveSession = async (session: AuthSession): Promise<void> => {
      try {
        await secureTokens.setRefreshToken(session.refreshToken);
        if (session.deviceToken) {
          await secureTokens.setDeviceToken(session.deviceToken);
        }
      } catch (error) {
        await secureTokens.clear();
        throw error;
      }
      patchState(store, {
        status: 'authenticated',
        accessToken: session.accessToken,
        user: session.user ?? null,
        challenge: null,
        error: null,
      });
      saveStoredSession({ accessToken: session.accessToken, user: session.user ?? null });
    };

    const failRequest = (error: unknown): never => {
      const details: AuthApiErrorDetails = error instanceof AuthApiError
        ? error.details
        : { code: 'UNKNOWN' };
      clearStoredSession();
      patchState(store, {
        status: 'unauthenticated',
        accessToken: null,
        user: null,
        challenge: null,
        error: details,
      });
      throw error;
    };

    const run = async <T>(
      request: () => Promise<T>,
      onSuccess: (result: T) => Promise<void> | void,
    ): Promise<T> => {
      patchState(store, {
        status: 'authenticating',
        accessToken: null,
        challenge: null,
        error: null,
      });
      try {
        const result = await request();
        await onSuccess(result);
        return result;
      } catch (error) {
        return failRequest(error);
      }
    };

    return {
      async register(request: RegisterRequest): Promise<AuthChallenge> {
        return run(
          () => api.register(request),
          (challenge) => patchState(store, { status: 'otp-required', challenge }),
        );
      },

      async login(request: LoginRequest): Promise<AuthResult> {
        return run(
          () => api.login(request),
          async (result) => {
            if (result.kind === 'authenticated') {
              await saveSession(result.session);
            } else {
              patchState(store, {
                status: 'otp-required',
                challenge: result.challenge,
                error: null,
              });
            }
          },
        );
      },

      async loginWithGoogle(): Promise<void> {
        await run(() => api.loginWithGoogle(), saveSession);
      },

      async verifyEmail(request: OtpRequest): Promise<void> {
        await run(() => api.verifyEmail(request), saveSession);
      },

      async verifyDevice(request: VerifyDeviceRequest): Promise<void> {
        await run(() => api.verifyDevice(request), saveSession);
      },

      async requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
        return api.requestPasswordReset(email);
      },

      async resetPassword(request: ResetPasswordRequest): Promise<void> {
        await api.resetPassword(request);
        patchState(store, { ...initialState });
      },

      async resendCode(challengeId: string): Promise<AuthChallenge> {
        const challenge = await api.resendCode(challengeId);
        patchState(store, { status: 'otp-required', challenge, error: null });
        return challenge;
      },

      async refreshAccessToken(): Promise<string> {
        try {
          const refreshToken = await secureTokens.getRefreshToken();
          if (!refreshToken) {
            return failRequest(new AuthApiError({ code: 'INVALID_CREDENTIALS' }));
          }
          const session = await api.refreshSession(refreshToken);
          await saveSession(session);
          return session.accessToken;
        } catch (error) {
          await secureTokens.clear();
          return failRequest(error);
        }
      },

      async logout(): Promise<void> {
        clearStoredSession();
        await secureTokens.clear();
        patchState(store, { ...initialState });
      },

      clearError(): void {
        patchState(store, { error: null });
      },
    };
  }),
);
