import { EnvironmentProviders, Type, inject, isDevMode, makeEnvironmentProviders } from '@angular/core';

import { AUTH_API, AuthApi } from './auth-api';
import { MockAuthApi } from './mock-auth-api';
import { InMemorySecureTokenStore, SECURE_TOKEN_STORE } from './secure-token-store';

export function provideAuth(authApi: Type<AuthApi> = MockAuthApi): EnvironmentProviders {
  return makeEnvironmentProviders([
    authApi,
    {
      provide: AUTH_API,
      useFactory: () => {
        if (authApi === MockAuthApi && !isDevMode()) {
          throw new Error('Configure a production AuthApi before enabling authentication.');
        }
        return inject(authApi);
      },
    },
    { provide: SECURE_TOKEN_STORE, useClass: InMemorySecureTokenStore },
  ]);
}
