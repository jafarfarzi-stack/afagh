'use server';

import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  classrooms,
  defense_jury_pools,
  defense_sessions,
  departments,
  graduation_audits,
  majors,
  staff,
  students,
  thesis_progress,
  users,
} from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import {
  approveProposalAndUploadIrandoc,
  expertScheduleDefense,
  recordDefenseResult,
  supervisorApproveDefense,
} from '@/lib/graduation-engine';
import { getCurrentUniversity } from '@/lib/university-scope';

// ═══ میز کار «برنامه‌ریزی و ثبت نتیجهٔ دفاع پایان‌نامه» ═══
// کارشناسی (تأیید پروپوزال، تعیین وقت، ثبت نتیجه، استخر داوران):
//   کارشناس فارغ‌التحصیلی / کارشناس آموزش / مدیر سامانه.
// استاد راهنما (PROFESSOR) و مدیر گروه (DEP_HEAD) فقط تأیید/رد درخواست دفاعِ
// پرونده‌های خودشان را انجام می‌دهند و در میز کار فقط همان پرونده‌ها را می‌بینند؛
// ابزارهای کارشناسی (استخر داوران و …) به آن‌ها داده نمی‌شود.

const PATH = '/admin/defense-scheduling';
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'خطای نامشخص' });

/** پروندهٔ فارغ‌التحصیلی باید متعلق به دانشگاه فعال باشد */
async function assertAuditInUni(auditId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return { ok: false, error: 'دانشگاه فعال نامشخص است.' };
  const [a] = await db
    .select({ auditUni: graduation_audits.universityId, stuUni: students.universityId })
    .from(graduation_audits)
    .leftJoin(students, eq(students.id, graduation_audits.studentId))
    .where(eq(graduation_audits.id, auditId))
    .limit(1);
  if (!a) return { ok: false, error: 'پرونده یافت نشد.' };
  const owner = a.auditUni ?? a.stuUni;
  if (owner !== null && owner !== uni.id) return { ok: false, error: 'پرونده متعلق به دانشگاه دیگری است.' };
  return { ok: true };
}

/**
 * نقش‌های کارشناسی: تأیید پروپوزال + ایرانداک، تعیین وقت دفاع، ثبت نتیجه و
 * مدیریت استخر هیأت داوران. استاد راهنما عمداً اینجا نیست.
 */
const EXPERT_ROLES = ['ADMIN', 'EDU_EXPERT', 'GRADUATION_EXPERT'];
/**
 * خواندن میز دفاع: کارشناسان کل میز را می‌بینند؛ مدیر گروه و استاد راهنما فقط
 * پروندهٔ راهنماییِ خودشان را. این فهرست باید با گاردِ `page.tsx` و با
 * `roles` ماژول در `@/lib/admin-modules` یکی باشد.
 */
const BOARD_ROLES = [...EXPERT_ROLES, 'DEP_HEAD', 'PROFESSOR'];

async function guard() {
  return requireRole(EXPERT_ROLES);
}

export type BoardRow = {
  auditId: number;
  thesisProgressId: number;
  workflowStatus: string;
  proposalStatus: string | null;
  proposalSimilarity: number | null;
  irandocUploadStatus: string | null;
  irandocUploadTracking: string | null;
  defenseRequestStatus: string | null;
  defenseScheduledAt: string | null;
  defenseConductedAt: string | null;
  defenseResult: string | null;
  defenseNote: string | null;
  finalIrandocStatus: string | null;
  nextProgressReportDue: string | null;
  titleFa: string | null;
  supervisorId: number | null;
  supervisorName: string | null;
  supervisorUserId: number | null;
  studentId: number;
  studentCode: string;
  fullName: string;
  majorName: string | null;
  majorId: number | null;
  roomName: string | null;
  sessionStatus: string | null;
  sessionResult: string | null;
  jury: { chair: string | null; supervisor: string | null; internal: string | null; external: string | null };
  pool: { id: number; departmentCode: string; roomName: string | null; chair: string | null; internal: string | null; external: string | null } | null;
};

export type PoolRow = {
  id: number;
  departmentCode: string;
  majorId: number | null;
  majorName: string | null;
  chairId: number | null;
  internalIds: number[];
  externalIds: number[];
  roomId: number | null;
  roomName: string | null;
  isActive: boolean;
};

