// ═══ تجزیهٔ ردیف‌های «دادهٔ پایهٔ سازمانی» از فایل سیستم قدیمی — ماژول خالص ═══
//
// موجودیت‌ها: دانشکده، گروه آموزشی، رشته/گرایش، استاد.
//
// چرا جدا از engine.ts؟ engine به @/db و codemap (و در نتیجه `server-only`)
// وابسته است و در تست واحد import نمی‌شود. قاعده‌های داده اینجا بدون هیچ
// وابستگی نگه داشته می‌شوند تا مستقیم تست شوند.

import { boolFa, checkNationalCode, norm, num } from './normalize';
import type { CellReader } from './course-row';

export type RowResult<T> =
  | { ok: true; row: T; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

const ok = <T,>(row: T, warnings: string[] = []): RowResult<T> => ({ ok: true, row, warnings });
const bad = <T,>(error: string, warnings: string[] = []): RowResult<T> => ({ ok: false, error, warnings });

/** تاریخ شمسی را فقط اعتبارسنجی می‌کنیم؛ ذخیره به‌صورت رشته است (مثل بقیهٔ اسکیما) */
const jalali = (v: string): string | null => {
  const s = norm(v).replace(/[.\-]/g, '/').trim();
  return /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s) ? s : null;
};

// ─────────────────────────── دانشکده ───────────────────────────

export type ParsedFaculty = { code: string | null; name: string };

export const FACULTY_ALIASES = {
  code: ['کد دانشکده', 'کد', 'faculty_code', 'code'],
  name: ['نام دانشکده', 'دانشکده', 'نام', 'faculty', 'faculty_name', 'name'],
} as const;

export function parseFacultyRow(get: CellReader): RowResult<ParsedFaculty> {
  const name = get([...FACULTY_ALIASES.name]);
  const code = get([...FACULTY_ALIASES.code]);
  if (!name) return bad('نام دانشکده الزامی است.');
  return ok({ code: code || null, name });
}

// ───────────────────────── گروه آموزشی ─────────────────────────

export type ParsedDepartment = {
  code: string | null;
  name: string;
  facultyName: string | null;
  /** «کد دانشکده» جدا از نام نگه داشته می‌شود — کد سند اصالت است، نام ممکن است تکراری باشد */
  facultyCode: string | null;
};

export const DEPARTMENT_ALIASES = {
  code: ['کد گروه', 'کد گروه آموزشی', 'کد', 'department_code', 'dept_code', 'code'],
  name: ['نام گروه', 'گروه آموزشی', 'گروه', 'نام', 'department', 'department_name', 'name'],
  faculty: ['نام دانشکده', 'دانشکده', 'faculty', 'faculty_name'],
  facultyCode: ['کد دانشکده', 'faculty_code'],
} as const;

export function parseDepartmentRow(get: CellReader): RowResult<ParsedDepartment> {
  const name = get([...DEPARTMENT_ALIASES.name]);
  const code = get([...DEPARTMENT_ALIASES.code]);
  const facultyName = get([...DEPARTMENT_ALIASES.faculty]);
  const facultyCode = get([...DEPARTMENT_ALIASES.facultyCode]);
  if (!name) return bad('نام گروه آموزشی الزامی است.');
  const warnings: string[] = [];
  if (!code) warnings.push(`گروه «${name}» بدون «کد گروه» است — تطبیق فقط با نام انجام می‌شود و اگر گروه هم‌نامی در دانشکدهٔ دیگر باشد، خطر اشتباه هست.`);
  if (!facultyName && !facultyCode) warnings.push(`گروه «${name}» بدون دانشکده است — به دانشکدهٔ پیش‌فرض وصل می‌شود.`);
  return ok({ code: code || null, name, facultyName: facultyName || null, facultyCode: facultyCode || null }, warnings);
}

// ──────────────────────── رشته و گرایش ────────────────────────

export type ParsedMajor = {
  code: string;
  name: string;
  degreeName: string | null;
  departmentName: string | null;
  /** «کد گروه آموزشی» — بر نام مقدم است */
  departmentCode: string | null;
  facultyName: string | null;
  /** «کد دانشکده» — بر نام مقدم است */
  facultyCode: string | null;
  /** «کد مقطع» — بر عنوان مقطع مقدم است */
  degreeCode: string | null;
  trackTitle: string | null;
  trackCode: string | null;
  minUnits: number | null;
  standardCode: string | null;
  establishedDate: string | null;
  terminatedDate: string | null;
  isActive: boolean;
  headStaffCode: string | null;
  headName: string | null;
  expertName: string | null;
  lastCouncilDate: string | null;
};

