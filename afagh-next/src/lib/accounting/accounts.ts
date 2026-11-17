import 'server-only';
/**
 * کدینگِ حساب و دورهٔ مالیِ دفتر کل (حسابداریِ دوبل).
 *
 * این ماژول تنها «خواندن/ساختِ» زیرساختِ لازم برای ثبتِ سند است:
 *   • کدینگِ پیش‌فرضِ فارسی (DEFAULT_CHART) و ساختِ idempotent آن
 *   • تبدیلِ کدِ حساب (مثل 1101) به id
 *   • ساختِ خودکارِ دورهٔ مالیِ ماهانه برای هر تاریخ
 *
 * ⚠ همهٔ توابع با «دانشگاهِ بدونِ هیچ ردیف» هم امن هستند: هرجا لازم باشد
 * کدینگ/دوره به‌صورت on-demand ساخته می‌شود (ON CONFLICT DO NOTHING)، پس
 * هیچ فراخوانی به خطای «حساب یافت نشد» یا «دوره موجود نیست» نمی‌خورد.
 *
 * قرارداد: پول همیشه ریال و numeric(18,0)؛ منطقِ بدهکار/بستانکار در
 * gl_posting_rules (و مهاجرت 0142) مستند شده است.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/db';

/** نوعِ حساب — همان واژگانِ CHECKِ جدول gl_accounts */
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
/** طرفِ طبیعیِ حساب */
export type AccountSide = 'DEBIT' | 'CREDIT';

export type ChartAccount = {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  normalSide: AccountSide;
};

/**
 * کدینگِ پیش‌فرض — ۱۷ حسابِ سطحِ اول، عیناً همان ردیف‌هایی که مهاجرت
 * 0142 برای دانشگاه ۱ می‌کارد. 4101 «کاهندهٔ درآمد» است: type=REVENUE ولی
 * normalSide=DEBIT (تخفیف، درآمد را کم می‌کند).
 */
export const DEFAULT_CHART: ReadonlyArray<Omit<ChartAccount, 'id'>> = [
  // ── دارایی‌ها ──
  { code: '1001', name: 'صندوق', type: 'ASSET', normalSide: 'DEBIT' },
  { code: '1002', name: 'بانک و حسابهای نقدی', type: 'ASSET', normalSide: 'DEBIT' },
  { code: '1101', name: 'حسابهای دریافتنی دانشجویان', type: 'ASSET', normalSide: 'DEBIT' },
  { code: '1201', name: 'وامهای پرداختی به دانشجویان', type: 'ASSET', normalSide: 'DEBIT' },
  { code: '1301', name: 'اموال و تجهیزات', type: 'ASSET', normalSide: 'DEBIT' },
  // ── بدهی‌ها ──
  { code: '2001', name: 'حسابهای پرداختنی', type: 'LIABILITY', normalSide: 'CREDIT' },
  { code: '2101', name: 'پیشدریافتها', type: 'LIABILITY', normalSide: 'CREDIT' },
  { code: '2201', name: 'وامهای دریافتی', type: 'LIABILITY', normalSide: 'CREDIT' },
  // ── سرمایه ──
  { code: '3001', name: 'سرمایه و مانده انتظامی', type: 'EQUITY', normalSide: 'CREDIT' },
  // ── درآمد ──
  { code: '4001', name: 'درآمد شهریه', type: 'REVENUE', normalSide: 'CREDIT' },
  { code: '4002', name: 'درآمد خدمات آموزشی', type: 'REVENUE', normalSide: 'CREDIT' },
  { code: '4003', name: 'کمکهای خیرین و حامیان', type: 'REVENUE', normalSide: 'CREDIT' },
  { code: '4101', name: 'تخفیفات و بخشودگی', type: 'REVENUE', normalSide: 'DEBIT' },
  // ── هزینه‌ها ──
  { code: '5001', name: 'هزینهٔ حقوق و دستمزد', type: 'EXPENSE', normalSide: 'DEBIT' },
  { code: '5002', name: 'هزینه‌های عملیاتی', type: 'EXPENSE', normalSide: 'DEBIT' },
  { code: '5003', name: 'هزینهٔ پیمانکاران', type: 'EXPENSE', normalSide: 'DEBIT' },
  { code: '5004', name: 'برگشت وجه و اصلاحات', type: 'EXPENSE', normalSide: 'DEBIT' },
];

const DEFAULT_CODES: ReadonlySet<string> = new Set(DEFAULT_CHART.map((a) => a.code));

/** شناسهٔ دانشگاه را نرمال می‌کند تا هرگز با NaN به دیتابیس نرویم. */
function requireUniversityId(universityId: number): number {
  const uid = Number(universityId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error('شناسهٔ دانشگاه نامعتبر است.');
  }
  return uid;
}

/**
 * تاریخ را به شکل YYYY-MM-DD میلادی درمی‌آورد.
 *
 * برای Date از تقویمِ محلیِ سرور استفاده می‌کنیم (نه UTC) تا سندی که با
 * «امروزِ» محلی ثبت می‌شود در دورهٔ همان ماه بیفتد و نه ماهِ قبل.
 */
