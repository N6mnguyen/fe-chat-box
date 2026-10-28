import { z } from 'zod';
import { Accepted, Ok } from './common.ts';
import * as A from './auth.ts';
import * as M from './me.ts';
import * as C from './chat.ts';

export type Auth = 'public' | 'token' | 'token+password';
export interface Route {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  auth: Auth;
  summary: string;
  body?: z.ZodType;
  query?: z.ZodObject;
  status: number;
  response?: z.ZodType;
  errors: number[];
  rateLimit?: string;
  idempotency?: 'clientMsgId' | 'Idempotency-Key' | 'natural';
}

const r = (x: Route) => x;
const E = { auth: [400, 401, 429], user: [400, 401, 403, 429] };

export const routes: Route[] = [
  // ---- auth (công khai) ----
  r({ method: 'post', path: '/v1/auth/register', auth: 'public', summary: 'Đăng ký; luôn 202 cùng hình dạng', body: A.RegisterRequest, status: 202, response: A.RegisterResponse, errors: [400, 409, 429, 503], rateLimit: 'register', idempotency: 'natural' }),
  r({ method: 'post', path: '/v1/auth/verify-email', auth: 'public', summary: 'Xác minh OTP đăng ký, cấp token', body: A.VerifyEmailRequest, status: 200, response: A.TokenPair, errors: [400, 422, 429], rateLimit: 'otp-verify' }),
  r({ method: 'post', path: '/v1/auth/resend-otp', auth: 'public', summary: 'Gửi lại OTP; luôn 202', body: A.ResendOtpRequest, status: 202, response: Accepted, errors: [400, 429], rateLimit: 'otp-send' }),
  r({ method: 'post', path: '/v1/auth/login', auth: 'public', summary: 'Đăng nhập; 200 TokenPair (scope full, hoặc restore nếu deleting) hoặc OtpChallenge', body: A.LoginRequest, status: 200, response: A.LoginResponse, errors: [400, 401, 403, 429, 503], rateLimit: 'login' }),
  r({ method: 'post', path: '/v1/auth/login/verify-device', auth: 'public', summary: 'Nhập OTP thiết bị mới', body: A.VerifyDeviceRequest, status: 200, response: A.TokenPair, errors: [400, 403, 422, 429], rateLimit: 'otp-verify' }),
  r({ method: 'post', path: '/v1/auth/refresh', auth: 'public', summary: 'Xoay vòng refresh; reuse thu hồi family', body: A.RefreshRequest, status: 200, response: A.TokenPair, errors: [400, 401, 429], rateLimit: 'refresh' }),
  r({ method: 'post', path: '/v1/auth/logout', auth: 'token', summary: 'Đăng xuất thiết bị hiện tại', status: 204, errors: [401], idempotency: 'natural' }),
  r({ method: 'post', path: '/v1/auth/password/forgot', auth: 'public', summary: 'Gửi OTP reset; luôn 202', body: A.ForgotPasswordRequest, status: 202, response: Accepted, errors: [400, 429], rateLimit: 'otp-send' }),
  r({ method: 'post', path: '/v1/auth/password/reset', auth: 'public', summary: 'Đặt lại mật khẩu, thu hồi mọi token', body: A.ResetPasswordRequest, status: 204, errors: [400, 422, 429, 503], rateLimit: 'otp-verify' }),
  r({ method: 'post', path: '/v1/auth/recover', auth: 'public', summary: 'Khôi phục bằng mã khôi phục (sau MVP đợt đầu)', body: A.RecoverRequest, status: 200, response: A.TokenPair, errors: [400, 401, 429, 503], rateLimit: 'login' }),

  // ---- me ----
  r({ method: 'get', path: '/v1/me', auth: 'token', summary: 'Hồ sơ + settings', status: 200, response: M.Me, errors: [401] }),
  r({ method: 'patch', path: '/v1/me/profile', auth: 'token', summary: 'Sửa tên hiển thị (optimistic version)', body: M.UpdateProfileRequest, status: 200, response: M.Me, errors: [400, 401, 409] }),
  r({ method: 'patch', path: '/v1/me/settings', auth: 'token', summary: 'Settings + quyền riêng tư (optimistic version)', body: M.UpdateSettingsRequest, status: 200, response: M.Settings, errors: [400, 401, 403, 409, 429, 503] }),
  r({ method: 'post', path: '/v1/me/email/change', auth: 'token+password', summary: 'OTP tới email mới; luôn 202', body: M.ChangeEmailRequest, status: 202, response: Accepted, errors: [400, 401, 403, 429, 503], rateLimit: 'otp-send' }),
  r({ method: 'post', path: '/v1/me/email/confirm', auth: 'token', summary: 'Xác nhận email mới; báo email cũ', body: M.ConfirmEmailRequest, status: 204, errors: [400, 401, 422, 429], rateLimit: 'otp-verify' }),
  r({ method: 'post', path: '/v1/me/password', auth: 'token+password', summary: 'Đổi mật khẩu; đăng xuất thiết bị khác', body: M.ChangePasswordRequest, status: 204, errors: [400, 401, 403, 429, 503], rateLimit: 'login' }),
  r({ method: 'get', path: '/v1/me/devices', auth: 'token', summary: 'Danh sách thiết bị', status: 200, response: z.object({ items: z.array(M.Device) }).meta({ id: 'DeviceList' }), errors: [401] }),
  r({ method: 'delete', path: '/v1/me/devices/{deviceId}', auth: 'token', summary: 'Đăng xuất từ xa; thu hồi refresh + deviceToken, ngắt WS', status: 204, errors: [401, 404], idempotency: 'natural' }),
  r({ method: 'post', path: '/v1/me/messages/purge', auth: 'token+password', summary: '⚖ Xóa toàn bộ tin tôi đã gửi (job)', body: M.PasswordConfirm, status: 202, response: M.JobAccepted, errors: [400, 401, 403, 429, 503], idempotency: 'Idempotency-Key' }),
  r({ method: 'get', path: '/v1/me/messages/purge/{jobId}', auth: 'token', summary: 'Trạng thái purge', status: 200, response: M.JobAccepted, errors: [401, 404] }),
  r({ method: 'delete', path: '/v1/me', auth: 'token+password', summary: 'Xóa tài khoản (ân hạn 30 ngày)', body: M.PasswordConfirm, status: 202, response: M.Me, errors: [400, 401, 403, 429, 503], idempotency: 'natural' }),
  r({ method: 'post', path: '/v1/me/restore', auth: 'token', summary: 'Hủy xóa trong ân hạn; nhận token scope restore; trả TokenPair scope full mới', status: 200, response: A.TokenPair, errors: [401, 409], idempotency: 'natural' }),
  r({ method: 'post', path: '/v1/me/recovery-codes', auth: 'token+password', summary: 'Tạo bộ 10 mã mới (vô hiệu bộ cũ); chỉ hiện một lần; KHÔNG idempotent', body: M.PasswordConfirm, status: 201, response: M.RecoveryCodes, errors: [400, 401, 403, 429, 503], rateLimit: 'recovery-codes' }),

  // ---- users / friends / blocks ----
  r({ method: 'get', path: '/v1/users/by-username/{username}', auth: 'token', summary: 'Khớp chính xác; không tồn tại/chặn/không cho tìm -> 404', status: 200, response: C.PublicUser, errors: [400, 401, 404, 429], rateLimit: 'user-search' }),
  r({ method: 'post', path: '/v1/friend-requests', auth: 'token', summary: 'Gửi lời mời; luôn 202 (kể cả bị chặn)', body: C.FriendRequestCreate, status: 202, response: Accepted, errors: [400, 401, 429], rateLimit: 'friend-request', idempotency: 'natural' }),
  r({ method: 'get', path: '/v1/friend-requests/incoming', auth: 'token', summary: 'Lời mời đến (pending)', query: C.PaginationQuery, status: 200, response: C.FriendRequestPage, errors: [400, 401] }),
  r({ method: 'get', path: '/v1/friend-requests/outgoing', auth: 'token', summary: 'Lời mời đi (pending, chỉ bản thật)', query: C.PaginationQuery, status: 200, response: C.FriendRequestPage, errors: [400, 401] }),
  r({ method: 'post', path: '/v1/friend-requests/{requestId}/accept', auth: 'token', summary: 'Chấp nhận; tạo friendship + conversation', status: 200, response: C.Conversation, errors: [401, 404], idempotency: 'natural' }),
  r({ method: 'post', path: '/v1/friend-requests/{requestId}/decline', auth: 'token', summary: 'Từ chối (người nhận)', status: 204, errors: [401, 404], idempotency: 'natural' }),
  r({ method: 'post', path: '/v1/friend-requests/{requestId}/cancel', auth: 'token', summary: 'Hủy (người gửi)', status: 204, errors: [401, 404], idempotency: 'natural' }),
  r({ method: 'get', path: '/v1/friends', auth: 'token', summary: 'Danh sách bạn', query: C.PaginationQuery, status: 200, response: C.FriendPage, errors: [400, 401] }),
  r({ method: 'delete', path: '/v1/friends/{userId}', auth: 'token', summary: 'Hủy kết bạn', status: 204, errors: [401], idempotency: 'natural' }),
  r({ method: 'get', path: '/v1/blocks', auth: 'token', summary: 'Danh sách người tôi chặn', query: C.PaginationQuery, status: 200, response: C.BlockPage, errors: [400, 401] }),
  r({ method: 'post', path: '/v1/blocks', auth: 'token', summary: 'Chặn; hủy bạn + lời mời chờ', body: C.BlockCreate, status: 204, errors: [400, 401, 429], rateLimit: 'block', idempotency: 'natural' }),
  r({ method: 'delete', path: '/v1/blocks/{userId}', auth: 'token', summary: 'Bỏ chặn; không khôi phục bạn', status: 204, errors: [401], idempotency: 'natural' }),

  // ---- conversations / messages / receipts ----
  r({ method: 'get', path: '/v1/conversations', auth: 'token', summary: 'Danh sách hội thoại', query: C.PaginationQuery, status: 200, response: C.ConversationPage, errors: [400, 401] }),
  r({ method: 'post', path: '/v1/conversations', auth: 'token', summary: 'Mở direct với bạn (get-or-create); group -> 422', body: C.ConversationCreate, status: 200, response: C.Conversation, errors: [400, 401, 403, 422], idempotency: 'natural' }),
  r({ method: 'get', path: '/v1/conversations/{conversationId}', auth: 'token', summary: 'Chi tiết hội thoại', status: 200, response: C.Conversation, errors: [401, 404] }),
  r({ method: 'patch', path: '/v1/conversations/{conversationId}', auth: 'token', summary: 'Ghim / tắt thông báo (của tôi)', body: C.ConversationPatch, status: 200, response: C.Conversation, errors: [400, 401, 404], idempotency: 'natural' }),
  r({ method: 'get', path: '/v1/conversations/{conversationId}/messages', auth: 'token', summary: 'Lịch sử, mới -> cũ, cursor theo createdSeq', query: C.MessageHistoryQuery, status: 200, response: C.MessagePage, errors: [400, 401, 404] }),
  r({ method: 'post', path: '/v1/conversations/{conversationId}/messages', auth: 'token', summary: 'Gửi tin (REST fallback của message.send)', body: C.SendMessageRequest, status: 201, response: C.SendMessageResponse, errors: [400, 401, 403, 404, 409, 429], rateLimit: 'message-send', idempotency: 'clientMsgId' }),
  r({ method: 'post', path: '/v1/conversations/{conversationId}/messages/{messageId}/recall', auth: 'token', summary: 'Thu hồi (người gửi, ≤24h)', status: 200, response: C.Message, errors: [401, 403, 404, 422], idempotency: 'natural' }),
  r({ method: 'post', path: '/v1/conversations/{conversationId}/messages/{messageId}/hide', auth: 'token', summary: 'Xóa phía tôi', status: 204, errors: [401, 404], idempotency: 'natural' }),
  r({ method: 'get', path: '/v1/conversations/{conversationId}/changes', auth: 'token', summary: 'Change log sau afterSeq; 410 nếu quá cũ', query: C.ChangesQuery, status: 200, response: C.ChangePage, errors: [400, 401, 404, 410] }),
  r({ method: 'put', path: '/v1/conversations/{conversationId}/receipts', auth: 'token', summary: 'Cập nhật deliveredSeq/readSeq (chỉ tăng)', body: C.ReceiptUpdate, status: 200, response: C.Receipt, errors: [400, 401, 404], rateLimit: 'receipt', idempotency: 'natural' }),

  // ---- sync / reports / ops ----
  r({ method: 'get', path: '/v1/sync', auth: 'token', summary: 'Delta user_changes; không cursor = lần đầu', query: C.SyncQuery, status: 200, response: C.SyncPage, errors: [400, 401, 410] }),
  r({ method: 'post', path: '/v1/reports', auth: 'token', summary: '⚖ Báo cáo người/tin; lưu bản chụp', body: C.ReportCreate, status: 202, response: C.ReportAccepted, errors: [400, 401, 404, 429], rateLimit: 'report', idempotency: 'Idempotency-Key' }),
  r({ method: 'get', path: '/v1/health/live', auth: 'public', summary: 'Tiến trình sống', status: 200, response: Ok, errors: [] }),
  r({ method: 'get', path: '/v1/health/ready', auth: 'public', summary: 'DB kết nối được + migration đúng phiên bản', status: 200, response: Ok, errors: [503] }),
];

// Ngưỡng khởi điểm, cấu hình qua env. Kiểm TRƯỚC Argon2.
export const rateLimits: Record<string, string> = {
  login: 'IP 20/phút & 200/giờ; identifier 10 lần sai/15 phút -> khóa tạm 1→5→15→60 phút; IP+identifier 5 sai/15 phút',
  register: 'IP 5/giờ, 20/ngày',
  'otp-send': 'email 5/giờ, 10/ngày, cách ≥60s; IP 20/ngày; thiết bị 10/ngày; trần toàn hệ thống/ngày',
  'otp-verify': '5 lần sai/mã; IP 30/giờ',
  refresh: 'thiết bị 30/phút',
  'user-search': 'user 60/giờ; IP 120/giờ',
  'friend-request': 'user 30/ngày, tính cả lời mời suppressed; tối đa 100 lời mời đang chờ (gồm suppressed)',
  block: 'user 60/giờ',
  'message-send': 'user 30/10s, 1.000/giờ; dùng chung giới hạn với WS message.send',
  receipt: 'user 120/phút',
  report: 'user 20/ngày',
  'recovery-codes': 'user 5/ngày',
};
