import 'server-only';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { loadSahamValueMaps, mapSahamValue, loadSahamInstituteCodes, pickSahamCode, type SahamInstituteCode } from './saham-maps';

/**
 * ══════════════════════════════════════════════════════════════════════
 *  استخراج ردیف‌های گزارش سهام برای یک دانشگاه
 *  سرستون‌ها دقیقاً مطابق 1-Student.xlsx رسمی سهام است (۵۲ ستون).
 * ══════════════════════════════════════════════════════════════════════
 */

/** سرستون‌های رسمی فایل دانشجویان سهام — ترتیب ستون باید عیناً همین باشد */
export const SAHAM_STUDENT_HEADERS = [
  'نام موسسه آموزش عالی',
  'کد دانشکده / مرکز / واحد',
  'نام دانشکده / مرکز / واحد',
  'استان محل استقرار دانشکده / مرکز / واحد',
  'شهر محل استقرار دانشکده / مرکز / واحد',
  'شیوه آموزش',
  'نوع تحصیل',
  'کد دوره تحصیلی',
  'دوره تحصیلی',
  'کد رشته تحصیلی',
  'رشته تحصیلی',
  'کد وضعیت کلی دانشجو',
  'وضعیت کلی دانشجو',
  'وضعیت دانشجو در ترم',
  'وضعیت انتقال / میهمان',
  'آخرین ترم ثبت نام دانشجو',
  'شماره دانشجویی',
  'سال ورود/ نیمسال اول یا دوم',
  'نام',
  'نام خانوادگی',
  'جنسیت',
  'نام پدر',
  'شماره شناسنامه',
  'شماره ملی',
  'وضعیت تاهل',
  'دین',
  'سال تولد',
  'استان محل تولد',
  'شهر محل تولد',
  'بومی یا غیربومی',
  'استان محل سکونت دائمی',
  'شهر محل سکونت دائمی',
  'کد پستی محل سکونت دائمی',
  'شماره تلفن ثابت',
  'شماره تلفن همراه',
  'پست الکترونیکی',
  'تابعیت',
  'کشور تابعیت',
  'نوع پذیرش دانشجو',
  'روش پذیرش دانشجو',
  'وضعیت سهمیه پذیرش',
  'نحوه پرداخت شهریه',
  'نوع بورسیه',
  'رتبه در آزمون ورودی',
  'تعداد درس ثبت نامی دانشجو در ترم',
  'تعداد نیمسال های مرخصی',
  'تعداد نیمسال های مشروطی',
  'جمع واحد گذرانده تا قبل از نیمسال تحصیلی فعلی',
  'جمع واحد باقیمانده تا قبل از نیمسال تحصیلی فعلی',
  'معدل کل تا قبل از نیمسال فعلی',
  'آیا دانشجو در حال گذراندن پایان نامه یا رساله می‌باشد؟',
  'شناسه فراگیر اتباع خارجی',
] as const;

/** رشته‌های عددی که سهام می‌خواهد «متنی» باشد (وگرنه صفرهای اول می‌پرند) */
const TEXT_SAFE = new Set(['کد دانشکده / مرکز / واحد', 'شماره دانشجویی', 'شماره شناسنامه',
  'شماره ملی', 'کد پستی محل سکونت دائمی', 'شماره تلفن ثابت', 'شماره تلفن همراه']);

export interface RawStudent {
  universityTitle: string;
  universityId: number;
  facultyId: number | null;
  facultyTitle: string | null;
  teachingMode: string | null;
  studyType: string | null;
  degreeCode: string | null;
  degreeTitle: string | null;
  majorCode: string | null;
  majorTitle: string | null;
  status: string;
  termStatusTitle: string | null;
  transferGuestStatus: string | null;
  lastTermCode: string | null;
  studentCode: string;
  entryYear: number;
  entryTerm: number | null;
  firstName: string;
  lastName: string;
  gender: string | null;
  fatherName: string | null;
  birthCertNo: string | null;
  nationalCode: string;
  maritalStatus: string | null;
  religion: string | null;
  birthDate: string | null;
  birthProvince: string | null;
  birthCity: string | null;
  nativeType: string | null;
  residenceProvince: string | null;
  residenceCity: string | null;
  postalCode: string | null;
  homeTell: string | null;
  mobile: string | null;
  email: string | null;
  nationality: string | null;
  countryTitle: string | null;
  acceptanceType: string | null;
  admissionMethod: string | null;
  quotaType: string;
  tuitionPaymentMethod: string | null;
  scholarshipType: string | null;
  entranceExamRank: string | null;
  termCourseCount: number | null;
  leaveSemesters: number | null;
  probationSemesters: number | null;
  totalPassedUnits: number | null;
  unitsRemaining: number | null;
  totalAverage: string | null;
  isThesis: number | null;
  foreignStudentId: string | null;
  /** سال تولد شمسی برای خروجی (سهام سال تولد شمسی می‌خواهد) */
  birthYear: number | null;
}

