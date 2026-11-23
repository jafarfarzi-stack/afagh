/**
 * ══════════════════════════════════════════════════════════════════════
 *  کاتالوگ آموزشی — منابع و ستون‌های قابل گزارش‌گیریِ بخش آموزش
 * ══════════════════════════════════════════════════════════════════════
 *  همان قواعد کاتالوگ مالی: هر عبارت SQL اینجا **ثابت و کدی** است؛ کاربر
 *  فقط انتخاب می‌کند (سطح حملهٔ تزریق صفر).
 *
 *  سه منبع:
 *   ۱) edu-students      — پروندهٔ دانشجویان (یک ردیف به‌ازای هر دانشجو)
 *   ۲) edu-professors    — پروندهٔ اساتید (یک ردیف به‌ازای هر استاد)
 *   ۳) edu-term-planning — برنامه‌ریزی ترم (یک ردیف به‌ازای هر کلاس/ارائه)
 *
 *  📌 قراردادهای اسکیما (src/db/schema.ts):
 *   - dayOfWeek: 0=شنبه … 6=جمعه (همان DAY_FA در r-edu-schedule.ts)
 *   - students.status واژگانش در STUDENT_STATUS_FA (student-labels.ts) است
 *   - استادِ کلاس در offering_professors است (چند‌به‌چند)؛ co."professorId"
 *     ستونِ قدیمیِ تک‌مقداری است و اینجا استفاده نمی‌شود
 *   - برنامهٔ هفتگی و امتحان هر ارائه در schedules است
 *     (scheduleType='CLASS' / 'EXAM') — با LATERAL جمع می‌شوند تا «یک ردیف
 *     به‌ازای هر کلاس» برقرار بماند و ردیف تکثیر نشود.
 */

import type { ReportSource, ReportField } from './types';

// ── واژگان ثابت (هم‌سو با student-labels.ts و engineهای برنامه‌ریزی) ──

const STUDENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ACTIVE', label: 'در حال تحصیل' },
  { value: 'GRADUATED', label: 'فارغ‌التحصیل' },
  { value: 'EXPELLED', label: 'اخراج' },
  { value: 'WITHDRAWN', label: 'انصراف' },
  { value: 'SUSPENDED', label: 'محروم از تحصیل' },
  { value: 'TRANSFERRED', label: 'انتقالی / میهمان' },
  { value: 'NO_SHOW', label: 'عدم مراجعه' },
  { value: 'DECEASED', label: 'فوت' },
  { value: 'UNKNOWN', label: 'نامشخص' },
];

const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'MALE', label: 'مرد' },
  { value: 'FEMALE', label: 'زن' },
];

const OFFERING_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'NORMAL', label: 'عادی' },
  { value: 'TRANSFER', label: 'نقل از ترم قبل' },
  { value: 'DIRECTED_READING', label: 'مطالعهٔ آزاد' },
];

const OFFERING_SCOPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'DEPARTMENTAL', label: 'گروهی' },
  { value: 'GENERAL_SERVICE', label: 'خدمات عمومی' },
];

/** عبارت فارسیِ روز هفته — عیناً همان قرارداد r-edu-schedule.ts */
const DAY_FA_EXPR = `CASE sc."dayOfWeek" WHEN 0 THEN 'شنبه' WHEN 1 THEN 'یکشنبه' WHEN 2 THEN 'دوشنبه' WHEN 3 THEN 'سه‌شنبه' WHEN 4 THEN 'چهارشنبه' WHEN 5 THEN 'پنج‌شنبه' WHEN 6 THEN 'جمعه' ELSE COALESCE('روز ' || sc."dayOfWeek"::text, '—') END`;

/** اساتیدِ یک ارائه — جمع‌شده در یک رشته؛ کلاس چنداستادی را از دست نمی‌دهد */
const PROFESSORS_JOIN = `LEFT JOIN LATERAL (
      SELECT string_agg(u2."firstName" || ' ' || u2."lastName", ' ، '
        ORDER BY u2."lastName", u2."firstName") AS profs
      FROM offering_professors op
      JOIN staff st2 ON st2.id = op."staffId"
      JOIN users u2 ON u2.id = st2."userId"
      WHERE op."offeringId" = co.id
    ) pp ON TRUE`;

