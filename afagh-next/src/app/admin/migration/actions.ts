'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { legacy_code_maps, legacy_grades, legacy_sources, legacy_tuition_formulas } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { autoSuggestDomain, targetOptions, type MapDomain } from '@/lib/migration/codemap';
import { norm } from '@/lib/migration/normalize';
import {
  acceptLegacyBalance, applyFormulasToRules, resolutionStats, runTuitionCompare,
  type CompareSummary, type OpeningBalanceResult,
} from '@/lib/migration/tuition';
import { applyGrades, compareGrades, type ApplyResult, type GradeCompare } from '@/lib/migration/grades';
import {
  batchRows, deleteBatch, listBatches, reprocessBatch,
  type BatchSummary,
} from '@/lib/migration/batches';
import { auditGroups, auditSummary, rollbackBatch, type RollbackResult } from '@/lib/migration/audit';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'migration.actions' });

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

/**
 * ثبت «کد جدید» به‌صورت آزاد برای یک کد قدیمی.
 *
 * تفاوتش با saveMapAction: آنجا باید رکورد مقصد از قبل در سامانه وجود داشته
 * باشد. اینجا دانشگاه می‌خواهد کدِ خودِ رکورد عوض شود (مثلاً درس «۱۲۳۴» از
 * این پس «CE-101» باشد) — رکوردی که چه‌بسا همین انتقال آن را می‌سازد.
 * این کد در لحظهٔ ثبت نهایی جایگزین کد قدیمی می‌شود.
 */
