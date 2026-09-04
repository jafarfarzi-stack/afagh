import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '@/db';
import {
  academic_terms, audit_logs, class_sessions, course_offerings, courses,
  electronic_documents, enrollments, offering_professors, payroll_calculation_rules,
  payroll_statements, professor_term_contracts, staff, teaching_coefficients,
  teaching_rates, users,
} from '@/db/schema';
import { getFiscalYear, getNumber, getSetting } from '@/lib/settings';
import { notifyUserMultichannel } from '@/lib/messaging';
import { intToUnits, percentOf, ratioOf, sumUnits, toRial, UNIT_SCALE, unitsToInt } from '@/lib/money';
import { groupThousands } from '@/lib/calendar';
import { createLogger } from '@/lib/logger';

// ══════════════════════════════════════════════════════════════════════
//  موتور حق‌التدریس اساتید (Payroll Engine) — نسخهٔ PostgreSQL/Drizzle
//
//  سه اصلاح ساختاری نسبت به نسخهٔ SQLite:
//
//  ۱) حذف N+1 — پیش‌تر به ازای هر استاد، چند کوئری جدا اجرا می‌شد (کلاس‌ها،
//     جلسات، نمرات، اسناد، فیش). حالا کل ترم با «۱۱ کوئری SQL ثابت» بارگذاری
//     می‌شود (۷ کوئری حجمی دادهٔ ترم + ۴ کوئری پیکربندی کوچک که قابل کش است)
//     و محاسبات در حافظه انجام می‌گیرد؛ تعداد کوئری‌ها با تعداد استاد رشد
//     نمی‌کند (۱۵۰۰ استاد = همان ۱۱ کوئری — در تست بار روی PostgreSQL زنده
//     تأیید شد). همچنین در تسویهٔ نهایی، چک گلوگاه داخل تراکنش با دو کوئری
//     سبک سطری (loadStaffGates) انجام می‌شود نه بارگذاری مجدد کل ترم؛
//     پرداخت دسته‌ای ۵۰۰ استاد از ~۳۲۰ ثانیه به ~۶٫۶ ثانیه رسید.
//
//  ۲) پول با عدد صحیح — همهٔ محاسبات ریالی روی اعداد صحیح و با گردکردن به
//     مضرب ۱۰ ریال انجام می‌شود؛ دیگر `0.1 + 0.2` در فیش مالی ظاهر نمی‌شود.
//
//  ۳) کسور واقعی — «کسر غیبت بدون جلسهٔ جبرانی» پیش‌تر فقط در فیش نمایش داده
//     می‌شد ولی از مبلغ خالص کم نمی‌شد. حالا هم در deductions می‌نشیند و هم از
//     مأخذ مالیات و مبلغ خالص کسر می‌شود.
//
//  گردش پرداخت:  DRAFT → MID_TERM_PAID (علی‌الحساب) → FINAL_SETTLED
//  گلوگاه تسویه: ① همهٔ نمرات استاد FINALIZED  ② همهٔ اسناد او SIGNED
// ══════════════════════════════════════════════════════════════════════

const log = createLogger({ mod: 'payroll' });

export type PayrollStatus = 'DRAFT' | 'MID_TERM_PAID' | 'FINAL_SETTLED';

export type PayrollRow = {
  offeringId: number;
  courseCode: string;
  courseTitle: string;
  units: number;
  groupNumber: number | null;
  payRole: string;
  offeringType: string;
  coefficients: string;
  equivalentUnits: number;     // واحد معادل (با ضریب و سهم)
  sessions: { planned: number; held: number; absents: number; makeup: number; netAbsences: number };
  effectiveUnits: number;      // واحد مؤثر پس از کسر غیبت
  absenceDeductionRial: number;
  grossRial: number;           // مبلغ ناخالص این ردیف (پیش از کسر غیبت)
  ruleTitle?: string | null;
};

export type StaffPayroll = {
  staff: { id: number; name: string; staffCode: string | null; rank: string | null; degree: string | null; contractType: string | null };
  rate: number;
  dutyUnits: number;
  taxRate: number;
  rows: PayrollRow[];
  totalEquivalentUnits: number;
  totalEffectiveUnits: number;
  payableUnits: number;
  gross: number;
  absenceDeductionRial: number;
  tax: number;
  net: number;
  gates: { gradesFinalized: boolean; pendingGrades: number; docsSigned: boolean; unsignedDocs: number };
  hasContract: boolean;
};

export type PayrollOverviewItem = StaffPayroll['staff'] & {
  rate: number;
  totalEquivalentUnits: number;
  totalEffectiveUnits: number;
  payableUnits: number;
  gross: number;
  tax: number;
  absenceDeductionRial: number;
  net: number;
  status: PayrollStatus | 'NOT_COMPUTED';
  statementId: number | null;
  midtermPaid: number;
  finalPaid: number;
  remaining: number;
  gates: StaffPayroll['gates'];
};

type Coefs = { practical: number; msLevel: number; crowded: number };

type StaffMeta = { name: string; staffCode: string | null; rank: string | null; degree: string | null; userId: number };

type StaffOffering = {
  offeringId: number; courseCode: string; courseTitle: string; unitsInt: number; practicalUnits: number;
  groupNumber: number | null; enrolledCount: number; offeringType: string; payRole: string; sharePct: number;
};

type SessionStats = { planned: number; held: number; absents: number; makeup: number; netAbsences: number };

