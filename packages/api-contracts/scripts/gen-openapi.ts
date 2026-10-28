// Sinh openapi.yaml từ routes + zod. Chỉ để tài liệu và test hợp đồng; không sinh client.
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { stringify } from 'yaml';
import { routes, rateLimits } from '../src/routes.ts';
import { ErrorBody } from '../src/common.ts';

const ref = (id: string) => `#/components/schemas/${id}`;
// zod ghi schema có id vào `definitions` cục bộ; mọi id đều đã nằm trong components.schemas,
// nên đổi đường dẫn ref sang components và bỏ bản cục bộ.
const toComponents = (js: unknown): unknown =>
  JSON.parse(JSON.stringify(js).replaceAll('"#/definitions/', '"#/components/schemas/'));
const schema = (s: z.ZodType, io: 'input' | 'output') => {
  const id = z.globalRegistry.get(s)?.id;
  if (id) return { $ref: ref(id) };
  const js = z.toJSONSchema(s, { io, target: 'openapi-3.0', unrepresentable: 'any' }) as Record<string, unknown>;
  delete js.$schema;
  delete js.definitions;
  return toComponents(js) as Record<string, unknown>;
};

const reasons: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_REUSED / INVALID_CREDENTIALS',
  403: 'FORBIDDEN (gộp: không phải bạn, bị chặn, sai mật khẩu xác nhận)', 404: 'NOT_FOUND (gộp: không tồn tại hoặc không có quyền)',
  409: 'USERNAME_TAKEN / IDEMPOTENCY_CONFLICT / VERSION_CONFLICT', 410: 'SYNC_CURSOR_EXPIRED',
  422: 'OTP_INVALID / RECALL_WINDOW_EXPIRED / GROUP_NOT_SUPPORTED', 429: 'RATE_LIMITED (+Retry-After)', 503: 'SERVER_BUSY (+Retry-After)',
};

const paths: Record<string, Record<string, unknown>> = {};
for (const rt of routes) {
  const params = [...rt.path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name, in: 'path', required: true, schema: name === 'username' ? { type: 'string' } : { type: 'string', format: 'uuid' },
  }));
  const query = rt.query
    ? Object.entries(rt.query.shape).map(([name, s]) => ({
        name, in: 'query', required: !(s as z.ZodType).safeParse(undefined).success, schema: schema(s as z.ZodType, 'input'),
      }))
    : [];
  const headers = rt.idempotency === 'Idempotency-Key'
    ? [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } }]
    : [];
  const responses: Record<string, unknown> = {
    [rt.status]: rt.response
      ? { description: reasons[rt.status], content: { 'application/json': { schema: schema(rt.response, 'output') } } }
      : { description: reasons[rt.status] },
  };
  for (const code of rt.errors)
    responses[code] = { description: reasons[code], content: { 'application/json': { schema: { $ref: ref('Error') } } } };

  (paths[rt.path] ??= {})[rt.method] = {
    summary: rt.summary,
    security: rt.auth === 'public' ? [] : [{ bearer: [] }],
    'x-auth': rt.auth,
    ...(rt.rateLimit && { 'x-rate-limit': rateLimits[rt.rateLimit] }),
    ...(rt.idempotency && { 'x-idempotency': rt.idempotency }),
    parameters: [...params, ...query, ...headers],
    ...(rt.body && { requestBody: { required: true, content: { 'application/json': { schema: schema(rt.body, 'input') } } } }),
    responses,
  };
}

const components = toComponents(
  z.toJSONSchema(z.globalRegistry, { target: 'openapi-3.0', unrepresentable: 'any', uri: ref }).schemas,
) as Record<string, Record<string, unknown>>;
for (const s of Object.values(components)) { delete s.$schema; delete s.$id; delete s.definitions; }
components.Error ??= schema(ErrorBody, 'output');

const doc = {
  openapi: '3.0.3',
  info: { title: 'vchat API', version: '1.0.0', description: 'Sinh từ @vchat/api-contracts. Không sửa tay.' },
  servers: [{ url: 'http://localhost:3000' }],
  paths,
  components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas: components },
};
writeFileSync(new URL('../openapi.yaml', import.meta.url), stringify(doc, { aliasDuplicateObjects: false }));
console.log(`openapi.yaml: ${routes.length} operations, ${Object.keys(components).length} schemas`);
