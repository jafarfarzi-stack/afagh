// ═══ نرمال‌سازی دادهٔ سیستم‌های قدیمی ═══
// ارقام فارسی/عربی، جداکنندهٔ هزارگان، ممیز فارسی، فاصله‌های نیم‌فاصله، تاریخ شمسی→میلادی

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

/** ارقام فارسی/عربی → لاتین + حذف جداکنندهٔ هزارگان (٬ ، ,) + ممیز فارسی ٫→. + فاصله‌های زائد */
export function norm(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/[۰-۹]/g, d => FA.indexOf(d).toString())
    .replace(/[٠-٩]/g, d => AR.indexOf(d).toString())
    .replace(/[\u066C\u2019,\s](?=\d{3}\b)/g, '')   // جداکنندهٔ هزارگان ٬ ' ,
    .replace(/\u066B/g, '.')                          // ممیز فارسی ٫
    .replace(/[\u200c\u200f]/g, ' ')                 // نیم‌فاصله → فاصله (برای متن‌ها)
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** عدد از هر فرمت فارسی — null اگر خالی/نامعتبر */
export function num(v: unknown): number | null {
  const s = norm(v).replace(/ /g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** بله/true/1/yes → true */
export function boolFa(v: unknown): boolean {
  const s = norm(v).toLowerCase();
  return ['1', 'بله', 'true', 'yes', 'y', '✓'].includes(s);
}

/** تاریخ شمسی (1399/08/15 یا 1399-08-15) → Date ؛ میلادی ISO هم قبول */
export function dateFa(v: unknown): Date | null {
  const s = norm(v).replace(/[-.]/g, '/');
  if (!s) return null;
  const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const g = jalaliToGregorian(+m[1], +m[2], +m[3]);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 8, 30, 0));
}

/** الگوریتم استاندارد جلالی→میلادی (jalaali) */
export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  jy += 1595;
  let days = -355668 + 365 * jy + ~~(jy / 33) * 8 + ~~(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * ~~(days / 146097);
  days %= 146097;
  if (days > 36524) {
    days--;
    gy += 100 * ~~(days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * ~~(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += ~~((days - 365) / 366);
    days = 365 - (days - 365);
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (; gm < 12 && gd > sal[gm]; gm++) gd -= sal[gm];
  return { gy, gm: gm + 1, gd };
}

/** اعتبارسنجی کد ملی (چک‌سام) — خروجی: 'ok' | 'format' | 'checksum' */
export function checkNationalCode(code: string): 'ok' | 'format' | 'checksum' {
  if (!/^\d{10}$/.test(code)) return 'format';
  if (/^(\d)\1{9}$/.test(code)) return 'checksum';
  const sum = code.split('').slice(0, 9).reduce((s, d, i) => s + +d * (10 - i), 0);
  const r = sum % 11;
  const check = +code[9];
  return (r < 2 ? r : 11 - r) === check ? 'ok' : 'checksum';
}

/** CSV مقاوم: BOM، کوتیشن، کاما/سمی‌کالن/تب، CRLF */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const firstLine = clean.split('\n')[0] || '';
  const delim = [',', ';', '\t'].map(d => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQ) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { cur.push(field); field = ''; }
    else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
    else field += c;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

/** یافتن ستون با نامک‌های فارسی/انگلیسی (بدون حساسیت به فاصله/زیرخط) */
export function pickCol(headers: string[], aliases: string[]): { idx: number; matched?: string } {
  const key = (x: string) => norm(x).toLowerCase().replace(/[\s_-]+/g, '');
  const hk = headers.map(key);
  for (const a of aliases) {
    const i = hk.indexOf(key(a));
    if (i >= 0) return { idx: i, matched: a };
  }
  return { idx: -1 };
}
