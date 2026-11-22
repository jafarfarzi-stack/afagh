import PersonPhoto from '@/app/admin/students/components/PersonPhoto';
import QrSvg from '@/components/QrSvg';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  رندرِ مشترکِ «کارت دانشجویی» — هم صفحهٔ چاپ و هم فرمِ طراحی
 *  (/admin/student-cards/design) از همین کامپوننت استفاده می‌کنند تا
 *  آنچه مدیر در فرم می‌بیند، دقیقاً همان چیزی باشد که چاپ می‌شود.
 *
 *  هیچ وابستگی سمتِ سرور ندارد (فقط props) تا در کلاینت هم قابل
 *  پیش‌نمایشِ زنده باشد. رنگِ اصلی به‌صورت inline style اعمال می‌شود چون
 *  Tailwind کلاسِ داینامیک (مثل bg-[#hex]) را در build نمی‌شناسد.
 * ─────────────────────────────────────────────────────────────────────
 */

export type CardTemplate = 'CLASSIC' | 'MODERN' | 'MINIMAL';

export type CardDesign = {
  template: CardTemplate;
  accent: string;
  header: string;
  footer: string;
  fields: string[];
  showPhoto: boolean;
  showQr: boolean;
  showLogo: boolean;
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

export const DEFAULT_CARD_DESIGN: CardDesign = {
  template: 'CLASSIC',
  accent: '#1e3a8a',
  header: 'کارت شناسایی دانشجویی',
  footer: 'این کارت امانت است و در صورت درخواست مأموران باید ارائه شود.',
  fields: ['studentCode', 'nationalCode', 'major', 'degree', 'entryYear', 'status', 'validUntil'],
  showPhoto: true,
  showQr: true,
  showLogo: true,
};

/** خواندن طراحیِ ذخیره‌شده از تنظیمات (رشته‌ها) با مقادیر پیش‌فرضِ ایمن */
export function parseCardDesign(values: Record<string, string | undefined | null>): CardDesign {
  const t = String(values.STUDENT_CARD_TEMPLATE || 'CLASSIC').toUpperCase();
  const template: CardTemplate = t === 'MODERN' || t === 'MINIMAL' ? t : 'CLASSIC';
  const rawFields = String(values.STUDENT_CARD_FIELDS ?? DEFAULT_CARD_DESIGN.fields.join(','));
  const fields = rawFields
    .split(',')
    .map(s => s.trim())
    .filter(s => !!CARD_FIELD_DEFS[s]);
  return {
    template,
    accent: safeHex(values.STUDENT_CARD_ACCENT, DEFAULT_CARD_DESIGN.accent),
    header: String(values.STUDENT_CARD_HEADER ?? DEFAULT_CARD_DESIGN.header).trim() || DEFAULT_CARD_DESIGN.header,
    footer: String(values.STUDENT_CARD_FOOTER ?? DEFAULT_CARD_DESIGN.footer).trim(),
    fields: fields.length ? fields : DEFAULT_CARD_DESIGN.fields,
    showPhoto: parseBool(values.STUDENT_CARD_SHOW_PHOTO, true),
    showQr: parseBool(values.STUDENT_CARD_SHOW_QR, true),
    showLogo: parseBool(values.STUDENT_CARD_SHOW_LOGO, true),
  };
}

export function safeHex(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s : fallback;
}

function parseBool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const fa = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** فیلدهای فعال به‌ترتیبِ تعریف‌شده — نه ترتیبِ ذخیره در تنظیمات */
function activeFields(design: CardDesign) {
  return CARD_FIELD_KEYS.filter(k => design.fields.includes(k)).map(k => ({ key: k, ...CARD_FIELD_DEFS[k] }));
}

function Logo({ url, design, className = 'h-10 w-10' }: { url?: string | null; design: CardDesign; className?: string }) {
  if (!design.showLogo || !url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="آرم دانشگاه" className={`${className} object-contain`} />
  );
}

function Photo({ data, className }: { data: CardData; className: string }) {
  return (
    <PersonPhoto
      userId={data.photoUserId}
      hasPhoto={!!data.hasPhoto}
      className={className}
      label="عکس دانشجو"
    />
  );
}

function Qr({ data, className }: { data: CardData; className: string }) {
  if (!data.qrSvg) {
    return (
      <div className={`${className} flex items-center justify-center rounded border border-dashed border-slate-300 text-3xs text-slate-400`}>
        QR در دسترس نیست
      </div>
    );
  }
  return (
    <QrSvg
      svg={data.qrSvg}
      className={`${className} overflow-hidden rounded border border-slate-300 bg-white p-1 [&>svg]:block [&>svg]:h-full [&>svg]:w-full`}
    />
  );
}

function FieldRow({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <span className="w-24 shrink-0 font-bold text-slate-500">{label}:</span>
      <span className={`min-w-0 flex-1 truncate ${strong ? 'font-black' : 'font-bold'} text-slate-800 ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export default function StudentCardView({ design, data }: { design: CardDesign; data: CardData }) {
  const rows = activeFields(design);
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const uni = data.uniTitle || '';
  const accent = design.accent;

  if (design.template === 'MODERN') {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl print:shadow-none" dir="rtl">
        {/* نوار رنگی بالا */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ background: `linear-gradient(120deg, ${accent} 0%, ${shade(accent, -18)} 100%)` }}>
          <div className="flex items-center gap-2">
            <Logo url={data.logoUrl} design={design} />
            <div>
              <p className="text-[13px] font-black leading-tight">{uni}</p>
              <p className="text-3xs opacity-90">{design.header}</p>
            </div>
          </div>
          <span className="rounded-md bg-white/15 px-2 py-1 font-mono text-[11px] font-bold" dir="ltr">
            {fa(data.studentCode)}
          </span>
        </div>

        <div className="flex gap-4 p-4">
          {design.showPhoto && (
            <div className="shrink-0">
              <Photo data={data} className="h-40 w-32 rounded-xl border-2 border-white shadow-md ring-2" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-sm font-black text-slate-900">{fullName}</p>
            <div className="grid grid-cols-1 gap-1.5 text-2xs sm:grid-cols-2">
              {rows.filter(r => r.key !== 'studentCode').map(r => (
                <FieldRow key={r.key} label={r.label} value={r.value(data)} mono={r.mono} strong={r.strong} />
              ))}
            </div>
          </div>
          {design.showQr && (
            <div className="shrink-0 text-center">
              <Qr data={data} className="h-28 w-28" />
              <p className="mt-1 text-[9px] font-bold text-slate-500">استعلام هویت</p>
            </div>
          )}
        </div>

        <div className="px-4 py-1.5 text-[9px] leading-4 text-white/90" style={{ backgroundColor: accent }}>
          {design.footer}
        </div>
      </div>
    );
  }

  if (design.template === 'MINIMAL') {
    return (
      <div className="overflow-hidden rounded-xl border bg-white shadow-lg print:shadow-none" style={{ borderColor: accent }} dir="rtl">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderBottom: `1.5px solid ${accent}` }}>
          <div className="flex items-center gap-2">
            <Logo url={data.logoUrl} design={design} className="h-8 w-8" />
            <div>
              <p className="text-[12px] font-black" style={{ color: accent }}>{uni}</p>
              <p className="text-3xs text-slate-500">{design.header}</p>
            </div>
          </div>
          <span className="font-mono text-[11px] font-bold text-slate-700" dir="ltr">{fa(data.studentCode)}</span>
        </div>

        <div className="flex gap-4 p-4">
          {design.showPhoto && <Photo data={data} className="h-36 w-28 rounded-lg border border-slate-300" />}
          <div className="min-w-0 flex-1 space-y-1 text-2xs">
            <p className="mb-1.5 text-sm font-black text-slate-900">{fullName}</p>
            {rows.map(r => (
              <FieldRow key={r.key} label={r.label} value={r.value(data)} mono={r.mono} strong={r.strong} />
            ))}
          </div>
          {design.showQr && <Qr data={data} className="h-24 w-24 shrink-0 self-end" />}
        </div>

        <div className="px-4 py-1.5 text-[9px] leading-4 text-slate-500" style={{ borderTop: `1px solid ${accent}33` }}>
          {design.footer}
        </div>
      </div>
    );
  }

  /* CLASSIC — چیدمان رسمیِ قبلی (سازگار با کارت‌های چاپ‌شده) */
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-slate-800 bg-white shadow-xl print:shadow-none" dir="rtl">
      <div className="flex items-center justify-between gap-3 border-b-2 border-slate-800 bg-slate-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <Logo url={data.logoUrl} design={design} />
          <div>
            <p className="text-[13px] font-black text-slate-900">{uni}</p>
            <p className="text-3xs text-slate-600">{design.header}</p>
          </div>
        </div>
        <p className="text-3xs font-bold text-slate-600">{fa(data.studentCode)}</p>
      </div>

      <div className="flex flex-wrap gap-4 p-4">
        {design.showPhoto && (
          <div className="shrink-0">
            <Photo data={data} className="h-40 w-32 rounded-lg border border-slate-300" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1.5 text-2xs">
          <FieldRow label="نام و نام خانوادگی" value={fullName} strong />
          {rows.map(r => (
            <FieldRow key={r.key} label={r.label} value={r.value(data)} mono={r.mono} strong={r.strong} />
          ))}
        </div>
        {design.showQr && (
          <div className="shrink-0 text-center">
            <Qr data={data} className="h-32 w-32" />
            <p className="mt-1 text-[9px] font-bold text-slate-600">اسکن برای استعلام هویت</p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-300 bg-slate-50 px-4 py-1.5 text-[9px] leading-4 text-slate-600">
        {design.footer}
      </div>
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
