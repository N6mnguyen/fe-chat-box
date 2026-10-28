import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from './auth.store';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return auth.status() === 'authenticated'
    ? true
    : router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.status() === 'authenticated' ? inject(Router).createUrlTree(['/']) : true;
};

export const challengeGuard: CanActivateFn = (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const challenge = auth.challenge();
  const requiredKind = route.data['challengeKind'];
  return challenge && challenge.kind === requiredKind
    ? true
    : router.createUrlTree([requiredKind === 'device-verification' ? '/auth/login' : '/auth/register']);
};
