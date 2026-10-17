import 'server-only';
import { writeXlsx, type SheetSpec } from '@/lib/migration/xlsx';
import {
  fetchSahamStudents, toSahamRow, SAHAM_STUDENT_HEADERS,
  type SahamStudentFilters, type RawStudent, SAHAM_DEFAULT_LIMIT,
} from './student-rows';
import { toSahamGraduateRow, toSahamMilitaryRow, SAHAM_GRADUATE_HEADERS, SAHAM_MILITARY_HEADERS } from './graduate-rows';
import { fetchSahamInstructors, toSahamInstructorRow, SAHAM_INSTRUCTOR_HEADERS } from './instructor-rows';
import { loadGeoTitles, pickSahamCode, type SahamInstituteCode } from './saham-maps';

export type SahamKind = 'students' | 'graduates' | 'instructors';

/**
 * ساخت **یک** فایل اکسل برای **چند مؤسسه** (خروجی «دانلود همه»).
 *
 * چرا معتبر است: ستون اول هر سه قالب رسمی «نام موسسه آموزش عالی» است و
 * کد واحد/دانشکده هر ردیف با `pickSahamCode(codes, universityId, facultyId)`
 * بر پایهٔ همان ردیف انتخاب می‌شود؛ پس تجمیع ردیف‌ها دادهٔ نادرست تولید نمی‌کند.
 */
