import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';

// ═══ پنجرهٔ زمانی انتخاب واحد ═══
// باز بودن = پرچم مدیر + بودن در بازهٔ [شروع، پایان] — هر سه شرط با هم.
export type Term = typeof academic_terms.$inferSelect;
export type WindowState = 'OPEN' | 'BEFORE' | 'AFTER' | 'CLOSED' | 'NO_TERM';
export type WindowStatus = { open: boolean; state: WindowState; label: string; start: Date | null; end: Date | null };

const faDt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function windowStatus(term: Term | null | undefined, now: Date = new Date()): WindowStatus {
  if (!term) return { open: false, state: 'NO_TERM', label: 'ترم جاری تعریف نشده است.', start: null, end: null };
  const start = term.enrollmentStartDate ?? null;
  const end = term.enrollmentEndDate ?? null;
  if (!term.isEnrollmentOpen)
    return { open: false, state: 'CLOSED', label: 'پنجرهٔ انتخاب واحد توسط مدیر بسته است.', start, end };
  if (start && now < new Date(start))
    return { open: false, state: 'BEFORE', label: `پنجرهٔ انتخاب واحد از ${faDt(start)} باز می‌شود.`, start, end };
  if (end && now > new Date(end))
    return { open: false, state: 'AFTER', label: `پنجرهٔ انتخاب واحد در ${faDt(end)} بسته شد.`, start, end };
  return { open: true, state: 'OPEN', label: end ? `پنجرهٔ انتخاب واحد باز است — تا ${faDt(end)}` : 'پنجرهٔ انتخاب واحد باز است.', start, end };
}

export async function currentTerm(): Promise<Term | null> {
  const [t] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
  return t ?? null;
}

/**
 * گیت سروری «پنجرهٔ انتخاب واحد» برای هر عملیاتِ نویسنده (سبد/ثبت/حذف).
 *
 * پیش از این، بازهٔ زمانی فقط در صفحهٔ دانشجو (برای نمایش) محاسبه می‌شد و
 * action‌ها بدون هیچ بررسی‌ای سبد را تغییر می‌دادند؛ یعنی با URL/فرم مستقیم
 * می‌شد خارج از مهلت انتخاب واحد کرد. این تابع تنها مرجعِ «الان مجاز است یا نه»
 * است و همهٔ مسیرهای نوشتن باید از آن رد شوند.
 *
 * - `ADD`  : پرچم ترم + کلید سراسری مدیر + بازهٔ [enrollmentStartDate, enrollmentEndDate]
 * - `DROP` : فقط بازهٔ [addDropStartDate, addDropEndDate] — پرچم ترم و کلید سراسری
 *            اعمال نمی‌شود تا مسیر «حذف» در شرایط اضطراری بسته نشود.
 * هر کرانِ NULL = بدون محدودیت.
 */
type WindowExec = {
  select: (...args: any[]) => any;
};

export async function assertEnrollmentWrite(
  termId: number | null | undefined,
  kind: 'ADD' | 'DROP',
  exec: WindowExec = db as unknown as WindowExec,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (termId == null) return { ok: false, error: 'نیمسال جاری فعال نیست.' };

  let term: Term | null = null;
  try {
    const rows = await exec.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
    term = (rows?.[0] ?? null) as Term | null;
  } catch {
    // خطای خواندن ترم = نامشخص → deny (fail-closed)
    return { ok: false, error: 'نیمسال جاری فعال نیست.' };
  }
  if (!term) return { ok: false, error: 'نیمسال جاری فعال نیست.' };

  const now = new Date();

  if (kind === 'DROP') {
    const dropStart = term.addDropStartDate ?? null;
    const dropEnd = term.addDropEndDate ?? null;
    if (dropStart && now < new Date(dropStart))
      return { ok: false, error: `حذف و اضافه از ${faDt(dropStart)} آغاز می‌شود.` };
    if (dropEnd && now > new Date(dropEnd))
      return { ok: false, error: `مهلت حذف و اضافه در ${faDt(dropEnd)} پایان یافت.` };
    return { ok: true };
  }

  if (!term.isEnrollmentOpen) return { ok: false, error: 'انتخاب واحد موقتاً توسط آموزش بسته شده است.' };
  // کلید دستی مدیر — همان خوانندهٔ بولیِ سامانه (getBool؛ پیش‌فرض تعریف‌شده = true).
  // import پویا تا این ماژول (که کارگر صف/اسکریپت‌ها هم بارگذاری می‌کنند) وابستگی
  // ثابت به ماژول server-only پیدا نکند؛ نبودِ تنظیمات = deny (fail-closed).
  const globalOpen = await import('@/lib/settings')
    .then(m => m.getBool('ENROLLMENT_WINDOW_OPEN'))
    .catch(() => false);
  if (!globalOpen) return { ok: false, error: 'انتخاب واحد موقتاً توسط آموزش بسته شده است.' };

  const start = term.enrollmentStartDate ?? null;
  const end = term.enrollmentEndDate ?? null;
  if (start && now < new Date(start))
    return { ok: false, error: `پنجرهٔ انتخاب واحد از ${faDt(start)} باز می‌شود.` };
  if (end && now > new Date(end))
    return { ok: false, error: `مهلت انتخاب واحد در ${faDt(end)} پایان یافت.` };
  return { ok: true };
}
