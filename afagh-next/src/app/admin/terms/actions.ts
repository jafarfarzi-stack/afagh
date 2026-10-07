'use server';

import { and, eq, inArray, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { academic_terms, universities } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { termContainsToday } from '@/lib/term-scope';

export type TermActivationResult =
  | { ok: true; message: string; activated: number; cleared: number; missing: string[] }
  | { ok: false; error: string; activated: number; cleared: number; missing: string[] };

export type SyncEntry = { university: string; termCode: string; termId: number | null };

export type SyncResult =
  | {
      ok: true;
      message: string;
      activated: SyncEntry[];
      unchanged: SyncEntry[];
      noContaining: string[];
      cleared: number;
    }
  | { ok: false; error: string };

function revalidateTermPaths(): void {
  revalidatePath('/admin/terms');
  revalidatePath('/admin');
  revalidatePath('/admin/scheduling');
}

async function applyActivation(
  picks: { universityId: number; termId: number }[],
): Promise<{ activated: number; cleared: number }> {
  return db.transaction(async (tx) => {
    let activated = 0;
    let cleared = 0;
    for (const pick of picks) {
      const clearedRows = await tx
        .update(academic_terms)
        .set({ isCurrent: 0 })
        .where(
          and(
            eq(academic_terms.universityId, pick.universityId),
            ne(academic_terms.id, pick.termId),
            eq(academic_terms.isCurrent, 1),
          ),
        )
        .returning({ id: academic_terms.id });
      cleared += clearedRows.length;

      const setRows = await tx
        .update(academic_terms)
        .set({ isCurrent: 1 })
        .where(and(eq(academic_terms.id, pick.termId), eq(academic_terms.universityId, pick.universityId)))
        .returning({ id: academic_terms.id });
      activated += setRows.length;
    }
    return { activated, cleared };
  });
}

export async function activateTermAction(termId: number): Promise<TermActivationResult> {
  await requireRole(['ADMIN']);
  try {
    const id = Number(termId);
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, error: 'شناسهٔ نیمسال نامعتبر است', activated: 0, cleared: 0, missing: [] };
    }

    const [term] = await db
      .select({
        id: academic_terms.id,
        universityId: academic_terms.universityId,
        termCode: academic_terms.termCode,
        isCurrent: academic_terms.isCurrent,
      })
      .from(academic_terms)
      .where(eq(academic_terms.id, id))
      .limit(1);
    if (!term) return { ok: false, error: 'نیمسال یافت نشد', activated: 0, cleared: 0, missing: [] };
    if (term.universityId == null) {
      return {
        ok: false,
        error: 'این نیمسال به دانشگاهی وصل نیست و قابل فعال‌سازی نیست',
        activated: 0,
        cleared: 0,
        missing: [],
      };
    }
    if (term.isCurrent === 1) {
      return { ok: true, message: `نیمسال ${term.termCode} از قبل فعال است`, activated: 0, cleared: 0, missing: [] };
    }

    const { activated, cleared } = await applyActivation([
      { universityId: term.universityId, termId: term.id },
    ]);
    revalidateTermPaths();
    return {
      ok: true,
      message: `نیمسال ${term.termCode} فعال شد و پرچم فعالِ سایر نیمسال‌های این دانشگاه صفر شد`,
      activated,
      cleared,
      missing: [],
    };
  } catch (err: any) {
    console.error('activateTermAction:', err);
    return { ok: false, error: err?.message || 'خطا در فعال‌سازی نیمسال', activated: 0, cleared: 0, missing: [] };
  }
}

