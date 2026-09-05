// ═══ لایهٔ ورودی یکپارچه: CSV و Excel با یک API مشترک ═══
// همهٔ ماژول‌های مهاجرت (کدها، شهریه، مالی، نمرات، دانشجو/درس/ترم) از این لایه
// تغذیه می‌شوند تا کاربر بتواند هر کدام را با فایل «اکسل» یا «CSV» بدهد.
import { norm, parseCsv, pickCol } from './normalize';
import { readXlsx } from './xlsx';

export type Table = {
  sheet: string;
  headers: string[];
  rows: string[][];
  /**
   * نگاشت دستی ستون‌ها که کاربر در گام «بررسی ستون‌ها» تأیید کرده است:
   * { کلید فیلد (نخستین نامک) → شمارهٔ ستون در فایل }. اگر باشد، بر تشخیص
   * خودکار اولویت دارد؛ ‎-1‎ یعنی «این ستون در فایل نیست».
   */
  columnMap?: Record<string, number>;
};

export type TableRow = {
  /** شمارهٔ خط انسانی در فایل (۱ = سرستون) */
  line: number;
  /** خواندن ستون با نامک‌های فارسی/انگلیسی ({ exact } = فقط برابری دقیق) */
  get: (aliases: string[], opts?: { exact?: boolean }) => string;
  cells: string[];
  raw: Record<string, string>;
};

const XLSX_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"

export function looksLikeXlsx(fileName: string, buf: Buffer): boolean {
  if (/\.(xlsx|xlsm)$/i.test(fileName)) return true;
  return buf.length > 4 && buf.subarray(0, 4).equals(XLSX_SIG);
}

/** فایل (اکسل یا CSV) → فهرست جدول‌ها. CSV همیشه یک جدول است. */
export function parseTabular(fileName: string, buf: Buffer): Table[] {
  if (looksLikeXlsx(fileName, buf)) {
    return readXlsx(buf)
      .map(sh => {
        const rows = sh.rows.filter(r => r.some(c => (c ?? '').trim() !== ''));
        if (!rows.length) return null;
        return { sheet: sh.name, headers: rows[0].map(h => norm(h)), rows: rows.slice(1) };
      })
      .filter((t): t is Table => t !== null);
  }
  const text = buf.toString('utf8');
  const table = parseCsv(text);
  if (!table.length) return [];
  return [{ sheet: 'CSV', headers: table[0].map(h => norm(h)), rows: table.slice(1) }];
}

/** انتخاب جدول مناسب: شیتی که بیشترین سرستون‌های مورد انتظار را دارد */
export function pickTable(tables: Table[], expected: string[][]): Table | null {
  if (!tables.length) return null;
  let best = tables[0];
  let bestScore = -1;
  for (const t of tables) {
    const score = expected.reduce((s, aliases) => s + (pickCol(t.headers, aliases).idx >= 0 ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

/** پیمایش ردیف‌های یک جدول با کمکی‌های خواندن ستون */
export function iterate(table: Table): TableRow[] {
  const cache = new Map<string, number>();
  const idxOf = (aliases: string[], opts?: { exact?: boolean }) => {
    const key = aliases.join('|');
    if (!cache.has(key)) {
      const manual = table.columnMap?.[aliases[0]];
      cache.set(key, typeof manual === 'number' ? manual : pickCol(table.headers, aliases, opts).idx);
    }
    return cache.get(key) as number;
  };
  return table.rows.map((cells, i) => {
    const raw: Record<string, string> = {};
    table.headers.forEach((h, c) => { if (h) raw[h] = norm(cells[c] ?? ''); });
    return {
      line: i + 2,
      cells,
      raw,
      get: (aliases: string[], opts?: { exact?: boolean }) => {
        const idx = idxOf(aliases, opts);
        return idx >= 0 ? norm(cells[idx] ?? '') : '';
      },
    };
  });
}

/** آیا هیچ‌کدام از سرستون‌های الزامی وجود ندارد؟ (پیام خطای دقیق برای کاربر) */
export function missingHeaders(table: Table, required: { title: string; aliases: string[] }[]): string[] {
  return required
    .filter(r => {
      const manual = table.columnMap?.[r.aliases[0]];
      const idx = typeof manual === 'number' ? manual : pickCol(table.headers, r.aliases).idx;
      return idx < 0;
    })
    .map(r => r.title);
}

/** ساخت یک جدول از سطرهای خامِ ذخیره‌شده در staging (برای پردازش دوباره) */
export function tableFromRaw(sheet: string, headers: string[], rows: Record<string, unknown>[]): Table {
  return {
    sheet,
    headers,
    rows: rows.map(r => headers.map(h => String((r as Record<string, unknown>)[h] ?? ''))),
  };
}
