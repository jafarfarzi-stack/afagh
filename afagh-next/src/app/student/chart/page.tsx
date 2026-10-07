import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  course_offerings,
  course_rules,
  courses,
  curriculum_courses,
  curriculum_versions,
  degree_level_configs,
  enrollments,
  majors,
} from '@/db/schema';
import { db, withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { currentTermFor } from '@/lib/terms';
import { getTermScope } from '@/lib/term-scope';
import TermFilterChip from '@/components/TermFilterChip';
import TermAutoScroll from '@/components/TermAutoScroll';
import { resolveApplicableCurriculum, type ResolvableVersion } from '@/lib/curriculum-resolution';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const roleFa: Record<string, string> = {
  CORE: 'اصلی',
  MAJOR: 'تخصصی',
  ELECTIVE: 'اختیاری',
  GENERAL: 'عمومی',
  THESIS: 'پایان‌نامه',
  INTERNSHIP: 'کارآموزی',
  WORKSHOP: 'کارگاهی',
};

const semesterTitle: Record<number, string> = {
  1: 'نیمسال اول (ترم ۱)',
  2: 'نیمسال دوم (ترم ۲)',
  3: 'نیمسال سوم (ترم ۳)',
  4: 'نیمسال چهارم (ترم ۴)',
  5: 'نیمسال پنجم (ترم ۵)',
  6: 'نیمسال ششم (ترم ۶)',
  7: 'نیمسال هفتم (ترم ۷)',
  8: 'نیمسال هشتم (ترم ۸)',
  9: 'ترم تابستان',
};

function prereqCodes(logicTree: string): string[] {
  try {
    const root = JSON.parse(logicTree);
    const out: string[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      for (const cond of node.conditions ?? []) {
        if (cond.course) out.push(String(cond.course));
        else if (cond.conditions) walk(cond);
      }
    };
    walk(root);
    return out;
  } catch {
    return [];
  }
}

export default async function StudentCurriculumChartPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card p-6 text-center text-slate-500">پروندهٔ دانشجویی یافت نشد.</p>;

  const [major] = me.majorId ? await db.select().from(majors).where(eq(majors.id, me.majorId)).limit(1) : [null];
  const [level] = me.degreeLevelId ? await db.select().from(degree_level_configs).where(eq(degree_level_configs.id, me.degreeLevelId)).limit(1) : [null];
  const termScope = await getTermScope(me.universityId);
  const filteredTerm = termScope.selectedId
    ? termScope.terms.find(t => t.id === termScope.selectedId) ?? null
    : null;
  const term = filteredTerm ?? (await currentTermFor(me.universityId));

  const enrollmentRows = await withUserRls(user.id, tx =>
    tx
      .select({
        courseId: courses.id,
        code: courses.code,
        units: courses.units,
        gradingType: courses.gradingType,
        affectsGpa: courses.affectsGpa,
        minPassedMark: courses.minPassedMark,
        grade: enrollments.gradeValue,
        status: enrollments.status,
        termId: course_offerings.termId,
      })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(eq(enrollments.studentId, me.id))
  );

  const passedCourseIds = new Set<number>();
  const currentTermCourseIds = new Set<number>();
  for (const r of enrollmentRows) {
    const isDescriptive = r.gradingType === 'DESCRIPTIVE' || r.affectsGpa === 0;
    const minMark = Number(r.minPassedMark ?? 10);
    const grade = r.grade != null ? Number(r.grade) : null;
    const passed =
      r.status === 'EQUIV_PASSED' || (grade != null && (isDescriptive ? grade !== 0 : grade >= minMark));
    if (passed) passedCourseIds.add(r.courseId);
    if (term && r.termId === term.id && r.status !== 'DROPPED') currentTermCourseIds.add(r.courseId);
  }

  const versionRows = me.majorId
    ? await db
        .select({
          id: curriculum_versions.id,
          majorId: curriculum_versions.majorId,
          degreeLevelId: curriculum_versions.degreeLevelId,
          trackId: curriculum_versions.trackId,
          versionCode: curriculum_versions.versionCode,
          status: curriculum_versions.status,
          entryYearFrom: curriculum_versions.entryYearFrom,
          entryYearTo: curriculum_versions.entryYearTo,
        })
        .from(curriculum_versions)
        .where(
          me.universityId
            ? and(
                eq(curriculum_versions.majorId, me.majorId),
                eq(curriculum_versions.universityId, me.universityId)
              )
            : eq(curriculum_versions.majorId, me.majorId)
        )
    : [];

  const resolution = me.majorId
    ? resolveApplicableCurriculum(versionRows as ResolvableVersion[], {
        majorId: me.majorId,
        degreeLevelId: me.degreeLevelId,
        trackId: null,
        entryYear: me.entryYear,
      })
    : null;

  const version = resolution?.version ?? null;
  const versionFull = version
    ? (await db.select().from(curriculum_versions).where(eq(curriculum_versions.id, version.id)).limit(1))[0] ?? null
    : null;

  const chartRows = version
    ? await db
        .select({
          id: curriculum_courses.id,
          courseId: courses.id,
          code: courses.code,
          title: courses.title,
          units: courses.units,
          chartUnits: curriculum_courses.units,
          roleType: curriculum_courses.roleType,
          recommendedSemester: curriculum_courses.recommendedSemester,
        })
        .from(curriculum_courses)
        .innerJoin(courses, eq(courses.id, curriculum_courses.courseId))
        .where(eq(curriculum_courses.curriculumVersionId, version.id))
        .orderBy(asc(curriculum_courses.recommendedSemester), asc(courses.code))
    : [];

  const prereqRows = version && chartRows.length > 0
    ? await db
        .select({ courseId: course_rules.courseId, logicTree: course_rules.logicTree })
        .from(course_rules)
        .where(
          and(
            eq(course_rules.ruleType, 'PREREQ'),
            inArray(course_rules.courseId, chartRows.map(r => r.courseId))
          )
        )
    : [];

  const prereqMap = new Map<number, string[]>();
  for (const p of prereqRows) prereqMap.set(p.courseId, prereqCodes(p.logicTree));

  const semesterGroups = new Map<number, typeof chartRows>();
  let chartUnitsTotal = 0;
  for (const r of chartRows) {
    const u = Number(r.chartUnits ?? r.units ?? 0);
    chartUnitsTotal += u;
    const key = r.recommendedSemester ?? 0;
    if (!semesterGroups.has(key)) semesterGroups.set(key, []);
    semesterGroups.get(key)!.push(r);
  }
  const semesterKeys = Array.from(semesterGroups.keys()).sort((a, b) => a - b);

  const requiredUnits = versionFull ? Number(versionFull.totalRequiredUnits ?? 0) : 0;
  const currentSemesters = new Set(
    chartRows.filter(r => currentTermCourseIds.has(r.courseId)).map(r => r.recommendedSemester ?? 0)
  );
  const currentSemesterNo = currentSemesters.size > 0 ? Math.min(...currentSemesters) : null;
  const highlightSemesters = filteredTerm ? currentSemesters : new Set<number>();
  const highlightAnchor = filteredTerm && currentSemesters.size > 0
    ? `afagh-term-sem-${Math.min(...currentSemesters)}`
    : null;

  return (
    <div className="space-y-4">
      <TermAutoScroll targetId={highlightAnchor} />
      {filteredTerm && (
        <TermFilterChip title={filteredTerm.title} universityId={me.universityId ?? null} />
      )}
      {/* هدر راهنمای چارت */}
      <div className="card !p-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white border-0 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-extrabold">🗺️ چارت تحصیلی و کاتالوگ سرفصل دروس مصوب</h1>
            <p className="text-xs text-emerald-200 mt-0.5">
              رشته: {major?.name || '—'} — مقطع: {level?.title || '—'}
              {versionFull
                ? ` — نسخهٔ ${versionFull.versionCode} (${chartUnitsTotal} واحد در سرفصل${requiredUnits ? ` / ${requiredUnits} واحد الزامی` : ''})`
                : ''}
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

      {chartRows.length === 0 ? (
        <div className="card p-6 text-center space-y-2">
          <p className="text-sm font-bold text-slate-700">چارت برای این دانشجو تعریف نشده است.</p>
          <p className="text-xs text-slate-500">
            نسخهٔ برنامهٔ درسیِ منتشرشده‌ای برای رشته و مقطع شما (سال ورود {me.entryYear}) ثبت نشده است؛ به همین دلیل فهرست دروس و واحدهای مصوب نمایش داده نمی‌شود.
          </p>
          <p className="text-xs text-slate-500">
            سوابق واقعی دروس اخذشدهٔ شما: {enrollmentRows.length} عنوان درسی در کارنامه ثبت شده است.
          </p>
        </div>
      ) : (
        <>
          {filteredTerm && currentSemesters.size === 0 && (
            <p className="card p-4 text-center text-xs text-slate-500">
              در نیمسال «{filteredTerm.title}» هیچ درسی برای شما اخذ ثبت نشده است؛ بلوکی از چارت به این نیمسال برجسته نمی‌شود.
            </p>
          )}
          <div className="space-y-4">
            {semesterKeys.map((semKey) => {
              const sem = semesterGroups.get(semKey)!;
              const semUnits = sem.reduce((sum, c) => sum + Number(c.chartUnits ?? c.units ?? 0), 0);
              const isCurrentSemester = currentSemesters.has(semKey);
              const isHighlighted = highlightSemesters.has(semKey);
              const title =
                semKey === 0
                  ? 'دروس بدون ترم پیشنهادی'
                  : semesterTitle[semKey] ?? `ترم ${semKey}`;

              return (
                <div
                  key={semKey}
                  id={`afagh-term-sem-${semKey}`}
                  className={`card !p-4 bg-white shadow-sm space-y-3 scroll-mt-24 ${
                    isHighlighted
                      ? 'border-2 border-emerald-500 ring-2 ring-emerald-200'
                      : 'border border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-800 text-sm">{title}</span>
                      <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                        {semUnits} واحد
                      </span>
                      {isHighlighted && (
                        <span className="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded">
                          نیمسال انتخابی: {filteredTerm?.title}
                        </span>
                      )}
                    </div>
                    {isCurrentSemester && (
                      <Link
                        href="/student/enroll"
                        className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        ⚡ انتخاب هوشمند این ترم
                      </Link>
                    )}
                  </div>

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
                        {sem.map(c => {
                          const isPassed = passedCourseIds.has(c.courseId);
                          const isInProgress = !isPassed && currentTermCourseIds.has(c.courseId);
                          const isPastSemester =
                            currentSemesterNo != null && semKey > 0 && semKey < currentSemesterNo;

                          return (
                            <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="p-2 font-mono text-slate-600" dir="ltr">{c.code}</td>
                              <td className="p-2 font-semibold text-slate-900">{c.title}</td>
                              <td className="p-2 text-center font-mono font-bold">{Number(c.chartUnits ?? c.units ?? 0)}</td>
                              <td className="p-2 text-slate-600">{roleFa[c.roleType] || c.roleType}</td>
                              <td className="p-2 text-slate-500">{(prereqMap.get(c.courseId) ?? []).join('، ') || '—'}</td>
                              <td className="p-2 text-left">
                                {isPassed ? (
                                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                    ✅ گذرانده‌شده
                                  </span>
                                ) : isInProgress ? (
                                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold text-[10px]">
                                    ⏳ در حال گذران (ترم جاری)
                                  </span>
                                ) : isPastSemester ? (
                                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                                    ✗ اخذ‌نشده (ترم گذشته)
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
        </>
      )}
    </div>
  );
}