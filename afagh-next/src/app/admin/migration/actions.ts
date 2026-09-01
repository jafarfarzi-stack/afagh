'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { legacy_code_maps, legacy_grades, legacy_sources, legacy_tuition_formulas } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { autoSuggestDomain, targetOptions, type MapDomain } from '@/lib/migration/codemap';
import { applyFormulasToRules, runTuitionCompare, type CompareSummary } from '@/lib/migration/tuition';
import { applyGrades, compareGrades, type ApplyResult, type GradeCompare } from '@/lib/migration/grades';

// ═══ کنش‌های سرور میز کار مهاجرت (همه پشت نقش ADMIN) ═══

async function guard() {
  return requireRole(['ADMIN']);
}

const clean = (s: string | undefined | null, fallback = 'LEGACY') =>
  (String(s ?? '').trim() || fallback).toUpperCase();

/** ثبت/به‌روزرسانی سرور مبدأ */
export async function saveSourceAction(input: { code: string; title: string; kind?: string; note?: string }): Promise<{ ok: boolean; error?: string }> {
  await guard();
  const code = clean(input.code);
  if (!/^[A-Z0-9_-]{2,50}$/.test(code)) return { ok: false, error: 'کد مبدأ فقط حروف لاتین/عدد/خط تیره (۲ تا ۵۰ نویسه).' };
  const values = { code, title: input.title?.trim() || code, kind: input.kind || 'OTHER', note: input.note || null };
  await db.insert(legacy_sources).values(values).onConflictDoUpdate({ target: legacy_sources.code, set: values });
  revalidatePath('/admin/migration');
  return { ok: true };
}

