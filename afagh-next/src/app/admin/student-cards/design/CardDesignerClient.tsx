'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import StudentCardView, {
 StudentCardBackView,
 CARD_FIELD_DEFS,
 CARD_FIELD_KEYS,
 CARD_SIZE_PRESETS,
 DEFAULT_CARD_BACK,
 DEFAULT_CARD_DESIGN,
 clampNum,
 safeHex,
 type CardBackDesign,
 type CardData,
 type CardDesign,
 type CardSignature,
} from '@/components/StudentCardView';
import type { SavedCardDesign } from '@/lib/student-card-designs';
import {
 deleteCardDesignAction,
 saveCardDesignAction,
 setDefaultCardDesignAction,
 uploadCardAssetAction,
} from './actions';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function newId(): string {
 return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
 return (
 <section className="card !p-4 space-y-3 bg-white border-slate-300 shadow-sm">
 <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
 {children}
 </section>
 );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
 return (
 <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
 <span>{label}</span>
 <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
 </label>
 );
}

function NumberField({
 label,
 value,
 onChange,
 min,
 max,
 step = 0.01,
 suffix,
}: {
 label: string;
 value: number;
 onChange: (v: number) => void;
 min: number;
 max: number;
 step?: number;
 suffix?: string;
}) {
 return (
 <label className="text-2xs font-bold text-slate-600">
 {label}
 <span className="mt-1 flex items-center gap-1">
 <input
 type="number"
 dir="ltr"
 value={Number.isFinite(value) ? value : ''}
 min={min}
 max={max}
 step={step}
 onChange={e => {
 const n = e.target.valueAsNumber;
 if (Number.isFinite(n)) onChange(clampNum(n, value, min, max));
 }}
 className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs"
 />
 {suffix && <span className="text-3xs font-bold text-slate-400">{suffix}</span>}
 </span>
 </label>
 );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
 const [text, setText] = useState(value);
 // با تغییر مقدار از بیرون (مثلاً انتخاب طراحی دیگر) متن هم همگام می‌شود
 useEffect(() => {
 setText(value);
 }, [value]);
 return (
 <label className="text-2xs font-bold text-slate-600">
 {label}
 <span className="mt-1 flex items-center gap-2">
 <input
 type="color"
 value={value}
 onChange={e => {
 setText(e.target.value);
 onChange(e.target.value);
 }}
 className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
 aria-label={label}
 />
 <input
 type="text"
 dir="ltr"
 value={text}
 onChange={e => setText(e.target.value)}
 onBlur={() => {
 const safe = safeHex(text, value);
 setText(safe);
 onChange(safe);
 }}
 className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs"
 placeholder="#1e3a8a"
 />
 </span>
 </label>
 );
}

function AssetPicker({
 label,
 url,
 busy,
 onUpload,
 onClear,
}: {
 label: string;
 url: string;
 busy: boolean;
 onUpload: (f: File) => void;
 onClear: () => void;
}) {
 return (
 <div className="rounded-lg border border-slate-200 p-2">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <span className="text-2xs font-bold text-slate-600">{label}</span>
 <span className="flex items-center gap-1">
 <label className={`cursor-pointer rounded-lg border px-2 py-1 text-3xs font-bold ${busy ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100'}`}>
 {busy ? 'در حال بارگذاری…' : '📤 بارگذاری تصویر'}
 <input
 type="file"
 accept="image/*"
 className="hidden"
 disabled={busy}
 onChange={e => {
 const f = e.target.files?.[0];
 e.target.value = '';
 if (f) onUpload(f);
 }}
 />
 </label>
 {url && (
 <button
 type="button"
 onClick={onClear}
 className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-3xs font-bold text-rose-800 hover:bg-rose-100"
 >
 حذف
 </button>
 )}
 </span>
 </div>
 {url ? (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={url} alt={label} className="mt-2 max-h-20 rounded border border-slate-200 object-contain" />
 ) : (
 <p className="mt-1 text-3xs text-slate-400">تصویری انتخاب نشده — PNG/JPG/WebP تا ۵ مگابایت</p>
 )}
 </div>
 );
}

