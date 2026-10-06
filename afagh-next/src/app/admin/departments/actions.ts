'use server';

import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { courses, departments, faculties, majors, roles, staff, user_roles, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { isHeadOfAny } from '@/lib/group-manager';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const n = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim();
  return v === '' ? null : Number(v);
};

export type DeptRow = {
  id: number;
  name: string;
  code: string | null;
  kind: 'ACADEMIC' | 'GENERAL';
  isActive: boolean;
  facultyId: number;
  facultyName: string;
  facultyCode: string | null;
  headStaffId: number | null;
  headName: string | null;
  headUserId: number | null;
  members: number;
  coursesCount: number;
  majorsCount: number;
};

/** فهرست گروه‌ها با مدیر، تعداد اعضا، دروس و رشته‌ها */
export async function listDepartments(): Promise<DeptRow[]> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  // دانشگاه فعال — گروه‌های همین دانشگاه + رکوردهای سراسری (universityId=null)
  const uniId = (await getCurrentUniversity()).id;
  const rows = await db
    .select({
      id: departments.id,
      name: departments.name,
      code: departments.departmentCode,
      kind: departments.kind,
      isActive: departments.isActive,
      facultyId: departments.facultyId,
      facultyName: faculties.name,
      facultyCode: faculties.facultyCode,
      headStaffId: departments.headStaffId,
      headFirst: users.firstName,
      headLast: users.lastName,
      headTitle: staff.title,
      headUserId: users.id,
    })
    .from(departments)
    .innerJoin(faculties, eq(faculties.id, departments.facultyId))
    .leftJoin(staff, eq(staff.id, departments.headStaffId))
    .leftJoin(users, eq(users.id, staff.userId))
    .where(or(eq(departments.universityId, uniId), isNull(departments.universityId)))
    .orderBy(faculties.name, departments.name);

  const counts = await db
    .select({ deptId: staff.departmentId, c: sql<number>`count(*)::int` })
    .from(staff)
    .groupBy(staff.departmentId);
  const memberOf = new Map(counts.map(c => [c.deptId, c.c]));

  const cCounts = await db
    .select({ deptId: courses.departmentId, c: sql<number>`count(*)::int` })
    .from(courses)
    .groupBy(courses.departmentId);
  const courseOf = new Map(cCounts.map(c => [c.deptId, c.c]));

  const mCounts = await db
    .select({ deptId: majors.departmentId, c: sql<number>`count(*)::int` })
    .from(majors)
    .groupBy(majors.departmentId);
  const majorOf = new Map(mCounts.map(c => [c.deptId, c.c]));

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    code: r.code,
    kind: r.kind === 'GENERAL' ? 'GENERAL' : 'ACADEMIC',
    isActive: r.isActive !== 0,
    facultyId: r.facultyId,
    facultyName: r.facultyName,
    facultyCode: r.facultyCode,
    headStaffId: r.headStaffId,
    headName: r.headStaffId ? `${r.headTitle ? r.headTitle + ' ' : ''}${r.headFirst ?? ''} ${r.headLast ?? ''}`.trim() : null,
    headUserId: r.headUserId,
    members: memberOf.get(r.id) ?? 0,
    coursesCount: courseOf.get(r.id) ?? 0,
    majorsCount: majorOf.get(r.id) ?? 0,
  }));
}

export type StaffPick = {
  id: number;
  userId: number | null;
  name: string;
  staffCode: string | null;
  rank: string | null;
  deptId: number | null;
  deptName: string | null;
};

/** فهرست اعضای هیئت علمی/کارکنان برای انتخاب مدیر یا عضو */
export async function listStaffPicks(): Promise<StaffPick[]> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  // دانشگاه فعال — پرسنل همین دانشگاه + پرونده‌های سراسری (universityId=null)
  const uniId = (await getCurrentUniversity()).id;
  const rows = await db
    .select({
      id: staff.id,
      userId: staff.userId,
      first: users.firstName,
      last: users.lastName,
      title: staff.title,
      staffCode: staff.staffCode,
      rank: staff.academicRank,
      deptId: staff.departmentId,
      deptName: departments.name,
      isActive: staff.isActive,
    })
    .from(staff)
    .leftJoin(users, eq(users.id, staff.userId))
    .leftJoin(departments, eq(departments.id, staff.departmentId))
    .where(or(eq(staff.universityId, uniId), isNull(staff.universityId)))
    .orderBy(users.lastName, users.firstName);

  return rows
    .filter(r => r.isActive !== 0)
    .map(r => ({
      id: r.id,
      userId: r.userId,
      name: `${r.title ? r.title + ' ' : ''}${r.first ?? ''} ${r.last ?? ''}`.trim() || `کد ${r.staffCode ?? r.id}`,
      staffCode: r.staffCode,
      rank: r.rank,
      deptId: r.deptId,
      deptName: r.deptName,
    }));
}

