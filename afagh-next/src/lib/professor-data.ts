import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { hasProfessorSchedule, professorRangeMatch } from '@/lib/professor-week-grid';
import {
  classrooms,
  course_offerings,
  courses,
  departments,
  electronic_documents,
  enrollments,
  grade_appeals,
  offering_professors,
  schedules,
  staff,
  students,
  universities,
  users,
} from '@/db/schema';

export const JALALI_DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

import { professorUniqueOfferings, type ProfessorScheduleRow } from '@/lib/professor-week-grid';

export { professorUniqueOfferings, type ProfessorScheduleRow };

function mapCourseType(raw: string | null | undefined): ProfessorScheduleRow['courseType'] {
  const v = String(raw ?? '');
  if (v.includes('عملی') || v.includes('کارگاه') || v.includes('آزمایش')) return 'عملی';
  if (v.includes('پایه')) return 'پایه';
  if (v.includes('تخصصی')) return 'تخصصی';
  if (v.includes('عمومی')) return 'عمومی';
  return 'اصلی';
}

function mapWeekType(raw: string | null | undefined): ProfessorScheduleRow['weekType'] {
  const v = String(raw ?? '').toUpperCase();
  if (v === 'EVEN') return 'EVEN';
  if (v === 'ODD') return 'ODD';
  return 'ALL';
}

const fullName = sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, '')`;

/** ارائه‌هایی که استاد در آن‌ها مدرس است (مدرس اصلی یا عضو درس مشترک) */
function ownedOfferings(staffId: number, termId: number, universityId?: number | null): SQL {
  const sharedIds = db
    .select({ id: offering_professors.offeringId })
    .from(offering_professors)
    .where(eq(offering_professors.staffId, staffId));
  return and(
    eq(course_offerings.termId, termId),
    universityId ? eq(course_offerings.universityId, universityId) : undefined,
    sql`(${course_offerings.professorId} = ${staffId} or ${course_offerings.id} in ${sharedIds})`,
  )!;
}

/**
 * دروس تخصیص‌یافتهٔ واقعی یک استاد در یک ترم، همراهٔ زمان‌بندی و سالن کلاس.
 *
 * همهٔ ردیف‌ها به `termId` و `universityId` محدود می‌شوند؛ هیچ شناسهٔ ثابتی در
 * کد وجود ندارد. اگر استاد در این ترم درسی نداشته باشد، آرایهٔ خالی برمی‌گردد.
 */
export async function professorScheduleRows(staffId: number, termId: number, universityId?: number | null) {
  const rows = await db
    .select({
      offeringId: course_offerings.id,
      code: courses.code,
      title: courses.title,
      units: courses.units,
      courseNature: courses.courseNature,
      groupNumber: course_offerings.groupNumber,
      enrolledCount: course_offerings.enrolledCount,
      capacity: course_offerings.capacity,
      scheduleId: schedules.id,
      scheduleType: schedules.scheduleType,
      dayOfWeek: schedules.dayOfWeek,
      startTime: schedules.startTime,
      endTime: schedules.endTime,
      roomName: classrooms.name,
      buildingName: classrooms.buildingName,
    })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(schedules, eq(schedules.offeringId, course_offerings.id))
    .leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
    .where(ownedOfferings(staffId, termId, universityId));

  const offeringIds = [...new Set(rows.map(r => r.offeringId))];
  const partners = await coTaughtPartners(offeringIds);
  const seen = new Set<string>();
  const out: ProfessorScheduleRow[] = [];

  for (const r of rows) {
    const key = `${r.offeringId}:${r.scheduleId ?? 'none'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const partner = partners.get(r.offeringId) ?? null;
    const startTime = r.startTime ? String(r.startTime).slice(0, 5) : '';
    const endTime = r.endTime ? String(r.endTime).slice(0, 5) : '';
    const dayOfWeek = r.dayOfWeek ?? null;
    const hasSchedule = hasProfessorSchedule({ dayOfWeek, startTime, endTime });
    out.push({
      id: r.offeringId,
      code: r.code,
      title: r.title,
      units: Number(r.units ?? 0),
      courseType: mapCourseType(r.courseNature),
      groupNumber: r.groupNumber,
      enrolledCount: Number(r.enrolledCount ?? 0),
      capacity: Number(r.capacity ?? 0),
      dayOfWeek,
      dayName: dayOfWeek != null ? JALALI_DAY_NAMES[dayOfWeek - 1] ?? '' : '',
      startTime,
      endTime,
      roomName: r.roomName ?? '',
      buildingName: r.buildingName ?? '',
      weekType: mapWeekType(r.scheduleType),
      isCoTaught: !!partner,
      coRole: partner ? (partner.role === 'PRACTICAL' || partner.role === 'LAB' ? 'LAB' : 'THEORY') : undefined,
      coPartnerName: partner?.name,
      hasSchedule,
      outsideStandardSlots: hasSchedule && professorRangeMatch(startTime, endTime).outsideStandardSlots,
    });
  }

  return out;
}

