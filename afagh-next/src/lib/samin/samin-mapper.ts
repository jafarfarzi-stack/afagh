import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { degree_level_configs, students, universities, users } from '@/db/schema';
import { jalaliDateOf } from '@/lib/scheduling-core';
import { mapMilitarySamaToMinistry, resolveCityMinistry, resolveCityMinistryByCode } from '@/lib/shared-coding';

/** تاریخ میلادی دیتابیس → شمسی 'YYYY/MM/DD' برای ثمین (نمونهٔ سند: 1381/02/06) */
function toJalaliDay(v: unknown): string {
  if (!v) return '';
  try {
    const d = v instanceof Date ? v : new Date(String(v));
    if (isNaN(d.getTime())) return '';
    return jalaliDateOf(d);
  } catch {
    return '';
  }
}

/** سال ورودی عددی → بازهٔ سال تحصیلی «1398-1399» (نمونهٔ سند) */
function toEduYear(v: unknown): string {
  const s = String(v ?? '').trim();
  if (/^\d{4}$/.test(s)) return `${s}-${Number(s) + 1}`;
  return s;
}

/**
 * تبدیل رکورد داخلی (users+students) به payload ثمین entity 1000
 * مطابق APIM_SAORG_Samin_Student_WebServices_V0.6 صفحه ۸-۹
 */
export type SaminStudentPayload = Record<string, unknown>;

/** db.execute در node-postgres آبجکت Result می‌دهد نه آرایه — هر دو شکل */
async function firstRow<T>(q: Promise<unknown>): Promise<T | undefined> {
  const res = (await q) as unknown;
  const rows = Array.isArray(res) ? res : (res as { rows?: unknown })?.rows;
  return (Array.isArray(rows) ? rows[0] : undefined) as T | undefined;
}

export async function buildSaminPayloadForStudent(studentId: number): Promise<SaminStudentPayload | null> {
  const row = await firstRow<any>(db.execute(sql`
    SELECT u.*, s.*,
      s.id as sid, u.id as uid
    FROM students s
    JOIN users u ON u.id = s."userId"
    WHERE s.id = ${studentId}
  `));

  if (!row) return null;

  // محل‌ها از geo حل می‌شوند: اول کد ثبت‌شده، بعد عنوان؛ آدرس هم بهترین‌تلاش
  const birthGeo =
    (await resolveCityMinistryByCode((row as any).birthPlaceCode).catch(() => null)) ??
    (await resolveCityMinistry((row as any).placeOfBirth).catch(() => null));
  const issueGeo =
    (await resolveCityMinistryByCode((row as any).issuePlaceCode).catch(() => null)) ??
    (await resolveCityMinistry((row as any).placeOfIssue).catch(() => null));
  const addrGeo = await resolveCityMinistry((row as any).address).catch(() => null);

  // نگاشت ۱:۱ — فیلدهای الزامی ثمین باید پر باشند
  const nationalCode = (row as any).nationalCode || (row as any).NationalCode;
  const studentCode = (row as any).studentCode;

  // کد استاندارد مقطع (level نمونهٔ سند: 210004) + کد ثمین دانشگاه
  let levelCode = '';
  const degId = Number((row as any).degreeLevelId || 0);
  if (degId) {
    const [deg] = await db
      .select({ sc: degree_level_configs.standardCode })
      .from(degree_level_configs)
      .where(eq(degree_level_configs.id, degId))
      .limit(1)
      .catch(() => []);
    levelCode = (deg as { sc?: string | null } | undefined)?.sc || '';
  }
  let uniSaminCode = '';
  const uniId = Number((row as any).universityId || 0);
  if (uniId) {
    const [u] = await db
      .select({ sc: universities.saminCode })
      .from(universities)
      .where(eq(universities.id, uniId))
      .limit(1)
      .catch(() => []);
    uniSaminCode = (u as { sc?: string | null } | undefined)?.sc || '';
  }
  const senderUni = (row as any).senderUniversityCode || uniSaminCode || 'AFAGH';

  return {
    national_code: nationalCode,
    person_pk_in_source: (row as any).saminPersonPk || String((row as any).uid),
    passport_number: (row as any).passportNumber || '',
    student_pk_in_source: (row as any).saminStudentPk || String((row as any).sid),
    student_code: studentCode,
    sender_university: senderUni,
    university: senderUni,
    first_name: (row as any).firstName,
    last_name: (row as any).lastName,
    first_name_en: (row as any).firstNameEn || '',
    last_name_en: (row as any).lastNameEn || '',
    iden_number: (row as any).birthCertNo || '',
    iden_classified_number: (row as any).birthCertSeries || '',
    iden_serial_number: '',
    birth_place: birthGeo?.cityCode || '',
    iden_issue_place: issueGeo?.cityCode || '',
    birth_date: toJalaliDay((row as any).birthDate),
    nationality: (row as any).nationality || '120001',
    temp_certificate_code: '',
    final_certificate_code: '',
    military_edu_exemption_code: '',
    address: (row as any).address || '',
    graduate_state: mapGraduateState((row as any).status),
    native_type: (row as any).nativeType || '',
    ethnicity: (row as any).ethnicity || '',
    military: mapMilitarySamaToMinistry((row as any).militaryStatus) || '',
    father_name: (row as any).fatherName || '',
    gender: mapGender((row as any).gender),
    religion: (row as any).religion || '',
    marriage_status: '',
    address_country: '120001',
    address_province: addrGeo?.provinceCode || '',
    address_city: addrGeo?.cityCode || '',
    postalcode: (row as any).postalCode || '',
    email: (row as any).email || '',
    mobile: (row as any).mobile || '',
    total_average: (row as any).totalAverage || '',
    edu_start_year: toEduYear((row as any).entryYear),
    edu_start_semester: String((row as any).entryTerm || '1'),
    graduate_date: (row as any).graduateDate || '',
    graduate_certificate_level: '',
    edu_end_year: toEduYear((row as any).eduEndYear),
    edu_end_semester: (row as any).eduEndSemester ? String((row as any).eduEndSemester) : '',
    faculty_pardis: '',
    faculty_daneshkadeh: '',
    faculty_group: '',
    faculty_pardis_title: '',
    faculty_daneshkadeh_title: '',
    faculty_group_title: '',
    scholarship: '',
    sanjesh_file_number: (row as any).sanjeshFileNumber || '',
    sanjesh_applicant_number: (row as any).sanjeshApplicantNumber || '',
    field: (row as any).saminFieldCode || '',
    local_field: (row as any).saminLocalFieldCode || '',
    level: levelCode,
    acceptance_allocation: (row as any).acceptanceAllocation || '',
    acceptance_type: (row as any).acceptanceType || '',
    studying_mode: (row as any).studyingMode || '',
    training_method: (row as any).trainingMethod || '',
    isaar_code: (row as any).isaarCode || '',
    totaltakenunits_count: (row as any).totalTakenUnits ? String((row as any).totalTakenUnits) : '',
    totalpassedunits_count: (row as any).totalPassedUnits ? String((row as any).totalPassedUnits) : '',
    totalfailedunits_count: (row as any).totalFailedUnits ? String((row as any).totalFailedUnits) : '',
    is_alive: String((row as any).isAlive ?? 1),
    birth_place_title: (row as any).placeOfBirth || '',
    iden_issue_place_title: (row as any).placeOfIssue || '',
    is_verified: (row as any).saminIsVerified ? '1' : '',
    verify_check_date: toJalaliDay((row as any).saminVerifyCheckDate),
    description: (row as any).saminDescription || '',
  };
}

