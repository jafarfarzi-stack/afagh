import path from 'node:path';
import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';

export const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;

/** Storage keys are relative POSIX paths, never OS paths. */
export function isSafeArchiveKey(key: string): boolean {
  return !!key && !key.includes('\\') && !key.includes('\0') &&
    !key.includes(':') && !path.posix.isAbsolute(key) &&
    key.split('/').every(part => part !== '..' && part !== '.' && part !== '');
}

export function isWithinDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Resolve symlinks before checking containment; uploads directories must not be
 * writable by untrusted OS users (ancestor replacement races are out of scope). */
export async function readLocalArchive(roots: string[], key: string): Promise<Buffer | null> {
  if (!isSafeArchiveKey(key)) throw new Error('INVALID_ARCHIVE_KEY');
  for (const root of roots) {
    let canonicalRoot: string;
    let canonicalFile: string;
    try {
      canonicalRoot = await realpath(root);
      canonicalFile = await realpath(path.resolve(root, key));
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) continue;
      throw error;
    }
    if (!isWithinDirectory(canonicalRoot, canonicalFile)) throw new Error('INVALID_ARCHIVE_KEY');
    const handle = await open(canonicalFile, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) continue;
      if (stat.size > MAX_ARCHIVE_BYTES) throw new Error('ARCHIVE_TOO_LARGE');
      return await readArchiveStream(handle.createReadStream({ autoClose: false }));
    } finally {
      await handle.close();
    }
  }
  return null;
}

export async function readArchiveStream(stream: AsyncIterable<Buffer | Uint8Array | string>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_ARCHIVE_BYTES) throw new Error('ARCHIVE_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function archiveFailureStatus(error: unknown): number {
  const e = error as { code?: string; message?: string };
  if (e?.message === 'INVALID_ARCHIVE_KEY') return 400;
  if (e?.message === 'ARCHIVE_TOO_LARGE') return 413;
  // NoSuchBucket is a configuration failure, not a missing document.
  if (e?.code === 'NoSuchKey' || e?.code === 'NoSuchObject') return 404;
  return 503;
}

/** IDs target PostgreSQL int4 columns, not the wider JS safe-integer range. */
export function parseArchiveId(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

export function parseArchiveDecision(body: unknown): { docId: number; decision: 'VERIFIED' | 'REJECTED'; reason: string | null } | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  const docId = parseArchiveId(value.docId);
  if (docId === null) return null;
  if (value.decision !== 'VERIFIED' && value.decision !== 'REJECTED') return null;
  return { docId, decision: value.decision, reason: typeof value.reason === 'string' ? value.reason.slice(0, 500) : null };
}
