// ── گزارش‌های جمع‌آوری‌شده از میزهای خارج از reports/ (r-collect-external) ─────
// LINK_CARDS: صفحات کاملی که تعاملی/عملیاتی‌اند و مستقل می‌مانند (کاشی لینک).
// run(): فقط منطقی که به‌صورت server-side تمیز import می‌شود (lib موتورها /
// server action خواندنی)؛ هرچه page-bound یا client است عمداً delegate نشده.
import type { ReportFilters, ReportResult } from './actions';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { listFinanceStudents } from '@/lib/finance-engine';
import { getOverview } from '@/lib/payroll-engine';
import { managementOverview, facilitiesReport } from '@/lib/bi-engine';
import { listDossiers, WORKFLOW_STEPS } from '@/lib/graduation-engine';
import { getAllGradeAuditLogs } from '../grades/actions';

export const CARDS = [
  { kind: 'finance-worklist', icon: '🗂️', title: 'کارتابل مالی (مانده دانشجویان)', customs: [{ key: 'onlyDebtors', title: 'فقط بدهکار (1)' }] },
  { kind: 'payroll-overview', icon: '💵', title: 'حق‌التدریس اساتید', needsTerm: true },
  { kind: 'bi-teaching-quality', icon: '🎯', title: 'کیفیت تدریس اساتید (BI)' },
  { kind: 'bi-facilities', icon: '🏫', title: 'امکانات کلاس‌ها (BI)' },
  { kind: 'graduation-dossiers', icon: '🎓', title: 'پرونده‌های فراغت‌التحصیلی', customs: [{ key: 'dossierStatus', title: 'وضعیت (کد)' }] },
  { kind: 'grade-audit-log', icon: '📜', title: 'لاگ تغییرات نمرات' },
];

export const LINK_CARDS = [
  { kind: 'link-exams', icon: '🗂️', title: 'کارتابل برنامه‌ریزی امتحانات', href: '/admin/exams' },
  { kind: 'link-scheduling', icon: '📅', title: 'برنامه‌ریزی درسی گروه‌ها', href: '/admin/scheduling' },
  { kind: 'link-defense', icon: '🛡️', title: 'میز دفاع پایان‌نامه', href: '/admin/defense-scheduling' },
  { kind: 'link-student-finance', icon: '💳', title: 'امور مالی دانشجویان', href: '/admin/student-finance' },
  { kind: 'link-student-statement', icon: '📄', title: 'صورت‌حساب مالی دانشجو', href: '/admin/finance/reports/student-statement' },
  { kind: 'link-archive', icon: '🗄️', title: 'بایگانی مدارک', href: '/admin/archive' },
  { kind: 'link-student-cards', icon: '🪪', title: 'صدور کارت دانشجویی', href: '/admin/student-cards' },
  { kind: 'link-regulation-check', icon: '🔍', title: 'بررسی آیین‌نامه (تک‌دانشجو)', href: '/admin/regulation-check' },
  { kind: 'link-migration', icon: '🔁', title: 'انتقال داده + خروجی اکسل', href: '/admin/migration' },
  { kind: 'link-admissions', icon: '📥', title: 'پذیرش / داده سنجش', href: '/admin/admissions' },
  { kind: 'link-samin', icon: '📡', title: 'هاب ثمین', href: '/admin/samin' },
  { kind: 'link-workflows', icon: '🔀', title: 'فرآیندها و درخواست‌ها', href: '/admin/workflows' },
  { kind: 'link-pos', icon: '🏧', title: 'ترمینال‌های POS', href: '/admin/finance/pos' },
  { kind: 'link-students', icon: '🎓', title: 'پرونده دانشجویان', href: '/admin/students' },
  { kind: 'link-staff', icon: '👨‍🏫', title: 'اساتید و کارکنان', href: '/admin/staff' },
  { kind: 'link-curriculum', icon: '📚', title: 'برنامه درسی', href: '/admin/curriculum' },
  { kind: 'link-short-courses', icon: '🎯', title: 'دوره‌های کوتاه‌مدت', href: '/admin/short-courses' },
];

const PER = 50;
const FIN_ROLES = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];
const GRAD_ROLES = ['ADMIN', 'GRADUATEAFFAIRS'];

function pageOf<T>(columns: ReportResult['columns'], all: T[], f: ReportFilters, summary?: string): ReportResult {
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / PER));
  const page = Math.min(Math.max(1, f.page || 1), totalPages);
  const rows = all.slice((page - 1) * PER, page * PER) as unknown as Record<string, unknown>[];
  return { columns, rows, total, page, per: PER, totalPages, summary };
}

async function resolveTermId(code: string, universityId?: number): Promise<number | undefined> {
  const r = await db.execute<{ id: number }>(
    universityId
      ? sql`SELECT id FROM academic_terms WHERE "termCode" = ${code} AND "universityId" = ${universityId} ORDER BY id DESC LIMIT 1`
      : sql`SELECT id FROM academic_terms WHERE "termCode" = ${code} ORDER BY id DESC LIMIT 1`,
  );
  const id = r.rows[0]?.id;
  return typeof id === 'number' ? id : undefined;
}

const STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس', MID_TERM_PAID: 'میان‌ترم پرداخت', FINAL_SETTLED: 'تسویه نهایی', NOT_COMPUTED: 'محاسبه‌نشده',
};

export async function run(kind: string, f: ReportFilters): Promise<ReportResult | null> {
  // ── کارتابل مالی (موتور finance-engine — همان منبع صفحه /admin/finance) ──
  if (kind === 'finance-worklist') {
    await requireRole(FIN_ROLES);
    const onlyDebtors = f.onlyDebtors === true || f.onlyDebtors === 1 || f.onlyDebtors === '1';
    const search = (f.q || f.nationalCode || '').toString().trim() || null;
    const list = await listFinanceStudents({
      majorId: f.majorId || null,
      degreeLevelId: f.degreeId || null,
      entryYear: f.entryYear || null,
      search,
      onlyDebtors,
      limit: 1000,
      universityId: f.universityId || null,
    });
    const rows = list.map(s => ({
      code: s.studentCode, name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || '—',
      nc: s.nationalCode, major: s.majorTitle, degree: s.degreeTitle, y: s.entryYear,
      charges: s.charges, discounts: s.discounts, sponsorships: s.sponsorships,
      payments: s.payments, balance: s.balance, pending: s.pendingCheques,
    }));
    return pageOf(
      [
        { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
        { key: 'nc', title: 'کد ملی' }, { key: 'major', title: 'رشته' },
        { key: 'degree', title: 'مقطع' }, { key: 'y', title: 'ورودی' },
        { key: 'charges', title: 'بدهی' }, { key: 'discounts', title: 'تخفیف' },
        { key: 'sponsorships', title: 'حمایت' }, { key: 'payments', title: 'پرداخت' },
        { key: 'balance', title: 'مانده' }, { key: 'pending', title: 'چک در راه' },
      ],
      rows, f,
      `${rows.length.toLocaleString('fa-IR')} دانشجو (سقف ۱۰۰۰)${onlyDebtors ? ' — فقط بدهکار' : ''}`,
    );
  }

  // ── حق‌التدریس (موتور payroll-engine — همان منبع تب live صفحه /admin/payroll) ──
  if (kind === 'payroll-overview') {
    await requireRole(['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE']);
    const termId = f.term ? await resolveTermId(f.term, f.universityId || undefined) : undefined;
    const ov = await getOverview(termId, f.universityId || undefined);
    const q = (f.q || '').trim();
    const rows = ov.list
      .filter(x => !q || x.name.includes(q) || (x.staffCode ?? '').includes(q))
      .map(x => ({
        code: x.staffCode, name: x.name, rank: x.rank, contract: x.contractType,
        units: x.payableUnits, gross: x.gross, tax: x.tax, net: x.net,
        paid: x.midtermPaid + x.finalPaid, remaining: x.remaining,
        status: STATUS_FA[x.status] ?? x.status,
      }));
    return pageOf(
      [
        { key: 'code', title: 'کد پرسنلی' }, { key: 'name', title: 'استاد' },
        { key: 'rank', title: 'رتبه' }, { key: 'contract', title: 'قرارداد' },
        { key: 'units', title: 'واحد قابل پرداخت' }, { key: 'gross', title: 'ناخالص' },
        { key: 'tax', title: 'مالیات' }, { key: 'net', title: 'خالص' },
        { key: 'paid', title: 'پرداخت‌شده' }, { key: 'remaining', title: 'مانده' },
        { key: 'status', title: 'وضعیت' },
      ],
      rows, f,
      `ترم ${ov.term} — بودجه ${ov.totals.budget.toLocaleString('fa-IR')} — پرداخت ${ov.totals.paid.toLocaleString('fa-IR')} — مانده ${ov.totals.remaining.toLocaleString('fa-IR')} (${ov.totals.staffCount} استاد)`,
    );
  }

  // ── کیفیت تدریس BI (همان managementOverview صفحه /admin/bi) ──
  if (kind === 'bi-teaching-quality') {
    await requireRole(['ADMIN']);
    const ov = await managementOverview();
    const q = (f.q || '').trim();
    const rows = ov.list
      .filter(x => !q || x.name.includes(q) || (x.department ?? '').includes(q))
      .map(x => ({
        name: x.name, rankdept: `${x.rank ?? '—'} / ${x.department ?? '—'}`,
        score: x.score, respondents: x.respondents, offerings: x.offerings,
        status: x.flagged ? '⚠ نیازمند بررسی' : 'عادی',
      }));
    return pageOf(
      [
        { key: 'name', title: 'استاد' }, { key: 'rankdept', title: 'رتبه / گروه' },
        { key: 'score', title: 'نمره جاری' }, { key: 'respondents', title: 'پاسخ‌دهنده' },
        { key: 'offerings', title: 'کلاس' }, { key: 'status', title: 'وضعیت' },
      ],
      rows, f,
      `ترم ${ov.term}${ov.period ? ` — ${ov.period}` : ''} — آستانه ${ov.threshold} — ${ov.flaggedCount} علامت‌خورده`,
    );
  }

  // ── امکانات کلاس‌ها BI (همان facilitiesReport صفحه /admin/bi) ──
  if (kind === 'bi-facilities') {
    await requireRole(['ADMIN']);
    const rep = await facilitiesReport();
    const q = (f.q || '').trim();
    const rows = rep.rooms
      .filter(r => !q || r.room.includes(q) || (r.building ?? '').includes(q))
      .map(r => ({
        room: r.room, building: r.building ?? '—', worst: r.worstAxis,
        worstScore: r.worstScore, responses: r.responses,
        repair: r.needsRepair ? '🔧 نیازمند تعمیر' : 'سالم',
      }));
    return pageOf(
      [
        { key: 'room', title: 'کلاس' }, { key: 'building', title: 'ساختمان' },
        { key: 'worst', title: 'ضعیف‌ترین شاخص' }, { key: 'worstScore', title: 'نمره شاخص' },
        { key: 'responses', title: 'پاسخ' }, { key: 'repair', title: 'وضعیت' },
      ],
      rows, f,
      `${rep.needsRepairCount.toLocaleString('fa-IR')} کلاس نیازمند تعمیر (آستانه ${rep.repairThreshold})`,
    );
  }

  // ── پرونده‌های فراغت‌التحصیل (همان listDossiers صفحه /admin/graduation) ──
  if (kind === 'graduation-dossiers') {
    await requireRole(GRAD_ROLES);
    const st = (f.dossierStatus ?? '').toString().trim();
    const list = await listDossiers({
      status: st && st !== 'ALL' ? st : undefined,
      q: (f.q || '').trim() || undefined,
      universityId: f.universityId || undefined,
    });
    const titleOf = (c: string) => WORKFLOW_STEPS.find(s => s.code === c)?.title ?? c;
    const rows = list.map(d => ({
      code: d.studentCode, name: d.fullName, major: d.majorName, degree: d.degreeTitle,
      gpa: d.gpa, passed: d.passedUnits, required: d.requiredUnits,
      status: titleOf(d.workflowStatus), irandoc: d.irandocStatus ?? '—', last: d.lastEventAt ?? '—',
    }));
    return pageOf(
      [
        { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
        { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
        { key: 'gpa', title: 'معدل' }, { key: 'passed', title: 'واحد گذرانده' },
        { key: 'required', title: 'واحد لازم' }, { key: 'status', title: 'مرحله' },
        { key: 'irandoc', title: 'ایرانداک' }, { key: 'last', title: 'آخرین رویداد' },
      ],
      rows, f,
      `${rows.length.toLocaleString('fa-IR')} پرونده (سقف ۳۰۰)`,
    );
  }

  // ── لاگ تغییرات نمرات (همان getAllGradeAuditLogs در grades/actions) ──
  if (kind === 'grade-audit-log') {
    await requireRole(['ADMIN', 'GRADUATEAFFAIRS', 'EDU_EXPERT']);
    const q = (f.q || '').trim() || undefined;
    const fetched = await getAllGradeAuditLogs({ limit: 200, offset: 0, q });
    const rows = fetched
      .filter(r => !f.term || r.termCode === f.term)
      .map(r => ({
        date: r.createdAt ? new Date(r.createdAt as unknown as string).toISOString().slice(0, 16).replace('T', ' ') : '—',
        student: `#${r.studentId}`, course: `${r.courseCode ?? '—'} ${r.courseTitle ?? ''}`.trim(),
        term: r.termCode ?? '—', action: r.action,
        before: r.oldGradeValue ?? '—', after: r.newGradeValue ?? '—',
        actor: `${r.actorFirstName ?? ''} ${r.actorLastName ?? ''}`.trim() || `#${r.actorUserId ?? '—'}`,
        reason: r.reason ?? '—',
      }));
    return pageOf(
      [
        { key: 'date', title: 'تاریخ' }, { key: 'student', title: 'دانشجو' },
        { key: 'course', title: 'درس' }, { key: 'term', title: 'ترم' },
        { key: 'action', title: 'عملیات' }, { key: 'before', title: 'قبل' },
        { key: 'after', title: 'بعد' }, { key: 'actor', title: 'اقدام‌کننده' },
        { key: 'reason', title: 'دلیل' },
      ],
      rows, f,
      `${rows.length.toLocaleString('fa-IR')} رکورد (۲۰۰ لاگ اخیر)`,
    );
  }

  return null;
}
