import { assertCsrf } from '@/lib/security';
// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — «کنترل زمانی دقیق ثبت مالی» — API وضعیت و تنظیم دوره
//
//  GET  → وضعیت فعلی قفل/بازه برای banner و صفحهٔ مدیریت
//  POST → ایجاد/به‌روزرسانی دورهٔ مالی فعال (zod + مجوز + حسابرسی + لاگ)
//
//  جدول: accounting_periods (schema-timecontrol.ts — جدول مستقلِ ماژول)
//  اِعمال قفل در ثبت‌های مالی: src/lib/finance-time-control.ts → assertEntryAllowed()
// ══════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { accounting_periods } from '@/db/schema-timecontrol';
import { requireRole, getSessionUser } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { getLockState, invalidateTimeControlCache } from '@/lib/finance-time-control';


export const dynamic = 'force-dynamic';

// کلیدهای مجوز — همان FINANCE صفحات و مسیرهای مالی موجود
const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

const log = createLogger({ mod: 'finance.time-control' });

const periodSchema = z.object({
  /** شناسهٔ دورهٔ موجود برای به‌روزرسانی — بدون آن، دورهٔ جدید ثبت می‌شود */
  id: z.number().int().positive().optional(),
  periodName: z.string().trim().max(150).optional().default(''),
  /** ISO datetime (مثلاً ورودی datetime-local کلاینت) */
  opensAt: z.string().min(1),
  closesAt: z.string().min(1),
  isLocked: z.boolean().optional().default(false),
});

/** GET — وضعیت قفل برای UI */
export async function GET() {
  try {
    await requireRole(FINANCE);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'دسترسی غیرمجاز' }, { status: 401 });
  }
  const state = await getLockState();
  return NextResponse.json(state);
}

/** POST — ایجاد/به‌روزرسانی دورهٔ مالی فعال */
export async function POST(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  try {
    await requireRole(FINANCE);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'دسترسی غیرمجاز' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'بدنهٔ درخواست نامعتبر است' }, { status: 400 });
  }
  const parsed = periodSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'پارامترهای نامعتبر (نام دوره، تاریخ شروع و پایان الزامی است)' }, { status: 400 });
  }
  const { id, periodName, isLocked } = parsed.data;

  const opensAt = new Date(parsed.data.opensAt);
  const closesAt = new Date(parsed.data.closesAt);
  if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime())) {
    return NextResponse.json({ error: 'تاریخ شروع/پایان دوره نامعتبر است' }, { status: 400 });
  }
  if (closesAt.getTime() <= opensAt.getTime()) {
    return NextResponse.json({ error: 'پایان دوره باید پس از آغاز آن باشد' }, { status: 400 });
  }

  const user = await getSessionUser();

  try {
    const result = await db.transaction(async (tx) => {
      if (id) {
        const [existing] = await tx
          .select({ id: accounting_periods.id })
          .from(accounting_periods)
          .where(eq(accounting_periods.id, id))
          .limit(1)
          .for('update');
        if (!existing) return { ok: false as const, error: 'دورهٔ مالی یافت نشد' };

        await tx
          .update(accounting_periods)
          .set({ periodName: periodName || null, opensAt, closesAt, isLocked, updatedAt: new Date() })
          .where(eq(accounting_periods.id, id));
        await appendAudit(tx, {
          actorUserId: user?.id ?? null,
          action: 'FINANCE_PERIOD_UPDATED',
          entityType: 'accounting_periods',
          entityId: id,
          details: JSON.stringify({ periodName, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString(), isLocked }),
        });
        return { ok: true as const, id, updated: true as const };
      }

      const [ins] = await tx
        .insert(accounting_periods)
        .values({ periodName: periodName || null, opensAt, closesAt, isLocked })
        .returning({ id: accounting_periods.id });
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_PERIOD_CREATED',
        entityType: 'accounting_periods',
        entityId: ins.id,
        details: JSON.stringify({ periodName, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString(), isLocked }),
      });
      return { ok: true as const, id: ins.id, updated: false as const };
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });

    // قفل باید بلافاصله اثر کند — کش درون-حافظه‌ای helper باطل می‌شود
    invalidateTimeControlCache();
    log.info(result.updated ? 'period_updated' : 'period_created', {
      periodId: result.id,
      actorUserId: user?.id ?? null,
      isLocked,
    });

    const state = await getLockState();
    return NextResponse.json({ ok: true, ...state });
  } catch (e: any) {
    log.error('period_save_failed', { error: e });
    return NextResponse.json({ error: e?.message || 'خطا در ذخیرهٔ دورهٔ مالی' }, { status: 400 });
  }
}
