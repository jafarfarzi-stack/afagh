import { and, asc, desc, eq } from 'drizzle-orm';
import { academic_terms, course_offerings, courses, degree_level_configs, educational_regulations, enrollments, majors } from '@/db/schema';
import { db, withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { calculateOfficialGPA } from '@/lib/regulations-engine';
import PrintButton from '../PrintButton';

export const dynamic = 'force-dynamic';

const statusFa: Record<string, string> = {
  REGISTERED: 'ثبت قطعی',
  WAITLISTED: 'اتاق انتظار',
  PENDING_COUNCIL: 'در انتظار شورا',
  DROPPED: 'حذف‌شده',
  EMERGENCY_DROPPED: 'حذف اضطراری',
  ABSENT: 'غایب',
  REJECTED: 'مردود',
  ACTIVE: 'مجاز به ادامه تحصیل',
  PROBATION: 'مشروط',
  GRADUATED: 'فارغ‌التحصیل',
};

export default async function StudentTranscriptPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card p-6 text-center text-slate-500">پروندهٔ دانشجویی یافت نشد.</p>;

  const [major] = me.majorId ? await db.select().from(majors).where(eq(majors.id, me.majorId)).limit(1) : [null];
  const [level] = me.degreeLevelId ? await db.select().from(degree_level_configs).where(eq(degree_level_configs.id, me.degreeLevelId)).limit(1) : [null];
  const [reg] = me.regulationId ? await db.select().from(educational_regulations).where(eq(educational_regulations.id, me.regulationId)).limit(1) : [null];

  let regPolicy = 'حذف نمره ردی پس از قبولی (EXCLUDE_IF_PASSED)';
  try {
    if (reg?.rulesConfig) {
      const cfg = typeof reg.rulesConfig === 'string' ? JSON.parse(reg.rulesConfig) : reg.rulesConfig;
      if (cfg.failed_course_gpa_policy === 'KEEP_ALWAYS') {
        regPolicy = 'نگهداری همیشه نمره ردی در معدل (مصوب ۱۳۸۶ تا ۱۳۹۵)';
      } else {
        regPolicy = 'حذف نمره مردودی از معدل کل پس از قبولی (مصوب ۱۳۹۶ به بعد)';
      }
    }
  } catch (_) {}

  // خواندن کلیه سوابق دروس دانشجو از تمام ترم‌ها از مسیر امن RLS
  const allRows = await withUserRls(user.id, tx =>
    tx
      .select({
        id: enrollments.id,
        code: courses.code,
        title: courses.title,
        units: courses.units,
        practicalUnits: courses.practicalUnits,
        courseType: courses.courseType,
        gradingType: courses.gradingType,
        affectsGpa: courses.affectsGpa,
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

  // محاسبه رسمی معدل کل بر اساس موتور آیین‌نامه‌ها
  let officialGpaData = { gpa: 0, totalUnits: 0, passedUnits: 0, excludedCount: 0, policy: 'EXCLUDE_IF_PASSED' };
  try {
    officialGpaData = await calculateOfficialGPA(me.id);
  } catch (err) {
    console.warn('Error calculating official GPA:', err);
  }

  // محاسبات کل دوره
  let totalEnrolledUnits = 0;
  let totalPassedUnits = officialGpaData.passedUnits;
  let totalGradedUnits = officialGpaData.totalUnits;
  let failedUnits = 0;

  for (const r of allRows) {
    const u = Number(r.units || 0);
    if (r.status === 'REGISTERED' || r.status === 'PENDING_COUNCIL') {
      totalEnrolledUnits += u;
    }
    const isDescriptive = r.gradingType === 'DESCRIPTIVE' || Number(r.grade) === 1 || r.affectsGpa === 0;
    if (isDescriptive) {
      if (r.grade != null && Number(r.grade) === 0) failedUnits += u;
    } else {
      if (r.grade != null && Number(r.grade) < 10) failedUnits += u;
    }
  }

  const totalCumulativeGpa = officialGpaData.totalUnits > 0 ? officialGpaData.gpa.toFixed(2) : '—';
  const todayFa = new Date().toLocaleDateString('fa-IR');

  return (
    <div className="space-y-4">
      {/* دکمه چاپ و عملیات بالای سند */}
      <div className="flex items-center justify-between bg-white p-3 px-4 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xl">📜</span>
          <div>
            <h2 className="text-sm font-bold text-slate-800">کارنامه کل تحصیلی (نسخه رسمی اداری)</h2>
            <p className="text-xs text-slate-500">مشاهده ریزنمرات، محاسبه صحیح دروس توصیفی و استناد به آیین‌نامه</p>
          </div>
        </div>
        <PrintButton />
      </div>

      {/* سند رسمی کارنامه (کاغذ رسمی کارنامه دانشگاهی) */}
      <div className="bg-white text-slate-900 border-2 border-slate-800 p-5 sm:p-8 shadow-xl print:shadow-none print:border print:m-0 print:p-4 text-xs font-sans">
        
        {/* ۱. سربرگ سه‌بخشی رسمی دانشگاه */}
        <div className="border-b-2 border-slate-800 pb-4 mb-4">
          <div className="grid grid-cols-3 items-center text-center">
            {/* ستون راست */}
            <div className="text-right space-y-1">
              <p className="font-bold text-slate-800">جمهوری اسلامی ایران</p>
              <p className="font-semibold text-slate-700">وزارت علوم، تحقیقات و فناوری</p>
              <p className="font-extrabold text-slate-900 text-sm">دانشگاه جامع آفاق</p>
              <p className="text-[11px] text-slate-500">معاونت آموزشی و تحصیلات تکمیلی</p>
            </div>

            {/* ستون وسط (نشان و عنوان سند) */}
            <div className="flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full border-2 border-slate-800 flex items-center justify-center font-bold text-xl text-slate-800 mb-1">
                آفاق
              </div>
              <h1 className="text-base font-black tracking-wide text-slate-950 border-b border-slate-800 pb-0.5 px-4">
                کارنامه کل تحصیلی دانشجو
              </h1>
              <p className="text-[10px] text-slate-600 mt-0.5">ریزنمرات قطعی دوره‌های آموزشی</p>
            </div>

            {/* ستون چپ (اطلاعات سند) */}
            <div className="text-left space-y-1 font-mono text-[11px]">
              <p><span className="font-sans text-slate-500">شماره پرونده: </span><b>{me.studentCode}</b></p>
              <p><span className="font-sans text-slate-500">تاریخ صدور: </span><b>{todayFa}</b></p>
              <p><span className="font-sans text-slate-500">صفحه: </span><b>۱ از ۱</b></p>
              <p><span className="font-sans text-slate-500">وضعیت: </span><b className="text-emerald-800 font-sans">{statusFa[me.status] ?? me.status}</b></p>
            </div>
          </div>
        </div>

        {/* ۲. جدول مشخصات هویتی، آموزشی و آیین‌نامه اجرایی */}
        <div className="border border-slate-800 mb-5 overflow-hidden">
          <div className="bg-slate-100 px-3 py-1 font-bold text-slate-900 border-b border-slate-800 text-[11px]">
            مشخصات فردی، تحصیلی و آیین‌نامه ملاک عمل
          </div>
          <table className="w-full text-right text-[11px] border-collapse">
            <tbody>
              <tr className="border-b border-slate-300">
                <td className="p-1.5 bg-slate-50 font-medium text-slate-600 w-1/6 border-l border-slate-300">نام و نام خانوادگی:</td>
                <td className="p-1.5 font-bold text-slate-900 w-2/6 border-l border-slate-300">{user.name}</td>
                <td className="p-1.5 bg-slate-50 font-medium text-slate-600 w-1/6 border-l border-slate-300">شماره دانشجویی:</td>
                <td className="p-1.5 font-bold font-mono text-slate-900 w-2/6" dir="ltr">{me.studentCode}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="p-1.5 bg-slate-50 font-medium text-slate-600 border-l border-slate-300">کد ملی:</td>
                <td className="p-1.5 font-mono text-slate-900 border-l border-slate-300" dir="ltr">۱۰۱۰۱۰۱۰۱۰</td>
                <td className="p-1.5 bg-slate-50 font-medium text-slate-600 border-l border-slate-300">مقطع تحصیلی:</td>
                <td className="p-1.5 font-semibold text-slate-900">{level?.title || 'کارشناسی پیوسته'}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="p-1.5 bg-slate-50 font-medium text-slate-600 border-l border-slate-300">رشته تحصیلی:</td>
                <td className="p-1.5 font-bold text-slate-900 border-l border-slate-300">{major?.name || 'مهندسی کامپیوتر'}</td>
                <td className="p-1.5 bg-slate-50 font-medium text-slate-600 border-l border-slate-300">سال ورود / دوره:</td>
                <td className="p-1.5 font-semibold text-slate-900">{me.entryYear || '۱۴۰۳'} / روزانه</td>
              </tr>
              <tr>
                <td className="p-1.5 bg-slate-50 font-medium text-slate-600 border-l border-slate-300">آیین‌نامه ملاک عمل:</td>
                <td colSpan={3} className="p-1.5 font-semibold text-slate-900">
                  <span className="text-indigo-950 font-bold">{reg?.title || 'آیین‌نامه آموزشی دوره کارشناسی مصوب ۱۴۰۳'}</span>
                  <span className="text-slate-500 text-[10px] mr-2">({regPolicy})</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ۳. ریزنمرات به تفکیک نیمسال‌های تحصیلی */}
        <div className="space-y-5">
          {termsList.length === 0 && (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-300">
              هنوز درسی در پرونده کارنامه ثبت نشده است.
            </div>
          )}

          {termsList.map((termItem, idx) => {
            let termUnits = 0;
            let termPassed = 0;
            let termGradedUnits = 0;
            let termWeightedScore = 0;

            for (const r of termItem.rows) {
              const u = Number(r.units || 0);
              termUnits += u;

              const isDescriptive = r.gradingType === 'DESCRIPTIVE' || Number(r.grade) === 1 || r.affectsGpa === 0;

              if (isDescriptive) {
                if (Number(r.grade) === 1 || (r.grade != null && Number(r.grade) >= 10)) {
                  termPassed += u;
                }
              } else {
                if (r.grade != null && Number(r.grade) >= 10) {
                  termPassed += u;
                }
                if (r.grade != null && Number(r.grade) >= 0 && Number(r.grade) <= 20) {
                  termGradedUnits += u;
                  termWeightedScore += Number(r.grade) * u;
                }
              }
            }

            const termGpa = termGradedUnits > 0 ? (termWeightedScore / termGradedUnits).toFixed(2) : '—';
            const isA = termGradedUnits > 0 && Number(termGpa) >= 17;
            const isProbation = termGradedUnits > 0 && Number(termGpa) < 12;

            return (
              <div key={idx} className="border border-slate-700 overflow-hidden">
                {/* هدر نیمسال */}
                <div className="bg-slate-200/90 px-3 py-1.5 flex items-center justify-between border-b border-slate-700 font-bold">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-950">📚 نیمسال تحصیلی: {termItem.title}</span>
                    {termItem.isCurrent && (
                      <span className="text-[10px] bg-emerald-700 text-white font-bold px-2 py-0.2 rounded">
                        ترم جاری
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-slate-700" dir="ltr">کد نیمسال: {termItem.code}</span>
                </div>

                {/* جدول دروس */}
                <table className="w-full text-right text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-700 font-bold text-slate-800">
                      <th className="p-1.5 border-l border-slate-300 text-center w-8">ردیف</th>
                      <th className="p-1.5 border-l border-slate-300 text-center w-24">کد درس</th>
                      <th className="p-1.5 border-l border-slate-300">نام درس</th>
                      <th className="p-1.5 border-l border-slate-300 text-center w-16">نوع درس</th>
                      <th className="p-1.5 border-l border-slate-300 text-center w-12">نظری</th>
                      <th className="p-1.5 border-l border-slate-300 text-center w-12">عملی</th>
                      <th className="p-1.5 border-l border-slate-300 text-center w-12">کل واحد</th>
                      <th className="p-1.5 border-l border-slate-300 text-center w-20">نمره</th>
                      <th className="p-1.5 text-center w-24">نتیجه نهایی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termItem.rows.map((row, rIdx) => {
                      const isDescriptive = row.gradingType === 'DESCRIPTIVE' || Number(row.grade) === 1 || row.affectsGpa === 0;
                      const isPassed = isDescriptive
                        ? (Number(row.grade) === 1 || (row.grade != null && Number(row.grade) >= 10))
                        : (row.grade != null && Number(row.grade) >= 10);
                      const isFailed = isDescriptive
                        ? (row.grade != null && Number(row.grade) === 0)
                        : (row.grade != null && Number(row.grade) < 10);
                      const isPending = row.grade == null;
                      const totalU = Number(row.units || 0);
                      const prU = Number(row.practicalUnits || 0);
                      const thU = Math.max(0, totalU - prU);

                      return (
                        <tr key={row.id} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="p-1.5 border-l border-slate-200 text-center text-slate-600">{rIdx + 1}</td>
                          <td className="p-1.5 border-l border-slate-200 text-center font-mono" dir="ltr">{row.code}</td>
                          <td className="p-1.5 border-l border-slate-200 font-semibold text-slate-900">
                            {row.title}
                            {row.status === 'PENDING_COUNCIL' && (
                              <span className="mr-2 text-[10px] text-amber-700 font-normal">
                                [درخواست شورا]
                              </span>
                            )}
                          </td>
                          <td className="p-1.5 border-l border-slate-200 text-center text-slate-700">
                            {row.courseType === 'GENERAL' ? 'عمومی' : row.courseType === 'BASIC' ? 'پایه' : 'تخصصی'}
                          </td>
                          <td className="p-1.5 border-l border-slate-200 text-center font-mono">{thU}</td>
                          <td className="p-1.5 border-l border-slate-200 text-center font-mono">{prU}</td>
                          <td className="p-1.5 border-l border-slate-200 text-center font-bold font-mono">{totalU}</td>
                          <td className="p-1.5 border-l border-slate-200 text-center font-black text-slate-900">
                            {row.grade != null ? (
                              isDescriptive ? (
                                <span className="text-emerald-800 text-[11px]">قبول (توصیفی)</span>
                              ) : (
                                Number(row.grade).toFixed(2)
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-1.5 text-center font-bold">
                            {isPassed && <span className="text-emerald-700">قبول</span>}
                            {isFailed && <span className="text-red-700">مردود</span>}
                            {isPending && (
                              <span className="text-slate-500 font-normal">
                                {row.status === 'PENDING_COUNCIL' ? 'در انتظار شورا' : 'در حال گذراندن'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* خلاصه وضعیت آماری انتهای هر ترم */}
                <div className="bg-slate-100 p-2 px-3 border-t border-slate-700 flex items-center justify-between font-bold text-[11px] text-slate-800">
                  <div className="flex gap-4">
                    <span>واحدهای اخذشده: <b className="text-slate-950 font-mono">{termUnits}</b></span>
                    <span>واحدهای گذرانده: <b className="text-emerald-800 font-mono">{termPassed}</b></span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>معدل نیمسال: <b className="text-slate-950 text-xs font-mono">{termGpa}</b></span>
                    <span>وضعیت ترم: {isA ? <b className="text-emerald-800">ممتاز (الف)</b> : isProbation ? <b className="text-red-700">مشروط</b> : <b>عادی</b>}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ۴. جدول وضعیت تجمیعی کل دوره تحصیلی */}
        <div className="border-2 border-slate-800 mt-6 overflow-hidden">
          <div className="bg-slate-800 text-white px-3 py-1 font-bold text-center text-xs">
            خلاصه وضعیت تحصیلی کل دوره تا تاریخ صدور کارنامه
          </div>
          <table className="w-full text-center text-[11px] border-collapse font-bold">
            <tbody>
              <tr className="bg-slate-100 border-b border-slate-400 text-slate-700">
                <td className="p-2 border-l border-slate-300">کل واحدهای اخذشده</td>
                <td className="p-2 border-l border-slate-300">کل واحدهای گذرانده</td>
                <td className="p-2 border-l border-slate-300">کل واحدهای مردودی</td>
                <td className="p-2 border-l border-slate-300">واحدهای مؤثر در معدل</td>
                <td className="p-2 border-l border-slate-300 bg-slate-200 text-slate-950">معدل کل دوره (GPA)</td>
                <td className="p-2">وضعیت نهایی دانشجو</td>
              </tr>
              <tr className="text-slate-950 text-xs font-mono">
                <td className="p-2 border-l border-slate-300">{totalEnrolledUnits} واحد</td>
                <td className="p-2 border-l border-slate-300 text-emerald-800">{totalPassedUnits} واحد</td>
                <td className="p-2 border-l border-slate-300 text-red-700">{failedUnits} واحد</td>
                <td className="p-2 border-l border-slate-300">{totalGradedUnits} واحد</td>
                <td className="p-2 border-l border-slate-300 bg-emerald-50 text-emerald-950 font-black text-sm">
                  {totalCumulativeGpa}
                </td>
                <td className="p-2 font-sans font-bold text-emerald-800">
                  {statusFa[me.status] ?? me.status}
                </td>
              </tr>
            </tbody>
          </table>
          {officialGpaData.excludedCount > 0 && (
            <div className="bg-emerald-50 px-3 py-1.5 border-t border-emerald-200 text-[10px] text-emerald-900 font-medium flex items-center justify-between">
              <span>✨ تعداد <b>{officialGpaData.excludedCount} نمره مردودی</b> پس از قبولی مجدد در درس، طبق مصوبه آیین‌نامه (EXCLUDE_IF_PASSED) از مخرج و صورت معدل کل کسر گردید.</span>
              <span className="font-bold text-emerald-950">آیین‌نامه ملاک عمل</span>
            </div>
          )}
        </div>

        {/* ۵. متن حقوقی سند و محل امضا و مهرهای رسمی */}
        <div className="mt-6 pt-3 border-t border-slate-400 text-[10px] text-slate-600 space-y-4">
          <p className="leading-relaxed">
            <b>تذکر مهم:</b> این کارنامه صرفاً جهت اطلاع از وضعیت تحصیلی دانشجو صادر گردیده و هرگونه خط‌خوردگی یا تغییر در مندرجات آن، سند را از درجه اعتبار ساقط می‌نماید. نمرات دروس توصیفی در مخرج معدل عددی لحاظ نمی‌شوند.
          </p>

          <div className="grid grid-cols-3 text-center pt-6 pb-4 font-bold text-slate-800">
            <div>
              <p>کارشناس امور آموزشی و بایگانی</p>
              <div className="h-12 flex items-end justify-center text-[9px] text-slate-400">
                (امضا و تاریخ)
              </div>
            </div>
            <div>
              <p>محل مهر اداره کل آموزش دانشگاه</p>
              <div className="w-16 h-16 rounded-full border border-dashed border-slate-400 mx-auto mt-2 flex items-center justify-center text-[9px] text-slate-400">
                محل مهر
              </div>
            </div>
            <div>
              <p>مدیر کل امور آموزشی و تحصیلات تکمیلی</p>
              <div className="h-12 flex items-end justify-center text-[9px] text-slate-400">
                (امضا و تأیید نهایی)
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