type StatementRow = {
  id: number; contractId: number; staffId: number;
  totalEquivalentUnits: string | null; payableUnits: string | null; grossAmount: string | null;
  deductions: string | null; netAmount: string | null; status: string | null; detailJson: string | null;
  midtermPaidAmount: string | null; midtermPaidAt: Date | null; finalPaidAmount: string | null; finalPaidAt: Date | null;
  computedAt: Date | null;
};

type ContractRow = { id: number; staffId: number; contractType: string | null; baseDutyUnits: number; taxRate: number };

const ROLE_FA: Record<string, string> = {
  MAIN_LECTURER: 'مدرس اصلی', SUPERVISOR: 'استاد راهنما', ADVISOR: 'استاد مشاور',
  REVIEWER: 'داور', EXAMINER: 'ممتحن',
};
const TYPE_FA: Record<string, string> = {
  THEORY: 'نظری', THESIS: 'پایان‌نامه', DIRECTED_READING: 'معرفی به استاد',
  INTERNSHIP: 'کارآموزی', NORMAL: 'نظری', TRANSFER: 'تطبیق واحد',
};

// ─────────────────── بارگذاری تنظیمات داده‌محور ───────────────────

/** ضرایب از جدول teaching_coefficients — نام ردیف‌ها از تنظیمات می‌آید */
async function loadCoefficients(): Promise<Coefs> {
  const [practicalName, msName, crowdedName] = await Promise.all([
    getSetting('PAYROLL_COEF_PRACTICAL'),
    getSetting('PAYROLL_COEF_MS_LEVEL'),
    getSetting('PAYROLL_COEF_CROWDED'),
  ]);
  const rows = await db
    .select({ ruleName: teaching_coefficients.ruleName, multiplier: teaching_coefficients.multiplier })
    .from(teaching_coefficients);
  const map = new Map(rows.map(r => [r.ruleName, Number(r.multiplier)]));
  const num = (name: string, fallback: number) => {
    const v = map.get(name);
    return Number.isFinite(v) && (v as number) > 0 ? (v as number) : fallback;
  };
  return { practical: num(practicalName, 1), msLevel: num(msName, 1), crowded: num(crowdedName, 1) };
}

/** قوانین فرمول‌ساز (payroll_calculation_rules) — خاص‌ترین قاعده برنده است */
type PayRule = {
  id: number; offeringType: string | null; professorRole: string | null; academicRank: string | null;
  multiplierUnit: number | null; multiplierPerStudent: number | null; flatFee: number | null; title: string | null;
};

async function loadPayRules(): Promise<PayRule[]> {
  const rows = await db
    .select()
    .from(payroll_calculation_rules)
    .where(eq(payroll_calculation_rules.isActive, 1));
  return rows
    .filter(r => r.offeringType || r.professorRole)   // قاعده باید اختصاصی باشد
    .map(r => ({
      id: r.id,
      offeringType: r.offeringType,
      professorRole: r.professorRole,
      academicRank: r.academicRank,
      multiplierUnit: r.multiplierUnit == null ? null : Number(r.multiplierUnit),
      multiplierPerStudent: r.multiplierPerStudent == null ? null : Number(r.multiplierPerStudent),
      flatFee: r.flatFee == null ? null : Number(r.flatFee),
      title: r.title,
    }))
    .sort((a, b) => score(b) - score(a) || a.id - b.id);
}

function score(r: PayRule) {
  return (r.offeringType ? 1 : 0) + (r.professorRole ? 1 : 0) + (r.academicRank ? 1 : 0);
}

function matchRule(rules: PayRule[], offeringType: string, role: string, rank: string | null): PayRule | null {
  const t = offeringType === 'NORMAL' ? 'THEORY' : offeringType;
  return rules.find(r =>
    (!r.offeringType || r.offeringType === t) &&
    (!r.professorRole || r.professorRole === role) &&
    (!r.academicRank || r.academicRank === rank),
  ) ?? null;
}

// ─────────────────── بارگذاری دسته‌جمعی ترم (بدون N+1) ───────────────────

type TermData = {
  termId: number;
  termTitle: string;
  coefs: Coefs;
  rules: PayRule[];
  rateByStaff: Map<number, number>;
  contracts: Map<number, ContractRow>;
  staffInfo: Map<number, StaffMeta>;
  offeringsByStaff: Map<number, StaffOffering[]>;
  sessionsByOffering: Map<number, SessionStats>;
  gatesByStaff: Map<number, { pendingGrades: number; unsignedDocs: number }>;
  statementsByStaff: Map<number, StatementRow>;
  msPrefixes: string[];
  crowdedThreshold: number;
  plannedSessionsDefault: number;
};

/** ترم جاری (یا ترم مشخص‌شده) */
export async function currentTerm(termId?: number) {
  const row = termId
    ? (await db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1))[0]
    : (await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1))[0];
  return row ?? null;
}

/**
 * بارگذاری کل دادهٔ لازم برای محاسبهٔ فیش همهٔ اساتید یک ترم.
 * تعداد کوئری‌ها ثابت است (۷) و به تعداد اساتید بستگی ندارد.
 */
