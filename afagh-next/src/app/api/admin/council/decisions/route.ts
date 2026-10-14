import { assertCsrf } from '@/lib/security';
// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — «شورای آموزشی» — API مصوبات/توصیه‌ها/درخواست‌های تجدیدنظر
//
//  GET    → فهرست مصوبات با فیلتر (نوع، وضعیت اجرا، جلسه، دانشجو)
//  POST   → ایجاد مصوبه برای یک جلسه
//  PATCH  → ویرایش مصوبه (متن/نوع/وضعیت اجرا/مهلت)
//  DELETE → حذف مصوبه
//
//  جدول: council_decisions (schema-council.ts)
//  قراردادها: src/lib/council.ts — نوع/وضعیت فارسی = مقدار ذخیره‌شده
// ══════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { students, users } from '@/db/schema';
import { council_meetings, council_decisions } from '@/db/schema-council';
import { requireRole, getSessionUser } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { getCurrentUniversity } from '@/lib/university-scope';
import {

  DECISION_TYPES, IMPLEMENTATION_STATUSES, isOneOf, intParam,
} from '@/lib/council';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.council.decisions' });
const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];
const PAGE_SIZE = 50;

const decisionSchema = z.object({
  meetingId: z.coerce.number().int().positive(),
  studentId: z.coerce.number().int().positive().optional().nullable(),
  decisionType: z.string().trim().min(1).max(50),
  content: z.string().trim().min(1).max(8000),
  implementationStatus: z.string().trim().min(1).max(30),
  deadline: z.string().trim().min(1).max(40).optional().nullable(),
});

async function guard() {
  try {
    await requireRole(ALLOWED);
    return null;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'دسترسی غیرمجاز' }, { status: 401 });
  }
}

/** GET — فهرست مصوبات */
export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;

  const filters: SQL[] = [];
  const uni = await getCurrentUniversity().catch(() => null);
  if (uni) filters.push(eq(council_decisions.universityId, uni.id));

  const meetingId = intParam(sp, 'meetingId');
  if (meetingId) filters.push(eq(council_decisions.meetingId, meetingId));
  const studentId = intParam(sp, 'studentId');
  if (studentId) filters.push(eq(council_decisions.studentId, studentId));
  const status = sp.get('status')?.trim();
  if (status) {
    if (!isOneOf(status, IMPLEMENTATION_STATUSES)) {
      return NextResponse.json({ ok: false, error: 'وضعیت اجرا نامعتبر است.' }, { status: 400 });
    }
    filters.push(eq(council_decisions.implementationStatus, status));
  }
  const type = sp.get('type')?.trim();
  if (type) {
    if (!isOneOf(type, DECISION_TYPES)) {
      return NextResponse.json({ ok: false, error: 'نوع مصوبه نامعتبر است.' }, { status: 400 });
    }
    filters.push(eq(council_decisions.decisionType, type));
  }
  const where = and(...filters) ?? undefined;

  const page = Math.max(1, intParam(sp, 'page') ?? 1);
  const [{ total }] = await db.select({ total: count() }).from(council_decisions).where(where);

  const rows = await db
    .select({
      id: council_decisions.id,
      meetingId: council_decisions.meetingId,
      meetingTitle: council_meetings.title,
      meetingDate: council_meetings.meetingDate,
      studentId: council_decisions.studentId,
      studentName: sql<string>`CASE WHEN ${students.id} IS NULL THEN NULL ELSE ${users.firstName} || ' ' || ${users.lastName} END`,
      studentCode: students.studentCode,
      decisionType: council_decisions.decisionType,
      content: council_decisions.content,
      implementationStatus: council_decisions.implementationStatus,
      deadline: council_decisions.deadline,
      createdAt: council_decisions.createdAt,
      updatedAt: council_decisions.updatedAt,
    })
    .from(council_decisions)
    .innerJoin(council_meetings, eq(council_meetings.id, council_decisions.meetingId))
    .leftJoin(students, eq(students.id, council_decisions.studentId))
    .leftJoin(users, eq(users.id, students.userId))
    .where(where)
    .orderBy(desc(council_decisions.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return NextResponse.json({ ok: true, rows, total, page, pageSize: PAGE_SIZE });
}

/** POST — ایجاد مصوبه */
export async function POST(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'بدنهٔ درخواست نامعتبر است.' }, { status: 400 });
  }
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.' }, { status: 400 });

  const { meetingId, studentId, decisionType, content, implementationStatus, deadline } = parsed.data;
  if (!isOneOf(decisionType, DECISION_TYPES)) {
    return NextResponse.json({ ok: false, error: 'نوع مصوبه نامعتبر است.' }, { status: 400 });
  }
  if (!isOneOf(implementationStatus, IMPLEMENTATION_STATUSES)) {
    return NextResponse.json({ ok: false, error: 'وضعیت اجرا نامعتبر است.' }, { status: 400 });
  }

  const user = await getSessionUser();
  const uni = await getCurrentUniversity().catch(() => null);

  try {
    const result = await db.transaction(async (tx) => {
      const [meeting] = await tx
        .select({ id: council_meetings.id, title: council_meetings.title })
        .from(council_meetings)
        .where(eq(council_meetings.id, meetingId))
        .limit(1);
      if (!meeting) return { ok: false as const, error: 'جلسه یافت نشد.' };

      if (studentId) {
        const [stu] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)).limit(1);
        if (!stu) return { ok: false as const, error: 'دانشجو یافت نشد.' };
      }

      const [ins] = await tx.insert(council_decisions).values({
        meetingId,
        studentId: studentId || null,
        decisionType,
        content,
        implementationStatus,
        deadline: deadline ? new Date(deadline) : null,
        universityId: uni?.id ?? null,
      }).returning({ id: council_decisions.id });

      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'COUNCIL_DECISION_CREATED',
        entityType: 'council_decisions',
        entityId: ins.id,
        details: JSON.stringify({ meetingId, decisionType, studentId: studentId || null }),
      });
      return { ok: true as const, id: ins.id };
    });

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    log.info('decision_created', { id: result.id, meetingId, actorUserId: user?.id ?? null });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e: any) {
    log.error('decision_create_failed', { error: e });
    return NextResponse.json({ ok: false, error: e?.message || 'خطا در ذخیرهٔ مصوبه.' }, { status: 400 });
  }
}

