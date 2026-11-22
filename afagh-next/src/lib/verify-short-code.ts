import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { document_verify_codes } from '@/db/schema';

/**
 * کدِ کوتاهِ استعلام (۸ کاراکتر، قالبِ «XXXX-XXXX»).
 *
 * چرا: توکنِ استعلام ۱۰۰+ کاراکتر است و روی سندِ چاپی قابل تایپ نیست. این کد
 * جای آن را می‌گیرد و در صفحهٔ /verify وارد می‌شود. کد فقط «اشاره» است —
 * اعتبار و انقضا همان‌جا در مسیرِ verify-* دوباره از توکن بررسی می‌شود.
 *
 * ⚠ همهٔ توابع fail-open‌اند: نبودِ جدول یا خطای DB نباید صدورِ سند را بشکند.
 */

/** بدونِ 0/O/1/I تا با هم اشتباه نشوند */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const KIND_ROUTE: Record<string, string> = {
  TRANSCRIPT: '/verify-transcript',
  FINANCE: '/verify-finance',
  ENROLLMENT: '/verify-enrollment',
};

function randomCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** ورودی کاربر را به قالبِ کانونی «XXXX-XXXX» تبدیل می‌کند؛ نامعتبر → '' */
export function normalizeShortCode(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length !== 8) return '';
  for (const ch of s) if (!ALPHABET.includes(ch)) return '';
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function issueShortCode(
  token: string,
  kind: string,
  expiresAt: string,
): Promise<string | null> {
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      try {
        await db.insert(document_verify_codes).values({
          code,
          token,
          kind,
          expiresAt: new Date(expiresAt),
        });
        return code;
      } catch {
        // برخوردِ کد (بسیار نادر) → تلاشِ دوباره
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveShortCode(
  raw: string | null | undefined,
): Promise<{ token: string; kind: string } | null> {
  const code = normalizeShortCode(raw);
  if (!code) return null;
  try {
    const [row] = await db
      .select()
      .from(document_verify_codes)
      .where(eq(document_verify_codes.code, code))
      .limit(1);
    if (!row) return null;
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return null;
    return { token: row.token, kind: row.kind };
  } catch {
    return null;
  }
}
