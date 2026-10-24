'use server';

import { eq, isNull, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { academic_terms, evaluation_periods } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
// مثل الگوی group-manager: خالی = ۰ (نه null) تا گاردِ `if (!id)` بدون narrowing اضافی کار کند.
const n = (fd: FormData, k: string) => Number(String(fd.get(k) ?? '').trim() || 0);
const back = (key: 'msg' | 'err', text: string): never =>
  redirect('/admin/evaluations?' + key + '=' + encodeURIComponent(text));

/**
 * مقدار `datetime-local` مرورگر («۱۴۰۵/…» نیازی نیست — ورودی میلادیِ ساده است)
 * به زمان مطلق تبدیل می‌شود. ایران از ۱۴۰۱ ساعت تابستانی ندارد → آفست ثابت
 * +۰۳:۳۰؛ بنابراین «۸ صبح» همان ۸ صبح به وقت تهران است، مستقل از منطقهٔ
 * زمانیِ سرور.
 */
const parseTehran = (v: string): Date | null => {
  const base = v.slice(0, 16); // YYYY-MM-DDTHH:mm (ثانیه احتمالی حذف)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(base)) return null;
  const d = new Date(`${base}:00+03:30`);
  return isNaN(d.getTime()) ? null : d;
};

/** ساخت دورهٔ ارزشیابی — ارزشیابی فقط داخل بازهٔ این دوره‌ها پذیرفته می‌شود. */
export async function createEvaluationPeriodAction(fd: FormData) {
  await requireRole(['ADMIN']);
  const title = s(fd, 'title');
  const termId = n(fd, 'termId');
  const start = parseTehran(s(fd, 'start'));
  const end = parseTehran(s(fd, 'end'));

  if (!title) { back('err', 'عنوان دوره الزامی است.'); return; }
  if (!termId) { back('err', 'ترم دوره را انتخاب کنید.'); return; }
  if (!start || !end) { back('err', 'بازهٔ تاریخ را کامل و درست وارد کنید.'); return; }
  if (end <= start) { back('err', 'زمان پایان باید بعد از زمان شروع باشد.'); return; }

  const uni = await getCurrentUniversity();
  const [term] = await db.select({ id: academic_terms.id, title: academic_terms.title }).from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  if (!term) back('err', 'ترم انتخاب‌شده یافت نشد.');

  await db.insert(evaluation_periods).values({
    termId,
    title,
    startDate: start,
    endDate: end,
    isActive: fd.get('isActive') === 'on' ? 1 : 0,
    universityId: uni.id,
  });
  revalidatePath('/admin/evaluations');
  revalidatePath('/student/exam-card');
  back('msg', 'دورهٔ ارزشیابی ساخته شد. ارزیابی دانشجو فقط در این بازه فعال است.');
}

/** فعال/غیرفعال کردن دوره — برای بستن موقت پنجره بدون حذف سابقه. */
export async function toggleEvaluationPeriodAction(fd: FormData) {
  await requireRole(['ADMIN']);
  const id = n(fd, 'id');
  if (!id) back('err', 'دوره مشخص نیست.');
  const [row] = await db.select({ isActive: evaluation_periods.isActive }).from(evaluation_periods).where(eq(evaluation_periods.id, id)).limit(1);
  if (!row) back('err', 'دوره یافت نشد.');
  await db.update(evaluation_periods).set({ isActive: row.isActive === 1 ? 0 : 1 }).where(eq(evaluation_periods.id, id));
  revalidatePath('/admin/evaluations');
  revalidatePath('/student/exam-card');
  back('msg', row.isActive === 1 ? 'دوره غیرفعال شد — ارزشیابی بسته است.' : 'دوره فعال شد — ارزشیابی در بازهٔ تعیین‌شده باز است.');
}

/** حذف دوره (با تأیید سمت کلاینت). */
export async function deleteEvaluationPeriodAction(fd: FormData) {
  await requireRole(['ADMIN']);
  const id = n(fd, 'id');
  if (!id) back('err', 'دوره مشخص نیست.');
  await db.delete(evaluation_periods).where(eq(evaluation_periods.id, id));
  revalidatePath('/admin/evaluations');
  revalidatePath('/student/exam-card');
  back('msg', 'دوره حذف شد.');
}

/** فهرست دوره‌های ارزشیابی — دانشگاه فعال + رکوردهای سراسری (universityId=null). */
export async function listEvaluationPeriods() {
  await requireRole(['ADMIN']);
  const uni = await getCurrentUniversity();
  const rows = await db
    .select({
      id: evaluation_periods.id,
      title: evaluation_periods.title,
      termId: evaluation_periods.termId,
      termTitle: academic_terms.title,
      startDate: evaluation_periods.startDate,
      endDate: evaluation_periods.endDate,
      isActive: evaluation_periods.isActive,
      universityId: evaluation_periods.universityId,
    })
    .from(evaluation_periods)
    .leftJoin(academic_terms, eq(academic_terms.id, evaluation_periods.termId))
    .where(or(eq(evaluation_periods.universityId, uni.id), isNull(evaluation_periods.universityId)))
    .orderBy(evaluation_periods.id);
  return { universityId: uni.id, universityTitle: uni.title, rows };
}