export async function loadTermPayrollData(termId: number): Promise<TermData> {
  const [term, coefs, rules, contracts, staffRows, offeringRows, sessionRows, gradeRows, docRows, statementRows] =
    await Promise.all([
      db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1).then(r => r[0] ?? null),
      loadCoefficients(),
      loadPayRules(),

      // ۱) قراردادهای ترمی
      db.select().from(professor_term_contracts).where(eq(professor_term_contracts.termId, termId)),

      // ۲) اساتید + نام کاربری
      db.select({
        id: staff.id, userId: staff.userId, staffCode: staff.staffCode,
        academicRank: staff.academicRank, degree: staff.degree,
        firstName: users.firstName, lastName: users.lastName,
      }).from(staff).innerJoin(users, eq(users.id, staff.userId)),

      // ۳) کلاس‌های ترم + نقش و سهم هر استاد (یک کوئری برای همه)
      db.execute(sql`
        select o.id as "offeringId", o."professorId" as "professorId", o."groupNumber" as "groupNumber",
               o."enrolledCount" as "enrolledCount", o."offeringType" as "offeringType",
               c.code as "courseCode", c.title as "courseTitle", c.units as "units",
               coalesce(c."practicalUnits", 0) as "practicalUnits",
               op."staffId" as "coStaffId", op.role as "coRole", op."sharePercentage" as "sharePct"
        from course_offerings o
        join courses c on c.id = o."courseId"
        left join offering_professors op on op."offeringId" = o.id
        where o."termId" = ${termId} and o."isActive" = 1
      `),

      // ۴) آمار جلسات همهٔ کلاس‌های ترم — یک GROUP BY
      db.execute(sql`
        select cs."offeringId" as "offeringId",
               sum(case when cs."isMakeUpSession" = 0 then 1 else 0 end) as planned,
               sum(case when cs.status = 'HELD' and cs."isMakeUpSession" = 0 then 1 else 0 end) as held,
               sum(case when cs.status = 'ABSENT' then 1 else 0 end) as absents,
               sum(case when cs.status = 'HELD' and cs."isMakeUpSession" = 1 then 1 else 0 end) as makeup
        from class_sessions cs
        join course_offerings o on o.id = cs."offeringId"
        where o."termId" = ${termId}
        group by cs."offeringId"
      `),

      // ۵) گلوگاه ۱: نمرات قطعی‌نشده به تفکیک استاد — یک GROUP BY
      db.execute(sql`
        select s.id as "staffId", count(e.id) as "pendingGrades"
        from staff s
        join course_offerings o on o."termId" = ${termId}
          and (o."professorId" = s.id or exists (select 1 from offering_professors op where op."offeringId" = o.id and op."staffId" = s.id))
        join enrollments e on e."offeringId" = o.id and e.status = 'REGISTERED' and coalesce(e."gradeStatus", '') <> 'FINALIZED'
        group by s.id
      `),

      // ۶) گلوگاه ۲: اسناد امضانشده — یک GROUP BY
      db.execute(sql`
        select ed."staffId" as "staffId", count(*) as "unsignedDocs"
        from electronic_documents ed
        where ed."termId" = ${termId} and coalesce(ed."signatureStatus", '') <> 'SIGNED'
        group by ed."staffId"
      `),

      // ۷) فیش‌های محاسبه‌شده
      db.select({
        id: payroll_statements.id, contractId: payroll_statements.contractId,
        staffId: professor_term_contracts.staffId,
        totalEquivalentUnits: payroll_statements.totalEquivalentUnits,
        payableUnits: payroll_statements.payableUnits, grossAmount: payroll_statements.grossAmount,
        deductions: payroll_statements.deductions, netAmount: payroll_statements.netAmount,
        status: payroll_statements.status, detailJson: payroll_statements.detailJson,
        midtermPaidAmount: payroll_statements.midtermPaidAmount, midtermPaidAt: payroll_statements.midtermPaidAt,
        finalPaidAmount: payroll_statements.finalPaidAmount, finalPaidAt: payroll_statements.finalPaidAt,
        computedAt: payroll_statements.computedAt,
      }).from(payroll_statements).innerJoin(
        professor_term_contracts, eq(professor_term_contracts.id, payroll_statements.contractId),
      ).where(eq(professor_term_contracts.termId, termId)),
    ]);

  const [crowdedThreshold, plannedSessionsDefault, msPrefixSetting] = await Promise.all([
    getNumber('PAYROLL_CROWDED_THRESHOLD', 40),
    getNumber('PAYROLL_TERM_SESSIONS', 16),
    getSetting('PAYROLL_MS_COURSE_PREFIX'),
  ]);

  // نرخ پایهٔ هر استاد: بیشترین سال مؤثر ≤ سال تحصیلی جاری
  const year = Number(await getFiscalYear());
  const rateRows = await db
    .select().from(teaching_rates)
    .orderBy(teaching_rates.effectiveYear);
  const rateByStaff = new Map<number, number>();
  const staffInfo = new Map<number, StaffMeta>();
  for (const s of staffRows) {
    staffInfo.set(s.id, {
      name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim(),
      staffCode: s.staffCode,
      rank: s.academicRank,
      degree: s.degree,
      userId: s.userId,
    });
    const applicable = rateRows
      .filter(r => r.academicRank === s.academicRank && r.degree === s.degree && Number(r.effectiveYear ?? 0) <= year)
      .sort((a, b) => Number(b.effectiveYear ?? 0) - Number(a.effectiveYear ?? 0));
    rateByStaff.set(s.id, Number(applicable[0]?.baseRatePerUnit ?? 0));
  }

  const contractsMap = new Map<number, ContractRow>();
  for (const c of contracts) {
    contractsMap.set(c.staffId, {
      id: c.id,
      staffId: c.staffId,
      contractType: c.contractType,
      baseDutyUnits: Number(c.baseDutyUnits ?? 0),
      taxRate: Number(c.taxRate ?? 0),
    });
  }

  // کلاس‌ها به تفکیک استاد (اصلی + همکار)
  const offeringsByStaff = new Map<number, StaffOffering[]>();
  const offRows = (offeringRows.rows ?? []) as {
    offeringId: number; professorId: number | null; groupNumber: number | null; enrolledCount: number;
    offeringType: string; courseCode: string; courseTitle: string; units: string | number;
    practicalUnits: string | number; coStaffId: number | null; coRole: string | null; sharePct: string | number | null;
  }[];
  const push = (staffId: number, row: any) => {
    const arr = offeringsByStaff.get(staffId);
    if (arr) arr.push(row);
    else offeringsByStaff.set(staffId, [row]);
  };
  for (const o of offRows) {
    const base = {
      offeringId: o.offeringId,
      courseCode: o.courseCode,
      courseTitle: o.courseTitle,
      unitsInt: unitsToInt(Number(o.units)),
      practicalUnits: Number(o.practicalUnits ?? 0),
      groupNumber: o.groupNumber,
      enrolledCount: Number(o.enrolledCount ?? 0),
      offeringType: o.offeringType ?? 'NORMAL',
    };
    if (o.coStaffId != null) {
      push(o.coStaffId, { ...base, payRole: o.coRole || 'MAIN_LECTURER', sharePct: Number(o.sharePct ?? 100) });
    } else if (o.professorId != null) {
      push(o.professorId, {
        ...base,
        payRole: base.offeringType === 'THESIS' ? 'SUPERVISOR' : 'MAIN_LECTURER',
        sharePct: 100,
      });
    }
  }

  const sessionsByOffering = new Map<number, SessionStats>();
  for (const r of (sessionRows.rows ?? []) as { offeringId: number; planned: string; held: string; absents: string; makeup: string }[]) {
    const held = Number(r.held ?? 0);
    const absents = Number(r.absents ?? 0);
    const makeup = Number(r.makeup ?? 0);
    // مبنای تناسب = جلسات «برگزارشدهٔ» اصلی. اگر غیبت‌ها را هم در مخرج بگذاریم،
    // کسر غیبت به‌طور خودکار کوچک می‌شود و اهرم حضور بی‌اثر می‌گردد.
    sessionsByOffering.set(r.offeringId, {
      planned: held,
      held,
      absents,
      makeup,
      netAbsences: Math.max(0, absents - makeup),
    });
  }

  const gatesByStaff = new Map<number, { pendingGrades: number; unsignedDocs: number }>();
  for (const r of (gradeRows.rows ?? []) as { staffId: number; pendingGrades: string }[]) {
    gatesByStaff.set(Number(r.staffId), { pendingGrades: Number(r.pendingGrades ?? 0), unsignedDocs: 0 });
  }
  for (const r of (docRows.rows ?? []) as { staffId: number; unsignedDocs: string }[]) {
    const cur = gatesByStaff.get(Number(r.staffId)) ?? { pendingGrades: 0, unsignedDocs: 0 };
    cur.unsignedDocs = Number(r.unsignedDocs ?? 0);
    gatesByStaff.set(Number(r.staffId), cur);
  }

  const statementsByStaff = new Map<number, StatementRow>();
  for (const s of statementRows as StatementRow[]) statementsByStaff.set(Number(s.staffId), s);

  return {
    termId,
    termTitle: term?.title ?? '',
    coefs,
    rules,
    rateByStaff,
    contracts: contractsMap,
    staffInfo,
    offeringsByStaff,
    sessionsByOffering,
    gatesByStaff,
    statementsByStaff,
    msPrefixes: msPrefixSetting.split(',').map(x => x.trim()).filter(Boolean),
    crowdedThreshold,
    plannedSessionsDefault,
  };
}

