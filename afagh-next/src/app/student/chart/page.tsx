import { and, asc, eq } from 'drizzle-orm';
import { courses, degree_level_configs, enrollments, majors } from '@/db/schema';
import { db, withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function StudentCurriculumChartPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card p-6 text-center text-slate-500">پروندهٔ دانشجویی یافت نشد.</p>;

  const [major] = me.majorId ? await db.select().from(majors).where(eq(majors.id, me.majorId)).limit(1) : [null];
  const [level] = me.degreeLevelId ? await db.select().from(degree_level_configs).where(eq(degree_level_configs.id, me.degreeLevelId)).limit(1) : [null];

  // سوابق دروس اخذشده دانشجو
  const passedEnrollments = await withUserRls(user.id, tx =>
    tx
      .select({
        courseId: courses.id,
        code: courses.code,
        grade: enrollments.gradeValue,
        status: enrollments.status,
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.offeringId))
      .where(eq(enrollments.studentId, me.id))
  );

  const passedMap = new Map<string, { grade: number | null; status: string }>();
  for (const e of passedEnrollments) {
    passedMap.set(e.code, { grade: e.grade != null ? Number(e.grade) : null, status: e.status });
  }

  // چارت سرفصل دروس بر اساس سرفصل‌های دانشگاه
  const chartData = [
    {
      semester: 1,
      title: 'نیمسال اول (ترم ۱)',
      courses: [
        { code: '1112101', title: 'ریاضی عمومی ۱', units: 3, type: 'پایه', prereq: '—' },
        { code: '1112103', title: 'مبانی برنامه‌نویسی', units: 4, type: 'تخصصی', prereq: '—' },
        { code: '1112105', title: 'آزمایشگاه فیزیک', units: 1, type: 'عمومی', prereq: '—' },
        { code: '1112106', title: 'اندیشه اسلامی ۱', units: 2, type: 'عمومی', prereq: '—' },
        { code: '1112107', title: 'زبان انگلیسی ۱', units: 3, type: 'عمومی', prereq: '—' },
        { code: '1112108', title: 'تربیت بدنی ۱', units: 2, type: 'عمومی', prereq: '—' },
      ],
    },
    {
      semester: 2,
      title: 'نیمسال دوم (ترم ۲ — ترم جاری پیشنهادی)',
      courses: [
        { code: '1112102', title: 'ریاضی عمومی ۲', units: 3, type: 'پایه', prereq: 'ریاضی عمومی ۱' },
        { code: '1112104', title: 'برنامه‌نویسی پیشرفته', units: 3, type: 'تخصصی', prereq: 'مبانی برنامه‌نویسی' },
        { code: '1112201', title: 'ساختمان داده', units: 3, type: 'تخصصی', prereq: 'مبانی برنامه‌نویسی، ریاضی ۱' },
        { code: '1112202', title: 'مفاهیم ابتدایی ریاضیات', units: 3, type: 'پایه', prereq: '—' },
      ],
    },
    {
      semester: 3,
      title: 'نیمسال سوم (ترم ۳)',
      courses: [
        { code: '1112301', title: 'معماری کامپیوتر', units: 3, type: 'تخصصی', prereq: 'برنامه‌نویسی پیشرفته' },
        { code: '1112302', title: 'پایگاه داده', units: 3, type: 'تخصصی', prereq: 'ساختمان داده' },
      ],
    },
    {
      semester: 4,
      title: 'نیمسال چهارم (ترم ۴)',
      courses: [
        { code: '1112303', title: 'شبکه‌های کامپیوتری', units: 3, type: 'تخصصی', prereq: 'معماری کامپیوتر' },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {/* هدر راهنمای چارت */}
      <div className="card !p-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white border-0 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-extrabold">🗺️ چارت تحصیلی و کاتالوگ سرفصل دروس مصوب</h1>
            <p className="text-xs text-emerald-200 mt-0.5">
              رشته: {major?.name || 'مهندسی کامپیوتر'} — مقطع: {level?.title || 'کارشناسی پیوسته'} (مجموع ۱۴۰ واحد)
            </p>
          </div>
          <Link
            href="/student/enroll"
            className="text-xs bg-white text-emerald-900 font-bold px-3 py-2 rounded-xl hover:bg-emerald-50 transition-colors shadow-sm inline-flex items-center gap-1.5"
          >
            <span>🛒</span>
            <span>ورود به انتخاب واحد</span>
          </Link>
        </div>
      </div>

      {/* نمایش ترم‌های چارت */}
      <div className="space-y-4">
        {chartData.map((sem, sIdx) => {
          const semUnits = sem.courses.reduce((sum, c) => sum + c.units, 0);

          return (
            <div key={sIdx} className="card !p-4 bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-800 text-sm">{sem.title}</span>
                  <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                    {semUnits} واحد
                  </span>
                </div>
                {sem.semester === 2 && (
                  <Link
                    href="/student/enroll"
                    className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    ⚡ انتخاب هوشمند این ترم
                  </Link>
                )}
              </div>

              {/* جدول دروس چارت */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <th className="p-2">کد درس</th>
                      <th className="p-2">عنوان درس</th>
                      <th className="p-2 text-center">واحد</th>
                      <th className="p-2">نوع</th>
                      <th className="p-2">پیش‌نیازها</th>
                      <th className="p-2 text-left">وضعیت شما</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sem.courses.map((c, cIdx) => {
                      // وضعیت درس
                      const p = passedMap.get(c.code);
                      const isPassed = p && (p.grade == null ? p.status === 'REGISTERED' : p.grade >= 10 || p.grade === 1);

                      return (
                        <tr key={cIdx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-2 font-mono text-slate-600" dir="ltr">{c.code}</td>
                          <td className="p-2 font-semibold text-slate-900">{c.title}</td>
                          <td className="p-2 text-center font-mono font-bold">{c.units}</td>
                          <td className="p-2 text-slate-600">{c.type}</td>
                          <td className="p-2 text-slate-500">{c.prereq}</td>
                          <td className="p-2 text-left">
                            {isPassed ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                ✅ گذرانده‌شده
                              </span>
                            ) : sem.semester === 2 ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold text-[10px]">
                                ⏳ ترم جاری (پیشنهادی)
                              </span>
                            ) : (
                              <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium text-[10px]">
                                🔒 ترم‌های بعد
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-amber-50/80 p-3.5 text-xs text-amber-900 border border-amber-200">
        💡 <b>راهنمای سرفصل:</b> بر اساس چارت مصوب رشته، در صورت تمایل به اخذ دروس ترم‌های بالاتر، رعایت تمامی پیش‌نیازها و سقف واحدهای ترم الزامی است.
      </div>
    </div>
  );
}
