import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, course_offerings, courses, enrollments } from '@/db/schema';
import { parseGrade, parseUnits } from '../regulations-engine';
import { chargeTermTuition, getEquivFixedMode } from '../tuition-engine';
import { shouldChargeFixed } from '../tuition-rules';
import { EQUIV_MIN_GRADE, EQUIV_TERM_UNITS } from './constants';

// ══════════════════════════════════════════════════════════════════
//  ثبت دسته‌ای معادل‌سازی — پس از تأیید مدیر گروه و مدیرکل آموزش
//
//  طبق دستور: هر ۲۰ واحد معادل‌سازی‌شده در یک «نیمسال معادل‌سازی» جداگانه
//  ثبت می‌شود که پیش از اولین نیمسال واقعی در کارنامه نمایش داده می‌شود؛
//  وضعیت درس «قبولی در معادل‌سازی پذیرفته شده» است و مشروطیت در این ترم‌ها
//  معنا ندارد. فقط نمرات >= EQUIV_MIN_GRADE ثبت می‌شوند.
// ══════════════════════════════════════════════════════════════════

export type EquivalenceItem = {
  sourceTitle: string;
  sourceGrade: number | string | null;
  sourceUnits: number | string | null;
  targetCourseCode: string;
  headComment?: string | null;
};

export type EquivalenceBatchResult = {
  ok: boolean;
  message: string;
  termsCreated: number;
  chargedTotal?: number;
  registered: { courseTitle: string; termTitle: string; grade: number | null; units: number }[];
  rejected: { sourceTitle: string; reason: string }[];
};