export type Board = {
  groups: { status: string; rows: BoardRow[] }[];
  pools: PoolRow[];
  rooms: { id: number; name: string; capacity: number }[];
  staffOptions: { id: number; name: string; rank: string }[];
  majors: { id: number; name: string }[];
  departments: { code: string; name: string }[];
  currentUserId: number;
  /** فقط نقش‌های کارشناسی: ابزارهای مدیریتی میز (استخر داوران، تأیید پروپوزال، تعیین وقت، ثبت نتیجه) */
  canManage: boolean;
};

const GROUP_ORDER = [
  'SIMILARITY_PASSED', 'SIMILARITY_HIGH', 'EXPERT_REVIEW', 'REJECTED', 'PRIOR_REJECTED', 'APPROVED',
];

/** همان ترتیب انتخاب استخرِ داور در موتور: pool رشتهٔ دانشجو مقدم، وگرنه عمومی؛ و pool دارای اتاق مقدم است. */
function pickPool(rows: PoolRow[], majorId: number | null) {
  const active = rows.filter(p => p.isActive);
  const scoped = majorId != null ? active.filter(p => p.majorId === majorId) : [];
  const generic = active.filter(p => p.majorId == null);
  const best = (list: PoolRow[]) => list.find(p => p.roomId != null) ?? list[0];
  return best(scoped) ?? best(generic) ?? null;
}

