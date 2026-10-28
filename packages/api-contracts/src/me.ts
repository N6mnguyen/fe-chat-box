import { z } from 'zod';
import { DisplayName, Email, Id, OtpCode, Password, Timestamp, Username } from './common.ts';

export const Privacy = z
  .object({
    // ai tìm được tôi theo username / ai gửi lời mời được
    discoverable: z.enum(['everyone', 'nobody']),
    // "đã xem" đối xứng: tắt thì không gửi và cũng không nhận readSeq của người khác
    readReceipts: z.boolean(),
    // ẩn online + đang gõ với mọi bạn bè; không có "hoạt động lần cuối"
    hideOnline: z.boolean(),
  })
  .meta({ id: 'Privacy' });

export const Settings = z
  .object({
    newDeviceOtp: z.boolean(),
    locale: z.enum(['vi', 'en']),
    notificationsEnabled: z.boolean(),
    privacy: Privacy,
    version: z.number().int().positive(),
  })
  .meta({ id: 'Settings' });

export const Me = z
  .object({
    id: Id,
    username: Username,
    displayName: DisplayName.nullable(),
    email: Email,
    status: z.enum(['active', 'deleting']),
    deletionDueAt: Timestamp.nullable(),
    profileVersion: z.number().int().positive(),
    settings: Settings,
  })
  .meta({ id: 'Me' });

export const UpdateProfileRequest = z
  .object({ displayName: DisplayName.nullable(), expectedVersion: z.number().int().positive() })
  .meta({ id: 'UpdateProfileRequest' });

export const UpdateSettingsRequest = z
  .object({
    newDeviceOtp: z.boolean().optional(),
    locale: z.enum(['vi', 'en']).optional(),
    notificationsEnabled: z.boolean().optional(),
    privacy: Privacy.partial().optional(),
    expectedVersion: z.number().int().positive(),
    // tắt newDeviceOtp cần nhập lại mật khẩu
    currentPassword: Password.optional(),
  })
  .meta({ id: 'UpdateSettingsRequest' });

export const ChangeEmailRequest = z.object({ newEmail: Email, password: Password }).meta({ id: 'ChangeEmailRequest' });
export const ConfirmEmailRequest = z.object({ code: OtpCode }).meta({ id: 'ConfirmEmailRequest' });
export const ChangePasswordRequest = z
  .object({ currentPassword: Password, newPassword: Password })
  .meta({ id: 'ChangePasswordRequest' });
export const PasswordConfirm = z.object({ password: Password }).meta({ id: 'PasswordConfirm' });

export const Device = z
  .object({ id: Id, name: z.string(), current: z.boolean(), lastSeenAt: Timestamp, createdAt: Timestamp })
  .meta({ id: 'Device' });

export const JobAccepted = z
  .object({ jobId: Id, status: z.enum(['queued', 'running', 'done', 'failed']) })
  .meta({ id: 'JobAccepted' });

export const RecoveryCodes = z
  .object({ codes: z.array(z.string()).length(10), createdAt: Timestamp })
  .meta({ id: 'RecoveryCodes' });

export type Me = z.infer<typeof Me>;
export type Settings = z.infer<typeof Settings>;
export type Device = z.infer<typeof Device>;