export async function listFaculties() {
  await requireRole(['ADMIN', 'VICE_EDU']);
  // دانشگاه فعال — دانشکده‌های همین دانشگاه + رکوردهای سراسری (universityId=null)
  const uniId = (await getCurrentUniversity()).id;
  return db
    .select({ id: faculties.id, name: faculties.name, code: faculties.facultyCode })
    .from(faculties)
    .where(or(eq(faculties.universityId, uniId), isNull(faculties.universityId)))
    .orderBy(faculties.name);
}

/** کد دانشکده — سند اصالت آن؛ تا الان هیچ رابطی برای ویرایشش نبود */
export async function setFacultyCodeAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const id = n(fd, 'facultyId');
  const code = s(fd, 'code');
  if (!id) return { ok: false, error: 'دانشکده نامعتبر است.' };
  if (code) {
    const dup = await db
      .select({ id: faculties.id })
      .from(faculties)
      .where(and(eq(faculties.facultyCode, code), ne(faculties.id, id)))
      .limit(1);
    if (dup.length) return { ok: false, error: `کد «${code}» برای دانشکدهٔ دیگری ثبت شده است.` };
  }
  await db.update(faculties).set({ facultyCode: code || null }).where(eq(faculties.id, id));
  revalidatePath('/admin/departments');
  return { ok: true };
}

async function depHeadRoleId(): Promise<number | null> {
  const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, 'DEP_HEAD')).limit(1);
  return r?.id ?? null;
}

/** دادن نقش مدیر گروه به یک کاربر (بدون دست‌زدن به بقیهٔ نقش‌ها) */
async function grantDepHead(userId: number) {
  const rid = await depHeadRoleId();
  if (!rid) return;
  const has = await db.select().from(user_roles).where(and(eq(user_roles.userId, userId), eq(user_roles.roleId, rid))).limit(1);
  if (!has.length) await db.insert(user_roles).values({ userId, roleId: rid });
}

/**
 * برداشتن نقش مدیر گروه — فقط اگر مدیر هیچ گروه دیگری نباشد.
 * ⚠️ عمداً فقط همین یک ردیف نقش حذف می‌شود؛ نسخهٔ قبلی این صفحه
 * `delete from user_roles where userId=…` می‌زد و *همهٔ* نقش‌های شخص
 * (از جمله «استاد») را پاک می‌کرد.
 */
async function revokeDepHeadIfUnused(staffId: number, userId: number | null) {
  if (!userId) return;
  if (await isHeadOfAny(staffId)) return;
  const rid = await depHeadRoleId();
  if (!rid) return;
  await db.delete(user_roles).where(and(eq(user_roles.userId, userId), eq(user_roles.roleId, rid)));
}

export async function createDepartmentAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const name = s(fd, 'name');
  const facultyId = n(fd, 'facultyId');
  if (!name) return { ok: false, error: 'نام گروه الزامی است.' };
  if (!facultyId) return { ok: false, error: 'دانشکده را انتخاب کنید.' };

  const code = s(fd, 'code');
  if (code) {
    const dupC = await db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.departmentCode, code)).limit(1);
    if (dupC.length) return { ok: false, error: `کد گروه «${code}» قبلاً برای «${dupC[0].name}» ثبت شده — کد باید یکتا باشد.` };
  }
  // نام تکراری فقط *درون همان دانشکده* ممنوع است؛ دو دانشکده می‌توانند گروه
  // هم‌نام داشته باشند و کد آن‌ها را از هم جدا می‌کند.
  const dup = await db
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.name, name), eq(departments.facultyId, facultyId)))
    .limit(1);
  if (dup.length) return { ok: false, error: `گروهی با نام «${name}» در این دانشکده از قبل هست.` };

  const [row] = await db
    .insert(departments)
    .values({
      name,
      facultyId,
      departmentCode: code || null,
      kind: s(fd, 'kind') === 'GENERAL' ? 'GENERAL' : 'ACADEMIC',
      isActive: 1,
    })
    .returning({ id: departments.id });

  const headStaffId = n(fd, 'headStaffId');
  if (headStaffId) await setHeadInternal(row.id, headStaffId);

  revalidatePath('/admin/departments');
  return { ok: true };
}

