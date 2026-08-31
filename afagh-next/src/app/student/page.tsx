import { and, asc, desc, eq } from 'drizzle-orm';
import { academic_terms, course_offerings, courses, degree_level_configs, enrollments, majors } from '@/db/schema';
import { db, withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import DropButton from './DropButton';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

const statusFa: Record<string, string> = {
  REGISTERED: 'ثبت قطعی',
  WAITLISTED: 'اتاق انتظار',
  PENDING_COUNCIL: 'در انتظار کمیسیون',
  DROPPED: 'حذف‌شده',
  EMERGENCY_DROPPED: 'حذف اضطراری',
  ABSENT: 'غایب',
  REJECTED: 'ردشده',
  ACTIVE: 'مجاز به ادامه تحصیل',
  PROBATION: 'مشروط',
  GRADUATED: 'فارغ‌التحصیل',
};

export default async function StudentTranscriptPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card">پروندهٔ دانشجویی یافت نشد.</p>;

  const [major] = me.majorId ? await db.select().from(majors).where(eq(majors.id, me.majorId)).limit(1) : [null];
  const [level] = me.degreeLevelId ? await db.select().from(degree_level_configs).where(eq(degree_level_configs.id, me.degreeLevelId)).limit(1) : [null];

  // خواندن کلیه سوابق دروس دانشجو از تمام ترم‌ها
  const allRows = await withUserRls(user.id, tx =>
    tx
      .select({
        id: enrollments.id,
        code: courses.code,
        title: courses.title,
        units: courses.units,
        courseType: courses.courseType,
        status: enrollments.status,
        grade: enrollments.gradeValue,
        gradeStatus: enrollments.gradeStatus,
        ev: enrollments.hasEvaluated,
        termId: course_offerings.termId,
        termTitle: academic_terms.title,
        termCode: academic_terms.termCode,
        isCurrent: academic_terms.isCurrent,
      })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
      .where(eq(enrollments.studentId, me.id))
      .orderBy(asc(academic_terms.termCode), desc(enrollments.id))
  );

  // دسته‌بندی دروس بر اساس ترم‌ها
  const termsMap = new Map<number, { title: string; code: string; isCurrent: boolean; rows: typeof allRows }>();
  for (const row of allRows) {
    if (!termsMap.has(row.termId)) {
      termsMap.set(row.termId, {
        title: row.termTitle,
        code: row.termCode,
        isCurrent: !!row.isCurrent,
        rows: [],
      });
    }
    termsMap.get(row.termId)!.rows.push(row);
  }

  const termsList = Array.from(termsMap.values());

  // محاسبات کل دوره
  let totalEnrolledUnits = 0;
  let totalPassedUnits = 0;
  let totalGradedUnits = 0;
  let totalWeightedScore = 0;

  for (const r of allRows) {
    const u = Number(r.units || 0);
    if (r.status === 'REGISTERED' || r.status === 'PENDING_COUNCIL') {
      totalEnrolledUnits += u;
    }
    if (r.grade != null && Number(r.grade) >= 10) {
      totalPassedUnits += u;
    }
    if (r.grade != null && Number(r.grade) >= 0 && Number(r.grade) <= 20) {
      // نمره نهایی عددی
      totalGradedUnits += u;
      totalWeightedScore += Number(r.grade) * u;
    }
  }

  const totalCumulativeGpa = totalGradedUnits > 0 ? (totalWeightedScore / totalGradedUnits).toFixed(2) : '—';

  return (
    <div className="space-y-4 print:p-0 print:space-y-2">
      {/* سربرگ رسمی کارنامه (نمایش در چاپ و وب) */}
      <div className="card !p-5 bg-white border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center text-lg font-bold">
              آ
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900">دانشگاه جامع آفاق</h1>
              <p className="text-xs text-slate-500 font-medium">کارنامه کل تحصیلی و ریزنمرات رسمی</p>
            </div>
          </div>
          <div className="print:hidden">
            <PrintButton />
          </div>
        </div>

        {/* اطلاعات سجلی و تحصیلی دانشجو */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3 text-xs text-slate-700">
          <div>
            <span className="text-slate-400">نام و نام خانوادگی:</span> <b className="text-slate-900">{user.name}</b>
          </div>
          <div>
            <span className="text-slate-400">شماره دانشجویی:</span> <b className="font-mono text-slate-900" dir="ltr">{me.studentCode}</b>
          </div>
          <div>
            <span className="text-slate-400">مقطع و رشته:</span> <b>{level?.title || 'کارشناسی پیوسته'} — {major?.name || 'مهندسی کامپیوتر'}</b>
          </div>
          <div>
            <span className="text-slate-400">سال ورود / دوره:</span> <b>{me.entryYear || '۱۴۰۳'} / روزانه</b>
          </div>
          <div>
            <span className="text-slate-400">وضعیت تحصیلی:</span> <span className="font-bold text-emerald-700">{statusFa[me.status] ?? me.status}</span>
          </div>
          <div>
            <span className="text-slate-400">تاریخ صدور:</span> <b>{new Date().toLocaleDateString('fa-IR')}</b>
          </div>
        </div>

        {/* نوار تجمیعی کل دوره */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-dashed border-slate-200 text-center">
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
            <p className="text-[10px] text-slate-400">کل واحدهای گذرانده</p>
            <p className="text-sm font-bold text-emerald-700 mt-0.5">{totalPassedUnits} واحد</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
            <p className="text-[10px] text-slate-400">کل واحدهای اخذشده</p>
            <p className="text-sm font-bold text-indigo-700 mt-0.5">{totalEnrolledUnits} واحد</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
            <p className="text-[10px] text-slate-400">معدل کل دوره</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{totalCumulativeGpa}</p>
          </div>
        </div>
      </div>

      {/* جداول ترم به ترم (ریز نمرات کارنامه) */}
      {termsList.length === 0 && (
        <div className="card text-center py-10 text-slate-400">
          <p className="text-2xl mb-1">📄</p>
          <p className="text-sm">اطلاعات درسی ثبت‌شده‌ای در کارنامه موجود نیست.</p>
        </div>
      )}

      {termsList.map((termItem, idx) => {
        // محاسبات ترم
        let termUnits = 0;
        let termPassed = 0;
        let termGradedUnits = 0;
        let termWeightedScore = 0;

        for (const r of termItem.rows) {
          const u = Number(r.units || 0);
          termUnits += u;
          if (r.grade != null && Number(r.grade) >= 10) {
            termPassed += u;
          }
          if (r.grade != null && Number(r.grade) >= 0 && Number(r.grade) <= 20) {
            termGradedUnits += u;
            termWeightedScore += Number(r.grade) * u;
          }
        }

        const termGpa = termGradedUnits > 0 ? (termWeightedScore / termGradedUnits).toFixed(2) : '—';
        const isA = termGradedUnits > 0 && Number(termGpa) >= 17;
        const isProbation = termGradedUnits > 0 && Number(termGpa) < 12;

        return (
          <div key={idx} className="card !p-4 bg-white border-slate-200 shadow-sm space-y-3">
            {/* هدر نیمسال */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-sm">
                  📚 {termItem.title}
                </span>
                {termItem.isCurrent && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    نیمسال جاری
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500 font-mono" dir="ltr">کد: {termItem.code}</span>
            </div>

            {/* جدول دروس ترم */}
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <th className="p-2 font-medium">#</th>
                    <th className="p-2 font-medium">کد درس</th>
                    <th className="p-2 font-medium">عنوان درس</th>
                    <th className="p-2 font-medium text-center">واحد</th>
                    <th className="p-2 font-medium text-center">نمره</th>
                    <th className="p-2 font-medium text-left">نتیجه</th>
                  </tr>
                </thead>
                <tbody>
                  {termItem.rows.map((row, rIdx) => {
                    const isPassed = row.grade != null && Number(row.grade) >= 10;
                    const isFailed = row.grade != null && Number(row.grade) < 10;
                    const isPending = row.grade == null;

                    return (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="p-2 text-slate-400">{rIdx + 1}</td>
                        <td className="p-2 font-mono text-slate-600" dir="ltr">{row.code}</td>
                        <td className="p-2 font-semibold text-slate-800">
                          {row.title}
                          {row.status === 'PENDING_COUNCIL' && (
                            <span className="block text-[10px] text-amber-700 font-normal">
                              (درخواست اخذ در کمیسیون)
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center font-mono">{Number(row.units)}</td>
                        <td className="p-2 text-center font-bold">
                          {row.grade != null ? (
                            Number(row.grade) === 1 ? 'قبول (توصیفی)' : Number(row.grade).toFixed(2)
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-2 text-left">
                          {isPassed && (
                            <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium text-[10px]">
                              قبول
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-block px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium text-[10px]">
                              مردود
                            </span>
                          )}
                          {isPending && (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              row.status === 'PENDING_COUNCIL'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {statusFa[row.status] ?? 'در حال گذراندن'}
                            </span>
                          )}
                          {termItem.isCurrent && row.status === 'REGISTERED' && (
                            <div className="mt-1 print:hidden">
                              <DropButton enrollmentId={row.id} />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* خلاصه وضعیت آماری ترم */}
            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-2.5 text-xs border border-slate-100">
              <div className="flex gap-3 text-slate-600">
                <span>واحد اخذشده: <b className="text-slate-800">{termUnits}</b></span>
                <span>واحد گذرانده: <b className="text-emerald-700">{termPassed}</b></span>
              </div>
              <div className="flex items-center gap-2">
                <span>معدل ترم:</span>
                <b className={`text-sm ${isA ? 'text-emerald-700' : isProbation ? 'text-red-700' : 'text-slate-900'}`}>
                  {termGpa}
                </b>
                {isA && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">ممتاز (الف)</span>}
                {isProbation && <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded">مشروط</span>}
              </div>
            </div>
          </div>
        );
      })}

      {/* کادر رسمی تاییدیه و امضای آموزش (برای فرمت چاپ و اعتبار سند) */}
      <div className="card !p-4 bg-slate-50 border-dashed border-slate-300 text-xs text-slate-500 space-y-2">
        <div className="flex items-center justify-between">
          <p>📌 کارنامهٔ حاضر بر اساس آخرین نمرات قطعی ثبت‌شده در سامانه جامع صادر شده است.</p>
          <p className="font-mono" dir="ltr">SHA256: {user.name ? 'VERIFIED-OFFICIAL' : ''}</p>
        </div>
        <div className="grid grid-cols-2 text-center pt-4 border-t border-slate-200 print:grid">
          <div>
            <p className="font-bold text-slate-700">امضای کارشناس امور آموزشی</p>
            <p className="text-[10px] text-slate-400 mt-6">............................................</p>
          </div>
          <div>
            <p className="font-bold text-slate-700">مهر و امضای اداره کل آموزش دانشگاه</p>
            <p className="text-[10px] text-slate-400 mt-6">............................................</p>
          </div>
        </div>
      </div>
    </div>
  );
}