export type CoTaughtPartner = {
  offeringId: number;
  name: string;
  staffCode: string;
  sharePercentage: number;
  role: string;
};

/** همکاران درس‌های مشترک (نام و سهم درصدی از پایگاه داده) */
export async function coTaughtPartners(offeringIds: number[]): Promise<Map<number, CoTaughtPartner>> {
  const out = new Map<number, CoTaughtPartner>();
  if (offeringIds.length === 0) return out;

  const rows = await db
    .select({
      offeringId: offering_professors.offeringId,
      staffId: offering_professors.staffId,
      role: offering_professors.role,
      sharePercentage: offering_professors.sharePercentage,
      staffCode: staff.staffCode,
      name: fullName,
    })
    .from(offering_professors)
    .innerJoin(staff, eq(staff.id, offering_professors.staffId))
    .innerJoin(users, eq(users.id, staff.userId))
    .where(inArray(offering_professors.offeringId, offeringIds));

  const grouped = new Map<number, typeof rows>();
  for (const r of rows) {
    const list = grouped.get(r.offeringId) ?? [];
    list.push(r);
    grouped.set(r.offeringId, list);
  }

  for (const [offeringId, list] of grouped) {
    if (list.length < 2) continue;
    const lead = list.slice().sort((a, b) => Number(b.sharePercentage ?? 0) - Number(a.sharePercentage ?? 0))[0];
    out.set(offeringId, {
      offeringId,
      name: lead.name,
      staffCode: lead.staffCode,
      sharePercentage: Number(lead.sharePercentage ?? 0),
      role: lead.role,
    });
  }
  return out;
}

export type ProfessorEnrollmentRow = {
  offeringId: number;
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  fullName: string;
  entryYear: number;
  gradeValue: string | null;
  gradeStatus: string;
};

export type ProfessorAppealRow = {
  id: number;
  enrollmentId: number;
  studentMessage: string;
  professorReply: string | null;
  oldGrade: string | null;
  newGrade: string | null;
  status: string | null;
  createdAt: Date | null;
};