export async function updateDepartmentAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const id = n(fd, 'id');
  const name = s(fd, 'name');
  const facultyId = n(fd, 'facultyId');
  if (!id) return { ok: false, error: 'گروه نامعتبر است.' };
  if (!name) return { ok: false, error: 'نام گروه الزامی است.' };
  if (!facultyId) return { ok: false, error: 'دانشکده را انتخاب کنید.' };

  const code = s(fd, 'code');
  if (code) {
    const dupC = await db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(and(eq(departments.departmentCode, code), ne(departments.id, id)))
      .limit(1);
    if (dupC.length) return { ok: false, error: `کد گروه «${code}» قبلاً برای «${dupC[0].name}» ثبت شده — کد باید یکتا باشد.` };
  }
  const dup = await db
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.name, name), eq(departments.facultyId, facultyId), ne(departments.id, id)))
    .limit(1);
  if (dup.length) return { ok: false, error: `گروه دیگری با نام «${name}» در این دانشکده هست.` };

  await db
    .update(departments)
    .set({
      name,
      facultyId,
      departmentCode: code || null,
      kind: s(fd, 'kind') === 'GENERAL' ? 'GENERAL' : 'ACADEMIC',
      isActive: s(fd, 'isActive') === '0' ? 0 : 1,
    })
    .where(eq(departments.id, id));

  revalidatePath('/admin/departments');
  return { ok: true };
}

async function setHeadInternal(deptId: number, staffId: number) {
  const [prev] = await db.select({ headStaffId: departments.headStaffId }).from(departments).where(eq(departments.id, deptId)).limit(1);
  await db.update(departments).set({ headStaffId: staffId }).where(eq(departments.id, deptId));

  const [st] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.id, staffId)).limit(1);
  if (st?.userId) await grantDepHead(st.userId);

  // مدیر قبلی: اگر جای دیگری مدیر نیست، نقشش برداشته شود
  if (prev?.headStaffId && prev.headStaffId !== staffId) {
    const [old] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.id, prev.headStaffId)).limit(1);
    await revokeDepHeadIfUnused(prev.headStaffId, old?.userId ?? null);
  }
}

/** انتخاب/تعویض مدیر گروه — نقش DEP_HEAD خودکار داده می‌شود */
export async function setDepartmentHeadAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const deptId = n(fd, 'deptId');
  const staffId = n(fd, 'staffId');
  if (!deptId) return { ok: false, error: 'گروه نامعتبر است.' };

  if (!staffId) {
    // برداشتن مدیر
    const [cur] = await db.select({ headStaffId: departments.headStaffId }).from(departments).where(eq(departments.id, deptId)).limit(1);
    await db.update(departments).set({ headStaffId: null }).where(eq(departments.id, deptId));
    if (cur?.headStaffId) {
      const [old] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.id, cur.headStaffId)).limit(1);
      await revokeDepHeadIfUnused(cur.headStaffId, old?.userId ?? null);
    }
    revalidatePath('/admin/departments');
    revalidatePath('/admin/staff');
    return { ok: true };
  }

  const [st] = await db.select({ id: staff.id, userId: staff.userId }).from(staff).where(eq(staff.id, staffId)).limit(1);
  if (!st) return { ok: false, error: 'پروندهٔ کارمندی یافت نشد.' };
  if (!st.userId) return { ok: false, error: 'این پرونده حساب کاربری ندارد؛ ابتدا حساب بسازید تا بتواند وارد پنل شود.' };

  await setHeadInternal(deptId, staffId);
  revalidatePath('/admin/departments');
  revalidatePath('/admin/staff');
  return { ok: true };
}

/** جابه‌جایی عضویت یک استاد بین گروه‌ها (staff.departmentId) */
export async function setStaffDepartmentAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const staffId = n(fd, 'staffId');
  const deptId = n(fd, 'deptId'); // null = خارج کردن از گروه
  if (!staffId) return { ok: false, error: 'پروندهٔ کارمندی نامعتبر است.' };

  let facultyId: number | null = null;
  if (deptId) {
    const [d] = await db.select({ facultyId: departments.facultyId }).from(departments).where(eq(departments.id, deptId)).limit(1);
    if (!d) return { ok: false, error: 'گروه یافت نشد.' };
    facultyId = d.facultyId;
  }
  await db.update(staff).set({ departmentId: deptId, ...(facultyId ? { facultyId } : {}) }).where(eq(staff.id, staffId));
  revalidatePath('/admin/departments');
  revalidatePath('/admin/staff');
  return { ok: true };
}

