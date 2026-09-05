import { and, eq, inArray } from 'drizzle-orm';
import { createHash, randomInt } from 'node:crypto';
import { db } from '@/db';
import {
  academic_terms, course_offerings, courses, departments, document_signatures,
  electronic_documents, professor_term_contracts, schedules, staff, signature_otps,
} from '@/db/schema';
import { getSetting } from '@/lib/settings';
import { isDemoMode } from '@/lib/auth';
import { logger as log } from '@/lib/logger';

/** تعداد هفته‌های تدریس در هر نیمسال (هم‌راستا با مولد جلسات) */
export const TERM_WEEKS = 16;

export type ContractLine = {
  offeringId: number;
  code: string;
  title: string;
  groupNumber: number;
  theoryUnits: number;
  practicalUnits: number;
  weeklyHours: number;
  termTotalHours: number;
};

export type ContractDraft = {
  contractNo: string;
  contractDate: string;
  termTitle: string;
  professorName: string;
  nationalCode: string;
  staffCode: string;
  bankAccountNo: string;
  staffType: string;
  academicRank: string;
  degree: string;
  departmentName: string;
  cooperationType: string;
  hourlyRate: number;
  lines: ContractLine[];
  totalTermHours: number;
  totalUnits: number;
  grossAmount: number;
  taxRatePercent: number;
  taxDeduction: number;
  insuranceRatePercent: number;
  insuranceDeduction: number;
  netAmount: number;
  midtermPayment: number;
  finalPayment: number;
};

/** نرخ‌ها و درصدها از تنظیمات سامانه (قابل مدیریت توسط مدیر در «تنظیمات») */
export async function contractSettings() {
  const hourlyRate = Number((await getSetting('HOURLY_RATE_TMN')) || 850000);
  const taxRatePercent = Number((await getSetting('CONTRACT_TAX_PERCENT')) || 10);
  const insuranceRatePercent = Number((await getSetting('CONTRACT_INSURANCE_PERCENT')) || 7);
  return { hourlyRate, taxRatePercent, insuranceRatePercent };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** قراردادِ واقعیِ استاد از درس‌های واقعی او در ترم (نه دادهٔ ثابت) */
export async function buildContractDraft(staffId: number, termId: number): Promise<ContractDraft | null> {
  const [me] = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
  if (!me) return null;
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  if (!term) return null;

  const offers = await db
    .select({ offering: course_offerings, course: courses })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(course_offerings.professorId, staffId), eq(course_offerings.termId, termId), eq(course_offerings.isActive, 1)));

  const lines: ContractLine[] = [];
  for (const { offering, course } of offers) {
    const rows = await db
      .select({ startTime: schedules.startTime, endTime: schedules.endTime })
      .from(schedules)
      .where(and(eq(schedules.offeringId, offering.id), eq(schedules.scheduleType, 'CLASS')));
    const weekly = rows.reduce((acc, r) => {
      const [sh, sm] = String(r.startTime).split(':').map(Number);
      const [eh, em] = String(r.endTime).split(':').map(Number);
      return acc + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    }, 0);
    const weeklyHours = Math.max(weekly, Number(course.units) || 1);
    lines.push({
      offeringId: offering.id,
      code: course.code,
      title: course.title,
      groupNumber: offering.groupNumber,
      theoryUnits: Number(course.theoreticalUnits ?? 0),
      practicalUnits: Number(course.practicalUnits ?? 0),
      weeklyHours: round2(weeklyHours),
      termTotalHours: round2(weeklyHours * TERM_WEEKS),
    });
  }

  const { hourlyRate, taxRatePercent, insuranceRatePercent } = await contractSettings();
  const totalTermHours = round2(lines.reduce((s, l) => s + l.termTotalHours, 0));
  const totalUnits = round2(lines.reduce((s, l) => s + l.theoryUnits + l.practicalUnits, 0));
  const grossAmount = Math.round(totalTermHours * hourlyRate);
  const taxDeduction = Math.round((grossAmount * taxRatePercent) / 100);
  const insuranceDeduction = Math.round((grossAmount * insuranceRatePercent) / 100);
  const netAmount = grossAmount - taxDeduction - insuranceDeduction;

  const [dep] = me.departmentId
    ? await db.select({ name: departments.name }).from(departments).where(eq(departments.id, me.departmentId)).limit(1)
    : [];

  const contractNo = `CON-${term.termCode}-${me.staffCode.replace(/\D/g, '').slice(-4)}`;

  return {
    contractNo,
    contractDate: new Date().toLocaleDateString('fa-IR'),
    termTitle: term.title,
    professorName: '',
    nationalCode: '',
    staffCode: me.staffCode,
    bankAccountNo: me.bankAccountNo || '',
    staffType: me.staffType || '',
    academicRank: me.academicRank || '',
    degree: me.degree || '',
    departmentName: dep?.name || '',
    cooperationType: me.cooperationType || 'حق‌التدریس',
    hourlyRate,
    lines,
    totalTermHours,
    totalUnits,
    grossAmount,
    taxRatePercent,
    taxDeduction,
    insuranceRatePercent,
    insuranceDeduction,
    netAmount,
    midtermPayment: Math.round(netAmount / 2),
    finalPayment: netAmount - Math.round(netAmount / 2),
  };
}