export const MAJOR_ALIASES = {
  code: ['کد رشته', 'کدرشته', 'major_code', 'code'],
  name: ['نام رشته', 'رشته', 'عنوان رشته', 'major', 'major_name', 'name'],
  degree: ['مقطع', 'مقطع تحصیلی', 'سطح', 'degree', 'degree_level'],
  degreeCode: ['کد مقطع', 'کد مقطع تحصیلی', 'degree_code', 'degree_level_code'],
  department: ['نام گروه آموزشی', 'گروه آموزشی', 'گروه', 'دپارتمان', 'department', 'dept'],
  departmentCode: ['کد گروه آموزشی', 'کد گروه', 'department_code', 'dept_code'],
  faculty: ['نام دانشکده', 'دانشکده', 'faculty'],
  facultyCode: ['کد دانشکده', 'faculty_code'],
  track: ['گرایش', 'نام گرایش', 'track', 'orientation'],
  trackCode: ['کد گرایش', 'track_code'],
  minUnits: ['حداقل واحد', 'کل واحد', 'واحد کل', 'min_units', 'total_units'],
  standardCode: ['کد استاندارد', 'کد استاندارد رشته', 'standard_code'],
  established: ['تاریخ تاسیس', 'تاریخ تأسیس', 'established_date'],
  terminated: ['تاریخ خاتمه', 'تاریخ انحلال', 'terminated_date'],
  active: ['فعال', 'وضعیت', 'is_active', 'active'],
  headStaff: ['کد استادی مدیر گروه', 'کد مدیر گروه', 'head_staff_code'],
  headName: ['نام مدیر گروه', 'مدیر گروه', 'head_name'],
  expert: ['کارشناس رشته', 'کارشناس', 'expert_name'],
  council: ['آخرین جلسه شورای گسترش', 'شورای گسترش', 'last_council_date'],
} as const;

export function parseMajorRow(get: CellReader): RowResult<ParsedMajor> {
  const A = MAJOR_ALIASES;
  const warnings: string[] = [];
  const code = get([...A.code]);
  const name = get([...A.name]);
  if (!code || !name) return bad('کد رشته و نام رشته الزامی است.');

  const degreeName = get([...A.degree]);
  if (!degreeName) warnings.push(`رشتهٔ «${name}» بدون مقطع است — یک رشته می‌تواند در دو مقطع هم‌نام باشد و اشتباه تطبیق بخورد.`);

  const minUnitsRaw = get([...A.minUnits]);
  const minUnits = num(minUnitsRaw);
  if (minUnitsRaw && minUnits == null) warnings.push(`حداقل واحد «${minUnitsRaw}» عدد نیست — نادیده گرفته شد.`);
  if (minUnits != null && (minUnits <= 0 || minUnits > 400)) {
    warnings.push(`حداقل واحد نامعمول (${minUnits}) — ثبت شد ولی بررسی کنید.`);
  }

  const activeRaw = get([...A.active]);
  // «وضعیت» در فایل قدیمی گاهی «فعال/غیرفعال» است و گاهی ۰/۱
  const isActive = activeRaw ? !/غیرفعال|غير فعال|منحل|inactive|0/i.test(norm(activeRaw)) : true;

  const established = get([...A.established]);
  const terminated = get([...A.terminated]);
  const council = get([...A.council]);
  for (const [label, v] of [['تاریخ تاسیس', established], ['تاریخ خاتمه', terminated], ['آخرین جلسه شورا', council]] as const) {
    if (v && !jalali(v)) warnings.push(`${label} «${v}» قالب شمسی (۱۴۰۲/۰۷/۰۱) ندارد — نادیده گرفته شد.`);
  }

  const trackTitle = get([...A.track]);
  return ok({
    code, name,
    degreeName: degreeName || null,
    departmentName: get([...A.department]) || null,
    departmentCode: get([...A.departmentCode]) || null,
    facultyName: get([...A.faculty]) || null,
    facultyCode: get([...A.facultyCode]) || null,
    degreeCode: get([...A.degreeCode]) || null,
    trackTitle: trackTitle || null,
    trackCode: get([...A.trackCode]) || null,
    minUnits: minUnits != null && minUnits > 0 && minUnits <= 400 ? Math.round(minUnits) : null,
    standardCode: get([...A.standardCode]) || null,
    establishedDate: jalali(established),
    terminatedDate: jalali(terminated),
    isActive,
    headStaffCode: get([...A.headStaff]) || null,
    headName: get([...A.headName]) || null,
    expertName: get([...A.expert]) || null,
    lastCouncilDate: jalali(council),
  }, warnings);
}

