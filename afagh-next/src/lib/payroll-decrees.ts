import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, staff, users } from '@/db/schema';
import {
  decree_counters,
  decree_items,
  exam_payments,
  qualitative_activity_types,
  staff_activity_entries,
  teaching_decrees,
} from '@/db/schema-payroll-plus';
import { calcStaffPayroll } from '@/lib/payroll-engine';
import { getSessionUser } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { DECREE_SECTIONS, DECREE_SECTION_FA, DECREE_STATUSES, DECREE_STATUS_FA } from '@/lib/decree-labels';

export { DECREE_SECTIONS, DECREE_SECTION_FA, DECREE_STATUSES, DECREE_STATUS_FA };

const log = createLogger({ mod: 'payroll-decrees' });

export type DecreeResult = { ok: true; id: number } | { ok: false; error: string };

export type DecreeListItem = {
  id: number;
  staffId: number;
  staffName: string;
  staffCode: string | null;
  termId: number;
  termTitle: string | null;
  secretariatNo: number;
  status: string;
  issuedAt: Date | null;
  createdAt: Date | null;
};

export type DecreeItemRow = {
  id: number;
  section: string;
  title: string;
  units: number | null;
  amount: number | null;
};

export type DecreeDetail = DecreeListItem & {
  snapshot: Record<string, unknown> | null;
  signers: { title: string; name: string }[];
  items: DecreeItemRow[];
  issuedByName: string | null;
};

/** فهرست ابلاغ‌های یک ترم (اختیاری: فقط یک استاد) */
export async function listDecrees(termId: number, universityId?: number | null, staffId?: number | null): Promise<DecreeListItem[]> {
  const conds = [eq(teaching_decrees.termId, termId)];
  if (universityId != null) conds.push(eq(teaching_decrees.universityId, universityId));
  if (staffId != null) conds.push(eq(teaching_decrees.staffId, staffId));
  const rows = await db
    .select({
      id: teaching_decrees.id,
      staffId: teaching_decrees.staffId,
      termId: teaching_decrees.termId,
      secretariatNo: teaching_decrees.secretariatNo,
      status: teaching_decrees.status,
      issuedAt: teaching_decrees.issuedAt,
      createdAt: teaching_decrees.createdAt,
      termTitle: academic_terms.title,
      staffCode: staff.staffCode,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(teaching_decrees)
    .innerJoin(academic_terms, eq(academic_terms.id, teaching_decrees.termId))
    .innerJoin(staff, eq(staff.id, teaching_decrees.staffId))
    .innerJoin(users, eq(users.id, staff.userId))
    .where(and(...conds))
    .orderBy(desc(teaching_decrees.secretariatNo));
  return rows.map(r => ({
    id: r.id,
    staffId: r.staffId,
    staffName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—',
    staffCode: r.staffCode,
    termId: r.termId,
    termTitle: r.termTitle,
    secretariatNo: r.secretariatNo,
    status: r.status,
    issuedAt: r.issuedAt,
    createdAt: r.createdAt,
  }));
}

/** جزئیات یک ابلاغ + اقلام ۷ بخش */
export async function getDecreeDetail(id: number): Promise<DecreeDetail | null> {
  const [d] = await db.select().from(teaching_decrees).where(eq(teaching_decrees.id, id)).limit(1);
  if (!d) return null;
  const [st] = await db
    .select({ staffCode: staff.staffCode, firstName: users.firstName, lastName: users.lastName })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .where(eq(staff.id, d.staffId))
    .limit(1);
  const [tm] = await db
    .select({ title: academic_terms.title })
    .from(academic_terms)
    .where(eq(academic_terms.id, d.termId))
    .limit(1);
  const items = await db
    .select({
      id: decree_items.id,
      section: decree_items.section,
      title: decree_items.title,
      units: decree_items.units,
      amount: decree_items.amount,
    })
    .from(decree_items)
    .where(eq(decree_items.decreeId, id))
    .orderBy(decree_items.id);
  let issuedByName: string | null = null;
  if (d.issuedBy != null) {
    const [u] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, d.issuedBy))
      .limit(1);
    if (u) issuedByName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null;
  }
  let snapshot: Record<string, unknown> | null = null;
  try { snapshot = d.snapshotJson ? (JSON.parse(d.snapshotJson) as Record<string, unknown>) : null; } catch { snapshot = null; }
  let signers: { title: string; name: string }[] = [];
  try {
    const s = d.signersJson ? (JSON.parse(d.signersJson) as unknown) : [];
    if (Array.isArray(s)) signers = s.filter((x): x is { title: string; name: string } => typeof x === 'object' && x !== null);
  } catch { signers = []; }
  return {
    id: d.id,
    staffId: d.staffId,
    staffName: st ? `${st.firstName ?? ''} ${st.lastName ?? ''}`.trim() || '—' : '—',
    staffCode: st?.staffCode ?? null,
    termId: d.termId,
    termTitle: tm?.title ?? null,
    secretariatNo: d.secretariatNo,
    status: d.status,
    issuedAt: d.issuedAt,
    createdAt: d.createdAt,
    snapshot,
    signers,
    issuedByName,
    items: items.map(i => ({
      id: i.id,
      section: i.section,
      title: i.title,
      units: i.units == null ? null : Number(i.units),
      amount: i.amount == null ? null : Number(i.amount),
    })),
  };
}

