import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAuditHash, encodeAuditDetails, verifyAuditChain, type AuditRow } from '../src/lib/audit-core';
function row(id = 1, prevHash = ''): AuditRow {
  const value = { id, actorUserId: 1, action: 'TEST', entityType: 'test', entityId: 2,
    details: encodeAuditDetails('{"amount":100}'), ipAddress: null,
    createdAt: new Date('2026-09-08T00:00:00.123Z'), prevHash };
  return { ...value, hash: computeAuditHash(value) };
}
test('persisted fields reproduce hash and valid chain', () => {
  const a = row(); const b = row(2, a.hash);
  assert.equal(verifyAuditChain([a, b]).ok, true);
  assert.equal(computeAuditHash({ ...a, createdAt: new Date(a.createdAt.toISOString()) }), a.hash);
});
test('tampering with each hashed field is detected', () => {
  const a = row();
  for (const patch of [{ actorUserId: 2 }, { action: 'EDIT' }, { entityId: 9 }, { entityType: 'other' }, { details: encodeAuditDetails('changed') }, { ipAddress: '1.2.3.4' }, { createdAt: new Date() }, { prevHash: 'bad' }]) {
    assert.equal(verifyAuditChain([{ ...a, ...patch }]).ok, false);
  }
});
test('forks, missing middle rows, duplicates and format downgrade fail', () => {
  const a = row(); const b = row(2, a.hash); const c = row(3, b.hash);
  for (const rows of [[a, row(2)], [a, c], [a, a], [a, { ...b, details: '{}' }]]) assert.equal(verifyAuditChain(rows).ok, false);
});
test('legacy prefix is explicitly unverified, not rewritten or declared valid hash', () => {
  const old = { ...row(), details: '{}', hash: 'legacy-hash' };
  const result = verifyAuditChain([old, row(2, old.hash)]);
  assert.equal(result.ok, true);
  assert.equal(result.legacy, 1);
  assert.equal(result.verified, 1);
});
