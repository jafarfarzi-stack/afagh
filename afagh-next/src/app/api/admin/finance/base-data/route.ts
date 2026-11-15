import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  financial_budgets,
  financial_contract_invoices,
  financial_contractors,
  financial_contracts,
  financial_expenses,
  financial_vat_entries,
  inventory_items,
  inventory_movements,
  legal_cases,
} from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { getCurrentUniversity, isRealUniversityId, universityEq } from '@/lib/university-scope';
import { assertCsrf } from '@/lib/security';
import { ENTITY_KEYS, getEntity } from '@/lib/finance-base/entities';
import { validateRow } from '@/lib/finance-base/validate';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.finance.base-data' });
const ALLOWED = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'] as const;
const PAGE_SIZE = 50;

/**
 * 🔒 نگاشتِ بستهٔ کلید → جدول.
 * کلید از کلاینت می‌آید؛ اگر در این نقشه نباشد، درخواست رد می‌شود.
 * این همان مرزِ امنیتی است که نمی‌گذارد کلاینت هر جدولی را هدف بگیرد.
 */
const TABLES: Record<
  string,
  {
    table: any;
    /** ستون‌هایی که برای حذف باید فرزندی نداشته باشند */
    blockedBy?: { table: any; column: any; label: string }[];
  }
> = {
  budgets: { table: financial_budgets },
  contractors: {
    table: financial_contractors,
    blockedBy: [{ table: financial_contracts, column: financial_contracts.contractorId, label: 'قرارداد' }],
  },
  contracts: {
    table: financial_contracts,
    blockedBy: [
      { table: financial_contract_invoices, column: financial_contract_invoices.contractId, label: 'صورتحساب' },
    ],
  },
  'contract-invoices': { table: financial_contract_invoices },
  expenses: { table: financial_expenses },
  vat: { table: financial_vat_entries },
  'inventory-items': {
    table: inventory_items,
    blockedBy: [{ table: inventory_movements, column: inventory_movements.itemId, label: 'گردش کالا' }],
  },
  'inventory-movements': { table: inventory_movements },
  'legal-cases': { table: legal_cases },
};

/** فقط ADMIN می‌تواند حذف کند (هم‌راستا با الگوی welfare) */
const DELETE_ROLES = ['ADMIN'] as const;

