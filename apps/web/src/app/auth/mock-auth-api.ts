import { Injectable, signal } from '@angular/core';

import {
  AuthApi,
  AuthApiError,
  AuthChallenge,
  AuthResult,
  AuthSession,
  LoginRequest,
  OtpRequest,
  PasswordResetRequestResult,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyDeviceRequest,
} from './auth-api';

export type MockAuthScenario =
  | 'success'
  | 'invalid-credentials'
  | 'otp-required'
  | 'otp-invalid'
  | 'otp-expired'
  | 'otp-attempts-exceeded'
  | 'username-taken'
  | 'rate-limited'
  | 'service-unavailable'
  | 'network-error'
  | 'unknown-error';

const DEV_OTP = '123456';
const OTP_LIFETIME_MS = 5 * 60_000;
const RETRY_AFTER_SECONDS = 8;
const EXISTING_USERNAMES = new Set(['admin', 'support', 'minhanh']);

@Injectable({ providedIn: 'root' })
export class MockAuthApi implements AuthApi {
  readonly scenario = signal<MockAuthScenario>('success');
  private readonly challenges = new Map<string, AuthChallenge>();
  private sequence = 0;

  setScenario(scenario: MockAuthScenario): void {
    this.scenario.set(scenario);
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    await this.delay();
    this.throwForInfrastructureScenario();
    return this.scenario() !== 'username-taken' && !EXISTING_USERNAMES.has(username.toLowerCase());
  }

  async register(request: RegisterRequest): Promise<AuthChallenge> {
    await this.delay();
    this.throwForInfrastructureScenario();
    if (this.scenario() === 'username-taken' || EXISTING_USERNAMES.has(request.username.toLowerCase())) {
      throw new AuthApiError({ code: 'USERNAME_TAKEN' });
    }

    // Email duplicates deliberately follow the same public path as new addresses.
    return this.createChallenge('email-verification', request.email);
  }

  async verifyEmail(request: OtpRequest): Promise<AuthSession> {
    await this.delay();
    this.throwForInfrastructureScenario();
    this.verifyOtp(request);
    return this.createSession();
  }

  async login(request: LoginRequest): Promise<AuthResult> {
    await this.delay();
    this.throwForInfrastructureScenario();
    if (this.scenario() === 'invalid-credentials') {
      throw new AuthApiError({ code: 'INVALID_CREDENTIALS' });
    }
    if (this.scenario() === 'otp-required') {
      return {
        kind: 'otp-required',
        challenge: this.createChallenge('device-verification', this.emailForIdentifier(request.identifier)),
      };
    }
    return { kind: 'authenticated', session: this.createSession() };
  }

  async verifyDevice(request: VerifyDeviceRequest): Promise<AuthSession> {
    await this.delay();
    this.throwForInfrastructureScenario();
    this.verifyOtp(request);
    const session = this.createSession();
    return request.trustDevice ? { ...session, deviceToken: `mock-device-${this.sequence}` } : session;
  }

  async requestPasswordReset(_email: string): Promise<PasswordResetRequestResult> {
    await this.delay();
    this.throwForInfrastructureScenario();
    void _email;
    return { accepted: true };
  }

  async resetPassword(request: ResetPasswordRequest): Promise<void> {
    await this.delay();
    this.throwForInfrastructureScenario();
    this.verifyOtp({ challengeId: 'password-reset', otp: request.otp }, false);
  }

  async resendCode(challengeId: string): Promise<AuthChallenge> {
    await this.delay();
    this.throwForInfrastructureScenario();
    const previous = this.challenges.get(challengeId);
    if (!previous) {
      throw new AuthApiError({ code: 'OTP_EXPIRED' });
    }
    return this.createChallenge(previous.kind, previous.maskedEmail);
  }

  async refreshSession(_refreshToken: string): Promise<AuthSession> {
    await this.delay();
    this.throwForInfrastructureScenario();
    void _refreshToken;
    return this.createSession();
  }

  private verifyOtp(request: OtpRequest, requireChallenge = true): void {
    if (this.scenario() === 'otp-invalid' || request.otp !== DEV_OTP) {
      throw new AuthApiError({ code: 'OTP_INVALID' });
    }
    if (this.scenario() === 'otp-expired') {
      throw new AuthApiError({ code: 'OTP_EXPIRED' });
    }
    if (this.scenario() === 'otp-attempts-exceeded') {
      throw new AuthApiError({ code: 'OTP_ATTEMPTS_EXCEEDED' });
    }
    const challenge = this.challenges.get(request.challengeId);
    if (requireChallenge && (!challenge || challenge.expiresAt <= Date.now())) {
      throw new AuthApiError({ code: 'OTP_EXPIRED' });
    }
  }

  private createChallenge(kind: AuthChallenge['kind'], email: string): AuthChallenge {
    const id = `mock-challenge-${++this.sequence}`;
    const challenge: AuthChallenge = {
      id,
      kind,
      maskedEmail: email.includes('@') ? this.maskEmail(email) : email,
      expiresAt: Date.now() + OTP_LIFETIME_MS,
      resendAfterSeconds: 45,
    };
    this.challenges.set(id, challenge);
    return challenge;
  }

  private createSession(): AuthSession {
    const id = ++this.sequence;
    return {
      accessToken: `mock-access-${id}`,
      refreshToken: `mock-refresh-${id}`,
    };
  }

  private emailForIdentifier(identifier: string): string {
    return identifier.includes('@') ? this.maskEmail(identifier) : 'u***@example.com';
  }

  private maskEmail(email: string): string {
    const [local = '', domain = ''] = email.trim().split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }

  private throwForInfrastructureScenario(): void {
    switch (this.scenario()) {
      case 'rate-limited':
        throw new AuthApiError({ code: 'TOO_MANY_REQUESTS', retryAfterSeconds: RETRY_AFTER_SECONDS });
      case 'service-unavailable':
        throw new AuthApiError({ code: 'SERVICE_UNAVAILABLE', retryAfterSeconds: RETRY_AFTER_SECONDS });
      case 'network-error':
        throw new AuthApiError({ code: 'NETWORK_ERROR' });
      case 'unknown-error':
        throw new AuthApiError({ code: 'UNKNOWN', requestId: `mock-request-${this.sequence}` });
    }
  }

  private delay(): Promise<void> {
    const milliseconds = 80 + Math.floor(Math.random() * 170);
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
