import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { student_loans, students, users } from '@/db/schema';
import { welfare_funds } from '@/db/schema-welfare';
import { requireRole, getSessionUser } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { getCurrentUniversity } from '@/lib/university-scope';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.welfare' });
const ALLOWED = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'] as const;
const PAGE_SIZE = 50;

const fundSchema = z.object({
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(150),
  description: z.string().max(2000).nullish(),
  isActive: z.number().int().min(0).max(1).nullish(),
});

async function guard() {
  try {
    const role = await requireRole([...ALLOWED]);
    if (role instanceof NextResponse) return role;
    return null;
  } catch (e) {
    log.warn('welfare auth error', e);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

function uniFilter(universityId: number | null) {
  return universityId ? eq(welfare_funds.universityId, universityId) : undefined;
}

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const universityId = await getCurrentUniversity();

    // وام‌های یک صندوق (با نام دانشجو) — fundId=unassigned یعنی بدون صندوق
    const fundIdParam = searchParams.get('fundId');
    if (fundIdParam) {
      const unassigned = fundIdParam === 'unassigned';
      const fundId = unassigned ? NaN : Number(fundIdParam);
      if (!unassigned && (!Number.isInteger(fundId) || fundId <= 0)) {
        return NextResponse.json({ error: 'invalid_fund' }, { status: 400 });
      }
      const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
      const fundCond = unassigned
        ? isNull(student_loans.welfareFundId)
        : eq(student_loans.welfareFundId, fundId);
      const where = universityId
        ? and(fundCond, eq(student_loans.universityId, universityId))
        : fundCond;
      const [{ total }] = await db.select({ total: count() }).from(student_loans).where(where);
      const rows = await db
        .select({
          id: student_loans.id,
          studentId: student_loans.studentId,
          studentCode: students.studentCode,
          studentName: sql`(${users.firstName} || ' ' || ${users.lastName})`,
          lender: student_loans.lender,
          loanCode: student_loans.loanCode,
          amount: student_loans.amount,
          installments: student_loans.installments,
          status: student_loans.status,
          welfareFundId: student_loans.welfareFundId,
          fundTitle: welfare_funds.title,
          createdAt: student_loans.createdAt,
        })
        .from(student_loans)
        .innerJoin(students, eq(students.id, student_loans.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .leftJoin(welfare_funds, eq(welfare_funds.id, student_loans.welfareFundId))
        .where(where)
        .orderBy(desc(student_loans.createdAt))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE);
      return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE });
    }

    // فهرست صندوق‌ها + تعداد وام هر صندوق
    const funds = await db
      .select()
      .from(welfare_funds)
      .where(uniFilter(universityId))
      .orderBy(desc(welfare_funds.id));
    const counts = await db
      .select({ fundId: student_loans.welfareFundId, n: count() })
      .from(student_loans)
      .where(
        universityId
          ? and(eq(student_loans.universityId, universityId))
          : undefined,
      );
    const countMap = new Map<number, number>();
    for (const c of counts) if (c.fundId !== null) countMap.set(c.fundId, Number(c.n));
    return NextResponse.json({
      funds: funds.map((f) => ({ ...f, loanCount: countMap.get(f.id) ?? 0 })),
    });
  } catch (e) {
    log.error('welfare GET failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const body = await req.json();

    // انتساب صندوق به وام موجود
    if (body?.action === 'assign-loan') {
      const loanId = Number(body.loanId);
      const fundId = body.fundId === null ? null : Number(body.fundId);
      if (!Number.isInteger(loanId) || loanId <= 0) {
        return NextResponse.json({ error: 'invalid_loan' }, { status: 400 });
      }
      if (fundId !== null && (!Number.isInteger(fundId) || fundId <= 0)) {
        return NextResponse.json({ error: 'invalid_fund' }, { status: 400 });
      }
      const universityId = await getCurrentUniversity();
      const result = await db.transaction(async (tx) => {
        const [loan] = await tx
          .select({ id: student_loans.id, universityId: student_loans.universityId })
          .from(student_loans)
          .where(eq(student_loans.id, loanId))
          .for('update')
          .limit(1);
        if (!loan) return null;
        if (universityId !== null && loan.universityId !== null && loan.universityId !== universityId) {
          return 'forbidden' as const;
        }
        if (fundId !== null) {
          const [fund] = await tx
            .select({ id: welfare_funds.id })
            .from(welfare_funds)
            .where(eq(welfare_funds.id, fundId))
            .limit(1);
          if (!fund) return 'no_fund' as const;
        }
        await tx
          .update(student_loans)
          .set({ welfareFundId: fundId })
          .where(eq(student_loans.id, loanId));
        await appendAudit(tx, {
          actorUserId: user.id,
          action: 'WELFARE_LOAN_ASSIGNED',
          entityType: 'student_loans',
          entityId: loanId,
          details: JSON.stringify({ fundId }),
        });
        return 'ok' as const;
      });
      if (result === null) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      if (result === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      if (result === 'no_fund') return NextResponse.json({ error: 'fund_not_found' }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // ساخت صندوق جدید
    const parsed = fundSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }
    const universityId = await getCurrentUniversity();
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(welfare_funds)
        .values({
          code: parsed.data.code,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          isActive: parsed.data.isActive ?? 1,
          universityId,
        })
        .returning({ id: welfare_funds.id });
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'WELFARE_FUND_CREATED',
        entityType: 'welfare_funds',
        entityId: row.id,
        details: JSON.stringify({ code: parsed.data.code, title: parsed.data.title }),
      });
      return row;
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'duplicate_code' }, { status: 409 });
    }
    log.error('welfare POST failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }
    const parsed = fundSchema.partial().safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
    }
    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ id: welfare_funds.id })
        .from(welfare_funds)
        .where(eq(welfare_funds.id, id))
        .for('update')
        .limit(1);
      if (!before) return null;
      const [row] = await tx
        .update(welfare_funds)
        .set(parsed.data)
        .where(eq(welfare_funds.id, id))
        .returning({ id: welfare_funds.id });
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'WELFARE_FUND_UPDATED',
        entityType: 'welfare_funds',
        entityId: id,
        details: JSON.stringify(parsed.data),
      });
      return row;
    });
    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    log.error('welfare PATCH failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }
    const [{ n }] = await db
      .select({ n: count() })
      .from(student_loans)
      .where(eq(student_loans.welfareFundId, id));
    if (Number(n) > 0) {
      return NextResponse.json({ error: 'fund_in_use', loanCount: Number(n) }, { status: 409 });
    }
    const deleted = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(welfare_funds)
        .where(eq(welfare_funds.id, id))
        .returning({ id: welfare_funds.id });
      if (!row) return null;
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'WELFARE_FUND_DELETED',
        entityType: 'welfare_funds',
        entityId: id,
        details: JSON.stringify({ id }),
      });
      return row;
    });
    if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('welfare DELETE failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