/** برنامهٔ هفتگی کلاس (CLASS) + تاریخ امتحان (EXAM) — هر کدام یک رشته/یک مقدار */
const SCHEDULE_JOINS = `LEFT JOIN LATERAL (
      SELECT string_agg(
        ${DAY_FA_EXPR}
        || ' ' || to_char(sc."startTime", 'HH24:MI') || '-' || to_char(sc."endTime", 'HH24:MI')
        || COALESCE(' — کلاس ' || cr.name, ''),
        ' | ' ORDER BY sc."dayOfWeek" NULLS LAST, sc."startTime", sc."endTime"
      ) AS "classTimes"
      FROM schedules sc
      LEFT JOIN classrooms cr ON cr.id = sc."roomId"
      WHERE sc."offeringId" = co.id AND sc."scheduleType" = 'CLASS'
    ) ct ON TRUE
    LEFT JOIN LATERAL (
      SELECT MIN(sc."examDate") AS "examDate"
      FROM schedules sc
      WHERE sc."offeringId" = co.id AND sc."scheduleType" = 'EXAM'
    ) ex ON TRUE`;

// ══════════════════════════════════════════════════════════════════════
// ۱) پروندهٔ دانشجویان
// ══════════════════════════════════════════════════════════════════════
const STUDENT_FIELDS: ReportField[] = [
  { key: 'studentCode', title: 'شمارهٔ دانشجویی', sql: `s."studentCode"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'studentName', title: 'نام دانشجو', sql: `u."firstName" || ' ' || u."lastName"`, type: 'text', filterable: true, ops: ['like'] },
  { key: 'nationalCode', title: 'کد ملی', sql: `u."nationalCode"`, type: 'text', filterable: true, ops: ['eq', 'like'] },
  { key: 'gender', title: 'جنسیت', sql: `CASE WHEN u.gender = 'MALE' THEN 'مرد' WHEN u.gender = 'FEMALE' THEN 'زن' ELSE COALESCE(u.gender, '—') END`, type: 'text', filterable: true, ops: ['eq'], options: GENDER_OPTIONS, groupable: true },
  { key: 'mobile', title: 'موبایل', sql: `u.mobile`, type: 'text', filterable: true, ops: ['eq', 'like'] },
  { key: 'fatherName', title: 'نام پدر', sql: `u."fatherName"`, type: 'text', filterable: true, ops: ['like'] },
  { key: 'faculty', title: 'دانشکده', sql: `fc.name`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'department', title: 'گروه آموزشی', sql: `dp.name`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'major', title: 'رشته', sql: `m.name`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'degree', title: 'مقطع', sql: `d.title`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'entryYear', title: 'سال ورود', sql: `s."entryYear"`, type: 'number', format: 'YEAR', filterable: true, ops: ['eq', 'gte', 'lte', 'between'], groupable: true },
  { key: 'entryTerm', title: 'نیمسال ورود', sql: `CASE WHEN s."entryTerm" = 2 THEN 'بهمن‌ماه' ELSE 'مهرماه' END`, type: 'text', filterable: true, ops: ['eq'], options: [{ value: 'مهرماه', label: 'مهرماه' }, { value: 'بهمن‌ماه', label: 'بهمن‌ماه' }], groupable: true },
  { key: 'status', title: 'وضعیت', sql: `CASE s.status WHEN 'ACTIVE' THEN 'در حال تحصیل' WHEN 'GRADUATED' THEN 'فارغ‌التحصیل' WHEN 'EXPELLED' THEN 'اخراج' WHEN 'WITHDRAWN' THEN 'انصراف' WHEN 'SUSPENDED' THEN 'محروم از تحصیل' WHEN 'TRANSFERRED' THEN 'انتقالی / میهمان' WHEN 'NO_SHOW' THEN 'عدم مراجعه' WHEN 'DECEASED' THEN 'فوت' WHEN 'UNKNOWN' THEN 'نامشخص' ELSE COALESCE(s.status, 'نامشخص') END`, type: 'text', filterable: true, ops: ['eq', 'in'], options: STUDENT_STATUS_OPTIONS, groupable: true },
  { key: 'currentTermNo', title: 'ترم جاری', sql: `s."currentTermNo"`, type: 'number', format: 'NUMBER', filterable: true, ops: ['eq', 'gte', 'lte'], groupable: true },
  { key: 'totalAverage', title: 'معدل کل', sql: `s."totalAverage"`, type: 'number', format: 'NUMBER', filterable: true, ops: ['gte', 'lte', 'between'], agg: ['avg', 'min', 'max'] },
  { key: 'totalTakenUnits', title: 'واحد اخذشده', sql: `s."totalTakenUnits"`, type: 'number', format: 'NUMBER', filterable: true, ops: ['gte', 'lte'], agg: ['sum', 'avg'] },
  { key: 'totalPassedUnits', title: 'واحد گذرانده', sql: `s."totalPassedUnits"`, type: 'number', format: 'NUMBER', filterable: true, ops: ['gte', 'lte'], agg: ['sum', 'avg'] },
  { key: 'totalFailedUnits', title: 'واحد ناتمام', sql: `s."totalFailedUnits"`, type: 'number', format: 'NUMBER', filterable: true, ops: ['gte', 'lte'], agg: ['sum', 'avg'] },
  { key: 'unitsRemaining', title: 'واحد مانده', sql: `s."unitsRemaining"`, type: 'number', format: 'NUMBER', filterable: true, ops: ['gte', 'lte'], agg: ['sum', 'avg'] },
  { key: 'tuitionType', title: 'نوع شهریه', sql: `s."tuitionType"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'studyingMode', title: 'شیوهٔ تحصیل', sql: `s."studyingMode"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'studyType', title: 'نوع تحصیل', sql: `s."studyType"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'transferGuestStatus', title: 'وضعیت انتقال/میهمانی', sql: `s."transferGuestStatus"`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'militaryStatus', title: 'نظام وظیفه', sql: `s."militaryStatus"`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'documentStatus', title: 'وضعیت مدارک', sql: `s."documentStatus"`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'scholarshipType', title: 'بورسیه', sql: `s."scholarshipType"`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'dormName', title: 'خوابگاه', sql: `s."dormName"`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'maritalStatus', title: 'وضعیت تأهل', sql: `s."maritalStatus"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'guardianPhone', title: 'تلفن ولی', sql: `s."guardianPhone"`, type: 'text', filterable: true, ops: ['eq', 'like'] },
];

// ══════════════════════════════════════════════════════════════════════
// ۲) پروندهٔ اساتید
// ══════════════════════════════════════════════════════════════════════
const PROFESSOR_FIELDS: ReportField[] = [
  { key: 'staffCode', title: 'کد استاد', sql: `st."staffCode"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'professorName', title: 'نام استاد', sql: `u."firstName" || ' ' || u."lastName"`, type: 'text', filterable: true, ops: ['like'] },
  { key: 'title', title: 'لقب', sql: `st.title`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'nationalCode', title: 'کد ملی', sql: `u."nationalCode"`, type: 'text', filterable: true, ops: ['eq', 'like'] },
  { key: 'mobile', title: 'موبایل', sql: `u.mobile`, type: 'text', filterable: true, ops: ['eq', 'like'] },
  { key: 'phone', title: 'تلفن ثابت', sql: `st.phone`, type: 'text', filterable: true, ops: ['eq', 'like'] },
  { key: 'email', title: 'ایمیل', sql: `u.email`, type: 'text', filterable: true, ops: ['like'] },
  { key: 'faculty', title: 'دانشکده', sql: `fc.name`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'department', title: 'گروه آموزشی', sql: `dp.name`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'academicRank', title: 'مرتبهٔ علمی', sql: `st."academicRank"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'academicBase', title: 'پایهٔ استادی', sql: `st."academicBase"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'degree', title: 'مدرک', sql: `st.degree`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'staffType', title: 'نوع همکاری', sql: `st."staffType"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'cooperationType', title: 'طریقهٔ همکاری', sql: `st."cooperationType"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'employmentType', title: 'نوع استخدام', sql: `st."employmentType"`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'personnelNo', title: 'شمارهٔ مستخدم', sql: `st."personnelNo"`, type: 'text', filterable: true, ops: ['eq', 'like'] },
  { key: 'hireDate', title: 'تاریخ استخدام', sql: `st."hireDate"`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'fieldMain', title: 'رشته', sql: `st."fieldMain"`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'fieldOfStudy', title: 'رشته و گرایش', sql: `st."fieldOfStudy"`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'lastDegreeUniversity', title: 'دانشگاه آخرین مدرک', sql: `st."lastDegreeUniversity"`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'isActive', title: 'وضعیت', sql: `CASE WHEN COALESCE(st."isActive", 1) = 1 THEN 'فعال' ELSE 'غیرفعال' END`, type: 'text', filterable: true, ops: ['eq'], options: [{ value: 'فعال', label: 'فعال' }, { value: 'غیرفعال', label: 'غیرفعال' }], groupable: true },
  {
    key: 'activeOfferings', title: 'تعداد کلاس‌های فعال', sql: `COALESCE(oc.offerings, 0)::int`, type: 'number', format: 'NUMBER',
    agg: ['sum', 'avg', 'min', 'max'], hint: 'کلاس‌های فعال در همهٔ ترم‌ها (از offering_professors)',
  },
];

