// ═══ لاگ ساختاریافتهٔ JSON (بدون وابستگی بیرونی) ═══
// چرا کتابخانه نصب نکردیم: پروژه در Docker با حافظهٔ محدود build می‌شود و
// افزودن Pino/Sentry هم حجم build و هم سطح آسیب‌پذیری را بالا می‌برد.
// خروجی این ماژول عمداً «یک خط = یک JSON» است تا مستقیم به Loki/ELK یا
// `docker logs` بدهیم و بدون تغییر کد قابل جست‌وجو باشد.
//
// سطح لاگ با ENV: LOG_LEVEL=debug|info|warn|error (پیش‌فرض info، در production info)
// قالب با ENV: LOG_FORMAT=json|pretty (پیش‌فرض json در production، pretty در dev)
//
// قلاب هشدار خطا با ENV: LOG_ALERT_WEBHOOK=<http(s) URL>
//   اگر تنظیم باشد، هر error() یک POST آتش-و-فراموش به این وب‌هوک می‌فرستد
//   (بدون بلاک‌کردن درخواست، بدون throw، با بدنهٔ پاک‌شدهٔ maskSecrets).
//   مهلت با LOG_ALERT_TIMEOUT_MS قابل تنظیم است (پیش‌فرض ۳۰۰۰ms).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (): LogLevel => {
  const v = String(process.env.LOG_LEVEL || '').toLowerCase();
  return (v in LEVELS ? v : 'info') as LogLevel;
};

const prettyMode = () => {
  const v = String(process.env.LOG_FORMAT || '').toLowerCase();
  if (v === 'pretty') return true;
  if (v === 'json') return false;
  return process.env.NODE_ENV !== 'production';
};

/** کلیدهایی که هرگز نباید در لاگ ظاهر شوند (رمز، توکن، کوکی، کلید API، کد ملی، موبایل، شناسهٔ چت، OTP) */
const SECRET_KEY = /(password|passwd|pass|secret|token|apikey|api_key|authorization|cookie|salt|sharedsecret|privatekey|connectionstring|databaseurl|nationalcode|national_code|nationalid|national_id|mobile|phone|chatid|chat_id|\botp\b|otphash|otpcode|otpused|verifycode|verify_code|serialno|serial_no|studentcode|student_code|clientsecretenc|passwordenc|tokenenc|securetoken|secure_token|pickuptoken|pickup_token|authcredentials|cardpan|card_pan|bankrefid|bank_ref_id|payeremail|payer_email|\bemail\b)/i;
const MASK = '[REDACTED]';

// ── الگوهای از پیش کامپایل‌شده برای پاک‌سازی متن ──
// چرا همهٔ اعداد را ماسک نمی‌کنیم: شناسه‌ها (id)، پورت‌ها، کدهای خطا و
// timestampهای ۱۰ رقمی برای عیب‌یابی حیاتی‌اند و ماسک‌کردن سراسری آن‌ها
// لاگ را بی‌فایده می‌کند. پس «مبلغ» فقط وقتی ماسک می‌شود که به یک کلید مالی
// شناخته‌شده چسبیده باشد؛ در عوض کد ملی/موبایل/ایمیل الگوی مشخص دارند.
const DSN_RE = /(\/\/[^:/@\s]+):([^@/\s]+)@/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** کلید کد ملی در متن: camelCase، snake_case یا عبارت فارسی */
const NATIONAL_CODE_KEY = String.raw`(?:national[_\s-]?code|national[_\s-]?id|کد\s*ملی|شناسه\s*ملی)`;
/** nationalCode=... / "national_code": "..." / کد ملی: ... */
const NATIONAL_CODE_KV_RE = new RegExp(
  String.raw`(${NATIONAL_CODE_KEY}\s*["']?\s*[:=]\s*["']?)([^"'\s,;)\]}]+)`,
  'gi',
);
/** «کد ملی ۱۲۳۴۵۶۷۸۹۰» بدون = یا : (فاصله فقط space/tab تا خطوط به‌هم نچسبند) */
const NATIONAL_CODE_BARE_RE = new RegExp(
  String.raw`(${NATIONAL_CODE_KEY}[ \t]+)([\d\u06F0-\u06F9]{4,})`,
  'gi',
);

