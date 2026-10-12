/**
 * هلپر ریدایرکت امن (دفاع در عمق — فعلاً سیم‌کشی نشده؛ برای استفادهٔ آینده).
 * فقط مسیرهای داخلی نسبی (شروع با / ولی نه //) را می‌پذیرد؛ بقیه به مسیر پیش‌فرض برمی‌گردند.
 */
export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  const v = String(raw ?? '').trim();
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) return fallback;
  try {
    const u = new URL(v, 'http://local');
    if (u.host !== 'local') return fallback;
    return u.pathname + u.search + u.hash || fallback;
  } catch {
    return fallback;
  }
}
