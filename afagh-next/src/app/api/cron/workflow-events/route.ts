import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { retryPendingWorkflowEvents } from '@/lib/workflow-events';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.workflow-events' });

// اجرای دوبارهٔ رویدادهای ناموفق موتور گردش کار.
// اثر تجاری یک پروندهٔ تأییدشده (مثلاً ثبت درس تطبیق‌شده در کارنامه) اگر وسط کار
// خطا داده باشد، در جدول workflow_events با وضعیت FAILED می‌ماند و این job آن
// را دوباره اجرا می‌کند.
// دو راه فراخوانی: هدر x-cron-secret برابر تنظیم GRAD_CRON_SECRET، یا نشست ادمین.
// نمونهٔ crontab:  */15 * * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/workflow-events
export async function POST(req: NextRequest) {
  const secret = (await getSetting('GRAD_CRON_SECRET')).trim();
  const provided = req.headers.get('x-cron-secret')?.trim() ?? '';
  let authorized = !!secret && provided === secret;

  if (!authorized) {
    const user = await getSessionUser();
    authorized = !!user?.roles.includes('ADMIN');
  }
  if (!authorized) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 50);
  const started = Date.now();
  const result = await retryPendingWorkflowEvents(Number.isFinite(limit) ? limit : 50);
  log.info('cron_workflow_events_done', { ...result, durationMs: Date.now() - started });
  return NextResponse.json({ ...result, ok: true, durationMs: Date.now() - started });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