/**
 * خواندن همهٔ دانشجویان یک دانشگاه با تمام ستون‌های لازم سهام.
 * هر ستون اضافه در یک اسکن (LEFT JOIN) جمع می‌شود تا کوئری سنگین نشود.
 */
export async function fetchSahamStudents(universityId: number): Promise<{
  rows: RawStudent[];
  maps: Record<string, Record<string, string>>;
  codes: Map<number, SahamInstituteCode[]>;
}> {
  const maps = await loadSahamValueMaps();
  const codes = await loadSahamInstituteCodes();

  const rows = (await db.execute<RawStudent & Record<string, unknown>>(sql`
    SELECT
      u2."title"                       AS "universityTitle",
      s."universityId"                 AS "universityId",
      m."facultyId"                   AS "facultyId",
      f."name"                        AS "facultyTitle",
      s."teachingMode"                AS "teachingMode",
      s."studyType"                   AS "studyType",
      d."standardCode"                AS "degreeCode",
      d."title"                       AS "degreeTitle",
      m."majorCode"                   AS "majorCode",
      m."name"                        AS "majorTitle",
      s.status                        AS "status",
      sts."statusTitle"               AS "termStatusTitle",
      s."transferGuestStatus"         AS "transferGuestStatus",
      lt."termCode"                   AS "lastTermCode",
      s."studentCode"                 AS "studentCode",
      s."entryYear"                   AS "entryYear",
      s."entryTerm"                   AS "entryTerm",
      us."firstName"                  AS "firstName",
      us."lastName"                   AS "lastName",
      us."gender"                     AS "gender",
      us."fatherName"                 AS "fatherName",
      us."birthCertNo"                AS "birthCertNo",
      us."nationalCode"               AS "nationalCode",
      s."maritalStatus"               AS "maritalStatus",
      us."religion"                   AS "religion",
      to_char(us."birthDate", 'YYYY')  AS "birthDate",
      s."birthProvince"               AS "birthProvince",
      s."birthCity"                   AS "birthCity",
      s."nativeType"                  AS "nativeType",
      s."residenceProvince"           AS "residenceProvince",
      s."residenceCity"               AS "residenceCity",
      us."postalCode"                 AS "postalCode",
      COALESCE(s."homeTell", us."phone") AS "homeTell",
      us."mobile"                     AS "mobile",
      us."email"                      AS "email",
      us."nationality"                AS "nationality",
      gc."title"                     AS "countryTitle",
      s."acceptanceType"              AS "acceptanceType",
      s."admissionMethod"             AS "admissionMethod",
      s."quotaType"                   AS "quotaType",
      s."tuitionPaymentMethod"        AS "tuitionPaymentMethod",
      s."scholarshipType"             AS "scholarshipType",
      s."entranceExamRank"            AS "entranceExamRank",
      tc."cnt"                        AS "termCourseCount",
      s."eqSemesters"                 AS "leaveSemesters",
      NULL::int                       AS "probationSemesters",
      s."totalPassedUnits"            AS "totalPassedUnits",
      s."unitsRemaining"              AS "unitsRemaining",
      s."totalAverage"                AS "totalAverage",
      NULL::int                       AS "isThesis",
      s."foreignStudentId"            AS "foreignStudentId",
      NULL::int                       AS "birthYear"
    FROM students s
    JOIN users us ON us.id = s."userId"
    JOIN universities u2 ON u2.id = s."universityId"
    LEFT JOIN majors m ON m.id = s."majorId"
    LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
    LEFT JOIN faculties f ON f.id = m."facultyId"
    LEFT JOIN geo_countries gc ON gc."code" = us."nationality"
    -- آخرین وضعیت ترم دانشجو
    LEFT JOIN LATERAL (
      SELECT st."statusTitle" FROM student_term_states st
      WHERE st."studentId" = s.id
      ORDER BY st."termCode" DESC LIMIT 1
    ) sts ON TRUE
    -- آخرین ترمی که در آن ثبت‌نام داشته
    LEFT JOIN LATERAL (
      SELECT t."termCode" FROM enrollments e
      JOIN course_offerings o ON o.id = e."offeringId"
      JOIN academic_terms t ON t.id = o."termId"
      WHERE e."studentId" = s.id
      ORDER BY t."termCode" DESC LIMIT 1
    ) lt ON TRUE
    -- تعداد درس ثبت‌نامی در آخرین ترم
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS "cnt" FROM enrollments e
      JOIN course_offerings o ON o.id = e."offeringId"
      WHERE e."studentId" = s.id AND o."termId" = (
        SELECT o2."termId" FROM enrollments e2
        JOIN course_offerings o2 ON o2.id = e2."offeringId"
        WHERE e2."studentId" = s.id
        ORDER BY o2."termId" DESC LIMIT 1
      )
    ) tc ON TRUE
    WHERE s."universityId" = ${universityId}
    ORDER BY s."studentCode"
  `)).rows;

  return { rows, maps, codes };
}

