import { Route } from '@angular/router';
import { App } from './app';
import { authGuard } from './auth/auth.guards';

export const appRoutes: Route[] = [
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.routes').then((routes) => routes.AUTH_ROUTES),
  },
  {
    path: 'vocab/listen-fill',
    canActivate: [authGuard],
    loadComponent: () => import('./vocab/listen-fill-study.component').then((component) => component.ListenFillStudyComponent),
  },
  {
    path: 'vocab/fill-in',
    canActivate: [authGuard],
    loadComponent: () => import('./vocab/fill-in-study.component').then((component) => component.FillInStudyComponent),
  },
  {
    path: 'vocab/study',
    canActivate: [authGuard],
    loadComponent: () => import('./vocab/flashcard-study.component').then((component) => component.FlashcardStudyComponent),
  },
  {
    path: 'vocab',
    canActivate: [authGuard],
    loadComponent: () => import('./vocab/vocab-page.component').then((component) => component.VocabPageComponent),
  },
  { path: '', component: App, canActivate: [authGuard], pathMatch: 'full' },
  { path: '**', redirectTo: '' },
];
