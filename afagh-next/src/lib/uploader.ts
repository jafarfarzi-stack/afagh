'use client';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  آپلود چندتکهٔ (Chunked Upload) فایل‌های حجیم — گام ۴ سند طراحی
 *
 *  چرا؟ فایل‌های اکسل قدیمی (نمرات/مالی — گاهی ۵۰MB+) اگر یک‌جا به Server
 *  Action یا fetch بروند، با محدودیت body سرور وب (Caddy/Nginx → 413) و
 *  timeout میانی مواجه می‌شوند. این ماژول فایل را در مرورگر به تکه‌های ۲MB
 *  می‌شکند و ترتیب‌وار به endpoint می‌فرستد؛ سرور تکه‌ها را در فایل موقت
 *  بازمی‌آراید (fileId واحد) و در تکهٔ آخر، پاسخ نهایی (گزارش import) را
 *  برمی‌گرداند. پیشرفت به‌صورت درصدی برای کاربر نمایش داده می‌شود.
 *
 *  API سرور مصرف‌کننده (مثال):
 *    POST /api/admin/migration/chunk-upload
 *      multipart: file(تکه) + chunkIndex + totalChunks + fileId + fileName
 *      تکهٔ آخر → پاسخ: { ok, report } (همان ImportReport)
 * ════════════════════════════════════════════════════════════════════════
 */

export const CHUNK_SIZE = 2 * 1024 * 1024; // ۲MB — زیر سقف ۱۰MB بدنهٔ رایج

export async function uploadLargeFileInChunks(
  file: File,
  uploadUrl: string,
  onProgress?: (percent: number) => void,
  extra?: Record<string, string>,
): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const fileId = crypto.randomUUID(); // شناسهٔ یکتا برای بازآرایی تکه‌ها در سرور

  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const formData = new FormData();
      formData.append('file', chunk);
      formData.append('chunkIndex', String(i));
      formData.append('totalChunks', String(totalChunks));
      formData.append('fileId', fileId);
      formData.append('fileName', file.name);
      for (const [k, v] of Object.entries(extra ?? {})) formData.append(k, v);

      const response = await fetch(uploadUrl, { method: 'POST', body: formData });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return { ok: false, error: `ارسال تکهٔ ${i + 1}/${totalChunks} ناموفق بود (${response.status})${body ? ': ' + body.slice(0, 200) : ''}` };
      }
      onProgress?.(Math.round(((i + 1) / totalChunks) * 100));

      // تکهٔ آخر — پاسخ نهایی سرور (گزارش import) همین‌جا برمی‌گردد
      if (i === totalChunks - 1) {
        const data = await response.json().catch(() => null);
        return { ok: true, data };
      }
    }
    return { ok: false, error: 'آپلود به پایان نرسید.' };
  } catch (e: any) {
    // قطع شبکه در میانهٔ ارسال → کاربر می‌تواند از ابتدا (همان fileId؟ خیر — از اول) ادامه دهد
    return { ok: false, error: e?.message || 'خطا در ارسال فایل' };
  }
}