// ─────────────────────────── استاد ───────────────────────────

export type ParsedProfessor = {
  staffCode: string;
  nationalCode: string | null;
  /** نام فایل عکس در سیستم قدیمی — آرشیو ZIP عکس‌ها با همین نام وصل می‌شود */
  photoFile: string | null;
  fieldMain: string | null;
  fatherName: string | null;
  birthCertNo: string | null;
  birthDate: string | null;        // شمسی، همان‌طور که در فایل آمده
  placeOfBirth: string | null;
  placeOfIssue: string | null;
  address: string | null;
  maritalStatusCode: number | null;
  lastDegreeCountryCode: string | null;
  firstName: string;
  lastName: string;
  title: string | null;
  departmentName: string | null;
  facultyName: string | null;
  academicRank: string | null;
  degree: string | null;
  cooperationType: string | null;
  employmentType: string | null;
  personnelNo: string | null;
  hireDate: string | null;
  lastDegreeYear: number | null;
  fieldOfStudy: string | null;
  maritalStatus: string | null;
  lastDegreeUniversity: string | null;
  academicBase: string | null;
  birthProvince: string | null;
  birthCity: string | null;
  bankAccountNo: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  gender: string | null;
  isActive: boolean;
};

export const PROFESSOR_ALIASES = {
  staffCode: ['کد استادی', 'کد استاد', 'کد پرسنلی', 'staff_code', 'professor_code', 'code', 'کد'],
  nationalCode: ['کد ملی', 'کدملی', 'national_code', 'nationalcode'],
  first: ['نام', 'first_name', 'firstname'],
  last: ['نام خانوادگی', 'نامخانوادگی', 'فامیل', 'last_name', 'lastname'],
  fullName: ['نام و نام خانوادگی', 'نام کامل', 'نام و نام خانوادگی استاد', 'استاد', 'نام استاد', 'full_name'],
  // فایل واقعی ستون «نام خانوادگي و نام» دارد: ترتیب برعکس است و اگر مثل
  // «نام و نام خانوادگی» خوانده شود، نام و فامیل همه جابه‌جا ثبت می‌شود.
  fullNameReversed: ['نام خانوادگی و نام', 'نام خانوادگی و نام ', 'فامیل و نام', 'lastname_firstname'],
  title: ['لقب', 'عنوان', 'title', 'prefix'],
  department: ['گروه آموزشی', 'گروه', 'دپارتمان', 'department', 'dept'],
  faculty: ['دانشکده', 'نام دانشکده', 'faculty'],
  rank: ['مرتبه علمی', 'مرتبه', 'academic_rank', 'rank'],
  degree: ['مدرک', 'آخرین مدرک', 'مدرک تحصیلی', 'degree'],
  cooperation: ['طریقه همکاری', 'نحوه همکاری', 'نوع همکاری', 'cooperation_type'],
  employment: ['نوع استخدام', 'نوع استخدامی', 'employment_type'],
  personnelNo: ['شماره مستخدم', 'شماره پرسنلی', 'personnel_no'],
  hireDate: ['تاریخ استخدام', 'hire_date'],
  lastDegreeYear: ['سال اخذ آخرین مدرک', 'سال مدرک', 'last_degree_year'],
  field: ['رشته و گرایش', 'رشته تحصیلی', 'field_of_study'],
  fieldMain: ['رشته', 'رشته اصلی', 'field'],
  // ── هویت ثبت‌احوالی (فایل استادان همان ستون‌های فایل دانشجویان را دارد) ──
  fatherName: ['نام پدر', 'father_name'],
  birthCertNo: ['شماره شناسنامه', 'شناسنامه', 'birth_cert_no'],
  birthDate: ['تاریخ تولد', 'birth_date'],
  placeOfBirth: ['محل تولد', 'place_of_birth'],
  placeOfIssue: ['محل صدور', 'place_of_issue'],
  address: ['آدرس', 'نشانی', 'address'],
  maritalCode: ['کد وضعیت تاهل', 'کد تاهل', 'marital_status_code'],
  countryCode: ['کد کشور آخرین مدرک تحصیلی', 'کد کشور', 'degree_country_code'],
  marital: ['وضعیت تاهل', 'تاهل', 'marital_status'],
  university: ['دانشگاه محل اخذ آخرین مدرک تحصیلی', 'دانشگاه محل اخذ مدرک', 'دانشگاه', 'last_degree_university'],
  base: ['پایه استادی', 'پایه', 'academic_base'],
  province: ['استان محل تولد', 'استان', 'birth_province'],
  city: ['شهر محل تولد', 'شهر', 'birth_city'],
  bank: ['شماره حساب', 'حساب بانکی', 'bank_account'],
  phone: ['تلفن ثابت', 'تلفن', 'phone'],
  mobile: ['موبایل', 'همراه', 'تلفن همراه', 'mobile'],
  email: ['ایمیل', 'آدرس الکترونیکی', 'پست الکترونیک', 'email'],
  gender: ['جنسیت', 'جنس', 'gender'],
  active: ['فعال', 'وضعیت', 'is_active', 'active'],
  photo: ['نام فایل عکس', 'عکس', 'فایل عکس', 'تصویر', 'photo', 'photo_file', 'image', 'picture'],
} as const;

