import { TestBed } from '@angular/core/testing';

import { AUTH_API, AuthApi, AuthApiError } from './auth-api';
import { AuthStore } from './auth.store';
import { InMemorySecureTokenStore, SECURE_TOKEN_STORE } from './secure-token-store';

describe('AuthStore', () => {
  let api: AuthApi;
  let secureTokens: InMemorySecureTokenStore;
  let store: InstanceType<typeof AuthStore>;

  beforeEach(() => {
    api = {
      isUsernameAvailable: vi.fn().mockResolvedValue(true),
      register: vi.fn().mockResolvedValue({
        id: 'challenge-1',
        kind: 'email-verification',
        maskedEmail: 't***@example.com',
        expiresAt: Date.now() + 300_000,
        resendAfterSeconds: 45,
      }),
      verifyEmail: vi.fn().mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      login: vi.fn().mockResolvedValue({
        kind: 'authenticated',
        session: { accessToken: 'access-1', refreshToken: 'refresh-1' },
      }),
      verifyDevice: vi.fn().mockResolvedValue({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        deviceToken: 'device-2',
      }),
      requestPasswordReset: vi.fn().mockResolvedValue({ accepted: true }),
      resetPassword: vi.fn().mockResolvedValue(undefined),
      resendCode: vi.fn().mockResolvedValue({
        id: 'challenge-2',
        kind: 'email-verification',
        maskedEmail: 't***@example.com',
        expiresAt: Date.now() + 300_000,
        resendAfterSeconds: 45,
      }),
      refreshSession: vi.fn().mockResolvedValue({ accessToken: 'access-3', refreshToken: 'refresh-3' }),
    };
    secureTokens = new InMemorySecureTokenStore();
    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        { provide: AUTH_API, useValue: api },
        { provide: SECURE_TOKEN_STORE, useValue: secureTokens },
      ],
    });
    store = TestBed.inject(AuthStore);
  });

  it('keeps access tokens in memory and stores refresh tokens through SecureTokenStore', async () => {
    await store.login({ identifier: 'person@example.com', password: 'password' });

    expect(store.status()).toBe('authenticated');
    expect(store.accessToken()).toBe('access-1');
    expect(await secureTokens.getRefreshToken()).toBe('refresh-1');
    expect(store.error()).toBeNull();
  });

  it('moves to device verification without storing credentials or tokens', async () => {
    const challenge = {
      id: 'device-challenge',
      kind: 'device-verification' as const,
      maskedEmail: 'p***@example.com',
      expiresAt: Date.now() + 300_000,
      resendAfterSeconds: 45,
    };
    vi.mocked(api.login).mockResolvedValue({ kind: 'otp-required', challenge });

    await store.login({ identifier: 'person@example.com', password: 'private' });

    expect(store.status()).toBe('otp-required');
    expect(store.challenge()).toEqual(challenge);
    expect(store.accessToken()).toBeNull();
    expect(await secureTokens.getRefreshToken()).toBeNull();
  });

  it('stores the trusted device token only through SecureTokenStore', async () => {
    await store.verifyDevice({ challengeId: 'device-challenge', otp: '123456', trustDevice: true });

    expect(store.accessToken()).toBe('access-2');
    expect(await secureTokens.getRefreshToken()).toBe('refresh-2');
    expect(await secureTokens.getDeviceToken()).toBe('device-2');
  });

  it('keeps server error codes in state without adding credentials', async () => {
    vi.mocked(api.login).mockRejectedValue(new AuthApiError({ code: 'INVALID_CREDENTIALS' }));

    await expect(store.login({ identifier: 'person@example.com', password: 'private' })).rejects.toBeInstanceOf(AuthApiError);

    expect(store.status()).toBe('unauthenticated');
    expect(store.error()?.code).toBe('INVALID_CREDENTIALS');
    expect(store.accessToken()).toBeNull();
  });

  it('clears in-memory and secure tokens on logout', async () => {
    await store.login({ identifier: 'person@example.com', password: 'password' });
    await store.logout();

    expect(store.status()).toBe('unauthenticated');
    expect(store.accessToken()).toBeNull();
    expect(await secureTokens.getRefreshToken()).toBeNull();
  });
});