/** شمارهٔ دبیرخانهٔ بعدی دانشگاه (اتمیک: upsert شمارنده) */
async function nextSecretariatNo(universityId: number): Promise<number> {
  const [row] = await db
    .insert(decree_counters)
    .values({ universityId, lastNo: 1 })
    .onConflictDoUpdate({
      target: decree_counters.universityId,
      set: { lastNo: sql`${decree_counters.lastNo} + 1` },
    })
    .returning({ lastNo: decree_counters.lastNo });
  return row.lastNo;
}

/** صدور ابلاغ آموزشی: اسنپ‌شات محاسبه + اقلام بخش‌ها + شمارهٔ دبیرخانه */
export async function issueDecree(input: {
  staffId: number;
  termId: number;
  universityId: number;
  signers: { title: string; name: string }[];
}): Promise<DecreeResult> {
  const { staffId, termId, universityId } = input;
  try {
    const dup = await db
      .select({ id: teaching_decrees.id, status: teaching_decrees.status })
      .from(teaching_decrees)
      .where(and(eq(teaching_decrees.staffId, staffId), eq(teaching_decrees.termId, termId)))
      .limit(1);
    if (dup.length) {
      return {
        ok: false,
        error: dup[0].status === 'ISSUED'
          ? 'برای این استاد در این ترم ابلاغ صادرشده وجود دارد.'
          : 'برای این استاد در این ترم پیش‌نویس ابلاغ وجود دارد؛ ابتدا آن را نهایی یا حذف کنید.',
      };
    }

    // محاسبهٔ زندهٔ فیش → مبنای اسنپ‌شات (fail-closed: بدون قرارداد/محاسبه، ابلاغ صادر نمی‌شود)
    let calc;
    try {
      calc = await calcStaffPayroll(staffId, termId);
    } catch (e) {
      return { ok: false, error: `محاسبهٔ فیش ناموفق بود: ${(e as Error).message}` };
    }
    if (!calc.hasContract) {
      return { ok: false, error: 'استاد در این ترم قرارداد ندارد؛ ابتدا قرارداد بسازید.' };
    }

    const secretariatNo = await nextSecretariatNo(universityId);
    const cleanSigners = (input.signers ?? [])
      .filter(s => s && (s.title?.trim() || s.name?.trim()))
      .slice(0, 4)
      .map(s => ({ title: (s.title ?? '').trim(), name: (s.name ?? '').trim() }));

    const snapshot = {
      staff: calc.staff,
      rate: calc.rate,
      rateSource: calc.rateSource,
      dutyUnits: calc.dutyUnits,
      taxRate: calc.taxRate,
      totalEquivalentUnits: calc.totalEquivalentUnits,
      totalEffectiveUnits: calc.totalEffectiveUnits,
      payableUnits: calc.payableUnits,
      gross: calc.gross,
      tax: calc.tax,
      absenceDeductionRial: calc.absenceDeductionRial,
      net: calc.net,
      issuedAt: new Date().toISOString(),
    };

    const [decree] = await db
      .insert(teaching_decrees)
      .values({
        staffId,
        termId,
        secretariatNo,
        status: 'DRAFT',
        snapshotJson: JSON.stringify(snapshot),
        signersJson: JSON.stringify(cleanSigners),
        universityId,
      })
      .returning({ id: teaching_decrees.id });

    // ── اقلام بخش‌ها از همان محاسبه ──
    const items: { section: string; title: string; units: string | null; amount: string; metaJson: string }[] = [];
    for (const r of calc.rows) {
      const isThesis = r.offeringType === 'THESIS' || r.payRole === 'SUPERVISOR' || r.payRole === 'ADVISOR';
      items.push({
        section: isThesis ? 'THESIS' : 'COURSES',
        title: `${r.courseTitle} (گروه ${r.groupNumber ?? '—'})`,
        units: String(r.equivalentUnits ?? 0),
        amount: String(Math.round(Number(r.grossRial ?? 0))),
        metaJson: JSON.stringify({ offeringId: r.offeringId, courseCode: r.courseCode, ruleTitle: r.ruleTitle ?? null }),
      });
    }

    // فعالیت‌های تأییدشدهٔ ترم
    try {
      const acts = await db
        .select({
          title: qualitative_activity_types.title,
          quantity: staff_activity_entries.quantity,
          factor: qualitative_activity_types.quantFactor,
        })
        .from(staff_activity_entries)
        .innerJoin(qualitative_activity_types, eq(qualitative_activity_types.id, staff_activity_entries.activityTypeId))
        .where(and(
          eq(staff_activity_entries.staffId, staffId),
          eq(staff_activity_entries.termId, termId),
          eq(staff_activity_entries.status, 'APPROVED'),
        ));
      for (const a of acts) {
        const units = Number(a.quantity ?? 0) * Number(a.factor ?? 1);
        items.push({
          section: 'ACTIVITIES',
          title: `${a.title} — ${Number(a.quantity ?? 0)} مورد`,
          units: String(Math.round(units * 100) / 100),
          amount: '0',
          metaJson: JSON.stringify({ kind: 'activity' }),
        });
      }
    } catch (e) { log.warn('decree activities skipped', { staffId, termId, err: (e as Error).message }); }

    // پرداخت‌های امتحانی ترم
    try {
      const pays = await db
        .select({ source: exam_payments.source, sessionCount: exam_payments.sessionCount, amount: exam_payments.amount })
        .from(exam_payments)
        .where(and(eq(exam_payments.staffId, staffId), eq(exam_payments.termId, termId)));
      const SRC_FA: Record<string, string> = { INVIGILATION: 'مراقبت', CORRECTION: 'تصحیح', EXEC: 'اجرا' };
      for (const p of pays) {
        items.push({
          section: 'EXAM',
          title: `${SRC_FA[p.source] ?? p.source} — ${p.sessionCount ?? 0} جلسه`,
          units: null,
          amount: String(Number(p.amount ?? 0)),
          metaJson: JSON.stringify({ kind: 'exam', source: p.source }),
        });
      }
    } catch (e) { log.warn('decree exam skipped', { staffId, termId, err: (e as Error).message }); }

    // جمع‌بندی
    items.push({
      section: 'SUMMARY',
      title: `جمع قابل پرداخت: ${calc.payableUnits} واحد — خالص ${Math.round(calc.net).toLocaleString('en-US')} ریال`,
      units: String(calc.payableUnits ?? 0),
      amount: String(Math.round(calc.net ?? 0)),
      metaJson: JSON.stringify({ kind: 'summary', gross: calc.gross, tax: calc.tax }),
    });

    if (items.length) {
      await db.insert(decree_items).values(items.map(i => ({ ...i, decreeId: decree.id })));
    }
    log.info('decree issued draft', { decreeId: decree.id, staffId, termId, secretariatNo });
    return { ok: true, id: decree.id };
  } catch (e) {
    log.error('issueDecree failed', e);
    return { ok: false, error: (e as Error).message || 'خطای ناشناخته' };
  }
}