/** کلیدهای مالی شناخته‌شده؛ مبلغ فقط در کنار همین کلیدها ماسک می‌شود */
const AMOUNT_KEY = String.raw`(?:amounts?|balances?|fees?|prices?|tuition|paid|payments?|remaining|debits?|credits?|subtotals?|totals?|installments?|discounts?|refunds?|sum|مبالغ|مبلغ|مانده|بدهی|بستانکار|بدهکار|شهریه|پرداخت|واریز|تخفیف|بازگشت|اقساط|قسط|جمع)`;
const AMOUNT_KV_RE = new RegExp(
  // حداقل ۴ رقم تا کدهای وضعیت/پورت (مثل 404) با «مبلغ» اشتباه نشوند؛
  // فاصله فقط space/tab است تا مقدار از خط عبور نکند و خطوط لاگ به‌هم نچسبند.
  String.raw`((?<![A-Za-z])${AMOUNT_KEY}[ \t]*["']?[ \t]*(?:[:=][ \t]*["']?|[ \t]+))([-+]?[\d\u06F0-\u06F9][\d\u06F0-\u06F9,٬. ]{3,})`,
  'gi',
);

// موبایل ایرانی ۱۱ رقمی و کد ملی ۱۰ رقمی — حتی داخل شناسه‌های دارای حرف/آندرلاین
const MOBILE_RE = /(?<!\d)09\d{9}(?!\d)/g;
const NATIONAL_CODE_RE = /(?<![\d\u06F0-\u06F9])[\d\u06F0-\u06F9]{10}(?![\d\u06F0-\u06F9])/g;

/** رشته‌هایی که خودشان شبیه رمز/کلید/PII هستند (DSN، ایمیل، کد ملی، موبایل، مبلغِ کلیددار) */
const maskString = (s: string): string => {
  let out = s.replace(DSN_RE, '$1:' + MASK + '@');
  // ایمیل (PII) — پیش از ماسک اعداد تا دامنه/کاربر خراب نشود
  out = out.replace(EMAIL_RE, MASK);
  // مقدار چسبیده به کلید کد ملی (حتی اگر ۸/۹ رقمی یا غیرعددی باشد)
  out = out.replace(NATIONAL_CODE_KV_RE, '$1' + MASK);
  out = out.replace(NATIONAL_CODE_BARE_RE, '$1' + MASK);
  // مبلغ/مانده فقط وقتی کلید مالی کنارش باشد
  out = out.replace(AMOUNT_KV_RE, '$1' + MASK);
  // موبایل و کد ملی خام در هر جای متن
  out = out.replace(MOBILE_RE, MASK);
  out = out.replace(NATIONAL_CODE_RE, MASK);
  return out;
};

export function maskSecrets(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return maskString(value);
  if (typeof value !== 'object' || depth > 6) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    // پیام و stack هر دو پاک‌سازی می‌شوند (پیام خطای Postgres می‌تواند مقدار
    // نقض‌شده مثل کد ملی را در خود داشته باشد). code مثل 23505 برای عیب‌یابی می‌ماند.
    const code = (value as Error & { code?: unknown }).code;
    return {
      name: value.name,
      message: maskString(value.message),
      ...(code != null ? { code: String(code) } : {}),
      stack: value.stack ? maskString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) return value.slice(0, 200).map(v => maskSecrets(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? MASK : maskSecrets(v, depth + 1);
  }
  return out;
}

export type LogFields = Record<string, unknown>;

// ═══ قلاب هشدار خطا (Error Alert Hook) ═══
// اگر ENV «LOG_ALERT_WEBHOOK» تنظیم باشد، هر error() یک POST آتش-و-فراموش
// (fire-and-forget) به آن می‌فرستد تا خطاها بی‌سروصدا در لاگ نمانند.
// قراردادهای سخت (بازبینی مهندسی):
//   • هرگز throw نمی‌کند و هرگز درخواست را بلاک نمی‌کند (await نمی‌شود).
//   • بدنه فقط از دادهٔ پاک‌شدهٔ maskString/maskSecrets ساخته می‌شود؛ هیچ سکرت/PII
//     خامی خارج نمی‌شود و URL وب‌هوک هرگز داخل payload/لاگ نمی‌آید.
//   • شکستِ ارسال هشدار، خودش لاگ نمی‌شود تا حلقهٔ هشدار-بی‌پایان نسازد.
const alertWebhook = (): string => {
  const url = String(process.env.LOG_ALERT_WEBHOOK || '').trim();
  // فقط http/https؛ مقدار نامعتبر بی‌صدا نادیده گرفته می‌شود (بدون لاگ).
  return /^https?:\/\//i.test(url) ? url : '';
};

const sendAlert = (time: string, msg: string, fields: LogFields): void => {
  try {
    const url = alertWebhook();
    if (!url || typeof fetch !== 'function') return;
    const envMs = Number(process.env.LOG_ALERT_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(envMs) && envMs > 0 ? envMs : 3000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    void fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      // ورودی این تابع از قبل پاک‌سازی شده؛ یک بار دیگر هم maskSecrets می‌زنیم تا
      // هیچ مسیر فراخوانی نتواند دادهٔ خام به وب‌هوک تزریق کند.
      body: JSON.stringify({
        level: 'error',
        msg: maskString(msg),
        timestamp: time,
        fields: maskSecrets(fields),
      }),
    })
      .catch(() => { /* بی‌صدا: قطعی وب‌هوک نباید چیزی را بشکند */ })
      .finally(() => clearTimeout(timer));
  } catch {
    /* هرگز throw نمی‌کند — لاگ اصلی همیشه انجام شده است */
  }
};

