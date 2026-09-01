import 'server-only';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { system_settings } from '@/db/schema';

// ════════════════════════════════════════════════════════════════════
//  پیکربندی متمرکز سامانه — هیچ مقداری در کد هارد‌کد نیست
//
//  ترتیب اولویت خواندن هر مقدار:
//      ۱) جدول system_settings در دیتابیس   ← قابل تغییر از پنل مدیر (وب)
//      ۲) متغیر محیطی (ENV)                 ← قابل تغییر در .env / docker
//      ۳) مقدار پیش‌فرض تعریف‌شده در همین فایل
//
//  مقادیر «زیرساختی» (اتصال دیتابیس/Redis/MinIO) فقط از ENV خوانده می‌شوند،
//  چون پیش از برقراری اتصال به دیتابیس لازم‌اند.
// ════════════════════════════════════════════════════════════════════

export type SettingType = 'text' | 'url' | 'number' | 'boolean' | 'secret';

export interface SettingDef {
  key: string;
  env: string;
  group: string;
  label: string;
  type: SettingType;
  default: string;
  help?: string;
  /** فقط از ENV خوانده می‌شود (در پنل وب فقط نمایش داده می‌شود) */
  envOnly?: boolean;
}

export const SETTING_GROUPS = [
  'عمومی و نشانی‌ها',
  'کلاس مجازی (BBB / Moodle)',
  'پیامک و ربات‌های پیام‌رسان',
  'درگاه پرداخت',
  'سرویس‌های استعلام دولتی',
  'فارغ‌التحصیلی و صدور مدارک',
  'زیرساخت (فقط ENV)',
] as const;