// ─────────────────── محاسبهٔ فیش یک استاد ───────────────────

/**
 * گلوگاه‌های یک استاد با دو کوئری سبک (index-friendly) به‌جای بارگذاری کامل ترم.
 * هم‌ارز منطقیِ کوئری‌های ۵ و ۶ در loadTermPayrollData است — فقط برای یک استاد.
 * علت وجود: settleFinal برای هر استاد داخل تراکنش گلوگاه را می‌چکد؛ بارگذاری کامل
 * ترم در آن نقطه با ۱۵۰۰ استاد یعنی ۵۰۰×۱۱ کوئری سنگین (مشاهده‌شده: ۳۲۰ ثانیه).
 */
async function loadStaffGates(
  q: Parameters<Parameters<typeof db.transaction>[0]>[0],
  termId: number,
  staffId: number,
) {
  const [gradeRow, docRow] = await Promise.all([
    q.execute(sql`
      select count(e.id) as "pendingGrades"
      from course_offerings o
      join enrollments e on e."offeringId" = o.id and e.status = 'REGISTERED' and coalesce(e."gradeStatus", '') <> 'FINALIZED'
      where o."termId" = ${termId}
        and (o."professorId" = ${staffId} or exists (select 1 from offering_professors op where op."offeringId" = o.id and op."staffId" = ${staffId}))
    `),
    q.execute(sql`
      select count(*) as "unsignedDocs"
      from electronic_documents ed
      where ed."termId" = ${termId} and ed."staffId" = ${staffId} and coalesce(ed."signatureStatus", '') <> 'SIGNED'
    `),
  ]);
  const pendingGrades = Number(gradeRow.rows[0]?.pendingGrades ?? 0);
  const unsignedDocs = Number(docRow.rows[0]?.unsignedDocs ?? 0);
  return { pendingGrades, unsignedDocs, gradesFinalized: pendingGrades === 0, docsSigned: unsignedDocs === 0 };
}

