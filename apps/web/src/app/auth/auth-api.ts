import { InjectionToken } from '@angular/core';

export type AuthApiErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USERNAME_TAKEN'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_ATTEMPTS_EXCEEDED'
  | 'TOO_MANY_REQUESTS'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface AuthApiErrorDetails {
  code: AuthApiErrorCode;
  retryAfterSeconds?: number;
  requestId?: string;
}

export class AuthApiError extends Error {
  constructor(readonly details: AuthApiErrorDetails) {
    super(details.code);
    this.name = 'AuthApiError';
  }
}

export type AuthChallengeKind = 'email-verification' | 'device-verification';

export interface AuthChallenge {
  id: string;
  kind: AuthChallengeKind;
  maskedEmail: string;
  expiresAt: number;
  resendAfterSeconds: number;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  deviceToken?: string;
}

export type AuthResult =
  | { kind: 'authenticated'; session: AuthSession }
  | { kind: 'otp-required'; challenge: AuthChallenge };

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface OtpRequest {
  challengeId: string;
  otp: string;
}

export interface VerifyDeviceRequest extends OtpRequest {
  trustDevice: boolean;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export interface PasswordResetRequestResult {
  accepted: true;
}

export interface AuthApi {
  isUsernameAvailable(username: string): Promise<boolean>;
  register(request: RegisterRequest): Promise<AuthChallenge>;
  verifyEmail(request: OtpRequest): Promise<AuthSession>;
  login(request: LoginRequest): Promise<AuthResult>;
  verifyDevice(request: VerifyDeviceRequest): Promise<AuthSession>;
  requestPasswordReset(email: string): Promise<PasswordResetRequestResult>;
  resetPassword(request: ResetPasswordRequest): Promise<void>;
  resendCode(challengeId: string): Promise<AuthChallenge>;
  refreshSession(refreshToken: string): Promise<AuthSession>;
}

export const AUTH_API = new InjectionToken<AuthApi>('AUTH_API');