export async function applyEquivalenceBatch(input: {
  studentId: number;
  items: EquivalenceItem[];
  previousUniversity?: string;
  workflowRequestId?: number | null;
}): Promise<EquivalenceBatchResult> {
  const registered: EquivalenceBatchResult['registered'] = [];
  const rejected: EquivalenceBatchResult['rejected'] = [];

  // ۱) فیلتر نمره و تطبیق درس مقصد
  type Ready = { course: typeof courses.$inferSelect; grade: number; units: number; sourceTitle: string };
  const ready: Ready[] = [];
  for (const it of input.items) {
    const grade = parseGrade(it.sourceGrade);
    if (grade === null || grade < EQUIV_MIN_GRADE) {
      rejected.push({ sourceTitle: it.sourceTitle, reason: grade === null ? 'نمره نامعتبر' : `نمرهٔ کمتر از ${EQUIV_MIN_GRADE} (غیرقابل معادل‌سازی)` });
      continue;
    }
    const [course] = await db.select().from(courses).where(eq(courses.code, String(it.targetCourseCode ?? '').trim())).limit(1);
    if (!course) {
      rejected.push({ sourceTitle: it.sourceTitle, reason: `درس مقصد «${it.targetCourseCode}» در چارت آفاق یافت نشد` });
      continue;
    }
    const units = parseUnits(it.sourceUnits) || Number(course.units || 0);
    ready.push({ course, grade, units, sourceTitle: it.sourceTitle });
  }

  if (ready.length === 0) {
    return { ok: false, message: 'هیچ درس واجد شرایطی برای معادل‌سازی یافت نشد.', termsCreated: 0, registered, rejected };
  }

  // ۲) دسته‌بندی هر ۲۰ واحد در یک ترم معادل‌سازی
  const chunks: Ready[][] = [];
  let cur: Ready[] = [];
  let curUnits = 0;
  for (const r of ready) {
    if (curUnits + r.units > EQUIV_TERM_UNITS && cur.length > 0) {
      chunks.push(cur);
      cur = [];
      curUnits = 0;
    }
    cur.push(r);
    curUnits += r.units;
  }
  if (cur.length) chunks.push(cur);

  // ۳) ساخت ترم‌های معادل‌سازی پیش از اولین نیمسال و ثبت دروس
  let termsCreated = 0;
  const equivTermIds: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const termCode = `00EQ${i + 1}`;
    let [term] = await db.select().from(academic_terms).where(eq(academic_terms.termCode, termCode)).limit(1);
    if (!term) {
      const [made] = await db
        .insert(academic_terms)
        .values({
          termCode,
          title: `معادل‌سازی — نوبت ${i + 1}`,
          termType: 'EQUIVALENCE',
          isCurrent: 0,
          isSummer: 0,
          isEnrollmentOpen: 0,
          startDate: new Date(2000, 0, 1),
          endDate: new Date(2000, 5, 30),
        })
        .onConflictDoNothing()
        .returning();
      term = made ?? (await db.select().from(academic_terms).where(eq(academic_terms.termCode, termCode)).limit(1))[0];
    }
    if (!term) continue;
    termsCreated++;
    equivTermIds.push(term.id);

    for (const r of chunks[i]) {
      let [offering] = await db
        .select()
        .from(course_offerings)
        .where(and(eq(course_offerings.courseId, r.course.id), eq(course_offerings.termId, term.id), eq(course_offerings.offeringType, 'TRANSFER')))
        .limit(1);
      if (!offering) {
        const [made] = await db
          .insert(course_offerings)
          .values({ termId: term.id, courseId: r.course.id, groupNumber: 900, capacity: 500, enrolledCount: 0, offeringType: 'TRANSFER', isActive: 1 })
          .onConflictDoNothing()
          .returning();
        offering = made ?? (await db.select().from(course_offerings).where(and(eq(course_offerings.courseId, r.course.id), eq(course_offerings.termId, term.id), eq(course_offerings.offeringType, 'TRANSFER'))).limit(1))[0];
      }
      if (!offering) continue;

      const [existing] = await db.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.studentId, input.studentId), eq(enrollments.offeringId, offering.id))).limit(1);
      const payload = {
        status: 'EQUIV_PASSED',
        workflowRequestId: input.workflowRequestId ?? null,
        gradeValue: String(r.grade),
        gradeStatus: 'FINALIZED',
      };
      if (existing) {
        await db.update(enrollments).set(payload).where(eq(enrollments.id, existing.id));
      } else {
        await db.insert(enrollments).values({ studentId: input.studentId, offeringId: offering.id, isDirectedReading: 0, ...payload });
      }
      registered.push({ courseTitle: r.course.title, termTitle: term.title, grade: r.grade, units: r.units });
    }
  }

  // ۴) شارژ شهریهٔ معادل‌سازی بر اساس نوع ترم و نوع گذراندن درس (موتور شهریه)
  //
  // شهریهٔ ثابت مطابق سیاست EQUIV_FIXED_TUITION_MODE اعمال می‌شود (قابل تنظیم از
  // پنل مدیر، بدون مقدار سخت‌کد). چون دروس معادل‌سازی هر ۲۰ واحد در یک نیمسال
  // جدا ثبت می‌شوند، بدون این سیاست شهریهٔ ثابت به ازای هر نیمسال تکرار می‌شد
  // (مثلاً ۴۵ واحد = ۳ نیمسال = ۳ برابر شهریهٔ ثابت).
  const fixedMode = await getEquivFixedMode();
  let chargedTotal = 0;
  for (let i = 0; i < equivTermIds.length; i++) {
    const tid = equivTermIds[i];
    try {
      const { charged } = await chargeTermTuition(input.studentId, tid, {
        includeFixed: shouldChargeFixed(fixedMode, i === 0),
      });
      chargedTotal += charged;
    } catch (e) {
      // نبود قاعدهٔ شهریه نباید معادل‌سازی را شکست دهد؛ فقط ثبت نمی‌شود
      console.error('equivalence tuition charge failed', { studentId: input.studentId, termId: tid, e });
    }
  }

  return {
    ok: true,
    message: `${registered.length} درس معادل‌سازی‌شده در ${termsCreated} نیمسال معادل‌سازی (هر ${EQUIV_TERM_UNITS} واحد) پیش از اولین ترم ثبت شد.` +
      (chargedTotal > 0 ? ` شهریهٔ معادل‌سازی: ${chargedTotal.toLocaleString('fa-IR')} ریال.` : ''),
    termsCreated,
    chargedTotal,
    registered,
    rejected,
  };
}
