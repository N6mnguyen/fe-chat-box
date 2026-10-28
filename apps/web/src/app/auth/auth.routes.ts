import { Routes } from '@angular/router';

import { AuthLayoutComponent } from './auth-layout.component';
import { challengeGuard, guestGuard } from './auth.guards';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    component: AuthLayoutComponent,
    canActivate: [guestGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        loadComponent: () => import('./login-page.component').then((module) => module.LoginPageComponent),
      },
      {
        path: 'register',
        loadComponent: () => import('./register-page.component').then((module) => module.RegisterPageComponent),
      },
      {
        path: 'verify',
        canActivate: [challengeGuard],
        data: { challengeKind: 'email-verification' },
        loadComponent: () => import('./verify-page.component').then((module) => module.VerifyPageComponent),
      },
      {
        path: 'verify-device',
        canActivate: [challengeGuard],
        data: { challengeKind: 'device-verification' },
        loadComponent: () => import('./verify-page.component').then((module) => module.VerifyPageComponent),
      },
      {
        path: 'forgot',
        loadComponent: () => import('./forgot-page.component').then((module) => module.ForgotPageComponent),
      },
      {
        path: 'reset',
        loadComponent: () => import('./reset-page.component').then((module) => module.ResetPageComponent),
      },
      { path: '**', redirectTo: 'login' },
    ],
  },
];