const GENDER_FA: Record<string, string> = {
  'مرد': 'MALE', 'مذکر': 'MALE', 'male': 'MALE', 'm': 'MALE', 'آقاي': 'MALE', 'آقای': 'MALE',
  'زن': 'FEMALE', 'مونث': 'FEMALE', 'female': 'FEMALE', 'f': 'FEMALE', 'خانم': 'FEMALE',
};

/** «دکتر رضا احمدی» → لقب + نام + فامیل (فایل قدیمی معمولاً یک ستون نام دارد) */
export function splitFullName(full: string): { title: string | null; first: string; last: string } {
  const parts = norm(full).split(' ').filter(Boolean);
  let title: string | null = null;
  while (parts.length > 1 && /^(آقای|آقاي|جناب|خانم|سرکار|سركار|دکتر|دكتر|مهندس|استاد|حاج)$/.test(parts[0])) {
    title = title ? `${title} ${parts[0]}` : parts[0];
    parts.shift();
  }
  if (!parts.length) return { title, first: '', last: '' };
  if (parts.length === 1) return { title, first: parts[0], last: parts[0] };
  return { title, first: parts[0], last: parts.slice(1).join(' ') };
}

/** «احمدی رضا» (ستون «نام خانوادگي و نام») → فامیل + نام */
export function splitFullNameReversed(full: string): { title: string | null; first: string; last: string } {
  const parts = norm(full).split(' ').filter(Boolean);
  let title: string | null = null;
  while (parts.length > 1 && /^(آقای|جناب|خانم|سرکار|دکتر|مهندس|استاد|حاج)$/.test(parts[0])) {
    title = title ? `${title} ${parts[0]}` : parts[0];
    parts.shift();
  }
  if (!parts.length) return { title, first: '', last: '' };
  if (parts.length === 1) return { title, first: parts[0], last: parts[0] };
  // آخرین کلمه = نام کوچک، بقیه = نام خانوادگی (فامیل چندبخشی رایج است)
  return { title, first: parts[parts.length - 1], last: parts.slice(0, -1).join(' ') };
}

