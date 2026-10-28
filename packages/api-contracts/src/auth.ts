import { z } from 'zod';
import { Email, Id, OtpCode, Password, Timestamp, Username } from './common.ts';

const DeviceName = z.string().trim().min(1).max(120);
// Bí mật chỉ đi trong request/response của chính phiên đó; không bao giờ log.
const Secret = z.string().min(32).max(512);

export const RegisterRequest = z
  .object({ username: Username, email: Email, password: Password, deviceName: DeviceName })
  .meta({ id: 'RegisterRequest' });
// Luôn 202 cùng hình dạng. registrationId luôn ngẫu nhiên; email đã có chủ: không lưu gì,
// verify/resend với id không tồn tại xử lý như id hết hạn.
export const RegisterResponse = z.object({ registrationId: Id }).meta({ id: 'RegisterResponse' });

export const VerifyEmailRequest = z
  .object({ registrationId: Id, code: OtpCode })
  .meta({ id: 'VerifyEmailRequest' });

export const ResendOtpRequest = z
  .discriminatedUnion('purpose', [
    z.object({ purpose: z.literal('register'), registrationId: Id }),
    z.object({ purpose: z.literal('device'), challengeId: Id }),
  ])
  .meta({ id: 'ResendOtpRequest' });

export const LoginRequest = z
  .object({
    identifier: z.string().trim().min(3).max(320), // có '@' -> email, ngược lại username
    password: Password,
    deviceName: DeviceName,
    deviceToken: Secret.optional(),
  })
  .meta({ id: 'LoginRequest' });

export const TokenPair = z
  .object({
    // 'full': mọi API. 'restore': tài khoản đang deleting, chỉ gọi được GET /v1/me và POST /v1/me/restore;
    // không có WS, không refresh ra 'full' trước khi restore.
    scope: z.enum(['full', 'restore']),
    accessToken: z.string(),
    accessExpiresAt: Timestamp,
    refreshToken: Secret,
    refreshExpiresAt: Timestamp,
    deviceId: Id,
    deviceToken: Secret.optional(), // chỉ có khi vừa cấp mới
  })
  .meta({ id: 'TokenPair' });

export const OtpChallenge = z
  .object({ challenge: z.literal('device_otp'), challengeId: Id, expiresAt: Timestamp })
  .meta({ id: 'OtpChallenge' });

export const LoginResponse = z.union([TokenPair, OtpChallenge]).meta({ id: 'LoginResponse' });

export const VerifyDeviceRequest = z
  .object({ challengeId: Id, code: OtpCode })
  .meta({ id: 'VerifyDeviceRequest' });

export const RefreshRequest = z.object({ refreshToken: Secret }).meta({ id: 'RefreshRequest' });

export const ForgotPasswordRequest = z.object({ email: Email }).meta({ id: 'ForgotPasswordRequest' });
export const ResetPasswordRequest = z
  .object({ email: Email, code: OtpCode, newPassword: Password })
  .meta({ id: 'ResetPasswordRequest' });

export const RecoverRequest = z
  .object({ identifier: z.string().trim().min(3).max(320), recoveryCode: z.string().min(8).max(64), newPassword: Password })
  .meta({ id: 'RecoverRequest' });

export type RegisterRequest = z.infer<typeof RegisterRequest>;
export type LoginRequest = z.infer<typeof LoginRequest>;
export type LoginResponse = z.infer<typeof LoginResponse>;
export type TokenPair = z.infer<typeof TokenPair>;
export type OtpChallenge = z.infer<typeof OtpChallenge>;
