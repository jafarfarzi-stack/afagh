import 'server-only';
import { headers } from 'next/headers';
import { trustedClientIp, UNKNOWN_CLIENT_IP } from './proxy-trust';

/**
 * مدل اعتماد (منبع سخت‌شدهٔ هویت کلاینت):
 * فقط وقتی هویت را می‌پذیریم که (۱) اعتماد به پروکسی صریحاً روشن باشد و
 * (۲) `AFAGH_PROXY_SECRET` حداقل ۳۲ کاراکتر باشد و (۳) هدرِ
 * `x-afagh-proxy-token` در مقایسهٔ زمان‌ثابت با همان راز برابر باشد.
 * آن‌گاه `x-afagh-client-ip` که خودِ پروکسی نوشته، تنها منبع معتبر است.
 * XFF/‏X-Real-IP هرگز در این تابع خوانده نمی‌شوند (قابل جعل توسط کلاینت).
 */
const TRUSTY_FLAGS = new Set(['1', 'true', 'yes', 'caddy']);
function trustFlagOn(value: string | undefined): boolean {
  return TRUSTY_FLAGS.has((value ?? '').trim().toLowerCase());
}

export async function requestClientIp(): Promise<string | null> {
  try {
    return trustedClientIp(await headers(), {
      // هر دو نام پشتیبانی می‌شوند تا استقرارهای قدیمی (TRUSTED_PROXY) نشکنند.
      enabled: trustFlagOn(process.env.AFAGH_TRUST_PROXY) || trustFlagOn(process.env.TRUSTED_PROXY),
      secret: process.env.AFAGH_PROXY_SECRET ?? '',
    });
  } catch { return null; }
}

/**
 * مقدار پیش‌فرضِ امن برای جاهایی که به یک رشتهٔ غیر-null نیاز دارند.
 * ⚠ برای کلید rate-limit از `clientIp()` در rateLimit.ts استفاده کنید؛ آن تابع
 * در نبودِ پروکسیِ تأییدشده به‌جای سطل مشترک، کلید اثرانگشتِ یکتا می‌سازد.
 */
export async function clientIp(): Promise<string> {
  return (await requestClientIp()) ?? UNKNOWN_CLIENT_IP;
}