/** تبدیل ردیف خام به ۵۲ ستون سهام (با اعمال نگاشت‌ها) */
export function toSahamRow(
  r: RawStudent,
  maps: Record<string, Record<string, string>>,
  codeRow: SahamInstituteCode | null,
  geo: { province: Record<string, string>; city: Record<string, string> },
): string[] {
  const m = (field: string, v: unknown) => mapSahamValue(maps, field, v);
  // کد واحد/دانشکده + نام + استان/شهر استقرار از جدول saham_institute_codes
  const inst = codeRow ? { code: codeRow.code, title: codeRow.title } : { code: '', title: r.facultyTitle ?? '' };
  const provName = codeRow?.provinceCode ? (geo.province[codeRow.provinceCode] ?? '') : '';
  const cityName = codeRow?.cityCode ? (geo.city[codeRow.cityCode] ?? '') : '';

  return [
    r.universityTitle,
    inst.code,
    inst.title,
    provName,
    cityName,
    r.teachingMode ?? 'حضوری',
    r.studyType ?? '',
    r.degreeCode ?? '',
    r.degreeTitle ?? '',
    r.majorCode ?? '',
    r.majorTitle ?? '',
    m('student_status_code', r.status),
    m('student_status', r.status),
    r.termStatusTitle ?? '',
    r.transferGuestStatus ?? '',
    r.lastTermCode ?? '',
    r.studentCode,
    String(r.entryYear ?? '') + (r.entryTerm === 2 ? ' - 2' : ' - 1'),
    r.firstName ?? '',
    r.lastName ?? '',
    m('gender', r.gender),
    r.fatherName ?? '',
    r.birthCertNo ?? '',
    r.nationalCode ?? '',
    r.maritalStatus ?? m('marital', r.maritalStatus),
    m('religion', r.religion),
    r.birthDate ?? '',
    r.birthProvince ?? '',
    r.birthCity ?? '',
    r.nativeType ?? '',
    r.residenceProvince ?? '',
    r.residenceCity ?? '',
    r.postalCode ?? '',
    r.homeTell ?? '',
    r.mobile ?? '',
    r.email ?? '',
    r.countryTitle ?? (r.nationality === '120001' ? 'ایران' : ''),
    m('admission_type', r.acceptanceType),
    r.admissionMethod ?? '',
    m('quota', r.quotaType),
    r.tuitionPaymentMethod ?? '',
    r.scholarshipType ?? '',
    r.entranceExamRank ?? '',
    r.termCourseCount != null ? String(r.termCourseCount) : '',
    r.leaveSemesters != null ? String(r.leaveSemesters) : '',
    r.probationSemesters != null ? String(r.probationSemesters) : '',
    r.totalPassedUnits != null ? String(r.totalPassedUnits) : '',
    r.unitsRemaining != null ? String(r.unitsRemaining) : '',
    r.totalAverage ?? '',
    r.isThesis != null ? (r.isThesis ? 'بله' : 'خیر') : '',
    r.foreignStudentId ?? '',
  ];
}

export { TEXT_SAFE };