export const SETTING_DEFS: SettingDef[] = [
  // ── عمومی ──
  { key: 'UNIVERSITY_NAME', env: 'AFAGH_UNIVERSITY_NAME', group: 'عمومی و نشانی‌ها', label: 'نام دانشگاه', type: 'text', default: 'دانشگاه آفاق' },
  { key: 'PUBLIC_BASE_URL', env: 'AFAGH_PUBLIC_BASE_URL', group: 'عمومی و نشانی‌ها', label: 'نشانی عمومی سامانه', type: 'url', default: 'http://localhost:8080', help: 'مبنای لینک‌های استعلام مدرک، QR کارت ورود به جلسه و ایمیل‌ها' },
  { key: 'SUPPORT_EMAIL', env: 'AFAGH_SUPPORT_EMAIL', group: 'عمومی و نشانی‌ها', label: 'ایمیل پشتیبانی', type: 'text', default: 'support@example.ac.ir' },
  { key: 'SUPPORT_PHONE', env: 'AFAGH_SUPPORT_PHONE', group: 'عمومی و نشانی‌ها', label: 'تلفن پشتیبانی', type: 'text', default: '' },

  // ── کلاس مجازی ──
  { key: 'BBB_URL', env: 'BIGBLUEBUTTON_URL', group: 'کلاس مجازی (BBB / Moodle)', label: 'نشانی API بیگ‌بلوباتن', type: 'url', default: '', help: 'مثال: https://vc.example.ac.ir/bigbluebutton/api — خالی یعنی سرویس غیرفعال' },
  { key: 'BBB_SECRET', env: 'BIGBLUEBUTTON_SECRET', group: 'کلاس مجازی (BBB / Moodle)', label: 'کلید مخفی بیگ‌بلوباتن', type: 'secret', default: '', help: 'خروجی دستور bbb-conf --secret روی سرور BBB' },
  { key: 'BBB_MODERATOR_PW', env: 'BIGBLUEBUTTON_MODERATOR_PW', group: 'کلاس مجازی (BBB / Moodle)', label: 'رمز ورود مدرس (Moderator)', type: 'secret', default: '' },
  { key: 'BBB_ATTENDEE_PW', env: 'BIGBLUEBUTTON_ATTENDEE_PW', group: 'کلاس مجازی (BBB / Moodle)', label: 'رمز ورود دانشجو (Attendee)', type: 'secret', default: '' },
  { key: 'BBB_AUTO_RECORD', env: 'BIGBLUEBUTTON_AUTO_RECORD', group: 'کلاس مجازی (BBB / Moodle)', label: 'ضبط خودکار جلسات', type: 'boolean', default: 'false' },
  { key: 'MOODLE_URL', env: 'MOODLE_URL', group: 'کلاس مجازی (BBB / Moodle)', label: 'نشانی سامانه Moodle', type: 'url', default: '' },
  { key: 'MOODLE_TOKEN', env: 'MOODLE_TOKEN', group: 'کلاس مجازی (BBB / Moodle)', label: 'توکن وب‌سرویس Moodle', type: 'secret', default: '' },

  // ── پیام‌رسان‌ها ──
  { key: 'SMS_PROVIDER', env: 'SMS_PROVIDER', group: 'پیامک و ربات‌های پیام‌رسان', label: 'سرویس‌دهندهٔ پیامک', type: 'text', default: '', help: 'مثال: KAVENEGAR / FARAPAYAMAK / SMSIR' },
  { key: 'SMS_API_KEY', env: 'SMS_API_KEY', group: 'پیامک و ربات‌های پیام‌رسان', label: 'کلید API پیامک', type: 'secret', default: '' },
  { key: 'SMS_SENDER', env: 'SMS_SENDER', group: 'پیامک و ربات‌های پیام‌رسان', label: 'شمارهٔ فرستنده', type: 'text', default: '' },
  { key: 'BALE_TOKEN', env: 'BALE_BOT_TOKEN', group: 'پیامک و ربات‌های پیام‌رسان', label: 'توکن ربات بله', type: 'secret', default: '' },
  { key: 'BALE_CHANNEL', env: 'BALE_CHANNEL_ID', group: 'پیامک و ربات‌های پیام‌رسان', label: 'شناسهٔ کانال بله', type: 'text', default: '' },
  { key: 'EITAA_TOKEN', env: 'EITAA_BOT_TOKEN', group: 'پیامک و ربات‌های پیام‌رسان', label: 'توکن ربات ایتا', type: 'secret', default: '' },
  { key: 'EITAA_CHANNEL', env: 'EITAA_CHANNEL_ID', group: 'پیامک و ربات‌های پیام‌رسان', label: 'شناسهٔ کانال ایتا', type: 'text', default: '' },
  { key: 'TELEGRAM_TOKEN', env: 'TELEGRAM_BOT_TOKEN', group: 'پیامک و ربات‌های پیام‌رسان', label: 'توکن ربات تلگرام', type: 'secret', default: '' },
  { key: 'TELEGRAM_CHANNEL', env: 'TELEGRAM_CHANNEL_ID', group: 'پیامک و ربات‌های پیام‌رسان', label: 'شناسهٔ کانال تلگرام', type: 'text', default: '' },

  // ── پرداخت ──
  { key: 'PAY_PROVIDER', env: 'PAYMENT_PROVIDER', group: 'درگاه پرداخت', label: 'درگاه پرداخت', type: 'text', default: '', help: 'مثال: BEHPARDAKHT_MELLAT / SAMAN / PARSIAN' },
  { key: 'PAY_TERMINAL_ID', env: 'PAYMENT_TERMINAL_ID', group: 'درگاه پرداخت', label: 'شناسهٔ ترمینال', type: 'text', default: '' },
  { key: 'PAY_MERCHANT_ID', env: 'PAYMENT_MERCHANT_ID', group: 'درگاه پرداخت', label: 'شناسهٔ پذیرنده', type: 'text', default: '' },
  { key: 'PAY_MERCHANT_KEY', env: 'PAYMENT_MERCHANT_KEY', group: 'درگاه پرداخت', label: 'کلید پذیرنده', type: 'secret', default: '' },
  { key: 'PAY_CALLBACK_URL', env: 'PAYMENT_CALLBACK_URL', group: 'درگاه پرداخت', label: 'نشانی بازگشت از درگاه', type: 'url', default: '', help: 'خالی = «نشانی عمومی سامانه» + /api/payment/callback' },
  { key: 'PAY_SANDBOX', env: 'PAYMENT_SANDBOX', group: 'درگاه پرداخت', label: 'حالت آزمایشی (Sandbox)', type: 'boolean', default: 'true' },
  { key: 'PAY_WAGE_PERCENT', env: 'PAYMENT_WAGE_PERCENT', group: 'درگاه پرداخت', label: 'درصد کارمزد', type: 'number', default: '0' },

  // ── سرویس‌های استعلام ──
  { key: 'IRANDOC_BASE_URL', env: 'IRANDOC_BASE_URL', group: 'سرویس‌های استعلام دولتی', label: 'نشانی API همانندجویی ایرانداک', type: 'url', default: '' },
  { key: 'IRANDOC_TOKEN', env: 'IRANDOC_TOKEN', group: 'سرویس‌های استعلام دولتی', label: 'توکن ایرانداک', type: 'secret', default: '' },
  { key: 'KYC_BASE_URL', env: 'KYC_BASE_URL', group: 'سرویس‌های استعلام دولتی', label: 'نشانی API احراز هویت (ثبت احوال/شاهکار)', type: 'url', default: '' },
  { key: 'KYC_API_KEY', env: 'KYC_API_KEY', group: 'سرویس‌های استعلام دولتی', label: 'کلید API احراز هویت', type: 'secret', default: '' },
  { key: 'SHAPARAK_BASE_URL', env: 'SHAPARAK_BASE_URL', group: 'سرویس‌های استعلام دولتی', label: 'نشانی API شاپرک', type: 'url', default: '' },
  { key: 'SAJJAD_BASE_URL', env: 'SAJJAD_BASE_URL', group: 'سرویس‌های استعلام دولتی', label: 'نشانی API سامانهٔ سجاد (وزارت علوم)', type: 'url', default: '' },
  { key: 'SAJJAD_PORTAL_URL', env: 'SAJJAD_PORTAL_URL', group: 'سرویس‌های استعلام دولتی', label: 'نشانی پرتال سجاد (لینک کاربران)', type: 'url', default: 'https://portal.saorg.ir' },
  { key: 'API_TIMEOUT_SECONDS', env: 'API_TIMEOUT_SECONDS', group: 'سرویس‌های استعلام دولتی', label: 'مهلت پاسخ سرویس‌ها (ثانیه)', type: 'number', default: '10' },

  // ── فارغ‌التحصیلی و صدور مدارک ──
  { key: 'GRAD_AUTO_SCAN', env: 'GRAD_AUTO_SCAN', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'شروع خودکار پروندهٔ فارغ‌التحصیلی', type: 'boolean', default: 'true', help: 'با قطعی‌شدن آخرین نمره، پرونده بدون درخواست دانشجو باز می‌شود' },
  { key: 'GRAD_MIN_GPA', env: 'GRAD_MIN_GPA', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'حداقل معدل کل برای فراغت', type: 'number', default: '12' },
  { key: 'GRAD_THESIS_DEGREE_CODES', env: 'GRAD_THESIS_DEGREE_CODES', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'مقاطع دارای پایان‌نامه', type: 'text', default: 'MSC,PHD', help: 'کد مقاطعی که استعلام ایرانداک برایشان الزامی است (با ویرگول)' },
  { key: 'GRAD_IRANDOC_MAX_SIMILARITY', env: 'GRAD_IRANDOC_MAX_SIMILARITY', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'سقف مجاز همانندجویی (٪)', type: 'number', default: '20' },
  { key: 'GRAD_REQUIRE_SAJJAD', env: 'GRAD_REQUIRE_SAJJAD', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'الزام ثبت درخواست کد صحت در سجاد توسط دانشجو', type: 'boolean', default: 'true', help: 'پیش از ارجاع پرونده به کارشناس صدور مدرک، دانشجو باید در سامانهٔ سجاد درخواست کد صحت ثبت و کد رهگیری را وارد کند' },
  { key: 'GRAD_REQUIRE_PHOTO', env: 'GRAD_REQUIRE_PHOTO', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'الزام بارگذاری عکس ۴×۳', type: 'boolean', default: 'true' },
  { key: 'GRAD_STAMP_FEE', env: 'GRAD_STAMP_FEE', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'هزینهٔ تمبر ابطال (ریال)', type: 'number', default: '0', help: 'صفر یعنی این گام حذف می‌شود' },
  { key: 'GRAD_SERIAL_PREFIX', env: 'GRAD_SERIAL_PREFIX', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'پیشوند شمارهٔ سریال مدرک', type: 'text', default: 'AF' },
  { key: 'GRAD_CRON_SECRET', env: 'GRAD_CRON_SECRET', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'کلید فراخوانی پویش زمان‌بندی‌شده', type: 'secret', default: '', help: 'هدر x-cron-secret برای POST /api/cron/graduation-scan' },
  { key: 'ALUMNI_FEE_TRANSCRIPT', env: 'ALUMNI_FEE_TRANSCRIPT', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'هزینهٔ ریزنمرات رسمی (ریال)', type: 'number', default: '0' },
  { key: 'ALUMNI_FEE_RELEASE', env: 'ALUMNI_FEE_RELEASE', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'هزینهٔ آزادسازی مدرک (ریال)', type: 'number', default: '0' },
  { key: 'ALUMNI_FEE_TRANSLATION', env: 'ALUMNI_FEE_TRANSLATION', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'هزینهٔ تأییدیه برای دارالترجمه (ریال)', type: 'number', default: '0' },
  { key: 'ALUMNI_FEE_DUPLICATE', env: 'ALUMNI_FEE_DUPLICATE', group: 'فارغ‌التحصیلی و صدور مدارک', label: 'هزینهٔ صدور المثنی (ریال)', type: 'number', default: '0' },

  // ── زیرساخت (فقط ENV) ──
  { key: 'DATABASE_URL', env: 'DATABASE_URL', group: 'زیرساخت (فقط ENV)', label: 'اتصال PostgreSQL', type: 'secret', default: 'postgres://afagh:afagh@localhost:5432/afagh_db', envOnly: true },
  { key: 'REDIS_URL', env: 'REDIS_URL', group: 'زیرساخت (فقط ENV)', label: 'اتصال Redis', type: 'text', default: 'redis://127.0.0.1:6379', envOnly: true },
  { key: 'S3_ENDPOINT', env: 'S3_ENDPOINT', group: 'زیرساخت (فقط ENV)', label: 'میزبان Object Storage', type: 'text', default: '127.0.0.1', envOnly: true },
  { key: 'S3_PORT', env: 'S3_PORT', group: 'زیرساخت (فقط ENV)', label: 'پورت Object Storage', type: 'number', default: '9000', envOnly: true },
  { key: 'S3_BUCKET', env: 'S3_BUCKET', group: 'زیرساخت (فقط ENV)', label: 'نام باکت بایگانی', type: 'text', default: 'afagh-archive', envOnly: true },
  { key: 'APP_PORT', env: 'PORT', group: 'زیرساخت (فقط ENV)', label: 'پورت لیسن سرویس وب', type: 'number', default: '8080', envOnly: true },
];

