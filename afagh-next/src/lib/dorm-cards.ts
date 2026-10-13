import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { dorm_residences } from '@/db/schema-dorm';
import { degree_level_configs as coreLevels, majors as coreMajors, students, users as coreUsers } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { getCurrentUniversity } from '@/lib/university-scope';

const log = createLogger({ mod: 'dorm-cards' });
const EDU = ['ADMIN', 'EDU_EXPERT'];

export interface DormResidenceInput {
  studentId: number;
  dormName?: string | null;
  roomNo?: string | null;
  bedNo?: string | null;
  academicYear?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  status?: 'active' | 'ended' | 'revoked';
}

export interface DormResidenceRow extends DormResidenceInput {
  id: number;
  studentCode: string;
  fullName: string;
  majorName: string | null;
  degreeLevel: string | null;
  createdAt: string | null;
}

/** دانشجو باید متعلق به دانشگاه فعال باشد (همان گارد student-cards) */
async function assertStudentInUni(studentId: number): Promise<{ ok: true; universityId: number | null } | { ok: false; error: string }> {
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return { ok: false, error: 'دانشگاه فعال نامشخص است.' };
  const [s] = await db.select({ universityId: students.universityId })
    .from(students).where(eq(students.id, studentId)).limit(1);
  if (!s) return { ok: false, error: 'دانشجو یافت نشد.' };
  if (s.universityId !== null && s.universityId !== uni.id) {
    return { ok: false, error: 'دانشجو متعلق به دانشگاه دیگری است.' };
  }
  return { ok: true, universityId: s.universityId };
}

/** فهرست سکونت‌های خوابگاهی دانشگاه فعال — با اطلاعات هویتی دانشجو */
export async function listDormResidences(opts?: { studentId?: number; status?: string }): Promise<DormResidenceRow[]> {
  await requireRole(EDU);
  const uni = await getCurrentUniversity().catch(() => null);
  const conds = [uni ? eq(dorm_residences.universityId, uni.id) : sql`1 = 0`];
  if (opts?.studentId) conds.push(eq(dorm_residences.studentId, opts.studentId));
  if (opts?.status) conds.push(eq(dorm_residences.status, opts.status));

  const rows = await db
    .select({
      id: dorm_residences.id,
      studentId: dorm_residences.studentId,
      dormName: dorm_residences.dormName,
      roomNo: dorm_residences.roomNo,
      bedNo: dorm_residences.bedNo,
      academicYear: dorm_residences.academicYear,
      validFrom: dorm_residences.validFrom,
      validTo: dorm_residences.validTo,
      status: dorm_residences.status,
      createdAt: dorm_residences.createdAt,
      studentCode: students.studentCode,
      fullName: sql<string>`coalesce(${coreUsers.firstName} || ' ' || ${coreUsers.lastName}, '')`,
      majorName: coreMajors.name,
      degreeLevel: coreLevels.title,
    })
    .from(dorm_residences)
    .innerJoin(students, eq(students.id, dorm_residences.studentId))
    .leftJoin(coreUsers, eq(coreUsers.id, students.userId))
    .leftJoin(coreMajors, eq(coreMajors.id, students.majorId))
    .leftJoin(coreLevels, eq(coreLevels.id, students.degreeLevelId))
    .where(and(...conds))
    .orderBy(desc(dorm_residences.id))
    .limit(2000);

  return rows.map(r => ({
    id: r.id,
    studentId: r.studentId,
    studentCode: r.studentCode,
    fullName: r.fullName,
    majorName: r.majorName,
    degreeLevel: r.degreeLevel,
    dormName: r.dormName,
    roomNo: r.roomNo,
    bedNo: r.bedNo,
    academicYear: r.academicYear,
    validFrom: r.validFrom ? new Date(r.validFrom).toISOString() : null,
    validTo: r.validTo ? new Date(r.validTo).toISOString() : null,
    status: (r.status ?? 'active') as DormResidenceRow['status'],
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
  }));
}

