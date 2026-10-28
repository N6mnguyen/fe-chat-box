import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import {
  routes, rateLimits, LoginResponse, SendMessageRequest, Message, ConversationCreate,
  ErrorBody, RegisterRequest, RegisterResponse, ServerEvents, ClientEvents, Seq, Username,
  TokenPair, FriendRequest,
} from '../src/index.ts';

// Tên trường bí mật (so khớp cả tên); `newDeviceOtp` là cờ cài đặt, không phải bí mật.
const NEVER_IN_RESPONSE = /^(password|.*Password|.*Hash|hash|pepper.*|otp|code|otpCode)$/;

test('mọi route có tiền tố /v1, status hợp lệ, rateLimit tồn tại', () => {
  const seen = new Set<string>();
  for (const r of routes) {
    assert.match(r.path, /^\/v1\//);
    const key = `${r.method} ${r.path}`;
    assert.ok(!seen.has(key), `trùng ${key}`);
    seen.add(key);
    if (r.rateLimit) assert.ok(rateLimits[r.rateLimit], `thiếu ngưỡng ${r.rateLimit}`);
  }
});

test('auth nhạy cảm có rate limit; endpoint băm mật khẩu có 503', () => {
  for (const p of ['/v1/auth/login', '/v1/auth/register', '/v1/auth/password/forgot', '/v1/auth/resend-otp']) {
    const r = routes.find((x) => x.path === p)!;
    assert.ok(r.rateLimit, p);
    assert.ok(r.errors.includes(429), p);
  }
  for (const r of routes.filter((x) => x.auth === 'token+password' || x.path.match(/login$|register$|reset$/)))
    assert.ok(r.errors.includes(503), `${r.path} cần 503 khi hết slot Argon2`);
});

test('body không có userId/senderId (luôn lấy từ token)', () => {
  for (const r of routes) {
    if (!r.body) continue;
    const shape = JSON.stringify(Object.keys((r.body as any).shape ?? {}));
    assert.ok(!/userId|senderId|ownerId/.test(shape), `${r.path} nhận id người dùng từ body`);
  }
});

test('response không chứa trường bí mật (trừ token phát cho chính phiên)', () => {
  const doc = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));
  for (const [name, s] of Object.entries<any>(doc.components.schemas)) {
    if (/Request|Confirm|Create|Patch|Update/.test(name)) continue;
    for (const k of Object.keys(s.properties ?? {})) {
      if (['TokenPair', 'RecoveryCodes'].includes(name)) continue;
      assert.ok(!NEVER_IN_RESPONSE.test(k), `${name}.${k}`);
    }
  }
});

test('mã lỗi gộp: login sai chỉ có INVALID_CREDENTIALS; không có mã riêng cho "bị chặn"', () => {
  const codes = ErrorBody.shape.error.shape.code.options;
  assert.ok(codes.includes('INVALID_CREDENTIALS'));
  for (const leak of ['USER_NOT_FOUND', 'BLOCKED', 'EMAIL_TAKEN', 'NOT_FRIENDS', 'ACCOUNT_PENDING'])
    assert.ok(!codes.includes(leak as any), leak);
});

test('login response là TokenPair hoặc OTP challenge', () => {
  assert.ok(LoginResponse.safeParse({ challenge: 'device_otp', challengeId: crypto.randomUUID(), expiresAt: '2026-10-28T00:00:00Z' }).success);
});

test('message: attachments chỉ [] trong v1; body giới hạn', () => {
  const base = { clientMsgId: crypto.randomUUID(), body: 'hi' };
  assert.deepEqual(SendMessageRequest.parse(base).attachments, []);
  assert.ok(!SendMessageRequest.safeParse({ ...base, attachments: [{ id: 'x' }] }).success);
  assert.ok(!SendMessageRequest.safeParse({ ...base, body: '' }).success);
  // senderId từ client bị strip: parse phải thành công VÀ không còn key (không chỉ "không lỗi").
  const spoof = SendMessageRequest.safeParse({ ...base, senderId: crypto.randomUUID() });
  assert.ok(spoof.success);
  assert.ok(!Object.hasOwn(spoof.data, 'senderId'));
  assert.equal(SendMessageRequest.parse(base).replyToId, null);
});

