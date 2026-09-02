/**
 * تبدیل تاریخ میلادی/ایزو به شمسی برای نمایش (با اعداد فارسی).
 * اگر ورودی از قبل شمسی باشد دست‌نخورده برمی‌گردد.
 */
export function toShamsi(dStr: string | null | undefined): string {
  if (!dStr) return '—';
  const s = String(dStr);
  if (s.startsWith('13') || s.startsWith('14') || s.startsWith('۱۳') || s.startsWith('۱۴')) {
    return s;
  }
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return s;
  }
}