/** تمام داده‌های نمایشی میز کار — منبع واحدِ صفحه و کنش‌ها */
async function loadBoard(): Promise<Board> {
  const user = await requireRole(BOARD_ROLES);
  const uni = await getCurrentUniversity().catch(() => null);
  const uid = uni?.id;
  const scopeOf = (c: any) => (uid ? or(eq(c, uid), isNull(c)) : undefined);

  const tpRows = await db
    .select({
      auditId: graduation_audits.id,
      thesisProgressId: thesis_progress.id,
      workflowStatus: graduation_audits.workflowStatus,
      proposalStatus: thesis_progress.proposalStatus,
      proposalSimilarity: thesis_progress.proposalSimilarity,
      irandocUploadStatus: thesis_progress.irandocUploadStatus,
      irandocUploadTracking: thesis_progress.irandocUploadTracking,
      defenseRequestStatus: thesis_progress.defenseRequestStatus,
      defenseScheduledAt: thesis_progress.defenseScheduledAt,
      defenseConductedAt: thesis_progress.defenseConductedAt,
      defenseResult: thesis_progress.defenseResult,
      defenseNote: thesis_progress.defenseNote,
      finalIrandocStatus: thesis_progress.finalIrandocStatus,
      nextProgressReportDue: thesis_progress.nextProgressReportDue,
      titleFa: thesis_progress.titleFa,
      supervisorId: thesis_progress.supervisorId,
      defenseRoomId: thesis_progress.defenseRoomId,
      updatedAt: thesis_progress.updatedAt,
      studentId: students.id,
      studentCode: students.studentCode,
      majorId: students.majorId,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(thesis_progress)
    .innerJoin(graduation_audits, eq(graduation_audits.id, thesis_progress.auditId))
    .innerJoin(students, eq(students.id, thesis_progress.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(
      sql`coalesce(${thesis_progress.proposalStatus}, 'NOT_STARTED') <> 'NOT_STARTED'
              or coalesce(${thesis_progress.defenseRequestStatus}, 'NOT_REQUESTED') <> 'NOT_REQUESTED'`,
      scopeOf(students.universityId),
    ))
    .orderBy(desc(thesis_progress.updatedAt));

  const staffRows = await db
    .select({ id: staff.id, userId: staff.userId, firstName: users.firstName, lastName: users.lastName, rank: staff.academicRank, type: staff.staffType })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .where(scopeOf(staff.universityId))
    .orderBy(users.lastName);
  const nameOf = (id: number | null | undefined) => {
    if (id == null) return null;
    const s = staffRows.find(x => x.id === id);
    return s ? `${s.firstName} ${s.lastName}` : null;
  };
  const staffMap = new Map(staffRows.map(s => [s.id, s]));

  const roomRows = await db.select({ id: classrooms.id, name: classrooms.name, capacity: classrooms.capacity })
    .from(classrooms).where(scopeOf(classrooms.universityId)).orderBy(asc(classrooms.name));
  const roomOf = (id: number | null | undefined) => (id == null ? null : roomRows.find(r => r.id === id)?.name ?? null);

  const majorRows = await db.select({ id: majors.id, name: majors.name }).from(majors)
    .where(scopeOf(majors.universityId)).orderBy(asc(majors.name));
  const majorNameOf = (id: number | null) => (id == null ? null : majorRows.find(m => m.id === id)?.name ?? null);

  const poolRows = await db.select().from(defense_jury_pools)
    .where(scopeOf(defense_jury_pools.universityId)).orderBy(asc(defense_jury_pools.id));
  const pools: PoolRow[] = poolRows.map(p => ({
    id: p.id,
    departmentCode: p.departmentCode,
    majorId: p.majorId,
    majorName: majorNameOf(p.majorId),
    chairId: p.chairId,
    internalIds: p.internalIds ?? [],
    externalIds: p.externalIds ?? [],
    roomId: p.roomId,
    roomName: roomOf(p.roomId),
    isActive: p.isActive === 1,
  }));

  const deptRows = await db.select({ code: departments.departmentCode, name: departments.name })
    .from(departments).where(scopeOf(departments.universityId)).orderBy(asc(departments.name));

  const tpIds = tpRows.map(r => r.thesisProgressId);
  const sessions = tpIds.length
    ? await db.select().from(defense_sessions).where(inArray(defense_sessions.thesisProgressId, tpIds))
    : [];

  const rows: BoardRow[] = tpRows.map(r => {
    const s = sessions.find(x => x.thesisProgressId === r.thesisProgressId);
    const pool = pickPool(pools, r.majorId);
    return {
      auditId: r.auditId,
      thesisProgressId: r.thesisProgressId,
      workflowStatus: r.workflowStatus,
      proposalStatus: r.proposalStatus,
      proposalSimilarity: r.proposalSimilarity == null ? null : Number(r.proposalSimilarity),
      irandocUploadStatus: r.irandocUploadStatus,
      irandocUploadTracking: r.irandocUploadTracking,
      defenseRequestStatus: r.defenseRequestStatus,
      defenseScheduledAt: r.defenseScheduledAt ? r.defenseScheduledAt.toISOString() : null,
      defenseConductedAt: r.defenseConductedAt ? r.defenseConductedAt.toISOString() : null,
      defenseResult: r.defenseResult,
      defenseNote: r.defenseNote,
      finalIrandocStatus: r.finalIrandocStatus,
      nextProgressReportDue: r.nextProgressReportDue ? r.nextProgressReportDue.toISOString() : null,
      titleFa: r.titleFa,
      supervisorId: r.supervisorId,
      supervisorName: nameOf(r.supervisorId),
      supervisorUserId: r.supervisorId == null ? null : staffMap.get(r.supervisorId)?.userId ?? null,
      studentId: r.studentId,
      studentCode: r.studentCode,
      fullName: `${r.firstName} ${r.lastName}`.trim(),
      majorName: majorNameOf(r.majorId),
      majorId: r.majorId,
      roomName: roomOf(r.defenseRoomId) ?? roomOf(s?.roomId ?? null),
      sessionStatus: s?.status ?? null,
      sessionResult: s?.result ?? null,
      jury: {
        chair: nameOf(s?.chairId ?? null),
        supervisor: nameOf(s?.supervisorId ?? null),
        internal: nameOf(s?.internalId ?? null),
        external: nameOf(s?.externalId ?? null),
      },
      pool: pool && {
        id: pool.id,
        departmentCode: pool.departmentCode,
        roomName: pool.roomName,
        chair: nameOf(pool.chairId),
        internal: nameOf(pool.internalIds[0] ?? null),
        external: nameOf(pool.externalIds[0] ?? null),
      },
    };
  });

  // مدیر گروه (DEP_HEAD) هم مثل استاد راهنما فقط پروندهٔ دانشجویانِ خودش را می‌بیند:
  // برای او «دیدن کل میز» و «مدیریت میز» یکی است — هیچ‌کدام نیست. به همین دلیل ابزارهای
  // کارشناسی هم به او داده نمی‌شود و کارت‌های مدیریتی در رابط کاربری پنهان می‌مانند.
  const canManage = user.roles.some(r => EXPERT_ROLES.includes(r));
  const visible = canManage ? rows : rows.filter(r => r.supervisorUserId === user.id);

  const orderOf = (s: string | null) => {
    const i = GROUP_ORDER.indexOf(s ?? '');
    return i === -1 ? GROUP_ORDER.length : i;
  };
  const byStatus = new Map<string, BoardRow[]>();
  for (const r of visible) {
    const key = r.proposalStatus ?? 'NOT_STARTED';
    byStatus.set(key, [...(byStatus.get(key) ?? []), r]);
  }
  const groups = [...byStatus.entries()]
    .map(([status, list]) => ({ status, rows: list }))
    .sort((a, b) => orderOf(a.status) - orderOf(b.status) || a.status.localeCompare(b.status));

  // ابزارهای کارشناسی (استخرها، فهرست کامل کارکنان، اتاق‌ها، رشته‌ها و گروه‌ها) به
  // استاد راهنما و مدیر گروه داده نمی‌شود؛ پیش‌نمایش هیأت داورِ پروندهٔ خودش داخل سطرِ ردیف می‌ماند.
  return {
    groups,
    pools: canManage ? pools : [],
    rooms: canManage ? roomRows.map(r => ({ id: r.id, name: r.name, capacity: r.capacity })) : [],
    staffOptions: canManage ? staffRows.map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, rank: s.rank ?? s.type ?? '' })) : [],
    majors: canManage ? majorRows.map(m => ({ id: m.id, name: m.name })) : [],
    departments: canManage ? deptRows.filter(d => d.code).map(d => ({ code: d.code as string, name: d.name })) : [],
    currentUserId: user.id,
    canManage,
  };
}

