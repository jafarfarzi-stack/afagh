import Link from 'next/link';
import { and, count, eq, inArray } from 'drizzle-orm';
import { isDemoProfessorUser } from '@/lib/demo-accounts';
import {
  DEMO_ACADEMIC_RANK,
  DEMO_DASHBOARD_CLASSES,
  DEMO_DASHBOARD_CONTRACT,
  DEMO_DASHBOARD_SUMMARY,
  DEMO_DEPARTMENT_NAME,
  DEMO_LIVE_SESSIONS,
  DEMO_TERM_TITLE,
} from '@/lib/demo-professor-data';
import { DEMO_RECORDINGS } from '@/lib/demo-student-data';
import { db } from '@/db';
import {
  classrooms, course_offerings, courses, departments, electronic_documents,
  professor_availabilities, professor_term_contracts, payroll_statements, schedules,
} from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import VirtualClassroomWidget from '@/components/VirtualClassroomWidget';
import { getTodayLiveClasses } from '@/lib/moodle-bbb';
import { currentTermFor } from '@/lib/terms';

export const dynamic = 'force-dynamic';

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

const faDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('fa-IR') : null;

export default async function ProfessorHome() {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  if (!me) return <p className="card">پروندهٔ هیئت علمی یافت نشد.</p>;

  const demo = await isDemoProfessorUser(user.id);

  const universityId = me.universityId ?? user.universityId ?? null;
  const term = await currentTermFor(universityId);

  const liveSessions = await getTodayLiveClasses({ universityId, staffId: me.id, viewerUserId: user.id });

  const classes = term
    ? await db
        .select({
          id: course_offerings.id,
          code: courses.code,
          title: courses.title,
          units: courses.units,
          enrolled: course_offerings.enrolledCount,
          capacity: course_offerings.capacity,
          group: course_offerings.groupNumber,
          roomId: schedules.roomId,
          dayOfWeek: schedules.dayOfWeek,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
        })
        .from(course_offerings)
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .leftJoin(
          schedules,
          and(
            eq(schedules.offeringId, course_offerings.id),
            eq(schedules.scheduleType, 'CLASS'),
          ),
        )
        .where(and(eq(course_offerings.professorId, me.id), eq(course_offerings.termId, term.id)))
        .orderBy(schedules.dayOfWeek, schedules.startTime)
    : [];

  const roomIds = [...new Set(classes.map(c => c.roomId).filter(Boolean))] as number[];
  const rooms = roomIds.length
    ? await db.select({ id: classrooms.id, name: classrooms.name }).from(classrooms).where(inArray(classrooms.id, roomIds))
    : [];
  const roomName = new Map(rooms.map(r => [r.id, r.name]));

  const deptRows = me.departmentId
    ? await db.select({ name: departments.name }).from(departments).where(eq(departments.id, me.departmentId)).limit(1)
    : [];
  const deptName = deptRows[0]?.name ?? null;

  const [contractRows, availabilityRows, pays] = await Promise.all([
    term
      ? db.select({ id: professor_term_contracts.id, contractType: professor_term_contracts.contractType, baseDutyUnits: professor_term_contracts.baseDutyUnits })
          .from(professor_term_contracts)
          .where(and(eq(professor_term_contracts.staffId, me.id), eq(professor_term_contracts.termId, term.id)))
          .limit(1)
      : Promise.resolve([]),
    term
      ? db.select({ n: count() }).from(professor_availabilities)
          .where(and(eq(professor_availabilities.staffId, me.id), eq(professor_availabilities.termId, term.id)))
      : Promise.resolve([]),
    db
      .select({ id: payroll_statements.id, net: payroll_statements.netAmount, status: payroll_statements.status, midterm: payroll_statements.midtermPaidAmount })
      .from(payroll_statements)
      .innerJoin(professor_term_contracts, eq(professor_term_contracts.id, payroll_statements.contractId))
      .where(eq(professor_term_contracts.staffId, me.id)),
  ]);

  const contract = contractRows[0] ?? null;

  const termDocs = term
    ? await db
        .select({ id: electronic_documents.id, title: electronic_documents.title, signatureStatus: electronic_documents.signatureStatus, signedAt: electronic_documents.signedAt, documentHash: electronic_documents.documentHash, createdAt: electronic_documents.createdAt })
        .from(electronic_documents)
        .where(and(eq(electronic_documents.staffId, me.id), eq(electronic_documents.termId, term.id)))
    : [];

  const availabilityCount = Number(availabilityRows[0]?.n ?? 0);
  const gradeDeadline = term?.gradeEntryDeadline ?? null;

  const signatureStatus = termDocs.some(d => d.signatureStatus === 'SIGNED')
    ? 'SIGNED'
    : termDocs.length > 0
      ? 'PENDING'
      : 'NONE';

  const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'];

  const classCards = demo
    ? DEMO_DASHBOARD_CLASSES.map(c => ({
        key: `${c.id}-${c.roomLabel}-${c.timeLabel}`,
        offeringId: c.id,
        title: c.title,
        code: c.code,
        group: c.groupNumber,
        units: c.units,
        roomLine: `🏛️ ${c.roomLabel}`,
        timeLine: c.timeLabel,
        enrolled: c.enrolled,
        capacity: c.capacity,
        isCoTaught: c.isCoTaught,
        coTeacherName: c.coTeacherName,
      }))
    : classes.map(c => ({
        key: `${c.id}-${c.roomId ?? 'x'}-${c.startTime ?? 'x'}`,
        offeringId: c.id,
        title: c.title,
        code: c.code,
        group: c.group,
        units: c.units,
        roomLine: c.roomId ? `🏛️ ${roomName.get(c.roomId) ?? 'کلاس نامشخص'}` : 'زمان‌بندی ثبت نشده',
        timeLine:
          c.dayOfWeek != null
            ? `${DAYS[c.dayOfWeek] ?? ''} ${String(c.startTime).slice(0, 5)} الی ${String(c.endTime).slice(0, 5)}`
            : '',
        enrolled: c.enrolled,
        capacity: c.capacity,
        isCoTaught: false,
        coTeacherName: undefined as string | undefined,
      }));

  return (
    <div className="space-y-6" dir="rtl">

      <div className="bg-gradient-to-l from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-700/50 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-400 text-slate-950">
              {demo
                ? DEMO_TERM_TITLE
                : term
                  ? term.title
                  : 'نیمسال تحصیلی جاری برای دانشگاه شما تعیین نشده است'}
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-2">
              خوش آمدید، استاد گرامی {user.name}
            </h1>
            <p className="text-xs text-indigo-200 mt-1">
              کد پرسنلی: {faNum(me.staffCode)}
              {demo
                ? ` · مرتبه علمی: ${DEMO_ACADEMIC_RANK}`
                : me.academicRank
                  ? ` · مرتبه علمی: ${me.academicRank}`
                  : ''}
              {` · گروه: ${demo ? DEMO_DEPARTMENT_NAME : deptName ?? 'ثبت نشده'}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/professor/schedule"
              className="px-4 py-2 rounded-xl bg-white text-indigo-950 font-extrabold text-xs shadow hover:bg-indigo-50 transition"
            >
              🗓️ برنامه هفتگی تدریس
            </Link>
            <Link
              href="/professor/contract"
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shadow transition"
            >
              📑 مشاهده و امضای قرارداد تدریس
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
            <span className="text-indigo-200 block mb-0.5">تعداد کلاس‌های ترم:</span>
            <span className="font-extrabold text-white text-sm">
              {faNum(demo ? DEMO_DASHBOARD_SUMMARY.classCount : classes.length)}{' '}
              {DEMO_DASHBOARD_SUMMARY.classCountLabel}
            </span>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
            <span className="text-indigo-200 block mb-0.5">
              {demo ? DEMO_DASHBOARD_SUMMARY.availabilityLabel : 'اعلام ساعات حضور ترم:'}
            </span>
            <span className="font-extrabold text-sm text-emerald-300">
              {demo
                ? DEMO_DASHBOARD_SUMMARY.availabilityValue
                : availabilityCount > 0
                  ? `${faNum(availabilityCount)} بازهٔ زمانی ثبت شده`
                  : 'ثبت نشده'}
            </span>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
            <span className="text-indigo-200 block mb-0.5">
              {demo ? DEMO_DASHBOARD_SUMMARY.contractLabel : 'قرارداد حق‌التدریس:'}
            </span>
            <span className="font-extrabold text-amber-300 text-sm">
              {demo
                ? DEMO_DASHBOARD_SUMMARY.contractValue
                : signatureStatus === 'SIGNED'
                  ? 'امضا شده'
                  : signatureStatus === 'PENDING'
                    ? 'در انتظار امضای الکترونیک'
                    : 'سندی ثبت نشده'}
            </span>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
            <span className="text-indigo-200 block mb-0.5">مهلت نهایی‌سازی نمرات:</span>
            <span className="font-extrabold text-white text-sm">
              {demo
                ? DEMO_DASHBOARD_SUMMARY.gradeDeadlineValue
                : gradeDeadline
                  ? faDate(gradeDeadline)
                  : 'تعیین نشده'}
            </span>
          </div>
        </div>
      </div>

      <VirtualClassroomWidget
        user={{ id: user.id, name: user.name, role: 'PROFESSOR' }}
        initialSessions={demo ? DEMO_LIVE_SESSIONS : liveSessions}
        recordings={demo ? DEMO_RECORDINGS : undefined}
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Link
          href="/professor/schedule"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-400 hover:shadow-md transition space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition">
            🗓️
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">برنامه هفتگی تدریس</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-4">
              مشاهده روزها، ساعات تشکیل، شماره کلاس فیزیکی و تواتر زوج/فرد
            </p>
          </div>
        </Link>

        <Link
          href="/professor/attendance"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-400 hover:shadow-md transition space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition">
            📋
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">ثبت حضور و غیاب</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-4">
              ثبت وضعیت هر جلسه، تاخیر، غیبت موجه و هشدار ماده ۳/۱۶
            </p>
          </div>
        </Link>

        <Link
          href="/professor/grades"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-400 hover:shadow-md transition space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition">
            📝
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">بارم‌بندی و ثبت نمرات</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-4">
              تعیین سهم میان‌ترم و پایان‌ترم (جمع ۲۰)، نمرات مشترک و رسیدگی به اعتراضات
            </p>
          </div>
        </Link>

        <Link
          href="/professor/contract"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-400 hover:shadow-md transition space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition">
            📑
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">قرارداد تدریس و مالی</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-4">
              مشاهده فرم رسمی، جزئیات مالی، نرخ هر ساعت و امضای دیجیتال
            </p>
          </div>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 md:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="font-extrabold text-slate-900 text-base">
                کلاس‌های آموزشی {demo ? DEMO_TERM_TITLE : term ? term.title : ''}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">فهرست دروس تخصیص‌یافته به همراه عملیات سریع</p>
            </div>
            <Link href="/professor/schedule" className="text-xs font-bold text-indigo-700 hover:underline">
              مشاهده تقویم هفتگی ←
            </Link>
          </div>

          <div className="space-y-3">
            {classCards.length === 0 ? (
              <div className="text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-xs font-bold text-slate-500">
                در این نیمسال هیچ درسی به شما تخصیص نیافته است.
              </div>
            ) : classCards.map(c => (
              <div
                key={c.key}
                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-2xl p-3.5 border gap-3 ${
                  c.isCoTaught ? 'bg-purple-50/50 border-purple-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className={`font-extrabold text-sm ${c.isCoTaught ? 'text-purple-950' : 'text-slate-900'}`}>{c.title}</p>
                    {c.isCoTaught ? (
                      <span className="px-2 py-0.5 rounded bg-purple-200 text-purple-950 font-bold text-[10px]">👥 درس مشترک</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-bold text-[10px]">گروه {faNum(c.group)}</span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 font-bold ${c.isCoTaught ? 'text-purple-800' : 'text-slate-500'}`}>
                    {c.code} · {faNum(c.units)} واحد · {c.roomLine}
                    {c.timeLine ? ` · ${c.timeLine}` : ''}
                    {c.isCoTaught && c.coTeacherName ? ` · با ${c.coTeacherName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge font-bold text-xs ${c.isCoTaught ? 'bg-purple-100 text-purple-900' : 'bg-sky-100 text-sky-800'}`}>{faNum(c.enrolled)}/{faNum(c.capacity)} دانشجو</span>
                  <Link href={`/professor/attendance?offeringId=${c.offeringId}`} className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-900 font-bold text-xs hover:bg-emerald-200 transition">
                    حضور و غیاب
                  </Link>
                  <Link href={`/professor/grades?offeringId=${c.offeringId}`} className="px-2.5 py-1 rounded-xl bg-indigo-100 text-indigo-900 font-bold text-xs hover:bg-indigo-200 transition">
                    ثبت نمره
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h2 className="font-extrabold text-slate-900 text-base">قرارداد و وضعیت مالی</h2>
            <p className="text-xs text-slate-500 mt-0.5">محاسبه حق‌التدریس بر اساس احکام مصوب</p>
          </div>

          {demo ? (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">شماره قرارداد:</span>
                <span className="font-mono font-bold text-slate-900">{DEMO_DASHBOARD_CONTRACT.contractNo}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">وضعیت امضا:</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">
                  {DEMO_DASHBOARD_CONTRACT.signatureStatus}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-500">ساعات تدریس مصوب:</span>
                <span className="font-bold text-indigo-950">{DEMO_DASHBOARD_CONTRACT.approvedHoursLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">مبلغ ناخالص:</span>
                <span className="font-bold text-slate-900">
                  {faNum(DEMO_DASHBOARD_CONTRACT.grossAmount.toLocaleString('fa-IR'))} {DEMO_DASHBOARD_CONTRACT.currency}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">خالص پرداختی پیش‌بینی:</span>
                <span className="font-extrabold text-emerald-700 text-sm">
                  {faNum(DEMO_DASHBOARD_CONTRACT.netAmount.toLocaleString('fa-IR'))} {DEMO_DASHBOARD_CONTRACT.currency}
                </span>
              </div>

              <div className="pt-2">
                <Link
                  href="/professor/contract"
                  className="w-full block text-center py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs shadow transition"
                >
                  مشاهده فرم کامل و امضای دیجیتال ←
                </Link>
              </div>
            </div>
          ) : contract ? (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">نوع قرارداد:</span>
                <span className="font-bold text-slate-900">{contract.contractType ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">وضعیت سند:</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">
                  {signatureStatus === 'SIGNED' ? 'امضا شده' : signatureStatus === 'PENDING' ? 'در انتظار امضای دیجیتال' : 'ثبت نشده'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">سقف موظفی ترم:</span>
                <span className="font-bold text-indigo-950">{Number(contract.baseDutyUnits ?? 0) > 0 ? `${faNum(contract.baseDutyUnits)} واحد` : 'ثبت نشده'}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-500">فیش‌های مالی ثبت‌شده:</span>
                <span className="font-extrabold text-emerald-700 text-sm">{faNum(pays.length)} فیش</span>
              </div>

              <div className="pt-2">
                <Link
                  href="/professor/contract"
                  className="w-full block text-center py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs shadow transition"
                >
                  مشاهده فرم کامل و امضای دیجیتال ←
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-center p-5 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-xs font-bold text-slate-500">
                برای نیمسال جاری دانشگاه شما قرارداد حق‌التدریسی ثبت نشده است.
              </div>
              <Link
                href="/professor/documents"
                className="w-full block text-center py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs transition"
              >
                مشاهده اسناد الکترونیک من ←
              </Link>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}