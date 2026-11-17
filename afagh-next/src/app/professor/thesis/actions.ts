'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { thesis_progress } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { supervisorApproveDefense } from '@/lib/graduation-engine';

/**
 * کنشِ «تأیید/رد درخواست دفاع» از کارتابل استاد.
 *
 * چرا این‌جاست و نه در `/admin/defense-scheduling`: استاد راهنما طبق گاردِ نقشِ
 * همان میز به پنل مدیریت ریدایرکت می‌شد؛ تنها راهش تایپِ دستیِ مسیر بود. این
 * اکشن فقط همان یک کنش را در دسترسِ استاد می‌گذارد و بقیهٔ ابزارهای کارشناسی
 * (تعیین وقت، هیأت داوران، ثبت نتیجه) عمداً این‌جا نیست.
 *
 * نوشتن در جدول توسط موتور (`supervisorApproveDefense`) انجام می‌شود تا اعلان‌ها،
 * تغییر وضعیت و بررسی مالکیت یک‌جا و هم‌راستا با میز کارشناس بمانند.
 */

const PATH = '/professor/thesis';

export type DefenseDecisionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function approveDefenseRequestAction(input: {
  auditId: number;
  approved: boolean;
  reason?: string;
}): Promise<DefenseDecisionResult> {
  // گاردِ نقش بیرون از try — `requireRole` در صورت رد، redirect پرتاب می‌کند و
  // نباید توسط catch همین تابع بلعیده شود.
  const user = await requireRole(['PROFESSOR', 'DEP_HEAD']);

  try {
    const auditId = Number(input.auditId);
    if (!Number.isInteger(auditId) || auditId <= 0) {
      return { ok: false, error: 'شناسهٔ پرونده نامعتبر است.' };
    }

    const reason = (input.reason ?? '').trim();
    if (!input.approved && reason.length < 3) {
      return { ok: false, error: 'برای رد درخواست دفاع، ثبت دلیل الزامی است.' };
    }
    if (reason.length > 500) {
      return { ok: false, error: 'دلیل واردشده بیش از حد بلند است (حداکثر ۵۰۰ نویسه).' };
    }

    const me = await getStaffByUser(user.id);
    if (!me) {
      return {
        ok: false,
        error: 'پروندهٔ هیئت علمی برای این حساب یافت نشد؛ تأیید دفاع فقط از سوی استاد راهنما ممکن است.',
      };
    }

    // 🔒 مالکیت: پیش از هر نوشتنی بررسی می‌شود که همین پرونده راهنمای همین
    //    استاد باشد؛ موتور هم دوباره همین شرط را اعمال می‌کند.
    const [tp] = await db
      .select({
        supervisorId: thesis_progress.supervisorId,
        defenseRequestStatus: thesis_progress.defenseRequestStatus,
      })
      .from(thesis_progress)
      .where(eq(thesis_progress.auditId, auditId))
      .limit(1);

    if (!tp) {
      return { ok: false, error: 'پروندهٔ پایان‌نامه‌ای برای این شناسه یافت نشد.' };
    }
    if (tp.supervisorId !== me.id) {
      return { ok: false, error: 'شما استاد راهنمای این پایان‌نامه نیستید.' };
    }
    if (tp.defenseRequestStatus !== 'SUPERVISOR_REVIEW') {
      return { ok: false, error: 'این درخواست دیگر در انتظار تأیید شما نیست.' };
    }

    await supervisorApproveDefense({
      auditId,
      supervisorId: me.id,
      approved: !!input.approved,
    });

    revalidatePath(PATH);

    return {
      ok: true,
      message: input.approved
        ? 'درخواست دفاع تأیید شد و برای تعیین وقت و هیأت داوران به کارشناس آموزش ارجاع شد.'
        : `درخواست دفاع رد شد${reason ? ` — دلیل: ${reason}` : ''}.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'خطای نامشخص رخ داد؛ دوباره تلاش کنید.',
    };
  }
}
