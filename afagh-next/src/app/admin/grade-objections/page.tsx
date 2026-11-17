import { requireRole, getSessionUser, getStaffByUser } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { db } from '@/db';
import { and, desc, eq, ne } from 'drizzle-orm';
import {
  academic_terms,
  enrollments,
  grade_objections,
  students,
  users,
} from '@/db/schema';
import { notifyUserMultichannel } from '@/lib/messaging';
import { logGradeChange } from '@/lib/grade-change-log';
import { GRADE_STATUS_FA } from '@/lib/student-labels';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const GRADE_OBJECTION_STATUS_FA: Record<string, string> = {
  PENDING: 'در حال بررسی',
  REVIEWED: 'بررسی شد',
  ACCEPTED: 'پذیرفته شد',
  REJECTED: 'رد شد',
};

export type GradeObjectionItem = {
  id: number;
  studentName: string;
  studentCode: string | null;
  termTitle: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  gradeAtObjection: string | null;
  /** نمرهٔ فعلیِ ردیف ثبت‌نام (نتیجهٔ بررسی، اگر اعتراض پذیرفته شده باشد) */
  gradeValue: string | null;
  gradeStatus: string | null;
  requestText: string;
  status: string;
  reviewerNote: string | null;
  createdAt: string | null;
};

const faNum = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === ''
    ? '—'
    : String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const firstParam = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