test('message: trích dẫn reply là preview đọc lúc truy vấn; không khả dụng thì body null', () => {
  const now = '2026-10-28T00:00:00Z';
  const msg = {
    id: crypto.randomUUID(), conversationId: crypto.randomUUID(), senderId: crypto.randomUUID(),
    clientMsgId: crypto.randomUUID(), createdSeq: '2', latestSeq: '2', body: 'ok', deleted: false,
    attachments: [], createdAt: now, updatedAt: now,
    replyTo: { id: crypto.randomUUID(), senderId: crypto.randomUUID(), available: false, body: null },
  };
  assert.ok(Message.safeParse(msg).success);
  assert.ok(!Message.safeParse({ ...msg, replyTo: { ...msg.replyTo, body: 'x'.repeat(201) } }).success);
});

test('token phạm vi hẹp cho tài khoản deleting; registrationId không lộ email', () => {
  assert.ok(TokenPair.shape.scope.options.includes('restore'));
  // /me/restore và GET /me là hai route duy nhất dùng được với scope 'restore' (guard Bước 7).
  assert.ok(routes.some((r) => r.path === '/v1/me/restore'));
  assert.deepEqual(Object.keys(RegisterResponse.shape), ['registrationId']);
});

test('lời mời: response không có trường để phân biệt suppressed', () => {
  assert.ok(!('suppressed' in FriendRequest.shape));
  assert.deepEqual(FriendRequest.shape.status.def.values, ['pending']);
});

test('purge phát một sự kiện tổng theo hội thoại', () => {
  assert.ok('messages.purged' in ServerEvents);
});

test('seq là chuỗi số, không phải number', () => {
  assert.ok(Seq.safeParse('9007199254740993').success);
  assert.ok(!Seq.safeParse(5).success);
  assert.ok(!Seq.safeParse('-1').success);
  assert.ok(!Seq.safeParse('01').success);
});

test('username khớp CHECK của schema.sql', () => {
  for (const ok of ['abc', 'a_b.c', 'x1_']) assert.ok(Username.safeParse(ok).success, ok);
  for (const bad of ['ab', '.abc', 'abc.', 'a..b', 'ABC', 'a-b', 'a'.repeat(31)]) assert.ok(!Username.safeParse(bad).success, bad);
});

test('tạo group được parse nhưng route trả 422 GROUP_NOT_SUPPORTED', () => {
  assert.ok(ConversationCreate.safeParse({ type: 'group' }).success);
  assert.ok(routes.find((r) => r.method === 'post' && r.path === '/v1/conversations')!.errors.includes(422));
});

test('register request không nhận trường thừa ảnh hưởng quyền', () => {
  const r = RegisterRequest.safeParse({ username: 'abc', email: 'a@b.co', password: '12345678', deviceName: 'pc', status: 'active' });
  assert.ok(r.success && !('status' in r.data));
});

test('WS: có đủ sự kiện bắt buộc', () => {
  for (const e of ['message.new', 'message.recalled', 'message.hidden', 'receipt.updated', 'friend.request', 'friend.accepted', 'presence', 'typing', 'session.revoked', 'sync.hint'])
    assert.ok(e in ServerEvents, e);
  for (const e of ['message.send', 'typing', 'presence.ping', 'receipt.update']) assert.ok(e in ClientEvents, e);
});

test('openapi.yaml đồng bộ với routes', () => {
  const doc = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));
  const ops = Object.values<any>(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0);
  assert.equal(ops, routes.length, 'chạy lại npm run openapi');
  const raw = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
  for (const [, id] of raw.matchAll(/\$ref: "#\/components\/schemas\/(\w+)"/g))
    assert.ok(doc.components.schemas[id], `$ref hỏng: ${id}`);
  assert.ok(!raw.includes('#/definitions/'), 'còn $ref #/definitions');
});
