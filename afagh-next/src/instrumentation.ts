// استقرار: Next همین‌جا را یک‌بار هنگام بالا آمدن سرور صدا می‌زند.
// poll worker پیام‌رسان (getUpdates long-poll برای BALE/EITAA/SOROUSH)
// قبلاً هیچ‌جا استارت نمی‌خورد و جفت‌سازی «/start» بات هرگز ثبت نمی‌شد؛
// قفل Redis تک‌نمونه‌ای بودن چند نمونه/هات‌رِلود را تضمین می‌کند.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.AFAGH_POLL_DISABLED === '1') return;
  try {
    const { startAllPolling } = await import('./lib/messenger-poll-worker');
    startAllPolling();
  } catch (e) {
    // نبودِ poll نباید بالا آمدن اپ را بکشد — فقط هشدار.
    console.warn('[instrumentation] messenger poll not started:', (e as Error).message);
  }
}