async function loadRows(statusFilter: 'PENDING' | 'OTHER', universityId: number | null): Promise<GradeObjectionItem[]> {
  const where =
    universityId != null
      ? and(
          statusFilter === 'PENDING'
            ? eq(grade_objections.status, 'PENDING')
            : ne(grade_objections.status, 'PENDING'),
          eq(grade_objections.universityId, universityId),
        )
      : statusFilter === 'PENDING'
        ? eq(grade_objections.status, 'PENDING')
        : ne(grade_objections.status, 'PENDING');

  const rows = await db
    .select({
      id: grade_objections.id,
      studentCode: students.studentCode,
      firstName: users.firstName,
      lastName: users.lastName,
      termTitle: academic_terms.title,
      courseCode: grade_objections.courseCode,
      courseTitle: grade_objections.courseTitle,
      gradeAtObjection: grade_objections.gradeAtObjection,
      gradeValue: enrollments.gradeValue,
      gradeStatus: enrollments.gradeStatus,
      requestText: grade_objections.requestText,
      status: grade_objections.status,
      reviewerNote: grade_objections.reviewerNote,
      createdAt: grade_objections.createdAt,
    })
    .from(grade_objections)
    .innerJoin(students, eq(students.id, grade_objections.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(academic_terms, eq(academic_terms.id, grade_objections.termId))
    .leftJoin(enrollments, eq(enrollments.id, grade_objections.enrollmentId))
    .where(where)
    .orderBy(desc(grade_objections.createdAt))
    .limit(statusFilter === 'PENDING' ? 100 : 200);

  return rows.map(r => ({
    id: r.id,
    studentName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—',
    studentCode: r.studentCode,
    termTitle: r.termTitle,
    courseCode: r.courseCode,
    courseTitle: r.courseTitle,
    gradeAtObjection: r.gradeAtObjection != null ? String(r.gradeAtObjection) : null,
    gradeValue: r.gradeValue != null ? String(r.gradeValue) : null,
    gradeStatus: r.gradeStatus,
    requestText: r.requestText,
    status: r.status,
    reviewerNote: r.reviewerNote,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
  }));
}

/**
 * هستهٔ بررسی اعتراض (سرور) — مشترک بین اکشن سرور و فرم سرور-رندرشده.
 *
 * ⚠️ پذیرش («ACCEPTED») بدون نمرهٔ جدید ممنوع است: پیش‌تر فقط status ردیف
 * اعتراض عوض می‌شد و دانشجو پیام «پذیرفته شد» می‌گرفت در حالی که نمره
 * دست‌نخورده می‌ماند. حالا در همان جریان، نمرهٔ ثبت‌نام هم نوشته می‌شود،
 * audit با logGradeChange ثبت می‌شود و قدیم→جدید در اطلاع‌رسانی می‌آید.
 *
 * امضای سه‌آرگومانی قبلی و شکل بازگشتی { ok, error } حفظ شده‌اند و آرگومان
 * چهارم اختیاری است (سازگاری با مصرف‌کنندهٔ قبلی).
 */
async function applyObjectionDecision(
  id: number,
  decision: 'ACCEPTED' | 'REJECTED',
  reviewNote: string,
  newGradeValue?: number | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
    const user = await getSessionUser();
    if (!user) return { ok: false, error: 'وارد شوید.' };
    const staff = await getStaffByUser(user.id);
    if (!staff) return { ok: false, error: 'پروندهٔ کارمندی یافت نشد.' };

    const note = (reviewNote ?? '').trim();
    if (note.length < 3) return { ok: false, error: 'یادداشت بررسی الزامی است (حداقل ۳ کاراکتر).' };

    // 🔒 دامنهٔ دانشگاهی: فهرست با دانشگاه فعال اسکوپ شده؛ نوشتن هم باید.
    //    بدون دانشگاه فعال (id=0 یا نامشخص) هیچ اعتراضی قابل تعیین‌تکلیف نیست.
    const uni = await getCurrentUniversity().catch(() => null);
    const actingUniId = uni?.id ?? null;
    if (actingUniId == null) return { ok: false, error: 'اعتراض یافت نشد.' };

    // نمرهٔ جدید فقط برای پذیرش لازم است (۰..۲۰)
    let newGrade: string | null = null;
    if (decision === 'ACCEPTED') {
      if (newGradeValue == null || !Number.isFinite(Number(newGradeValue))) {
        return { ok: false, error: 'برای پذیرش اعتراض، ثبت «نمرهٔ جدید» (۰ تا ۲۰) الزامی است.' };
      }
      const n = Number(newGradeValue);
      if (n < 0 || n > 20) return { ok: false, error: 'نمرهٔ جدید باید بین ۰ تا ۲۰ باشد.' };
      newGrade = String(Number(n.toFixed(2)));
    }

    const [ob] = await db
      .select()
      .from(grade_objections)
      .where(and(
        eq(grade_objections.id, id),
        eq(grade_objections.universityId, actingUniId),
      ))
      .limit(1);
    if (!ob) return { ok: false, error: 'اعتراض یافت نشد.' };
    if (ob.status !== 'PENDING') return { ok: false, error: 'این اعتراض قبلاً بررسی شده است.' };

    // ردیف ثبت‌نامِ همان اعتراض — نمرهٔ فعلی برای مقایسه و audit
    const [enr] = await db
      .select({
        id: enrollments.id,
        offeringId: enrollments.offeringId,
        studentId: enrollments.studentId,
        gradeValue: enrollments.gradeValue,
        gradeStatus: enrollments.gradeStatus,
      })
      .from(enrollments)
      .where(eq(enrollments.id, ob.enrollmentId))
      .limit(1);

    if (decision === 'ACCEPTED' && !enr) {
      return { ok: false, error: 'ثبت‌نام مرتبط با این اعتراض یافت نشد؛ نمره ثبت نشد.' };
    }

    const oldGrade = enr?.gradeValue ?? null;
    const oldNum = oldGrade == null ? null : Number(oldGrade);
    const newNum = newGrade == null ? null : Number(newGrade);
    // نوشتن فقط وقتی نمره واقعاً عوض شده باشد (دقت ذخیره‌سازی: دو رقم اعشار)
    const gradeChanged = newNum != null && (oldNum == null || Math.abs(oldNum - newNum) > 0.0001);
    const now = new Date();

    // ── نوشتن اتمیک: ردیف اعتراض + نمرهٔ ثبت‌نام با هم ──
    try {
      await db.transaction(async (tx) => {
        const upd = await tx
          .update(grade_objections)
          .set({
            status: decision,
            reviewerId: staff.id,
            reviewerNote: note,
            resolvedAt: now,
            updatedAt: now,
          })
          // قید universityId + PENDING داخل خود UPDATE → هم TOCTOU بسته می‌شود
          // و هم ردیف دانشگاه دیگر (یا NULL) هرگز نوشته نمی‌شود.
          .where(and(
            eq(grade_objections.id, id),
            eq(grade_objections.universityId, actingUniId),
            eq(grade_objections.status, 'PENDING'),
          ))
          .returning({ id: grade_objections.id });
        if (upd.length === 0) throw new Error('OBJECTION_STALE');

        if (gradeChanged && enr && newGrade != null) {
          const wrote = await tx
            .update(enrollments)
            .set({ gradeValue: newGrade, gradeStatus: 'FINALIZED' })
            .where(eq(enrollments.id, enr.id))
            .returning({ id: enrollments.id });
          if (wrote.length === 0) throw new Error('OBJECTION_STALE');
        }
      });
    } catch (err) {
      if ((err as Error)?.message === 'OBJECTION_STALE') {
        return { ok: false, error: 'این اعتراض هم‌زمان توسط دیگری بررسی شد؛ لطفاً فهرست را تازه کنید.' };
      }
      throw err;
    }

    // audit تغییر نمره — از helper موجود (عمداً پس از commit؛ خطای لاگ نباید
    // نوشتن نمره را برگرداند؛ خود helper هم خطا را می‌بلعد).
    if (gradeChanged && enr && newGrade != null) {
      await logGradeChange({
        enrollmentId: enr.id,
        studentId: enr.studentId,
        offeringId: enr.offeringId,
        action: 'ADMIN_OVERRIDE',
        oldGradeValue: oldGrade,
        newGradeValue: newGrade,
        oldGradeStatus: enr.gradeStatus,
        newGradeStatus: 'FINALIZED',
        reason: `پذیرش اعتراض به نمره — ${note}`,
        actorUserId: user.id,
        actorRole: 'ADMIN',
      });
    }

    revalidatePath('/admin/grade-objections');
    revalidatePath('/admin/students');
    revalidatePath('/professor/grades');

    // اطلاع‌رسانی به دانشجو (بهترین تلاش — خطای آن بر نتیجهٔ بررسی اثر ندارد)
    try {
      const [stu] = await db
        .select({ userId: students.userId })
        .from(students)
        .where(eq(students.id, ob.studentId))
        .limit(1);
      if (stu?.userId) {
        const gradeFa = faNum(newGrade ?? oldGrade);
        const changeFa = decision === 'ACCEPTED'
          ? gradeChanged
            ? ` نمره از ${faNum(oldGrade)} به ${gradeFa} تغییر کرد.`
            : ` نمره بدون تغییر ماند (${gradeFa}).`
          : '';
        await notifyUserMultichannel({
          userId: stu.userId,
          eventCode: decision === 'ACCEPTED' ? 'GRADE_OBJECTION_ACCEPTED' : 'GRADE_OBJECTION_REJECTED',
          text:
            decision === 'ACCEPTED'
              ? `اعتراض شما به نمرهٔ ${ob.courseTitle ?? 'درس'} بررسی و پذیرفته شد.${changeFa} یادداشت کارشناس: ${note}`
              : `اعتراض شما به نمرهٔ ${ob.courseTitle ?? 'درس'} بررسی و رد شد. یادداشت کارشناس: ${note}`,
        }).catch(() => null);
      }
    } catch {
      /* بی‌تأثیر */
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطای ناشناخته' };
  }
}

export default async function GradeObjectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  const sp = (await searchParams) ?? {};
  const okMsg = firstParam(sp.ok);
  const errMsg = firstParam(sp.err);
  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;

  const open = await loadRows('PENDING', universityId);
  const history = await loadRows('OTHER', universityId);

  /** اکشن سرور با همان امضا و شکل بازگشتیِ قبلی (سازگار با مصرف‌کنندهٔ کلاینتی) */
  async function reviewAction(
    id: number,
    decision: 'ACCEPTED' | 'REJECTED',
    reviewNote: string,
    newGradeValue?: number | null,
  ): Promise<{ ok: boolean; error?: string }> {
    'use server';
    return applyObjectionDecision(id, decision, reviewNote, newGradeValue);
  }

  /**
   * پل فرم‌های سرور-رندرشده به هستهٔ بررسی: پیام موفقیت/خطا با redirect
   * برگردانده می‌شود تا در صفحهٔ سرور نمایش داده شود (بدون نیاز به کلاینت).
   */
  async function submitReviewAction(formData: FormData): Promise<void> {
    'use server';
    const id = Number(formData.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      redirect('/admin/grade-objections?err=' + encodeURIComponent('اعتراض یافت نشد.'));
    }
    const decision: 'ACCEPTED' | 'REJECTED' =
      String(formData.get('decision') ?? '') === 'REJECTED' ? 'REJECTED' : 'ACCEPTED';
    const note = String(formData.get('reviewNote') ?? '');
    const rawGrade = String(formData.get('newGrade') ?? '').trim();
    const parsedGrade = rawGrade === '' ? null : Number(rawGrade);

    const res = await applyObjectionDecision(id, decision, note, parsedGrade);
    revalidatePath('/admin/grade-objections');
    redirect(
      res.ok
        ? `/admin/grade-objections?ok=${decision === 'ACCEPTED' ? 'accepted' : 'rejected'}`
        : `/admin/grade-objections?err=${encodeURIComponent(res.error ?? 'خطا در ثبت بررسی.')}`,
    );
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-slate-900">اعتراض‌های دانشجویان به نمره</h1>
      </div>

      {okMsg === 'accepted' ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">
          ✓ اعتراض پذیرفته شد و نمرهٔ جدید در کارنامه ثبت شد.
        </p>
      ) : null}
      {okMsg === 'rejected' ? (
        <p className="rounded-xl border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-800">اعتراض رد شد.</p>
      ) : null}
      {errMsg ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-800">⛔ {errMsg}</p>
      ) : null}

      {/* ── صف بررسی ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="font-black text-slate-900 text-sm">
          صف بررسی <span className="text-xs font-normal text-slate-500">({faNum(open.length)} باز)</span>
        </h2>
        {open.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            اعتراض بازی نیست ✅
          </div>
        ) : (
          <div className="space-y-3">
            {open.map(o => (
              <div key={o.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <b className="text-slate-900">{o.studentName}</b>
                  <span className="font-mono text-slate-500" dir="ltr">
                    {o.studentCode}
                  </span>
                  <span className="text-slate-500">· {o.termTitle ?? '—'}</span>
                  <span className="text-slate-500">
                    · {o.courseTitle ?? '—'}{' '}
                    <span className="font-mono" dir="ltr">
                      ({o.courseCode ?? '—'})
                    </span>
                  </span>
                  <span className="text-slate-500">· نمرهٔ ثبت‌شده {faNum(o.gradeAtObjection)}</span>
                  {o.gradeStatus ? (
                    <span className="text-slate-400">· وضعیت نمره: {GRADE_STATUS_FA[o.gradeStatus] ?? o.gradeStatus}</span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{o.requestText}</p>
                <form action={submitReviewAction} className="space-y-2 pt-1">
                  <input type="hidden" name="id" value={o.id} />
                  <textarea
                    name="reviewNote"
                    rows={2}
                    placeholder="یادداشت بررسی (الزامی، حداقل ۳ کاراکتر)…"
                    className="w-full border border-slate-300 rounded-xl px-2 py-1.5 text-sm"
                  />
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-2xs font-bold text-slate-700">
                      <span>نمرهٔ جدید</span>
                      <input
                        name="newGrade"
                        type="number"
                        min={0}
                        max={20}
                        step={0.25}
                        inputMode="decimal"
                        placeholder="۰ تا ۲۰"
                        dir="ltr"
                        className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        name="decision"
                        value="ACCEPTED"
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-sm text-white"
                      >
                        پذیرفته شد (ثبت نمره)
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="REJECTED"
                        formNoValidate
                        className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-700"
                      >
                        وارد نیست (رد)
                      </button>
                    </div>
                  </div>
                  <p className="text-2xs text-slate-500">
                    برای پذیرش، «نمرهٔ جدید» بین ۰ تا ۲۰ الزامی است؛ پس از ثبت، نمرهٔ کارنامه و لاگ ممیزی هم‌زمان
                    به‌روزرسانی می‌شود.
                  </p>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── سوابق ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="font-black text-slate-900 text-sm">سوابق بررسی‌ها</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b">
                <th scope="col" className="p-2 text-right">دانشجو</th>
                <th scope="col" className="p-2 text-right">درس / ترم</th>
                <th scope="col" className="p-2 text-right">متن اعتراض</th>
                <th scope="col" className="p-2 text-right">نمره (پیش → پس)</th>
                <th scope="col" className="p-2">وضعیت</th>
                <th scope="col" className="p-2 text-right">یادداشت کارشناس</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="border-b border-slate-100">
                  <td className="p-2 font-bold whitespace-nowrap">
                    {h.studentName}
                    <div className="font-mono text-3xs text-slate-400" dir="ltr">
                      {h.studentCode ?? ''}
                    </div>
                  </td>
                  <td className="p-2 text-xs text-slate-500 whitespace-nowrap">
                    {h.courseTitle ?? '—'} · {h.termTitle ?? '—'}
                  </td>
                  <td className="p-2 text-xs max-w-64 truncate" title={h.requestText}>
                    {h.requestText}
                  </td>
                  <td className="p-2 text-xs text-slate-700 whitespace-nowrap" dir="ltr">
                    {faNum(h.gradeAtObjection)} → {faNum(h.gradeValue)}
                  </td>
                  <td className="p-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-3xs font-black ${
                        h.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-900'
                          : h.status === 'ACCEPTED'
                            ? 'bg-emerald-100 text-emerald-900'
                            : h.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-900'
                              : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {GRADE_OBJECTION_STATUS_FA[h.status] ?? h.status}
                    </span>
                  </td>
                  <td className="p-2 text-xs text-slate-600">{h.reviewerNote ?? '—'}</td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-xs text-slate-500">
                    سابقه‌ای ثبت نشده است.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
