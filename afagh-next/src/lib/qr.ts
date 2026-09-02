import 'server-only';
import QRCode from 'qrcode';

/**
 * موتور QR واقعی و قوی — بر پایهٔ کتابخانهٔ استاندارد `qrcode`.
 * خروجی SVG برداری (قابل چاپ و اسکن) با سطح تصحیح خطای M و حاشیهٔ استاندارد.
 * فقط سمت سرور اجرا می‌شود (server-only) تا در باندل کلاینت نرود.
 */

export interface QrOptions {
  /** سطح تصحیح خطا: L(7%) M(15%) Q(25%) H(30%) — برای اسناد چاپی M/H پیشنهاد می‌شود */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
  /** رنگ ماژول تیره (پیش‌فرض سرمه‌ای تیره برای چاپ) */
  dark?: string;
  light?: string;
}

/** تولید SVG برداری از متن/URL — برای رندر مستقیم یا چاپ */
export async function qrSvg(text: string, opts: QrOptions = {}): Promise<string> {
  const svg = await QRCode.toString(text || ' ', {
    type: 'svg',
    errorCorrectionLevel: opts.errorCorrectionLevel ?? 'M',
    margin: opts.margin ?? 2,
    color: { dark: opts.dark ?? '#0f172a', light: opts.light ?? '#ffffff' },
  });
  return svg;
}

/** تولید DataURL (PNG) برای جاهایی که تصویر لازم است */
export async function qrDataUrl(text: string, opts: QrOptions = {}): Promise<string> {
  return QRCode.toDataURL(text || ' ', {
    type: 'image/png',
    errorCorrectionLevel: opts.errorCorrectionLevel ?? 'M',
    margin: opts.margin ?? 2,
    width: 256,
    color: { dark: opts.dark ?? '#0f172aff', light: opts.light ?? '#ffffffff' },
  });
}