export async function setNewCodeAction(input: {
  id: number; newCode: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await guard();
  const [row] = await db.select().from(legacy_code_maps).where(eq(legacy_code_maps.id, input.id)).limit(1);
  if (!row) return { ok: false, error: 'ردیف یافت نشد.' };

  const code = norm(input.newCode).replace(/\s+/g, '');
  if (!code) {
    // خالی‌کردن کد جدید = لغو جایگزینی (نگاشت به رکورد موجود دست نمی‌خورد)
    await db.update(legacy_code_maps).set({
      targetCode: null, targetTitle: null, targetId: null, confidence: '0',
      status: 'UNMAPPED', updatedByUserId: user.id, updatedAt: new Date(),
    }).where(eq(legacy_code_maps.id, input.id));
    revalidatePath('/admin/migration');
    return { ok: true };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_\-./]{0,49}$/.test(code)) {
    return { ok: false, error: 'کد جدید فقط حروف لاتین، رقم و نویسه‌های _ - . / (حداکثر ۵۰ نویسه) و شروع با حرف یا رقم.' };
  }
  if (norm(code) === norm(row.legacyCode)) {
    return { ok: false, error: 'کد جدید با کد قدیمی یکسان است — جایگزینی بی‌اثر خواهد بود.' };
  }

  // دو کد قدیمیِ متفاوت نباید به یک کد جدید برسند؛ وگرنه دو رکورد در هم ادغام می‌شوند.
  const sameTarget = await db.select({ id: legacy_code_maps.id, legacyCode: legacy_code_maps.legacyCode })
    .from(legacy_code_maps).where(and(
      eq(legacy_code_maps.sourceCode, row.sourceCode),
      eq(legacy_code_maps.domain, row.domain),
      eq(legacy_code_maps.targetCode, code),
      eq(legacy_code_maps.status, 'CONFIRMED'),
    ));
  const clash = sameTarget.find(x => x.id !== input.id);
  if (clash) {
    return { ok: false, error: `کد جدید «${code}» قبلاً برای کد قدیمی «${clash.legacyCode}» ثبت شده — دو کد قدیمی نمی‌توانند به یک کد جدید تبدیل شوند.` };
  }

  await db.update(legacy_code_maps).set({
    targetCode: code, targetTitle: row.legacyTitle ?? null, targetId: null,
    confidence: '100', status: 'CONFIRMED',
    updatedByUserId: user.id, updatedAt: new Date(),
  }).where(eq(legacy_code_maps.id, input.id));
  log.info('code rewrite set', { id: input.id, domain: row.domain, from: row.legacyCode, to: code });
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
  const user = await guard();
  const r = await applyFormulasToRules(clean(sourceCode), formulaIds, { userId: user.id });
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
  const user = await guard();
  try {
    const result = await applyGrades(clean(input.sourceCode), {
      termCode: input.termCode?.trim() || undefined,
      statuses: input.statuses,
      overwrite: !!input.overwrite,
      userId: user.id,
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


// ═══ ناحیهٔ موقت، پردازش دوباره و واگرد ═══

/** فهرست دسته‌های واردشده برای یک مبدأ */
export async function listBatchesAction(sourceCode: string): Promise<{ ok: boolean; batches: BatchSummary[] }> {
  await guard();
  return { ok: true, batches: await listBatches(clean(sourceCode)) };
}

/** سطرهای یک دسته (پیش‌فرض فقط خطادارها) */
export async function batchRowsAction(batchId: number, status = 'ERROR') {
  await guard();
  return { ok: true, rows: await batchRows(batchId, status) };
}

/** پردازش دوبارهٔ سطرهای خطادار یک دسته پس از تکمیل نگاشت کدها */
export async function reprocessBatchAction(batchId: number, all = false): Promise<{ ok: boolean; error?: string; reprocessed?: number; inserted?: number; updated?: number; invalid?: number }> {
  const user = await guard();
  try {
    const r = await reprocessBatch(batchId, user.id, { all });
    revalidatePath('/admin/migration');
    return {
      ok: true, reprocessed: r.reprocessed,
      inserted: r.report?.inserted ?? 0, updated: r.report?.updated ?? 0, invalid: r.report?.invalid ?? 0,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** پیش‌نمایش واگرد: این دسته/عملیات چه چیزی روی جدول‌های عملیاتی نوشته است؟ */
export async function auditSummaryAction(input: { batchId?: number; opGroup?: string; sourceCode?: string }) {
  await guard();
  return { ok: true, rows: await auditSummary(input) };
}

/** فهرست عملیات‌های واگردپذیر یک مبدأ (اعمال نمره، اعمال فرمول، مانده اولیه) */
export async function auditGroupsAction(sourceCode: string) {
  await guard();
  return { ok: true, groups: await auditGroups(clean(sourceCode)) };
}

/**
 * واگرد یک دسته یا یک گروه عملیاتی.
 * پیش‌فرض محافظه‌کار است: سطری که بعد از مهاجرت دستی تغییر کرده دست نمی‌خورد
 * مگر force=true. نتیجهٔ کامل (حذف/بازگردانده/مسدود) برگردانده می‌شود.
 */
export async function rollbackAction(input: {
  batchId?: number; opGroup?: string; sourceCode?: string; force?: boolean;
}): Promise<{ ok: boolean; error?: string; result?: RollbackResult }> {
  const user = await guard();
  try {
    const result = await rollbackBatch({
      batchId: input.batchId, opGroup: input.opGroup,
      sourceCode: input.sourceCode ? clean(input.sourceCode) : undefined,
      force: !!input.force, userId: user.id,
    });
    log.warn('rollback_requested', { userId: user.id, ...input, total: result.total, deleted: result.deleted, restored: result.restored });
    revalidatePath('/admin/migration');
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** حذف یک دسته از ناحیهٔ موقت (دادهٔ عملیاتی دست نمی‌خورد) */
export async function deleteBatchAction(batchId: number): Promise<{ ok: boolean }> {
  await guard();
  await deleteBatch(batchId);
  revalidatePath('/admin/migration');
  return { ok: true };
}

/** پذیرش تراز سیستم قدیمی به‌عنوان «مانده اولیه» در دفتر مالی */
export async function acceptLegacyBalanceAction(input: {
  sourceCode: string; termCode?: string; runId?: number; onlyStatuses?: string[]; studentCodes?: string[];
}): Promise<{ ok: boolean; error?: string; result?: OpeningBalanceResult }> {
  const user = await guard();
  try {
    const result = await acceptLegacyBalance({
      sourceCode: clean(input.sourceCode),
      termCode: input.termCode?.trim() || undefined,
      runId: input.runId, onlyStatuses: input.onlyStatuses,
      studentCodes: input.studentCodes, userId: user.id,
    });
    revalidatePath('/admin/migration');
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** آمار رفع مغایرت یک اجرای مقایسه */
export async function resolutionStatsAction(runId: number) {
  await guard();
  return { ok: true, rows: await resolutionStats(runId) };
}
