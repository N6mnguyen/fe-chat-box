import { z } from 'zod';

// seq là BIGINT trong Postgres: truyền dạng chuỗi số thập phân để không mất chính xác.
export const Seq = z.string().regex(/^(0|[1-9][0-9]{0,18})$/).meta({ id: 'Seq' });
export const Id = z.uuid();
export const Timestamp = z.iso.datetime({ offset: false }); // UTC, server cấp
export const Username = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_][a-z0-9_.]{1,28}[a-z0-9_]$/)
  .refine((s) => !s.includes('..'))
  .meta({ id: 'Username' });
export const Email = z.email().max(320);
export const Password = z.string().min(8).max(128).meta({ id: 'Password' });
export const OtpCode = z.string().regex(/^[0-9]{6}$/);
export const DisplayName = z.string().trim().min(1).max(80);

export const Limit = (max: number, def: number) => z.coerce.number().int().min(1).max(max).default(def);
// Cursor opaque (base64url do server ký/mã hóa); client không tự tạo.
export const Cursor = z.string().max(512).regex(/^[A-Za-z0-9_-]+$/);

export const Page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: Cursor.nullable() });

export const ErrorCode = z
  .enum([
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'TOKEN_EXPIRED',
    'TOKEN_REUSED',
    'INVALID_CREDENTIALS',
    'OTP_REQUIRED',
    'OTP_INVALID',
    'FORBIDDEN',
    'NOT_FOUND',
    'USERNAME_TAKEN',
    'IDEMPOTENCY_CONFLICT',
    'VERSION_CONFLICT',
    'RECALL_WINDOW_EXPIRED',
    'GROUP_NOT_SUPPORTED',
    'DEVICE_LIMIT_REACHED',
    'SYNC_CURSOR_EXPIRED',
    'RATE_LIMITED',
    'SERVER_BUSY',
    'INTERNAL',
  ])
  .meta({ id: 'ErrorCode' });

export const ErrorBody = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
      requestId: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .meta({ id: 'Error' });

export const Accepted = z.object({ status: z.literal('accepted') }).meta({ id: 'Accepted' });
export const Ok = z.object({ ok: z.literal(true) }).meta({ id: 'Ok' });

export type ErrorCode = z.infer<typeof ErrorCode>;
export type ErrorBody = z.infer<typeof ErrorBody>;
