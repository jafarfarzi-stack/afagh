import { and, asc, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { classrooms, defense_sessions, students, thesis_progress, users } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import PanelHero from '@/components/PanelHero';
import { approveDefenseRequestAction } from './actions';
import ThesisInboxClient, {
  type ArchivedThesisRow,
  type PendingDefenseRow,
  type PendingGradeRow,
  type UpcomingDefenseRow,
} from './ThesisInboxClient';

/**
 * «پایان‌نامه‌های من» — تنها سطحِ پایان‌نامه در کارتابل استاد.
 *
 * چرا: پیش از این استاد هیچ مسیری برای دیدن پرونده‌های راهنمایی/مشاورهٔ خود
 * نداشت؛ تنها راه، تایپِ دستیِ `/admin/defense-scheduling` بود که گاردِ نقشِ
 * همان میز او را به داشبورد برمی‌گرداند. این صفحه فقط پرونده‌های «خودِ من»
 * را می‌خواند (supervisorId یا advisorId) و تنها کنشش تأیید/رد درخواست دفاع
 * است؛ تعیین وقت، هیأت داوران و ثبت نمرهٔ کیفی همچنان در اختیار کارشناس است.
 */

export const dynamic = 'force-dynamic';

const RESULT_FA: Record<string, string> = {
  PASSED: 'قبول',
  FAILED: 'مردود',
  CONDITIONAL: 'قبول مشروط',
};

function faDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fa-IR');
}

function faDay(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fa-IR');
}

