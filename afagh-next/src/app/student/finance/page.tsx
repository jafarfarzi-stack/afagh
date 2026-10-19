import { desc, eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { degree_level_configs, notifications, students, universities } from '@/db/schema';
import FinancialTranscript from '@/components/FinancialTranscript';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { getStudentFinance } from '@/lib/finance-engine';
import { computeTermTuition } from '@/lib/tuition-engine';
import { buildTranscriptCourses } from '@/lib/transcript-courses';
import { toNum, transcriptTotals } from '@/lib/finance-rules';
import { getTermScope } from '@/lib/term-scope';
import { isDemoStudentUser } from '@/lib/demo-accounts';
import { getPublicBaseUrl, getSetting } from '@/lib/settings';
import { issueFinanceStatementToken } from '@/lib/verification';
import { qrSvg } from '@/lib/qr';
import { toJalaliFromDate, faDigits } from '@/lib/calendar';
import PrintTranscriptButton from '@/components/PrintTranscriptButton';
import TermFilterChip from '../term-filter-chip';
import { DemoFinance } from '../demo-sections';

export const dynamic = 'force-dynamic';

const fa = (n: number) => Number(n || 0).toLocaleString('fa-IR');

/** تاریخ شمسی خوانا؛ تهی → خط تیره */
function jdate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const { jy, jm, jd } = toJalaliFromDate(date);
  return faDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/**
 * رویدادهای مالی که برای دانشجو نمایش داده می‌شوند.
 *
 * تنها FINANCE_CHEQUE_DUE در سامانه تولید می‌شود (توسط پویش یادآوری چک).
 * اگر رویداد مالی تازه‌ای اضافه شد، باید اینجا هم ثبت شود.
 */
const STUDENT_EVENTS = ['FINANCE_CHEQUE_DUE'];

export default async function StudentFinancePage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const user = await requireRole(['STUDENT']);
  const picked = await getStudentByUser(user.id);
  if (!picked) return <p className="card p-6 text-center text-slate-500">پروندهٔ دانشجویی یافت نشد.</p>;

  // ── دانش‌آموخته/دانشجوی چندمقطعی: هر پروندهٔ دانشجویی کارنامهٔ مالی خودش را
  //    دارد (دفتر مالی به studentId گره خورده است)، پس مقطع باید قابل انتخاب باشد
  //    و QR هر کارنامه هم همان پرونده را در خود نهفته دارد.
  const myRecords = await db
    .select({
      id: students.id,
      studentCode: students.studentCode,
      status: students.status,
      degreeTitle: degree_level_configs.title,
      entryYear: students.entryYear,
    })
    .from(students)
    .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
    .where(eq(students.userId, user.id))
    .orderBy(desc(students.entryYear), desc(students.id));

  const sp = await searchParams;
  const wantedRecordId = Number(sp?.record ?? 0) || 0;
  let active = picked;
  if (wantedRecordId && wantedRecordId !== picked.id && myRecords.some(r => r.id === wantedRecordId)) {
    const [alt] = await db
      .select()
      .from(students)
      .where(and(eq(students.id, wantedRecordId), eq(students.userId, user.id)))
      .limit(1);
    if (alt) active = alt;
  }
  const me = active;

  const demo = await isDemoStudentUser(user.id);
  if (demo) {
    const demoScope = await getTermScope(me.universityId);
    const demoTerm = demoScope.selectedId
      ? demoScope.terms.find(t => t.id === demoScope.selectedId) ?? null
      : null;
    return <DemoFinance filteredTermTitle={demoTerm?.title ?? null} />;
  }

  const [fin, notifyRows, remindDaysRaw, scope] = await Promise.all([
    getStudentFinance(me.id),
    db.select().from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.id))
      .limit(30),
    getSetting('CHEQUE_REMIND_DAYS'),
    getTermScope(me.universityId),
  ]);

  if (!fin) return <p className="card p-6 text-center text-slate-500">اطلاعات مالی یافت نشد.</p>;

  const [uniRow] = me.universityId
    ? await db.select({ title: universities.title, logoUrl: universities.logoUrl }).from(universities).where(eq(universities.id, me.universityId)).limit(1)
    : [];
  const uniTitle = uniRow?.title ?? null;
  const universityLogo = uniRow?.logoUrl || (await getSetting('UNIVERSITY_LOGO').catch(() => '')) || null;

  const { student, cheques, loans } = fin;
  const selectedTerm = scope.selectedId
    ? scope.terms.find(t => t.id === scope.selectedId) ?? null
    : null;

  const transcript = selectedTerm
    ? fin.transcript.filter(t => t.termId === selectedTerm.id)
    : fin.transcript;
  const totals = selectedTerm ? transcriptTotals(transcript) : fin.totals;
  const visibleCheques = selectedTerm
    ? cheques.filter(c => c.termId === selectedTerm.id)
    : cheques;
  const visibleLoans = selectedTerm
    ? loans.filter(l => l.termId === selectedTerm.id)
    : loans;

  // ریز شهریهٔ متغیر دروس ترم‌های نمایشی (مسیر یکتای buildTranscriptCourses)
  const courseMap = await buildTranscriptCourses(me.id, transcript.map((t) => t.termId));
  const transcriptWithCourses = transcript.map((t) => ({
    ...t,
    courses: courseMap[t.termId]?.lines ?? [],
    coursesBasis: courseMap[t.termId]?.basis,
  }));

  const remindDays = Math.max(0, Math.round(toNum(remindDaysRaw) || 0));
  const nowMs = Date.now();

  // چک‌های نزدیک به سررسید یا گذشته از آن — همان چیزی که پیام یادآوری برایش می‌رود
  const dueSoon = cheques
    .filter((c) => c.status === 'PENDING')
    .map((c) => {
      const due = c.dueDate ? new Date(c.dueDate).getTime() : NaN;
      const daysLeft = Number.isFinite(due) ? Math.ceil((due - nowMs) / 86_400_000) : null;
      return { ...c, daysLeft };
    })
    .filter((c) => c.daysLeft !== null && c.daysLeft <= remindDays)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  // eventCode در اسکیما nullable است، پس تهی را صریح پوشش می‌دهیم
  const financeNotifications = notifyRows.filter((n) => !!n.eventCode && STUDENT_EVENTS.includes(n.eventCode));

  // توکن امضاشدهٔ کارنامهٔ مالی + QR استعلام برخط (بلوک مهر در بخش چاپی)
  const publicBaseUrl = await getPublicBaseUrl();
  let stmtVerifyUrl: string | null = null;
  let stmtQr = '';
  let stmtExpiresAt: string | null = null;
  try {
    const issued = await issueFinanceStatementToken(user.id, { id: me.id, code: me.studentCode, universityId: me.universityId });
    stmtVerifyUrl = `${publicBaseUrl}/verify-finance/${encodeURIComponent(issued.token)}`;
    stmtExpiresAt = issued.expiresAt;
    try {
      stmtQr = await qrSvg(stmtVerifyUrl, { errorCorrectionLevel: 'M' });
    } catch (err) {
      console.error('[student-finance] qr failed', err);
    }
  } catch (err) {
    console.error('[student-finance] statement token failed', err);
  }

  return (
    <div className="space-y-4" dir="rtl">
      {myRecords.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm print:hidden">
          <span className="font-bold text-slate-600">پروندهٔ مالی (مقطع):</span>
          {myRecords.map(r => (
            <a
              key={r.id}
              href={`/student/finance?record=${r.id}`}
              className={`rounded-lg border px-2.5 py-1 font-bold ${r.id === me.id
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {r.degreeTitle ?? 'مقطع نامشخص'} · <span className="font-mono" dir="ltr">{r.studentCode}</span>
            </a>
          ))}
          <span className="text-[10px] text-slate-400">مانده و ریز ترم‌به‌ترم هر مقطع جداست.</span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">💳 امور مالی من</h1>
          <p className="text-xs text-slate-500 mt-1">کارنامهٔ مالی ترم‌به‌ترم، چک‌ها و وام‌ها</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedTerm && (
            <TermFilterChip title={selectedTerm.title} universityId={me.universityId} />
          )}
          <PrintTranscriptButton orientation="portrait" />
        </div>
      </div>

      {/* ═══ هشهاد سررسید چک — بیرون از بخش چاپی تا همیشه دیده شود ═══ */}
      {dueSoon.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 print:hidden">
          <p className="text-sm font-bold text-amber-900">⚠️ چک در شرف سررسید</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-900">
            {dueSoon.map((c) => (
              <li key={c.id}>
                چک شمارهٔ {faDigits(c.chequeNo || '—')}
                {c.bankName ? ` بانک ${c.bankName}` : ''} به مبلغ {fa(toNum(c.amount))} ریال —{' '}
                {c.daysLeft !== null && c.daysLeft < 0
                  ? <span className="font-bold text-rose-700">از سررسید گذشته است</span>
                  : c.daysLeft === 0
                    ? <span className="font-bold">امروز سررسید می‌شود</span>
                    : <span>{faDigits(String(c.daysLeft))} روز تا سررسید</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-amber-800">
            لطفاً پیش از سررسید نسبت به تأمین موجودی اقدام کنید تا چک برگشت نخورد.
          </p>
        </div>
      )}

      {/* ═══ پیام‌های مالی ═══ */}
      {financeNotifications.length > 0 && (
        <div className="card print:hidden">
          <h2 className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-800">پیام‌های مالی</h2>
          <ul className="space-y-2">
            {financeNotifications.map((n) => {
              let text = '';
              try { text = JSON.parse(n.payload || '{}').text || ''; } catch { text = ''; }
              return (
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 text-xs">
                  <span className="text-slate-700">{text || n.eventCode}</span>
                  <span className="text-[11px] text-slate-400">{jdate(n.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ═══ بخش چاپ‌شدنی: کارنامهٔ مالی رسمی ═══ */}
      <div className="print-area space-y-4">
        <FinancialTranscript
          student={student}
          terms={transcriptWithCourses}
          totals={totals}
          universityTitle={uniTitle}
          logoUrl={universityLogo}
          issuedAt={jdate(new Date())}
          scopeLabel={selectedTerm ? `جمع نیمسال ${selectedTerm.title}` : undefined}
          cheques={visibleCheques.map((c) => ({
            id: c.id, chequeNo: c.chequeNo, bankName: c.bankName,
            amount: toNum(c.amount), dueDate: c.dueDate, status: c.status,
          }))}
          loans={visibleLoans.map((l) => ({
            id: l.id, productTitle: l.productTitle, lender: l.lender,
            amount: toNum(l.amount), installments: l.installments, status: l.status,
          }))}
          verifyBlock={
            stmtVerifyUrl ? (
              <div className="rounded-lg border border-slate-700 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {stmtQr ? (
                      <div className="h-24 w-24 shrink-0 border border-slate-300 bg-white p-1" dangerouslySetInnerHTML={{ __html: stmtQr }} />
                    ) : null}
                    <div className="text-[11px] leading-6 text-slate-600">
                      <p className="font-bold text-slate-800">استعلام برخط اصالت این کارنامه</p>
                      <p className="break-all font-mono text-[10px] text-slate-500" dir="ltr">{stmtVerifyUrl}</p>
                      {stmtExpiresAt && (
                        <p>اعتبار استعلام تا {jdate(new Date(stmtExpiresAt))}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null
          }
        />
      </div>
    </div>
  );
}
