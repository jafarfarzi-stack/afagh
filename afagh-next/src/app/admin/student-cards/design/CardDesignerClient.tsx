'use client';

import { useMemo, useState, useTransition } from 'react';
import StudentCardView, {
  CARD_FIELD_DEFS,
  CARD_FIELD_KEYS,
  DEFAULT_CARD_DESIGN,
  safeHex,
  type CardData,
  type CardDesign,
} from '@/components/StudentCardView';
import { saveSettingsAction } from '@/lib/settings-actions';

const TEMPLATES: { value: CardDesign['template']; title: string; desc: string; swatch: string }[] = [
  { value: 'CLASSIC', title: 'کلاسیک', desc: 'سربرگ خاکستری — رسمی و سازگار با کارت‌های چاپ‌شده', swatch: 'from-slate-100 to-slate-50 border-slate-400' },
  { value: 'MODERN', title: 'مدرن', desc: 'نوار رنگی، عکس بزرگ و QR گوشه', swatch: 'from-indigo-600 to-indigo-900 border-indigo-800' },
  { value: 'MINIMAL', title: 'مینیمال', desc: 'سفید و سبک با خط‌کشی نازک', swatch: 'from-white to-slate-50 border-slate-300' },
];

export default function CardDesignerClient({ initial, sample }: { initial: CardDesign; sample: CardData }) {
  const [design, setDesign] = useState<CardDesign>(initial);
  const [accentText, setAccentText] = useState(initial.accent);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = useMemo(() => JSON.stringify(design) !== JSON.stringify(initial), [design, initial]);

  const set = <K extends keyof CardDesign>(key: K, value: CardDesign[K]) =>
    setDesign(d => ({ ...d, [key]: value }));

  const toggleField = (key: string) =>
    setDesign(d => ({
      ...d,
      fields: d.fields.includes(key) ? d.fields.filter(k => k !== key) : [...d.fields, key],
    }));

  const applyAccent = (raw: string) => {
    setAccentText(raw);
    set('accent', safeHex(raw, design.accent));
  };

  const save = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await saveSettingsAction({
        STUDENT_CARD_TEMPLATE: design.template,
        STUDENT_CARD_ACCENT: design.accent,
        STUDENT_CARD_HEADER: design.header,
        STUDENT_CARD_FOOTER: design.footer,
        STUDENT_CARD_FIELDS: design.fields.join(','),
        STUDENT_CARD_SHOW_PHOTO: String(design.showPhoto),
        STUDENT_CARD_SHOW_QR: String(design.showQr),
        STUDENT_CARD_SHOW_LOGO: String(design.showLogo),
      });
      setMsg({ ok: res.ok, text: res.message });
    });
  };

  const reset = () => {
    setDesign(DEFAULT_CARD_DESIGN);
    setAccentText(DEFAULT_CARD_DESIGN.accent);
    setMsg(null);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ── فرم طراحی ── */}
      <div className="space-y-4">
        <section className="card !p-4 space-y-3 bg-white border-slate-300 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-900">۱) قالب کارت</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATES.map(t => {
              const active = design.template === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set('template', t.value)}
                  className={`rounded-xl border-2 p-2 text-right transition ${active ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'}`}
                  aria-pressed={active}
                >
                  <span className={`block h-12 rounded-lg border bg-gradient-to-br ${t.swatch}`} />
                  <span className="mt-1.5 block text-xs font-extrabold text-slate-800">{t.title}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{t.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card !p-4 space-y-3 bg-white border-slate-300 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-900">۲) رنگ و عنوان</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-2xs font-bold text-slate-600">
              رنگ اصلی
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={design.accent}
                  onChange={e => applyAccent(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                  aria-label="انتخاب رنگ اصلی کارت"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={accentText}
                  onChange={e => applyAccent(e.target.value)}
                  onBlur={() => setAccentText(design.accent)}
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs"
                  placeholder="#1e3a8a"
                />
              </span>
            </label>
            <label className="min-w-48 flex-1 text-2xs font-bold text-slate-600">
              عنوان بالای کارت
              <input
                type="text"
                value={design.header}
                onChange={e => set('header', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                maxLength={60}
              />
            </label>
          </div>
          <label className="block text-2xs font-bold text-slate-600">
            متن پانویس
            <input
              type="text"
              value={design.footer}
              onChange={e => set('footer', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              maxLength={160}
            />
          </label>
        </section>

        <section className="card !p-4 space-y-3 bg-white border-slate-300 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-900">۳) فیلدهای چاپی</h2>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {CARD_FIELD_KEYS.map(key => {
              const def = CARD_FIELD_DEFS[key];
              const checked = design.fields.includes(key);
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${checked ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleField(key)} className="h-3.5 w-3.5 accent-indigo-600" />
                  {def.label}
                </label>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500">«نام و نام خانوادگی» همیشه چاپ می‌شود و نیازی به تیک ندارد.</p>
        </section>

        <section className="card !p-4 space-y-2 bg-white border-slate-300 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-900">۴) اجزای تصویری</h2>
          {([
            ['showPhoto', 'عکس دانشجو'],
            ['showQr', 'QR استعلام هویت'],
            ['showLogo', 'آرم دانشگاه'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={design[key]}
                onChange={e => set(key, e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
            </label>
          ))}
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="rounded-xl bg-indigo-700 px-5 py-2.5 text-xs font-extrabold text-white shadow hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'در حال ذخیره…' : '💾 ذخیرهٔ طراحی'}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            بازنشانی به پیش‌فرض
          </button>
          {dirty && !pending && <span className="text-[10px] font-bold text-amber-700">تغییرات ذخیره نشده است</span>}
          {msg && (
            <span className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </div>

      {/* ── پیش‌نمایش زنده ── */}
      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="card !p-4 bg-slate-50 border-slate-300 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">پیش‌نمایش زنده</h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">
              نمونهٔ دانشجو — چاپ از همین طراحی استفاده می‌کند
            </span>
          </div>
          <div className="mx-auto max-w-xl">
            <StudentCardView design={design} data={sample} />
          </div>
          <p className="mt-3 text-[10px] leading-5 text-slate-500">
            نکته: اندازهٔ واقعی کارت هنگام چاپ با CSS چاپ تنظیم می‌شود؛ رنگ و چیدمان همین‌جاست. برای کارت‌های RFID، شمارهٔ سریال در فهرست کارت‌ها ثبت می‌شود.
          </p>
        </div>
      </div>
    </div>
  );
}