function faPercent(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`;
}

function titleOf(v: string | null | undefined): string {
  return v?.trim() || 'عنوان ثبت نشده';
}

export default async function ProfessorThesisPage() {
  const user = await requireRole(['PROFESSOR', 'DEP_HEAD']);
  const me = await getStaffByUser(user.id);

  if (!me) {
    return (
      <div className="card space-y-2 p-8 text-center">
        <p className="font-bold text-slate-600">پروندهٔ هیئت علمی یافت نشد.</p>
        <p className="text-xs text-slate-500">
          برای دیدن پایان‌نامه‌های خود باید پروندهٔ کارکنانی (هیئت علمی) شما در سامانه ثبت شده باشد؛ با اداره آموزش تماس بگیرید.
        </p>
      </div>
    );
  }

  const meId = me.id;
  const universityId = me.universityId ?? user.universityId ?? null;

  /**
   * دامنهٔ مشترک هر چهار کوئری: پرونده‌هایی که من راهنما یا مشاور آن‌ها هستم،
   * محدود به دانشگاهِ دانشجو (ردیف‌های بدون دانشگاه هم دیده می‌شوند تا پروندهٔ
   * نیمه‌ثبت‌شدهٔ دانشگاه خودم گم نشود — همان سیاستِ میز کارشناس).
   */
  const mine = or(eq(thesis_progress.supervisorId, meId), eq(thesis_progress.advisorId, meId));
  const scope = and(
    mine,
    universityId ? or(eq(students.universityId, universityId), isNull(students.universityId)) : undefined,
  );

  const [pendingRows, upcomingRows, pendingGradeRows, archiveRows] = await Promise.all([
    // (الف) در انتظار تأیید من — درخواست دفاعِ رسیده به استاد راهنما
    db
      .select({
        auditId: thesis_progress.auditId,
        supervisorId: thesis_progress.supervisorId,
        titleFa: thesis_progress.titleFa,
        proposalSimilarity: thesis_progress.proposalSimilarity,
        defenseRequestedAt: thesis_progress.defenseRequestedAt,
        studentCode: students.studentCode,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(thesis_progress)
      .innerJoin(students, eq(students.id, thesis_progress.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(and(scope, eq(thesis_progress.defenseRequestStatus, 'SUPERVISOR_REVIEW')))
      .orderBy(asc(thesis_progress.defenseRequestedAt)),

    // (ب) دفاع‌های پیش‌رو — جلسهٔ زمان‌بندی‌شده با تاریخ آینده
    db
      .select({
        sessionId: defense_sessions.id,
        auditId: thesis_progress.auditId,
        scheduledAt: defense_sessions.scheduledAt,
        roomName: classrooms.name,
        titleFa: thesis_progress.titleFa,
        supervisorId: thesis_progress.supervisorId,
        advisorId: thesis_progress.advisorId,
        studentCode: students.studentCode,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(defense_sessions)
      .innerJoin(thesis_progress, eq(thesis_progress.id, defense_sessions.thesisProgressId))
      .innerJoin(students, eq(students.id, defense_sessions.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .leftJoin(classrooms, eq(classrooms.id, defense_sessions.roomId))
      .where(
        and(
          scope,
          eq(defense_sessions.status, 'SCHEDULED'),
          gte(defense_sessions.scheduledAt, new Date()),
        ),
      )
      .orderBy(asc(defense_sessions.scheduledAt)),

    // (ج) نمرهٔ در انتظار — دفاع قبول‌شده ولی نمرهٔ کیفی هنوز ثبت نشده (فقط نمایش)
    db
      .select({
        auditId: thesis_progress.auditId,
        titleFa: thesis_progress.titleFa,
        defenseResult: thesis_progress.defenseResult,
        defenseConductedAt: thesis_progress.defenseConductedAt,
        sessionResult: defense_sessions.result,
        sessionDefenseDate: defense_sessions.defenseDate,
        sessionScheduledAt: defense_sessions.scheduledAt,
        studentCode: students.studentCode,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(thesis_progress)
      .innerJoin(students, eq(students.id, thesis_progress.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .leftJoin(defense_sessions, eq(defense_sessions.thesisProgressId, thesis_progress.id))
      .where(and(scope, eq(thesis_progress.defenseRequestStatus, 'PASSED'), isNull(defense_sessions.qualitativeGrade)))
      .orderBy(desc(thesis_progress.defenseConductedAt)),

    // (د) بایگانی — ۲۰ پروندهٔ آخر با نتیجهٔ قطعیِ قبول یا مردود
    db
      .select({
        auditId: thesis_progress.auditId,
        titleFa: thesis_progress.titleFa,
        defenseRequestStatus: thesis_progress.defenseRequestStatus,
        defenseResult: thesis_progress.defenseResult,
        defenseConductedAt: thesis_progress.defenseConductedAt,
        updatedAt: thesis_progress.updatedAt,
        sessionResult: defense_sessions.result,
        sessionDefenseDate: defense_sessions.defenseDate,
        studentCode: students.studentCode,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(thesis_progress)
      .innerJoin(students, eq(students.id, thesis_progress.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .leftJoin(defense_sessions, eq(defense_sessions.thesisProgressId, thesis_progress.id))
      .where(and(scope, inArray(thesis_progress.defenseRequestStatus, ['PASSED', 'FAILED'])))
      .orderBy(desc(thesis_progress.updatedAt))
      .limit(20),
  ]);

  const pending: PendingDefenseRow[] = pendingRows.map(r => ({
    auditId: r.auditId,
    studentName: `${r.firstName} ${r.lastName}`.trim() || 'دانشجو',
    studentCode: r.studentCode,
    title: titleOf(r.titleFa),
    similarity: faPercent(r.proposalSimilarity),
    requestedAt: faDateTime(r.defenseRequestedAt),
    canDecide: r.supervisorId === meId,
  }));

  const upcoming: UpcomingDefenseRow[] = upcomingRows.map(r => ({
    sessionId: r.sessionId,
    auditId: r.auditId,
    studentName: `${r.firstName} ${r.lastName}`.trim() || 'دانشجو',
    studentCode: r.studentCode,
    title: titleOf(r.titleFa),
    scheduledAt: faDateTime(r.scheduledAt),
    roomName: r.roomName?.trim() || 'تعیین نشده',
    roleLabel: r.supervisorId === meId ? 'استاد راهنما' : r.advisorId === meId ? 'استاد مشاور' : 'داور',
  }));

  const pendingGrades: PendingGradeRow[] = pendingGradeRows.map(r => ({
    auditId: r.auditId,
    studentName: `${r.firstName} ${r.lastName}`.trim() || 'دانشجو',
    studentCode: r.studentCode,
    title: titleOf(r.titleFa),
    resultLabel: RESULT_FA[r.sessionResult ?? r.defenseResult ?? ''] ?? 'قبول',
    conductedAt: faDay(r.sessionDefenseDate ?? r.defenseConductedAt ?? r.sessionScheduledAt),
  }));

  const archive: ArchivedThesisRow[] = archiveRows.map(r => ({
    auditId: r.auditId,
    studentName: `${r.firstName} ${r.lastName}`.trim() || 'دانشجو',
    studentCode: r.studentCode,
    title: titleOf(r.titleFa),
    statusLabel: r.defenseRequestStatus === 'PASSED' ? 'قبول' : 'مردود',
    resultLabel: RESULT_FA[r.sessionResult ?? r.defenseResult ?? ''] ?? '—',
    at: faDay(r.sessionDefenseDate ?? r.defenseConductedAt ?? r.updatedAt),
  }));

  return (
    <div className="space-y-3">
      <PanelHero
        tone="indigo"
        icon="🔬"
        eyebrow="پایان‌نامه‌ها"
        title="پایان‌نامه‌های من"
        subtitle="پرونده‌هایی که شما استاد راهنما یا مشاور آن‌ها هستید — از تأیید درخواست دفاع تا نتیجهٔ نهایی و نمرهٔ کیفی."
        stats={[
          { label: 'در انتظار تأیید', value: pending.length.toLocaleString('fa-IR'), tone: 'text-amber-700' },
          { label: 'دفاع پیش‌رو', value: upcoming.length.toLocaleString('fa-IR'), tone: 'text-indigo-700' },
          { label: 'نمرهٔ در انتظار', value: pendingGrades.length.toLocaleString('fa-IR'), tone: 'text-sky-700' },
          { label: 'بایگانی', value: archive.length.toLocaleString('fa-IR'), tone: 'text-slate-700' },
        ]}
      />

      <ThesisInboxClient
        pending={pending}
        upcoming={upcoming}
        pendingGrades={pendingGrades}
        archive={archive}
        approveAction={approveDefenseRequestAction}
      />
    </div>
  );
}
