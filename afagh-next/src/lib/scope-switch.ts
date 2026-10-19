/**
 * مسیر بازگشت پس از تغییر «دانشگاه فعال» یا «نیمسال فعال».
 *
 * چرا جدا شد: این دو سوییچر از Server Action + `router.refresh()` /
 * `window.location.reload()` استفاده می‌کردند. اکشن، صفحهٔ جاری را بلافاصله با
 * کوکیِ جدید دوباره رندر می‌کند؛ اگر آن صفحه یک صفحهٔ جزئیات باشد (مثلاً
 * `/admin/finance/student/123`) که رکوردش در دانشگاه جدید وجود ندارد، همان
 * رندر به `notFound()` می‌رسد و «صفحه پیدا نشد» نشان داده می‌شود — تا وقتی
 * کاربر دستی رفرش کند. حالا سوییچ با POST به Route Handler و پاسخ ۳۰۳ انجام
 * می‌شود: کوکی در همان پاسخ ست می‌شود و درخواست بعدی یک رندر کامل سروری با
 * کوکی جدید است؛ نه رندرِ میان‌راهِ اکشن، نه کش روتر.
 */

/** مسیر امنِ همان‌مبدأ از Referer — همیشه نسبی (هرگز دامنهٔ بیرونی). */
export function safeBackPath(referer: string | null | undefined, fallback = '/admin'): string {
  const raw = String(referer ?? '').trim();
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback;
    const path = u.pathname || '/';
    if (!path.startsWith('/') || path.startsWith('//')) return fallback;
    return `${path}${u.search}`;
  } catch {
    return fallback;
  }
}

/** آیا مسیر یک «صفحهٔ جزئیات» با شناسهٔ عددی است؟ (مثل /admin/finance/student/123) */
export function isDetailPath(pathAndQuery: string): boolean {
  const path = String(pathAndQuery || '').split('?')[0].replace(/\/+$/, '');
  return /\/\d+(?:\/|$)/.test(path);
}

/**
 * مقصد بازگشت پس از تغییر دانشگاه.
 * صفحه‌های جزئیات به داشبورد برمی‌گردند (شناسه ممکن است در دانشگاه جدید نباشد)،
 * `university` از کوئری حذف و صفحهٔ فهرست به صفحهٔ ۱ برمی‌گردد.
 */
export function universitySwitchTarget(referer: string | null | undefined, fallback = '/admin'): string {
  const back = safeBackPath(referer, fallback);
  if (isDetailPath(back)) return fallback;
  const [path, query = ''] = back.split('?');
  const sp = new URLSearchParams(query);
  sp.delete('university');
  if (sp.has('page') && sp.get('page') !== '1') sp.set('page', '1');
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}
