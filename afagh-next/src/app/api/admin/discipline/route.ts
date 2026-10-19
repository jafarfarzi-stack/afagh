import { assertCsrf, requireStudentScope } from '@/lib/security';
import { escapeLikeChars } from '@/lib/persian-search';
// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — «کمیته انضباطی» — API فهرست/ایجاد/ویرایش پرونده
//
//  GET    → فهرست پرونده‌ها با فیلتر (وضعیت، دانشجو، بازهٔ تاریخ، جست‌وجو)
//           ؟action=students&q=… → جست‌وجوی دانشجو برای انتخاب‌گر فرم
//  POST   → ایجاد پروندهٔ جدید (zod + مجوز + حسابرسی)
//  PATCH  → تغییر وضعیت / ثبت تصمیم کمیته (روی ?id=)
//  DELETE → حذف پرونده (فقط ADMIN)
//
//  جدول: discipline_cases + discipline_case_documents (schema-discipline.ts)
//  قراردادها: src/lib/discipline.ts (وضعیت/تصمیم فارسی = مقدار ذخیره‌شده)
// ══════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, gte, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { students, users } from '@/db/schema';
import { discipline_cases, discipline_case_documents } from '@/db/schema-discipline';
import { requireRole, getSessionUser } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { getCurrentUniversity, isRealUniversityId } from '@/lib/university-scope';
import {

  DISCIPLINE_DECISIONS, DISCIPLINE_STATUSES, DISCIPLINE_PAGE_SIZE,
  isDisciplineStatus, isDisciplineDecision,
} from '@/lib/discipline';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.discipline' });
const ACTION_CREATE = 'DISCIPLINE_CASE_CREATED';
const ACTION_UPDATE = 'DISCIPLINE_CASE_UPDATED';
const ACTION_DELETE = 'DISCIPLINE_CASE_DELETED';

// مجوز: انضباطی زیر معاونت آموزشی است — همان کلیدهای آموزشی صفحات ادمین
const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];

const createSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  violationType: z.string().trim().min(1).max(150),
  description: z.string().trim().max(4000).optional().nullable(),
  reporterName: z.string().trim().max(150).optional().nullable(),
  caseDate: z.string().trim().min(1).max(40).optional().nullable(),
});

const updateSchema = z.object({
  status: z.string().trim().max(30).optional(),
  committeeDecision: z.string().trim().max(100).optional().nullable(),
  decisionNotes: z.string().trim().max(4000).optional().nullable(),
});

