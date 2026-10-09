import 'server-only';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import {
  loadSahamValueMaps, mapSahamValue, loadSahamInstituteCodes,
  loadGeoTitles, pickSahamCode, type SahamInstituteCode,
} from './saham-maps';
import { jalaliDateOf } from '@/lib/scheduling-core';

/** سال تولد شمسی از تاریخ میلادی ISO ('YYYY-MM-DD') — خطا/خالی → '' */
function sahamBirthYear(iso: string | null): string {
  if (!iso) return '';
  try {
    return jalaliDateOf(new Date(iso + 'T00:00:00')).slice(0, 4);
  } catch {
    return '';
  }
}

/**
 * گزارش آموزشگران سهام (3-TeachingStaff.xlsx) — ۳۷ ستون.
 * «آموزشگر» = استادی که در نیمسال انتخاب‌شده ارائهٔ فعال دارد.
 */

export const SAHAM_INSTRUCTOR_HEADERS = [
  'نام موسسه آموزش عالی',
  'کد دانشکده / مرکز / واحد',
  'نام  دانشکده / مرکز / واحد',
  'استان محل استقرار دانشکده یا محل خدمت',
  'شهر محل استقرار دانشکده یا محل خدمت',
  'نام گروه آموزشی',
  'نام',
  'نام خانوادگی',
  'نام پدر',
  'جنسیت',
  'کد ملی',
  'شماره شناسنامه',
  'سال تولد',
  'استان محل تولد',
  'شهر محل تولد',
  'وضعیت تاهل',
  'آخرین مدرک تحصیلی',
  'رشته تحصیلی آخرین مدرک تحصیلی',
  'گروه تحصیلی آخرین مدرک تحصیلی',
  'سال اخذ آخرین مدرک تحصیلی',
  'کشور محل اخذ آخرین مدرک تحصیلی',
  'موسسه آموزش عالی محل اخذ آخرین مدرک تحصیلی',
  'نوع استخدام آموزشگران',
  'نوع خدمت آموزشگران',
  'نوع آموزشگر موسسه آموزش عالی',
  'نوع هیات علمی',
  'سمت',
  'تاریخ انتصاب',
  'مرتبه علمی',
  'پایه',
  'سال استخدام',
  'شماره مستخدم',
  'تعداد واحد تدریس',
  'تلفن همراه',
  'تلفن ثابت',
  'پست الکترونیکی',
  'شماره شناسایی استاد',
] as const;

export interface RawInstructor {
  universityId: number;
  universityTitle: string;
  facultyId: number | null;
  instituteTitle: string | null;
  deptTitle: string | null;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  gender: string | null;
  nationalCode: string;
  birthCertNo: string | null;
  birthYear: string | null;
  birthProvince: string | null;
  birthCity: string | null;
  birthCityFallback: string | null;
  maritalStatus: string | null;
  degree: string | null;
  fieldMain: string | null;
  fieldOfStudy: string | null;
  lastDegreeYear: number | null;
  lastDegreeCountry: string | null;
  lastDegreeUniversity: string | null;
  employmentType: string | null;
  cooperationType: string | null;
  staffType: string | null;
  academicRank: string | null;
  title: string | null;
  hireDate: string | null;
  academicBase: string | null;
  personnelNo: string | null;
  teachUnits: string | null;
  mobile: string | null;
  phone: string | null;
  email: string | null;
  staffCode: string;
}

