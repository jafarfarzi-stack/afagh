/**
 * کمک‌تابع‌های نمایشِ نشانیِ استعلام در اسناد چاپی.
 *
 * توکنِ استعلام ۱۰۰+ کاراکتر است؛ چاپِ نشانیِ کامل در سندِ رسمی غیرحرفه‌ای
 * است. در چاپ فقط مبدأ + کدِ رهگیریِ کوتاه می‌آید و توکنِ کامل داخل QR
 * می‌ماند (استعلامِ واقعی با اسکنِ QR انجام می‌شود).
 */

/** مبدأ + مسیرِ ثابت، بدونِ آخرین بخش (توکن). */
export function prettyBase(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const base = parts.length > 1 ? `/${parts.slice(0, -1).join('/')}` : '';
    return `${u.host}${base}`;
  } catch {
    return '';
  }
}

/**
 * کدِ رهگیریِ کوتاه از توکن (FNV-1a).
 * ⚠ کدِ استعلام نیست و با آن سند بازیابی نمی‌شود؛ فقط برای تطبیقِ نسخهٔ
 * کاغذی با نسخهٔ دیجیتال است.
 */
export function refCodeOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const token = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
  } catch {
    return '';
  }
}
