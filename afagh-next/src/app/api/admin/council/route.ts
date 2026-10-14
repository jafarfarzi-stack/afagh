import { assertCsrf } from '@/lib/security';
// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — «شورای آموزشی» — API جلسات و مصوبات
//
//  GET    /api/admin/council                 → فهرست جلسات (+ شمارش مصوبات)
//  POST   /api/admin/council                 → ایجاد جلسه
//  PATCH  /api/admin/council?id=             → ویرایش جلسه
//  DELETE /api/admin/council?id=             → حذف جلسه (cascade مصوبات)
//
//  GET    /api/admin/council/decisions       → فهرست مصوبات با فیلتر
//  POST   /api/admin/council/decisions       → ایجاد مصوبه
//  PATCH  /api/admin/council/decisions?id=   → ویرایش مصوبه/وضعیت اجرا
//  DELETE /api/admin/council/decisions?id=   → حذف مصوبه
//
//  جداول: council_meetings + council_decisions (schema-council.ts)
//  قراردادها: src/lib/council.ts — نوع/وضعیت فارسی = مقدار ذخیره‌شده
// ══════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { council_meetings, council_decisions } from '@/db/schema-council';
import { requireRole, getSessionUser } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { getCurrentUniversity } from '@/lib/university-scope';
import { strParam, intParam, dateParam } from '@/lib/council';


export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.council' });
const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];
const PAGE_SIZE = 50;

const meetingSchema = z.object({
  title: z.string().trim().min(1).max(250),
  meetingDate: z.string().trim().min(1).max(40).optional().nullable(),
  members: z.string().trim().max(8000).optional().nullable(),
  agenda: z.string().trim().max(8000).optional().nullable(),
  minutes: z.string().trim().max(30000).optional().nullable(),
});

async function guard() {
  try {
    await requireRole(ALLOWED);
    return null;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'دسترسی غیرمجاز' }, { status: 401 });
  }
}

// ═══════════ جلسات ═══════════

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;

  const filters: SQL[] = [];
  const uni = await getCurrentUniversity().catch(() => null);
  if (uni) filters.push(eq(council_meetings.universityId, uni.id));
  const dateFrom = dateParam(sp, 'dateFrom');
  if (dateFrom) filters.push(gte(council_meetings.meetingDate, dateFrom));
  const dateTo = dateParam(sp, 'dateTo');
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    filters.push(lte(council_meetings.meetingDate, end));
  }
  const q = strParam(sp, 'q');
  if (q) {
    const like = `%${q}%`;
    filters.push(or(ilike(council_meetings.title, like), ilike(council_meetings.agenda, like))!);
  }

  const where = and(...filters) ?? undefined;

  const page = Math.max(1, intParam(sp, 'page') ?? 1);
  const [{ total }] = await db.select({ total: count() }).from(council_meetings).where(where);

  const rows = await db
    .select({
      id: council_meetings.id,
      title: council_meetings.title,
      meetingDate: council_meetings.meetingDate,
      members: council_meetings.members,
      agenda: council_meetings.agenda,
      minutes: council_meetings.minutes,
      universityId: council_meetings.universityId,
      createdBy: council_meetings.createdBy,
      decisionsCount: count(council_decisions.id),
      createdAt: council_meetings.createdAt,
      updatedAt: council_meetings.updatedAt,
    })
    .from(council_meetings)
    .leftJoin(council_decisions, eq(council_decisions.meetingId, council_meetings.id))
    .where(where)
    .groupBy(council_meetings.id)
    .orderBy(desc(council_meetings.meetingDate), desc(council_meetings.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return NextResponse.json({ ok: true, rows, total, page, pageSize: PAGE_SIZE });
}

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
  const parsed = meetingSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.' }, { status: 400 });

  const user = await getSessionUser();
  const uni = await getCurrentUniversity().catch(() => null);
  const { title, meetingDate, members, agenda, minutes } = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const [ins] = await tx.insert(council_meetings).values({
        title,
        meetingDate: meetingDate ? new Date(meetingDate) : null,
        members: members || null,
        agenda: agenda || null,
        minutes: minutes || null,
        universityId: uni?.id ?? null,
        createdBy: user?.id ?? null,
      }).returning({ id: council_meetings.id });
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'COUNCIL_MEETING_CREATED',
        entityType: 'council_meetings',
        entityId: ins.id,
        details: JSON.stringify({ title }),
      });
      return { ok: true as const, id: ins.id };
    });
    log.info('meeting_created', { id: result.id, actorUserId: user?.id ?? null });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e: any) {
    log.error('meeting_create_failed', { error: e });
    return NextResponse.json({ ok: false, error: e?.message || 'خطا در ذخیرهٔ جلسه.' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  const id = intParam(req.nextUrl.searchParams, 'id');
  if (!id) return NextResponse.json({ ok: false, error: 'شناسه جلسه الزامی است.' }, { status: 400 });

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'بدنهٔ درخواست نامعتبر است.' }, { status: 400 });
  }
  const parsed = meetingSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.' }, { status: 400 });

  const user = await getSessionUser();
  const { title, meetingDate, members, agenda, minutes } = parsed.data;
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: council_meetings.id }).from(council_meetings)
        .where(eq(council_meetings.id, id)).limit(1).for('update');
      if (!existing) return { ok: false as const, error: 'جلسه یافت نشد.' };
      await tx.update(council_meetings).set({
        title,
        meetingDate: meetingDate ? new Date(meetingDate) : null,
        members: members || null,
        agenda: agenda || null,
        minutes: minutes || null,
        updatedAt: new Date(),
      }).where(eq(council_meetings.id, id));
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'COUNCIL_MEETING_UPDATED',
        entityType: 'council_meetings',
        entityId: id,
        details: JSON.stringify({ title }),
      });
      return { ok: true as const };
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    log.error('meeting_update_failed', { error: e });
    return NextResponse.json({ ok: false, error: e?.message || 'خطا در به‌روزرسانی جلسه.' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  const id = intParam(req.nextUrl.searchParams, 'id');
  if (!id) return NextResponse.json({ ok: false, error: 'شناسه جلسه الزامی است.' }, { status: 400 });

  const user = await getSessionUser();
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: council_meetings.id, title: council_meetings.title })
        .from(council_meetings).where(eq(council_meetings.id, id)).limit(1).for('update');
      if (!existing) return { ok: false as const, error: 'جلسه یافت نشد.' };
      await tx.delete(council_meetings).where(eq(council_meetings.id, id));
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'COUNCIL_MEETING_DELETED',
        entityType: 'council_meetings',
        entityId: id,
        details: JSON.stringify({ title: existing.title }),
      });
      return { ok: true as const };
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    log.error('meeting_delete_failed', { error: e });
    return NextResponse.json({ ok: false, error: e?.message || 'خطا در حذف جلسه.' }, { status: 400 });
  }
}