// ══════════════════════════════════════════════════════════════════════
// ۳) برنامه‌ریزی ترم — یک ردیف به‌ازای هر کلاس/ارائه
// ══════════════════════════════════════════════════════════════════════
const PLANNING_FIELDS: ReportField[] = [
  { key: 'termCode', title: 'نیمسال', sql: `t."termCode"`, type: 'text', filterable: true, ops: ['eq', 'in'], ref: 'terms', groupable: true },
  { key: 'courseCode', title: 'کد درس', sql: `c.code`, type: 'text', filterable: true, ops: ['eq', 'like'], groupable: true },
  { key: 'courseTitle', title: 'عنوان درس', sql: `c.title`, type: 'text', filterable: true, ops: ['like'] },
  { key: 'units', title: 'واحد', sql: `c.units::float8`, type: 'number', format: 'NUMBER', filterable: true, ops: ['eq', 'gte', 'lte'], agg: ['sum', 'avg'] },
  { key: 'groupNumber', title: 'گروه', sql: `co."groupNumber"`, type: 'number', format: 'NUMBER', filterable: true, ops: ['eq'], groupable: true },
  { key: 'degree', title: 'مقطع درس', sql: `cd.title`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'department', title: 'گروه سازنده', sql: `dp.name`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'targetDegree', title: 'مقطع هدف', sql: `tdl.title`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'targetMajor', title: 'رشتهٔ هدف', sql: `tm.name`, type: 'text', filterable: true, ops: ['like'], groupable: true },
  { key: 'entryYearStart', title: 'ورودی از', sql: `co."entryYearStart"`, type: 'number', format: 'YEAR', filterable: true, ops: ['eq', 'gte', 'lte'], groupable: true },
  { key: 'entryYearEnd', title: 'ورودی تا', sql: `co."entryYearEnd"`, type: 'number', format: 'YEAR', filterable: true, ops: ['eq', 'gte', 'lte'], groupable: true },
  { key: 'professor', title: 'استاد', sql: `pp.profs`, type: 'text', filterable: true, ops: ['like'] },
  { key: 'capacity', title: 'ظرفیت', sql: `co."capacity"`, type: 'number', format: 'NUMBER', filterable: true, ops: ['eq', 'gte', 'lte'], agg: ['sum', 'avg'] },
  { key: 'enrolled', title: 'ثبت‌نام‌شده', sql: `co."enrolledCount"`, type: 'number', format: 'NUMBER', filterable: true, ops: ['eq', 'gte', 'lte'], agg: ['sum', 'avg'] },
  { key: 'remaining', title: 'ظرفیت مانده', sql: `(co."capacity" - co."enrolledCount")::int`, type: 'number', format: 'NUMBER', filterable: true, ops: ['gte', 'lte'], agg: ['sum', 'avg'] },
  { key: 'fillRate', title: 'درصد پر شدن', sql: `ROUND(100.0 * co."enrolledCount" / NULLIF(co."capacity", 0), 1)`, type: 'number', format: 'NUMBER', filterable: true, ops: ['gte', 'lte'], agg: ['avg', 'min', 'max'], hint: 'ثبت‌نام‌شده ÷ ظرفیت' },
  { key: 'waitlistCapacity', title: 'ظرفیت نوبت', sql: `COALESCE(co."waitlistCapacity", 0)`, type: 'number', format: 'NUMBER', filterable: true, ops: ['gte', 'lte'], agg: ['sum'] },
  { key: 'classTimes', title: 'برنامهٔ هفتگی', sql: `ct."classTimes"`, type: 'text', filterable: true, ops: ['like'], hint: 'روز، ساعت و کلاس — جمع هر کلاس در یک ردیف' },
  { key: 'examDate', title: 'تاریخ امتحان', sql: `ex."examDate"`, type: 'date', format: 'DATE', filterable: true, ops: ['eq', 'gte', 'lte', 'between'] },
  { key: 'offeringType', title: 'نوع ارائه', sql: `CASE co."offeringType" WHEN 'NORMAL' THEN 'عادی' WHEN 'TRANSFER' THEN 'نقل از ترم قبل' WHEN 'DIRECTED_READING' THEN 'مطالعهٔ آزاد' ELSE COALESCE(co."offeringType", 'عادی') END`, type: 'text', filterable: true, ops: ['eq'], options: OFFERING_TYPE_OPTIONS, groupable: true },
  { key: 'offeringScope', title: 'دامنهٔ ارائه', sql: `CASE WHEN c."offeringScope" = 'GENERAL_SERVICE' THEN 'خدمات عمومی' ELSE 'گروهی' END`, type: 'text', filterable: true, ops: ['eq'], options: OFFERING_SCOPE_OPTIONS, groupable: true },
  { key: 'genderRestriction', title: 'محدودیت جنسیت', sql: `CASE WHEN co."genderRestriction" = 'MALE' THEN 'مرد' WHEN co."genderRestriction" = 'FEMALE' THEN 'زن' ELSE COALESCE(co."genderRestriction", '—') END`, type: 'text', filterable: true, ops: ['eq'], options: GENDER_OPTIONS, groupable: true },
  { key: 'isSharedService', title: 'استخر مشترک', sql: `CASE WHEN COALESCE(co."isSharedService", 0) = 1 THEN 'بله' ELSE 'خیر' END`, type: 'text', filterable: true, ops: ['eq'], options: [{ value: 'بله', label: 'بله' }, { value: 'خیر', label: 'خیر' }], groupable: true },
  { key: 'isActive', title: 'وضعیت کلاس', sql: `CASE WHEN co."isActive" = 1 THEN 'فعال' ELSE 'غیرفعال (تاریخچه)' END`, type: 'text', filterable: true, ops: ['eq'], options: [{ value: 'فعال', label: 'فعال' }, { value: 'غیرفعال (تاریخچه)', label: 'غیرفعال (تاریخچه)' }], groupable: true },
];