export async function boardAction() {
  try {
    return { ok: true as const, board: await loadBoard() };
  } catch (e) { return fail(e); }
}

/** تأیید پروپوزال توسط کارشناس + ثبت کد رهگیری بارگذاری در ایرانداک */
export async function approveProposalAction(input: { auditId: number; irandocTrackingCode: string }) {
  const user = await guard();
  try {
    const scope = await assertAuditInUni(Number(input.auditId));
    if (!scope.ok) return { ok: false as const, error: scope.error };
    const code = (input.irandocTrackingCode ?? '').trim();
    if (code.length < 4) return { ok: false as const, error: 'کد رهگیری ایرانداک را کامل وارد کنید.' };
    await approveProposalAndUploadIrandoc({ auditId: Number(input.auditId), approvedBy: user.id, irandocTrackingCode: code });
    revalidatePath(PATH);
    revalidatePath('/admin/graduation');
    return { ok: true as const, board: await loadBoard() };
  } catch (e) { return fail(e); }
}

/** تعیین وقت دفاع — اتاق و هیأت داوران خودکار از استخرِ داوران رشته انتخاب می‌شود */
export async function scheduleDefenseAction(input: { auditId: number; scheduledAt: string }) {
  const user = await guard();
  try {
    const scope = await assertAuditInUni(Number(input.auditId));
    if (!scope.ok) return { ok: false as const, error: scope.error };
    const at = new Date(input.scheduledAt);
    if (Number.isNaN(at.getTime())) return { ok: false as const, error: 'تاریخ و ساعت دفاع را کامل انتخاب کنید.' };
    if (at.getTime() < Date.now() - 60_000) return { ok: false as const, error: 'زمان دفاع نمی‌تواند در گذشته باشد.' };
    await expertScheduleDefense({ auditId: Number(input.auditId), expertId: user.id, scheduledAt: at });
    revalidatePath(PATH);
    return { ok: true as const, board: await loadBoard() };
  } catch (e) { return fail(e); }
}

/** ثبت نتیجهٔ دفاع (قبول / مردود / قبول مشروط) و صورت‌جلسه */
export async function recordDefenseResultAction(input: {
  auditId: number;
  result: 'PASSED' | 'FAILED' | 'CONDITIONAL';
  minutes?: string;
  conductedAt: string;
}) {
  await guard();
  try {
    const scope = await assertAuditInUni(Number(input.auditId));
    if (!scope.ok) return { ok: false as const, error: scope.error };
    const at = new Date(input.conductedAt);
    if (Number.isNaN(at.getTime())) return { ok: false as const, error: 'تاریخ برگزاری دفاع را کامل انتخاب کنید.' };
    if (!['PASSED', 'FAILED', 'CONDITIONAL'].includes(input.result)) return { ok: false as const, error: 'نتیجهٔ دفاع نامعتبر است.' };
    await recordDefenseResult({
      auditId: Number(input.auditId),
      result: input.result,
      minutes: input.minutes?.trim() || undefined,
      conductedAt: at,
    });
    revalidatePath(PATH);
    return { ok: true as const, board: await loadBoard() };
  } catch (e) { return fail(e); }
}

