import 'server-only';
import { writeXlsx, type SheetSpec } from '@/lib/migration/xlsx';
import {
  fetchSahamStudents, toSahamRow, SAHAM_STUDENT_HEADERS,
  type SahamStudentFilters, SAHAM_DEFAULT_LIMIT,
} from './student-rows';
import { toSahamGraduateRow, toSahamMilitaryRow, SAHAM_GRADUATE_HEADERS, SAHAM_MILITARY_HEADERS } from './graduate-rows';
import { fetchSahamInstructors, toSahamInstructorRow, SAHAM_INSTRUCTOR_HEADERS } from './instructor-rows';
import { loadGeoTitles, pickSahamCode } from './saham-maps';

export type SahamKind = 'students' | 'graduates' | 'instructors';

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
  const buf = writeXlsx([
    { name: 'اطلاعات ثبتی دانشجویان', rows: [[...SAHAM_STUDENT_HEADERS], ...data], widths: widthsFor(SAHAM_STUDENT_HEADERS) },
  ]);
  return { buf, fileName: `SAHAM-Students-${uni}.xlsx`, count: rows.length, total, hasMore };
}
