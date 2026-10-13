import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { computeRuleCoverage } from '@/lib/payroll-engine';
import { getCurrentUniversity } from '@/lib/university-scope';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.payroll.coverage' });
const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE'] as const;

/** نمای پوشش فرمول‌ها: هر ارائهٔ هر استاد در ترم چه فرمولی دارد یا چرا ندارد */
export async function GET(req: NextRequest) {
  try {
    await requireRole([...ALLOWED]);
  } catch (e) {
    log.warn('coverage auth error', e);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const termId = Number(searchParams.get('termId'));
    if (!Number.isInteger(termId) || termId <= 0) {
      return NextResponse.json({ error: 'invalid_term' }, { status: 400 });
    }
    const uni = await getCurrentUniversity().catch(() => null);
    const { rows, ruleCount } = await computeRuleCoverage(termId, uni?.id);
    const missing = rows.filter(r => r.ruleId == null).length;
    return NextResponse.json({ rows, ruleCount, total: rows.length, missing });
  } catch (e) {
    log.error('coverage GET failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