function gatesOf(data: TermData, staffId: number) {
  const g = data.gatesByStaff.get(staffId) ?? { pendingGrades: 0, unsignedDocs: 0 };
  return {
    pendingGrades: g.pendingGrades,
    unsignedDocs: g.unsignedDocs,
    gradesFinalized: g.pendingGrades === 0,
    docsSigned: g.unsignedDocs === 0,
  };
}

export function calcStaffPayrollFromData(data: TermData, staffId: number): StaffPayroll {
  const info = data.staffInfo.get(staffId);
  if (!info) throw new Error('استاد یافت نشد.');
  const contract = data.contracts.get(staffId);
  const rate = data.rateByStaff.get(staffId) ?? 0;
  const dutyUnits = contract?.baseDutyUnits ?? 0;
  const taxRate = contract?.taxRate ?? 0;
  const offerings = data.offeringsByStaff.get(staffId) ?? [];

  const rows: PayrollRow[] = [];
  let totalEquivInt = 0;
  let totalEffectiveInt = 0;
  let absenceDeductionRial = 0;

  for (const o of offerings) {
    const sessions = data.sessionsByOffering.get(o.offeringId) ?? { planned: 0, held: 0, absents: 0, makeup: 0, netAbsences: 0 };
    const rule = matchRule(data.rules, o.offeringType, o.payRole, info.rank);

    // ── مسیر فرمول اختصاصی (پایان‌نامه، معرفی به استاد و…) ──
    if (rule) {
      const students = o.enrolledCount;
      let rial = 0;
      let formula = '';
      if (rule.flatFee != null) {
        rial = toRial(Number(rule.flatFee) * Math.max(students, 1));
        formula = `مقطوع ${groupThousands(Number(rule.flatFee))} × ${Math.max(students, 1)}`;
      } else if (rule.multiplierPerStudent != null) {
        rial = toRial(rate * intToUnits(o.unitsInt) * students * rule.multiplierPerStudent);
        formula = `نرخ × ${intToUnits(o.unitsInt)} واحد × ${students} دانشجو × ${rule.multiplierPerStudent}`;
      } else {
        const m = rule.multiplierUnit ?? 1;
        rial = toRial(rate * intToUnits(o.unitsInt) * m);
        formula = `نرخ × ${intToUnits(o.unitsInt)} واحد × ${m}`;
      }
      const equivInt = rate > 0 ? Math.round((rial / rate) * UNIT_SCALE) : 0;
      const label = `فرمول ${TYPE_FA[o.offeringType] || o.offeringType}/${ROLE_FA[o.payRole] || o.payRole}: ${formula}`;
      totalEquivInt += equivInt;
      totalEffectiveInt += equivInt;
      rows.push({
        offeringId: o.offeringId, courseCode: o.courseCode, courseTitle: o.courseTitle,
        units: intToUnits(o.unitsInt), groupNumber: o.groupNumber, payRole: o.payRole, offeringType: o.offeringType,
        coefficients: label, equivalentUnits: intToUnits(equivInt), sessions,
        effectiveUnits: intToUnits(equivInt), absenceDeductionRial: 0, grossRial: rial, ruleTitle: rule.title,
      });
      continue;
    }

    // ── مسیر ضرایب استاندارد ──
    const applied: string[] = [];
    let multiplierInt = UNIT_SCALE; // 1.00 با مقیاس ۱۰۰
    if (o.practicalUnits > 0) { multiplierInt = Math.round(multiplierInt * data.coefs.practical); applied.push(`عملی ×${data.coefs.practical}`); }
    if (data.msPrefixes.some(p => o.courseCode.startsWith(p))) { multiplierInt = Math.round(multiplierInt * data.coefs.msLevel); applied.push(`ارشد ×${data.coefs.msLevel}`); }
    if (o.enrolledCount > data.crowdedThreshold) { multiplierInt = Math.round(multiplierInt * data.coefs.crowded); applied.push(`جمعی ×${data.coefs.crowded}`); }

    const sharePct = Number.isFinite(o.sharePct) ? o.sharePct : 100;
    if (sharePct < 100) applied.push(`سهم ${Math.round(sharePct)}٪`);

    const equivInt = Math.round((o.unitsInt * multiplierInt) / UNIT_SCALE * sharePct / 100);
    const planned = sessions.planned || data.plannedSessionsDefault;
    const effectiveInt = ratioOf(equivInt, planned - sessions.netAbsences, planned);
    const grossRial = toRial(intToUnits(equivInt) * rate);
    const deduction = toRial(intToUnits(equivInt - effectiveInt) * rate);

    totalEquivInt += equivInt;
    totalEffectiveInt += effectiveInt;
    absenceDeductionRial += deduction;

    rows.push({
      offeringId: o.offeringId, courseCode: o.courseCode, courseTitle: o.courseTitle,
      units: intToUnits(o.unitsInt), groupNumber: o.groupNumber, payRole: o.payRole, offeringType: o.offeringType,
      coefficients: applied.length ? applied.join('، ') : '—',
      equivalentUnits: intToUnits(equivInt), sessions,
      effectiveUnits: intToUnits(effectiveInt), absenceDeductionRial: deduction, grossRial, ruleTitle: null,
    });
  }

  const dutyInt = unitsToInt(dutyUnits);
  const payableInt = Math.max(0, totalEffectiveInt - dutyInt);
  const gross = toRial(intToUnits(payableInt) * rate);
  const absenceTotal = toRial(absenceDeductionRial);
  const taxable = Math.max(0, gross - absenceTotal);
  const tax = toRial((taxable * taxRate) / 100);
  const net = Math.max(0, taxable - tax);

  return {
    staff: {
      id: staffId, name: info.name, staffCode: info.staffCode,
      rank: info.rank, degree: info.degree, contractType: contract?.contractType ?? null,
    },
    rate, dutyUnits, taxRate, rows,
    totalEquivalentUnits: intToUnits(totalEquivInt),
    totalEffectiveUnits: intToUnits(totalEffectiveInt),
    payableUnits: intToUnits(payableInt),
    gross,
    absenceDeductionRial: absenceTotal,
    tax,
    net,
    gates: gatesOf(data, staffId),
    hasContract: Boolean(contract),
  };
}

