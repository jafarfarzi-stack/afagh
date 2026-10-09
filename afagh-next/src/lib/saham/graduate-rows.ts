import 'server-only';
import { mapSahamValue, type SahamInstituteCode } from './saham-maps';
import { jalaliDateOf } from '@/lib/scheduling-core';
import { sahamNative, type RawStudent } from './student-rows';

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
 * گزارش دانش‌آموختگان سهام (2-Graduate.xlsx):
 * شیت ۱ «اطلاعات ثبتی دانش آموختگان» (۴۳ ستون) + شیت ۲ «وضعیت نظام وظیفه».
 * منبع: همان RawStudent با فیلتر status=GRADUATED + بازهٔ تاریخ فراغت.
 */

/** سرستون‌های رسمی شیت اول — ترتیب عیناً همین باشد */
export const SAHAM_GRADUATE_HEADERS = [
  'نام موسسه آموزش عالی',
  'کد دانشکده / مرکز / واحد',
  'نام  دانشکده / مرکز / واحد',
  'استان محل استقرار  دانشکده / مرکز / واحد',
  'شهر محل استقرار  دانشکده / مرکز / واحد',
  'شیوه آموزش',
  'نوع تحصیل',
  'کد دوره تحصیلی',
  'دوره تحصیلی',
  'کد رشته تحصیلی',
  'رشته تحصیلی',
  'وضعیت کلی دانشجو',
  'کد وضعیت کلی دانشجو',
  'شماره دانشجویی',
  'سال ورود/ نیمسال اول یا دوم',
  'نیمسال فارغ التحصیلی',
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
  'آدرس محل سکونت دائمی',
  'شماره تلفن ثابت',
  'شماره تلفن همراه',
  'پست الکترونیکی',
  'تابعیت',
  'کشور تابعیت',
  'تعداد نیمسال های مرخصی',
  'تعداد نیمسال های مشروطی',
  'معدل کل',
  'جمع واحد گذرانده',
  'جمع واحد مردودی',
  'شناسه فراگیر اتباع خارجی',
] as const;

/** سرستون‌های رسمی شیت دوم «وضعیت نظام وظیفه» */
export const SAHAM_MILITARY_HEADERS = [
  'شماره ملی',
  'شماره دانشجویی',
  'نام',
  'نام خانوادگی',
  'وضعیت نظام وظیفه',
] as const;

export function toSahamGraduateRow(
  r: RawStudent,
  maps: Record<string, Record<string, string>>,
  codeRow: SahamInstituteCode | null,
  geo: { province: Record<string, string>; city: Record<string, string> },
): string[] {
  const m = (field: string, v: unknown) => mapSahamValue(maps, field, v);
  const inst = codeRow ? { code: codeRow.code, title: codeRow.title } : { code: '', title: r.facultyTitle ?? '' };
  const provName = codeRow?.provinceCode ? (geo.province[codeRow.provinceCode] ?? '') : '';
  const cityName = codeRow?.cityCode ? (geo.city[codeRow.cityCode] ?? '') : '';
  // نیمسال فراغت: سال+نیمسال پایان، وگرنه تاریخ فراغت
  const gradTerm = r.eduEndYear != null
    ? `${r.eduEndYear}${r.eduEndSemester === 2 ? '2' : '1'}`
    : (r.graduateDate ?? '');

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
    m('student_status', r.status),
    m('student_status_code', r.status),
    r.studentCode,
    r.entryYear != null ? `${r.entryYear}${r.entryTerm === 2 ? '2' : '1'}` : '',
    gradTerm,
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
    r.address ?? '',
    r.homeTell ?? '',
    r.mobile ?? '',
    r.email ?? '',
    r.countryTitle ?? (r.nationality === '120001' ? 'ایران' : ''),
    r.countryTitle ?? '',
    r.leaveSemesters != null ? String(r.leaveSemesters) : '',
    r.probationSemesters != null ? String(r.probationSemesters) : '',
    r.totalAverage ?? '',
    r.totalPassedUnits != null ? String(r.totalPassedUnits) : '',
    r.totalFailedUnits != null ? String(r.totalFailedUnits) : '',
    r.foreignStudentId ?? '',
  ];
}

export function toSahamMilitaryRow(r: RawStudent): string[] {
  return [
    r.nationalCode ?? '',
    r.studentCode,
    r.firstName ?? '',
    r.lastName ?? '',
    r.militaryStatus ?? '',
  ];
}
