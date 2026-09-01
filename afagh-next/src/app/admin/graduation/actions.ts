'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { clearance_departments } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import {
  advanceDossier, approveByHead, getDossier, holdDossier, issueDegree, listDossiers,
  markDelivered, pipelineStats, requestMinistryCode, runAutoClearance, runGraduationScan,
  runIrandoc, setClearance, startClearance, resumeDossier,
} from '@/lib/graduation-engine';
import { allRequests, resolveRequest } from '@/lib/alumni';

// ═══ کنش‌های میز کار فارغ‌التحصیلی (نقش ADMIN) ═══

async function guard() {
  return requireRole(['ADMIN']);
}

const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'خطای نامشخص' });

export async function scanAction(force?: boolean) {
  await guard();
  try {
    const res = await runGraduationScan({ force });
    revalidatePath('/admin/graduation');
    return { ok: true as const, ...res };
  } catch (e) { return fail(e); }
}

export async function scanStudentAction(studentIdsCsv: string) {
  await guard();
  try {
    const ids = studentIdsCsv.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0);
    const res = await runGraduationScan({ studentIds: ids, force: true });
    revalidatePath('/admin/graduation');
    return { ok: true as const, ...res };
  } catch (e) { return fail(e); }
}

export async function refreshListAction(filter: { status?: string; q?: string }) {
  await guard();
  return { ok: true as const, rows: await listDossiers(filter), stats: await pipelineStats() };
}

export async function dossierAction(auditId: number) {
  await guard();
  const d = await getDossier(auditId);
  return d ? { ok: true as const, dossier: d } : { ok: false as const, error: 'پرونده یافت نشد.' };
}

export async function headApproveAction(auditId: number, note?: string) {
  const user = await guard();
  try {
    await approveByHead(auditId, user.id, note);
    revalidatePath('/admin/graduation');
    return { ok: true as const, dossier: await getDossier(auditId) };
  } catch (e) { return fail(e); }
}

export async function holdAction(auditId: number, reason: string) {
  await guard();
  try {
    if (!reason.trim()) return { ok: false as const, error: 'دلیل توقف را بنویسید.' };
    await holdDossier(auditId, reason.trim());
    revalidatePath('/admin/graduation');
    return { ok: true as const, dossier: await getDossier(auditId) };
  } catch (e) { return fail(e); }
}

export async function resumeAction(auditId: number) {
  await guard();
  try {
    await resumeDossier(auditId);
    revalidatePath('/admin/graduation');
    return { ok: true as const, dossier: await getDossier(auditId) };
  } catch (e) { return fail(e); }
}

export async function irandocAction(auditId: number, trackingCode: string, thesisTitle: string) {
  await guard();
  try {
    const r = await runIrandoc(auditId, { trackingCode, thesisTitle });
    revalidatePath('/admin/graduation');
    return { ok: true as const, result: r, dossier: await getDossier(auditId) };
  } catch (e) { return fail(e); }
}

export async function startClearanceAction(auditId: number) {
  await guard();
  try {
    await startClearance(auditId);
    return { ok: true as const, dossier: await getDossier(auditId) };
  } catch (e) { return fail(e); }
}

export async function autoClearanceAction(auditId: number) {
  await guard();
  try {
    const r = await runAutoClearance(auditId);
    return { ok: true as const, autoCleared: r.autoCleared, withDebt: r.withDebt, dossier: await getDossier(auditId) };
  } catch (e) { return fail(e); }
}

export async function setClearanceAction(input: {
  checklistId: number; auditId: number; status: 'CLEARED' | 'HAS_DEBT' | 'WAIVED' | 'PENDING';
  detail?: string; amountDue?: number;
}) {
  const user = await guard();
  try {
    await setClearance({ ...input, userId: user.id });
    revalidatePath('/admin/graduation');
    return { ok: true as const, dossier: await getDossier(input.auditId) };
  } catch (e) { return fail(e); }
}

export async function advanceAction(auditId: number) {
  await guard();
  try {
    const r = await advanceDossier(auditId);
    return { ok: true as const, status: r.status, changed: r.changed, dossier: await getDossier(auditId) };
  } catch (e) { return fail(e); }
}

export async function ministryCodeAction(auditId: number) {
  await guard();
  try {
    const r = await requestMinistryCode(auditId);
    return { ok: true as const, code: r.code, online: r.online, dossier: await getDossier(auditId) };
  } catch (e) { return fail(e); }
}

export async function issueAction(input: {
  auditId: number; degreeType: 'TEMPORARY' | 'PERMANENT' | 'TRANSCRIPT'; ministryVerificationCode?: string;
}) {
  const user = await guard();
  try {
    const deg = await issueDegree({ ...input, userId: user.id });
    revalidatePath('/admin/graduation');
    return { ok: true as const, serialNo: deg.serialNo, verifyCode: deg.verifyCode, dossier: await getDossier(input.auditId) };
  } catch (e) { return fail(e); }
}

export async function deliverAction(degreeId: number, auditId: number, deliveredTo: string) {
  await guard();
  try {
    await markDelivered(degreeId, deliveredTo || 'شخص دانش‌آموخته');
    return { ok: true as const, dossier: await getDossier(auditId) };
  } catch (e) { return fail(e); }
}

// ── پیکربندی دپارتمان‌های تسویه (بدون هیچ مقدار سخت‌کدشده در UI) ──

export async function saveDepartmentAction(input: {
  id?: number; code: string; title: string; autoCheck: string; apiUrl?: string;
  responsibleRoleCode?: string; sortOrder?: number; isActive?: boolean; hint?: string;
}) {
  await guard();
  try {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,40}$/.test(code)) return { ok: false as const, error: 'کد فقط حروف لاتین بزرگ/عدد/زیرخط.' };
    const values = {
      code, title: input.title.trim() || code, autoCheck: input.autoCheck || 'NONE',
      apiUrl: input.apiUrl?.trim() || null, responsibleRoleCode: input.responsibleRoleCode?.trim() || null,
      sortOrder: Number(input.sortOrder ?? 100), isActive: input.isActive === false ? 0 : 1,
      hint: input.hint?.trim() || null,
    };
    if (input.id) await db.update(clearance_departments).set(values).where(eq(clearance_departments.id, input.id));
    else await db.insert(clearance_departments).values(values).onConflictDoUpdate({ target: clearance_departments.code, set: values });
    revalidatePath('/admin/graduation');
    return { ok: true as const, departments: await db.select().from(clearance_departments) };
  } catch (e) { return fail(e); }
}

export async function deleteDepartmentAction(id: number) {
  await guard();
  try {
    await db.update(clearance_departments).set({ isActive: 0 }).where(eq(clearance_departments.id, id));
    revalidatePath('/admin/graduation');
    return { ok: true as const };
  } catch (e) { return fail(e); }
}

// ── کارتابل خدمات دانش‌آموختگان ──

export async function alumniRequestsAction(status?: string) {
  await guard();
  return { ok: true as const, rows: await allRequests(status) };
}

export async function resolveAlumniRequestAction(input: {
  requestId: number; status: 'IN_REVIEW' | 'DONE' | 'REJECTED'; note?: string; resultFileUrl?: string;
}) {
  const user = await guard();
  try {
    await resolveRequest({ ...input, userId: user.id });
    revalidatePath('/admin/graduation');
    return { ok: true as const, rows: await allRequests() };
  } catch (e) { return fail(e); }
}