/** بازسازی «نام استاد» از کاربر (سرویس‌ساید) هنگام ساخت سند */
export function attachProfessorIdentity(draft: ContractDraft, name: string, nationalCode: string): ContractDraft {
  return { ...draft, professorName: name, nationalCode };
}

/** JSON پایدار (مرتب) برای هش واقعی SHA-256 سند */
export function canonicalJson(obj: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const val = (v as Record<string, unknown>)[k];
        if (val !== undefined && val !== null) out[k] = normalize(val);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(normalize(obj));
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * ساخت/بروزرسانی رکورد قرارداد و سند الکترونیک (idempotent):
 * سند PENDING هر بار با آخرین دادهٔ واقعی بازنویسی می‌شود؛ سند SIGNED دست‌نخورده می‌ماند.
 */
export async function ensureContractDocument(staffId: number, termId: number, identity: { name: string; nationalCode: string }) {
  const draft = await buildContractDraft(staffId, termId);
  if (!draft) return { ok: false as const, error: 'دادهٔ قرارداد قابل ساخت نیست (پروندهٔ استاد یا ترم ناقص است).' };
  const full = attachProfessorIdentity(draft, identity.name, identity.nationalCode);

  const [existing] = await db.select().from(electronic_documents)
    .where(and(eq(electronic_documents.staffId, staffId), eq(electronic_documents.termId, termId), eq(electronic_documents.docType, 'TEACHING_CONTRACT')))
    .limit(1);

  const snapshot = JSON.stringify(full);
  const hash = sha256Hex(canonicalJson(full));

  if (existing) {
    if (existing.signatureStatus === 'SIGNED') {
      return { ok: true as const, documentId: existing.id, signed: true, contract: full };
    }
    await db.update(electronic_documents).set({ documentSnapshot: snapshot, documentHash: hash }).where(eq(electronic_documents.id, existing.id));
    return { ok: true as const, documentId: existing.id, signed: false, contract: full };
  }

  // ردیف قرارداد ترم (معیار حقوقی/مالی)
  const [contractRow] = await db.insert(professor_term_contracts).values({
    staffId, termId,
    contractType: 'HOUR_RATE',
    taxRate: String(full.taxRatePercent),
  }).returning({ id: professor_term_contracts.id });

  const [doc] = await db.insert(electronic_documents).values({
    contractId: contractRow.id,
    staffId, termId,
    docType: 'TEACHING_CONTRACT',
    title: `قرارداد تدریس — ${full.termTitle} — ${full.professorName}`,
    documentSnapshot: snapshot,
    documentHash: hash,
    signatureStatus: 'PENDING',
  }).returning({ id: electronic_documents.id });

  return { ok: true as const, documentId: doc.id, signed: false, contract: full };
}

/** صدور کد یکبارمصرف امضای قرارداد (هش SHA-256؛ کد خام فقط در دمو برگردانده می‌شود) */
export async function issueContractOtp(staffId: number, documentId: number): Promise<{ ok: boolean; demoOtp?: string; error?: string }> {
  const code = String(randomInt(10000, 100000));
  const hash = sha256Hex(code);
  await db.insert(signature_otps).values({
    staffId, purpose: 'CONTRACT_SIGN', refId: documentId, otpHash: hash,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  return { ok: true, demoOtp: isDemoMode() ? code : undefined };
}

/** تأیید و امضای قرارداد — فقط با OTP معتبرِ استفاده‌نشده و منقضی‌نشده */
export async function signContract(
  staffId: number, documentId: number, otp: string, ip: string, userAgent: string,
): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db.select().from(signature_otps)
    .where(and(eq(signature_otps.staffId, staffId), eq(signature_otps.purpose, 'CONTRACT_SIGN'), eq(signature_otps.refId, documentId), eq(signature_otps.isUsed, 0)))
    .orderBy(signature_otps.id).limit(1);
  if (!row) return { ok: false, error: 'کد تأییدی فعالی وجود ندارد؛ دوباره درخواست کد بدهید.' };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false, error: 'کد منقضی شده است؛ کد جدید بگیرید.' };
  if (row.lockedAt) return { ok: false, error: 'به دلیل تلاش‌های ناموفق، درخواست امضا قفل شده است.' };

  const inputHash = sha256Hex(otp.trim());
  if (inputHash !== row.otpHash) {
    const attempts = (row.attempts ?? 0) + 1;
    await db.update(signature_otps).set({ attempts, lockedAt: attempts >= 5 ? new Date() : null }).where(eq(signature_otps.id, row.id));
    return { ok: false, error: `کد تأیید نادرست است. (تلاش ${attempts} از ۵)` };
  }

  await db.update(signature_otps).set({ isUsed: 1 }).where(eq(signature_otps.id, row.id));
  const now = new Date();
  const [doc] = await db.select({ hash: electronic_documents.documentHash, contractNo: electronic_documents.title })
    .from(electronic_documents).where(eq(electronic_documents.id, documentId)).limit(1);
  await db.update(electronic_documents).set({ signatureStatus: 'SIGNED', signedAt: now }).where(eq(electronic_documents.id, documentId));
  await db.insert(document_signatures).values({
    documentId, staffId, signedAt: now, ipAddress: ip, userAgent: String(userAgent).slice(0, 300), otpUsed: `***${otp.trim().slice(-2)}`,
  });
  log.info('contract_signed', { documentId, staffId, hash: doc?.hash?.slice(0, 16) ?? '' });
  return { ok: true };
}