function mapGraduateState(s: string): string {
  const m: Record<string, string> = { ACTIVE: '0', GRADUATED: '1', EXPELLED: '2', SUSPENDED: '3' };
  return m[s] || '0';
}
function mapGender(g: string): string {
  if (!g) return '1';
  const m: Record<string, string> = { MALE: '1', FEMALE: '2' };
  return m[g.toUpperCase()] || '1';
}

/**
 * پیلود موجودیت «فرد» (entity_code 2001) — نمونهٔ cURL سند V0.2.
 * قبل از دانشجو (1000) ارسال می‌شود؛ person_pk_in_source همان uid است.
 */
export async function buildSaminPersonPayloadForStudent(
  studentId: number,
): Promise<Record<string, unknown> | null> {
  const row = await firstRow<any>(db.execute(sql`
    SELECT u.*,
      s.id as sid, u.id as uid
    FROM students s
    JOIN users u ON u.id = s."userId"
    WHERE s.id = ${studentId}
  `));
  if (!row) return null;

  const birthGeo =
    (await resolveCityMinistryByCode((row as any).birthPlaceCode).catch(() => null)) ??
    (await resolveCityMinistry((row as any).placeOfBirth).catch(() => null));
  const issueGeo =
    (await resolveCityMinistryByCode((row as any).issuePlaceCode).catch(() => null)) ??
    (await resolveCityMinistry((row as any).placeOfIssue).catch(() => null));

  return {
    identity_code: (row as any).nationalCode || '',
    source_id: (row as any).saminPersonPk || String((row as any).uid),
    identity_type: 'student',
    first_name: (row as any).firstName,
    last_name: (row as any).lastName,
    first_name_en: (row as any).firstNameEn || '',
    last_name_en: (row as any).lastNameEn || '',
    faragir_naja_code: '',
    birth_date: toJalaliDay((row as any).birthDate),
    father_name: (row as any).fatherName || '',
    passport_number: (row as any).passportNumber || '',
    iden_number: (row as any).birthCertNo || '',
    iden_classified_number: (row as any).birthCertSeries || '',
    iden_serial_number: '',
    iden_issue_place_title: (row as any).placeOfIssue || '',
    iden_issue_place_code: issueGeo?.cityCode || '',
    birth_place_code: birthGeo?.cityCode || '',
    gender: mapGender((row as any).gender),
    nationality: (row as any).nationality || '120001',
    citizenship: '',
    is_alive: String((row as any).isAlive ?? 1),
    is_verified: (row as any).saminIsVerified ? '1' : '',
    is_active: '',
  };
}