/** GET — فهرست پرونده‌ها یا جست‌وجوی دانشجو (?action=students) */
export async function GET(req: NextRequest) {
  try {
    await requireRole(ALLOWED);
  } catch (e) {
    log.error('auth_guard_failed', { error: e });
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز' }, { status: 401 });
  }

  const uni = await getCurrentUniversity();
  if (!isRealUniversityId(uni.id)) return NextResponse.json({ ok: false, error: 'دانشگاه فعال معتبر نیست.' }, { status: 403 });

  const p = req.nextUrl.searchParams;

  // ── حالت جست‌وجوی دانشجو برای انتخاب‌گر فرم ──
  if (p.get('action') === 'students') {
    const q = (p.get('q') || '').trim();
    if (q.length < 2) return NextResponse.json({ ok: true, hits: [] });
    const like = `%${escapeLikeChars(q)}%`;
    const hits = await db
      .select({
        studentId: students.id,
        studentCode: students.studentCode,
        name: sql<string>`(${users.firstName} || ' ' || ${users.lastName})`,
        entryYear: students.entryYear,
      })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(and(
        eq(students.universityId, uni.id),
        or(eq(students.studentCode, q), sql`${users.firstName} || ' ' || ${users.lastName} LIKE ${like} ESCAPE '\\'`),
      ))
      .orderBy(students.studentCode)
      .limit(20);
    return NextResponse.json({ ok: true, hits });
  }

  // ── فهرست پرونده‌ها ──
  const filters: SQL[] = [eq(discipline_cases.universityId, uni.id)];

  const status = p.get('status') || '';
  if (status) {
    if (!isDisciplineStatus(status)) {
      return NextResponse.json({ ok: false, error: 'وضعیت نامعتبر است.' }, { status: 400 });
    }
    filters.push(eq(discipline_cases.status, status));
  }
  const studentId = Number(p.get('studentId') || 0);
  if (studentId) filters.push(eq(discipline_cases.studentId, studentId));
  const dateFrom = p.get('dateFrom');
  if (dateFrom) {
    const parsedDate = new Date(dateFrom);
    if (Number.isNaN(parsedDate.getTime())) return NextResponse.json({ ok: false, error: 'تاریخ شروع نامعتبر است.' }, { status: 400 });
    filters.push(gte(discipline_cases.caseDate, parsedDate));
  }
  const dateTo = p.get('dateTo');
  if (dateTo) {
    const parsedDate = new Date(`${dateTo}T23:59:59`);
    if (Number.isNaN(parsedDate.getTime())) return NextResponse.json({ ok: false, error: 'تاریخ پایان نامعتبر است.' }, { status: 400 });
    filters.push(lte(discipline_cases.caseDate, parsedDate));
  }
  const q = (p.get('q') || '').trim();
  if (q) {
    const like = `%${escapeLikeChars(q)}%`;
    filters.push(or(
      sql`${students.studentCode} LIKE ${like} ESCAPE '\\'`,
      sql`${users.firstName} || ' ' || ${users.lastName} LIKE ${like} ESCAPE '\\'`,
    )!);
  }

  const pageRaw = p.get('page');
  const pageValue = pageRaw ? Number(pageRaw) : 1;
  if (!Number.isSafeInteger(pageValue) || pageValue < 1) {
    return NextResponse.json({ ok: false, error: 'شماره صفحه نامعتبر است.' }, { status: 400 });
  }
  const page = Math.min(pageValue, 1_000_000);
  const where = filters.length ? and(...filters) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(discipline_cases)
    .innerJoin(students, eq(students.id, discipline_cases.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(where);

  const rows = await db
    .select({
      id: discipline_cases.id,
      studentId: discipline_cases.studentId,
      studentCode: students.studentCode,
      studentName: sql<string>`(${users.firstName} || ' ' || ${users.lastName})`,
      violationType: discipline_cases.violationType,
      description: discipline_cases.description,
      reporterName: discipline_cases.reporterName,
      status: discipline_cases.status,
      committeeDecision: discipline_cases.committeeDecision,
      decisionNotes: discipline_cases.decisionNotes,
      caseDate: discipline_cases.caseDate,
      decidedAt: discipline_cases.decidedAt,
      createdAt: discipline_cases.createdAt,
      documentCount: count(discipline_case_documents.id),
    })
    .from(discipline_cases)
    .innerJoin(students, eq(students.id, discipline_cases.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(discipline_case_documents, eq(discipline_case_documents.caseId, discipline_cases.id))
    .where(where)
    .groupBy(
      discipline_cases.id, students.studentCode,
      users.firstName, users.lastName,
    )
    .orderBy(desc(discipline_cases.caseDate), desc(discipline_cases.id))
    .limit(DISCIPLINE_PAGE_SIZE)
    .offset((page - 1) * DISCIPLINE_PAGE_SIZE);

  return NextResponse.json({ ok: true, rows, total, page, pageSize: DISCIPLINE_PAGE_SIZE });
}

/** POST — ایجاد پروندهٔ جدید */
export async function POST(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  try {
    await requireRole(ALLOWED);
  } catch (e) {
    log.error('auth_guard_failed', { error: e });
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'بدنهٔ درخواست نامعتبر است.' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.' }, { status: 400 });
  }
  const { studentId, violationType, description, reporterName, caseDate } = parsed.data;

  // 🔒 مرز دانشگاه (IDOR): کارشناس دانشگاه A نباید برای دانشجوی دانشگاه B پرونده بسازد
  const scope = await requireStudentScope(studentId);
  if (!scope.ok) return NextResponse.json({ ok: false, error: scope.error }, { status: 403 });

  const user = await getSessionUser();
  const uni = await getCurrentUniversity();
  if (!isRealUniversityId(uni.id)) return NextResponse.json({ ok: false, error: 'دانشگاه فعال معتبر نیست.' }, { status: 403 });

  try {
    const result = await db.transaction(async (tx) => {
      const [stu] = await tx
        .select({ id: students.id, universityId: students.universityId })
        .from(students)
        .where(and(eq(students.id, studentId), eq(students.universityId, uni.id)))
        .limit(1);
      if (!stu) return { ok: false as const, error: 'دانشجو یافت نشد.' };

      const [ins] = await tx
        .insert(discipline_cases)
        .values({
          studentId,
          violationType,
          description: description || null,
          reporterName: reporterName || null,
          status: 'در حال بررسی',
          caseDate: caseDate ? new Date(caseDate) : new Date(),
          universityId: uni.id,
        })
        .returning({ id: discipline_cases.id });

      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: ACTION_CREATE,
        entityType: 'discipline_cases',
        entityId: ins.id,
        details: JSON.stringify({ studentId, violationType }),
      });
      return { ok: true as const, id: ins.id };
    });

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    log.info('case_created', { id: result.id, studentId, actorUserId: user?.id ?? null });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e: any) {
    log.error('case_create_failed', { error: e });
    return NextResponse.json({ ok: false, error: 'خطا در ذخیرهٔ پرونده.' }, { status: 400 });
  }
}

/** PATCH — تغییر وضعیت / ثبت تصمیم */
export async function PATCH(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  try {
    await requireRole(ALLOWED);
  } catch (e) {
    log.error('auth_guard_failed', { error: e });
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز' }, { status: 401 });
  }

  const uni = await getCurrentUniversity();
  if (!isRealUniversityId(uni.id)) return NextResponse.json({ ok: false, error: 'دانشگاه فعال معتبر نیست.' }, { status: 403 });

  const id = Number(req.nextUrl.searchParams.get('id') || 0);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: 'شناسه پرونده نامعتبر است.' }, { status: 400 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'بدنهٔ درخواست نامعتبر است.' }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.' }, { status: 400 });
  }
  const { status, committeeDecision, decisionNotes } = parsed.data;

  if (status !== undefined && status !== null && status !== '' && !isDisciplineStatus(status)) {
    return NextResponse.json({ ok: false, error: 'وضعیت نامعتبر است.' }, { status: 400 });
  }
  if (committeeDecision && !isDisciplineDecision(committeeDecision)) {
    return NextResponse.json({ ok: false, error: 'تصمیم نامعتبر است.' }, { status: 400 });
  }

  // 🔒 مرز دانشگاه (IDOR): پروندهٔ دانشجوی دانشگاه دیگر قابل تغییر نیست
  {
    const [row] = await db.select({ studentId: discipline_cases.studentId }).from(discipline_cases)
      .where(and(eq(discipline_cases.id, id), eq(discipline_cases.universityId, uni.id))).limit(1);
    if (!row) return NextResponse.json({ ok: false, error: 'پرونده یافت نشد.' }, { status: 404 });
    const scope = await requireStudentScope(row.studentId);
    if (!scope.ok) return NextResponse.json({ ok: false, error: scope.error }, { status: 403 });
  }

  const user = await getSessionUser();
  const set: Partial<typeof discipline_cases.$inferInsert> = { updatedAt: new Date() };
  if (status) set.status = status;
  if (committeeDecision !== undefined) set.committeeDecision = committeeDecision || null;
  if (decisionNotes !== undefined) set.decisionNotes = decisionNotes || null;
  // اولین ثبت تصمیم → زمان تصمیم‌گیری را ثبت کن
  if (committeeDecision) set.decidedAt = new Date();

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: discipline_cases.id, status: discipline_cases.status, committeeDecision: discipline_cases.committeeDecision })
        .from(discipline_cases)
        .where(and(eq(discipline_cases.id, id), eq(discipline_cases.universityId, uni.id)))
        .limit(1)
        .for('update');
      if (!existing) return { ok: false as const, error: 'پرونده یافت نشد.' };

      await tx.update(discipline_cases).set(set)
        .where(and(eq(discipline_cases.id, id), eq(discipline_cases.universityId, uni.id)));
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: ACTION_UPDATE,
        entityType: 'discipline_cases',
        entityId: id,
        details: JSON.stringify({ from: { status: existing.status, decision: existing.committeeDecision }, to: { status: status ?? existing.status, decision: committeeDecision ?? existing.committeeDecision } }),
      });
      return { ok: true as const };
    });

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    log.info('case_updated', { id, status, committeeDecision, actorUserId: user?.id ?? null });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    log.error('case_update_failed', { error: e });
    return NextResponse.json({ ok: false, error: 'خطا در به‌روزرسانی پرونده.' }, { status: 400 });
  }
}

