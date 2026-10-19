export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const SAFE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'application/pdf']);

const EXT_MIME = new Map<string, string[]>([
  ['jpg', ['image/jpeg']],
  ['jpeg', ['image/jpeg']],
  ['png', ['image/png']],
  ['webp', ['image/webp']],
  ['gif', ['image/gif']],
  ['bmp', ['image/bmp']],
  ['pdf', ['application/pdf']],
]);

/** اعتبارسنجی magic-bytes: بایت‌های آغازین باید با MIME ادعاشده بخوانند */
export function magicMatches(m: string, b: Buffer): boolean {
  if (b.length < 4) return false;
  if (m === 'image/jpeg') return b[0] === 0xFF && b[1] === 0xD8;
  if (m === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  if (m === 'image/gif') return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  if (m === 'application/pdf') return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (m === 'image/bmp') return b[0] === 0x42 && b[1] === 0x4D;
  if (m === 'image/webp') {
    return b.length >= 12
      && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  }
  return false;
}

/** whitelist نوع، magic-bytes و تطابق پسوند با MIME. خروجی: MIME معتبرشده و پسوند پاک‌شده */
export function checkUpload(fileName: string, claimedType: string, buf: Buffer):
  { ok: true; mime: string; ext: string } | { ok: false; status: number; error: string } {
  const mime = (claimedType || 'application/octet-stream').toLowerCase();
  if (!SAFE_MIME.has(mime)) return { ok: false, status: 415, error: 'نوع فایل مجاز نیست (فقط تصویر یا PDF).' };
  if (!magicMatches(mime, buf)) return { ok: false, status: 400, error: 'محتوای فایل با نوع ادعاشده مطابقت ندارد.' };
  const ext = (fileName.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  if (!EXT_MIME.get(ext)?.includes(mime)) return { ok: false, status: 400, error: 'پسوند فایل با نوع محتوا مطابقت ندارد.' };
  return { ok: true, mime, ext };
}

export type RequestFormValue = string | number | boolean | null | { key: string; name: string; size: number; mimeType: string };

const MAX_FORM_KEYS = 50;
const MAX_FORM_STRING = 2000;

/** اعتبارسنجی داده‌های فرم درخواست دانشجو؛ کلیدهای ضمیمه باید در پوشهٔ همان دانشجو باشند */
export function sanitizeRequestFormData(input: unknown, studentId: number):
  { ok: true; data: Record<string, RequestFormValue> } | { ok: false; error: string } {
  const bad = { ok: false as const, error: 'داده‌های فرم نامعتبر است.' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad;
  const entries = Object.entries(input);
  if (entries.length > MAX_FORM_KEYS) return { ok: false, error: 'تعداد فیلدهای فرم بیش از حد مجاز است.' };
  const prefix = `requests/${studentId}/`;
  const isOwnKey = (k: unknown) => typeof k === 'string' && k.startsWith(prefix) && !k.includes('..');
  const data: Record<string, RequestFormValue> = {};
  for (const [k, v] of entries) {
    if (k.length > 100) return bad;
    if (v === undefined) continue;
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) {
      data[k] = v;
    } else if (typeof v === 'string') {
      if (v.length > MAX_FORM_STRING) return { ok: false, error: 'یکی از مقادیر فرم بیش از حد طولانی است.' };
      if (v.startsWith('requests/') && !isOwnKey(v)) return { ok: false, error: 'پیوست نامعتبر است.' };
      data[k] = v;
    } else if (typeof v === 'object' && !Array.isArray(v) && isOwnKey((v as { key?: unknown }).key)) {
      const a = v as { key: string; name?: unknown; size?: unknown; mimeType?: unknown };
      data[k] = {
        key: a.key,
        name: String(a.name ?? '').slice(0, 255),
        size: Number(a.size) || 0,
        mimeType: String(a.mimeType ?? '').slice(0, 100),
      };
    } else {
      return bad;
    }
  }
  return { ok: true, data };
}