/** محاسبهٔ فیش یک استاد (با بارگذاری مستقل داده) */
export async function calcStaffPayroll(staffId: number, termId?: number): Promise<StaffPayroll> {
  const term = await currentTerm(termId);
  if (!term) throw new Error('ترم جاری مشخص نیست.');
  const data = await loadTermPayrollData(term.id);
  return calcStaffPayrollFromData(data, staffId);
}

// ─────────────────── فیش کل ترم (کارشناس مالی) ───────────────────

export type ComputeTermResult = {
  ok: boolean;
  termTitle: string;
  computed: number;
  skippedNoContract: number;
  skippedSettled: number;
  totals: { gross: number; deductions: number; net: number };
};

/**
 * محاسبهٔ فیش همهٔ اساتید ترم — یک بار بارگذاری داده، سپس upsert دسته‌جمعی.
 * اساتید بدون قرارداد از محاسبه کنار گذاشته می‌شوند (نه خطا).
 */
export async function computeTermPayroll(actorUserId?: number | null, termId?: number): Promise<ComputeTermResult> {
  const term = await currentTerm(termId);
  if (!term) throw new Error('ترم جاری مشخص نیست.');
  const data = await loadTermPayrollData(term.id);

  const staffIds = Array.from(data.offeringsByStaff.keys());
  const values: (typeof payroll_statements.$inferInsert)[] = [];
  let computed = 0;
  let skippedNoContract = 0;
  let skippedSettled = 0;
  const totals = { gross: 0, deductions: 0, net: 0 };
  const updates: { id: number; set: Record<string, unknown> }[] = [];

  for (const staffId of staffIds) {
    const contract = data.contracts.get(staffId);
    if (!contract) { skippedNoContract++; continue; }
    const calc = calcStaffPayrollFromData(data, staffId);
    const deductions = calc.tax + calc.absenceDeductionRial;
    const detail = JSON.stringify({
      rows: calc.rows, rate: calc.rate, dutyUnits: calc.dutyUnits, taxRate: calc.taxRate,
      absenceDeductionRial: calc.absenceDeductionRial, staff: calc.staff, gates: calc.gates,
      engine: 'payroll-engine.v2', scale: UNIT_SCALE,
    });
    totals.gross += calc.gross;
    totals.deductions += deductions;
    totals.net += calc.net;

    const existing = data.statementsByStaff.get(staffId);
    if (existing && existing.status === 'FINAL_SETTLED') { skippedSettled++; continue; }

    if (existing?.id) {
      updates.push({
        id: existing.id,
        set: {
          totalEquivalentUnits: String(calc.totalEquivalentUnits),
          payableUnits: String(calc.payableUnits),
          grossAmount: String(calc.gross),
          deductions: String(deductions),
          netAmount: String(calc.net),
          detailJson: detail,
          computedAt: new Date(),
        },
      });
    } else {
      values.push({
        contractId: contract.id,
        totalEquivalentUnits: String(calc.totalEquivalentUnits),
        payableUnits: String(calc.payableUnits),
        grossAmount: String(calc.gross),
        deductions: String(deductions),
        netAmount: String(calc.net),
        detailJson: detail,
        status: 'DRAFT',
      });
    }
    computed++;
  }

  await db.transaction(async tx => {
    if (values.length) await tx.insert(payroll_statements).values(values);
    for (const u of updates) await tx.update(payroll_statements).set(u.set).where(eq(payroll_statements.id, u.id));
    await writeAudit(tx, actorUserId ?? null, 'PAYROLL_COMPUTED', 'term', term.id, {
      computed, skippedNoContract, skippedSettled, totals,
    });
  });

  log.info('payroll_computed', { termId: term.id, computed, skippedNoContract, skippedSettled });
  return { ok: true, termTitle: term.title, computed, skippedNoContract, skippedSettled, totals };
}

// ─────────────────── داشبورد مالی ───────────────────