/** تأیید/تغییر یک نگاشت به‌صورت دستی */
export async function saveMapAction(input: {
  id: number; targetCode: string | null; status?: string; note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await guard();
  const [row] = await db.select().from(legacy_code_maps).where(eq(legacy_code_maps.id, input.id)).limit(1);
  if (!row) return { ok: false, error: 'ردیف یافت نشد.' };

  if (input.status === 'IGNORED') {
    await db.update(legacy_code_maps).set({ status: 'IGNORED', updatedByUserId: user.id, updatedAt: new Date() }).where(eq(legacy_code_maps.id, input.id));
    revalidatePath('/admin/migration');
    return { ok: true };
  }

  if (!input.targetCode) {
    await db.update(legacy_code_maps).set({
      targetId: null, targetCode: null, targetTitle: null, confidence: '0',
      status: 'UNMAPPED', updatedByUserId: user.id, updatedAt: new Date(),
    }).where(eq(legacy_code_maps.id, input.id));
    revalidatePath('/admin/migration');
    return { ok: true };
  }

  const options = await targetOptions(row.domain as MapDomain);
  const hit = options.find(o => o.code === input.targetCode);
  if (!hit) return { ok: false, error: 'گزینهٔ مقصد نامعتبر است.' };

  await db.update(legacy_code_maps).set({
    targetId: hit.id, targetCode: hit.code, targetTitle: hit.title,
    confidence: '100', status: 'CONFIRMED', note: input.note ?? row.note,
    updatedByUserId: user.id, updatedAt: new Date(),
  }).where(eq(legacy_code_maps.id, input.id));
  revalidatePath('/admin/migration');
  return { ok: true };
}

/** پیشنهاد خودکار برای همهٔ کدهای بی‌نگاشت یک دامنه */
export async function autoSuggestAction(sourceCode: string, domain: MapDomain): Promise<{ ok: boolean; suggested: number; confirmed: number; untouched: number }> {
  await guard();
  const r = await autoSuggestDomain(clean(sourceCode), domain);
  revalidatePath('/admin/migration');
  return { ok: true, ...r };
}

/** تأیید یکجای همهٔ پیشنهادها (پس از بازبینی کاربر) */
export async function confirmSuggestionsAction(sourceCode: string, domain: MapDomain, minScore = 0): Promise<{ ok: boolean; confirmed: number }> {
  const user = await guard();
  const rows = await db.select().from(legacy_code_maps).where(and(
    eq(legacy_code_maps.sourceCode, clean(sourceCode)),
    eq(legacy_code_maps.domain, domain),
    eq(legacy_code_maps.status, 'SUGGESTED'),
  ));
  const ids = rows.filter(r => Number(r.confidence ?? 0) >= minScore).map(r => r.id);
  if (ids.length) {
    await db.update(legacy_code_maps).set({ status: 'CONFIRMED', updatedByUserId: user.id, updatedAt: new Date() })
      .where(inArray(legacy_code_maps.id, ids));
  }
  revalidatePath('/admin/migration');
  return { ok: true, confirmed: ids.length };
}

/** افزودن دستی یک کد قدیمی به میز تطبیق */
export async function addCodeAction(input: { sourceCode: string; domain: MapDomain; legacyCode: string; legacyTitle?: string }): Promise<{ ok: boolean; error?: string }> {
  await guard();
  const legacyCode = input.legacyCode?.trim();
  if (!legacyCode) return { ok: false, error: 'کد قدیمی الزامی است.' };
  await db.insert(legacy_code_maps).values({
    sourceCode: clean(input.sourceCode), domain: input.domain, legacyCode,
    legacyTitle: input.legacyTitle?.trim() || null, status: 'UNMAPPED',
  }).onConflictDoNothing();
  revalidatePath('/admin/migration');
  return { ok: true };
}

/** اجرای مقایسهٔ شهریه */
export async function compareTuitionAction(input: { sourceCode: string; termCode?: string; tolerance?: number }): Promise<{ ok: boolean; error?: string; summary?: CompareSummary }> {
  const user = await guard();
  try {
    const summary = await runTuitionCompare(user.id, {
      sourceCode: clean(input.sourceCode),
      termCode: input.termCode?.trim() || undefined,
      tolerance: Number(input.tolerance ?? 0),
    });
    revalidatePath('/admin/migration');
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** اعمال فرمول‌های قدیمی روی قواعد مالی ترم سامانهٔ جدید */
export async function applyFormulasAction(sourceCode: string, formulaIds?: number[]): Promise<{ ok: boolean; applied: number; skipped: { formulaCode: string; reason: string }[] }> {
  await guard();
  const r = await applyFormulasToRules(clean(sourceCode), formulaIds);
  revalidatePath('/admin/migration');
  return { ok: true, ...r };
}

/** حذف یک فرمول قدیمی */
export async function deleteFormulaAction(id: number): Promise<{ ok: boolean }> {
  await guard();
  await db.delete(legacy_tuition_formulas).where(eq(legacy_tuition_formulas.id, id));
  revalidatePath('/admin/migration');
  return { ok: true };
}

/** مقایسهٔ نمرات قدیمی با سامانه */
export async function compareGradesAction(sourceCode: string, termCode?: string): Promise<{ ok: boolean; error?: string; result?: GradeCompare }> {
  await guard();
  try {
    const result = await compareGrades(clean(sourceCode), termCode?.trim() || undefined);
    revalidatePath('/admin/migration');
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** اعمال نمرات قدیمی روی سامانه */
export async function applyGradesAction(input: { sourceCode: string; termCode?: string; statuses?: string[]; overwrite?: boolean }): Promise<{ ok: boolean; error?: string; result?: ApplyResult }> {
  await guard();
  try {
    const result = await applyGrades(clean(input.sourceCode), {
      termCode: input.termCode?.trim() || undefined,
      statuses: input.statuses,
      overwrite: !!input.overwrite,
    });
    revalidatePath('/admin/migration');
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** پاک‌سازی staging نمرات یک مبدأ (دادهٔ عملیاتی دست نمی‌خورد) */
export async function clearGradeStagingAction(sourceCode: string): Promise<{ ok: boolean; deleted: number }> {
  await guard();
  const rows = await db.delete(legacy_grades).where(eq(legacy_grades.sourceCode, clean(sourceCode))).returning({ id: legacy_grades.id });
  revalidatePath('/admin/migration');
  return { ok: true, deleted: rows.length };
}