/** ایجاد سکونت خوابگاهی + ممیزی — داخل یک تراکنش */
export async function createDormResidence(input: DormResidenceInput): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const me = await requireRole(EDU);
  const sid = Number(input.studentId);
  if (!Number.isInteger(sid) || sid <= 0) return { ok: false, error: 'شناسهٔ دانشجو نامعتبر است.' };
  const scope = await assertStudentInUni(sid);
  if (!scope.ok) return { ok: false, error: scope.error };

  const status = input.status ?? 'active';
  if (!['active', 'ended', 'revoked'].includes(status)) return { ok: false, error: 'وضعیت نامعتبر است.' };

  let id = 0;
  await db.transaction(async (tx) => {
    const [ins] = await tx.insert(dorm_residences).values({
      studentId: sid,
      dormName: input.dormName ?? null,
      roomNo: input.roomNo ?? null,
      bedNo: input.bedNo ?? null,
      academicYear: input.academicYear ?? null,
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validTo: input.validTo ? new Date(input.validTo) : null,
      status,
      universityId: scope.universityId,
    }).returning({ id: dorm_residences.id });
    id = ins?.id ?? 0;
    await appendAudit(tx, {
      actorUserId: me.id,
      action: 'DORM_RESIDENCE_CREATE',
      entityType: 'dorm_residence',
      entityId: id,
      details: JSON.stringify({ studentId: sid, dormName: input.dormName, roomNo: input.roomNo, bedNo: input.bedNo, academicYear: input.academicYear }),
    });
  });
  log.info('dorm_residence_created', { id, studentId: sid });
  return { ok: true, id };
}

/** به‌روزرسانی سکونت خوابگاهی */
export async function updateDormResidence(id: number, input: DormResidenceInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireRole(EDU);
  const rid = Number(id);
  if (!Number.isInteger(rid) || rid <= 0) return { ok: false, error: 'شناسهٔ سکونت نامعتبر است.' };
  const [existing] = await db.select().from(dorm_residences).where(eq(dorm_residences.id, rid)).limit(1);
  if (!existing) return { ok: false, error: 'رکورد سکونت یافت نشد.' };
  const scope = await assertStudentInUni(existing.studentId);
  if (!scope.ok) return { ok: false, error: scope.error };
  const status = input.status ?? existing.status;
  if (!['active', 'ended', 'revoked'].includes(status)) return { ok: false, error: 'وضعیت نامعتبر است.' };

  await db.transaction(async (tx) => {
    await tx.update(dorm_residences).set({
      dormName: input.dormName ?? existing.dormName,
      roomNo: input.roomNo ?? existing.roomNo,
      bedNo: input.bedNo ?? existing.bedNo,
      academicYear: input.academicYear ?? existing.academicYear,
      validFrom: input.validFrom ? new Date(input.validFrom) : existing.validFrom,
      validTo: input.validTo ? new Date(input.validTo) : existing.validTo,
      status,
      updatedAt: new Date(),
    }).where(eq(dorm_residences.id, rid));
    await appendAudit(tx, {
      actorUserId: me.id,
      action: 'DORM_RESIDENCE_UPDATE',
      entityType: 'dorm_residence',
      entityId: rid,
      details: JSON.stringify({ studentId: existing.studentId, status }),
    });
  });
  return { ok: true };
}

/** حذف سکونت خوابگاهی (فقط برای دادهٔ اشتباه ثبتشده) */
export async function deleteDormResidence(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireRole(EDU);
  const rid = Number(id);
  if (!Number.isInteger(rid) || rid <= 0) return { ok: false, error: 'شناسهٔ سکونت نامعتبر است.' };
  const [existing] = await db.select().from(dorm_residences).where(eq(dorm_residences.id, rid)).limit(1);
  if (!existing) return { ok: false, error: 'رکورد سکونت یافت نشد.' };

  await db.transaction(async (tx) => {
    await tx.delete(dorm_residences).where(eq(dorm_residences.id, rid));
    await appendAudit(tx, {
      actorUserId: me.id,
      action: 'DORM_RESIDENCE_DELETE',
      entityType: 'dorm_residence',
      entityId: rid,
      details: JSON.stringify({ studentId: existing.studentId }),
    });
  });
  return { ok: true };
}
