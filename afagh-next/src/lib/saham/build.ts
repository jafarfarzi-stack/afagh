import 'server-only';
import { writeXlsx, type SheetSpec } from '@/lib/migration/xlsx';
import { fetchSahamStudents, toSahamRow, SAHAM_STUDENT_HEADERS } from './student-rows';
import { loadGeoTitles, pickSahamCode } from './saham-maps';

/**
 * ساخت فایل اکسل گزارش سهام برای یک دانشگاه.
 * قالب دقیقاً همان 1-Student.xlsx رسمی است: سرستون‌ها + رکوردها.
 */
export async function buildSahamWorkbook(universityId: number): Promise<{ buf: Buffer; fileName: string; count: number }> {
  const { rows, maps, codes } = await fetchSahamStudents(universityId);
  const geo = await loadGeoTitles();

  const data: string[][] = rows.map(r => {
    const codeRow = pickSahamCode(codes, r.universityId, r.facultyId ?? null);
    return toSahamRow(r, maps, codeRow, geo);
  });

  const sheet: SheetSpec = {
    name: 'اطلاعات ثبتی دانشجویان',
    rows: [[...SAHAM_STUDENT_HEADERS], ...data],
    // ستون‌های کد/شماره باید متنی بمانند — عرض کم برای ستون‌های بلند
    widths: SAHAM_STUDENT_HEADERS.map(h => (h.length > 22 ? 28 : 16)),
  };

  const buf = writeXlsx([sheet]);
  const uniTitle = rows[0]?.universityTitle ?? 'unknown';
  const safe = uniTitle.replace(/[\\/:*?"<>|]/g, '_').trim();
  return { buf, fileName: `SAHAM-Students-${safe}.xlsx`, count: rows.length };
}