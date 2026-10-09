import 'server-only';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { loadSahamValueMaps, mapSahamValue, loadSahamInstituteCodes, pickSahamCode, cityTitle, type SahamInstituteCode, type GeoTitles } from './saham-maps';
import { jalaliDateOf } from '@/lib/scheduling-core';

/** سال تولد شمسی از تاریخ میلادی ISO ('YYYY-MM-DD') — خطا/خالی → '' */
export function sahamBirthYear(iso: string | null): string {
  if (!iso) return '';
  try {
    return jalaliDateOf(new Date(iso + 'T00:00:00')).slice(0, 4);
  } catch {
    return '';
  }
}

/** سال ورود سهام: سال چسبیده به ۱/۲ بدون خط‌تیره (مثل 14011) */
function sahamEntryYear(entryYear: number | null, entryTerm: number | null): string {
  if (entryYear == null) return '';
  return `${entryYear}${entryTerm === 2 ? '2' : '1'}`;
}

/** نگاشت کد بومی/غیربومی (BOOMI خام: 1/2) به متن سهام */
const NATIVE_MAP: Record<string, string> = { '1': 'بومی', '2': 'غیربومی' };
export function sahamNative(v: string | null): string {
  if (!v) return '';
  const t = v.trim();
  return NATIVE_MAP[t] ?? t;
}

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
  totalFailedUnits: number | null;
  militaryStatus: string | null;
  address: string | null;
  graduateDate: string | null;
  eduEndYear: number | null;
  eduEndSemester: number | null;
  /** سال تولد شمسی برای خروجی (سهام سال تولد شمسی می‌خواهد) */
  birthYear: number | null;
}

/** فیلترهای سمت سرور برای خروجی — همه اختیاری‌اند */
export interface SahamStudentFilters {
  status?: string;
  majorId?: number;
  facultyId?: number;
  entryYearFrom?: number;
  entryYearTo?: number;
  /** بازهٔ تاریخ فراغت (رشتهٔ شمسی، مثل 1403/01/01) — مخصوص گزارش دانش‌آموختگان */
  graduateFrom?: string;
  graduateTo?: string;
  /** سقف ردیف خروجی (پیش‌فرض ۵۰۰۰) — برای جلوگیری از تایم‌اوت */
  limit?: number;
}

export const SAHAM_DEFAULT_LIMIT = 5000;
export const SAHAM_MAX_LIMIT = 20000;

/**
 * خواندن دانشجویان یک دانشگاه با تمام ستون‌های لازم سهام + فیلتر سمت سرور.
 *
 * بهینه‌سازی سرعت: به‌جای ۳ ساب‌کوئری LATERAL برای هر دانشجو (۴۰هزار ×
 * ایندکس‌اسکن + سورت)، دو پاس تجمیعی DISTINCT ON روی همان دانشگاه می‌زنیم.
 */