/** دانشجویان ثبت‌نام‌شدهٔ ارائه‌ها با وضعیت نمرهٔ واقعی + اعتراض‌های ثبت‌شده */
export async function professorEnrollmentRows(offeringIds: number[]): Promise<{
  students: ProfessorEnrollmentRow[];
  appeals: ProfessorAppealRow[];
}> {
  if (offeringIds.length === 0) return { students: [], appeals: [] };

  const rows = await db
    .select({
      offeringId: enrollments.offeringId,
      enrollmentId: enrollments.id,
      studentId: enrollments.studentId,
      studentCode: students.studentCode,
      fullName: fullName,
      entryYear: students.entryYear,
      gradeValue: enrollments.gradeValue,
      gradeStatus: enrollments.gradeStatus,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(
      and(
        inArray(enrollments.offeringId, offeringIds),
        eq(enrollments.status, 'REGISTERED'),
      ),
    );

  const enrollmentIds = rows.map(s => s.enrollmentId);
  const appeals = enrollmentIds.length
    ? await db
        .select({
          id: grade_appeals.id,
          enrollmentId: grade_appeals.enrollmentId,
          studentMessage: grade_appeals.studentMessage,
          professorReply: grade_appeals.professorReply,
          oldGrade: grade_appeals.oldGrade,
          newGrade: grade_appeals.newGrade,
          status: grade_appeals.status,
          createdAt: grade_appeals.createdAt,
        })
        .from(grade_appeals)
        .where(inArray(grade_appeals.enrollmentId, enrollmentIds))
    : [];

  return { students: rows, appeals };
}

/** اسناد الکترونیک استاد (قرارداد/ابلاغ) در یک ترم مشخص */
export async function professorDocuments(staffId: number, termId: number) {
  return db
    .select({
      id: electronic_documents.id,
      title: electronic_documents.title,
      docType: electronic_documents.docType,
      signatureStatus: electronic_documents.signatureStatus,
      signedAt: electronic_documents.signedAt,
      documentHash: electronic_documents.documentHash,
      createdAt: electronic_documents.createdAt,
    })
    .from(electronic_documents)
    .where(
      and(
        eq(electronic_documents.staffId, staffId),
        eq(electronic_documents.termId, termId),
      ),
    );
}

/** نام دانشگاه (برای سربرگ اسناد) — تا متن سند به «آفاق» یا هر دانشگاه دیگر قفل نشود */
export async function universityTitle(universityId?: number | null): Promise<string | null> {
  if (!universityId) return null;
  const [row] = await db
    .select({ title: universities.title })
    .from(universities)
    .where(eq(universities.id, universityId))
    .limit(1);
  return row?.title ?? null;
}

/** نام گروه آموزشی استاد */
export async function professorDepartmentName(departmentId?: number | null): Promise<string | null> {
  if (!departmentId) return null;
  const [row] = await db
    .select({ name: departments.name })
    .from(departments)
    .where(eq(departments.id, departmentId))
    .limit(1);
  return row?.name ?? null;
}

export type MergeSlotLike = {
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  roomKey?: string | number | null;
};

function normMergeTime(v: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim());
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function mergedGroupKey(
  sharedScheduleGroupKey: string | null | undefined,
  slots: MergeSlotLike | MergeSlotLike[],
): string | null {
  const shared = String(sharedScheduleGroupKey ?? '').trim();
  if (shared) return `K:${shared}`;
  const list = (Array.isArray(slots) ? slots : [slots])
    .map(s => {
      const st = normMergeTime(s.startTime);
      const en = normMergeTime(s.endTime);
      if (s.dayOfWeek == null || !st || !en) return null;
      const room = s.roomKey == null || String(s.roomKey) === '' ? '-' : String(s.roomKey);
      return `${s.dayOfWeek}|${st}|${en}|${room}`;
    })
    .filter((x): x is string => x != null);
  if (list.length === 0) return null;
  return `S:${[...new Set(list)].sort().join(';')}`;
}

export type MergedGroup<T> = {
  key: string | null;
  merged: boolean;
  primaryId: number;
  memberIds: number[];
  members: T[];
};

export function groupIntoMerged<T>(
  items: T[],
  idOf: (item: T) => number,
  keyOf: (item: T) => string | null,
): MergedGroup<T>[] {
  const groups: MergedGroup<T>[] = [];
  const byKey = new Map<string, MergedGroup<T>>();
  for (const item of items) {
    const k = keyOf(item);
    if (k == null) {
      groups.push({ key: null, merged: false, primaryId: idOf(item), memberIds: [idOf(item)], members: [item] });
      continue;
    }
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, merged: false, primaryId: idOf(item), memberIds: [], members: [] };
      byKey.set(k, g);
      groups.push(g);
    }
    g.members.push(item);
    g.memberIds.push(idOf(item));
  }
  for (const g of groups) {
    if (g.members.length > 1) {
      g.merged = true;
      g.members.sort((a, b) => idOf(a) - idOf(b));
      g.memberIds = g.members.map(idOf);
      g.primaryId = g.memberIds[0];
    }
  }
  return groups;
}

export async function offeringSharedKeys(offeringIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (offeringIds.length === 0) return out;
  const rows = await db
    .select({ id: course_offerings.id, key: course_offerings.sharedScheduleGroupKey })
    .from(course_offerings)
    .where(inArray(course_offerings.id, offeringIds));
  for (const r of rows) {
    const k = String(r.key ?? '').trim();
    if (k) out.set(r.id, k);
  }
  return out;
}

export function mergedDisplayTitle(primaryTitle: string, codes: string[]): string {
  const uniq = [...new Set(codes)];
  return `${primaryTitle} (کلاس ادغامی: ${uniq.join('، ')})`;
}

export type MergeableOffering = {
  offeringId: number;
  courseCode: string;
  unitsInt: number;
  practicalUnits: number;
  enrolledCount: number;
  mergeKey: string | null;
  mergedMemberIds?: number[];
};

export function collapseMergedOfferings<T extends MergeableOffering>(
  list: T[],
  slotKeyOf: (offeringId: number) => string | null,
): T[] {
  const groups = groupIntoMerged(
    list,
    o => o.offeringId,
    o => o.mergeKey ?? slotKeyOf(o.offeringId),
  );
  return groups.map(g => {
    if (!g.merged) return g.members[0];
    const primary = g.members[0];
    const codes = [...new Set(g.members.map(m => m.courseCode))];
    return {
      ...primary,
      courseCode: codes.join('/'),
      unitsInt: Math.max(...g.members.map(m => m.unitsInt)),
      practicalUnits: Math.max(...g.members.map(m => m.practicalUnits)),
      enrolledCount: g.members.reduce((s, m) => s + m.enrolledCount, 0),
      mergedMemberIds: g.memberIds,
    };
  });
}