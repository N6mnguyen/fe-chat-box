import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { provideNzI18n, vi_VN } from 'ng-zorro-antd/i18n';
import { NzModalService } from 'ng-zorro-antd/modal';
import {
  CheckCircleFill, CloseCircleFill, ExclamationCircleFill,
  ExclamationCircleOutline, InfoCircleFill, LoadingOutline, QuestionCircleOutline,
} from '@ant-design/icons-angular/icons';

import { translocoProviders } from './transloco';
import { appRoutes } from './app.routes';
import { GoogleAuthApi } from './auth/google-auth-api';
import { provideAuth } from './auth/auth.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(appRoutes),
    provideAuth(GoogleAuthApi),
    provideNzI18n(vi_VN),
    provideNzIcons([
      CheckCircleFill, CloseCircleFill, ExclamationCircleFill,
      ExclamationCircleOutline, InfoCircleFill, LoadingOutline, QuestionCircleOutline,
    ]),
    NzModalService,
    translocoProviders,
  ],
};
