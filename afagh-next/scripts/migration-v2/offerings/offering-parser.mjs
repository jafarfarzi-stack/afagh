/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Course Offering Parser
 *  — تجزیه و اعتبارسنجی ردیف‌های ارائه‌های درسی (course_offerings)
 *  — پشتیبانی از نامک‌های متنوع اکسل/متن و داده‌های پایگاه داده سما
 *  — پالایش کد درس، ترم، گروه، ظرفیت، استاد، جنسیت و برنامه کلاسی
 * ══════════════════════════════════════════════════════════════════════
 */

import { normalizeTerm } from '../terms/term-normalizer.mjs';
import {
  cleanPersianDigits,
  parseScheduleString,
  parseTimeString,
} from './schedule-parser.mjs';

/**
 * نامک‌های پذیرفته‌شده برای هر فیلد در فایل‌های ورودی
 */
export const OFFERING_ALIASES = {
  termCode: ['termCode', 'کد ترم', 'ترم', 'نیمسال', 'دوره', 'term', 'term_code', 'semester', 'TermCode'],
  courseCode: ['courseCode', 'کد درس', 'درس', 'شماره درس', 'کددرس', 'course_code', 'lesson_code', 'code', 'LessonCode'],
  courseTitle: ['courseTitle', 'نام درس', 'عنوان درس', 'نام', 'course_title', 'lesson_name', 'title', 'LessonName'],
  groupNumber: ['groupNumber', 'گروه', 'مشخصه', 'کد گروه', 'گروه درس', 'شماره گروه', 'group', 'group_number', 'section', 'LessonGroup'],
  capacity: ['capacity', 'ظرفیت', 'ظرفیت کلاس', 'cap'],
  professorCode: ['professorCode', 'کد استاد', 'کد مدرس', 'شماره استادی', 'شماره پرسنلی', 'professor_code', 'staff_code', 'don_code', 'DonCode'],
  professorName: ['professorName', 'نام استاد', 'استاد', 'مدرس', 'نام مدرس', 'professor_name', 'instructor'],
  schedule: ['schedule', 'زمان کلاس', 'برنامه هفتگی', 'روز و ساعت', 'ساعت تشکیل', 'برنامه کلاس', 'weekly_schedule'],
  classroom: ['classroom', 'classroomName', 'محل تشکیل', 'کلاس', 'اتاق', 'شماره کلاس', 'نام کلاس', 'room', 'room_name'],
  genderRestriction: ['genderRestriction', 'جنسیت', 'محدودیت جنسیت', 'تفکیک جنسیتی', 'gender', 'gender_restriction'],
  offeringType: ['offeringType', 'نوع ارائه', 'نحوه ارائه', 'نوع گروه', 'offering_type'],
  examDate: ['examDate', 'تاریخ امتحان', 'تاریخ آزمون', 'امتحان', 'exam_date'],
  examTime: ['examTime', 'ساعت امتحان', 'ساعت آزمون', 'زمان امتحان', 'exam_time'],
};

/**
 * تبدیل نگاشت‌های جنسیت فارسی به مقادیر استاندارد
 * @param {string} val 
 * @returns {'MIXED'|'MALE'|'FEMALE'}
 */
export function normalizeGenderRestriction(val) {
  if (!val) return 'MIXED';
  const s = cleanPersianDigits(val).trim().toLowerCase();
  if (/^(پسر|برادران|مرد|مذکر|male|m)$/.test(s) || s.includes('پسر') || s.includes('برادر')) {
    return 'MALE';
  }
  if (/^(دختر|خواهران|زن|مونث|female|f)$/.test(s) || s.includes('دختر') || s.includes('خواهر')) {
    return 'FEMALE';
  }
  return 'MIXED';
}

/**
 * تبدیل نوع ارائه به مقادیر استاندارد
 * @param {string} val 
 * @returns {string}
 */
export function normalizeOfferingType(val) {
  if (!val) return 'NORMAL';
  const s = cleanPersianDigits(val).trim().toLowerCase();
  if (s.includes('تابستان') || s.includes('summer')) return 'SUMMER';
  if (s.includes('انتقال') || s.includes('transfer') || s.includes('معادل')) return 'TRANSFER';
  if (s.includes('مجازی') || s.includes('الکترونیک') || s.includes('virtual')) return 'VIRTUAL';
  if (s.includes('آزمون') || s.includes('فقط امتحان') || s.includes('exam')) return 'EXAM_ONLY';
  return 'NORMAL';
}

/**
 * خواندن امن فیلد از ورودی چه به صورت تابع خواننده و چه شیء ساده
 * @param {Function|Record<string, any>} reader 
 * @param {string[]} aliases 
 * @returns {string}
 */
function readField(reader, aliases) {
  if (typeof reader === 'function') {
    return reader(aliases) || '';
  }
  if (reader && typeof reader === 'object') {
    for (const a of aliases) {
      if (reader[a] !== undefined && reader[a] !== null) {
        return String(reader[a]).trim();
      }
    }
  }
  return '';
}

