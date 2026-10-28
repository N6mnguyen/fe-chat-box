import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PasswordResetFlowService {
  readonly email = signal('');
}