/** DELETE — حذف پرونده (فقط ADMIN؛ اسناد به‌صورت cascade حذف می‌شوند) */
export async function DELETE(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  try {
    await requireRole(['ADMIN']);
  } catch (e) {
    log.error('auth_guard_failed', { error: e });
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز' }, { status: 401 });
  }

  const uni = await getCurrentUniversity();
  if (!isRealUniversityId(uni.id)) return NextResponse.json({ ok: false, error: 'دانشگاه فعال معتبر نیست.' }, { status: 403 });

  const id = Number(req.nextUrl.searchParams.get('id') || 0);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: 'شناسه پرونده نامعتبر است.' }, { status: 400 });

  // 🔒 مرز دانشگاه (IDOR): حتی ADMIN یک دانشگاه نباید پروندهٔ دانشگاه دیگر را حذف کند
  {
    const [row] = await db.select({ studentId: discipline_cases.studentId }).from(discipline_cases)
      .where(and(eq(discipline_cases.id, id), eq(discipline_cases.universityId, uni.id))).limit(1);
    if (!row) return NextResponse.json({ ok: false, error: 'پرونده یافت نشد.' }, { status: 404 });
    const scope = await requireStudentScope(row.studentId);
    if (!scope.ok) return NextResponse.json({ ok: false, error: scope.error }, { status: 403 });
  }

  const user = await getSessionUser();
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: discipline_cases.id, studentId: discipline_cases.studentId, violationType: discipline_cases.violationType })
        .from(discipline_cases)
        .where(and(eq(discipline_cases.id, id), eq(discipline_cases.universityId, uni.id)))
        .limit(1)
        .for('update');
      if (!existing) return { ok: false as const, error: 'پرونده یافت نشد.' };

      await tx.delete(discipline_cases).where(and(eq(discipline_cases.id, id), eq(discipline_cases.universityId, uni.id)));
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: ACTION_DELETE,
        entityType: 'discipline_cases',
        entityId: id,
        details: JSON.stringify(existing),
      });
      return { ok: true as const };
    });

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    log.info('case_deleted', { id, actorUserId: user?.id ?? null });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    log.error('case_delete_failed', { error: e });
    return NextResponse.json({ ok: false, error: 'خطا در حذف پرونده.' }, { status: 400 });
  }
}