export async function bulkActivateTermsAction(
  picks: { universityId: number; termId: number }[],
): Promise<TermActivationResult> {
  await requireRole(['ADMIN']);
  try {
    const cleaned = (Array.isArray(picks) ? picks : [])
      .map((p) => ({ universityId: Number(p?.universityId), termId: Number(p?.termId) }))
      .filter(
        (p) => Number.isInteger(p.universityId) && p.universityId > 0 && Number.isInteger(p.termId) && p.termId > 0,
      );
    if (!cleaned.length) {
      return { ok: false, error: 'هیچ نیمسالی برای فعال‌سازی انتخاب نشده است', activated: 0, cleared: 0, missing: [] };
    }

    const byUniversity = new Map<number, number>();
    for (const p of cleaned) byUniversity.set(p.universityId, p.termId);
    const wanted = [...byUniversity.entries()].map(([universityId, termId]) => ({ universityId, termId }));

    const rows = await db
      .select({
        id: academic_terms.id,
        universityId: academic_terms.universityId,
        termCode: academic_terms.termCode,
      })
      .from(academic_terms)
      .where(inArray(academic_terms.id, wanted.map((w) => w.termId)));
    const byId = new Map(rows.map((r) => [r.id, r]));

    const uniRows = await db.select({ id: universities.id, code: universities.code, title: universities.title }).from(universities);
    const uniName = new Map(uniRows.map((u) => [u.id, `${u.title} (${u.code})`]));

    const missing: string[] = [];
    const valid: { universityId: number; termId: number }[] = [];
    for (const w of wanted) {
      const row = byId.get(w.termId);
      if (!row || row.universityId !== w.universityId) {
        missing.push(`نیمسال با شناسهٔ ${w.termId} برای ${uniName.get(w.universityId) ?? `دانشگاه ${w.universityId}`} پیدا نشد`);
        continue;
      }
      valid.push(w);
    }
    if (!valid.length) {
      return { ok: false, error: 'هیچ‌کدام از نیمسال‌های انتخابی معتبر نبود', activated: 0, cleared: 0, missing };
    }

    const { activated, cleared } = await applyActivation(valid);
    revalidateTermPaths();
    const activatedCodes = valid.map((v) => byId.get(v.termId)?.termCode).filter(Boolean).join('، ');
    const missingNote = missing.length ? ` — ${missing.length} مورد نادیده گرفته شد` : '';
    return {
      ok: true,
      message: `فعال‌سازی گروهی برای ${valid.length} دانشگاه انجام شد — نیمسال‌های فعال: ${activatedCodes}${missingNote}`,
      activated,
      cleared,
      missing,
    };
  } catch (err: any) {
    console.error('bulkActivateTermsAction:', err);
    return { ok: false, error: err?.message || 'خطا در فعال‌سازی گروهی', activated: 0, cleared: 0, missing: [] };
  }
}

export async function syncTermsWithDateAction(): Promise<SyncResult> {
  await requireRole(['ADMIN']);
  try {
    const today = new Date();

    const rows = await db
      .select({
        id: academic_terms.id,
        universityId: academic_terms.universityId,
        termCode: academic_terms.termCode,
        startDate: academic_terms.startDate,
        endDate: academic_terms.endDate,
        isCurrent: academic_terms.isCurrent,
      })
      .from(academic_terms);

    const uniRows = await db.select({ id: universities.id, code: universities.code, title: universities.title }).from(universities);
    const uniName = new Map(uniRows.map((u) => [u.id, `${u.title} (${u.code})`]));
    const label = (id: number) => uniName.get(id) ?? `دانشگاه ${id}`;

    const byUniversity = new Map<number, typeof rows>();
    for (const r of rows) {
      if (r.universityId == null) continue;
      const list = byUniversity.get(r.universityId) ?? [];
      list.push(r);
      byUniversity.set(r.universityId, list);
    }

    const activated: SyncEntry[] = [];
    const unchanged: SyncEntry[] = [];
    const noContaining: string[] = [];
    const picks: { universityId: number; termId: number }[] = [];

    const allUniversityIds = new Set<number>([...uniRows.map((u) => u.id), ...byUniversity.keys()]);
    for (const universityId of allUniversityIds) {
      const list = byUniversity.get(universityId) ?? [];
      const containing = list
        .filter((t) => termContainsToday(t, today))
        .sort(
          (a, b) =>
            new Date(b.startDate as Date).getTime() - new Date(a.startDate as Date).getTime() || b.id - a.id,
        );
      const winner = containing[0];
      if (!winner) {
        noContaining.push(`${label(universityId)} — ${list.length ? 'هیچ نیمسالی بازهٔ تاریخ امروز را پوشش نمی‌دهد' : 'هیچ نیمسالی ثبت نشده است'}`);
        continue;
      }
      const staleOthers = list.filter((t) => t.isCurrent === 1 && t.id !== winner.id);
      if (winner.isCurrent === 1 && staleOthers.length === 0) {
        unchanged.push({ university: label(universityId), termCode: winner.termCode, termId: winner.id });
        continue;
      }
      picks.push({ universityId, termId: winner.id });
      activated.push({ university: label(universityId), termCode: winner.termCode, termId: winner.id });
    }

    let cleared = 0;
    if (picks.length) {
      cleared = (await applyActivation(picks)).cleared;
    }
    revalidateTermPaths();

    const parts: string[] = [];
    if (activated.length) parts.push(`${activated.length} دانشگاه: نیمسال شامل تاریخ امروز فعال شد`);
    if (unchanged.length) parts.push(`${unchanged.length} دانشگاه: از قبل مطابق تاریخ بود`);
    if (cleared) parts.push(`${cleared} پرچم فعالِ کهنه صفر شد`);
    if (noContaining.length) parts.push(`${noContaining.length} دانشگاه بدون نیمسالِ شامل امروز — دست نخورده ماند`);
    const message = parts.length ? parts.join(' — ') : 'همهٔ نیمسال‌ها با تاریخ امروز هم‌خوان بود';

    return { ok: true, message, activated, unchanged, noContaining, cleared };
  } catch (err: any) {
    console.error('syncTermsWithDateAction:', err);
    return { ok: false, error: err?.message || 'خطا در همگام‌سازی با تاریخ' };
  }
}