/** تعداد کلاس‌های فعالِ هر استاد — یک ردیف، بدون تکثیر */
const PROFESSOR_OFFERING_COUNT_JOIN = `LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS offerings
      FROM offering_professors op
      JOIN course_offerings co2 ON co2.id = op."offeringId" AND co2."isActive" = 1
      WHERE op."staffId" = st.id
    ) oc ON TRUE`;

export const EDU_SOURCES: ReportSource[] = [
  {
    key: 'edu-students',
    title: 'پروندهٔ دانشجویان',
    icon: '🎓',
    description: 'یک ردیف به‌ازای هر دانشجو: مشخصات، وضعیت، رشته و سوابق تحصیلی',
    baseFrom: `FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN faculties fc ON fc.id = m."facultyId"
      LEFT JOIN departments dp ON dp.id = m."departmentId"
      LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"`,
    universityColumn: 's."universityId"',
    roles: ['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'],
    fields: STUDENT_FIELDS,
    maxRows: 20000,
  },
  {
    key: 'edu-professors',
    title: 'پروندهٔ اساتید',
    icon: '👨‍🏫',
    description: 'یک ردیف به‌ازای هر استاد: مرتبه، نوع همکاری، گروه و تعداد کلاس‌های فعال',
    baseFrom: `FROM staff st
      JOIN users u ON u.id = st."userId"
      LEFT JOIN departments dp ON dp.id = st."departmentId"
      LEFT JOIN faculties fc ON fc.id = st."facultyId"
      ${PROFESSOR_OFFERING_COUNT_JOIN}`,
    // 🔒 ستونِ دانشگاهِ staff قابل NULL است (دادهٔ کهنه) — الگوی «یا NULL»
    universityColumn: 'st."universityId"',
    universityNullable: true,
    roles: ['ADMIN', 'EDU_EXPERT'],
    fields: PROFESSOR_FIELDS,
    maxRows: 10000,
  },
  {
    key: 'edu-term-planning',
    title: 'برنامه‌ریزی ترم (کلاس‌ها)',
    icon: '🗓️',
    description: 'یک ردیف به‌ازای هر کلاس: درس، استاد، ظرفیت، برنامهٔ هفتگی و تاریخ امتحان',
    baseFrom: `FROM course_offerings co
      JOIN academic_terms t ON t.id = co."termId"
      JOIN courses c ON c.id = co."courseId"
      LEFT JOIN degree_level_configs cd ON cd.id = c."degreeLevelId"
      LEFT JOIN departments dp ON dp.id = c."departmentId"
      LEFT JOIN degree_level_configs tdl ON tdl.id = co."targetDegreeLevelId"
      LEFT JOIN majors tm ON tm.id = co."targetMajorId"
      ${PROFESSORS_JOIN}
      ${SCHEDULE_JOINS}`,
    // 🔒 ستونِ دانشگاهِ course_offerings قابل NULL است (دادهٔ کهنه) — الگوی «یا NULL»
    universityColumn: 'co."universityId"',
    universityNullable: true,
    roles: ['ADMIN', 'EDU_EXPERT'],
    fields: PLANNING_FIELDS,
    maxRows: 20000,
  },
];
