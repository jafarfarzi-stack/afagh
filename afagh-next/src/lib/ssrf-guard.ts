/**
 * گارد SSRF برای نشانی‌های بیرونی (تنظیمات مدیر + اتصال ثمین).
 * - فقط https (بدون userinfo)
 * - allow-list میزبان به‌ازای هر یکپارچه‌سازی (اختیاری)
 * - بررسی DNS: همهٔ رکوردهای A/AAAA باید عمومی باشند (نه خصوصی/لوپ‌بک/لینک‌لوکال)
 * فقط node built-ins (node:dns/promises) — وابستگی جدید ندارد.
 * عمداً server-only ندارد تا با tsx تست‌پذیر بماند؛ بررسی DNS در رانتایم Node
 * انجام می‌شود و نقطهٔ اعمال (settings/samin actions) سمت سرور است.
 */

export const SAMIN_HOSTS = ['apim.saorg.ir', 'apiauth.saorg.ir'] as const;

/** میزبان‌های پیش‌فرض شناخته‌شده به‌ازای هر کلید تنظیمات (قابل گسترش). */
const PRESET_HOSTS: Record<string, string[]> = {
  TELEGRAM_API_BASE: ['api.telegram.org'],
  BALE_API_BASE: ['tapi.bale.ai'],
  EITAA_API_BASE: ['eitaayar.ir'],
  SOROUSH_API_BASE: ['api.splus.ir'],
  IGAP_API_BASE: ['igap.ai'],
  SAJJAD_BASE_URL: ['saorg.ir'],
  IRANDOC_BASE_URL: [],
  KYC_BASE_URL: [],
  SHAPARAK_BASE_URL: [],
  SMS_BASE_URL: [],
  BBB_URL: [],
  MOODLE_URL: [],
  WORKFLOW_WEBHOOK_URL: [],
  PAY_CALLBACK_URL: [],
};

/** کلیدهای صرفاً لینکی (سرور به آن‌ها fetch نمی‌زند) — بررسی DNS لازم ندارند. */
export const LINK_ONLY_KEYS = new Set(['PUBLIC_BASE_URL', 'PAY_CALLBACK_URL', 'SAJJAD_PORTAL_URL']);

export function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

export function isPrivateIP(ip: string): boolean {
  const v = ip.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1');
  if (v.includes(':')) {
    // IPv6: لوپ‌بک، unspecified، لینک‌لوکال، unique-local
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fe80:') || v.startsWith('fe80::')) return true;
    if (v.startsWith('fc') || v.startsWith('fd')) return true;
    if (v.startsWith('ff00:')) return false; // مالتی‌کست — fetch نمی‌زنیم ولی خصوصی نیست
    return false;
  }
  return isPrivateIPv4(v);
}

function hostAllowed(hostname: string, allowed: string[]): boolean {
  const h = hostname.toLowerCase();
  return allowed.some(a => {
    const x = a.toLowerCase();
    return h === x || h.endsWith(`.${x}`);
  });
}

export interface AssertSafeUrlOptions {
  /** کلید تنظیمات (برای allow-list پیش‌فرض) */
  settingKey?: string;
  /** میزبان‌های مجاز صریح — اگر خالی باشد فقط DNS/سینتکس بررسی می‌شود */
  allowedHosts?: readonly string[];
  /** بررسی DNS انجام شود؟ (برای کلیدهای لینکی false) */
  dnsCheck?: boolean;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/** بررسی نحوی: https-only + بدون userinfo. خروجی URL پارس‌شده. */
export function parseSafeUrl(raw: string): URL {
  const v = raw.trim();
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new UnsafeUrlError('نشانی معتبر نیست.');
  }
  if (u.protocol !== 'https:') throw new UnsafeUrlError('نشانی باید با https:// شروع شود.');
  if (u.username || u.password) throw new UnsafeUrlError('نشانی نباید نام‌کاربری/رمز داشته باشد.');
  if (!u.hostname) throw new UnsafeUrlError('میزبان نشانی نامشخص است.');
  return u;
}

/**
 * اعتبارسنجی کامل SSRF: سینتکس + allow-list (در صورت تعیین) + بررسی DNS.
 * خطا با UnsafeUrlError و پیام فارسی.
 */
export async function assertSafeUrl(raw: string, opts: AssertSafeUrlOptions = {}): Promise<URL> {
  const u = parseSafeUrl(raw);
  const preset = opts.settingKey ? (PRESET_HOSTS[opts.settingKey] ?? null) : null;
  const allowed = opts.allowedHosts ?? preset ?? undefined;
  if (allowed && allowed.length > 0 && !hostAllowed(u.hostname, [...allowed])) {
    throw new UnsafeUrlError(`میزبان «${u.hostname}» برای این سرویس مجاز نیست.`);
  }
  if (opts.dnsCheck === false) return u;
  const { lookup } = await import('node:dns/promises');
  let records: { address: string }[];
  try {
    records = await lookup(u.hostname, { all: true });
  } catch {
    throw new UnsafeUrlError(`میزبان «${u.hostname}» قابل تفکیک نیست.`);
  }
  if (!records.length) throw new UnsafeUrlError(`میزبان «${u.hostname}» رکورد DNS ندارد.`);
  for (const r of records) {
    if (isPrivateIP(r.address)) {
      throw new UnsafeUrlError(`میزبان «${u.hostname}» به نشانی داخلی تفکیک می‌شود و مجاز نیست.`);
    }
  }
  return u;
}

/** fetch امن: اعتبارسنجی SSRF + redirect دستی (جلوگیری از دور زدن via ریدایرکت). */
export async function ssrfFetch(raw: string, init?: RequestInit, opts: AssertSafeUrlOptions = {}): Promise<Response> {
  await assertSafeUrl(raw, opts);
  return fetch(raw, { ...init, redirect: 'manual' });
}
