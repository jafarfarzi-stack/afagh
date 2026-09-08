import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeClientIp, trustedClientIp, sessionTransport } from '../src/lib/proxy-trust';
const secret = 'test-only-proxy-secret-'.repeat(3);
const config = { enabled: true, secret };
const headers = (extra: Record<string, string> = {}) => new Headers({
  'x-afagh-proxy-token': secret, 'x-afagh-client-ip': '192.0.2.9', ...extra,
});
test('public forwarded headers alone never establish client identity', () => {
  const h = new Headers({ 'x-forwarded-for': '192.0.2.1', 'x-real-ip': '192.0.2.1', 'host': 'trusted.example' });
  assert.equal(trustedClientIp(h, config), null);
  assert.equal(trustedClientIp(headers(), { ...config, enabled: false }), null);
  assert.equal(trustedClientIp(headers(), { ...config, secret: '' }), null);
  assert.equal(trustedClientIp(headers(), { ...config, secret: 'short' }), null);
});
test('authenticated single IP accepted, forged token/list/port rejected', () => {
  assert.equal(trustedClientIp(headers({ 'x-forwarded-for': '203.0.113.4' }), config), '192.0.2.9');
  for (const token of ['', 'fake', 'x'.repeat(secret.length)]) assert.equal(trustedClientIp(headers({ 'x-afagh-proxy-token': token }), config), null);
  for (const ip of ['192.0.2.1, 192.0.2.2', '192.0.2.1:80', 'localhost', 'unknown', '[::1]', 'fe80::1%eth0', '999.0.0.1']) assert.equal(trustedClientIp(headers({ 'x-afagh-client-ip': ip }), config), null);
});
test('IPv6 spelling and IPv4 mapped addresses have one normalized identity', () => {
  assert.equal(normalizeClientIp('2001:0DB8:0000:0000:0000:0000:0000:0001'), '2001:db8::1');
  assert.equal(normalizeClientIp('::ffff:192.0.2.9'), '192.0.2.9');
  assert.equal(normalizeClientIp('::ffff:c000:0209'), '192.0.2.9');
});
test('cookie transport is driven by configured public URL, with secure production default', () => {
  assert.equal(sessionTransport({ NODE_ENV: 'production' }).secure, true);
  assert.equal(sessionTransport({ NODE_ENV: 'production', AFAGH_PUBLIC_BASE_URL: 'bad' }).secure, true);
  assert.equal(sessionTransport({ AFAGH_PUBLIC_BASE_URL: 'https://example.com' }).secure, true);
  assert.equal(sessionTransport({ AFAGH_PUBLIC_BASE_URL: 'http://localhost:8080' }).secure, false);
  assert.equal(sessionTransport({ AFAGH_PUBLIC_BASE_URL: 'https://example.com', AFAGH_COOKIE_SECURE: 'false', AFAGH_COOKIE_SAMESITE: 'none' }).sameSite, 'lax');
  assert.deepEqual(sessionTransport({ AFAGH_COOKIE_SECURE: 'true', AFAGH_COOKIE_SAMESITE: 'strict' }), { secure: true, sameSite: 'strict' });
});
