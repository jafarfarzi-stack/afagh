import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { archiveKey } from '../src/lib/objectStore';
import { isSafeArchiveKey, readLocalArchive, readArchiveStream, parseArchiveId, MAX_ARCHIVE_BYTES } from '../src/lib/archive-files';
import { trustedClientIp, normalizeClientIp } from '../src/lib/proxy-trust';
import { computeAuditHash, encodeAuditDetails, verifyAuditChain, type AuditRow } from '../src/lib/audit-core';

test('20,000 archive keys at the exact same millisecond never collide', () => {
  const original = Date.now; Date.now = () => 1788885000000;
  try {
    const keys = Array.from({ length: 20000 }, () => archiveKey(1, 1, 'pdf'));
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.every(isSafeArchiveKey));
  } finally { Date.now = original; }
});
test('10,000 traversal variants are rejected', () => {
  for (let i=0; i<10000; i++) {
    const prefix = `safe-${i}/`;
    for (const bad of [`${prefix}../secret`, `${prefix}a/../../secret`, `${prefix}..\\secret`, `${prefix}\0secret`]) assert.equal(isSafeArchiveKey(bad), false);
  }
});
test('int4 ID bounds and coercion traps', () => {
  for (const value of [0, -1, 2147483648, Number.MAX_SAFE_INTEGER, Infinity, NaN, '1e3', '0x10', '1.5', ' 1', true, {}, [], '']) assert.equal(parseArchiveId(value), null);
  assert.equal(parseArchiveId('2147483647'), 2147483647);
});
test('nested symlink escapes fail and FIFO cannot hang file reader', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afagh-adversarial-'));
  try {
    const inside = path.join(root, 'uploads'); await mkdir(inside);
    const sibling = path.join(root, 'uploads-other'); await mkdir(sibling); await writeFile(path.join(sibling, 'secret'), 'SECRET');
    await symlink(sibling, path.join(inside, 'escape'));
    await assert.rejects(readLocalArchive([inside], 'escape/secret'), /INVALID_ARCHIVE_KEY/);
    execFileSync('mkfifo', [path.join(inside, 'pipe')]);
    assert.equal(await readLocalArchive([inside], 'pipe'), null);
    await symlink(path.join(inside, 'loop'), path.join(inside, 'loop'));
    await assert.rejects(readLocalArchive([inside], 'loop'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('stream exact limit, empty, midstream network failure and 100 oversize cancellations', async () => {
  async function* exact() { yield Buffer.alloc(MAX_ARCHIVE_BYTES); }
  assert.equal((await readArchiveStream(exact())).length, MAX_ARCHIVE_BYTES);
  async function* empty() {}
  assert.equal((await readArchiveStream(empty())).length, 0);
  async function* broken() { yield Buffer.from('partial'); throw new Error('injected network failure'); }
  await assert.rejects(readArchiveStream(broken()), /injected network failure/);
  const full = Buffer.alloc(MAX_ARCHIVE_BYTES); let closed = 0;
  for (let i=0; i<100; i++) {
    async function* over() { try { yield full; yield 'x'; } finally { closed++; } }
    await assert.rejects(readArchiveStream(over()), /ARCHIVE_TOO_LARGE/);
  }
  assert.equal(closed, 100);
});
test('10,000 forged credentials cannot manufacture trusted identity', () => {
  const secret = randomBytes(32).toString('hex');
  for (let i=0; i<10000; i++) {
    const h = new Headers({ 'x-afagh-proxy-token': randomBytes(32).toString('hex'), 'x-afagh-client-ip': '127.0.0.1', 'x-forwarded-for': `203.0.113.${i%255}` });
    assert.equal(trustedClientIp(h, { enabled: true, secret }), null);
  }
  for (let i=0;i<256;i++) assert.equal(normalizeClientIp(`::ffff:192.0.2.${i}`), `192.0.2.${i}`);
});
test('5,000 audit records: Unicode, pipes/newlines, deleted middle row and edited IP', () => {
  const rows: AuditRow[] = []; let prevHash = '';
  for (let i=1;i<=5000;i++) {
    const row = { id:i, actorUserId:i, action:'TEST', entityType:'test', entityId:i, details:encodeAuditDetails(`فارسی|\n${i}🙂`), ipAddress:'::1', createdAt:new Date(1788885000000+i), prevHash };
    const hash = computeAuditHash(row); rows.push({ ...row, hash }); prevHash=hash;
  }
  assert.equal(verifyAuditChain(rows).verified, 5000);
  assert.equal(verifyAuditChain([...rows.slice(0,2000), ...rows.slice(2001)]).ok, false);
  const changed = rows.map((r,i) => i===2500 ? { ...r, ipAddress:'::2' } : r);
  assert.equal(verifyAuditChain(changed).ok, false);
});