export default function CardDesignerClient({
 initialDesigns,
 initialDefaultId,
 sample,
}: {
 initialDesigns: SavedCardDesign[];
 initialDefaultId: string;
 sample: CardData;
}) {
 // اگر سرور هیچ طراحی‌ای برنگرداند (نباید رخ دهد)، یک طراحی پیش‌فرض محلی می‌سازیم
 const fallbackDesign: SavedCardDesign = {
 id: 'default',
 title: 'طراحی پیش‌فرض',
 front: clone(DEFAULT_CARD_DESIGN),
 back: clone(DEFAULT_CARD_BACK),
 updatedAt: '',
 };
 const first = initialDesigns.find(d => d.id === initialDefaultId) ?? initialDesigns[0] ?? fallbackDesign;
 const [designs, setDesigns] = useState<SavedCardDesign[]>(initialDesigns.length ? initialDesigns : [fallbackDesign]);
 const [defaultId, setDefaultId] = useState(initialDefaultId || fallbackDesign.id);
 const [draft, setDraft] = useState<SavedCardDesign>(() => clone(first));
 const [side, setSide] = useState<'front' | 'back'>('front');
 const [makeDefault, setMakeDefault] = useState(false);
 const [pending, startTransition] = useTransition();
 const [uploading, setUploading] = useState<string | null>(null);
 const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

 const saved = useMemo(() => designs.find(d => d.id === draft.id), [designs, draft.id]);
 const dirty = useMemo(() => !saved || JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

 const setFront = <K extends keyof CardDesign>(key: K, value: CardDesign[K]) =>
 setDraft(d => ({ ...d, front: { ...d.front, [key]: value } }));
 const setBack = <K extends keyof CardBackDesign>(key: K, value: CardBackDesign[K]) =>
 setDraft(d => ({ ...d, back: { ...d.back, [key]: value } }));
 const patchSig = (which: 'front' | 'back', patch: Partial<CardSignature>) =>
 setDraft(d =>
 which === 'front'
 ? { ...d, front: { ...d.front, signature: { ...d.front.signature, ...patch } } }
 : { ...d, back: { ...d.back, signature: { ...d.back.signature, ...patch } } },
 );

 const notify = (ok: boolean, text: string) => setMsg({ ok, text });

 const loadDesign = (id: string) => {
 const d = designs.find(x => x.id === id);
 if (!d) return;
 if (dirty && !window.confirm('تغییرات ذخیره‌نشده از دست می‌رود. ادامه می‌دهید؟')) return;
 setDraft(clone(d));
 setMakeDefault(false);
 setSide('front');
 setMsg(null);
 };

 const createNew = () => {
 if (dirty && !window.confirm('تغییرات ذخیره‌نشده از دست می‌رود. طراحی جدید ساخته شود؟')) return;
 setDraft({
 id: newId(),
 title: 'طراحی جدید',
 front: clone(DEFAULT_CARD_DESIGN),
 back: clone(DEFAULT_CARD_BACK),
 updatedAt: '',
 });
 setMakeDefault(false);
 setSide('front');
 setMsg(null);
 };

 const save = () => {
 setMsg(null);
 startTransition(async () => {
 const res = await saveCardDesignAction({
 id: draft.id,
 title: draft.title,
 front: draft.front,
 back: draft.back,
 makeDefault,
 });
 notify(res.ok, res.message);
 if (res.ok && res.design) {
 const savedDesign = res.design;
 setDesigns(prev => {
 const idx = prev.findIndex(d => d.id === savedDesign.id);
 return idx >= 0 ? prev.map(d => (d.id === savedDesign.id ? savedDesign : d)) : [...prev, savedDesign];
 });
 setDraft(clone(savedDesign));
 if (makeDefault) setDefaultId(savedDesign.id);
 setMakeDefault(false);
 }
 });
 };

 const removeDesign = () => {
 if (!saved) {
 const target = designs[0];
 if (target) setDraft(clone(target));
 return;
 }
 if (!window.confirm(`طراحی «${draft.title}» حذف شود؟`)) return;
 startTransition(async () => {
 const res = await deleteCardDesignAction(draft.id);
 notify(res.ok, res.message);
 if (res.ok) {
 const next = designs.filter(d => d.id !== draft.id);
 setDesigns(next);
 if (next[0]) setDraft(clone(next[0]));
 if (defaultId === draft.id && next[0]) setDefaultId(next[0].id);
 setSide('front');
 }
 });
 };

 const makeDefaultNow = () => {
 startTransition(async () => {
 const res = await setDefaultCardDesignAction(draft.id);
 notify(res.ok, res.message);
 if (res.ok) setDefaultId(draft.id);
 });
 };

 const uploadAsset = async (file: File, kind: string, apply: (url: string) => void) => {
 setUploading(kind);
 setMsg(null);
 try {
 const fd = new FormData();
 fd.set('file', file);
 fd.set('kind', kind);
 const res = await uploadCardAssetAction(fd);
 if (res.ok && res.url) {
 apply(res.url);
 notify(true, res.message);
 } else {
 notify(false, res.message);
 }
 } catch {
 notify(false, 'بارگذاری تصویر ناموفق بود.');
 } finally {
 setUploading(null);
 }
 };

 const preview =
 side === 'front' ? (
 <StudentCardView design={draft.front} data={sample} />
 ) : draft.back.enabled ? (
 <StudentCardBackView
 design={draft.back}
 data={sample}
 widthMm={draft.front.widthMm}
 heightMm={draft.front.heightMm}
 />
 ) : (
 <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs font-bold text-slate-500">
 پشت کارت غیرفعال است. برای چاپ پشت، گزینهٔ «چاپ پشت کارت» را روشن کنید.
 </div>
 );

 return (
 <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
 {/* ── فرم طراحی ── */}
 <div className="space-y-4">
 <Section title="۰) طراحی و نام آن">
 <div className="flex flex-wrap items-end gap-2">
 <label className="min-w-48 flex-1 text-2xs font-bold text-slate-600">
 انتخاب طراحی
 <select
 value={draft.id}
 onChange={e => loadDesign(e.target.value)}
 className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold"
 >
 {!saved && <option value={draft.id}>{draft.title} (ذخیره‌نشده)</option>}
 {designs.map(d => (
 <option key={d.id} value={d.id}>
 {d.title}
 {d.id === defaultId ? ' — پیش‌فرض' : ''}
 </option>
 ))}
 </select>
 </label>
 <label className="min-w-48 flex-1 text-2xs font-bold text-slate-600">
 نام طراحی (روی کارت چاپ نمی‌شود)
 <input
 type="text"
 value={draft.title}
 maxLength={60}
 onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
 className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
 placeholder="مثال: کارت دانشجویان کارشناسی ۱۴۰۴"
 />
 </label>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <button type="button" onClick={createNew} disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-2xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
 ＋ طراحی جدید
 </button>
 {saved && defaultId !== draft.id && (
 <button type="button" onClick={makeDefaultNow} disabled={pending} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-2xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
 ⭐ تعیین به‌عنوان پیش‌فرض
 </button>
 )}
 {saved && (
 <button type="button" onClick={removeDesign} disabled={pending} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-2xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50">
 حذف طراحی
 </button>
 )}
 {defaultId === draft.id && (
 <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-3xs font-bold text-emerald-800">پیش‌فرض فعلی</span>
 )}
 </div>
 </Section>

 <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
 <button
 type="button"
 onClick={() => setSide('front')}
 className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold ${side === 'front' ? 'bg-indigo-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
 >
 روی کارت
 </button>
 <button
 type="button"
 onClick={() => setSide('back')}
 className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold ${side === 'back' ? 'bg-indigo-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
 >
 پشت کارت {draft.back.enabled ? '' : '(غیرفعال)'}
 </button>
 </div>

 {side === 'front' ? (
 <>
 <Section title="۱) قالب روی کارت">
 <div className="grid gap-2 sm:grid-cols-3">
 {([
 { value: 'CLASSIC', title: 'کلاسیک', desc: 'سربرگ خاکستری — رسمی', swatch: 'from-slate-100 to-slate-50 border-slate-400' },
 { value: 'MODERN', title: 'مدرن', desc: 'نوار رنگی و عنوان برجسته', swatch: 'from-indigo-600 to-indigo-900 border-indigo-800' },
 { value: 'MINIMAL', title: 'مینیمال', desc: 'سفید و سبک با خط نازک', swatch: 'from-white to-slate-50 border-slate-300' },
 ] as const).map(t => {
 const active = draft.front.template === t.value;
 return (
 <button
 key={t.value}
 type="button"
 onClick={() => setFront('template', t.value)}
 className={`rounded-xl border-2 p-2 text-right transition ${active ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'}`}
 aria-pressed={active}
 >
 <span className={`block h-12 rounded-lg border bg-gradient-to-br ${t.swatch}`} />
 <span className="mt-1.5 block text-xs font-extrabold text-slate-800">{t.title}</span>
 <span className="mt-0.5 block text-3xs leading-4 text-slate-500">{t.desc}</span>
 </button>
 );
 })}
 </div>
 </Section>

 <Section title="۲) رنگ و عنوان">
 <div className="flex flex-wrap items-end gap-3">
 <ColorField label="رنگ اصلی" value={draft.front.accent} onChange={v => setFront('accent', v)} />
 <label className="min-w-48 flex-1 text-2xs font-bold text-slate-600">
 عنوان بالای کارت
 <input
 type="text"
 value={draft.front.header}
 maxLength={80}
 onChange={e => setFront('header', e.target.value)}
 className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
 />
 </label>
 </div>
 <label className="block text-2xs font-bold text-slate-600">
 متن پانویس
 <input
 type="text"
 value={draft.front.footer}
 maxLength={200}
 onChange={e => setFront('footer', e.target.value)}
 className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
 />
 </label>
 </Section>

 <Section title="۳) ابعاد کارت">
 <div className="flex flex-wrap gap-1.5">
 {CARD_SIZE_PRESETS.map(p => {
 const active = draft.front.widthMm === p.widthMm && draft.front.heightMm === p.heightMm;
 return (
 <button
 key={p.id}
 type="button"
 onClick={() => setDraft(d => ({ ...d, front: { ...d.front, widthMm: p.widthMm, heightMm: p.heightMm } }))}
 className={`rounded-lg border px-2.5 py-1.5 text-2xs font-bold ${active ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
 >
 {p.label}
 </button>
 );
 })}
 </div>
 <div className="flex flex-wrap items-end gap-3">
 <NumberField label="عرض" value={draft.front.widthMm} onChange={v => setFront('widthMm', v)} min={50} max={120} suffix="mm" />
 <NumberField label="ارتفاع" value={draft.front.heightMm} onChange={v => setFront('heightMm', v)} min={30} max={100} suffix="mm" />
 </div>
 <p className="text-3xs text-slate-500">استاندارد ID-1 (کارت بانکی): ۸۵٫۶ × ۵۳٫۹۸ میلی‌متر. برای کارت عمودی، عرض و ارتفاع را جابه‌جا کنید.</p>
 </Section>

 <Section title="۴) فیلدهای چاپی">
 <div className="grid gap-1.5 sm:grid-cols-2">
 {CARD_FIELD_KEYS.map(key => {
 const def = CARD_FIELD_DEFS[key];
 const checked = draft.front.fields.includes(key);
 return (
 <label
 key={key}
 className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${checked ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
 >
 <input
 type="checkbox"
 checked={checked}
 onChange={() =>
 setFront(
 'fields',
 checked ? draft.front.fields.filter(k => k !== key) : [...draft.front.fields, key],
 )
 }
 className="h-3.5 w-3.5 accent-indigo-600"
 />
 {def.label}
 </label>
 );
 })}
 </div>
 <p className="text-3xs text-slate-500">«نام و نام خانوادگی» همیشه چاپ می‌شود. نام رشته در صورت بلندبودن می‌پیچد و کامل نمایش داده می‌شود.</p>
 </Section>

 <Section title="۵) اجزای تصویری و آرم">
 <div className="grid gap-2 sm:grid-cols-2">
 <Toggle label="عکس دانشجو" checked={draft.front.showPhoto} onChange={v => setFront('showPhoto', v)} />
 <Toggle label="QR استعلام هویت" checked={draft.front.showQr} onChange={v => setFront('showQr', v)} />
 <Toggle label="آرم دانشگاه" checked={draft.front.showLogo} onChange={v => setFront('showLogo', v)} />
 <label className="text-2xs font-bold text-slate-600">
 جای آرم
 <select
 value={draft.front.logoPos}
 onChange={e => setFront('logoPos', e.target.value as CardDesign['logoPos'])}
 className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
 >
 <option value="start">راست (ابتدای کارت)</option>
 <option value="center">وسط سربرگ</option>
 <option value="end">چپ (انتهای کارت)</option>
 </select>
 </label>
 </div>
 <NumberField label="اندازهٔ آرم" value={draft.front.logoMm} onChange={v => setFront('logoMm', v)} min={6} max={18} suffix="mm" />
 <p className="text-3xs text-slate-500">آرم از «آرم دانشگاه» (تنظیمات/دانشگاه) خوانده می‌شود؛ اگر خالی باشد نمایش داده نمی‌شود.</p>
 </Section>

 <Section title="۶) تصویر پس‌زمینه">
 <AssetPicker
 label="تصویر پس‌زمینهٔ روی کارت"
 url={draft.front.bgUrl}
 busy={uploading === 'front-bg'}
 onUpload={f => uploadAsset(f, 'front-bg', url => setFront('bgUrl', url))}
 onClear={() => setFront('bgUrl', '')}
 />
 <label className="block text-2xs font-bold text-slate-600">
 پوشش سفید روی تصویر: {draft.front.bgOverlay}٪
 <input
 type="range"
 min={0}
 max={100}
 step={5}
 value={draft.front.bgOverlay}
 onChange={e => setFront('bgOverlay', Number(e.target.value))}
 className="mt-1 w-full accent-indigo-600"
 />
 </label>
 <p className="text-3xs text-slate-500">۰٪ = تصویر کاملاً واضح؛ ۱۰۰٪ = کاملاً سفید. برای خوانایی متن ۵۰ تا ۷۵ مناسب است.</p>
 </Section>

 <Section title="۷) جای امضا / مهر (روی کارت)">
 <Toggle label="نمایش جای امضا" checked={draft.front.signature.show} onChange={v => patchSig('front', { show: v })} />
 {draft.front.signature.show && (
 <>
 <label className="block text-2xs font-bold text-slate-600">
 عنوان زیر امضا
 <input
 type="text"
 value={draft.front.signature.title}
 maxLength={40}
 onChange={e => patchSig('front', { title: e.target.value })}
 className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
 />
 </label>
 <AssetPicker
 label="تصویر امضا/مهر (اختیاری — خالی = خط امضا)"
 url={draft.front.signature.imageUrl}
 busy={uploading === 'front-sign'}
 onUpload={f => uploadAsset(f, 'front-sign', url => patchSig('front', { imageUrl: url }))}
 onClear={() => patchSig('front', { imageUrl: '' })}
 />
 <NumberField label="ارتفاع امضا" value={draft.front.signature.mm} onChange={v => patchSig('front', { mm: v })} min={6} max={30} suffix="mm" />
 </>
 )}
 </Section>
 </>
 ) : (
 <>
 <Section title="۱) پشت کارت">
 <Toggle label="چاپ پشت کارت" checked={draft.back.enabled} onChange={v => setBack('enabled', v)} />
 <label className="block text-2xs font-bold text-slate-600">
 عنوان پشت
 <input
 type="text"
 value={draft.back.header}
 maxLength={80}
 onChange={e => setBack('header', e.target.value)}
 className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
 />
 </label>
 <label className="block text-2xs font-bold text-slate-600">
 متن پشت کارت (هر خط جداگانه چاپ می‌شود)
 <textarea
 value={draft.back.body}
 rows={6}
 maxLength={800}
 onChange={e => setBack('body', e.target.value)}
 className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs leading-6"
 />
 </label>
 </Section>

 <Section title="۲) رنگ و تصویر پشت">
 <ColorField label="رنگ اصلی پشت" value={draft.back.accent} onChange={v => setBack('accent', v)} />
 <AssetPicker
 label="تصویر پس‌زمینهٔ پشت کارت"
 url={draft.back.bgUrl}
 busy={uploading === 'back-bg'}
 onUpload={f => uploadAsset(f, 'back-bg', url => setBack('bgUrl', url))}
 onClear={() => setBack('bgUrl', '')}
 />
 <label className="block text-2xs font-bold text-slate-600">
 پوشش سفید روی تصویر: {draft.back.bgOverlay}٪
 <input
 type="range"
 min={0}
 max={100}
 step={5}
 value={draft.back.bgOverlay}
 onChange={e => setBack('bgOverlay', Number(e.target.value))}
 className="mt-1 w-full accent-indigo-600"
 />
 </label>
 <Toggle label="QR استعلام هویت در پشت" checked={draft.back.showQr} onChange={v => setBack('showQr', v)} />
 </Section>

 <Section title="۳) جای امضا / مهر (پشت کارت)">
 <Toggle label="نمایش جای امضا در پشت" checked={draft.back.signature.show} onChange={v => patchSig('back', { show: v })} />
 {draft.back.signature.show && (
 <>
 <label className="block text-2xs font-bold text-slate-600">
 عنوان زیر امضا
 <input
 type="text"
 value={draft.back.signature.title}
 maxLength={40}
 onChange={e => patchSig('back', { title: e.target.value })}
 className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
 />
 </label>
 <AssetPicker
 label="تصویر امضا/مهر (اختیاری — خالی = خط امضا)"
 url={draft.back.signature.imageUrl}
 busy={uploading === 'back-sign'}
 onUpload={f => uploadAsset(f, 'back-sign', url => patchSig('back', { imageUrl: url }))}
 onClear={() => patchSig('back', { imageUrl: '' })}
 />
 <NumberField label="ارتفاع امضا" value={draft.back.signature.mm} onChange={v => patchSig('back', { mm: v })} min={6} max={30} suffix="mm" />
 </>
 )}
 </Section>
 </>
 )}

 <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white p-3 shadow-lg">
 <button
 type="button"
 onClick={save}
 disabled={pending || !dirty}
 className="rounded-xl bg-indigo-700 px-5 py-2.5 text-xs font-extrabold text-white shadow hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
 >
 {pending ? 'در حال ذخیره…' : '💾 ذخیرهٔ طراحی'}
 </button>
 {saved && defaultId !== draft.id && (
 <label className="flex items-center gap-1 text-3xs font-bold text-slate-600">
 <input type="checkbox" checked={makeDefault} onChange={e => setMakeDefault(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
 پیش‌فرض صدور شود
 </label>
 )}
 {dirty && !pending && <span className="text-3xs font-bold text-amber-700">تغییرات ذخیره نشده است</span>}
 {msg && (
 <span className={`rounded-lg border px-2.5 py-1.5 text-3xs font-bold ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
 {msg.text}
 </span>
 )}
 </div>
 </div>

 {/* ── پیش‌نمایش زنده ── */}
 <div className="xl:sticky xl:top-4 xl:self-start">
 <div className="card !p-4 bg-slate-50 border-slate-300 shadow-sm">
 <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
 <h2 className="text-sm font-extrabold text-slate-900">پیش‌نمایش زنده</h2>
 <div className="flex gap-1">
 <button
 type="button"
 onClick={() => setSide('front')}
 className={`rounded-lg px-2 py-1 text-3xs font-bold ${side === 'front' ? 'bg-indigo-700 text-white' : 'border border-slate-300 bg-white text-slate-600'}`}
 >
 رو
 </button>
 <button
 type="button"
 onClick={() => setSide('back')}
 className={`rounded-lg px-2 py-1 text-3xs font-bold ${side === 'back' ? 'bg-indigo-700 text-white' : 'border border-slate-300 bg-white text-slate-600'}`}
 >
 پشت
 </button>
 </div>
 </div>
 <div className="mx-auto max-w-xl overflow-x-auto">
 {preview}
 </div>
 <p className="mt-3 text-3xs leading-5 text-slate-500">
 ابعاد واقعی کارت با میلی‌متر تنظیم می‌شود؛ چاپ در همان اندازه انجام می‌شود. اگر پشت کارت فعال باشد، صفحهٔ چاپ دو طرف را (با شکست صفحه) چاپ می‌کند.
 </p>
 </div>
 </div>
 </div>
 );
}
