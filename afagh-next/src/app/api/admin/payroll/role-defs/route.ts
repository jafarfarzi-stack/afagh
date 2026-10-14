import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { assertCsrf } from '@/lib/security';
import { db } from '@/db';
import { z } from 'zod';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { teaching_role_defs } from '@/db/schema-payroll-plus';
import { getCurrentUniversity } from '@/lib/university-scope';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.payroll.role-defs' });
const READ_ROLES = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE'];
const WRITE_ROLES = ['ADMIN'];

const bodySchema = z.object({
  code: z.string().trim().min(2).max(50).regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'کد فقط حروف لاتین/رقم/زیرخط'),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  isActive: z.union([z.literal(0), z.literal(1)]).optional(),
});

/** GET — کاتالوگ نقش‌های تدریس (سراسری + دانشگاه جاری) */
export async function GET() {
  try {
    await requireRole([...READ_ROLES]);
    const uni = await getCurrentUniversity().catch(() => null);
    const rows = await db
      .select()
      .from(teaching_role_defs)
      .where(uni
        ? or(eq(teaching_role_defs.universityId, uni.id), isNull(teaching_role_defs.universityId))
        : isNull(teaching_role_defs.universityId))
      .orderBy(teaching_role_defs.code);
    return NextResponse.json({ ok: true, roleDefs: rows });
  } catch (err) {
    // requireRole به‌جای throw، redirect پرتاب می‌کند — این خطا نیست
    const msg = (err as Error)?.message;
    if (msg === 'NEXT_REDIRECT' || msg === 'NEXT_NOT_FOUND') throw err;
    log.error('role-defs GET failed', err);
    return NextResponse.json({ ok: false, error: msg || 'خطای ناشناخته' }, { status: 500 });
  }
}

/** POST — افزودن نقش تدریس به کاتالوگ */
export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  try {
    await requireRole([...WRITE_ROLES]);
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.', details: parsed.error.flatten() }, { status: 400 });
    }
    const { code, title, description, isActive } = parsed.data;
    const codeU = code.toUpperCase();
    const uni = await getCurrentUniversity().catch(() => null);

    const dup = await db
      .select({ id: teaching_role_defs.id })
      .from(teaching_role_defs)
      .where(eq(teaching_role_defs.code, codeU))
      .limit(1);
    if (dup.length) {
      return NextResponse.json({ ok: false, error: 'این کد نقش قبلاً ثبت شده است.' }, { status: 409 });
    }

    const [created] = await db
      .insert(teaching_role_defs)
      .values({
        code: codeU,
        title,
        description: description || null,
        isActive: isActive ?? 1,
        universityId: uni?.id ?? null,
      })
      .returning();
    return NextResponse.json({ ok: true, roleDef: created });
  } catch (err) {
    log.error('role-defs POST failed', err);
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 500 });
  }
}
