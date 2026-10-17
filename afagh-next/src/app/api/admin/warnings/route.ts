import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { students, users } from '@/db/schema';
import { scheduled_warnings } from '@/db/schema-warnings';
import { requireRole, getSessionUser } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { authorizedUniversityIds, getCurrentUniversity } from '@/lib/university-scope';
import {

  isWarningStatus,
  isWarningType,
  SCHED_WARNINGS_PAGE_SIZE,
} from '@/lib/scheduled-warnings';
import { assertCsrf, requireStudentScope } from '@/lib/security';

// ══════════════════════════════════════════════════════════════════════
//  API هشدارهای زمان‌بندی‌شدهٔ دانشجو
//  GET    ?action=students&q=… → جست‌وجوی دانشجو برای انتخاب‌گر فرم
//  GET    → فهرست هشدارها (فیلتر status/type/studentId/dateFrom/dateTo/q)
//  POST   → ثبت هشدار جدید (در انتظار ارسال در موعد)
//  PATCH  ?id= → ویرایش / لغو / ارسال فوری
//  DELETE ?id= → حذف (فقط ADMIN)
// ══════════════════════════════════════════════════════════════════════

const log = createLogger({ mod: 'admin.warnings' });
const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];

const createSchema = z.object({
  studentId: z.number().int().positive(),
  warningType: z.string().max(50),
  title: z.string().max(250).optional().nullable(),
  message: z.string().max(4000).optional().nullable(),
  sendAt: z.string().min(4),
});

const patchSchema = z.object({
  title: z.string().max(250).optional().nullable(),
  message: z.string().max(4000).optional().nullable(),
  sendAt: z.string().min(4).optional(),
  warningType: z.string().max(50).optional(),
  status: z.enum(['pending', 'cancelled']).optional(),
});

async function guard(): Promise<NextResponse | null> {
  try {
    await requireRole(ALLOWED);
    return null;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'دسترسی غیرمجاز' }, { status: 401 });
  }
}

/** GET — فهرست یا جست‌وجوی دانشجو */
export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const p = req.nextUrl.searchParams;

  if (p.get('action') === 'students') {
    const q = (p.get('q') || '').trim();
    if (q.length < 2) return NextResponse.json({ ok: true, hits: [] });
    // 🔒 مرز دانشگاه (IDOR): جست‌وجوی دانشجو نباید دانشجوی دانشگاه‌های دیگر را برگرداند.
    // authorizedUniversityIds: null = حساب پلتفرمی (نامحدود)، [] = deny-all.
    const allowedIds = await authorizedUniversityIds().catch(() => []);
    if (Array.isArray(allowedIds) && allowedIds.length === 0) return NextResponse.json({ ok: true, hits: [] });
    const uniFilter = Array.isArray(allowedIds) ? inArray(students.universityId, allowedIds) : undefined;
    const like = `%${q}%`;
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
        uniFilter,
        or(eq(students.studentCode, q), sql`${users.firstName} || ' ' || ${users.lastName} LIKE ${like}`),
      ))
      .orderBy(students.studentCode)
      .limit(20);
    return NextResponse.json({ ok: true, hits });
  }

  const filters: SQL[] = [];
  const uni = await getCurrentUniversity().catch(() => null);
  if (uni) filters.push(eq(scheduled_warnings.universityId, uni.id));

  const status = p.get('status') || '';
  if (status) {
    if (!isWarningStatus(status)) {
      return NextResponse.json({ ok: false, error: 'وضعیت نامعتبر است.' }, { status: 400 });
    }
    filters.push(eq(scheduled_warnings.status, status));
  }
  const type = p.get('type') || '';
  if (type) {
    if (!isWarningType(type)) {
      return NextResponse.json({ ok: false, error: 'نوع هشدار نامعتبر است.' }, { status: 400 });
    }
    filters.push(eq(scheduled_warnings.warningType, type));
  }
  const studentId = Number(p.get('studentId') || 0);
  if (studentId) filters.push(eq(scheduled_warnings.studentId, studentId));
  const dateFrom = p.get('dateFrom');
  if (dateFrom) filters.push(gte(scheduled_warnings.sendAt, new Date(dateFrom)));
  const dateTo = p.get('dateTo');
  if (dateTo) filters.push(lte(scheduled_warnings.sendAt, new Date(`${dateTo}T23:59:59`)));
  const q = (p.get('q') || '').trim();
  if (q) {
    const like = `%${q}%`;
    filters.push(or(
      sql`${students.studentCode} LIKE ${like}`,
      sql`${users.firstName} || ' ' || ${users.lastName} LIKE ${like}`,
      sql`${scheduled_warnings.title} LIKE ${like}`,
    )!);
  }

  const page = Math.max(1, Number(p.get('page') || 1));
  const offset = (page - 1) * SCHED_WARNINGS_PAGE_SIZE;
  const where = filters.length ? and(...filters) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(scheduled_warnings)
    .leftJoin(students, eq(students.id, scheduled_warnings.studentId))
    .leftJoin(users, eq(users.id, students.userId))
    .where(where);

  const rows = await db
    .select({
      id: scheduled_warnings.id,
      studentId: scheduled_warnings.studentId,
      studentCode: students.studentCode,
      studentName: sql<string | null>`CASE WHEN students.id IS NULL THEN NULL ELSE ${users.firstName} || ' ' || ${users.lastName} END`,
      warningType: scheduled_warnings.warningType,
      title: scheduled_warnings.title,
      message: scheduled_warnings.message,
      sendAt: scheduled_warnings.sendAt,
      sentAt: scheduled_warnings.sentAt,
      status: scheduled_warnings.status,
      createdAt: scheduled_warnings.createdAt,
    })
    .from(scheduled_warnings)
    .leftJoin(students, eq(students.id, scheduled_warnings.studentId))
    .leftJoin(users, eq(users.id, students.userId))
    .where(where)
    .orderBy(scheduled_warnings.sendAt)
    .limit(SCHED_WARNINGS_PAGE_SIZE)
    .offset(offset);

  return NextResponse.json({ ok: true, rows, total, page, pageSize: SCHED_WARNINGS_PAGE_SIZE });
}

