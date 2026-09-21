import fs from 'fs';

const sama = JSON.parse(fs.readFileSync('scripts/sama-grade-status-table.json', 'utf8'));

// Also fetch titles from legacy_code_maps to have clean Persian
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function run() {
  const dbRows = await pool.query(`SELECT "legacyCode", "legacyTitle" FROM legacy_code_maps WHERE domain='GRADE_STATUS'`);
  const titleMap = new Map(dbRows.rows.map(r => [r.legacyCode, r.legacyTitle]));

  const codes = sama.map(s => {
    const code = s.Code.trim();
    // Prefer clean title from DB or fallback to file title
    let title = titleMap.get(code) || s.Title.trim();
    const passed = s.AssumeAsPassed === 'True';
    const affectsGpa = s.Avgeffect === 'True';
    const affectsTermGpa = s.TermAvgEffect === 'True';
    const isDropped = title.includes('حذف') || ['-1', '-3', '-4', '-5', '-91', '6', '7', '8', '9', '14', '15', '55', '200', '201', '931', '941', '951'].includes(code);

    return {
      code,
      title,
      passed,
      affectsGpa,
      affectsTermGpa,
      isDropped,
    };
  });

  // Sort logically: positive numbers asc, negative numbers desc
  codes.sort((a, b) => {
    const na = Number(a.code), nb = Number(b.code);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.code.localeCompare(b.code);
  });

  let fileContent = `// ═══════════════════════════════════════════════════════════════════════
//  فهرست مرجع کدهای «وضع نمره» سما (میز تطبیق GRADE_STATUS)
//  منبع: فایل رسمی صادرشده توسط سامانهٔ سما دانشگاه آفاق (وضع نمرات در کارنامه.txt).
//  این جدول مرجع کدگذاری سراسری است.
// ═══════════════════════════════════════════════════════════════════════

export type GradeStatusCode = {
  code: string;
  title: string;
  /** آیا این کد به‌عنوان «قبول» تلقی می‌شود (پاس شده) */
  passed: boolean;
  /** آیا در معدل کل دانشگاه اثر دارد */
  affectsGpa: boolean;
  /** آیا در معدل نیمسال اثر دارد */
  affectsTermGpa?: boolean;
  /** آیا درس حذف شده است (حذف پزشکی، شورا، اضطراری و ...) */
  isDropped?: boolean;
};

export const GRADE_STATUS_CODES: GradeStatusCode[] = [
`;

  for (const c of codes) {
    fileContent += `  { code: '${c.code}', title: '${c.title}', passed: ${c.passed}, affectsGpa: ${c.affectsGpa}, affectsTermGpa: ${c.affectsTermGpa}, isDropped: ${c.isDropped} },\n`;
  }

  fileContent += `];

/** کدهای سمای بدون اثر در معدل کل (مجموعهٔ سریع برای فیلتر) */
export const NON_GPA_CODES = new Set(
  GRADE_STATUS_CODES.filter(g => !g.affectsGpa).map(g => g.code),
);

/** کدهای سمای بدون اثر در معدل نیمسال */
export const NON_TERM_GPA_CODES = new Set(
  GRADE_STATUS_CODES.filter(g => !g.affectsTermGpa).map(g => g.code),
);

/** کدهای دروسی که حذف شده‌اند (نه قبولی است نه مردودی) */
export const DROPPED_CODES = new Set(
  GRADE_STATUS_CODES.filter(g => g.isDropped).map(g => g.code),
);

/** برچسب نمایشی «کد — عنوان» برای dropdown */
export function gradeStatusOptionLabel(g: GradeStatusCode): string {
  return \`\${g.code} — \${g.title}\`;
}

/** جست‌وجوی عنوان از روی کد (برای نمایش/tooltip) */
export function gradeStatusTitleOf(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim();
  return GRADE_STATUS_CODES.find(g => g.code === c)?.title ?? null;
}

/** آیا کد داده شده نشان‌دهندهٔ قبولی است؟ */
export function isPassedStatusCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const c = code.trim();
  const found = GRADE_STATUS_CODES.find(g => g.code === c);
  return found ? found.passed : false;
}

/** آیا کد داده شده نشان‌دهندهٔ حذف درس است؟ */
export function isDroppedStatusCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return DROPPED_CODES.has(code.trim());
}
`;

  fs.writeFileSync('src/lib/grade-status-codes.ts', fileContent, 'utf8');
  console.log('Wrote updated src/lib/grade-status-codes.ts with', codes.length, 'codes');
}

run().finally(() => pool.end());
