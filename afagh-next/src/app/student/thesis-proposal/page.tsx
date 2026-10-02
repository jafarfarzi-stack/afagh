import { desc, eq, isNull, or } from 'drizzle-orm';
import { db, withUserRls } from '@/db';
import { graduation_audits, irandoc_logs, staff, users } from '@/db/schema';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { getThesisProgress } from '@/lib/graduation-engine';
import ThesisProposalClient from './ThesisProposalClient';

export const dynamic = 'force-dynamic';

export default async function StudentThesisProposalPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <div className="card p-6 text-center text-slate-600 font-bold">پروندهٔ دانشجویی یافت نشد.</div>;

  const [audit] = await withUserRls(user.id, tx =>
    tx
      .select({ id: graduation_audits.id, workflowStatus: graduation_audits.workflowStatus })
      .from(graduation_audits)
      .where(eq(graduation_audits.studentId, me.id))
      .limit(1));

  if (!audit) {
    return (
      <div className="space-y-3" dir="rtl">
        <div className="card p-4 bg-gradient-to-l from-emerald-700 to-teal-800 text-white">
          <h1 className="text-base sm:text-lg font-black">پایان‌نامه و پروپوزال من</h1>
          <p className="text-[11px] text-emerald-100 mt-1 leading-6">
            این بخش برای دانشجویان تحصیلات تکمیلی (کارشناسی ارشد و دکتری) است.
          </p>
        </div>
        <div className="card p-5 text-xs text-slate-600 leading-6">
          پروندهٔ فارغ‌التحصیلی شما هنوز باز نشده است؛ به‌محض تکمیل واحدهای سرفصل، سامانه به‌صورت خودکار آن را باز می‌کند.
          وضعیت لحظه‌ای را از بخش <span className="font-bold">«فارغ‌التحصیلی من»</span> دنبال کنید.
        </div>
      </div>
    );
  }

  const progress = await getThesisProgress(audit.id);

  const logs = await withUserRls(user.id, tx =>
    tx
      .select({
        id: irandoc_logs.id,
        checkType: irandoc_logs.checkType,
        trackingCode: irandoc_logs.trackingCode,
        similarityPercentage: irandoc_logs.similarityPercentage,
        decision: irandoc_logs.decision,
        checkedAt: irandoc_logs.checkedAt,
      })
      .from(irandoc_logs)
      .where(eq(irandoc_logs.studentId, me.id))
      .orderBy(desc(irandoc_logs.id))
      .limit(20));

  const staffList = await db
    .select({
      id: staff.id,
      firstName: users.firstName,
      lastName: users.lastName,
      academicRank: staff.academicRank,
      staffType: staff.staffType,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .where(or(eq(staff.isActive, 1), isNull(staff.isActive)))
    .orderBy(users.lastName)
    .limit(500);

  return (
    <ThesisProposalClient
      student={{ name: user.name, studentCode: me.studentCode }}
      userId={user.id}
      workflowStatus={audit.workflowStatus}
      progress={progress}
      logs={logs.map(l => ({
        id: l.id,
        checkType: l.checkType ?? '—',
        trackingCode: l.trackingCode,
        similarityPercentage: l.similarityPercentage == null ? null : Number(l.similarityPercentage),
        decision: l.decision,
        checkedAt: l.checkedAt ? l.checkedAt.toISOString() : null,
      }))}
      staffList={staffList.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        rank: s.academicRank ?? s.staffType ?? '',
      }))}
    />
  );
}