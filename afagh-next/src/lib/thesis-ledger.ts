import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, staff, students, users } from '@/db/schema';
import { thesis_supervisions, thesis_unit_draws } from '@/db/schema-payroll-plus';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'thesis-ledger' });

export const THESIS_ROLES = ['SUPERVISOR', 'ADVISOR'] as const;
export const THESIS_ROLE_FA: Record<string, string> = {
  SUPERVISOR: 'راهنما',
  ADVISOR: 'مشاور',
};

export const THESIS_STATUSES = ['ONGOING', 'COMPLETED', 'CANCELLED'] as const;
export const THESIS_STATUS_FA: Record<string, string> = {
  ONGOING: 'در جریان',
  COMPLETED: 'تکمیل‌شده',
  CANCELLED: 'لغوشده',
};

export type ThesisResult = { ok: true; id: number } | { ok: false; error: string };

export type SupervisionItem = {
  id: number;
  staffId: number;
  staffName: string;
  studentId: number | null;
  studentName: string;
  title: string;
  totalUnits: number;
  drawnUnits: number;
  remainingUnits: number;
  role: string;
  status: string;
  startTermTitle: string | null;
  createdAt: Date | null;
};

export type DrawItem = {
  id: number;
  termId: number;
  termTitle: string | null;
  units: number;
  note: string | null;
  createdAt: Date | null;
};