export async function getOverview(termId?: number): Promise<{
  term: string;
  list: PayrollOverviewItem[];
  totals: { budget: number; paid: number; remaining: number; staffCount: number };
}> {
  const term = await currentTerm(termId);
  if (!term) throw new Error('ترم جاری مشخص نیست.');
  const data = await loadTermPayrollData(term.id);

  const list: PayrollOverviewItem[] = [];
  for (const staffId of Array.from(data.offeringsByStaff.keys())) {
    if (!data.contracts.has(staffId)) continue;   // بدون قرارداد → در فهرست پرداخت نیست
    const calc = calcStaffPayrollFromData(data, staffId);
    const ps = data.statementsByStaff.get(staffId);
    const midtermPaid = toRial(Number(ps?.midtermPaidAmount ?? 0));
    const finalPaid = toRial(Number(ps?.finalPaidAmount ?? 0));
    const status = (ps?.status as PayrollStatus | undefined) ?? 'NOT_COMPUTED';
    list.push({
      ...calc.staff,
      rate: calc.rate,
      totalEquivalentUnits: calc.totalEquivalentUnits,
      totalEffectiveUnits: calc.totalEffectiveUnits,
      payableUnits: calc.payableUnits,
      gross: calc.gross,
      tax: calc.tax,
      absenceDeductionRial: calc.absenceDeductionRial,
      net: calc.net,
      status,
      statementId: ps?.id ?? null,
      midtermPaid,
      finalPaid,
      remaining: status === 'FINAL_SETTLED' ? 0 : Math.max(0, calc.net - midtermPaid - finalPaid),
      gates: calc.gates,
    });
  }

  const totals = list.reduce(
    (a, x) => ({
      budget: a.budget + x.net,
      paid: a.paid + x.midtermPaid + x.finalPaid,
      remaining: a.remaining + x.remaining,
      staffCount: a.staffCount + 1,
    }),
    { budget: 0, paid: 0, remaining: 0, staffCount: 0 },
  );

  return { term: term.title, list, totals };
}

/** فیش جاری یک استاد — برای پرتال استاد */
export async function getStaffPayslip(staffId: number, termId?: number) {
  const term = await currentTerm(termId);
  if (!term) throw new Error('ترم جاری مشخص نیست.');
  const data = await loadTermPayrollData(term.id);
  const calc = calcStaffPayrollFromData(data, staffId);
  const ps = data.statementsByStaff.get(staffId);
  const midtermPaid = toRial(Number(ps?.midtermPaidAmount ?? 0));
  const finalPaid = toRial(Number(ps?.finalPaidAmount ?? 0));
  return {
    term: term.title,
    computed: Boolean(ps),
    calc,
    statement: ps
      ? {
          id: ps.id,
          status: ps.status as PayrollStatus,
          midtermPaidAmount: midtermPaid,
          midtermPaidAt: ps.midtermPaidAt,
          finalPaidAmount: finalPaid,
          finalPaidAt: ps.finalPaidAt,
          remaining: Math.max(0, calc.net - midtermPaid - finalPaid),
        }
      : null,
  };
}

// ─────────────────── پرداخت‌ها ───────────────────

/** زنجیرهٔ هش ممیزی — هر رکورد به رکورد قبلی گره می‌خورد */
async function writeAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actorUserId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  details: Record<string, unknown>,
) {
  // قفل آخرین رکورد → زنجیرهٔ هش در نوشتن‌های همزمان خطی می‌ماند
  const [last] = await tx.select({ hash: audit_logs.hash }).from(audit_logs).orderBy(sql`${audit_logs.id} desc`).limit(1).for('update');
  const prevHash = last?.hash ?? '';
  const hash = crypto
    .createHash('sha256')
    .update(`${prevHash}|${action}|${entityType}|${entityId ?? ''}|${JSON.stringify(details)}`)
    .digest('hex');
  await tx.insert(audit_logs).values({
    actorUserId, action, entityType, entityId,
    details: JSON.stringify(details), prevHash, hash,
  });
}

/** علی‌الحساب میان‌ترم — درصد از تنظیمات، پرداخت در تراکنش با قفل سطری */
export async function payMidterm(staffId: number, actorUserId?: number | null, termId?: number) {
  const term = await currentTerm(termId);
  if (!term) throw new Error('ترم جاری مشخص نیست.');
  const pct = await getNumber('PAYROLL_MIDTERM_PERCENT', 40);

  const { amount, userId } = await db.transaction(async tx => {
    const [ps] = await tx
      .select({
        id: payroll_statements.id, status: payroll_statements.status, netAmount: payroll_statements.netAmount,
        midtermPaidAmount: payroll_statements.midtermPaidAmount,
      })
      .from(payroll_statements)
      .innerJoin(professor_term_contracts, eq(professor_term_contracts.id, payroll_statements.contractId))
      .where(and(eq(professor_term_contracts.staffId, staffId), eq(professor_term_contracts.termId, term.id)))
      .for('update');
    if (!ps) throw new Error('ابتدا فیش ترم را محاسبه کنید.');
    if (ps.status !== 'DRAFT') throw new Error('علی‌الحساب میان‌ترم قبلاً پرداخت یا تسویه شده است.');

    const net = toRial(Number(ps.netAmount ?? 0));
    const amount = percentOf(net, pct);
    await tx
      .update(payroll_statements)
      .set({ midtermPaidAmount: String(amount), midtermPaidAt: new Date(), status: 'MID_TERM_PAID' })
      .where(eq(payroll_statements.id, ps.id));
    await writeAudit(tx, actorUserId ?? null, 'PAYROLL_MIDTERM', 'staff', staffId, { amount, pct, statementId: ps.id });

    const [st] = await tx.select({ userId: staff.userId }).from(staff).where(eq(staff.id, staffId)).limit(1);
    return { amount, userId: st?.userId ?? null };
  });

  if (userId) {
    await safeNotify(userId, 'PAYROLL_MIDTERM',
      `استاد گرامی، علی‌الحساب میان‌ترم حق‌التدریس شما به مبلغ ${groupThousands(amount)} ریال پرداخت شد.`);
  }
  return { ok: true, amount };
}

