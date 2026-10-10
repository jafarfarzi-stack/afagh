import 'server-only';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'lms-api' });

function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function timingEq(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, 'hex');
    const b = Buffer.from(bHex, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * احراز هویت API کششی مودل: هدر `x-lms-token` یا پارامتر `?token=`.
 * توکن در تنظیمات (MOODLE_PULL_TOKEN) — تا وقتی خالی است API کاملاً بسته است.
 */
export async function requireLmsToken(req: NextRequest): Promise<NextResponse | null> {
  const rl = await rateLimit(`lms:${await clientIp()}`, 600, 60);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }
  let configured = '';
  try {
    configured = (await getSetting('MOODLE_PULL_TOKEN')).trim();
  } catch {
    configured = '';
  }
  if (!configured) {
    return NextResponse.json(
      { ok: false, error: 'disabled', hint: 'MOODLE_PULL_TOKEN در تنظیمات خالی است.' },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  const provided = (req.headers.get('x-lms-token') ?? url.searchParams.get('token') ?? '').trim();
  if (!provided || !timingEq(sha256hex(provided), sha256hex(configured))) {
    log.warn('lms_unauthorized', {});
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export function lmsOk<T>(data: T, paging?: { limit: number; offset: number; count: number }) {
  return NextResponse.json({ ok: true, data, ...(paging ? { paging } : {}) });
}

export function lmsPaging(url: URL): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 500), 1), 5000);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  return { limit, offset };
}