export const SETTING_BY_KEY: Record<string, SettingDef> = Object.fromEntries(SETTING_DEFS.map(d => [d.key, d]));

export type SettingSource = 'db' | 'env' | 'default';

// ── کش کوتاه‌مدت درون‌پردازه‌ای ──
const CACHE_TTL_MS = 15_000;
let cache: { at: number; rows: Record<string, string> } | null = null;

async function dbSettings(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows: Record<string, string> = {};
  try {
    const res = await db.select().from(system_settings);
    for (const r of res) rows[r.key] = r.value;
  } catch {
    // جدول هنوز ساخته نشده (قبل از migrate) — با ENV/پیش‌فرض ادامه می‌دهیم
  }
  cache = { at: Date.now(), rows };
  return rows;
}

export function invalidateSettingsCache() {
  cache = null;
}

function envOf(def: SettingDef): string | undefined {
  const v = process.env[def.env];
  return v === undefined || v === '' ? undefined : v;
}

/** مقدار یک تنظیم با ترتیب دیتابیس ← ENV ← پیش‌فرض */
export async function getSetting(key: string): Promise<string> {
  const def = SETTING_BY_KEY[key];
  if (!def) throw new Error('تنظیم ناشناخته: ' + key);
  if (def.envOnly) return envOf(def) ?? def.default;
  const rows = await dbSettings();
  const fromDb = rows[key];
  if (fromDb !== undefined && fromDb !== '') return fromDb;
  return envOf(def) ?? def.default;
}