export async function buildSahamWorkbookMany(
  universityIds: number[],
  kind: SahamKind,
  filters: SahamBuildFilters = {},
): Promise<{ buf: Buffer; fileName: string; count: number; total: number; hasMore: boolean }> {
  const ids = [...new Set(universityIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) throw new Error('مؤسسه‌ای برای خروجی یافت نشد.');

  const geo = await loadGeoTitles();

  if (kind === 'instructors') {
    if (!filters.termId) throw new Error('برای گزارش آموزشگران انتخاب نیمسال لازم است.');
    const data: string[][] = [];
    for (const id of ids) {
      const { rows, maps, codes } = await fetchSahamInstructors(id, filters.termId, filters.limit ?? SAHAM_DEFAULT_LIMIT);
      for (const r of rows) data.push(toSahamInstructorRow(r, maps, pickSahamCode(codes, r.universityId, r.facultyId ?? null), geo));
    }
    const buf = writeXlsx([{
      name: 'اطلاعات ثبتی آموزشگران',
      rows: [[...SAHAM_INSTRUCTOR_HEADERS], ...data],
      widths: widthsFor(SAHAM_INSTRUCTOR_HEADERS),
    }]);
    return { buf, fileName: `SAHAM-Instructors-${ids.length}مؤسسه.xlsx`, count: data.length, total: data.length, hasMore: false };
  }

  const sf: SahamStudentFilters = { ...filters };
  if (kind === 'graduates') sf.status = 'GRADUATED';

  const all: RawStudent[] = [];
  let total = 0;
  let hasMore = false;
  let maps: Record<string, Record<string, string>> = {};
  let codes = new Map<number, SahamInstituteCode[]>();
  for (const id of ids) {
    const part = await fetchSahamStudents(id, sf);
    all.push(...part.rows);
    total += part.total;
    hasMore = hasMore || part.hasMore;
    maps = part.maps;
    codes = part.codes;
  }
  all.sort((a, b) => String(a.studentCode).localeCompare(String(b.studentCode)));

  if (kind === 'graduates') {
    const data = all.map((r) => toSahamGraduateRow(r, maps, pickSahamCode(codes, r.universityId, r.facultyId ?? null), geo));
    const mil = all.map(toSahamMilitaryRow);
    const buf = writeXlsx([
      { name: 'اطلاعات ثبتی دانش آموختگان', rows: [[...SAHAM_GRADUATE_HEADERS], ...data], widths: widthsFor(SAHAM_GRADUATE_HEADERS) },
      { name: 'وضعیت نظام وظیفه', rows: [[...SAHAM_MILITARY_HEADERS], ...mil], widths: [16, 16, 14, 16, 24] },
    ]);
    return { buf, fileName: `SAHAM-Graduates-${ids.length}مؤسسه.xlsx`, count: all.length, total, hasMore };
  }

  const data = all.map((r) => toSahamRow(r, maps, pickSahamCode(codes, r.universityId, r.facultyId ?? null), geo));
  const mil = all.map(toSahamMilitaryRow);
  const buf = writeXlsx([
    { name: 'اطلاعات ثبتی دانشجویان', rows: [[...SAHAM_STUDENT_HEADERS], ...data], widths: widthsFor(SAHAM_STUDENT_HEADERS) },
    { name: 'وضعیت نظام وظیفه', rows: [[...SAHAM_MILITARY_HEADERS], ...mil], widths: [16, 16, 14, 16, 24] },
  ]);
  return { buf, fileName: `SAHAM-Students-${ids.length}مؤسسه.xlsx`, count: all.length, total, hasMore };
}

export const SAHAM_KIND_LABEL: Record<SahamKind, string> = {
  students: 'دانشجویان',
  graduates: 'دانش‌آموختگان',
  instructors: 'آموزشگران',
};

export interface SahamBuildFilters extends SahamStudentFilters {
  termId?: number;
}

function widthsFor(headers: readonly string[]): number[] {
  return headers.map(h => (h.length > 22 ? 28 : 16));
}

/**
 * ساخت فایل اکسل گزارش سهام برای یک دانشگاه + نوع گزارش + فیلتر.
 * قالب‌ها عیناً همان فایل‌های رسمی‌اند (۵۲ / ۴۳+۵ / ۳۷ ستون).
 */
export async function buildSahamWorkbook(
  universityId: number,
  kind: SahamKind,
  filters: SahamBuildFilters = {},
): Promise<{ buf: Buffer; fileName: string; count: number; total: number; hasMore: boolean }> {
  const geo = await loadGeoTitles();

  if (kind === 'instructors') {
    if (!filters.termId) throw new Error('برای گزارش آموزشگران انتخاب نیمسال لازم است.');
    const { rows, maps, codes } = await fetchSahamInstructors(universityId, filters.termId, filters.limit ?? SAHAM_DEFAULT_LIMIT);
    const data = rows.map(r => toSahamInstructorRow(r, maps, pickSahamCode(codes, r.universityId, r.facultyId ?? null), geo));
    const sheet: SheetSpec = {
      name: 'اطلاعات ثبتی آموزشگران',
      rows: [[...SAHAM_INSTRUCTOR_HEADERS], ...data],
      widths: widthsFor(SAHAM_INSTRUCTOR_HEADERS),
    };
    const buf = writeXlsx([sheet]);
    const uni = rows[0]?.universityTitle ?? `uni${universityId}`;
    return {
      buf,
      fileName: `SAHAM-Instructors-${uni}.xlsx`,
      count: rows.length, total: rows.length, hasMore: false,
    };
  }

  // دانشجویان (همهٔ وضعیت‌ها) یا دانش‌آموختگان (بازهٔ فراغت)
  const sf: SahamStudentFilters = { ...filters };
  if (kind === 'graduates') sf.status = 'GRADUATED';
  const { rows, total, hasMore, maps, codes } = await fetchSahamStudents(universityId, sf);
  const uni = rows[0]?.universityTitle ?? `uni${universityId}`;

  if (kind === 'graduates') {
    const data = rows.map(r => toSahamGraduateRow(r, maps, pickSahamCode(codes, r.universityId, r.facultyId ?? null), geo));
    const mil = rows.map(toSahamMilitaryRow);
    const buf = writeXlsx([
      { name: 'اطلاعات ثبتی دانش آموختگان', rows: [[...SAHAM_GRADUATE_HEADERS], ...data], widths: widthsFor(SAHAM_GRADUATE_HEADERS) },
      { name: 'وضعیت نظام وظیفه', rows: [[...SAHAM_MILITARY_HEADERS], ...mil], widths: [16, 16, 14, 16, 24] },
    ]);
    return { buf, fileName: `SAHAM-Graduates-${uni}.xlsx`, count: rows.length, total, hasMore };
  }

  const data = rows.map(r => toSahamRow(r, maps, pickSahamCode(codes, r.universityId, r.facultyId ?? null), geo));
  // شیت دوم «وضعیت نظام وظیفه» — در فایل رسمی 1-Student.xlsx هم وجود دارد
  const mil = rows.map(toSahamMilitaryRow);
  const buf = writeXlsx([
    { name: 'اطلاعات ثبتی دانشجویان', rows: [[...SAHAM_STUDENT_HEADERS], ...data], widths: widthsFor(SAHAM_STUDENT_HEADERS) },
    { name: 'وضعیت نظام وظیفه', rows: [[...SAHAM_MILITARY_HEADERS], ...mil], widths: [16, 16, 14, 16, 24] },
  ]);
  return { buf, fileName: `SAHAM-Students-${uni}.xlsx`, count: rows.length, total, hasMore };
}
