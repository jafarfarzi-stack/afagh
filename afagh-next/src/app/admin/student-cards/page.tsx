import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { degree_level_configs, majors, student_cards, students, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getNumber, getSetting } from '@/lib/settings';
import StudentCardsClient from './StudentCardsClient';

export const dynamic = 'force-dynamic';

const fa = (n: unknown) => String(n ?? '—').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/**
 * صدور و مدیریت کارت دانشجویی.
 *
 * این صفحه تنها مسیر صدور رکورد در `student_cards` است؛ همان جدولی که گیت
 * حراست (`/id/[token]`) از آن استعلام می‌گیرد. پیش‌تر هیچ مسیر صدوری وجود
 * نداشت و گیت با دادهٔ ساختگی پاسخ می‌داد.
 */
export default async function AdminStudentCardsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  const rows = await db
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      nationalCode: users.nationalCode,
      status: students.status,
      entryYear: students.entryYear,
      majorName: majors.name,
      degreeLevel: degree_level_configs.title,
      cardId: student_cards.id,
      secureToken: student_cards.secureToken,
      printStatus: student_cards.printStatus,
      rfidSerialNumber: student_cards.rfidSerialNumber,
      issuedAt: student_cards.issuedAt,
      expiresAt: student_cards.expiresAt,
      debt: sql<string>`coalesce((
        select -sum(case when l."transactionType" in ('TUITION_CHARGE','CHARGE') then -l.amount else l.amount end)
          from student_ledger l where l."studentId" = ${students.id}), 0)`,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(student_cards, eq(student_cards.studentId, students.id))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
    .orderBy(desc(students.id));

  const validDays = await getNumber('STUDENT_CARD_VALID_DAYS', 365);
  const secretSet = (await getSetting('TICKET_TOKEN_SECRET')).trim().length > 0;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="card !p-4 bg-white border-slate-300 shadow-sm">
        <h1 className="text-base font-extrabold text-slate-900">🪪 صدور و مدیریت کارت دانشجویی</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          توکن امنیتی چاپ‌شده روی کارت، همان چیزی است که گیت حراست در <span className="font-mono">/id/[token]</span> استعلام می‌کند.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">
          <span className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-900 border border-indigo-200">
            اعتبار پیش‌فرض کارت: {fa(validDays)} روز (از تنظیمات سامانه)
          </span>
          <span className={`rounded-lg px-2 py-1 border ${secretSet ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-900 border-rose-300'}`}>
            {secretSet ? '✓ کلید امضای توکن (TICKET_TOKEN_SECRET) تنظیم شده' : '⚠️ کلید امضای توکن تنظیم نشده — کارت ورود به جلسه صادر نمی‌شود'}
          </span>
        </div>
      </div>

      <StudentCardsClient
        rows={rows.map(r => ({
          studentId: r.studentId,
          studentCode: r.studentCode,
          fullName: r.fullName,
          nationalCode: r.nationalCode,
          status: r.status,
          entryYear: r.entryYear,
          majorName: r.majorName,
          degreeLevel: r.degreeLevel,
          card: r.cardId
            ? {
                id: r.cardId,
                token: r.secureToken ?? '',
                printStatus: r.printStatus ?? 'PENDING',
                rfidSerialNumber: r.rfidSerialNumber,
                issuedAt: r.issuedAt ? new Date(r.issuedAt).toLocaleDateString('fa-IR') : null,
                expiresAt: r.expiresAt ? new Date(r.expiresAt).toLocaleDateString('fa-IR') : null,
                expired: !!r.expiresAt && new Date(r.expiresAt).getTime() < Date.now(),
              }
            : null,
          debt: Math.max(0, Math.round(Number(r.debt ?? 0))),
        }))}
      />
    </div>
  );
}
