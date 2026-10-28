import { AuthApiError } from './auth-api';
import { MockAuthApi } from './mock-auth-api';

describe('MockAuthApi', () => {
  let api: MockAuthApi;

  beforeEach(() => {
    vi.useFakeTimers();
    api = new MockAuthApi();
  });

  afterEach(() => vi.useRealTimers());

  async function advanceMockDelay<T>(request: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();
    return request;
  }

  it('uses the same verification flow for duplicate email addresses', async () => {
    const first = api.register({ username: 'first', email: 'same@example.com', password: 'password' });
    const firstChallenge = await advanceMockDelay(first);
    const second = api.register({ username: 'second', email: 'same@example.com', password: 'password' });
    const secondChallenge = await advanceMockDelay(second);

    expect(firstChallenge.kind).toBe('email-verification');
    expect(secondChallenge.kind).toBe('email-verification');
    expect(firstChallenge.maskedEmail).toBe(secondChallenge.maskedEmail);
  });

  it('only reports an existing username as taken', async () => {
    const available = api.isUsernameAvailable('new_name');
    expect(await advanceMockDelay(available)).toBe(true);

    api.setScenario('username-taken');
    const taken = api.isUsernameAvailable('new_name');
    expect(await advanceMockDelay(taken)).toBe(false);
  });

  it('returns a neutral password-reset response', async () => {
    const reset = api.requestPasswordReset('unknown@example.com');
    expect(await advanceMockDelay(reset)).toEqual({ accepted: true });
  });

  it('simulates rate limiting with Retry-After data', async () => {
    api.setScenario('rate-limited');
    const login = api.login({ identifier: 'person', password: 'private' });
    const outcome = login.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.runAllTimersAsync();
    const result = await outcome;

    expect(result).toHaveProperty('error');
    const error = 'error' in result ? result.error : null;
    expect(error).toBeInstanceOf(AuthApiError);
    expect((error as AuthApiError).details).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      retryAfterSeconds: expect.any(Number),
    });
  });

  it('accepts the development OTP and routes device login through verification', async () => {
    api.setScenario('otp-required');
    const login = api.login({ identifier: 'person@example.com', password: 'private' });
    const result = await advanceMockDelay(login);
    expect(result.kind).toBe('otp-required');
    if (result.kind !== 'otp-required') {
      return;
    }

    api.setScenario('success');
    const verification = api.verifyDevice({
      challengeId: result.challenge.id,
      otp: '123456',
      trustDevice: true,
    });
    const session = await advanceMockDelay(verification);
    expect(session.deviceToken).toBeTypeOf('string');
  });
});