/**
 * تأیید/رد درخواست دفاع از سوی استاد راهنما.
 * هویت با پروندهٔ کارکنانیِ خودِ کاربر جاری تطبیق داده می‌شود؛ موتور هم
 * مالکیت راهنما را دوباره بررسی می‌کند. کارشناس فارغ‌التحصیلی عمداً این کنش را
 * ندارد (کارشناس، راهنمای پرونده نیست) و `loadBoard` برای او هم مثل استاد کار می‌کند.
 */
export async function supervisorApproveDefenseAction(input: { auditId: number; approved: boolean }) {
  const user = await requireRole(['PROFESSOR', 'DEP_HEAD', 'ADMIN']);
  try {
    const scope = await assertAuditInUni(Number(input.auditId));
    if (!scope.ok) return { ok: false as const, error: scope.error };
    const me = await getStaffByUser(user.id);
    if (!me) throw new Error('پروندهٔ کارکنانی برای این حساب یافت نشد؛ تأیید دفاع فقط از سوی استاد راهنما ممکن است.');
    await supervisorApproveDefense({ auditId: Number(input.auditId), supervisorId: me.id, approved: !!input.approved });
    revalidatePath(PATH);
    return { ok: true as const, board: await loadBoard() };
  } catch (e) { return fail(e); }
}

// ───────────────────── مدیریت استخر هیأت داوران ─────────────────────

function csvIds(v: string | undefined) {
  return (v ?? '').split(/[,\s،]+/).map(Number).filter(n => Number.isInteger(n) && n > 0);
}

export async function saveJuryPoolAction(input: {
  id?: number;
  departmentCode: string;
  majorId?: number | null;
  chairId?: number | null;
  internalIds?: string;
  externalIds?: string;
  roomId?: number | null;
  isActive?: boolean;
}) {
  await guard();
  try {
    const code = (input.departmentCode ?? '').trim().toUpperCase();
    if (!code || code.length > 40) return { ok: false as const, error: 'کد دپارتمان الزامی است (حداکثر ۴۰ نویسه).' };
    const values = {
      departmentCode: code,
      majorId: Number(input.majorId) > 0 ? Number(input.majorId) : null,
      chairId: Number(input.chairId) > 0 ? Number(input.chairId) : null,
      internalIds: csvIds(input.internalIds),
      externalIds: csvIds(input.externalIds),
      roomId: Number(input.roomId) > 0 ? Number(input.roomId) : null,
      isActive: input.isActive === false ? 0 : 1,
    };
    if (input.id) {
      const uni = await getCurrentUniversity().catch(() => null);
      if (!uni) return { ok: false as const, error: 'دانشگاه فعال نامشخص است.' };
      const [cur] = await db.select({ universityId: defense_jury_pools.universityId })
        .from(defense_jury_pools).where(eq(defense_jury_pools.id, Number(input.id))).limit(1);
      if (!cur) return { ok: false as const, error: 'استخر یافت نشد.' };
      if (cur.universityId !== null && cur.universityId !== uni.id) {
        return { ok: false as const, error: 'استخر متعلق به دانشگاه دیگری است.' };
      }
      await db.update(defense_jury_pools).set(values).where(and(
        eq(defense_jury_pools.id, Number(input.id)),
        or(eq(defense_jury_pools.universityId, uni.id), isNull(defense_jury_pools.universityId)),
      ));
    } else {
      const uni = await getCurrentUniversity();
      await db.insert(defense_jury_pools).values({ ...values, universityId: uni.id });
    }
    revalidatePath(PATH);
    return { ok: true as const, board: await loadBoard() };
  } catch (e) { return fail(e); }
}

export async function toggleJuryPoolAction(id: number, isActive: boolean) {
  await guard();
  try {
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return { ok: false as const, error: 'دانشگاه فعال نامشخص است.' };
    const [cur] = await db.select({ universityId: defense_jury_pools.universityId })
      .from(defense_jury_pools).where(eq(defense_jury_pools.id, Number(id))).limit(1);
    if (!cur) return { ok: false as const, error: 'استخر یافت نشد.' };
    if (cur.universityId !== null && cur.universityId !== uni.id) {
      return { ok: false as const, error: 'استخر متعلق به دانشگاه دیگری است.' };
    }
    await db.update(defense_jury_pools).set({ isActive: isActive ? 1 : 0 }).where(and(
      eq(defense_jury_pools.id, Number(id)),
      or(eq(defense_jury_pools.universityId, uni.id), isNull(defense_jury_pools.universityId)),
    ));
    revalidatePath(PATH);
    return { ok: true as const, board: await loadBoard() };
  } catch (e) { return fail(e); }
}