'use server';

import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db, withUserRls } from '@/db';
import {
  academic_terms, course_offerings, courses, enrollments, majors, offering_professors,
  staff, students, users,
} from '@/db/schema';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getBool } from '@/lib/settings';
import { getCurrentUniversity } from '@/lib/university-scope';
import { buildPrereqContext, formatPrereq } from '@/lib/enroll-engine/prereqs';

const EDU = ['ADMIN', 'EDU_EXPERT'];

async function uniId(): Promise<number | null> {
  try { return (await getCurrentUniversity())?.id ?? null; } catch { return null; }
}

// ─────────────── جست‌وجوی دانشجو (تک‌ثبت‌نام) ───────────────
export async function searchStudentsForManualEnroll(q: string): Promise<{
  ok: boolean; items?: { userId: number; studentId: number; studentCode: string; name: string; entryYear: number | null; status: string }[]; error?: string;
}> {
  try { await requireRole(EDU); } catch { return { ok: false, error: 'دسترسی ندارید.' }; }
  const u = await uniId();
  const needle = String(q || '').trim();
  if (!needle) return { ok: true, items: [] };
  const conds = [eq(students.status, 'ACTIVE')];
  if (u) conds.push(eq(students.universityId, u));
  const rows = await db
    .select({
      userId: students.userId, studentId: students.id, studentCode: students.studentCode,
      entryYear: students.entryYear, status: students.status,
      firstName: users.firstName, lastName: users.lastName,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(...conds, ilike(students.studentCode, `%${needle}%`)))
    .orderBy(desc(students.id)).limit(20);
  return { ok: true, items: rows.map(r => ({ userId: r.userId, studentId: r.studentId, studentCode: r.studentCode, status: r.status, entryYear: r.entryYear, name: `${r.firstName || ''} ${r.lastName || ''}`.trim() })) };
}

export interface ManualEnrollOffering {
  offeringId: number; code: string; title: string; groupNumber: number; units: number | null;
  capacity: number; enrolledCount: number; professorName: string;
}

export async function listOfferingsForManualEnroll(termId: number): Promise<ManualEnrollOffering[]> {
  try { await requireRole(EDU); } catch { return []; }
  const rows = await db
    .select({
      offeringId: course_offerings.id, code: courses.code, title: courses.title,
      groupNumber: course_offerings.groupNumber, units: courses.units,
      capacity: course_offerings.capacity, enrolledCount: course_offerings.enrolledCount, professorId: course_offerings.professorId,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(course_offerings.termId, termId), eq(course_offerings.isActive, 1)))
    .orderBy(asc(courses.title), asc(course_offerings.groupNumber)).limit(4000);
  const profIds = [...new Set(rows.map(r => r.professorId).filter((n): n is number => typeof n === 'number'))];
  const profName = new Map<number, string>();
  if (profIds.length) {
    const ps = await db.select({ id: staff.id, firstName: users.firstName, lastName: users.lastName })
      .from(staff).innerJoin(users, eq(users.id, staff.userId)).where(inArray(staff.id, profIds));
    for (const p of ps) profName.set(p.id, `${p.firstName || ''} ${p.lastName || ''}`.trim());
  }
  return rows.map(r => ({
    offeringId: r.offeringId, code: r.code, title: r.title, groupNumber: r.groupNumber,
    units: r.units == null ? null : Number(r.units), capacity: r.capacity,
    enrolledCount: r.enrolledCount ?? 0,
    professorName: (r.professorId != null && profName.get(r.professorId)) || '—',
  }));
}

// ─────────────── تک‌ثبت‌نام به‌جای دانشجو ───────────────
export interface ManualEnrollInput { studentId: number; offeringId: number; override: boolean; reason: string; }

export async function manualEnrollAction(input: ManualEnrollInput): Promise<{ ok: boolean; error?: string; enrollmentId?: number }> {
  const me = await requireRole(EDU);
  const sid = Number(input.studentId), oid = Number(input.offeringId);
  if (!Number.isInteger(sid) || !Number.isInteger(oid)) return { ok: false, error: 'اطلاعات نامعتبر.' };
  const override = !!input.override;
  const reason = String(input.reason || '').trim();
  const overrideAllowed = await getBool('ENROLL_EXPERT_OVERRIDE').catch(() => true);
  if (override && !overrideAllowed) return { ok: false, error: 'نادیده‌گرفتن آیین‌نامه در حال حاضر غیرمجاز است (تنظیم سازمان).' };
  if (override && reason.length < 5) return { ok: false, error: 'وقتی آیین‌نامه را نادیده می‌گیری، دلیل (حداقل ۵ نویسه) الزامی است.' };

  const u = await uniId();
  const [stu] = await db.select().from(students).where(and(eq(students.id, sid), eq(students.status, 'ACTIVE'))).limit(1);
  if (!stu) return { ok: false, error: 'دانشجوی فعال یافت نشد.' };
  if (u && stu.universityId && stu.universityId !== u) return { ok: false, error: 'این دانشجو از دانشگاه دیگری است.' };
  const [off] = await db.select().from(course_offerings)
    .where(and(eq(course_offerings.id, oid), eq(course_offerings.isActive, 1))).limit(1);
  if (!off) return { ok: false, error: 'کلاس یافت نشد یا غیرفعال است.' };
  const dup = await db.select({ id: enrollments.id }).from(enrollments)
    .where(and(eq(enrollments.studentId, sid), eq(enrollments.offeringId, oid))).limit(1);
  if (dup.length) return { ok: false, error: 'این دانشجو همین‌الان در این کلاس ثبت است.' };
  if (!override && off.enrolledCount != null && off.capacity > 0 && off.enrolledCount >= off.capacity) {
    return { ok: false, error: 'ظرفیت کلاس پر است — برای تخطی، نادیده‌گرفتن (با دلیل) لازم است.' };
  }
  const ins = await withUserRls(me.id, tx => tx.insert(enrollments).values({
    studentId: sid, offeringId: oid, status: 'REGISTERED', universityId: stu.universityId ?? null,
    enrolledByUserId: me.id, enrollOverride: override ? 1 : 0, enrollOverrideReason: override ? reason : null,
  }).returning({ id: enrollments.id }));
  await db.update(course_offerings).set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` }).where(eq(course_offerings.id, oid));
  return { ok: true, enrollmentId: ins[0]?.id };
}

// ─────────────── فیلتر گروهی (ورودی/رشته/دانشکده/گروه/ترم) ───────────────
export interface BulkFilter {
  termId: number;
  entryYear: number | null;
  majorId: number | null;
  departmentId: number | null;
  facultyId: number | null;
}

async function bulkStudentIds(f: BulkFilter): Promise<number[]> {
  const conds = [eq(students.status, 'ACTIVE')];
  if (f.entryYear) conds.push(eq(students.entryYear, f.entryYear));
  if (f.majorId) conds.push(eq(students.majorId, f.majorId));
  if (f.departmentId || f.facultyId) {
    const mConds: any[] = [];
    if (f.departmentId) mConds.push(eq(majors.departmentId, f.departmentId));
    else if (f.facultyId) mConds.push(eq(majors.facultyId, f.facultyId));
    const mids = (await db.select({ id: majors.id }).from(majors).where(mConds.length ? and(...mConds) : undefined)).map(r => r.id);
    if (!mids.length) return [];
    conds.push(inArray(students.majorId, mids));
  }
  const rows = await db.select({ id: students.id }).from(students).where(and(...conds)).limit(20000);
  return rows.map(r => r.id);
}

/** شمارش گروه مخاطب پیش از اقدام دسته‌جمعی */
export async function countBulkStudents(f: BulkFilter): Promise<{ ok: boolean; count?: number; error?: string }> {
  try { await requireRole(EDU); } catch { return { ok: false, error: 'دسترسی ندارید.' }; }
  try { return { ok: true, count: (await bulkStudentIds(f)).length }; } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** انتخاب واحد دسته‌جمعی: همهٔ دانشجویان فیلتر → در یک یا چند کلاس ثبت می‌شوند */
export async function bulkEnrollAction(
  f: BulkFilter, offeringIds: number[], override: boolean, reason: string,
): Promise<{ ok: boolean; error?: string; inserted?: number; skipped?: number; total?: number }> {
  const me = await requireRole(EDU);
  const overrideAllowed = await getBool('ENROLL_EXPERT_OVERRIDE').catch(() => true);
  if (override && !overrideAllowed) return { ok: false, error: 'نادیده‌گرفتن آیین‌نامه غیرمجاز است (تنظیم سازمان).' };
  if (override && String(reason || '').trim().length < 5) return { ok: false, error: 'دلیل نادیده‌گرفتن (≥۵ نویسه) الزامی است.' };
  const ids = offeringIds.map(Number).filter(Number.isInteger);
  if (!ids.length) return { ok: false, error: 'حداقل یک کلاس انتخاب کنید.' };
  const sids = await bulkStudentIds(f);
  if (!sids.length) return { ok: false, error: 'هیچ دانشجویی با این فیلتر پیدا نشد.' };

  let inserted = 0, skipped = 0;
  for (const oid of ids) {
    // گیت ظرفیت مگر با override
    const [off] = await db.select().from(course_offerings).where(eq(course_offerings.id, oid)).limit(1);
    if (!off) { skipped++; continue; }
    for (const sid of sids) {
      if (inserted + skipped >= 3000) break;
      const dup = await db.select({ id: enrollments.id }).from(enrollments)
        .where(and(eq(enrollments.studentId, sid), eq(enrollments.offeringId, oid))).limit(1);
      if (dup.length) { skipped++; continue; }
      const free = !override && off.enrolledCount != null && off.capacity > 0 && off.enrolledCount >= off.capacity;
      if (free) { skipped++; continue; }
      const ins = await withUserRls(me.id, tx => tx.insert(enrollments).values({
        studentId: sid, offeringId: oid, status: 'REGISTERED', universityId: off.universityId ?? null,
        enrolledByUserId: me.id, enrollOverride: override ? 1 : 0, enrollOverrideReason: override ? String(reason || '').trim() : null,
      }).onConflictDoNothing().returning({ id: enrollments.id }));
      if (ins.length) {
        inserted++;
        await db.update(course_offerings).set({ enrolledCount: sql`${course_offerings.enrolledCount} + 1` }).where(eq(course_offerings.id, oid));
      }
    }
  }
  return { ok: true, inserted, skipped, total: sids.length };
}

/** حذف دسته‌جمعی: ثبت‌نام دانشجویان فیلتر در کلاس‌های انتخابی → DROPPED */
export async function bulkDropAction(
  f: BulkFilter, offeringIds: number[], reason: string,
): Promise<{ ok: boolean; error?: string; dropped?: number; skipped?: number }> {
  const me = await requireRole(EDU);
  const ids = offeringIds.map(Number).filter(Number.isInteger);
  if (!ids.length) return { ok: false, error: 'حداقل یک کلاس انتخاب کنید.' };
  const sids = await bulkStudentIds(f);
  if (!sids.length) return { ok: false, error: 'هیچ دانشجویی با این فیلتر پیدا نشد.' };
  let dropped = 0, skipped = 0;
  for (const oid of ids) {
    const res = await withUserRls(me.id, tx => tx.update(enrollments)
      .set({ status: 'DROPPED', enrolledByUserId: me.id, enrollOverrideReason: String(reason || '').trim() || null })
      .where(and(inArray(enrollments.studentId, sids), eq(enrollments.offeringId, oid), eq(enrollments.status, 'REGISTERED')))
      .returning({ id: enrollments.id }));
    dropped += res.length;
    await db.update(course_offerings).set({ enrolledCount: sql`GREATEST(${course_offerings.enrolledCount} - ${res.length}, 0)` }).where(eq(course_offerings.id, oid));
  }
  return { ok: true, dropped, skipped };
}

// ─────────────── تاریخچهٔ (پیگیری کی/چرا) ───────────────
export async function manualEnrollHistory(limit = 50): Promise<{
  ok: boolean; items?: {
    id: number; studentCode: string; studentName: string; courseCode: string; courseTitle: string; groupNumber: number;
    termTitle: string; who: string; when: string | null; override: boolean; reason: string | null;
  }[]; error?: string;
}> {
  try { await requireRole(EDU); } catch { return { ok: false, error: 'دسترسی ندارید.' }; }
  const rows = await db
    .select({
      id: enrollments.id, studentCode: students.studentCode,
      studentFirstName: users.firstName, studentLastName: users.lastName,
      courseCode: courses.code, courseTitle: courses.title, groupNumber: course_offerings.groupNumber,
      termTitle: academic_terms.title, whoId: enrollments.enrolledByUserId,
      createdAt: enrollments.registeredAt, override: enrollments.enrollOverride, reason: enrollments.enrollOverrideReason,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .where(sql`${enrollments.enrolledByUserId} IS NOT NULL`)
    .orderBy(desc(enrollments.id)).limit(limit);
  const whoIds = [...new Set(rows.map(r => r.whoId).filter((n): n is number => typeof n === 'number'))];
  const whoName = new Map<number, string>();
  if (whoIds.length) {
    const ws = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, whoIds));
    for (const w of ws) whoName.set(w.id, `${w.firstName || ''} ${w.lastName || ''}`.trim() || `کاربر ${w.id}`);
  }
  const items = rows.map(r => ({
    id: r.id, studentCode: r.studentCode, studentName: `${r.studentFirstName || ''} ${r.studentLastName || ''}`.trim(),
    courseCode: r.courseCode, courseTitle: r.courseTitle, groupNumber: r.groupNumber, termTitle: r.termTitle,
    who: r.whoId ? (whoName.get(r.whoId) ?? '—') : '—',
    when: r.createdAt ? (r.createdAt as Date).toISOString() : null,
    override: (r.override ?? 0) === 1, reason: r.reason,
  }));
  return { ok: true, items };
}

void getSessionUser; void offering_professors; // (import refs نگه‌داری می‌شوند تا از حذف ناخواسته جلوگیری شود)

// ─────────────── کاتالوگِ همان دانشجو (راهنمای کارشناس) ───────────────
// مانند «انتخاب واحد» خودِ دانشجو: چارت+ارائه‌ها+پیش‌نیازها را نشان می‌دهد
// تا کارشناس مثل خودِ دانشجو درس‌ها را ببیند و انتخاب کند.

export interface CatalogOffering extends ManualEnrollOffering {
  courseId: number;
  alreadyEnrolled: boolean;
  prereq: string | null;
}

export async function getStudentCatalog(studentId: number, termId: number): Promise<{
  ok: boolean; items?: CatalogOffering[]; error?: string;
}> {
  try { await requireRole(EDU); } catch { return { ok: false, error: 'دسترسی ندارید.' }; }
  const sid = Number(studentId), tid = Number(termId);
  if (!Number.isInteger(sid) || !Number.isInteger(tid)) return { ok: false, error: 'اطلاعات نامعتبر.' };
  const [stu] = await db.select().from(students).where(eq(students.id, sid)).limit(1);
  if (!stu) return { ok: false, error: 'دانشجو یافت نشد.' };

  const enrolled = await db.select({ courseId: courses.id })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(enrollments.studentId, sid), eq(course_offerings.termId, tid),
      inArray(enrollments.status, ['REGISTERED', 'WAITLISTED', 'PENDING_COUNCIL'])));
  const takenCourseIds = new Set(enrolled.map(e => e.courseId));

  const rows = await db.select({
    offeringId: course_offerings.id, courseId: courses.id, code: courses.code, title: courses.title,
    groupNumber: course_offerings.groupNumber, units: courses.units, capacity: course_offerings.capacity,
    enrolledCount: course_offerings.enrolledCount, professorId: course_offerings.professorId,
  })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(eq(course_offerings.termId, tid), eq(course_offerings.isActive, 1)))
    .orderBy(asc(courses.title), asc(course_offerings.groupNumber))
    .limit(4000);

  const profIds = [...new Set(rows.map(r => r.professorId).filter((n): n is number => typeof n === 'number'))];
  const profName = new Map<number, string>();
  if (profIds.length) {
    const ps = await db.select({ id: staff.id, firstName: users.firstName, lastName: users.lastName })
      .from(staff).innerJoin(users, eq(users.id, staff.userId)).where(inArray(staff.id, profIds));
    for (const p of ps) profName.set(p.id, `${p.firstName || ''} ${p.lastName || ''}`.trim());
  }

  const prereqCtx = await buildPrereqContext(sid).catch(() => null);
  const items: CatalogOffering[] = rows.map(r => ({
    offeringId: r.offeringId, courseId: r.courseId, code: r.code, title: r.title, groupNumber: r.groupNumber,
    units: r.units == null ? null : Number(r.units), capacity: r.capacity,
    enrolledCount: r.enrolledCount ?? 0,
    professorName: (r.professorId != null && profName.get(r.professorId)) || '—',
    alreadyEnrolled: takenCourseIds.has(r.courseId),
    prereq: prereqCtx ? formatPrereq(prereqCtx.ruleByCourse.get(r.courseId), prereqCtx.titles) : null,
  }));
  return { ok: true, items };
}