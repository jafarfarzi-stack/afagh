import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, students, users } from '@/db/schema';
import { student_tuition_overrides } from '@/db/schema-welfare';
import { requireRole, getSessionUser } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { getCurrentUniversity, universityEq } from '@/lib/university-scope';
import { z } from 'zod';
import { assertCsrf } from '@/lib/security';
import { escapeLikeChars } from '@/lib/persian-search';


export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.student-formula' });
const ALLOWED = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'] as const;
const PAGE_SIZE = 50;

const createSchema = z.object({
  studentId: z.number().int().positive(),
  /** تهی = همهٔ ترم‌ها */
  termId: z.number().int().positive().nullish(),
  fixedAmount: z.number().int().min(0).max(9_999_999_999_999),
  perUnitAmount: z.number().int().min(0).max(9_999_999_999_999),
  reason: z.string().max(2000).nullish(),
});

const patchSchema = z
  .object({
    termId: z.number().int().positive().nullable(),
    fixedAmount: z.number().int().min(0).max(9_999_999_999_999),
    perUnitAmount: z.number().int().min(0).max(9_999_999_999_999),
    reason: z.string().max(2000).nullable(),
    isActive: z.number().int().min(0).max(1),
  })
  .partial();

async function guard() {
  try {
    const role = await requireRole([...ALLOWED]);
    if (role instanceof NextResponse) return role;
    return null;
  } catch (e) {
    log.warn('student-formula auth error', { err: e });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

/** غیرفعال‌سازی فرمول‌های فعالِ متعارض (همان دانشجو + همان دامنهٔ ترم) */
async function deactivateConflicts(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  studentId: number,
  termId: number | null,
  exceptId?: number,
) {
  const scope =
    termId === null
      ? isNull(student_tuition_overrides.termId)
      : eq(student_tuition_overrides.termId, termId);
  const conds = [
    eq(student_tuition_overrides.studentId, studentId),
    eq(student_tuition_overrides.isActive, 1),
    scope,
  ];
  if (exceptId !== undefined) {
    const { ne } = await import('drizzle-orm');
    conds.push(ne(student_tuition_overrides.id, exceptId));
  }
  await tx
    .update(student_tuition_overrides)
    .set({ isActive: 0, updatedAt: new Date() })
    .where(and(...conds));
}

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const universityId = (await getCurrentUniversity().catch(() => null))?.id ?? null;

    // فهرست ترم‌ها برای سلکت فرم
    if (searchParams.get('action') === 'terms') {
      const terms = await db
        .select({ id: academic_terms.id, title: academic_terms.title, termCode: academic_terms.termCode })
        .from(academic_terms)
        .where(universityEq(academic_terms.universityId, universityId))
        .orderBy(desc(academic_terms.id))
        .limit(60);
      return NextResponse.json({ terms });
    }

    const q = (searchParams.get('q') ?? '').trim();
    const studentId = Number(searchParams.get('studentId') ?? '');
    const activeOnly = searchParams.get('active') === '1';
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

    const where = and(
      // 🔒 ۰/نامشخص ⇒ هیچ ردیفی (پیش‌تر شرط حذف می‌شد ⇒ overrideهای همهٔ دانشگاه‌ها)
      universityEq(student_tuition_overrides.universityId, universityId),
      Number.isSafeInteger(studentId) && studentId > 0
        ? eq(student_tuition_overrides.studentId, studentId)
        : undefined,
      activeOnly ? eq(student_tuition_overrides.isActive, 1) : undefined,
      q
        ? or(
            eq(students.studentCode, q),
            sql`(${users.firstName} || ' ' || ${users.lastName}) LIKE ${'%' + escapeLikeChars(q) + '%'} ESCAPE '\\'`,
          )
        : undefined,
    );

    const [{ total }] = await db
      .select({ total: count() })
      .from(student_tuition_overrides)
      .innerJoin(students, eq(students.id, student_tuition_overrides.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(where);

    const rows = await db
      .select({
        id: student_tuition_overrides.id,
        studentId: student_tuition_overrides.studentId,
        studentCode: students.studentCode,
        studentName: sql`(${users.firstName} || ' ' || ${users.lastName})`,
        termId: student_tuition_overrides.termId,
        fixedAmount: student_tuition_overrides.fixedAmount,
        perUnitAmount: student_tuition_overrides.perUnitAmount,
        reason: student_tuition_overrides.reason,
        isActive: student_tuition_overrides.isActive,
        createdAt: student_tuition_overrides.createdAt,
        updatedAt: student_tuition_overrides.updatedAt,
      })
      .from(student_tuition_overrides)
      .innerJoin(students, eq(students.id, student_tuition_overrides.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(where)
      .orderBy(desc(student_tuition_overrides.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    // عنوان ترم‌ها (جدا تا جوین پیچیده نشود)
    const termIds = [...new Set(rows.map((r) => r.termId).filter((t): t is number => t !== null))];
    let termMap = new Map<number, string>();
    if (termIds.length > 0) {
      const { inArray } = await import('drizzle-orm');
      const terms = await db
        .select({ id: academic_terms.id, title: academic_terms.title })
        .from(academic_terms)
        .where(inArray(academic_terms.id, termIds));
      termMap = new Map(terms.map((t) => [t.id, t.title]));
    }

    return NextResponse.json({
      rows: rows.map((r) => ({
        ...r,
        termTitle: r.termId === null ? 'همهٔ ترم‌ها' : (termMap.get(r.termId) ?? `#${r.termId}`),
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (e) {
    log.error('student-formula GET failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { studentId, fixedAmount, perUnitAmount, reason } = parsed.data;
    const termId = parsed.data.termId ?? null;
    if (fixedAmount === 0 && perUnitAmount === 0) {
      return NextResponse.json({ error: 'zero_formula' }, { status: 400 });
    }

    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!student) return NextResponse.json({ error: 'student_not_found' }, { status: 404 });
    if (termId !== null) {
      const [term] = await db
        .select({ id: academic_terms.id })
        .from(academic_terms)
        .where(eq(academic_terms.id, termId))
        .limit(1);
      if (!term) return NextResponse.json({ error: 'term_not_found' }, { status: 404 });
    }

    const universityId = (await getCurrentUniversity().catch(() => null))?.id ?? null;
    const created = await db.transaction(async (tx) => {
      await deactivateConflicts(tx, studentId, termId);
      const [row] = await tx
        .insert(student_tuition_overrides)
        .values({
          studentId,
          termId,
          fixedAmount: String(fixedAmount),
          perUnitAmount: String(perUnitAmount),
          reason: reason ?? null,
          isActive: 1,
          createdBy: user.id,
          universityId,
        })
        .returning({ id: student_tuition_overrides.id });
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'TUITION_OVERRIDE_CREATED',
        entityType: 'student_tuition_overrides',
        entityId: row.id,
        details: JSON.stringify({ studentId, termId, fixedAmount, perUnitAmount }),
      });
      return row;
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    log.error('student-formula POST failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
    }
    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(student_tuition_overrides)
        .where(eq(student_tuition_overrides.id, id))
        .for('update')
        .limit(1);
      if (!before) return null;
      const patch = parsed.data;
      const values: Partial<typeof student_tuition_overrides.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (patch.termId !== undefined) values.termId = patch.termId;
      if (patch.fixedAmount !== undefined) values.fixedAmount = String(patch.fixedAmount);
      if (patch.perUnitAmount !== undefined) values.perUnitAmount = String(patch.perUnitAmount);
      if (patch.reason !== undefined) values.reason = patch.reason;
      if (patch.isActive !== undefined) values.isActive = patch.isActive;
      // فعال‌سازی دوباره = غیرفعال‌سازی متعارض‌ها
      if (patch.isActive === 1) {
        const effTerm = patch.termId !== undefined ? patch.termId : before.termId;
        await deactivateConflicts(tx, before.studentId, effTerm, id);
      }
      const [row] = await tx
        .update(student_tuition_overrides)
        .set(values)
        .where(eq(student_tuition_overrides.id, id))
        .returning({ id: student_tuition_overrides.id });
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'TUITION_OVERRIDE_UPDATED',
        entityType: 'student_tuition_overrides',
        entityId: id,
        details: JSON.stringify(patch),
      });
      return row;
    });
    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    log.error('student-formula PATCH failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user || !user.roles.includes('ADMIN')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }
    const deleted = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(student_tuition_overrides)
        .where(eq(student_tuition_overrides.id, id))
        .returning({ id: student_tuition_overrides.id });
      if (!row) return null;
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'TUITION_OVERRIDE_DELETED',
        entityType: 'student_tuition_overrides',
        entityId: id,
        details: JSON.stringify({ id }),
      });
      return row;
    });
    if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('student-formula DELETE failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
