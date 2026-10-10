import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  classrooms,
  course_offerings,
  courses,
  departments,
  enrollments,
  majors,
  offering_professors,
  schedules,
  staff,
  students,
  universities,
  users,
} from '@/db/schema';
import { lmsOk, lmsPaging, requireLmsToken } from '@/lib/lms-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ resource: string }> };

/** ترم‌ها از روی ?term=کد یا current + ?uni=کد دانشگاه */
async function resolveTerms(url: URL): Promise<{ id: number; termCode: string; title: string; isCurrent: number | null; universityId: number | null }[]> {
  const termParam = (url.searchParams.get('term') || '').trim();
  const uniParam = (url.searchParams.get('uni') || '').trim().toUpperCase();
  const conds = [];
  if (uniParam) {
    const [u] = await db.select({ id: universities.id }).from(universities)
      .where(sql`UPPER(${universities.code}) = ${uniParam}`).limit(1);
    if (!u) return [];
    conds.push(eq(academic_terms.universityId, u.id));
  }
  if (termParam && termParam.toLowerCase() !== 'current') {
    conds.push(eq(academic_terms.termCode, termParam));
  } else if (!termParam) {
    // بدون term = همهٔ ترم‌ها (محدود)؛ با current=1 فقط جاری
    if (url.searchParams.get('current') === '1') conds.push(eq(academic_terms.isCurrent, 1));
  } else {
    conds.push(eq(academic_terms.isCurrent, 1));
  }
  const rows = (await db
    .select({
      id: academic_terms.id,
      termCode: academic_terms.termCode,
      title: academic_terms.title,
      isCurrent: academic_terms.isCurrent,
      universityId: academic_terms.universityId,
    })
    .from(academic_terms)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(academic_terms.id))
    .limit(60)) as { id: number; termCode: string; title: string; isCurrent: number | null; universityId: number | null }[];
  return rows;
}

