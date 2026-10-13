import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  course_offerings,
  courses,
  academic_terms,
  students,
  users,
} from '@/db/schema';
import { english_enrollment_approvals } from '@/db/schema-enrollment-approvals';
import { requireRole, getSessionUser } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { getCurrentUniversity } from '@/lib/university-scope';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.enroll-approval' });
const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'] as const;
const PAGE_SIZE = 50;
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

const createSchema = z.object({
  studentId: z.number().int().positive(),
  offeringId: z.number().int().positive(),
  note: z.string().max(2000).nullish(),
});

const patchSchema = z
  .object({
    status: z.enum(STATUSES),
    note: z.string().max(2000).nullish(),
  })
  .partial();

async function guard(req: NextRequest) {
  try {
    const role = await requireRole([...ALLOWED]);
    if (role instanceof NextResponse) return role;
    return null;
  } catch (e) {
    log.warn('enroll-approval auth error', { err: e });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') ?? '').trim();
    const status = searchParams.get('status');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const universityId = (await getCurrentUniversity().catch(() => null))?.id ?? null;

    // جستجوی دانشجو (اتومکمل مثل discipline/warnings)
    if (searchParams.get('action') === 'students') {
      if (!q) return NextResponse.json({ hits: [] });
      const name = sql`(${users.firstName} || ' ' || ${users.lastName})`;
      const rows = await db
        .select({
          studentId: students.id,
          studentCode: students.studentCode,
          name,
          entryYear: students.entryYear,
        })
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .where(
          universityId
            ? and(
                eq(students.universityId, universityId),
                or(eq(students.studentCode, q), sql`${name} LIKE ${'%' + q + '%'}`),
              )
            : or(eq(students.studentCode, q), sql`${name} LIKE ${'%' + q + '%'}`),
        )
        .limit(20);
      return NextResponse.json({ hits: rows });
    }

    // جستجوی ارائهٔ درس انگلیسی (فرم ایجاد درخواست)
    if (searchParams.get('action') === 'offerings') {
      const titleCond = or(
        ilike(courses.title, `%${q}%`),
        ilike(courses.code, `%${q}%`),
        // پیش‌فرض: درس‌های زبان/انگلیسی وقتی عبارتی وارد نشده یا با «انگلیس/زبان» می‌خواند
        q ? undefined : sql`(${courses.title} LIKE '%انگلیس%' OR ${courses.title} LIKE '%زبان%' OR ${courses.title} ILIKE '%english%')`,
      );
      const rows = await db
        .select({
          offeringId: course_offerings.id,
          courseTitle: courses.title,
          courseCode: courses.code,
          termTitle: academic_terms.title,
          groupNumber: course_offerings.groupNumber,
          capacity: course_offerings.capacity,
          enrolledCount: course_offerings.enrolledCount,
        })
        .from(course_offerings)
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
        .where(
          and(
            eq(course_offerings.isActive, 1),
            universityId ? eq(course_offerings.universityId, universityId) : undefined,
            titleCond,
          ),
        )
        .orderBy(desc(academic_terms.sortOrder), courses.title, course_offerings.groupNumber)
        .limit(20);
      return NextResponse.json({ hits: rows });
    }

    // لیست درخواست‌ها
    const where: ReturnType<typeof and> = universityId
      ? and(
          eq(english_enrollment_approvals.universityId, universityId),
          status && STATUSES.includes(status as (typeof STATUSES)[number])
            ? eq(english_enrollment_approvals.status, status)
            : undefined,
          q
            ? or(
                ilike(students.studentCode, `%${q}%`),
                ilike(courses.title, `%${q}%`),
                sql`(${users.firstName} || ' ' || ${users.lastName}) LIKE ${'%' + q + '%'}`,
              )
            : undefined,
        )
      : and(
          status && STATUSES.includes(status as (typeof STATUSES)[number])
            ? eq(english_enrollment_approvals.status, status)
            : undefined,
          q
            ? or(
                ilike(students.studentCode, `%${q}%`),
                ilike(courses.title, `%${q}%`),
                sql`(${users.firstName} || ' ' || ${users.lastName}) LIKE ${'%' + q + '%'}`,
              )
            : undefined,
        );

    const [{ total }] = await db
      .select({ total: count() })
      .from(english_enrollment_approvals)
      .innerJoin(students, eq(students.id, english_enrollment_approvals.studentId))
      .innerJoin(course_offerings, eq(course_offerings.id, english_enrollment_approvals.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(where);

    const rows = await db
      .select({
        id: english_enrollment_approvals.id,
        studentId: english_enrollment_approvals.studentId,
        studentCode: students.studentCode,
        studentName: sql`(${users.firstName} || ' ' || ${users.lastName})`,
        offeringId: english_enrollment_approvals.offeringId,
        courseTitle: courses.title,
        courseCode: courses.code,
        termTitle: academic_terms.title,
        groupNumber: course_offerings.groupNumber,
        status: english_enrollment_approvals.status,
        note: english_enrollment_approvals.note,
        requestedBy: english_enrollment_approvals.requestedBy,
        decidedBy: english_enrollment_approvals.decidedBy,
        decidedAt: english_enrollment_approvals.decidedAt,
        createdAt: english_enrollment_approvals.createdAt,
      })
      .from(english_enrollment_approvals)
      .innerJoin(students, eq(students.id, english_enrollment_approvals.studentId))
      .innerJoin(course_offerings, eq(course_offerings.id, english_enrollment_approvals.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(where)
      .orderBy(desc(english_enrollment_approvals.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE });
  } catch (e) {
    log.error('enroll-approval GET failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { studentId, offeringId, note } = parsed.data;

    const [offering] = await db
      .select({ id: course_offerings.id, universityId: course_offerings.universityId })
      .from(course_offerings)
      .where(eq(course_offerings.id, offeringId))
      .limit(1);
    if (!offering) return NextResponse.json({ error: 'offering_not_found' }, { status: 404 });

    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!student) return NextResponse.json({ error: 'student_not_found' }, { status: 404 });

    const universityId = (await getCurrentUniversity().catch(() => null))?.id ?? offering.universityId ?? null;

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(english_enrollment_approvals)
        .values({
          studentId,
          offeringId,
          status: 'PENDING',
          requestedBy: user.id,
          note: note ?? null,
          universityId,
        })
        .returning({ id: english_enrollment_approvals.id });
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'ENROLL_APPROVAL_CREATED',
        entityType: 'english_enrollment_approval',
        entityId: row.id,
        details: JSON.stringify({ studentId, offeringId }),
      });
      return row;
    });

    return NextResponse.json({ id: created.id, status: 'PENDING' }, { status: 201 });
  } catch (e) {
    log.error('enroll-approval POST failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ id: english_enrollment_approvals.id, status: english_enrollment_approvals.status })
        .from(english_enrollment_approvals)
        .where(eq(english_enrollment_approvals.id, id))
        .for('update')
        .limit(1);
      if (!before) return null;

      const values: Partial<typeof english_enrollment_approvals.$inferInsert> = {};
      if (patch.status !== undefined) {
        values.status = patch.status;
        values.decidedBy = user.id;
        values.decidedAt = new Date();
      }
      if (patch.note !== undefined) values.note = patch.note;

      const [row] = await tx
        .update(english_enrollment_approvals)
        .set(values)
        .where(eq(english_enrollment_approvals.id, id))
        .returning({ id: english_enrollment_approvals.id, status: english_enrollment_approvals.status });

      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'ENROLL_APPROVAL_UPDATED',
        entityType: 'english_enrollment_approval',
        entityId: id,
        details: JSON.stringify({ from: before.status, to: row.status, note: patch.note ?? null }),
      });
      return row;
    });

    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    log.error('enroll-approval PATCH failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user || !user.roles.includes('ADMIN')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }

    const deleted = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(english_enrollment_approvals)
        .where(eq(english_enrollment_approvals.id, id))
        .returning({ id: english_enrollment_approvals.id });
      if (!row) return null;
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'ENROLL_APPROVAL_DELETED',
        entityType: 'english_enrollment_approval',
        entityId: id,
        details: JSON.stringify({ id }),
      });
      return row;
    });

    if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('enroll-approval DELETE failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
