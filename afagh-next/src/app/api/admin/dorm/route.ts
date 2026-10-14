import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import type { DormResidenceInput } from '@/lib/dorm-cards';
import {

  createDormResidence,
  deleteDormResidence,
  listDormResidences,
  updateDormResidence,
} from '@/lib/dorm-cards';
import { assertCsrf } from '@/lib/security';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'api.admin.dorm' });
const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'] as const;

// nullish فیلدها به null تبدیل می‌شوند تا با DormResidenceInput (که null ندارد) سازگار شوند
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

// nullish → null نگاشت می‌شود و وضعیت پیش‌فرض از enum جدا می‌ماند
type DormBody = Omit<DormResidenceInput, 'status'> & {
  status?: DormResidenceInput['status'] | null;
};
const toInput = (d: z.infer<typeof bodySchema>): DormResidenceInput => ({
  studentId: d.studentId,
  dormName: d.dormName ?? null,
  roomNo: d.roomNo ?? null,
  bedNo: d.bedNo ?? null,
  academicYear: d.academicYear ?? null,
  validFrom: d.validFrom ?? null,
  validTo: d.validTo ?? null,
  ...(d.status ? { status: d.status } : {}),
});
const patchSchema = bodySchema.omit({ studentId: true });
type DormPatchBody = z.infer<typeof patchSchema>;
const toPatch = (d: DormPatchBody): DormResidenceInput => ({
  studentId: 0,
  dormName: d.dormName ?? null,
  roomNo: d.roomNo ?? null,
  bedNo: d.bedNo ?? null,
  academicYear: d.academicYear ?? null,
  validFrom: d.validFrom ?? null,
  validTo: d.validTo ?? null,
  status: d.status ?? undefined,
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
  // 🔒 گیت CSRF — بدون این، POST سایه‌ای از صفحهٔ مهاجم کوکی نشست را می‌فرستد
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }
    const result = await createDormResidence(toInput(parsed.data));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (e) {
    log.error('dorm POST failed', e);
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
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }
    const result = await updateDormResidence(id, toPatch(parsed.data));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('dorm PATCH failed', e);
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
