import type { CSSProperties } from 'react';
import PersonPhoto from '@/app/admin/students/components/PersonPhoto';
import QrSvg from '@/components/QrSvg';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  رندرِ مشترکِ «کارت دانشجویی» (رو و پشت) — هم صفحهٔ چاپ و هم فرمِ
 *  طراحی (/admin/student-cards/design) از همین کامپوننت استفاده می‌کنند
 *  تا آنچه مدیر در فرم می‌بیند، دقیقاً همان چیزی باشد که چاپ می‌شود.
 *
 *  • ابعاد فیزیکی با میلی‌متر اعمال می‌شود؛ استاندارد ID-1 =
 *    ۸۵٫۶ × ۵۳٫۹۸ میلی‌متر (مثل کارت بانکی).
 *  • تصویر پس‌زمینه + پوشش سفیدِ قابل تنظیم برای خوانایی متن.
 *  • آرم در سربرگ با جای راست/وسط/چپ و اندازهٔ میلی‌متری.
 *  • جای امضا/مهر (تصویر یا خط خالی) در پانویس رو و پشت کارت.
 *
 *  هیچ وابستگی سمتِ سرور ندارد (فقط props) تا در کلاینت هم قابل
 *  پیش‌نمایشِ زنده باشد. رنگِ اصلی inline اعمال می‌شود چون Tailwind
 *  کلاسِ داینامیک (مثل bg-[#hex]) را در build نمی‌شناسد.
 * ─────────────────────────────────────────────────────────────────────
 */

export type CardTemplate = 'CLASSIC' | 'MODERN' | 'MINIMAL';
export type CardLogoPos = 'start' | 'center' | 'end';

export type CardSignature = {
  show: boolean;
  title: string;
  imageUrl: string;
  /** ارتفاع تصویر امضا به میلی‌متر */
  mm: number;
};

export type CardDesign = {
  template: CardTemplate;
  accent: string;
  header: string;
  footer: string;
  fields: string[];
  showPhoto: boolean;
  showQr: boolean;
  showLogo: boolean;
  logoPos: CardLogoPos;
  logoMm: number;
  widthMm: number;
  heightMm: number;
  bgUrl: string;
  bgOverlay: number;
  signature: CardSignature;
};

/** طراحی پشت کارت — فقط وقتی چاپ می‌شود که enabled باشد */
export type CardBackDesign = {
  enabled: boolean;
  header: string;
  body: string;
  accent: string;
  bgUrl: string;
  bgOverlay: number;
  showQr: boolean;
  signature: CardSignature;
};

export type CardData = {
  firstName: string;
  lastName: string;
  studentCode: string;
  nationalCode?: string | null;
  majorName?: string | null;
  degreeTitle?: string | null;
  entryYear?: number | string | null;
  status?: string | null;
  validUntil?: string | null;
  uniTitle?: string | null;
  logoUrl?: string | null;
  photoUserId?: number | null;
  hasPhoto?: boolean;
  qrSvg?: string | null;
};

/** کلیدهای مجازِ فیلد + برچسب و قالبِ مقدار */
export const CARD_FIELD_DEFS: Record<
  string,
  { label: string; value: (d: CardData) => string; mono?: boolean; strong?: boolean }
> = {
  studentCode: { label: 'شمارهٔ دانشجویی', value: d => fa(d.studentCode), mono: true, strong: true },
  nationalCode: { label: 'کد ملی', value: d => fa(d.nationalCode), mono: true },
  major: { label: 'رشته', value: d => String(d.majorName || '—') },
  degree: { label: 'مقطع', value: d => String(d.degreeTitle || '—') },
  entryYear: { label: 'سال ورود', value: d => fa(d.entryYear) },
  status: { label: 'وضعیت کارت', value: d => String(d.status || 'PENDING') },
  validUntil: { label: 'اعتبار تا', value: d => String(d.validUntil || '—') },
};

export const CARD_FIELD_KEYS = Object.keys(CARD_FIELD_DEFS);

/** اندازه‌های رایج کارت — برای دکمه‌های آمادهٔ فرم طراحی */
export const CARD_SIZE_PRESETS = [
  { id: 'id1', label: 'ID-1 افقی (استاندارد)', widthMm: 85.6, heightMm: 53.98 },
  { id: 'id1v', label: 'ID-1 عمودی', widthMm: 53.98, heightMm: 85.6 },
  { id: 'large', label: 'کارت بزرگ ۹۰×۶۰', widthMm: 90, heightMm: 60 },
] as const;

export const DEFAULT_SIGNATURE: CardSignature = {
  show: false,
  title: 'مهر و امضای دانشگاه',
  imageUrl: '',
  mm: 14,
};

export const DEFAULT_CARD_DESIGN: CardDesign = {
  template: 'CLASSIC',
  accent: '#1e3a8a',
  header: 'کارت شناسایی دانشجویی',
  footer: 'این کارت امانت است و در صورت درخواست مأموران باید ارائه شود.',
  fields: ['studentCode', 'nationalCode', 'major', 'degree', 'entryYear', 'status', 'validUntil'],
  showPhoto: true,
  showQr: true,
  showLogo: true,
  logoPos: 'start',
  logoMm: 10,
  widthMm: 85.6,
  heightMm: 53.98,
  bgUrl: '',
  bgOverlay: 65,
  signature: DEFAULT_SIGNATURE,
};

export const DEFAULT_CARD_BACK: CardBackDesign = {
  enabled: false,
  header: 'پشت کارت دانشجویی',
  body: 'این کارت مخصوص شناسایی دانشجو در دانشگاه است و قابل انتقال به غیر نیست.\nدر صورت مفقودی، موضوع را فوراً به ادارهٔ آموزش اطلاع دهید.\nاستعلام برخط هویت از پایگاه دادهٔ مرکزی دانشگاه انجام می‌شود.',
  accent: '#1e3a8a',
  bgUrl: '',
  bgOverlay: 80,
  showQr: true,
  signature: { ...DEFAULT_SIGNATURE, show: true, title: 'مهر و امضای دانشگاه' },
};

/** خواندن طراحیِ ذخیره‌شده از تنظیماتِ تخت (سازگاری با نسخهٔ قبل از چند طراحی) */
export function parseCardDesign(values: Record<string, string | undefined | null>): CardDesign {
  const t = String(values.STUDENT_CARD_TEMPLATE || 'CLASSIC').toUpperCase();
  const template: CardTemplate = t === 'MODERN' || t === 'MINIMAL' ? t : 'CLASSIC';
  const rawFields = String(values.STUDENT_CARD_FIELDS ?? DEFAULT_CARD_DESIGN.fields.join(','));
  const fields = rawFields
    .split(',')
    .map(s => s.trim())
    .filter(s => !!CARD_FIELD_DEFS[s]);
  const lp = String(values.STUDENT_CARD_LOGO_POS || 'start');
  const logoPos: CardLogoPos = lp === 'center' || lp === 'end' ? lp : 'start';
  return {
    template,
    accent: safeHex(values.STUDENT_CARD_ACCENT, DEFAULT_CARD_DESIGN.accent),
    header: String(values.STUDENT_CARD_HEADER ?? DEFAULT_CARD_DESIGN.header).trim() || DEFAULT_CARD_DESIGN.header,
    footer: String(values.STUDENT_CARD_FOOTER ?? DEFAULT_CARD_DESIGN.footer).trim(),
    fields: fields.length ? fields : DEFAULT_CARD_DESIGN.fields,
    showPhoto: parseBool(values.STUDENT_CARD_SHOW_PHOTO, true),
    showQr: parseBool(values.STUDENT_CARD_SHOW_QR, true),
    showLogo: parseBool(values.STUDENT_CARD_SHOW_LOGO, true),
    logoPos,
    logoMm: clampNum(values.STUDENT_CARD_LOGO_MM, 10, 6, 18),
    widthMm: clampNum(values.STUDENT_CARD_WIDTH_MM, 85.6, 50, 120),
    heightMm: clampNum(values.STUDENT_CARD_HEIGHT_MM, 53.98, 30, 100),
    bgUrl: safeBgUrl(values.STUDENT_CARD_BG_URL),
    bgOverlay: clampNum(values.STUDENT_CARD_BG_OVERLAY, 65, 0, 100),
    signature: DEFAULT_SIGNATURE,
  };
}

export function safeHex(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s : fallback;
}

/** فقط مسیر داخلی یا http(s) — از تزریق CSS در url() جلوگیری می‌کند */
export function safeBgUrl(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\/[^/]/.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

export function parseBool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

/** عدد با ارقام فارسی/عربی، جداکنندهٔ اعشار فارسی، و بازهٔ مجاز */
export function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  const s = String(v ?? '')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٫،]/g, '.')
    .replace(/,/g, '.')
    .trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

const fa = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** فیلدهای فعال به‌ترتیبِ تعریف‌شده — نه ترتیبِ ذخیره در تنظیمات */
function activeFields(design: CardDesign) {
  return CARD_FIELD_KEYS.filter(k => design.fields.includes(k)).map(k => ({ key: k, ...CARD_FIELD_DEFS[k] }));
}

function Logo({ data, design }: { data: CardData; design: CardDesign }) {
  if (!design.showLogo || !data.logoUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={data.logoUrl}
      alt="آرم دانشگاه"
      className="shrink-0 object-contain"
      style={{ width: `${design.logoMm}mm`, height: `${design.logoMm}mm` }}
    />
  );
}

function FieldRow({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex min-w-0 gap-[1mm]">
      <span className="shrink-0 truncate font-bold text-slate-500" style={{ width: '14mm' }}>
        {label}:
      </span>
      <span className={`min-w-0 flex-1 break-words leading-[1.35] ${strong ? 'font-black' : 'font-bold'} text-slate-800 ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function SignatureBlock({ sig, dark = false }: { sig: CardSignature; dark?: boolean }) {
  if (!sig.show) return null;
  return (
    <div className="shrink-0 text-center">
      {sig.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sig.imageUrl}
          alt={sig.title}
          className="mx-auto object-contain"
          style={{ height: `${sig.mm}mm`, maxWidth: `${sig.mm * 3}mm` }}
        />
      ) : (
        <div
          className={`mx-auto border-b border-dashed ${dark ? 'border-white/50' : 'border-slate-400'}`}
          style={{ height: `${sig.mm}mm`, width: `${sig.mm * 2.2}mm` }}
        />
      )}
      <p className={`mt-[0.3mm] text-[5.5px] font-bold ${dark ? 'text-white/85' : 'text-slate-600'}`}>{sig.title}</p>
    </div>
  );
}

/** تیره/روشن‌کردنِ سادهٔ رنگ HEX برای گرادیان */
function shade(hex: string, percent: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (percent / 100) * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function shellStyleOf(widthMm: number, heightMm: number): CSSProperties {
  return {
    width: `${widthMm}mm`,
    height: `${heightMm}mm`,
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  } as CSSProperties;
}

function BackgroundLayers({ url, overlay }: { url: string; overlay: number }) {
  if (!url) return null;
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${encodeURI(url)}")` }}
      />
      <div className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: overlay / 100 }} />
    </>
  );
}