/** دروسی که هنوز به هیچ گروهی وصل نیستند (بی‌صاحب می‌مانند و در پنل مدیر گروه دیده نمی‌شوند) — محدود به دانشگاه فعال */
export async function countOrphanCourses(): Promise<number> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const uniId = (await getCurrentUniversity()).id;
  const [r] = await db.select({ c: sql<number>`count(*)::int` }).from(courses)
    .where(and(isNull(courses.departmentId), or(eq(courses.universityId, uniId), isNull(courses.universityId))));
  return r?.c ?? 0;
}

export type GroupContent = {
  courses: { id: number; code: string; title: string }[];
  majors: { id: number; code: string | null; name: string }[];
};

/** دروس و رشته‌های یک گروه — برای نمایش مستقل محتوای هر گروه */
export async function listGroupContent(deptId: number): Promise<GroupContent> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const uniId = (await getCurrentUniversity()).id;
  const [dep] = await db.select({ universityId: departments.universityId }).from(departments).where(eq(departments.id, deptId)).limit(1);
  if (!dep) return { courses: [], majors: [] };
  if (dep.universityId !== null && dep.universityId !== uniId) return { courses: [], majors: [] };
  const [cs, ms] = await Promise.all([
    db.select({ id: courses.id, code: courses.code, title: courses.title }).from(courses)
      .where(eq(courses.departmentId, deptId)).orderBy(courses.code),
    db.select({ id: majors.id, code: majors.majorCode, name: majors.name }).from(majors)
      .where(eq(majors.departmentId, deptId)).orderBy(majors.name),
  ]);
  return { courses: cs, majors: ms };
}

/** جدا کردن یک درس از گروهش (departmentId=NULL) — محدود به دانشگاه فعال */
export async function unassignCourseAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const uniId = (await getCurrentUniversity()).id;
  const id = n(fd, 'courseId');
  if (!id) return { ok: false, error: 'درس نامعتبر است.' };
  await db.update(courses).set({ departmentId: null })
    .where(and(eq(courses.id, id), or(eq(courses.universityId, uniId), isNull(courses.universityId))));
  revalidatePath('/admin/departments');
  return { ok: true };
}

/** جدا کردن یک رشته از گروهش — محدود به دانشگاه فعال */
export async function unassignMajorAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const uniId = (await getCurrentUniversity()).id;
  const id = n(fd, 'majorId');
  if (!id) return { ok: false, error: 'رشته نامعتبر است.' };
  await db.update(majors).set({ departmentId: null })
    .where(and(eq(majors.id, id), or(eq(majors.universityId, uniId), isNull(majors.universityId))));
  revalidatePath('/admin/departments');
  return { ok: true };
}

export type OrphanMajorRow = { id: number; code: string | null; name: string };

/** رشته‌های بی‌گروه دانشگاه فعال — تعیین تکلیف در همین صفحه */
export async function listOrphanMajors({ q, page, per }: { q?: string; page?: number; per?: number }): Promise<{ rows: OrphanMajorRow[]; total: number; page: number; per: number }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const uniId = (await getCurrentUniversity()).id;
  const p = Math.max(1, page || 1);
  const n = Math.min(100, Math.max(1, per || 20));
  const needle = String(q || '').trim();
  const base = and(
    isNull(majors.departmentId),
    or(eq(majors.universityId, uniId), isNull(majors.universityId)),
    needle ? or(sql`${majors.name} ILIKE ${'%' + needle + '%'}`, sql`${majors.majorCode} ILIKE ${'%' + needle + '%'}`) : undefined,
  );
  const [{ c: total }] = await db.select({ c: sql<number>`count(*)::int` }).from(majors).where(base);
  const rows = await db.select({ id: majors.id, code: majors.majorCode, name: majors.name })
    .from(majors).where(base).orderBy(majors.name).limit(n).offset((p - 1) * n);
  return { rows, total: total ?? 0, page: p, per: n };
}

