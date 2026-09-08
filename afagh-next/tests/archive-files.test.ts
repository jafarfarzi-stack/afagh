import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { isSafeArchiveKey, isWithinDirectory, readLocalArchive, readArchiveStream, MAX_ARCHIVE_BYTES, archiveFailureStatus, parseArchiveDecision } from '../src/lib/archive-files';

test('reject traversal and OS paths, accept generated storage keys', () => {
  for (const key of ['', '../secret', 'a/../../secret', '/etc/passwd', 'a\\..\\secret', 'C:/secret', 'a\0b', 'a/./b', 'a//b']) assert.equal(isSafeArchiveKey(key), false, key);
  assert.equal(isSafeArchiveKey('students/123/document.pdf'), true);
  assert.equal(isWithinDirectory('/uploads', '/uploads-other/a'), false);
});

test('read only real files within an upload root, including symlink checks', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'afagh-archive-'));
  try {
    const root = path.join(temp, 'uploads');
    await mkdir(root);
    await writeFile(path.join(root, 'ok.pdf'), 'test document');
    await writeFile(path.join(temp, 'secret'), 'secret');
    await symlink(path.join(temp, 'secret'), path.join(root, 'escape.pdf'));
    assert.equal((await readLocalArchive([root], 'ok.pdf'))?.toString(), 'test document');
    assert.equal(await readLocalArchive([root], 'missing.pdf'), null);
    await assert.rejects(readLocalArchive([root], '../secret'), /INVALID_ARCHIVE_KEY/);
    await assert.rejects(readLocalArchive([root], 'escape.pdf'), /INVALID_ARCHIVE_KEY/);
    await writeFile(path.join(root, 'large.pdf'), Buffer.alloc(MAX_ARCHIVE_BYTES + 1));
    await assert.rejects(readLocalArchive([root], 'large.pdf'), /ARCHIVE_TOO_LARGE/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('stream limits apply across chunks and close the iterator on failure', async () => {
  let closed = false;
  async function* large() {
    try { yield Buffer.alloc(MAX_ARCHIVE_BYTES); yield Buffer.from('x'); }
    finally { closed = true; }
  }
  await assert.rejects(readArchiveStream(large()), /ARCHIVE_TOO_LARGE/);
  assert.equal(closed, true);
  async function* small() { yield Buffer.from('a'); yield Buffer.from('b'); }
  assert.equal((await readArchiveStream(small())).toString(), 'ab');
});

test('storage failures are not successful or fabricated documents', () => {
  assert.equal(archiveFailureStatus({ code: 'NoSuchKey' }), 404);
  assert.equal(archiveFailureStatus({ code: 'NoSuchBucket' }), 503);
  assert.equal(archiveFailureStatus({ code: 'ECONNREFUSED' }), 503);
  assert.equal(archiveFailureStatus(new Error('ARCHIVE_TOO_LARGE')), 413);
});

test('missing/invalid decision must never approve a document implicitly', () => {
  for (const body of [null, {}, { docId: 1 }, { docId: 1, decision: 'oops' }, { docId: -1, decision: 'VERIFIED' }, { docId: true, decision: 'VERIFIED' }, { docId: 1.5, decision: 'VERIFIED' }, { docId: 2147483648, decision: 'VERIFIED' }, { docId: '1e3', decision: 'VERIFIED' }]) assert.equal(parseArchiveDecision(body), null);
  assert.deepEqual(parseArchiveDecision({ docId: '12', decision: 'REJECTED', reason: 'test' }), { docId: 12, decision: 'REJECTED', reason: 'test' });
});