const write = (level: LogLevel, base: LogFields, msg: string, fields?: LogFields) => {
  if (LEVELS[level] < LEVELS[envLevel()]) return;
  // پیام و فیلدها هر دو پیش از هر مصرفی (کنسول و وب‌هوک هشدار) پاک‌سازی می‌شوند؛
  // بعضی فراخوان‌ها پیام خام خطا را به‌جای فیلد می‌فرستند.
  const safeMsg = maskString(msg);
  const extra = maskSecrets({ ...base, ...(fields || {}) }) as LogFields;
  const rec = {
    level,
    time: new Date().toISOString(),
    app: process.env.LOG_APP_NAME || 'afagh',
    env: process.env.NODE_ENV || 'development',
    msg: safeMsg,
    ...extra,
  };
  const line = prettyMode()
    ? `${rec.time} ${level.toUpperCase().padEnd(5)} ${rec.msg} ${Object.keys(rec).length > 5 ? JSON.stringify(rec) : ''}`
    : JSON.stringify(rec);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  // هشدار فقط برای سطح error و فقط اگر وب‌هوک تنظیم شده باشد.
  if (level === 'error') sendAlert(rec.time, safeMsg, extra);
};

export type Logger = {
  debug: (msg: string, fields?: LogFields) => void;
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields | unknown) => void;
  child: (fields: LogFields) => Logger;
  /** اندازه‌گیری زمان یک عملیات و لاگ‌کردن نتیجه/خطا */
  time: <T>(msg: string, fn: () => Promise<T>, fields?: LogFields) => Promise<T>;
};

export function createLogger(base: LogFields = {}): Logger {
  const self: Logger = {
    debug: (m, f) => write('debug', base, m, f),
    info: (m, f) => write('info', base, m, f),
    warn: (m, f) => write('warn', base, m, f),
    error: (m, f) => write('error', base, m, f instanceof Error ? { err: f } : (f as LogFields)),
    child: f => createLogger({ ...base, ...f }),
    time: async (m, fn, f) => {
      const t0 = Date.now();
      try {
        const r = await fn();
        write('info', base, m, { ...(f || {}), ms: Date.now() - t0, ok: true });
        return r;
      } catch (e) {
        write('error', base, m, { ...(f || {}), ms: Date.now() - t0, ok: false, err: e });
        throw e;
      }
    },
  };
  return self;
}

export const logger = createLogger();

/** شناسهٔ درخواست: از هدر می‌خوانیم (پشت Caddy/Nginx) وگرنه می‌سازیم */
export function requestId(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get('x-request-id') ||
    req.headers.get('x-correlation-id') ||
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  );
}

/**
 * پوشش یک Route Handler با لاگ ورودی/خروجی و زمان پاسخ.
 * استفاده:  export const POST = withRequestLog('migration.import', handler);
 */
export function withRequestLog<A extends unknown[]>(
  name: string,
  handler: (req: Request, ...rest: A) => Promise<Response>,
): (req: Request, ...rest: A) => Promise<Response> {
  return async (req: Request, ...rest: A) => {
    const rid = requestId(req);
    const log = createLogger({ rid, route: name, method: req.method });
    const t0 = Date.now();
    try {
      const res = await handler(req, ...rest);
      log[res.status >= 500 ? 'error' : res.status >= 400 ? 'warn' : 'info']('http', {
        status: res.status, ms: Date.now() - t0,
      });
      try { res.headers.set('x-request-id', rid); } catch { /* پاسخ‌های immutable */ }
      return res;
    } catch (e) {
      log.error('http_unhandled', { ms: Date.now() - t0, err: e });
      throw e;
    }
  };
}