/** POST — ثبت هشدار جدید */
export async function POST(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'بدنهٔ درخواست نامعتبر است.' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'اطلاعات فرم نامعتبر است.', issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;
  if (!isWarningType(d.warningType)) {
    return NextResponse.json({ ok: false, error: 'نوع هشدار نامعتبر است.' }, { status: 400 });
  }

  // 🔒 مرز دانشگاه (IDOR): کارشناس دانشگاه A نباید برای دانشجوی دانشگاه B هشدار بسازد
  const scope = await requireStudentScope(d.studentId);
  if (!scope.ok) return NextResponse.json({ ok: false, error: scope.error }, { status: 403 });

  const user = await getSessionUser();
  const uni = await getCurrentUniversity().catch(() => null);

  try {
    const sendAtDate = new Date(d.sendAt);
    if (Number.isNaN(sendAtDate.getTime())) {
      return NextResponse.json({ ok: false, error: 'زمان ارسال نامعتبر است.' }, { status: 400 });
    }
    const [row] = await db
      .insert(scheduled_warnings)
      .values({
        studentId: d.studentId,
        warningType: d.warningType,
        title: d.title || null,
        message: d.message || null,
        sendAt: sendAtDate,
        status: 'pending',
        createdBy: user?.id ?? null,
        universityId: uni?.id ?? null,
      })
      .returning({ id: scheduled_warnings.id });

    await db.transaction(async (tx) => {
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'SCHED_WARNING_CREATED',
        entityType: 'scheduled_warning',
        entityId: row?.id ?? null,
        details: JSON.stringify({ studentId: d.studentId, warningType: d.warningType, sendAt: sendAtDate.toISOString() }),
      });
    });
    log.info('warning_created', { id: row?.id, studentId: d.studentId, warningType: d.warningType });
    return NextResponse.json({ ok: true, id: row?.id });
  } catch (e) {
    log.error('warning_create_failed', { error: (e as Error)?.message });
    return NextResponse.json({ ok: false, error: 'ثبت هشدار ناموفق بود؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}

/** PATCH — ویرایش / لغو / ارسال فوری (?id=) */
export async function PATCH(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get('id') || 0);
  if (!id) return NextResponse.json({ ok: false, error: 'شناسه هشدار الزامی است.' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'بدنهٔ درخواست نامعتبر است.' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'اطلاعات فرم نامعتبر است.', issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;
  if (d.warningType && !isWarningType(d.warningType)) {
    return NextResponse.json({ ok: false, error: 'نوع هشدار نامعتبر است.' }, { status: 400 });
  }

  // 🔒 مرز دانشگاه (IDOR): هشدار دانشجوی دانشگاه دیگر قابل تغییر نیست
  {
    const [w] = await db.select({ studentId: scheduled_warnings.studentId }).from(scheduled_warnings).where(eq(scheduled_warnings.id, id)).limit(1);
    if (!w) return NextResponse.json({ ok: false, error: 'هشدار پیدا نشد.' }, { status: 404 });
    const scope = await requireStudentScope(w.studentId);
    if (!scope.ok) return NextResponse.json({ ok: false, error: scope.error }, { status: 403 });
  }

  const user = await getSessionUser();

  try {
    const updated = await db.transaction(async (tx) => {
      const [prev] = await tx
        .select({ id: scheduled_warnings.id, status: scheduled_warnings.status })
        .from(scheduled_warnings)
        .where(eq(scheduled_warnings.id, id))
        .for('update');
      if (!prev) return null;

      const patch: Record<string, unknown> = {};
      if (d.title !== undefined) patch.title = d.title || null;
      if (d.message !== undefined) patch.message = d.message || null;
      if (d.warningType !== undefined) patch.warningType = d.warningType;
      if (d.sendAt !== undefined) {
        const dt = new Date(d.sendAt);
        if (Number.isNaN(dt.getTime())) throw new Error('BAD_DATE');
        patch.sendAt = dt;
      }
      if (d.status !== undefined) patch.status = d.status;
      // ارسال فوری: status=pending و sendAt=اکنون → کرون بعدی بلافاصله می‌فرستد
      if ((body as { sendNow?: boolean })?.sendNow) {
        patch.status = 'pending';
        patch.sendAt = new Date();
        delete patch.title;
      }
      if (Object.keys(patch).length) {
        await tx.update(scheduled_warnings).set(patch).where(eq(scheduled_warnings.id, id));
      }

      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'SCHED_WARNING_UPDATED',
        entityType: 'scheduled_warning',
        entityId: id,
        details: JSON.stringify({ from: prev.status, patch: Object.keys(patch) }),
      });
      return { id, prevStatus: prev.status };
    });

    if (!updated) return NextResponse.json({ ok: false, error: 'هشدار پیدا نشد.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error)?.message;
    if (msg === 'BAD_DATE') return NextResponse.json({ ok: false, error: 'زمان ارسال نامعتبر است.' }, { status: 400 });
    log.error('warning_patch_failed', { error: msg });
    return NextResponse.json({ ok: false, error: 'به‌روزرسانی هشدار ناموفق بود؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}

/** DELETE — حذف هشدار (فقط ADMIN) (?id=) */
export async function DELETE(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  try {
    await requireRole(['ADMIN']);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'دسترسی غیرمجاز' }, { status: 401 });
  }

  const id = Number(req.nextUrl.searchParams.get('id') || 0);
  if (!id) return NextResponse.json({ ok: false, error: 'شناسه هشدار الزامی است.' }, { status: 400 });

  // 🔒 مرز دانشگاه (IDOR): حتی ADMIN یک دانشگاه نباید هشدار دانشگاه دیگر را حذف کند
  {
    const [w] = await db.select({ studentId: scheduled_warnings.studentId }).from(scheduled_warnings).where(eq(scheduled_warnings.id, id)).limit(1);
    if (!w) return NextResponse.json({ ok: false, error: 'هشدار پیدا نشد.' }, { status: 404 });
    const scope = await requireStudentScope(w.studentId);
    if (!scope.ok) return NextResponse.json({ ok: false, error: scope.error }, { status: 403 });
  }

  const user = await getSessionUser();
  try {
    const deleted = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(scheduled_warnings)
        .where(eq(scheduled_warnings.id, id))
        .returning({ id: scheduled_warnings.id });
      if (!row) return null;
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'SCHED_WARNING_DELETED',
        entityType: 'scheduled_warning',
        entityId: id,
        details: JSON.stringify({ id }),
      });
      return row;
    });
    if (!deleted) return NextResponse.json({ ok: false, error: 'هشدار پیدا نشد.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('warning_delete_failed', { error: (e as Error)?.message });
    return NextResponse.json({ ok: false, error: 'حذف هشدار ناموفق بود؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}
