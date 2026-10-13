import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import {
  createDormResidence,
  deleteDormResidence,
  listDormResidences,
  updateDormResidence,
} from '@/lib/dorm-cards';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'api.admin.dorm' });
const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'] as const;

const bodySchema = z.object({
  studentId: z.number().int().positive(),
  dormName: z.string().max(150).nullish(),
  roomNo: z.string().max(30).nullish(),
  bedNo: z.string().max(30).nullish(),
  academicYear: z.string().max(20).nullish(),
  validFrom: z.string().nullish(),
  validTo: z.string().nullish(),
  status: z.enum(['active', 'ended', 'revoked']).nullish(),
});

async function guard() {
  try {
    const role = await requireRole([...ALLOWED]);
    if (role instanceof NextResponse) return role;
    return null;
  } catch (e) {
    log.warn('dorm auth error', { err: e });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const studentIdRaw = searchParams.get('studentId');
    const studentId = studentIdRaw ? Number(studentIdRaw) : undefined;
    if (status && !['active', 'ended', 'revoked'].includes(status)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    const rows = await listDormResidences({
      status,
      studentId: studentId && Number.isInteger(studentId) && studentId > 0 ? studentId : undefined,
    });
    return NextResponse.json({ rows, total: rows.length });
  } catch (e) {
    log.error('dorm GET failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }
    const result = await createDormResidence({ ...parsed.data, studentId: parsed.data.studentId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (e) {
    log.error('dorm POST failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }
    const parsed = bodySchema.omit({ studentId: true }).safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }
    const result = await updateDormResidence(id, { studentId: 0, ...parsed.data });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('dorm PATCH failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }
    const result = await deleteDormResidence(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('dorm DELETE failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