export async function fetchSahamInstructors(
  universityId: number,
  termId: number,
  limit = 5000,
): Promise<{ rows: RawInstructor[]; maps: Record<string, Record<string, string>>; codes: Map<number, SahamInstituteCode[]> }> {
  const maps = await loadSahamValueMaps();
  const codes = await loadSahamInstituteCodes();

  const rows = (await db.execute<RawInstructor & Record<string, unknown>>(sql`
    WITH load AS (
      SELECT o."professorId", sum(c.units)::numeric AS units
      FROM course_offerings o
      JOIN courses c ON c.id = o."courseId"
      WHERE o."termId" = ${termId} AND o."professorId" IS NOT NULL AND o."isActive" = 1
      GROUP BY o."professorId"
    )
    SELECT
      st."universityId"              AS "universityId",
      u2."title"                    AS "universityTitle",
      st."facultyId"                AS "facultyId",
      f."name"                      AS "instituteTitle",
      dp."title"                    AS "deptTitle",
      us."firstName"                AS "firstName",
      us."lastName"                 AS "lastName",
      us."fatherName"               AS "fatherName",
      us."gender"                   AS "gender",
      us."nationalCode"             AS "nationalCode",
      us."birthCertNo"              AS "birthCertNo",
      to_char(us."birthDate", 'YYYY-MM-DD') AS "birthYear",
      COALESCE(st."birthProvince", '') AS "birthProvince",
      COALESCE(st."birthCity", '')     AS "birthCity",
      COALESCE(us."placeOfBirth", '')  AS "birthCityFallback",
      st."maritalStatus"            AS "maritalStatus",
      st."degree"                   AS "degree",
      st."fieldMain"                AS "fieldMain",
      st."fieldOfStudy"             AS "fieldOfStudy",
      st."lastDegreeYear"           AS "lastDegreeYear",
      gc."title"                    AS "lastDegreeCountry",
      st."lastDegreeUniversity"     AS "lastDegreeUniversity",
      st."employmentType"           AS "employmentType",
      st."cooperationType"          AS "cooperationType",
      st."staffType"                AS "staffType",
      st."academicRank"             AS "academicRank",
      st."title"                    AS "title",
      st."hireDate"                 AS "hireDate",
      st."academicBase"             AS "academicBase",
      st."personnelNo"              AS "personnelNo",
      load.units::text              AS "teachUnits",
      us."mobile"                   AS "mobile",
      st."phone"                    AS "phone",
      us."email"                    AS "email",
      st."staffCode"                AS "staffCode"
    FROM staff st
    JOIN users us ON us.id = st."userId"
    JOIN universities u2 ON u2.id = st."universityId"
    JOIN load ON load."professorId" = st.id
    LEFT JOIN faculties f ON f.id = st."facultyId"
    LEFT JOIN departments dp ON dp.id = st."departmentId"
    LEFT JOIN geo_countries gc ON gc."code" = st."lastDegreeCountryCode"
    WHERE st."universityId" = ${universityId}
    ORDER BY us."lastName", us."firstName"
    LIMIT ${Math.min(Math.max(limit, 1), 20000)}
  `)).rows;

  return { rows, maps, codes };
}

export function toSahamInstructorRow(
  r: RawInstructor,
  maps: Record<string, Record<string, string>>,
  codeRow: SahamInstituteCode | null,
  geo: { province: Record<string, string>; city: Record<string, string> },
): string[] {
  const m = (field: string, v: unknown) => mapSahamValue(maps, field, v);
  const inst = codeRow ? { code: codeRow.code, title: codeRow.title } : { code: '', title: r.instituteTitle ?? '' };
  const provName = codeRow?.provinceCode ? (geo.province[codeRow.provinceCode] ?? '') : '';
  const cityName = codeRow?.cityCode ? (geo.city[codeRow.cityCode] ?? '') : '';
  const hireYear = (r.hireDate ?? '').slice(0, 4);

  return [
    r.universityTitle,
    inst.code,
    inst.title,
    provName,
    cityName,
    r.deptTitle ?? '',
    r.firstName ?? '',
    r.lastName ?? '',
    r.fatherName ?? '',
    m('gender', r.gender),
    r.nationalCode ?? '',
    r.birthCertNo ?? '',
    sahamBirthYear(r.birthYear),
    r.birthProvince ?? '',
    r.birthCity || r.birthCityFallback || '',
    r.maritalStatus ?? '',
    r.degree ?? '',
    r.fieldMain ?? r.fieldOfStudy ?? '',
    r.fieldOfStudy ?? '',
    r.lastDegreeYear != null ? String(r.lastDegreeYear) : '',
    r.lastDegreeCountry ?? '',
    r.lastDegreeUniversity ?? '',
    r.employmentType ?? '',
    r.cooperationType ?? '',
    r.staffType ?? '',
    r.academicRank ?? '',
    r.title ?? '',
    r.hireDate ?? '',
    r.academicRank ?? '',
    r.academicBase ?? '',
    hireYear,
    r.personnelNo ?? '',
    r.teachUnits ?? '',
    r.mobile ?? '',
    r.phone ?? '',
    r.email ?? '',
    r.staffCode,
  ];
}

export { loadGeoTitles, pickSahamCode };
