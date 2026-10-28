import { Route } from '@angular/router';
import { App } from './app';
import { authGuard } from './auth/auth.guards';

export const appRoutes: Route[] = [
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.routes').then((routes) => routes.AUTH_ROUTES),
  },
  { path: '', component: App, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