function QrBlock({ data, mm, label }: { data: CardData; mm: number; label: string }) {
  return (
    <div className="shrink-0 text-center">
      <div style={{ width: `${mm}mm`, height: `${mm}mm` }} className="mx-auto">
        {data.qrSvg ? (
          <QrSvg
            svg={data.qrSvg}
            className="h-full w-full overflow-hidden rounded border border-slate-300 bg-white p-[0.5mm] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-slate-300 text-[6px] text-slate-400">
            QR
          </div>
        )}
      </div>
      <p className="mt-[0.5mm] text-[6px] font-bold text-slate-500">{label}</p>
    </div>
  );
}

export default function StudentCardView({ design, data }: { design: CardDesign; data: CardData }) {
  const rows = activeFields(design);
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const uni = data.uniTitle || '';
  const accent = design.accent;
  const portrait = design.heightMm > design.widthMm;

  const photoW = portrait ? design.widthMm * 0.46 : design.widthMm * 0.22;
  const photoH = portrait ? design.heightMm * 0.3 : design.heightMm * 0.56;
  const qrMm = Math.max(12, Math.min(design.widthMm, design.heightMm) * 0.3);
  const logo = <Logo data={data} design={design} />;
  const codeText = fa(data.studentCode);
  const dense = rows.length > 6;

  const footerInner = (
    <div className="flex items-end justify-between gap-[2mm]">
      <p className="min-w-0 flex-1 truncate text-[6.5px] leading-[1.7]">{design.footer}</p>
      <SignatureBlock sig={design.signature} />
    </div>
  );

  const body = (
    <div className={`flex min-h-0 flex-1 gap-[2mm] p-[3mm] ${portrait ? 'flex-col items-center' : 'items-start'}`}>
      {design.showPhoto && (
        <div
          className="shrink-0 overflow-hidden rounded-md border border-slate-300 bg-slate-100"
          style={{ width: `${photoW}mm`, height: `${photoH}mm` }}
        >
          <PersonPhoto userId={data.photoUserId} hasPhoto={!!data.hasPhoto} className="h-full w-full" label="عکس دانشجو" />
        </div>
      )}
      <div className="min-w-0 flex-1 self-stretch overflow-hidden">
        <p className={`mb-[1mm] truncate ${dense ? 'text-[10px]' : 'text-[11px]'} font-black leading-tight text-slate-900`}>{fullName}</p>
        <div className={`space-y-[0.5mm] ${dense ? 'text-[7px]' : 'text-[8px]'} leading-tight`}>
          {rows.map(r => (
            <FieldRow key={r.key} label={r.label} value={r.value(data)} mono={r.mono} strong={r.strong} />
          ))}
        </div>
      </div>
      {design.showQr && <QrBlock data={data} mm={qrMm} label="استعلام هویت" />}
    </div>
  );

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-xl print:shadow-none"
      style={shellStyleOf(design.widthMm, design.heightMm)}
      dir="rtl"
    >
      <BackgroundLayers url={design.bgUrl} overlay={design.bgOverlay} />

      {design.template === 'MODERN' ? (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div
            className="flex items-center gap-[2mm] px-[3mm] py-[2mm] text-white"
            style={{ background: `linear-gradient(120deg, ${accent} 0%, ${shade(accent, -18)} 100%)` }}
          >
            {design.logoPos === 'start' && logo}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-black leading-tight">{uni}</p>
              <p className="truncate text-[7px] leading-tight opacity-80">{design.header}</p>
            </div>
            {design.logoPos === 'center' && logo}
            <span className="shrink-0 rounded bg-white/15 px-[1.5mm] py-[0.5mm] font-mono text-[8px] font-bold" dir="ltr">
              {codeText}
            </span>
            {design.logoPos === 'end' && logo}
          </div>
          {body}
          <div className="px-[3mm] py-[1.5mm] text-white/90" style={{ backgroundColor: accent }}>
            {footerInner}
          </div>
        </div>
      ) : design.template === 'MINIMAL' ? (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-[2mm] px-[3mm] py-[2mm]" style={{ borderBottom: `1.5px solid ${accent}` }}>
            {design.logoPos === 'start' && logo}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-black leading-tight" style={{ color: accent }}>{uni}</p>
              <p className="truncate text-[7px] leading-tight text-slate-500">{design.header}</p>
            </div>
            {design.logoPos === 'center' && logo}
            <span className="shrink-0 font-mono text-[8px] font-bold text-slate-700" dir="ltr">{codeText}</span>
            {design.logoPos === 'end' && logo}
          </div>
          {body}
          <div className="px-[3mm] py-[1.5mm] text-slate-500" style={{ borderTop: `1px solid ${accent}33` }}>
            {footerInner}
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-[2mm] border-b-2 border-slate-800 bg-slate-50 px-[3mm] py-[2mm]">
            {design.logoPos === 'start' && logo}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-black leading-tight text-slate-900">{uni}</p>
              <p className="truncate text-[7px] leading-tight text-slate-600">{design.header}</p>
            </div>
            {design.logoPos === 'center' && logo}
            <span className="shrink-0 font-mono text-[8px] font-bold text-slate-600" dir="ltr">{codeText}</span>
            {design.logoPos === 'end' && logo}
          </div>
          {body}
          <div className="border-t border-slate-300 bg-slate-50 px-[3mm] py-[1.5mm] text-slate-600">
            {footerInner}
          </div>
        </div>
      )}
    </div>
  );
}

