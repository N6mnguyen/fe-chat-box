import { Injectable } from '@angular/core';

import { AuthApiError, AuthSession, AuthUser } from './auth-api';
import { MockAuthApi } from './mock-auth-api';

// Client ID là public. Client secret KHÔNG dùng ở đây và không bao giờ đưa vào frontend.
export const GOOGLE_CLIENT_ID = '774582659488-67b88dnq9amvq4aer3revh814ogh1a2e.apps.googleusercontent.com';
// ponytail: cứng localhost; chuyển sang cấu hình theo môi trường khi deploy.
const API_BASE_URL = 'http://localhost:3000';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface ExchangeBody {
  accessToken?: string;
  user?: AuthUser;
}

interface GoogleTokenClient {
  requestAccessToken(): void;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback: () => void;
  }): GoogleTokenClient;
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } };
  }
}

// ponytail: kế thừa mock cho các luồng email/OTP (UI không còn dùng). Tách riêng khi xoá các trang đó.
@Injectable({ providedIn: 'root' })
export class GoogleAuthApi extends MockAuthApi {
  private script?: Promise<void>;

  constructor() {
    super();
    // Nạp sớm để popup mở ngay trong lúc click, tránh bị chặn.
    this.script = this.loadScript().catch(() => undefined);
  }

  override async loginWithGoogle(): Promise<AuthSession> {
    await this.script;
    const oauth2 = window.google?.accounts.oauth2;
    if (!oauth2) {
      throw new AuthApiError({ code: 'NETWORK_ERROR' });
    }
    const googleToken = await new Promise<string>((resolve, reject) => {
      oauth2
        .initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'openid email profile',
          callback: (response) =>
            response.access_token
              ? resolve(response.access_token)
              : reject(new AuthApiError({ code: 'INVALID_CREDENTIALS' })),
          error_callback: () => reject(new AuthApiError({ code: 'INVALID_CREDENTIALS' })),
        })
        .requestAccessToken();
    });
    const { accessToken, user } = await this.exchange(googleToken);
    return { accessToken, user, refreshToken: '' };
  }

  private async exchange(googleToken: string): Promise<{ accessToken: string; user?: AuthUser }> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: googleToken }),
      });
    } catch {
      throw new AuthApiError({ code: 'NETWORK_ERROR' });
    }
    if (response.status === 401) {
      throw new AuthApiError({ code: 'INVALID_CREDENTIALS' });
    }
    if (!response.ok) {
      throw new AuthApiError({ code: 'SERVICE_UNAVAILABLE' });
    }
    // Chấp nhận cả { accessToken, user } lẫn { success, data: { id, accessToken } }.
    const body = (await response.json()) as { data?: ExchangeBody } & ExchangeBody;
    const payload = body.data ?? body;
    if (typeof payload.accessToken !== 'string' || !payload.accessToken) {
      throw new AuthApiError({ code: 'UNKNOWN' });
    }
    return {
      accessToken: payload.accessToken,
      user: payload.user ?? (await this.googleProfile(googleToken)),
    };
  }

  /** Backend không trả user thì lấy tên/ảnh trực tiếp từ Google; lỗi thì vẫn đăng nhập, chỉ thiếu tên. */
  private async googleProfile(googleToken: string): Promise<AuthUser | undefined> {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${googleToken}` },
      });
      if (!response.ok) {
        return undefined;
      }
      const info = (await response.json()) as { name?: string; email?: string; picture?: string };
      const name = info.name || info.email;
      return name ? { name, email: info.email, picture: info.picture } : undefined;
    } catch {
      return undefined;
    }
  }

  private loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = GIS_SRC;
      element.async = true;
      element.onload = () => resolve();
      element.onerror = () => reject(new Error('gsi'));
      document.head.appendChild(element);
    });
  }
}
