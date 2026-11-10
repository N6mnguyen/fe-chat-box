import { AuthUser } from './auth-api';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser | null;
}

const KEY = 'vchat.session';
// Khớp TTL refresh token ở BE (REFRESH_TTL_MS). Cookie hết hạn = hết phiên; mỗi lần refresh được ghi lại và gia hạn.
const SESSION_TTL_MS = 14 * 24 * 60 * 60_000;

// ponytail: cookie JS-readable nên XSS vẫn đọc được; HttpOnly cần server set cookie.
function readCookie(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${KEY}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(value: string, expires: Date): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${KEY}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Strict${secure}`;
}

/** Trả phiên đã lưu kể cả khi access token hết hạn: request đầu tiên nhận 401 sẽ tự refresh. */
export function loadStoredSession(): StoredSession | null {
  try {
    const raw = readCookie();
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredSession>) : null;
    if (!parsed || typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') {
      clearStoredSession();
      return null;
    }
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, user: parsed.user ?? null };
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredSession, now = Date.now()): void {
  try {
    writeCookie(JSON.stringify(session), new Date(now + SESSION_TTL_MS));
  } catch {
    // Cookie bị chặn: vẫn đăng nhập trong phiên hiện tại, chỉ không nhớ được.
  }
}

export function clearStoredSession(): void {
  try {
    writeCookie('', new Date(0));
    localStorage.removeItem(KEY); // phiên cũ từ bản lưu bằng localStorage
  } catch {
    // Không có gì để xoá.
  }
}