export async function fetchSahamStudents(
  universityId: number,
  f: SahamStudentFilters = {},
): Promise<{
  rows: RawStudent[];
  total: number;
  hasMore: boolean;
  maps: Record<string, Record<string, string>>;
  codes: Map<number, SahamInstituteCode[]>;
}> {
  const maps = await loadSahamValueMaps();
  const codes = await loadSahamInstituteCodes();
  const limit = Math.min(Math.max(f.limit ?? SAHAM_DEFAULT_LIMIT, 1), SAHAM_MAX_LIMIT);

  const conds = [sql`s."universityId" = ${universityId}`];
  if (f.status) conds.push(sql`s.status = ${f.status}`);
  if (f.majorId) conds.push(sql`s."majorId" = ${f.majorId}`);
  if (f.facultyId) conds.push(sql`m."facultyId" = ${f.facultyId}`);
  if (f.entryYearFrom != null) conds.push(sql`s."entryYear" >= ${f.entryYearFrom}`);
  if (f.entryYearTo != null) conds.push(sql`s."entryYear" <= ${f.entryYearTo}`);
  if (f.graduateFrom) conds.push(sql`s."graduateDate" >= ${f.graduateFrom}`);
  if (f.graduateTo) conds.push(sql`s."graduateDate" <= ${f.graduateTo}`);
  const where = sql.join(conds, sql` AND `);

  const total = (await db.execute<{ n: number } & Record<string, unknown>>(sql`
    SELECT count(*)::int AS n FROM students s
    LEFT JOIN majors m ON m.id = s."majorId"
    WHERE ${where}
  `)).rows[0]?.n ?? 0;

  const rows = (await db.execute<RawStudent & Record<string, unknown>>(sql`
    WITH last_state AS (
      SELECT DISTINCT ON (st."studentId") st."studentId", st."statusTitle"
      FROM student_term_states st
      JOIN students s2 ON s2.id = st."studentId"
      WHERE s2."universityId" = ${universityId}
      ORDER BY st."studentId", st."termCode" DESC
    ),
    enr_per_term AS (
      SELECT e."studentId", t."termCode", count(*)::int AS cnt
      FROM enrollments e
      JOIN course_offerings o ON o.id = e."offeringId"
      JOIN academic_terms t ON t.id = o."termId"
      JOIN students s2 ON s2.id = e."studentId"
      WHERE s2."universityId" = ${universityId}
      GROUP BY e."studentId", t."termCode"
    ),
    last_enr AS (
      SELECT DISTINCT ON ("studentId") "studentId", "termCode", cnt
      FROM enr_per_term ORDER BY "studentId", "termCode" DESC
    ),
    -- تعداد نیمسال‌های مرخصی (کد وضعیت ۲ و ۳) و مشروطی (isProbation) هر دانشجو
    leave_cnt AS (
      SELECT st."studentId", count(*)::int AS cnt
      FROM student_term_states st
      JOIN students s2 ON s2.id = st."studentId"
      WHERE s2."universityId" = ${universityId} AND st."statusCode" IN ('2', '3')
      GROUP BY st."studentId"
    ),
    prob_cnt AS (
      SELECT st."studentId", count(*)::int AS cnt
      FROM student_term_states st
      JOIN students s2 ON s2.id = st."studentId"
      WHERE s2."universityId" = ${universityId} AND st."isProbation" = 1
      GROUP BY st."studentId"
    )
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
      ls."statusTitle"                AS "termStatusTitle",
      s."transferGuestStatus"         AS "transferGuestStatus",
      le."termCode"                   AS "lastTermCode",
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
      to_char(us."birthDate", 'YYYY-MM-DD')  AS "birthDate",
      s."birthProvince"               AS "birthProvince",
      s."birthCity"                   AS "birthCity",
      s."nativeType"                  AS "nativeType",
      s."residenceProvince"           AS "residenceProvince",
      s."residenceCity"               AS "residenceCity",
      us."postalCode"                 AS "postalCode",
      s."homeTell"                    AS "homeTell",
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
      le.cnt                          AS "termCourseCount",
      lc.cnt                          AS "leaveSemesters",
      pc.cnt                          AS "probationSemesters",
      s."totalPassedUnits"            AS "totalPassedUnits",
      s."unitsRemaining"              AS "unitsRemaining",
      s."totalAverage"                AS "totalAverage",
      NULL::int                       AS "isThesis",
      s."foreignStudentId"            AS "foreignStudentId",
      s."totalFailedUnits"            AS "totalFailedUnits",
      s."militaryStatus"              AS "militaryStatus",
      us."address"                    AS "address",
      s."graduateDate"                AS "graduateDate",
      s."eduEndYear"                  AS "eduEndYear",
      s."eduEndSemester"              AS "eduEndSemester",
      NULL::int                       AS "birthYear"
    FROM students s
    JOIN users us ON us.id = s."userId"
    JOIN universities u2 ON u2.id = s."universityId"
    LEFT JOIN majors m ON m.id = s."majorId"
    LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
    LEFT JOIN faculties f ON f.id = m."facultyId"
    LEFT JOIN geo_countries gc ON gc."code" = us."nationality"
    LEFT JOIN last_state ls ON ls."studentId" = s.id
    LEFT JOIN last_enr le ON le."studentId" = s.id
    LEFT JOIN leave_cnt lc ON lc."studentId" = s.id
    LEFT JOIN prob_cnt pc ON pc."studentId" = s.id
    WHERE ${where}
    ORDER BY s."studentCode"
    LIMIT ${limit}
  `)).rows;

  return { rows, total, hasMore: total > rows.length, maps, codes };
}

/** تبدیل ردیف خام به ۵۲ ستون سهام (با اعمال نگاشت‌ها) */
export function toSahamRow(
  r: RawStudent,
  maps: Record<string, Record<string, string>>,
  codeRow: SahamInstituteCode | null,
  geo: GeoTitles,
): string[] {
  const m = (field: string, v: unknown) => mapSahamValue(maps, field, v);
  // کد واحد/دانشکده + نام + استان/شهر استقرار از جدول saham_institute_codes
  const inst = codeRow ? { code: codeRow.code, title: codeRow.title } : { code: '', title: r.facultyTitle ?? '' };
  const provName = codeRow?.provinceCode ? (geo.province[codeRow.provinceCode] ?? '') : '';
  const cityName = cityTitle(geo, codeRow?.provinceCode ?? null, codeRow?.cityCode ?? null);

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
    sahamEntryYear(r.entryYear, r.entryTerm),
    r.firstName ?? '',
    r.lastName ?? '',
    m('gender', r.gender),
    r.fatherName ?? '',
    r.birthCertNo ?? '',
    r.nationalCode ?? '',
    r.maritalStatus ?? m('marital', r.maritalStatus),
    m('religion', r.religion),
    sahamBirthYear(r.birthDate),
    r.birthProvince ?? '',
    r.birthCity ?? '',
    sahamNative(r.nativeType),
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