"use client";

/**
 * خروجی Word از یک ناحیهٔ چاپیِ صفحه (بدون هیچ کتابخانهٔ اضافه).
 *
 * چرا HTML با MIME ورد؟ سندِ چاپی از قبل رندر شده است و همان DOM دقیقاً
 * همان چیزی است که کاربر می‌بیند (WYSIWYG). ساختنِ دوبارهٔ سند در سرور،
 * ریسکِ واگرایی با چاپ را دارد. Word فایلِ HTML با پسوند .doc را کامل
 * باز می‌کند و جدول‌ها/استایل‌ها حفظ می‌شوند.
 *
 * ⚠ BOM اضافه می‌شود تا فارسی در Word درست رمزگشایی شود.
 */
export default function ExportWordButton({
  targetSelector,
  fileName,
  label = '📄 خروجی Word',
  className = '',
}: {
  /** انتخابگرِ ناحیهٔ چاپی، مثلاً '.print-area' */
  targetSelector: string;
  fileName: string;
  label?: string;
  className?: string;
}) {
  const onExport = () => {
    const el = document.querySelector(targetSelector);
    if (!el) {
      alert('ناحیهٔ قابل‌چاپ پیدا نشد.');
      return;
    }

    const head = `
      <meta charset="utf-8" />
      <title>${fileName}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Tahoma, 'B Nazanin', sans-serif; direction: rtl; font-size: 9pt; color: #0f172a; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #94a3b8; padding: 2px 4px; vertical-align: middle; }
        th { background: #f1f5f9; font-weight: bold; }
        img { max-width: 100%; }
        h1, h2, h3, h4 { margin: 4px 0; }
        .print\\:hidden { display: none !important; }
      </style>`;

    const html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
      'xmlns="http://www.w3.org/TR/REC-html40"><head>' +
      head +
      '</head><body dir="rtl">' +
      (el as HTMLElement).innerHTML +
      '</body></html>';

    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  return (
    <button type="button" onClick={onExport} className={className || 'rounded-lg border border-white/30 bg-white/10 px-2.5 py-1.5 text-2xs font-bold text-white hover:bg-white/20'}>
      {label}
    </button>
  );
}
