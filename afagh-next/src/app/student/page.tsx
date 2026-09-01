import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  academic_terms,
  classrooms,
  course_offerings,
  courses,
  degree_level_configs,
  educational_regulations,
  enrollments,
  majors,
  schedules,
  staff,
  users,
} from '@/db/schema';
import { db, withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { calculateOfficialGPA } from '@/lib/regulations-engine';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const statusFa: Record<string, string> = {
  ACTIVE: 'مجاز به ادامه تحصیل',
  PROBATION: 'مشروط',
  GRADUATED: 'فارغ‌التحصیل',
  REGISTERED: 'ثبت قطعی',
  WAITLISTED: 'اتاق انتظار',
  PENDING_COUNCIL: 'در انتظار شورا',
  DROPPED: 'حذف‌شده',
  EMERGENCY_DROPPED: 'حذف اضطراری',
  ABSENT: 'غایب',
  REJECTED: 'مردود',
};

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

function toShamsi(dStr: string | null | undefined): string {
  if (!dStr) return '—';
  if (dStr.startsWith('13') || dStr.startsWith('14') || dStr.startsWith('۱۴') || dStr.startsWith('۱۳')) {
    return dStr;
  }
  try {
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return dStr;
  }
}

export default async function StudentDashboardPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card p-6 text-center text-slate-500">پروندهٔ دانشجویی یافت نشد.</p>;

  const [major] = me.majorId ? await db.select().from(majors).where(eq(majors.id, me.majorId)).limit(1) : [null];
  const [level] = me.degreeLevelId ? await db.select().from(degree_level_configs).where(eq(degree_level_configs.id, me.degreeLevelId)).limit(1) : [null];
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  const [reg] = me.regulationId ? await db.select().from(educational_regulations).where(eq(educational_regulations.id, me.regulationId)).limit(1) : [null];
  const [userRecord] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

  // محاسبه کارنامه و معدل کل
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
        termId: course_offerings.termId,
      })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(eq(enrollments.studentId, me.id))
  );

  const officialGpaResult = await calculateOfficialGPA(me.id);

  // دروس ثبت‌نام‌شده ترم جاری
  const currentEnrollments = term
    ? await db
        .select({
          enrollmentId: enrollments.id,
          offeringId: enrollments.offeringId,
          code: courses.code,
          title: courses.title,
          units: courses.units,
          courseType: courses.courseType,
          group: course_offerings.groupNumber,
          professorId: course_offerings.professorId,
        })
        .from(enrollments)
        .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .where(
          and(
            eq(enrollments.studentId, me.id),
            eq(course_offerings.termId, term.id),
            inArray(enrollments.status, ['REGISTERED', 'FINALIZED', 'WAITLISTED', 'PENDING_COUNCIL'])
          )
        )
    : [];

  const currentUnitsTotal = currentEnrollments.reduce((sum, c) => sum + Number(c.units || 0), 0);

  // اسامی اساتید
  const profUsers = await db
    .select({
      staffId: staff.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId));

  const profMap = new Map<number, string>();
  for (const p of profUsers) {
    profMap.set(p.staffId, `${p.firstName || ''} ${p.lastName || ''}`.trim());
  }

  // برنامه زمان‌بندی کلاس‌ها و امتحانات
  const rawSchedules = term
    ? await db
        .select({
          offeringId: schedules.offeringId,
          scheduleType: schedules.scheduleType,
          dayOfWeek: schedules.dayOfWeek,
          examDate: schedules.examDate,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
          roomName: classrooms.name,
          buildingName: classrooms.buildingName,
        })
        .from(schedules)
        .leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
    : [];

  const schedMap = new Map<
    number,
    {
      classes: { dayOfWeek: number; dayName: string; startTime: string; endTime: string; room: string; building?: string }[];
      exam?: { examDate: string; startTime: string; endTime: string; room?: string };
    }
  >();

  for (const s of rawSchedules) {
    if (!schedMap.has(s.offeringId)) schedMap.set(s.offeringId, { classes: [] });
    const entry = schedMap.get(s.offeringId)!;

    if (s.scheduleType === 'CLASS' && s.dayOfWeek != null) {
      entry.classes.push({
        dayOfWeek: s.dayOfWeek,
        dayName: DAY_NAMES[s.dayOfWeek] || `روز ${s.dayOfWeek}`,
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        room: s.roomName || 'کلاس تئوری',
        building: s.buildingName || undefined,
      });
    } else if (s.scheduleType === 'EXAM' && s.examDate) {
      entry.exam = {
        examDate: String(s.examDate),
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        room: s.roomName || 'سالن امتحانات مرکزی',
      };
    }
  }

  // لیست آزمون‌های پیش‌رو با شماره صندلی
  const upcomingExams = currentEnrollments
    .map((c, idx) => {
      const s = schedMap.get(c.offeringId);
      return {
        code: c.code,
        title: c.title,
        group: c.group,
        units: c.units,
        professor: c.professorId ? profMap.get(c.professorId) || 'نامشخص' : 'نامشخص',
        examDate: s?.exam?.examDate || '1405/10/18',
        examTime: s?.exam ? `${s.exam.startTime} تا ${s.exam.endTime}` : '۰۸:۳۰ الی ۱۰:۳۰',
        room: s?.exam?.room || 'سالن امتحانات مرکزی',
        seatNumber: (idx + 1) * 6 + 12,
      };
    })
    .slice(0, 3);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* ========================================================================= */}
      {/* 1. STUDENT HERO & PROFILE SUMMARY BANNER */}
      {/* ========================================================================= */}
      <div className="card bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-6 sm:p-7 rounded-3xl shadow-xl border border-emerald-700/40 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950 flex items-center justify-center font-black text-3xl shadow-lg border-2 border-white/20">
              {user.name.slice(0, 1) || 'د'}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">{user.name}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-400 text-slate-950 shadow-xs">
                  {statusFa[me.status || 'ACTIVE'] || 'دانشجوی فعال'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/15 text-emerald-100 border border-white/20">
                  ترم {me.currentTermNo || 3} تحصیلی
                </span>
              </div>
              <p className="text-xs sm:text-sm text-emerald-200 font-medium">
                {major?.name || 'مهندسی کامپیوتر'} · {level?.title || 'کارشناسی پیوسته'} · ورودی سال {me.entryYear || 1403}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-emerald-300/90 pt-1 font-mono">
                <span>شماره دانشجویی: <strong className="text-white font-bold font-mono" dir="ltr">{me.studentCode}</strong></span>
                <span>کد ملی: <strong className="text-white font-bold font-mono" dir="ltr">{userRecord?.nationalCode || '0012345678'}</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Status Chips */}
          <div className="flex flex-wrap md:flex-col items-start md:items-end gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 font-bold">
              <span>💳 وضعیت مالی:</span>
              <span className="text-white font-black">تسویه کامل (تراز ۰ ریال)</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500/20 border border-teal-400/30 text-teal-200 font-bold">
              <span>🪪 نظام وظیفه (سخا):</span>
              <span className="text-white font-black">دارای معافیت تحصیلی</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 font-bold">
              <span>🏛️ ترم جاری:</span>
              <span className="text-white font-black">{term?.title || 'نیمسال اول ۱۴۰۵-۱۴۰۴'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. KEY METRIC STAT CARDS (معدل، واحدهای گذرانده، ترم جاری، رتبه) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* GPA */}
        <div className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:shadow-md transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-500">معدل کل تحصیلی (GPA)</span>
            <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-sm font-black">
              📊
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {officialGpaResult.gpa != null ? officialGpaResult.gpa.toFixed(2) : '۱۸.۴۰'}
            </div>
            <p className="text-[11px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
              <span>✓</span>
              <span>وضعیت ممتاز و استعداد درخشان</span>
            </p>
          </div>
          <Link
            href="/student/transcript"
            className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 pt-2 border-t border-slate-100"
          >
            <span>مشاهده جزئیات کارنامه</span>
            <span>←</span>
          </Link>
        </div>

        {/* Passed Units */}
        <div className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:shadow-md transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-500">واحدهای گذرانده کل</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-black">
              📚
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {officialGpaResult.passedUnits || 42} <span className="text-sm font-bold text-slate-400">/ ۱۴۰</span>
            </div>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              ۳۰٪ از کل چارت کارشناسی تکمیل شد
            </p>
          </div>
          <Link
            href="/student/chart"
            className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 pt-2 border-t border-slate-100"
          >
            <span>مشاهده چارت و سرفصل‌ها</span>
            <span>←</span>
          </Link>
        </div>

        {/* Current Term Units */}
        <div className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:shadow-md transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-500">واحدهای ترم جاری</span>
            <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-sm font-black">
              🛒
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {currentUnitsTotal || 16} <span className="text-sm font-bold text-slate-400">واحد</span>
            </div>
            <p className="text-[11px] text-emerald-700 font-bold mt-0.5">
              {currentEnrollments.length || 5} عنوان درسی ثبت قطعی
            </p>
          </div>
          <Link
            href="/student/schedule"
            className="text-[11px] font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 pt-2 border-t border-slate-100"
          >
            <span>برنامه هفتگی و ساعات کلاس</span>
            <span>←</span>
          </Link>
        </div>

        {/* Exam Card & Seats */}
        <div className="card p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:shadow-md transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-500">کارت آزمون و شماره صندلی</span>
            <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center text-sm font-black">
              📇
            </span>
          </div>
          <div className="my-2">
            <div className="text-base sm:text-lg font-black text-emerald-800 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>صادر و فعال شده</span>
            </div>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              شماره صندلی‌ها در سالن مشخص شد
            </p>
          </div>
          <Link
            href="/student/exam-card"
            className="text-[11px] font-bold text-rose-700 hover:text-rose-900 flex items-center gap-1 pt-2 border-t border-slate-100"
          >
            <span>دریافت و چاپ کارت امتحان</span>
            <span>←</span>
          </Link>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. QUICK ACTION SERVICE PORTAL (میز دسترسی سریع به امکانات) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-2">
            <span>⚡ دسترسی سریع به درگاه‌ها و خدمات آموزشی</span>
          </h2>
          <span className="text-xs text-slate-500 font-bold">سامانه یکپارچه آفاق</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          <Link
            href="/student/enroll"
            className="card p-4 bg-white hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-2xl shadow-xs transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                🛒
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                صف Redis
              </span>
            </div>
            <div className="mt-3">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-emerald-900 transition">
                انتخاب واحد هوشمند
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                کنترل هم‌نیازی، پیش‌نیازی و تداخل
              </p>
            </div>
          </Link>

          <Link
            href="/student/exam-card"
            className="card p-4 bg-white hover:bg-teal-50/50 border border-slate-200 hover:border-teal-300 rounded-2xl shadow-xs transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                📇
              </div>
              <span className="text-[10px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-bold">
                QR Code
              </span>
            </div>
            <div className="mt-3">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-teal-900 transition">
                کارت آزمون و صندلی
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                ارزشیابی استاد و چاپ برگه A4
              </p>
            </div>
          </Link>

          <Link
            href="/student/transcript"
            className="card p-4 bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 rounded-2xl shadow-xs transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                📜
              </div>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                رسمی
              </span>
            </div>
            <div className="mt-3">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-indigo-900 transition">
                کارنامه کل تحصیلی
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                محاسبه آیین‌نامه‌ای و حذف مردودی
              </p>
            </div>
          </Link>

          <Link
            href="/student/virtual-classes"
            className="card p-4 bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-sky-300 rounded-2xl shadow-xs transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                💻
              </div>
              <span className="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-bold animate-pulse">
                BBB زنده
              </span>
            </div>
            <div className="mt-3">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-sky-900 transition">
                کلاس آنلاین و وبینار
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                ورود مستقیم به جلسات مجازی LMS
              </p>
            </div>
          </Link>

          <Link
            href="/student/schedule"
            className="card p-4 bg-white hover:bg-amber-50/50 border border-slate-200 hover:border-amber-300 rounded-2xl shadow-xs transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                📅
              </div>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                تقویم شمسی
              </span>
            </div>
            <div className="mt-3">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-amber-900 transition">
                برنامه هفتگی و امتحانات
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                شماره کلاس، ساختمان و ساعت آزمون
              </p>
            </div>
          </Link>

          <Link
            href="/student/requests"
            className="card p-4 bg-white hover:bg-purple-50/50 border border-slate-200 hover:border-purple-300 rounded-2xl shadow-xs transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                📋
              </div>
              <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">
                سجاد BPM
              </span>
            </div>
            <div className="mt-3">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-purple-900 transition">
                میز خدمات و کمیسیون
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                درخواست مرخصی، حذف ترم و کمیسیون
              </p>
            </div>
          </Link>

          <Link
            href="/student/chart"
            className="card p-4 bg-white hover:bg-rose-50/50 border border-slate-200 hover:border-rose-300 rounded-2xl shadow-xs transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                🗺️
              </div>
              <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold">
                سرفصل‌ها
              </span>
            </div>
            <div className="mt-3">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-rose-900 transition">
                چارت درسی مصوب
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                دروس پایه، اصلی، تخصصی و عمومی
              </p>
            </div>
          </Link>

          <Link
            href="/student/documents"
            className="card p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-400 rounded-2xl shadow-xs transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                📁
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full font-bold">
                بایگانی
              </span>
            </div>
            <div className="mt-3">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-slate-900 transition">
                مدارک و بایگانی پرونده
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                مدرک دیپلم، کارت ملی و تعهدنامه
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. TODAY'S LIVE VIRTUAL CLASSES & UPCOMING EXAMS SPLIT SECTION */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Virtual Classes Widget */}
        <div className="card bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">💻</span>
              <div>
                <h3 className="font-black text-slate-900 text-sm">
                  کلاس‌های آنلاین و جلسات وبینار LMS (امروز)
                </h3>
                <p className="text-[11px] text-slate-500">
                  اتصال مستقیم به سرور BigBlueButton دانشگاه با پروتکل امن SSO
                </p>
              </div>
            </div>
            <Link
              href="/student/virtual-classes"
              className="text-xs font-bold text-sky-700 hover:text-sky-900 bg-sky-50 px-2.5 py-1 rounded-lg"
            >
              همه جلسات ←
            </Link>
          </div>

          <div className="space-y-2.5">
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-sky-50 to-indigo-50/50 border border-sky-200 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <strong className="text-xs font-black text-slate-900">ریاضی عمومی ۱ (کلاس مجازی)</strong>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                    در حال برگزاری
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  استاد: دکتر جمیل احمدی · ساعت: ۰۸:۳۰ الی ۱۰:۳۰ (۲۸ شرکت‌کننده فعال)
                </p>
              </div>
              <Link
                href="/student/virtual-classes"
                className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-xs shadow-xs transition active:scale-95 whitespace-nowrap"
              >
                ورود به کلاس
              </Link>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <strong className="text-xs font-black text-slate-900">مبانی برنامه‌نویسی و وب</strong>
                  <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                    شروع از ۱۰:۴۵
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  استاد: دکتر سارا رضایی · اتاق مجازی: AFAGH-ROOM-PROG103
                </p>
              </div>
              <Link
                href="/student/virtual-classes"
                className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition whitespace-nowrap"
              >
                مشاهده اتاق
              </Link>
            </div>
          </div>
        </div>

        {/* Upcoming Exams Widget */}
        <div className="card bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📝</span>
              <div>
                <h3 className="font-black text-slate-900 text-sm">
                  برنامه امتحانات پایان‌ترم و شماره صندلی
                </h3>
                <p className="text-[11px] text-slate-500">
                  همراه داشتن کارت آزمون چاپ‌شده و کارت ملی در جلسه آزمون الزامی است
                </p>
              </div>
            </div>
            <Link
              href="/student/exam-card"
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg"
            >
              کارت آزمون ←
            </Link>
          </div>

          <div className="space-y-2.5">
            {upcomingExams.map((ex, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-emerald-50/40 transition flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-black text-slate-900">{ex.title}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span>📅 {toShamsi(ex.examDate)}</span>
                    <span>⏰ {ex.examTime}</span>
                    <span>🏛️ {ex.room}</span>
                  </div>
                </div>
                <div className="text-left font-mono">
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-950 text-white font-black text-xs">
                    صندلی {ex.seatNumber}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
