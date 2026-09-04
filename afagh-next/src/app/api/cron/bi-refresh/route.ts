import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { refreshAllBiCaches, cacheStatus } from '@/lib/bi-engine';
import { getSetting } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/security';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'cron.bi-refresh' });

// تازه‌سازی آفلاین گزارش‌های هوش تجاری.
//
// محاسبهٔ داشبورد مدیریتی، تحلیل امکانات و ابر کلمات روی کل پاسخ‌های
// ارزشیابی انجام می‌شود؛ درست‌ترین زمان برای آن پایان دورهٔ ارزشیابی یا
// ساعات کم‌ترافیک شبانه است، نه لحظهٔ باز شدن داشبورد توسط مدیر. این job
// همهٔ کش‌ها را یک‌جا بازسازی می‌کند تا درخواست کاربر فقط یک SELECT باشد.
//
// crontab (پس از بسته‌شدن دورهٔ ارزشیابی، روزی یک‌بار):
//   30 2 * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/bi-refresh
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  // M-3: کلید مستقل BI؛ برای سازگاری با نصب‌های قدیمی، fallback به GRAD_CRON_SECRET
  const [biSecret, gradSecret] = await Promise.all([getSetting('BI_CRON_SECRET'), getSetting('GRAD_CRON_SECRET')]);
  const secret = (biSecret || gradSecret || '').trim();
  const provided = req.headers.get('x-cron-secret')?.trim() ?? '';
  let authorized = !!secret && provided === secret;
  if (!authorized) {
    const user = await getSessionUser();
    authorized = !!user?.roles.includes('ADMIN');
  }
  if (!authorized) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const termIdParam = Number(req.nextUrl.searchParams.get('termId') ?? 0);
  const started = Date.now();
  const result = await refreshAllBiCaches(Number.isFinite(termIdParam) && termIdParam > 0 ? termIdParam : undefined);
  log.info('cron_bi_refresh_done', { ...result, durationMs: Date.now() - started });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ...result, cache: await cacheStatus(), durationMs: Date.now() - started });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
