import { clearStoredSession, loadStoredSession, saveStoredSession } from './session-storage';

describe('session-storage', () => {
  beforeEach(() => clearStoredSession());

  it('restores session incl. refresh token, even when access token is expired', () => {
    const user = { name: 'An', email: 'a@b.c' };
    saveStoredSession({ accessToken: 'expired.jwt.x', refreshToken: 'r'.repeat(43), user });
    expect(loadStoredSession()).toEqual({ accessToken: 'expired.jwt.x', refreshToken: 'r'.repeat(43), user });
  });

  it('drops a session past its cookie lifetime', () => {
    saveStoredSession({ accessToken: 'a', refreshToken: 'r', user: null }, Date.now() - 15 * 24 * 60 * 60_000);
    expect(loadStoredSession()).toBeNull();
  });

  it('ignores corrupt data, clears on demand and removes legacy localStorage', () => {
    document.cookie = `vchat.session=${encodeURIComponent('{not json')}; path=/`;
    expect(loadStoredSession()).toBeNull();

    localStorage.setItem('vchat.session', 'old');
    saveStoredSession({ accessToken: 'a', refreshToken: 'r', user: null });
    clearStoredSession();
    expect(loadStoredSession()).toBeNull();
    expect(localStorage.getItem('vchat.session')).toBeNull();
  });
});