export function parseProfessorRow(get: CellReader): RowResult<ParsedProfessor> {
  const A = PROFESSOR_ALIASES;
  const warnings: string[] = [];

  const staffCode = get([...A.staffCode]);
  if (!staffCode) return bad('کد استادی الزامی است (کلید یکتای استاد در سامانه).');

  // { exact } لازم است: وگرنه نامک «نام خانوادگی» ستون «نام و نام خانوادگی» را
  // برمی‌دارد و نام کامل به‌جای فامیل ثبت می‌شود (به‌جای تفکیک درست).
  let first = get([...A.first], { exact: true });
  let last = get([...A.last], { exact: true });
  let title = get([...A.title]) || null;
  if (!first || !last) {
    const full = get([...A.fullName], { exact: true });   // «استاد» نباید با «کد استادی» بخورد
    if (full) {
      const s = splitFullName(full);
      first = first || s.first;
      last = last || s.last;
      title = title || s.title;
    }
  }
  if (!first || !last) {
    const rev = get([...A.fullNameReversed], { exact: true });   // «نام خانوادگي و نام»
    if (rev) {
      const s = splitFullNameReversed(rev);
      first = first || s.first;
      last = last || s.last;
      title = title || s.title;
    }
  }
  if (!first || !last) return bad(`نام و نام خانوادگی استاد ${staffCode} خوانده نشد (ستون «نام»/«نام خانوادگی» یا «نام و نام خانوادگی»).`);

  const nationalCode = get([...A.nationalCode]) || null;
  if (nationalCode) {
    const chk = checkNationalCode(nationalCode);
    if (chk === 'format') {
      warnings.push(`کد ملی «${nationalCode}» قالب معتبر ندارد — استاد ${staffCode} بدون کد ملی ثبت می‌شود.`);
    } else if (chk === 'checksum') {
      warnings.push(`چک‌سام کد ملی ${nationalCode} منطبق نیست (در دادهٔ قدیمی رایج است) — ثبت می‌شود.`);
    }
  } else {
    warnings.push(`استاد ${staffCode} کد ملی ندارد — حساب کاربری با شناسهٔ جایگزین ساخته می‌شود و امکان ورود ندارد تا کد ملی اصلاح شود.`);
  }

  const yearRaw = get([...A.lastDegreeYear]);
  const year = num(yearRaw);
  if (yearRaw && (year == null || year < 1300 || year > 1450)) warnings.push(`سال اخذ مدرک «${yearRaw}» نامعتبر — نادیده گرفته شد.`);

  const genderRaw = norm(get([...A.gender]) || title || '');
  const gender = GENDER_FA[genderRaw] ?? (/^(MALE|FEMALE)$/i.test(genderRaw) ? genderRaw.toUpperCase() : null);

  const activeRaw = get([...A.active]);
  const isActive = activeRaw ? !/غیرفعال|غير فعال|inactive|0/i.test(norm(activeRaw)) : true;

  const validNc = nationalCode && checkNationalCode(nationalCode) !== 'format' ? nationalCode : null;

  const maritalCodeRaw = get([...A.maritalCode]);
  const maritalCode = num(maritalCodeRaw);
  const birthDateRaw = get([...A.birthDate]);
  if (birthDateRaw && !jalali(birthDateRaw)) {
    warnings.push(`تاریخ تولد «${birthDateRaw}» قالب شمسی (۱۳۶۰/۰۵/۱۲) ندارد — نادیده گرفته شد.`);
  }

  return ok({
    staffCode,
    nationalCode: validNc,
    photoFile: get([...A.photo]) || null,
    fieldMain: get([...A.fieldMain], { exact: true }) || null,
    fatherName: get([...A.fatherName]) || null,
    birthCertNo: get([...A.birthCertNo]) || null,
    birthDate: jalali(birthDateRaw),
    placeOfBirth: get([...A.placeOfBirth]) || null,
    placeOfIssue: get([...A.placeOfIssue]) || null,
    address: get([...A.address]) || null,
    maritalStatusCode: maritalCode != null && Number.isInteger(maritalCode) ? maritalCode : null,
    lastDegreeCountryCode: get([...A.countryCode]) || null,
    firstName: first,
    lastName: last,
    title,
    departmentName: get([...A.department]) || null,
    facultyName: get([...A.faculty]) || null,
    academicRank: get([...A.rank]) || null,
    degree: get([...A.degree]) || null,
    cooperationType: get([...A.cooperation]) || null,
    employmentType: get([...A.employment]) || null,
    personnelNo: get([...A.personnelNo]) || null,
    hireDate: jalali(get([...A.hireDate])),
    lastDegreeYear: year != null && year >= 1300 && year <= 1450 ? Math.round(year) : null,
    fieldOfStudy: get([...A.field]) || null,
    maritalStatus: get([...A.marital]) || null,
    lastDegreeUniversity: get([...A.university]) || null,
    academicBase: get([...A.base]) || null,
    birthProvince: get([...A.province]) || null,
    birthCity: get([...A.city]) || null,
    bankAccountNo: get([...A.bank]) || null,
    phone: get([...A.phone]) || null,
    mobile: get([...A.mobile]) || null,
    email: get([...A.email]) || null,
    gender,
    isActive,
  }, warnings);
}

/** فقط برای خوانایی تست‌ها */
export const REFERENCE_HELPERS = { jalali, boolFa };
