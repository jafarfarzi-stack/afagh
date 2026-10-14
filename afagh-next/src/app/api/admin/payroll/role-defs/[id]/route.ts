import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/security';
import { db } from '@/db';
import { z } from 'zod';
import { eq, sql, and } from 'drizzle-orm';
import { teaching_role_defs, offering_payroll_extras } from '@/db/schema-payroll-plus';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.payroll.role-defs' });
const WRITE_ROLES = ['ADMIN'];

const patchSchema = z.object({
  code: z.string().trim().min(2).max(50).regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullish(),
  isActive: z.union([z.literal(0), z.literal(1)]).optional(),
}).refine(v => Object.keys(v).length > 0, { message: 'فیلدی برای ویرایش ارسال نشده است.' });

function badId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** PUT — ویرایش نقش تدریس */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  assertSameOrigin(req);
  try {
    await requireRole([...WRITE_ROLES]);
    const id = badId((await ctx.params).id);
    if (id == null) return NextResponse.json({ ok: false, error: 'شناسهٔ نامعتبر است.' }, { status: 400 });

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.', details: parsed.error.flatten() }, { status: 400 });
    }
    const { code, title, description, isActive } = parsed.data;

    if (code) {
      const codeU = code.toUpperCase();
      const dup = await db
        .select({ id: teaching_role_defs.id })
        .from(teaching_role_defs)
        .where(and(eq(teaching_role_defs.code, codeU), sql`${teaching_role_defs.id} <> ${id}`))
        .limit(1);
      if (dup.length) {
        return NextResponse.json({ ok: false, error: 'این کد نقش قبلاً ثبت شده است.' }, { status: 409 });
      }
    }

    const patch: Record<string, unknown> = {};
    if (code) patch.code = code.toUpperCase();
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description || null;
    if (isActive !== undefined) patch.isActive = isActive;

    const [updated] = await db.update(teaching_role_defs).set(patch).where(eq(teaching_role_defs.id, id)).returning();
    if (!updated) return NextResponse.json({ ok: false, error: 'نقش یافت نشد.' }, { status: 404 });
    return NextResponse.json({ ok: true, roleDef: updated });
  } catch (err) {
    log.error('role-defs PUT failed', err);
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 500 });
  }
}

/** DELETE — فقط اگر هیچ ارائه‌ای از این کد نقش استفاده نکرده باشد */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole([...WRITE_ROLES]);
    const id = badId((await ctx.params).id);
    if (id == null) return NextResponse.json({ ok: false, error: 'شناسهٔ نامعتبر است.' }, { status: 400 });

    const [row] = await db.select({ code: teaching_role_defs.code }).from(teaching_role_defs).where(eq(teaching_role_defs.id, id)).limit(1);
    if (!row?.code) return NextResponse.json({ ok: false, error: 'نقش یافت نشد.' }, { status: 404 });

    // اگر این کد نقش روی ارائه‌هایی (offering_payroll_extras.payRoleOverride) نشسته باشد، حذف ممنوع
    const used = await db
      .select({ n: sql<number>`count(*)` })
      .from(offering_payroll_extras)
      .where(eq(offering_payroll_extras.payRoleOverride, row.code));
    if (Number(used[0]?.n ?? 0) > 0) {
      return NextResponse.json({
        ok: false,
        error: `این نقش روی ${used[0].n} ارائه‌ تدریس اعمال شده است. ابتدا نقش دستی آن ارائه‌ها را بردارید یا نقش را غیرفعال کنید.`,
      }, { status: 409 });
    }

    await db.delete(teaching_role_defs).where(eq(teaching_role_defs.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error)?.message;
    if (msg === 'NEXT_REDIRECT' || msg === 'NEXT_NOT_FOUND') throw err;
    log.error('role-defs DELETE failed', err);
    return NextResponse.json({ ok: false, error: msg || 'خطای ناشناخته' }, { status: 500 });
  }
}
