import { AuthUser } from './auth-api';

export interface StoredSession {
  accessToken: string;
  user: AuthUser | null;
}

interface PersistedSession extends StoredSession {
  expiresAt: number;
}

const KEY = 'vchat.session';
// ponytail: token không phải JWT (vd. Google ya29) không có exp; giả định 1 giờ. Dùng expires_in của server khi có.
const DEFAULT_TTL_MS = 60 * 60_000;

// ponytail: token nằm trong localStorage nên XSS đọc được; chuyển cookie HttpOnly khi có refresh token.
export function loadStoredSession(now = Date.now()): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PersistedSession>) : null;
    if (
      !parsed ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= now
    ) {
      localStorage.removeItem(KEY);
      return null;
    }
    return { accessToken: parsed.accessToken, user: parsed.user ?? null };
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredSession, now = Date.now()): void {
  const persisted: PersistedSession = {
    ...session,
    expiresAt: jwtExpiry(session.accessToken) ?? now + DEFAULT_TTL_MS,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(persisted));
  } catch {
    // Storage bị chặn/đầy: vẫn đăng nhập trong phiên hiện tại, chỉ không nhớ được.
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Không có gì để xoá.
  }
}

/** Trả exp (ms) nếu token là JWT, ngược lại null. */
function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
