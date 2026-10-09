import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { runGreetingScans } from '@/lib/greetings';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.greetings' });

// تبریک‌های خودکار: تولد روزانه + شروع ترم انبوه.
// فراخوانی: هدر x-cron-secret برابر GREETINGS_CRON_SECRET، یا نشست ادمین.
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const secret = (await getSetting('GREETINGS_CRON_SECRET')).trim();
  const provided = req.headers.get('x-cron-secret')?.trim() ?? '';
  let authorized = !!secret && provided === secret;

  if (!authorized) {
    const user = await getSessionUser();
    authorized = !!user?.roles.includes('ADMIN');
  }
  if (!authorized) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const started = Date.now();
  const result = await runGreetingScans();
  log.info('cron_greetings', { ...result, durationMs: Date.now() - started });
  return NextResponse.json({ ok: true, durationMs: Date.now() - started, ...result });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