async function guard() {
  try {
    const role = await requireRole([...ALLOWED]);
    if (role instanceof NextResponse) return role;
    return null;
  } catch (e) {
    log.warn('base-data auth error', { err: e });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

function resolve(req: NextRequest): { key: string; spec: NonNullable<ReturnType<typeof getEntity>>; t: (typeof TABLES)[string] } | NextResponse {
  const key = new URL(req.url).searchParams.get('entity') ?? '';
  if (!ENTITY_KEYS.includes(key)) {
    return NextResponse.json({ error: 'unknown_entity', allowed: ENTITY_KEYS }, { status: 400 });
  }
  const spec = getEntity(key);
  const t = TABLES[key];
  if (!spec || !t) return NextResponse.json({ error: 'unknown_entity' }, { status: 400 });
  return { key, spec, t };
}

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const r = resolve(req);
    if (r instanceof NextResponse) return r;
    const { spec, t } = r;

    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const uni = (await getCurrentUniversity().catch(() => null))?.id ?? null;

    const where = universityEq(t.table.universityId, uni);
    const [{ total }] = await db.select({ total: count() }).from(t.table).where(where);
    const orderCol = spec.orderBy && t.table[spec.orderBy] ? t.table[spec.orderBy] : t.table.id;
    const rows = await db
      .select()
      .from(t.table)
      .where(where)
      .orderBy(desc(orderCol))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    // ── گزینه‌های ارجاعی (برای select‌های فرم) ──
    const refs: Record<string, { value: number; label: string }[]> = {};
    const wants = new Set(spec.fields.filter((f) => f.kind === 'ref').map((f) => f.ref));
    if (wants.has('contractors')) {
      const rs = await db
        .select({ id: financial_contractors.id, name: financial_contractors.name })
        .from(financial_contractors)
        .where(universityEq(financial_contractors.universityId, uni))
        .orderBy(asc(financial_contractors.name))
        .limit(500);
      refs.contractors = rs.map((x) => ({ value: x.id, label: x.name }));
    }
    if (wants.has('contracts')) {
      const rs = await db
        .select({
          id: financial_contracts.id,
          contractNo: financial_contracts.contractNo,
          subject: financial_contracts.subject,
          contractorName: financial_contractors.name,
        })
        .from(financial_contracts)
        .leftJoin(financial_contractors, eq(financial_contractors.id, financial_contracts.contractorId))
        .where(universityEq(financial_contracts.universityId, uni))
        .orderBy(desc(financial_contracts.id))
        .limit(500);
      refs.contracts = rs.map((x) => ({
        value: x.id,
        label: [x.contractNo, x.contractorName, x.subject].filter(Boolean).join(' — ') || `قرارداد #${x.id}`,
      }));
    }
    if (wants.has('inventory-items')) {
      const rs = await db
        .select({ id: inventory_items.id, code: inventory_items.code, name: inventory_items.name })
        .from(inventory_items)
        .where(universityEq(inventory_items.universityId, uni))
        .orderBy(asc(inventory_items.name))
        .limit(500);
      refs['inventory-items'] = rs.map((x) => ({
        value: x.id,
        label: [x.code, x.name].filter(Boolean).join(' — '),
      }));
    }

    // ── نیمسال‌ها (برای فیلدهای term / termCode) ──
    let terms: { value: string; label: string }[] = [];
    if (spec.fields.some((f) => f.kind === 'term' || f.kind === 'termCode')) {
      const ts = await db
        .select({ id: academic_terms.id, termCode: academic_terms.termCode })
        .from(academic_terms)
        .where(universityEq(academic_terms.universityId, uni))
        .orderBy(desc(academic_terms.termCode))
        .limit(200);
      terms = ts.map((x) => ({ value: String(x.termCode), label: String(x.termCode) }));
      // نگاشت کد → شناسه برای فیلدهای kind='term'
      (refs as any).__termIds = ts.map((x) => ({ value: x.id, label: String(x.termCode) }));
    }

    return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE, refs, terms });
  } catch (e) {
    log.error('base-data GET failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const r = resolve(req);
    if (r instanceof NextResponse) return r;
    const { key, spec, t } = r;

    const uni = (await getCurrentUniversity().catch(() => null))?.id ?? null;
    if (!isRealUniversityId(uni)) {
      return NextResponse.json({ error: 'no_university' }, { status: 403 });
    }

    const body = await req.json();
    const v = validateRow(spec, body ?? {});
    if (!v.ok) return NextResponse.json({ error: 'invalid_body', errors: v.errors }, { status: 400 });

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.table)
        .values({ ...v.values, universityId: uni })
        .returning({ id: t.table.id });
      await appendAudit(tx, {
        actorUserId: user.id,
        action: `FIN_BASE_${key.toUpperCase().replace(/-/g, '_')}_CREATED`,
        entityType: spec.table,
        entityId: row.id,
        details: JSON.stringify(v.values),
      });
      return row;
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    log.error('base-data POST failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const r = resolve(req);
    if (r instanceof NextResponse) return r;
    const { key, spec, t } = r;

    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }

    const uni = (await getCurrentUniversity().catch(() => null))?.id ?? null;
    if (!isRealUniversityId(uni)) {
      return NextResponse.json({ error: 'no_university' }, { status: 403 });
    }

    const body = await req.json();
    const v = validateRow(spec, body ?? {}, true);
    if (!v.ok) return NextResponse.json({ error: 'invalid_body', errors: v.errors }, { status: 400 });

    const out = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ id: t.table.id, universityId: t.table.universityId })
        .from(t.table)
        .where(eq(t.table.id, id))
        .for('update')
        .limit(1);
      if (!before) return 'not_found' as const;
      // 🔒 مرزِ دانشگاه: ردیفِ دانشگاهِ دیگر قابلِ ویرایش نیست
      if (before.universityId !== null && before.universityId !== uni) return 'forbidden' as const;

      const [row] = await tx
        .update(t.table)
        .set(v.values)
        .where(eq(t.table.id, id))
        .returning({ id: t.table.id });
      await appendAudit(tx, {
        actorUserId: user.id,
        action: `FIN_BASE_${key.toUpperCase().replace(/-/g, '_')}_UPDATED`,
        entityType: spec.table,
        entityId: id,
        details: JSON.stringify(v.values),
      });
      return row;
    });

    if (out === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (out === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ ok: true, id: out.id });
  } catch (e) {
    log.error('base-data PATCH failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denied = await guard();
  if (denied) return denied;
  try {
    const user = await getSessionUser();
    if (!user || !DELETE_ROLES.some((r) => user.roles.includes(r))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const r = resolve(req);
    if (r instanceof NextResponse) return r;
    const { key, spec, t } = r;

    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }

    const uni = (await getCurrentUniversity().catch(() => null))?.id ?? null;
    if (!isRealUniversityId(uni)) {
      return NextResponse.json({ error: 'no_university' }, { status: 403 });
    }

    // ── فرزندانِ وابسته: حذفِ پدر، یتیم‌سازی می‌کند ──
    for (const dep of t.blockedBy ?? []) {
      const [{ n }] = await db
        .select({ n: count() })
        .from(dep.table)
        .where(eq(dep.column, id));
      if (Number(n) > 0) {
        return NextResponse.json(
          { error: 'in_use', message: `${Number(n)} ${dep.label} به این ردیف وابسته است.` },
          { status: 409 },
        );
      }
    }

    const out = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ id: t.table.id, universityId: t.table.universityId })
        .from(t.table)
        .where(and(eq(t.table.id, id), universityEq(t.table.universityId, uni)))
        .for('update')
        .limit(1);
      if (!before) return 'not_found' as const;

      await tx.delete(t.table).where(eq(t.table.id, id));
      await appendAudit(tx, {
        actorUserId: user.id,
        action: `FIN_BASE_${key.toUpperCase().replace(/-/g, '_')}_DELETED`,
        entityType: spec.table,
        entityId: id,
        details: JSON.stringify({ id }),
      });
      return 'ok' as const;
    });

    if (out === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('base-data DELETE failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

void sql;