/** تسویهٔ نهایی — هر دو گلوگاه باید بسته باشد */
export async function settleFinal(staffId: number, actorUserId?: number | null, termId?: number) {
  const term = await currentTerm(termId);
  if (!term) throw new Error('ترم جاری مشخص نیست.');

  const { amount, userId, gates } = await db.transaction(async tx => {
    const [ps] = await tx
      .select({
        id: payroll_statements.id, status: payroll_statements.status, netAmount: payroll_statements.netAmount,
        midtermPaidAmount: payroll_statements.midtermPaidAmount, finalPaidAmount: payroll_statements.finalPaidAmount,
      })
      .from(payroll_statements)
      .innerJoin(professor_term_contracts, eq(professor_term_contracts.id, payroll_statements.contractId))
      .where(and(eq(professor_term_contracts.staffId, staffId), eq(professor_term_contracts.termId, term.id)))
      .for('update');
    if (!ps) throw new Error('ابتدا فیش ترم را محاسبه کنید.');
    if (ps.status === 'FINAL_SETTLED') throw new Error('این فیش قبلاً تسویه شده است.');

    // گلوگاه‌ها داخل همان تراکنش خوانده می‌شوند تا بین بررسی و پرداخت چیزی عوض نشود
    // (دو کوئری سبک به‌جای بارگذاری کامل ترم — برای پرداخت دسته‌ای صدها برابر سریع‌تر)
    const g = await loadStaffGates(tx, term.id, staffId);
    if (!g.gradesFinalized) throw new Error(`گلوگاه تسویه: ${g.pendingGrades} نمره هنوز FINALIZED نشده است.`);
    if (!g.docsSigned) throw new Error(`گلوگاه تسویه: ${g.unsignedDocs} سند الکترونیکی امضانشده دارید.`);

    const net = toRial(Number(ps.netAmount ?? 0));
    const paid = toRial(Number(ps.midtermPaidAmount ?? 0)) + toRial(Number(ps.finalPaidAmount ?? 0));
    const amount = Math.max(0, net - paid);

    await tx
      .update(payroll_statements)
      .set({ finalPaidAmount: String(amount), finalPaidAt: new Date(), status: 'FINAL_SETTLED' })
      .where(eq(payroll_statements.id, ps.id));
    await writeAudit(tx, actorUserId ?? null, 'PAYROLL_SETTLED', 'staff', staffId, { amount, statementId: ps.id, gates: g });

    const [st] = await tx.select({ userId: staff.userId }).from(staff).where(eq(staff.id, staffId)).limit(1);
    return { amount, userId: st?.userId ?? null, gates: g };
  });

  if (userId) {
    await safeNotify(userId, 'PAYROLL_SETTLED',
      `استاد گرامی، تسویهٔ نهایی حق‌التدریس ترم به مبلغ ${groupThousands(amount)} ریال انجام شد. سپاس از به‌موقع‌بودن ثبت نمرات.`);
  }
  return { ok: true, amount, gates };
}

/** خروجی واریز دسته‌جمعی (CSV بانکی) */
export async function exportBatch(termId?: number) {
  const ov = await getOverview(termId);
  const lines = ['شناسه پرسنلی,نام استاد,مبلغ قابل واریز (ریال),وضعیت'];
  let count = 0;
  for (const x of ov.list) {
    if (x.status === 'NOT_COMPUTED') continue;
    const amt = x.status === 'FINAL_SETTLED' ? 0 : x.remaining;
    lines.push(`"${x.staffCode ?? x.id}","${x.name}",${amt},${x.status}`);
    count++;
  }
  return { csv: lines.join('\n'), count, term: ov.term, totals: ov.totals };
}

async function safeNotify(userId: number, eventCode: string, text: string) {
  try {
    await notifyUserMultichannel({ userId, eventCode, text });
  } catch (err) {
    log.warn('payroll_notify_failed', { userId, eventCode, err: (err as Error).message });
  }
}

/** فهرست اساتیدی که در ترم کلاس دارند — برای کارتابل مالی */
export async function listPayableStaff(termId?: number) {
  const term = await currentTerm(termId);
  if (!term) return [];
  const data = await loadTermPayrollData(term.id);
  return Array.from(data.offeringsByStaff.keys())
    .map(id => ({ staffId: id, ...(data.staffInfo.get(id) ?? { name: '', staffCode: null, rank: null, degree: null, userId: 0 }), hasContract: data.contracts.has(id) }))
    .filter(x => x.hasContract);
}

/** قوانین فرمول‌ساز و ضرایب فعلی — برای نمایش شفاف در پنل مالی */
export async function listPayConfiguration() {
  const [rules, coefs, rates, year] = await Promise.all([
    loadPayRules(), loadCoefficients(), db.select().from(teaching_rates).orderBy(teaching_rates.effectiveYear), getFiscalYear(),
  ]);
  const [crowded, sessions, midterm] = await Promise.all([
    getNumber('PAYROLL_CROWDED_THRESHOLD', 40),
    getNumber('PAYROLL_TERM_SESSIONS', 16),
    getNumber('PAYROLL_MIDTERM_PERCENT', 40),
  ]);
  return { rules, coefs, rates, year, crowded, sessions, midterm };
}

/** مجموع واحد معادل تجمیعی (برای گزارش بودجه) */
export function sumPayroll(list: { net: number }[]) {
  return { net: sumUnits(list.map(x => x.net)), count: list.length };
}

export const PAYROLL_CONSTANTS = { UNIT_SCALE };
export type { PayRule };
