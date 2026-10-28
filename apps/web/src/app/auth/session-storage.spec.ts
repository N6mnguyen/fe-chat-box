import { clearStoredSession, loadStoredSession, saveStoredSession } from './session-storage';

const jwt = (exp: number) => `h.${btoa(JSON.stringify({ exp }))}.s`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('session-storage', () => {
  beforeEach(() => localStorage.clear());

  it('restores a valid JWT session and drops an expired one', () => {
    const user = { name: 'An' };
    saveStoredSession({ accessToken: jwt(nowSeconds() + 600), user });
    expect(loadStoredSession()?.user).toEqual(user);

    saveStoredSession({ accessToken: jwt(nowSeconds() - 5), user });
    expect(loadStoredSession()).toBeNull();
  });

  it('restores an opaque (non-JWT) token on reload instead of logging out', () => {
    saveStoredSession({ accessToken: 'ya29.opaque-google-token', user: null });
    expect(loadStoredSession()?.accessToken).toBe('ya29.opaque-google-token');
  });

  it('expires an opaque token after the default TTL', () => {
    saveStoredSession({ accessToken: 'ya29.opaque', user: null }, Date.now() - 2 * 60 * 60_000);
    expect(loadStoredSession()).toBeNull();
  });

  it('ignores corrupt data and clears on demand', () => {
    localStorage.setItem('vchat.session', '{not json');
    expect(loadStoredSession()).toBeNull();

    saveStoredSession({ accessToken: jwt(nowSeconds() + 600), user: null });
    clearStoredSession();
    expect(loadStoredSession()).toBeNull();
  });
});