/**
 * تجزیه و اعتبارسنجی ردیف ارائه درس
 * @param {Function|Record<string, any>} source 
 * @returns {{
 *   ok: true,
 *   row: {
 *     termCode: string,
 *     canonicalTermCode: string,
 *     courseCode: string,
 *     courseTitle: string | null,
 *     groupNumber: number,
 *     capacity: number,
 *     professorCode: string | null,
 *     professorName: string | null,
 *     classroomName: string | null,
 *     genderRestriction: 'MIXED'|'MALE'|'FEMALE',
 *     offeringType: string,
 *     schedules: Array<any>,
 *     examDate: string | null,
 *     examTime: string | null,
 *   },
 *   warnings: string[],
 * } | {
 *   ok: false,
 *   error: string,
 *   warnings: string[],
 * }}
 */
export function parseOfferingRow(source) {
  const warnings = [];

  const rawTerm = readField(source, OFFERING_ALIASES.termCode);
  if (!rawTerm) {
    return { ok: false, error: 'کد ترم الزامی است.', warnings };
  }

  let canonicalTermCode = '';
  try {
    const normT = normalizeTerm(rawTerm);
    canonicalTermCode = normT.canonicalCode;
  } catch (err) {
    return { ok: false, error: `کد ترم «${rawTerm}» نامعتبر است: ${err.message}`, warnings };
  }

  const rawCourseCode = readField(source, OFFERING_ALIASES.courseCode);
  const cleanCourseCode = cleanPersianDigits(rawCourseCode).replace(/\s+/g, '').trim();
  if (!cleanCourseCode) {
    return { ok: false, error: 'کد درس الزامی است.', warnings };
  }

  const rawGroup = readField(source, OFFERING_ALIASES.groupNumber);
  let groupNumber = 1;
  if (rawGroup) {
    const parsedG = parseInt(cleanPersianDigits(rawGroup), 10);
    if (!isNaN(parsedG) && parsedG > 0) {
      groupNumber = parsedG;
    } else {
      warnings.push(`شماره گروه «${rawGroup}» نامعتبر است؛ پیش‌فرض ۱ در نظر گرفته شد.`);
    }
  }

  const rawCap = readField(source, OFFERING_ALIASES.capacity);
  let capacity = 40; // ظرفیت پیش‌فرض متعارف
  if (rawCap) {
    const parsedCap = parseInt(cleanPersianDigits(rawCap), 10);
    if (!isNaN(parsedCap) && parsedCap > 0 && parsedCap <= 500) {
      capacity = parsedCap;
    } else {
      warnings.push(`ظرفیت «${rawCap}» خارج از محدوده مجاز (۱..۵۰۰) است؛ مقدار پیش‌فرض ۴۰ استفاده شد.`);
    }
  }

  const rawProfCode = readField(source, OFFERING_ALIASES.professorCode);
  const cleanProfCode = cleanPersianDigits(rawProfCode).trim();
  const professorCode = cleanProfCode && cleanProfCode !== '0' && cleanProfCode !== '-1' ? cleanProfCode : null;

  const professorName = readField(source, OFFERING_ALIASES.professorName) || null;
  const courseTitle = readField(source, OFFERING_ALIASES.courseTitle) || null;
  const classroomName = readField(source, OFFERING_ALIASES.classroom) || null;

  const genderRestriction = normalizeGenderRestriction(
    readField(source, OFFERING_ALIASES.genderRestriction)
  );

  let offeringType = normalizeOfferingType(
    readField(source, OFFERING_ALIASES.offeringType)
  );

  // اگر ترم تابستان باشد و نوع ارائه مشخص نشده باشد، به تابستان تنظیم شود
  if (canonicalTermCode.endsWith('3') && offeringType === 'NORMAL') {
    offeringType = 'SUMMER';
  }

  // تجزیه زمان‌بندی هفتگی
  let schedules = [];
  if (Array.isArray(source.schedules)) {
    schedules = source.schedules;
  } else {
    const rawSchedule = readField(source, OFFERING_ALIASES.schedule);
    if (rawSchedule) {
      schedules = parseScheduleString(rawSchedule);
      if (schedules.length === 0) {
        warnings.push(`متن برنامه کلاسی «${rawSchedule}» قابل تجزیه به روز و ساعت نبود.`);
      }
    }
  }

  // تاریخ و زمان امتحان
  const rawExamDate = cleanPersianDigits(readField(source, OFFERING_ALIASES.examDate)).trim();
  let examDate = null;
  if (rawExamDate) {
    const normDate = rawExamDate.replace(/[.\-]/g, '/');
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(normDate)) {
      examDate = normDate;
    } else {
      warnings.push(`تاریخ آزمون «${rawExamDate}» معتبر نیست و نادیده گرفته شد.`);
    }
  }

  const rawExamTime = readField(source, OFFERING_ALIASES.examTime);
  const examTime = parseTimeString(rawExamTime);

  return {
    ok: true,
    row: {
      termCode: rawTerm,
      canonicalTermCode,
      courseCode: cleanCourseCode,
      courseTitle,
      groupNumber,
      capacity,
      professorCode,
      professorName,
      classroomName,
      genderRestriction,
      offeringType,
      schedules,
      examDate,
      examTime,
    },
    warnings,
  };
}