export async function getSettings<T extends readonly string[]>(keys: T): Promise<Record<T[number], string>> {
  const out = {} as Record<T[number], string>;
  await dbSettings();
  for (const k of keys) out[k as T[number]] = await getSetting(k);
  return out;
}

export async function getNumber(key: string, fallback = 0): Promise<number> {
  const n = Number(await getSetting(key));
  return Number.isFinite(n) ? n : fallback;
}

export async function getBool(key: string): Promise<boolean> {
  const v = (await getSetting(key)).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export interface ResolvedSetting extends SettingDef {
  value: string;
  source: SettingSource;
  envValue: string | null;
  hasEnv: boolean;
}

/** همهٔ تنظیمات به همراه منبع هر مقدار — برای پنل مدیر */
export async function resolveAllSettings(): Promise<ResolvedSetting[]> {
  const rows = await dbSettings();
  return SETTING_DEFS.map(def => {
    const env = envOf(def);
    const dbv = def.envOnly ? undefined : rows[def.key];
    const source: SettingSource = dbv !== undefined && dbv !== '' ? 'db' : env !== undefined ? 'env' : 'default';
    const value = source === 'db' ? (dbv as string) : source === 'env' ? (env as string) : def.default;
    return { ...def, value, source, envValue: env ?? null, hasEnv: env !== undefined };
  });
}

/** ذخیرهٔ گروهی تنظیمات (فقط کلیدهای شناخته‌شده و غیر envOnly) */
export async function saveSettings(entries: Record<string, string>): Promise<number> {
  let saved = 0;
  for (const [key, raw] of Object.entries(entries)) {
    const def = SETTING_BY_KEY[key];
    if (!def || def.envOnly) continue;
    const value = String(raw ?? '').trim();
    await db
      .insert(system_settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: system_settings.key, set: { value } });
    saved++;
  }
  invalidateSettingsCache();
  return saved;
}

