import { NextRequest, NextResponse } from 'next/server';
import { checkNationalIdForToken } from '@/lib/verification';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'api.verify.national-id' });

/**
 * تأیید کد ملی برای یک سند استعلام — **بدون افشای کد**.
 *
 * کد ملی در HTML صفحهٔ عمومی نمی‌آید؛ استعلام‌کننده آن را وارد می‌کند و این
 * مسیر فقط «می‌خواند/نمی‌خواند» را برمی‌گرداند. ورودی باید ۱۰ رقم کامل باشد و
 * دو سقف نرخ دارد (به‌ازای IP و به‌ازای سند) تا بروت‌فورس عملی نباشد.
 */
export async function POST(req: NextRequest) {
  let token = '';
  let value = '';
  try {
    const body = (await req.json()) as { token?: unknown; value?: unknown } | null;
    token = String(body?.token ?? '');
    value = String(body?.value ?? '');
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 });
  }
  if (!token || !value) {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 });
  }

  try {
    const ip = await clientIp().catch(() => 'local');
    const byIp = await rateLimit(`nid-check:ip:${ip}`, 20, 10 * 60);
    if (!byIp.ok) {
      return NextResponse.json({ ok: false, error: 'RATE_LIMIT' }, { status: 429 });
    }
    // سقف به‌ازای خودِ سند: جلوگیری از بروت‌فورس کد ملی روی یک لینک لو رفته
    const byToken = await rateLimit(`nid-check:tok:${token.slice(-24)}`, 8, 10 * 60);
    if (!byToken.ok) {
      return NextResponse.json({ ok: false, error: 'RATE_LIMIT' }, { status: 429 });
    }

    const res = await checkNationalIdForToken(token, value);
    if (!res.ok) {
      const status = res.reason === 'FORMAT' ? 400 : res.reason === 'BAD_TOKEN' ? 403 : 404;
      return NextResponse.json({ ok: false, error: res.reason }, { status });
    }
    return NextResponse.json({ ok: true, match: res.match });
  } catch (e) {
    log.error('national-id check failed', { err: e });
    return NextResponse.json({ ok: false, error: 'INTERNAL' }, { status: 500 });
  }
}