/** دفتر سرجمع‌های پایان‌نامه + باقی‌ماندهٔ هر سرجمع */
export async function listSupervisions(universityId?: number | null, staffId?: number | null): Promise<SupervisionItem[]> {
  const conds = [];
  if (universityId != null) conds.push(eq(thesis_supervisions.universityId, universityId));
  if (staffId != null) conds.push(eq(thesis_supervisions.staffId, staffId));
  const rows = await db
    .select({
      id: thesis_supervisions.id,
      staffId: thesis_supervisions.staffId,
      studentId: thesis_supervisions.studentId,
      studentNameManual: thesis_supervisions.studentNameManual,
      title: thesis_supervisions.title,
      totalUnits: thesis_supervisions.totalUnits,
      role: thesis_supervisions.role,
      status: thesis_supervisions.status,
      startTermId: thesis_supervisions.startTermId,
      createdAt: thesis_supervisions.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(thesis_supervisions)
    .innerJoin(staff, eq(staff.id, thesis_supervisions.staffId))
    .innerJoin(users, eq(users.id, staff.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(thesis_supervisions.createdAt))
    .limit(200);

  const ids = rows.map(r => r.id);
  const drawn = new Map<number, number>();
  if (ids.length) {
    const sums = await db
      .select({
        supervisionId: thesis_unit_draws.supervisionId,
        total: sql<string>`coalesce(sum(${thesis_unit_draws.units}), 0)`,
      })
      .from(thesis_unit_draws)
      .where(sql`${thesis_unit_draws.supervisionId} in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`)
      .groupBy(thesis_unit_draws.supervisionId);
    for (const s of sums) drawn.set(s.supervisionId, Number(s.total ?? 0));
  }

  const out: SupervisionItem[] = [];
  for (const r of rows) {
    let studentName = (r.studentNameManual ?? '').trim();
    if (r.studentId != null) {
      const [s] = await db
        .select({ firstName: users.firstName, lastName: users.lastName, studentCode: students.studentCode })
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .where(eq(students.id, r.studentId))
        .limit(1);
      if (s) studentName = `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() + (s.studentCode ? ` (${s.studentCode})` : '');
    }
    let startTermTitle: string | null = null;
    if (r.startTermId != null) {
      const [t] = await db.select({ title: academic_terms.title }).from(academic_terms).where(eq(academic_terms.id, r.startTermId)).limit(1);
      startTermTitle = t?.title ?? null;
    }
    const total = Number(r.totalUnits ?? 0);
    const drawnU = Math.round((drawn.get(r.id) ?? 0) * 100) / 100;
    out.push({
      id: r.id,
      staffId: r.staffId,
      staffName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—',
      studentId: r.studentId,
      studentName: studentName || '—',
      title: r.title,
      totalUnits: total,
      drawnUnits: drawnU,
      remainingUnits: Math.round((total - drawnU) * 100) / 100,
      role: r.role,
      status: r.status,
      startTermTitle,
      createdAt: r.createdAt,
    });
  }
  return out;
}

/** ثبت سرجمع جدید */
export async function createSupervision(input: {
  staffId: number;
  studentId?: number | null;
  studentNameManual?: string | null;
  title: string;
  totalUnits: number;
  role: string;
  startTermId?: number | null;
  createdBy?: number | null;
  universityId?: number | null;
}): Promise<ThesisResult> {
  const title = (input.title ?? '').trim();
  if (title.length < 3) return { ok: false, error: 'عنوان پایان‌نامه الزامی است.' };
  if (!(input.totalUnits > 0) || input.totalUnits > 12) return { ok: false, error: 'سقف واحد باید بین ۰ تا ۱۲ باشد.' };
  if (!THESIS_ROLES.includes(input.role as (typeof THESIS_ROLES)[number])) return { ok: false, error: 'نقش نامعتبر است.' };
  if (input.studentId == null && !(input.studentNameManual ?? '').trim()) {
    return { ok: false, error: 'دانشجو یا نام دستی دانشجو الزامی است.' };
  }
  try {
    const [row] = await db
      .insert(thesis_supervisions)
      .values({
        staffId: input.staffId,
        studentId: input.studentId ?? null,
        studentNameManual: (input.studentNameManual ?? '').trim() || null,
        title,
        totalUnits: String(input.totalUnits),
        role: input.role,
        status: 'ONGOING',
        startTermId: input.startTermId ?? null,
        createdBy: input.createdBy ?? null,
        universityId: input.universityId ?? null,
      })
      .returning({ id: thesis_supervisions.id });
    return { ok: true, id: row.id };
  } catch (e) {
    log.error('createSupervision failed', e);
    return { ok: false, error: (e as Error).message || 'خطای ناشناخته' };
  }
}

/** تغییر وضعیت سرجمع */
export async function setSupervisionStatus(id: number, status: string): Promise<ThesisResult> {
  if (!THESIS_STATUSES.includes(status as (typeof THESIS_STATUSES)[number])) return { ok: false, error: 'وضعیت نامعتبر است.' };
  const [row] = await db.select({ id: thesis_supervisions.id }).from(thesis_supervisions).where(eq(thesis_supervisions.id, id)).limit(1);
  if (!row) return { ok: false, error: 'سرجمع یافت نشد.' };
  await db.update(thesis_supervisions).set({ status }).where(eq(thesis_supervisions.id, id));
  return { ok: true, id };
}

/** حذف سرجمع — فقط وقتی برداشتی ثبت نشده باشد */
export async function deleteSupervision(id: number): Promise<ThesisResult> {
  const draws = await db
    .select({ id: thesis_unit_draws.id })
    .from(thesis_unit_draws)
    .where(eq(thesis_unit_draws.supervisionId, id))
    .limit(1);
  if (draws.length) return { ok: false, error: 'این سرجمع برداشت دارد؛ ابتدا برداشت‌ها را حذف کنید.' };
  await db.delete(thesis_supervisions).where(eq(thesis_supervisions.id, id));
  return { ok: true, id };
}

/** برداشت‌های یک سرجمع */
export async function listDraws(supervisionId: number): Promise<DrawItem[]> {
  const rows = await db
    .select({
      id: thesis_unit_draws.id,
      termId: thesis_unit_draws.termId,
      termTitle: academic_terms.title,
      units: thesis_unit_draws.units,
      note: thesis_unit_draws.note,
      createdAt: thesis_unit_draws.createdAt,
    })
    .from(thesis_unit_draws)
    .innerJoin(academic_terms, eq(academic_terms.id, thesis_unit_draws.termId))
    .where(eq(thesis_unit_draws.supervisionId, supervisionId))
    .orderBy(desc(thesis_unit_draws.createdAt));
  return rows.map(r => ({ ...r, units: Number(r.units ?? 0) }));
}

/** ثبت برداشت مرحله‌ای — سقف: باقی‌ماندهٔ سرجمع */
export async function addDraw(input: {
  supervisionId: number;
  termId: number;
  units: number;
  note?: string | null;
  createdBy?: number | null;
  universityId?: number | null;
}): Promise<ThesisResult> {
  if (!(input.units > 0) || input.units > 12) return { ok: false, error: 'واحد برداشت باید بین ۰ تا ۱۲ باشد.' };
  const [sup] = await db
    .select({ id: thesis_supervisions.id, totalUnits: thesis_supervisions.totalUnits, status: thesis_supervisions.status })
    .from(thesis_supervisions)
    .where(eq(thesis_supervisions.id, input.supervisionId))
    .limit(1);
  if (!sup) return { ok: false, error: 'سرجمع یافت نشد.' };
  if (sup.status === 'CANCELLED') return { ok: false, error: 'سرجمع لغوشده است.' };
  const [sum] = await db
    .select({ total: sql<string>`coalesce(sum(${thesis_unit_draws.units}), 0)` })
    .from(thesis_unit_draws)
    .where(eq(thesis_unit_draws.supervisionId, input.supervisionId));
  const drawn = Number(sum?.total ?? 0);
  const remaining = Number(sup.totalUnits ?? 0) - drawn;
  if (input.units - remaining > 1e-9) {
    return { ok: false, error: `سقف باقی‌مانده ${Math.round(remaining * 100) / 100} واحد است.` };
  }
  try {
    const [row] = await db
      .insert(thesis_unit_draws)
      .values({
        supervisionId: input.supervisionId,
        termId: input.termId,
        units: String(input.units),
        note: (input.note ?? '').trim() || null,
        createdBy: input.createdBy ?? null,
        universityId: input.universityId ?? null,
      })
      .returning({ id: thesis_unit_draws.id });
    return { ok: true, id: row.id };
  } catch (e) {
    log.error('addDraw failed', e);
    return { ok: false, error: (e as Error).message || 'خطای ناشناخته' };
  }
}

/** حذف برداشت */
export async function deleteDraw(id: number): Promise<ThesisResult> {
  await db.delete(thesis_unit_draws).where(eq(thesis_unit_draws.id, id));
  return { ok: true, id };
}