async function uniCodeById(): Promise<Map<number, string>> {
  const rows = await db.select({ id: universities.id, code: universities.code }).from(universities).limit(50);
  return new Map(rows.map(r => [r.id, r.code ?? String(r.id)]));
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await requireLmsToken(req);
  if (denied) return denied;
  const { resource } = await ctx.params;
  const url = new URL(req.url);
  const { limit, offset } = lmsPaging(url);

  // ── ترم‌ها ──
  if (resource === 'terms') {
    const terms = await resolveTerms(url);
    const codes = await uniCodeById();
    const page = terms.slice(offset, offset + limit);
    return lmsOk(
      page.map(t => ({
        id: t.id,
        termCode: t.termCode,
        title: t.title,
        isCurrent: (t.isCurrent ?? 0) === 1,
        universityCode: t.universityId ? (codes.get(t.universityId) ?? null) : null,
      })),
      { limit, offset, count: page.length },
    );
  }

  // ── درس‌ها (ارائه‌های ترم) ──
  if (resource === 'courses') {
    const terms = await resolveTerms(url);
    if (!terms.length) return lmsOk([], { limit, offset, count: 0 });
    const termIds = terms.map(t => t.id);
    const termById = new Map(terms.map(t => [t.id, t]));
    const codes = await uniCodeById();
    const rows = await db
      .select({
        offeringId: course_offerings.id,
        termId: course_offerings.termId,
        groupNumber: course_offerings.groupNumber,
        capacity: course_offerings.capacity,
        enrolledCount: course_offerings.enrolledCount,
        courseCode: courses.code,
        courseTitle: courses.title,
        units: courses.units,
        professorId: course_offerings.professorId,
      })
      .from(course_offerings)
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(and(inArray(course_offerings.termId, termIds), eq(course_offerings.isActive, 1)))
      .orderBy(asc(courses.title), asc(course_offerings.groupNumber))
      .limit(limit)
      .offset(offset);
    const profIds = [...new Set(rows.map(r => r.professorId).filter((n): n is number => typeof n === 'number'))];
    const profBy = new Map<number, { username: string; name: string }>();
    if (profIds.length) {
      const ps = await db
        .select({ id: staff.id, staffCode: staff.staffCode, firstName: users.firstName, lastName: users.lastName })
        .from(staff)
        .innerJoin(users, eq(users.id, staff.userId))
        .where(inArray(staff.id, profIds.slice(0, 5000)));
      for (const p of ps) {
        profBy.set(p.id, {
          username: p.staffCode,
          name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        });
      }
    }
    return lmsOk(
      rows.map(r => {
        const t = termById.get(r.termId)!;
        const prof = r.professorId ? profBy.get(r.professorId) : undefined;
        return {
          idnumber: `${t.termCode}-${r.courseCode}-G${r.groupNumber ?? 1}`,
          shortname: `${r.courseCode}-G${r.groupNumber ?? 1}`,
          fullname: `${r.courseTitle} (گروه ${r.groupNumber ?? 1} — ${t.title})`,
          termCode: t.termCode,
          courseCode: r.courseCode,
          groupNumber: r.groupNumber ?? 1,
          units: r.units ? Number(r.units) : null,
          capacity: r.capacity,
          enrolledCount: r.enrolledCount ?? 0,
          teacherUsername: prof?.username ?? null,
          teacherName: prof?.name ?? null,
          universityCode: t.universityId ? (codes.get(t.universityId) ?? null) : null,
        };
      }),
      { limit, offset, count: rows.length },
    );
  }

  // ── کاربران ──
  if (resource === 'users') {
    const role = (url.searchParams.get('role') || 'both').toLowerCase();
    const terms = url.searchParams.has('term') || url.searchParams.get('current') === '1'
      ? await resolveTerms(url)
      : [];
    const termIds = terms.map(t => t.id);
    const codes = await uniCodeById();
    const out: Record<string, unknown>[] = [];

    if (role === 'student' || role === 'both') {
      let stuIds: number[] | null = null;
      if (termIds.length) {
        const offs = (await db.select({ id: course_offerings.id }).from(course_offerings)
          .where(inArray(course_offerings.termId, termIds)).limit(20000)).map(r => r.id);
        stuIds = [];
        for (let i = 0; i < offs.length; i += 2000) {
          const chunk = offs.slice(i, i + 2000);
          if (!chunk.length) break;
          const es = await db.selectDistinct({ studentId: enrollments.studentId }).from(enrollments)
            .where(inArray(enrollments.offeringId, chunk)).limit(60000);
          for (const e of es) stuIds.push(e.studentId);
        }
      }
      const conds = [eq(users.isActive, 1)];
      if (stuIds) {
        if (!stuIds.length) {
          // هیچ ثبت‌نامی در ترم نیست
        } else {
          const srows = await db
            .select({
              username: students.studentCode,
              idnumber: users.nationalCode,
              firstname: users.firstName,
              lastname: users.lastName,
              email: users.email,
              phone: users.mobile,
              majorId: students.majorId,
              entryYear: students.entryYear,
              status: students.status,
              universityId: students.universityId,
            })
            .from(students)
            .innerJoin(users, eq(users.id, students.userId))
            .where(and(...conds, inArray(students.id, stuIds.slice(0, 60000))))
            .limit(limit)
            .offset(offset);
          const majorsBy = new Map<number, string>();
          const mids = [...new Set(srows.map(r => r.majorId).filter((n): n is number => typeof n === 'number'))];
          if (mids.length) {
            const ms = await db.select({ id: majors.id, name: majors.name }).from(majors)
              .where(inArray(majors.id, mids.slice(0, 5000)));
            for (const m of ms) majorsBy.set(m.id, m.name);
          }
          for (const r of srows) {
            out.push({
              username: r.username, idnumber: r.idnumber, firstname: r.firstname, lastname: r.lastname,
              email: r.email, phone: r.phone, role: 'student', active: r.status === 'ACTIVE',
              major: r.majorId ? (majorsBy.get(r.majorId) ?? null) : null,
              entryYear: r.entryYear ?? null,
              universityCode: r.universityId ? (codes.get(r.universityId) ?? null) : null,
            });
          }
        }
      } else {
        const srows = await db
          .select({
            username: students.studentCode,
            idnumber: users.nationalCode,
            firstname: users.firstName,
            lastname: users.lastName,
            email: users.email,
            phone: users.mobile,
            majorId: students.majorId,
            entryYear: students.entryYear,
            status: students.status,
            universityId: students.universityId,
          })
          .from(students)
          .innerJoin(users, eq(users.id, students.userId))
          .where(and(...conds))
          .limit(limit)
          .offset(offset);
        const majorsBy = new Map<number, string>();
        const mids = [...new Set(srows.map(r => r.majorId).filter((n): n is number => typeof n === 'number'))];
        if (mids.length) {
          const ms = await db.select({ id: majors.id, name: majors.name }).from(majors)
            .where(inArray(majors.id, mids.slice(0, 5000)));
          for (const m of ms) majorsBy.set(m.id, m.name);
        }
        for (const r of srows) {
          out.push({
            username: r.username, idnumber: r.idnumber, firstname: r.firstname, lastname: r.lastname,
            email: r.email, phone: r.phone, role: 'student', active: r.status === 'ACTIVE',
            major: r.majorId ? (majorsBy.get(r.majorId) ?? null) : null,
            entryYear: r.entryYear ?? null,
            universityCode: r.universityId ? (codes.get(r.universityId) ?? null) : null,
          });
        }
      }
    }

    if ((role === 'staff' || role === 'both') && out.length < limit) {
      let staffUserIds: number[] | null = null;
      if (termIds.length) {
        const offs = (await db.select({ id: course_offerings.id }).from(course_offerings)
          .where(inArray(course_offerings.termId, termIds)).limit(20000)).map(r => r.id);
        const set = new Set<number>();
        for (let i = 0; i < offs.length; i += 2000) {
          const chunk = offs.slice(i, i + 2000);
          if (!chunk.length) break;
          const ops = await db.select({ staffId: offering_professors.staffId }).from(offering_professors)
            .where(inArray(offering_professors.offeringId, chunk)).limit(20000);
          for (const o of ops) set.add(o.staffId);
          const mains = await db.select({ professorId: course_offerings.professorId }).from(course_offerings)
            .where(inArray(course_offerings.id, chunk)).limit(20000);
          for (const m of mains) if (m.professorId) set.add(m.professorId);
        }
        const srows2 = set.size
          ? await db.select({ userId: staff.userId }).from(staff).where(inArray(staff.id, [...set].slice(0, 20000))).limit(20000)
          : [];
        staffUserIds = srows2.map(r => r.userId);
      }
      const conds = [eq(users.isActive, 1)];
      const base = db
        .select({
          username: staff.staffCode,
          idnumber: users.nationalCode,
          firstname: users.firstName,
          lastname: users.lastName,
          email: users.email,
          phone: users.mobile,
          departmentId: staff.departmentId,
          universityId: staff.universityId,
        })
        .from(staff)
        .innerJoin(users, eq(users.id, staff.userId));
      const prows = staffUserIds
        ? staffUserIds.length
          ? await base.where(and(...conds, inArray(users.id, staffUserIds.slice(0, 60000)))).limit(limit).offset(offset)
          : []
        : await base.where(and(...conds)).limit(limit).offset(offset);
      const depBy = new Map<number, string>();
      const dids = [...new Set(prows.map(r => r.departmentId).filter((n): n is number => typeof n === 'number'))];
      if (dids.length) {
        const ds = await db.select({ id: departments.id, name: departments.name }).from(departments)
          .where(inArray(departments.id, dids.slice(0, 2000)));
        for (const d of ds) depBy.set(d.id, d.name);
      }
      for (const r of prows) {
        out.push({
          username: r.username, idnumber: r.idnumber, firstname: r.firstname, lastname: r.lastname,
          email: r.email, phone: r.phone, role: 'staff', active: true,
          department: r.departmentId ? (depBy.get(r.departmentId) ?? null) : null,
          universityCode: r.universityId ? (codes.get(r.universityId) ?? null) : null,
        });
      }
    }

    return lmsOk(out.slice(0, limit), { limit, offset, count: Math.min(out.length, limit) });
  }

  // ── ثبت‌نامی‌ها ──
  if (resource === 'enrollments') {
    const terms = await resolveTerms(url);
    if (!terms.length) {
      return NextResponse.json({ ok: false, error: 'term_required', hint: '?term=14051 یا ?current=1' }, { status: 400 });
    }
    const termIds = terms.map(t => t.id);
    const offs = await db
      .select({
        id: course_offerings.id, termId: course_offerings.termId,
        groupNumber: course_offerings.groupNumber, courseCode: courses.code,
        professorId: course_offerings.professorId,
      })
      .from(course_offerings)
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(and(inArray(course_offerings.termId, termIds), eq(course_offerings.isActive, 1)))
      .limit(20000);
    const termById = new Map(terms.map(t => [t.id, t]));
    const courseIdn = (oId: number) => {
      const o = offs.find(x => x.id === oId)!;
      return `${termById.get(o.termId)!.termCode}-${o.courseCode}-G${o.groupNumber ?? 1}`;
    };
    const out: { course: string; username: string; role: string }[] = [];
    for (let i = 0; i < offs.length; i += 1000) {
      const chunk = offs.slice(i, i + 1000);
      const ids = chunk.map(o => o.id);
      const es = await db
        .select({ offeringId: enrollments.offeringId, username: students.studentCode })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .where(inArray(enrollments.offeringId, ids))
        .limit(60000);
      for (const e of es) out.push({ course: courseIdn(e.offeringId), username: e.username, role: 'student' });
      if (out.length >= limit + offset + 50000) break;
    }
    // مدرسان
    const allOffIds = offs.map(o => o.id);
    const seenTeacher = new Set<string>();
    for (let i = 0; i < allOffIds.length; i += 2000) {
      const chunk = allOffIds.slice(i, i + 2000);
      if (!chunk.length) break;
      const ops = await db
        .select({ offeringId: offering_professors.offeringId, username: staff.staffCode })
        .from(offering_professors)
        .innerJoin(staff, eq(staff.id, offering_professors.staffId))
        .where(inArray(offering_professors.offeringId, chunk))
        .limit(20000);
      for (const o of ops) {
        const k = `${o.offeringId}:${o.username}`;
        if (seenTeacher.has(k)) continue;
        seenTeacher.add(k);
        out.push({ course: courseIdn(o.offeringId), username: o.username, role: 'editingteacher' });
      }
    }
    const page = out.slice(offset, offset + limit);
    return lmsOk(page, { limit, offset, count: page.length });
  }

  // ── برنامهٔ هفتگی کلاس‌ها ──
  if (resource === 'schedule') {
    const terms = await resolveTerms(url);
    if (!terms.length) {
      return NextResponse.json({ ok: false, error: 'term_required', hint: '?term=14051 یا ?current=1' }, { status: 400 });
    }
    const termIds = terms.map(t => t.id);
    const termById = new Map(terms.map(t => [t.id, t]));
    const offs = await db
      .select({ id: course_offerings.id, termId: course_offerings.termId, groupNumber: course_offerings.groupNumber, courseCode: courses.code })
      .from(course_offerings)
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(and(inArray(course_offerings.termId, termIds), eq(course_offerings.isActive, 1)))
      .limit(20000);
    const offIds = offs.map(o => o.id);
    const idnBy = new Map(offs.map(o => [o.id, `${termById.get(o.termId)!.termCode}-${o.courseCode}-G${o.groupNumber ?? 1}`]));
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < offIds.length; i += 2000) {
      const chunk = offIds.slice(i, i + 2000);
      if (!chunk.length) break;
      const ss = await db
        .select({
          offeringId: schedules.offeringId,
          dayOfWeek: schedules.dayOfWeek,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
          room: classrooms.name,
          building: classrooms.buildingName,
        })
        .from(schedules)
        .leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
        .where(and(inArray(schedules.offeringId, chunk), eq(schedules.scheduleType, 'CLASS')))
        .limit(60000);
      for (const s of ss) {
        out.push({
          course: idnBy.get(s.offeringId),
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room,
          building: s.building,
        });
      }
      if (out.length >= limit + offset) break;
    }
    const page = out.slice(offset, offset + limit);
    return lmsOk(page, { limit, offset, count: page.length });
  }

  return NextResponse.json({ ok: false, error: 'unknown_resource', hint: 'terms| courses | users | enrollments | schedule — راهنما: GET /api/lms' }, { status: 404 });
}
