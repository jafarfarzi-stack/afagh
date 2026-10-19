/**
 * گارد SSRF برای نشانی‌های بیرونی (تنظیمات مدیر + اتصال ثمین + وب‌هوک گردش کار).
 * - فقط https (بدون userinfo)
 * - allow-list میزبان به‌ازای هر یکپارچه‌سازی (اختیاری)
 * - بررسی DNS: همهٔ رکوردهای A/AAAA باید عمومی باشند (نه خصوصی/لوپ‌بک/لینک‌لوکال)
 * - نشانی‌های IPv4 جاسازی‌شده در IPv6 (::ffff:127.0.0.1) و NAT64 (64:ff9b::/96)
 *   پیش از بررسی رنج، به IPv4 باز می‌شوند تا دور زدن ممکن نباشد.
 * - ریدایرکت دستی: هر مقصد پیش از دنبال‌کردن دوباره اعتبارسنجی می‌شود
 *   (هم مسیر دور زدن allow-list/DNS و هم پنجرهٔ DNS rebinding).
 * فقط node built-ins (node:dns/promises) — وابستگی جدید ندارد.
 * عمداً server-only ندارد تا با tsx تست‌پذیر بماند؛ بررسی DNS در رانتایم Node
 * انجام می‌شود و نقطهٔ اعمال (settings/samin actions + هر فراخوان بیرونی) سمت سرور است.
 *
 * ── استثنای صریح اپراتور برای سرویس‌های درون‌خوشه‌ای ──
 * بعضی سرویس‌ها مستندشده روی نشانی خصوصی/نام داکری اجرا می‌شوند (مثلاً
 * `minio`، یک سرویس خودمیزبان سجاد/سپهر/ایرانداک روی میزبان داخلی). گارد
 * به‌جای حذف‌شدن، راه خروج صریح دارد:
 *   AFAGH_SSRF_ALLOW_HOSTS=minio,samin.internal,irandoc.lan
 * میزبان‌های فهرست‌شده «مجاز اعلام‌شده» تلقی می‌شوند: بررسی DNS-خصوصی و
 * allow-list پیش‌فرض سرویس رویشان اعمال نمی‌شود و `http://` فقط وقتی مجاز است
 * که ورودی ENV با پیشوند صریح `http://` نوشته شده باشد (سرویس داخلی معمولاً
 * TLS ندارد). بقیهٔ کنترل‌ها (سینتکس، نبود
 * userinfo، اعتبارسنجی مجدد هر ریدایرکت) سر جایشان می‌ماند. این متغیر فقط از
 * ENV خوانده می‌شود و از پنل مدیر قابل نوشتن نیست.
 */

export const SAMIN_HOSTS = ['apim.saorg.ir', 'apiauth.saorg.ir'] as const;

