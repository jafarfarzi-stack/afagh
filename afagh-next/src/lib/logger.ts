// ═══ لاگ ساختاریافتهٔ JSON (بدون وابستگی بیرونی) ═══
// چرا کتابخانه نصب نکردیم: پروژه در Docker با حافظهٔ محدود build می‌شود و
// افزودن Pino/Sentry هم حجم build و هم سطح آسیب‌پذیری را بالا می‌برد.
// خروجی این ماژول عمداً «یک خط = یک JSON» است تا مستقیم به Loki/ELK یا
// `docker logs` بدهیم و بدون تغییر کد قابل جست‌وجو باشد.
//
// سطح لاگ با ENV: LOG_LEVEL=debug|info|warn|error (پیش‌فرض info، در production info)
// قالب با ENV: LOG_FORMAT=json|pretty (پیش‌فرض json در production، pretty در dev)

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

/** کلیدهایی که هرگز نباید در لاگ ظاهر شوند (رمز، توکن، کوکی، کلید API) */
const SECRET_KEY = /(password|passwd|pass|secret|token|apikey|api_key|authorization|cookie|salt|sharedsecret|privatekey|connectionstring|databaseurl)/i;
const MASK = '[REDACTED]';

/** رشته‌هایی که خودشان شبیه رمز/کلید هستند (مثل DSN دیتابیس) */
const maskString = (s: string): string =>
  s.replace(/(\/\/[^:/@\s]+):([^@/\s]+)@/g, '$1:' + MASK + '@');

export function maskSecrets(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return maskString(value);
  if (typeof value !== 'object' || depth > 6) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: maskString(value.message), stack: value.stack };
  if (Array.isArray(value)) return value.slice(0, 200).map(v => maskSecrets(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? MASK : maskSecrets(v, depth + 1);
  }
  return out;
}

export type LogFields = Record<string, unknown>;

const write = (level: LogLevel, base: LogFields, msg: string, fields?: LogFields) => {
  if (LEVELS[level] < LEVELS[envLevel()]) return;
  const rec = {
    level,
    time: new Date().toISOString(),
    app: process.env.LOG_APP_NAME || 'afagh',
    env: process.env.NODE_ENV || 'development',
    msg,
    ...(maskSecrets({ ...base, ...(fields || {}) }) as LogFields),
  };
  const line = prettyMode()
    ? `${rec.time} ${level.toUpperCase().padEnd(5)} ${msg} ${Object.keys(rec).length > 5 ? JSON.stringify(rec) : ''}`
    : JSON.stringify(rec);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
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