/** حذف مقدار دیتابیسی یک کلید → بازگشت به ENV/پیش‌فرض */
export async function resetSettings(keys: string[]): Promise<void> {
  const valid = keys.filter(k => SETTING_BY_KEY[k] && !SETTING_BY_KEY[k].envOnly);
  if (!valid.length) return;
  await db.delete(system_settings).where(inArray(system_settings.key, valid));
  invalidateSettingsCache();
}

// ════════ پیکربندی‌های ترکیبی پرکاربرد ════════

export async function getPublicBaseUrl(): Promise<string> {
  return (await getSetting('PUBLIC_BASE_URL')).replace(/\/+$/, '');
}

export async function getBbbConfig() {
  const [url, secret, moderatorPw, attendeePw] = await Promise.all([
    getSetting('BBB_URL'),
    getSetting('BBB_SECRET'),
    getSetting('BBB_MODERATOR_PW'),
    getSetting('BBB_ATTENDEE_PW'),
  ]);
  return {
    url: url.replace(/\/+$/, ''),
    secret,
    moderatorPw,
    attendeePw,
    autoRecord: await getBool('BBB_AUTO_RECORD'),
    configured: Boolean(url && secret),
  };
}

export async function getPaymentCallbackUrl(): Promise<string> {
  const explicit = await getSetting('PAY_CALLBACK_URL');
  if (explicit) return explicit;
  return (await getPublicBaseUrl()) + '/api/payment/callback';
}