/** PATCH — ویرایش مصوبه */
export async function PATCH(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  const id = intParam(req.nextUrl.searchParams, 'id');
  if (!id) return NextResponse.json({ ok: false, error: 'شناسه مصوبه الزامی است.' }, { status: 400 });

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'بدنهٔ درخواست نامعتبر است.' }, { status: 400 });
  }
  const parsed = decisionSchema.partial({ meetingId: true }).safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.' }, { status: 400 });

  const d = parsed.data;
  if (d.decisionType !== undefined && !isOneOf(d.decisionType, DECISION_TYPES)) {
    return NextResponse.json({ ok: false, error: 'نوع مصوبه نامعتبر است.' }, { status: 400 });
  }
  if (d.implementationStatus !== undefined && !isOneOf(d.implementationStatus, IMPLEMENTATION_STATUSES)) {
    return NextResponse.json({ ok: false, error: 'وضعیت اجرا نامعتبر است.' }, { status: 400 });
  }

  const user = await getSessionUser();
  const set: Partial<typeof council_decisions.$inferInsert> = { updatedAt: new Date() };
  if (d.studentId !== undefined) set.studentId = d.studentId || null;
  if (d.decisionType !== undefined) set.decisionType = d.decisionType;
  if (d.content !== undefined) set.content = d.content;
  if (d.implementationStatus !== undefined) set.implementationStatus = d.implementationStatus;
  if (d.deadline !== undefined) set.deadline = d.deadline ? new Date(d.deadline) : null;

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: council_decisions.id, implementationStatus: council_decisions.implementationStatus })
        .from(council_decisions)
        .where(eq(council_decisions.id, id))
        .limit(1)
        .for('update');
      if (!existing) return { ok: false as const, error: 'مصوبه یافت نشد.' };

      await tx.update(council_decisions).set(set).where(eq(council_decisions.id, id));
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'COUNCIL_DECISION_UPDATED',
        entityType: 'council_decisions',
        entityId: id,
        details: JSON.stringify({ from: existing.implementationStatus, to: d.implementationStatus ?? existing.implementationStatus }),
      });
      return { ok: true as const };
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    log.error('decision_update_failed', { error: e });
    return NextResponse.json({ ok: false, error: e?.message || 'خطا در به‌روزرسانی مصوبه.' }, { status: 400 });
  }
}

/** DELETE — حذف مصوبه */
export async function DELETE(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  const id = intParam(req.nextUrl.searchParams, 'id');
  if (!id) return NextResponse.json({ ok: false, error: 'شناسه مصوبه الزامی است.' }, { status: 400 });

  const user = await getSessionUser();
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: council_decisions.id, content: council_decisions.content })
        .from(council_decisions)
        .where(eq(council_decisions.id, id))
        .limit(1)
        .for('update');
      if (!existing) return { ok: false as const, error: 'مصوبه یافت نشد.' };
      await tx.delete(council_decisions).where(eq(council_decisions.id, id));
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'COUNCIL_DECISION_DELETED',
        entityType: 'council_decisions',
        entityId: id,
        details: JSON.stringify({ content: existing.content.slice(0, 200) }),
      });
      return { ok: true as const };
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    log.error('decision_delete_failed', { error: e });
    return NextResponse.json({ ok: false, error: e?.message || 'خطا در حذف مصوبه.' }, { status: 400 });
  }
}