/** نام متغیر محیطیِ allow-list اپراتور (سرویس‌های داخلی). */
export const ENV_ALLOW_HOSTS_VAR = 'AFAGH_SSRF_ALLOW_HOSTS';

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
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true; // protocol assignments / documentation ranges
  if (a === 192 && b === 2 && p[2] === 0) return true; // TEST-NET-1
  if (a === 192 && b === 88 && p[2] === 99) return true; // deprecated 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && p[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && p[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true;
  return false;
}

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** بازکردن نشانی IPv6 به ۸ هگزت (بدون zone-id). null اگر IPv6 معتبر نباشد. */
function expandIPv6(raw: string): number[] | null {
  let s = raw.trim().toLowerCase().split('%')[0];
  if (!s.includes(':')) return null;
  const dc = s.lastIndexOf(':');
  const tail = s.slice(dc + 1);
  if (tail.includes('.')) {
    // بخش dotted-quad انتهایی (مثل ::ffff:127.0.0.1) → دو هگزت
    if (!IPV4_RE.test(tail)) return null;
    const p = tail.split('.').map(Number);
    if (p.some(n => n > 255)) return null;
    s = `${s.slice(0, dc + 1)}${(((p[0] << 8) | p[1]) >>> 0).toString(16)}:${(((p[2] << 8) | p[3]) >>> 0).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const hex = (t: string) => (/^[0-9a-f]{1,4}$/.test(t) ? parseInt(t, 16) : NaN);
  const head = (halves[0] ? halves[0].split(':') : []).map(hex);
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []).map(hex) : [];
  if (head.concat(rest).some(n => Number.isNaN(n))) return null;
  const missing = 8 - (head.length + rest.length);
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const out = halves.length === 1 ? head : [...head, ...new Array<number>(missing).fill(0), ...rest];
  return out.length === 8 ? out : null;
}

/**
 * IPv4 جاسازی‌شده در IPv6 را بیرون می‌کشد:
 *   • ::ffff:a.b.c.d  (IPv4-mapped)      • ::a.b.c.d  (compatible)
 *   • 64:ff9b::a.b.c.d  (NAT64 well-known prefix)
 * بقیهٔ نشانی‌های IPv6 (یا ورودی نامعتبر) → null.
 */
export function embeddedIPv4(raw: string): string | null {
  const w = expandIPv6(raw);
  if (!w) return null;
  const zero6 = w.slice(0, 6).every(n => n === 0);
  const isMapped = zero6 && w[5] === 0xffff;
  const isCompat = zero6;
  const isNat64 = w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every(n => n === 0);
  if (!isMapped && !isCompat && !isNat64) return null;
  return `${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`;
}

export function isPrivateIP(raw: string): boolean {
  const v = raw.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1');
  const inner = embeddedIPv4(v);
  if (inner) return isPrivateIPv4(inner); // جاسازی‌شده/NAT64 → همان قواعد IPv4
  if (v.includes(':')) {
    // فقط Global Unicast (2000::/3) می‌تواند مقصد عمومی قابل اتصال باشد.
    // این کار loopback، link-local، ULA، multicast، unspecified و رنج‌های رزروشده
    // را fail-closed رد می‌کند؛ رنج مستندسازی و تونل‌های قدیمی نیز عمومی نیستند.
    const words = expandIPv6(v);
    if (!words || words[0] < 0x2000 || words[0] > 0x3fff) return true;
    if (words[0] === 0x2001 && words[1] === 0x0db8) return true; // documentation
    if (words[0] === 0x2001 && words[1] <= 0x01ff) return true; // special-purpose / Teredo
    if (words[0] === 0x2002) return true; // 6to4 embeds an IPv4 destination
    return false;
  }
  return isPrivateIPv4(v);
}

function hostAllowed(hostname: string, allowed: readonly string[]): boolean {
  const h = hostname.toLowerCase();
  return allowed.some(a => {
    const x = a.toLowerCase().replace(/^\./, '');
    return h === x || h.endsWith(`.${x}`);
  });
}

function isHttpEntry(entry: string): boolean {
  return /^http:\/\//i.test(entry);
}

function stripHttpPrefix(entry: string): string {
  return entry.replace(/^http:\/\//i, '');
}

/** allow-list اپراتور از ENV (سرویس‌های درون‌خوشه‌ای/خودمیزبان). */
export function envAllowedHosts(): string[] {
  const raw = process.env[ENV_ALLOW_HOSTS_VAR];
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
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

function parseUrl(raw: string): URL {
  try {
    return new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError('نشانی معتبر نیست.');
  }
}

/** بررسی نحوی: https-only + بدون userinfo. خروجی URL پارس‌شده. */
export function parseSafeUrl(raw: string): URL {
  const u = parseUrl(raw);
  if (u.protocol !== 'https:') throw new UnsafeUrlError('نشانی باید با https:// شروع شود.');
  if (u.username || u.password) throw new UnsafeUrlError('نشانی نباید نام‌کاربری/رمز داشته باشد.');
  if (!u.hostname) throw new UnsafeUrlError('میزبان نشانی نامشخص است.');
  return u;
}

/**
 * اعتبارسنجی کامل SSRF: سینتکس + allow-list (در صورت تعیین) + بررسی DNS.
 * خطا با UnsafeUrlError و پیام فارسی.
 *
 * میزبانِ فهرست‌شده در AFAGH_SSRF_ALLOW_HOSTS استثناست: http و نشانی خصوصی
 * برایش مجاز است و allow-list سرویس روی آن اعمال نمی‌شود (سرویس داخلی اپراتور).
 */
async function resolveSafeTarget(
  raw: string,
  opts: AssertSafeUrlOptions = {},
  pinForFetch = false,
): Promise<{ url: URL; address?: string; family?: number }> {
  const probe = parseUrl(raw);
  const envHosts = envAllowedHosts();
  const trustedHttps = hostAllowed(probe.hostname, envHosts.map(stripHttpPrefix));
  const trustedHttp = hostAllowed(probe.hostname, envHosts.filter(isHttpEntry).map(stripHttpPrefix));
  const trusted = probe.protocol === 'https:' ? trustedHttps : probe.protocol === 'http:' && trustedHttp;
  // http فقط برای میزبان‌های مجاز با پیشوند صریح http:// در ENV؛ بقیه سخت‌گیرانه https-only می‌مانند.
  const u = trusted ? probe : parseSafeUrl(raw);
  if (u.username || u.password) throw new UnsafeUrlError('نشانی نباید نام‌کاربری/رمز داشته باشد.');
  if (!u.hostname) throw new UnsafeUrlError('میزبان نشانی نامشخص است.');

  const preset = opts.settingKey ? (PRESET_HOSTS[opts.settingKey] ?? null) : null;
  const allowed = opts.allowedHosts ?? preset ?? undefined;
  if (!trusted && allowed && allowed.length > 0 && !hostAllowed(u.hostname, allowed)) {
    throw new UnsafeUrlError(`میزبان «${u.hostname}» برای این سرویس مجاز نیست.`);
  }
  if (opts.dnsCheck === false && !pinForFetch) return { url: u };

  const hostname = u.hostname.replace(/^\[(.*)\]$/, '$1');
  const literalFamily = (await import('node:net')).isIP(hostname);
  const { lookup } = await import('node:dns/promises');
  let records: { address: string }[];
  if (literalFamily) {
    records = [{ address: hostname }];
  } else {
    try {
      records = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new UnsafeUrlError(`میزبان «${u.hostname}» قابل تفکیک نیست.`);
    }
  }
  if (!records.length) throw new UnsafeUrlError(`میزبان «${u.hostname}» رکورد DNS ندارد.`);
  for (const r of records) {
    if (!trusted && isPrivateIP(r.address)) {
      throw new UnsafeUrlError(`میزبان «${u.hostname}» به نشانی داخلی تفکیک می‌شود و مجاز نیست.`);
    }
  }
  const selected = records[0].address;
  return { url: u, address: selected, family: (await import('node:net')).isIP(selected) };
}

export async function assertSafeUrl(raw: string, opts: AssertSafeUrlOptions = {}): Promise<URL> {
  return (await resolveSafeTarget(raw, opts)).url;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

/**
 * fetch امن: اعتبارسنجی SSRF + ریدایرکت دستی.
 * هر مقصد ریدایرکت پیش از دنبال‌کردن دوباره از صفر اعتبارسنجی می‌شود، پس نه
 * allow-list/DNS دور زده می‌شود و نه به میزبانی می‌رسیم که فقط «در لحظهٔ
 * اعتبارسنجی» عمومی بوده (DNS rebinding).
 */
export async function ssrfFetch(raw: string, init?: RequestInit, opts: AssertSafeUrlOptions = {}): Promise<Response> {
  const base = init ?? {};
  let current = raw;
  let currentInit: RequestInit = base;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = await resolveSafeTarget(current, opts, true);
    if (!target.address || !target.family) throw new UnsafeUrlError('نشانی مقصد قابل تثبیت نیست.');
    const res = await fetchPinned(target.url, target.address, target.family, currentInit);
    if (!REDIRECT_STATUSES.has(res.status)) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    if (hop === MAX_REDIRECTS) throw new UnsafeUrlError('تعداد ریدایرکت‌ها بیش از حد مجاز است.');
    // پاسخ ریدایرکت را تخلیه/ببند تا اتصال قبلی روی سرور مقصد معطل نماند.
    await res.body?.cancel().catch(() => undefined);
    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      throw new UnsafeUrlError('مقصد ریدایرکت معتبر نیست.');
    }
    const redirected = new URL(next);
    if (redirected.origin !== new URL(current).origin) {
      const headers = new Headers(currentInit.headers);
      for (const name of ['authorization', 'proxy-authorization', 'cookie', 'cookie2']) headers.delete(name);
      currentInit = { ...currentInit, headers };
    }
    current = next;
    // ۳۰۳ و (۳۰۱/۳۰۲ روی POST) طبق رفتار استاندارد به GET تبدیل می‌شوند.
    const method = (currentInit.method ?? 'GET').toUpperCase();
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      currentInit = { ...currentInit, method: 'GET', body: undefined };
    }
  }
  throw new UnsafeUrlError('تعداد ریدایرکت‌ها بیش از حد مجاز است.');
}

/** Perform the request against the IP that was validated, while retaining the original Host/SNI. */
async function fetchPinned(url: URL, address: string, family: number, init: RequestInit): Promise<Response> {
  const [{ request: httpRequest }, { request: httpsRequest }, { checkServerIdentity }, { Readable }] = await Promise.all([
    import('node:http'), import('node:https'), import('node:tls'), import('node:stream'),
  ]);
  const headers = new Headers(init.headers);
  headers.set('host', url.host);
  const requestHeaders = Object.fromEntries(headers.entries());
  const method = (init.method ?? 'GET').toUpperCase();
  const requestOptions = {
    hostname: address,
    family,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
    method,
    path: `${url.pathname}${url.search}`,
    headers: requestHeaders,
    agent: false as const,
    signal: init.signal ?? undefined,
    ...(url.protocol === 'https:' ? {
      servername: url.hostname.replace(/^\[(.*)\]$/, '$1'),
      checkServerIdentity: (_host: string, cert: Parameters<typeof checkServerIdentity>[1]) =>
        checkServerIdentity(url.hostname.replace(/^\[(.*)\]$/, '$1'), cert),
    } : {}),
  };
  const request = url.protocol === 'https:'
    ? httpsRequest(requestOptions)
    : httpRequest(requestOptions);

  const response = new Promise<Response>((resolve, reject) => {
    request.once('error', reject);
    request.once('response', (incoming) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, item);
        else if (value !== undefined) responseHeaders.append(name, value);
      }
      const noBody = method === 'HEAD' || incoming.statusCode === 204 || incoming.statusCode === 205 || incoming.statusCode === 304;
      const body = noBody ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      resolve(new Response(body, {
        status: incoming.statusCode ?? 502,
        statusText: incoming.statusMessage,
        headers: responseHeaders,
      }));
    });
  });

  const body = init.body;
  if (body == null) request.end();
  else if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) request.end(body);
  else if (body instanceof ArrayBuffer) request.end(Buffer.from(body));
  else if (ArrayBuffer.isView(body)) request.end(Buffer.from(body.buffer, body.byteOffset, body.byteLength));
  else if (body instanceof URLSearchParams) request.end(body.toString());
  else if (body instanceof Blob) request.end(Buffer.from(await body.arrayBuffer()));
  else if (body instanceof ReadableStream) Readable.fromWeb(body as never).pipe(request);
  else {
    request.destroy(new TypeError('این نوع بدنهٔ درخواست برای اتصال امن پشتیبانی نمی‌شود.'));
  }
  return response;
}