/** پشتِ کارت — همان ابعاد/پس‌زمینهٔ رو، با متن قوانین، QR و جای امضا */
export function StudentCardBackView({
  design,
  data,
  widthMm,
  heightMm,
}: {
  design: CardBackDesign;
  data: CardData;
  widthMm: number;
  heightMm: number;
}) {
  const uni = data.uniTitle || '';
  const accent = design.accent;
  const qrMm = Math.max(13, Math.min(widthMm, heightMm) * 0.3);
  const portrait = heightMm > widthMm;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-xl print:shadow-none"
      style={shellStyleOf(widthMm, heightMm)}
      dir="rtl"
    >
      <BackgroundLayers url={design.bgUrl} overlay={design.bgOverlay} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div
          className="flex items-center justify-between gap-[2mm] px-[3mm] py-[2mm] text-white"
          style={{ background: `linear-gradient(120deg, ${accent} 0%, ${shade(accent, -18)} 100%)` }}
        >
          <div className="flex min-w-0 items-center gap-[2mm]">
            {data.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logoUrl} alt="آرم دانشگاه" className="h-[8mm] w-[8mm] shrink-0 object-contain" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black leading-tight">{uni}</p>
              <p className="truncate text-[7px] leading-tight opacity-80">{design.header}</p>
            </div>
          </div>
          <span className="shrink-0 rounded bg-white/15 px-[1.5mm] py-[0.5mm] font-mono text-[7px] font-bold" dir="ltr">
            {fa(data.studentCode)}
          </span>
        </div>

        <div className={`flex min-h-0 flex-1 gap-[2mm] p-[3mm] ${portrait ? 'flex-col' : 'flex-row items-start'}`}>
          <p className="min-w-0 flex-1 whitespace-pre-line text-[7.5px] leading-[1.8] text-slate-700">{design.body}</p>
          {design.showQr && <QrBlock data={data} mm={qrMm} label="استعلام هویت" />}
        </div>

        <div className="border-t border-slate-300 bg-slate-50 px-[3mm] py-[1.5mm]">
          <div className="flex items-end justify-between gap-[2mm]">
            <p className="min-w-0 flex-1 truncate text-[6.5px] text-slate-500">
              {data.validUntil ? `اعتبار کارت تا ${data.validUntil}` : ''}
            </p>
            <SignatureBlock sig={design.signature} />
          </div>
        </div>
      </div>
    </div>
  );
}