/** اتصال رشته‌های منتخب به یک گروه — فقط رشته‌های دانشگاه فعال، فقط گروه همین دانشگاه */
export async function assignMajorsAction(fd: FormData): Promise<{ ok: boolean; error?: string; moved?: number }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const uniId = (await getCurrentUniversity()).id;
  const deptId = n(fd, 'deptId');
  const ids = String(fd.get('majorIds') ?? '').split(',').map(x => Number(x)).filter(Number.isInteger);
  if (!deptId) return { ok: false, error: 'گروه مقصد را انتخاب کنید.' };
  if (!ids.length) return { ok: false, error: 'هیچ رشته‌ای انتخاب نشده است.' };
  const [dep] = await db.select({ universityId: departments.universityId }).from(departments).where(eq(departments.id, deptId)).limit(1);
  if (!dep) return { ok: false, error: 'گروه مقصد یافت نشد.' };
  if (dep.universityId !== null && dep.universityId !== uniId) return { ok: false, error: 'گروه مقصد متعلق به دانشگاه دیگری است.' };
  const rows = await db.update(majors).set({ departmentId: deptId })
    .where(and(
      isNull(majors.departmentId),
      or(eq(majors.universityId, uniId), isNull(majors.universityId)),
      sql`${majors.id} = ANY(${ids})`,
    ))
    .returning({ id: majors.id });
  revalidatePath('/admin/departments');
  return { ok: true, moved: rows.length };
}

export type OrphanCourseRow = { id: number; code: string; title: string; courseType: string | null };

/** فهرست صفحه‌بندی‌شدهٔ دروس بی‌گروه دانشگاه فعال — برای تعیین تکلیف تکی/گروهی */
export async function listOrphanCourses({ q, page, per }: { q?: string; page?: number; per?: number }): Promise<{ rows: OrphanCourseRow[]; total: number; page: number; per: number }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const uniId = (await getCurrentUniversity()).id;
  const p = Math.max(1, page || 1);
  const n = Math.min(100, Math.max(1, per || 20));
  const needle = String(q || '').trim();
  const base = and(
    isNull(courses.departmentId),
    or(eq(courses.universityId, uniId), isNull(courses.universityId)),
    needle ? or(sql`${courses.code} ILIKE ${'%' + needle + '%'}`, sql`${courses.title} ILIKE ${'%' + needle + '%'}`) : undefined,
  );
  const [{ c: total }] = await db.select({ c: sql<number>`count(*)::int` }).from(courses).where(base);
  const rows = await db.select({ id: courses.id, code: courses.code, title: courses.title, courseType: courses.courseType })
    .from(courses).where(base).orderBy(courses.code).limit(n).offset((p - 1) * n);
  return { rows, total: total ?? 0, page: p, per: n };
}

/** اتصال دروس منتخب به یک گروه — فقط دروس دانشگاه فعال، فقط گروه همین دانشگاه */
export async function assignCoursesAction(fd: FormData): Promise<{ ok: boolean; error?: string; moved?: number }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const uniId = (await getCurrentUniversity()).id;
  const deptId = n(fd, 'deptId');
  const ids = String(fd.get('courseIds') ?? '').split(',').map(x => Number(x)).filter(Number.isInteger);
  if (!deptId) return { ok: false, error: 'گروه مقصد را انتخاب کنید.' };
  if (!ids.length) return { ok: false, error: 'هیچ درسی انتخاب نشده است.' };
  const [dep] = await db.select({ universityId: departments.universityId }).from(departments).where(eq(departments.id, deptId)).limit(1);
  if (!dep) return { ok: false, error: 'گروه مقصد یافت نشد.' };
  if (dep.universityId !== null && dep.universityId !== uniId) return { ok: false, error: 'گروه مقصد متعلق به دانشگاه دیگری است.' };
  const rows = await db.update(courses).set({ departmentId: deptId })
    .where(and(
      isNull(courses.departmentId),
      or(eq(courses.universityId, uniId), isNull(courses.universityId)),
      sql`${courses.id} = ANY(${ids})`,
    ))
    .returning({ id: courses.id });
  revalidatePath('/admin/departments');
  return { ok: true, moved: rows.length };
}
export async function assignOrphanCoursesAction(fd: FormData): Promise<{ ok: boolean; error?: string; moved?: number }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const uniId = (await getCurrentUniversity()).id;
  const deptId = n(fd, 'deptId');
  if (!deptId) return { ok: false, error: 'گروه مقصد را انتخاب کنید.' };
  const [dep] = await db.select({ universityId: departments.universityId }).from(departments).where(eq(departments.id, deptId)).limit(1);
  if (!dep) return { ok: false, error: 'گروه مقصد یافت نشد.' };
  if (dep.universityId !== null && dep.universityId !== uniId) return { ok: false, error: 'گروه مقصد متعلق به دانشگاه دیگری است.' };
  const rows = await db.update(courses).set({ departmentId: deptId })
    .where(and(isNull(courses.departmentId), or(eq(courses.universityId, uniId), isNull(courses.universityId))))
    .returning({ id: courses.id });
  revalidatePath('/admin/departments');
  return { ok: true, moved: rows.length };
}
