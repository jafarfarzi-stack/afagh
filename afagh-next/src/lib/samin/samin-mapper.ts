import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { students, users } from '@/db/schema';

/**
 * تبدیل رکورد داخلی (users+students) به payload ثمین entity 1000
 * مطابق APIM_SAORG_Samin_Student_WebServices_V0.6 صفحه ۸-۹
 */
export type SaminStudentPayload = Record<string, unknown>;

export async function buildSaminPayloadForStudent(studentId: number): Promise<SaminStudentPayload | null> {
  const [row] = await db.execute(sql`
    SELECT u.*, s.*,
      s.id as sid, u.id as uid
    FROM students s
    JOIN users u ON u.id = s."userId"
    WHERE s.id = ${studentId}
  `) as unknown as any[];

  if (!row) return null;

  // نگاشت ۱:۱ — فیلدهای الزامی ثمین باید پر باشند
  const nationalCode = (row as any).nationalCode || (row as any).NationalCode;
  const studentCode = (row as any).studentCode;

  return {
    national_code: nationalCode,
    person_pk_in_source: (row as any).saminPersonPk || String((row as any).uid),
    passport_number: (row as any).passportNumber || '',
    student_pk_in_source: (row as any).saminStudentPk || String((row as any).sid),
    student_code: studentCode,
    sender_university: (row as any).senderUniversityCode || (row as any).saminCode || 'AFAGH',
    university: (row as any).senderUniversityCode || 'AFAGH',
    first_name: (row as any).firstName,
    last_name: (row as any).lastName,
    first_name_en: (row as any).firstNameEn || '',
    last_name_en: (row as any).lastNameEn || '',
    iden_number: (row as any).birthCertNo || '',
    iden_classified_number: (row as any).birthCertSeries || '',
    iden_serial_number: '',
    birth_place: (row as any).birthPlaceCode || '',
    iden_issue_place: (row as any).issuePlaceCode || '',
    birth_date: (row as any).birthDate ? new Date((row as any).birthDate).toISOString().slice(0, 10).replace(/-/g, '/') : '',
    nationality: (row as any).nationality || '120001',
    temp_certificate_code: '',
    final_certificate_code: '',
    military_edu_exemption_code: '',
    address: (row as any).address || '',
    graduate_state: mapGraduateState((row as any).status),
    native_type: (row as any).nativeType || '',
    ethnicity: (row as any).ethnicity || '',
    military: '',
    father_name: (row as any).fatherName || '',
    gender: mapGender((row as any).gender),
    religion: (row as any).religion || '',
    marriage_status: '',
    address_country: '120001',
    address_province: '',
    address_city: '',
    postalcode: (row as any).postalCode || '',
    email: (row as any).email || '',
    mobile: (row as any).mobile || '',
    total_average: (row as any).totalAverage || '',
    edu_start_year: String((row as any).entryYear || ''),
    edu_start_semester: String((row as any).entryTerm || '1'),
    graduate_date: (row as any).graduateDate || '',
    graduate_certificate_level: '',
    edu_end_year: (row as any).eduEndYear ? String((row as any).eduEndYear) : '',
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
    level: '',
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
    verify_check_date: (row as any).saminVerifyCheckDate ? new Date((row as any).saminVerifyCheckDate).toISOString().slice(0, 10) : '',
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
