import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM — کلید از ENV (32 بایت hex یا utf8)
function keyBuf(): Buffer {
  const raw = process.env.SAMIN_MASTER_KEY || process.env.TICKET_TOKEN_SECRET || '';
  if (!raw) throw new Error('SAMIN_MASTER_KEY تعریف نشده — در .env مقداردهی کنید');
  // اگر 64 کاراکتر hex بود، همان را بگیریم
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) return Buffer.from(raw.trim(), 'hex');
  // وگرنه SHA256 روی رشته (برای کلیدهای کوتاه توسعه)
  const { createHash } = require('crypto');
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const key = keyBuf();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(enc: string): string {
  if (!enc || !enc.includes(':')) return enc || '';
  const parts = enc.split(':');
  if (parts.length !== 3) return enc;
  const [ivHex, tagHex, dataHex] = parts;
  const key = keyBuf();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

export function maskSecret(s: string | null | undefined): string {
  if (!s) return '—';
  if (s.length <= 4) return '••••';
  return s.slice(0, 2) + '•'.repeat(6) + s.slice(-2);
}
