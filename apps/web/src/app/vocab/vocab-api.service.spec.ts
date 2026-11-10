import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthStore } from '../auth/auth.store';
import { VocabApiService } from './vocab-api.service';

describe('VocabApiService', () => {
  it('navigates to login with the current page when access and refresh tokens are rejected', async () => {
    const auth = {
      accessToken: vi.fn().mockReturnValue('expired-access-token'),
      refreshAccessToken: vi.fn().mockRejectedValue(new Error('Refresh token expired')),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: auth },
      ],
    });
    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'url', { configurable: true, value: '/vocab?language=zh' });
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));

    const service = TestBed.inject(VocabApiService);
    await expect(service.overview('zh')).rejects.toThrow('Refresh token expired');

    expect(navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { returnUrl: '/vocab?language=zh' },
    });
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });
});