/** نهایی‌سازی پیش‌نویس (DRAFT → ISSUED) */
export async function finalizeDecree(id: number): Promise<DecreeResult> {
  const user = await getSessionUser().catch(() => null);
  const [d] = await db.select().from(teaching_decrees).where(eq(teaching_decrees.id, id)).limit(1);
  if (!d) return { ok: false, error: 'ابلاغ یافت نشد.' };
  if (d.status !== 'DRAFT') return { ok: false, error: 'فقط پیش‌نویس نهایی می‌شود.' };
  await db
    .update(teaching_decrees)
    .set({ status: 'ISSUED', issuedBy: user?.id ?? null, issuedAt: new Date() })
    .where(eq(teaching_decrees.id, id));
  return { ok: true, id };
}

/** حذف پیش‌نویس (ابلاغ صادرشده حذف نمی‌شود) */
export async function deleteDraftDecree(id: number): Promise<DecreeResult> {
  const [d] = await db.select().from(teaching_decrees).where(eq(teaching_decrees.id, id)).limit(1);
  if (!d) return { ok: false, error: 'ابلاغ یافت نشد.' };
  if (d.status !== 'DRAFT') return { ok: false, error: 'ابلاغ صادرشده حذف نمی‌شود.' };
  await db.delete(decree_items).where(eq(decree_items.decreeId, id));
  await db.delete(teaching_decrees).where(eq(teaching_decrees.id, id));
  return { ok: true, id };
}