function toIsoDate(input: Date | string): string {
  if (typeof input === 'string') {
    const s = input.trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const parsed = new Date(s);
    if (!Number.isFinite(parsed.getTime())) throw new Error('تاریخ نامعتبر است.');
    return toIsoDate(parsed);
  }
  if (!(input instanceof Date) || !Number.isFinite(input.getTime())) {
    throw new Error('تاریخ نامعتبر است.');
  }
  const y = input.getFullYear();
  const m = String(input.getMonth() + 1).padStart(2, '0');
  const d = String(input.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * کدینگِ پیش‌فرض را برای دانشگاه می‌سازد — idempotent.
 * ردیف‌های موجود دست نمی‌خورند (ON CONFLICT DO NOTHING)، پس تغییرِ نام یا
 * نوعِ حساب توسط کاربر با فراخوانیِ دوباره بازنویسی نمی‌شود.
 */
export async function ensureDefaultChart(universityId: number, exec?: any): Promise<void> {
  const uid = requireUniversityId(universityId);
  const ex = exec ?? db;
  const rows = DEFAULT_CHART.map(
    (a) => sql`(${uid}::integer, ${a.code}::varchar, ${a.name}::varchar, ${a.type}::varchar, ${a.normalSide}::varchar)`,
  );
  await ex.execute(sql`
    INSERT INTO gl_accounts ("universityId", code, name, type, "normalSide", level)
    VALUES ${sql.join(rows, sql`, `)}
    ON CONFLICT ("universityId", code) DO NOTHING
  `);
}

/**
 * کدِ حساب → id. اگر حساب نبود و کد در کدینگِ پیش‌فرض باشد، همان‌جا
 * کدینگ ساخته و دوباره جست‌وجو می‌شود (tenant تازه بدونِ هیچ setup).
 * کدِ ناشناخته → null (fail-safe، بدون استثنا).
 */
export async function resolveAccountId(universityId: number, code: string, exec?: any): Promise<number | null> {
  const uid = requireUniversityId(universityId);
  const ex = exec ?? db;
  const wanted = String(code ?? '').trim();
  if (!wanted) return null;

  const find = async (): Promise<number | null> => {
    const res: any = await ex.execute(sql`
      SELECT id FROM gl_accounts
       WHERE "universityId" = ${uid} AND code = ${wanted}
       LIMIT 1
    `);
    const row = (res?.rows ?? [])[0];
    return row ? Number(row.id) : null;
  };

  const found = await find();
  if (found !== null || !DEFAULT_CODES.has(wanted)) return found;

  // حسابِ استاندارد ولی هنوز ساخته‌نشده (دانشگاهِ تازه) → seed و تلاشِ دوباره
  await ensureDefaultChart(uid, ex);
  return find();
}

/** همهٔ حساب‌های دانشگاه به ترتیبِ کد (برای درختِ حساب و انتخابگرِ UI). */
export async function listChart(universityId: number): Promise<ChartAccount[]> {
  const uid = requireUniversityId(universityId);

  const read = async (): Promise<ChartAccount[]> => {
    const res: any = await db.execute(sql`
      SELECT id, code, name, type, "normalSide"
        FROM gl_accounts
       WHERE "universityId" = ${uid}
       ORDER BY code
    `);
    return ((res?.rows ?? []) as any[]).map((r) => ({
      id: Number(r.id),
      code: String(r.code),
      name: String(r.name),
      type: String(r.type) as AccountType,
      normalSide: String(r.normalSide) as AccountSide,
    }));
  };

  const rows = await read();
  if (rows.length > 0) return rows;

  // دانشگاهِ بدونِ کدینگ: یک‌بار می‌کاریم تا فراخوانِ بعدی داده ببیند.
  await ensureDefaultChart(uid);
  return read();
}

/**
 * دورهٔ مالیِ ماهانهٔ شاملِ آن تاریخ را برمی‌گرداند و اگر نبود می‌سازد.
 * عنوان: YYYY-MM میلادی (یکتا در هر دانشگاه) — بازه: اول تا آخرِ ماه.
 *
 * اگر دوره بسته باشد، فقط شناسه‌اش برمی‌گردد؛ تصمیمِ «ثبت نکن» با
 * periodStatus و لایهٔ ثبتِ سند است (این تابع وضعیت را تغییر نمی‌دهد).
 */
export async function ensurePeriod(universityId: number, date: Date | string, exec?: any): Promise<number> {
  const uid = requireUniversityId(universityId);
  const ex = exec ?? db;
  const iso = toIsoDate(date);

  const res: any = await ex.execute(sql`
    WITH p AS (
      SELECT to_char(date_trunc('month', ${iso}::date), 'YYYY-MM') AS title,
             date_trunc('month', ${iso}::date)::date AS start_date,
             (date_trunc('month', ${iso}::date) + interval '1 month - 1 day')::date AS end_date
    )
    INSERT INTO gl_periods ("universityId", title, "startDate", "endDate")
    SELECT ${uid}::integer, p.title, p.start_date, p.end_date FROM p
    ON CONFLICT ("universityId", title) DO UPDATE SET title = EXCLUDED.title
    RETURNING id
  `);

  const row = (res?.rows ?? [])[0];
  if (!row) throw new Error('ساختِ دورهٔ مالی ناموفق بود.');
  return Number(row.id);
}

/** وضعیتِ دوره: OPEN | CLOSED، یا null اگر دوره وجود نداشته باشد. */
export async function periodStatus(periodId: number): Promise<'OPEN' | 'CLOSED' | null> {
  const id = Number(periodId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const res: any = await db.execute(sql`
    SELECT status FROM gl_periods WHERE id = ${id} LIMIT 1
  `);
  const row = (res?.rows ?? [])[0];
  if (!row) return null;
  const status = String(row.status ?? '').trim().toUpperCase();
  return status === 'OPEN' || status === 'CLOSED' ? status : null;
}
