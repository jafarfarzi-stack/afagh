'use client';

import { useState, useTransition } from 'react';
import {
  deleteDiscountTypeAction, deleteFormulaAction, deleteSponsorAction,
  saveDiscountTypeAction, saveFormulaAction, saveSponsorAction,
} from '../actions';

type DiscountType = {
  id: number; code: string; title: string; kind: string;
  defaultPercent: number; defaultAmount: number; maxPercent: number | null;
  requiresApproval: boolean; requiresDocument: boolean; isActive: boolean; note: string | null;
};
type Sponsor = {
  id: number; code: string; title: string; contactInfo: string | null;
  settlementMethod: string; isActive: boolean; note: string | null;
};
type Formula = {
  id: number; code: string; title: string;
  degreeLevelId: number | null; majorId: number | null;
  entryYearFrom: number | null; entryYearTo: number | null;
  fixedAmount: number; perUnitTheory: number; perUnitPractical: number; perUnitGeneral: number;
  priority: number; isActive: boolean; note: string | null;
};

const fa = (n: number) => Number(n || 0).toLocaleString('fa-IR');
const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const labelCls = 'flex flex-col gap-1 text-[11px] font-medium text-slate-600';
const btnCls =
  'rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50';
const ghostBtn =
  'rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600';

export default function RulesClient(props: {
  discountTypes: DiscountType[];
  sponsors: Sponsor[];
  formulas: Formula[];
  degrees: { id: number; title: string }[];
  majorsOptions: { id: number; title: string }[];
}) {
  const [tab, setTab] = useState<'discount' | 'sponsor' | 'formula'>('discount');
  const [editingDiscount, setEditingDiscount] = useState<DiscountType | null>(null);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [editingFormula, setEditingFormula] = useState<Formula | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, after?: () => void) {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await fn();
        setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error || 'عملیات ناموفق بود' });
        if (r.ok && after) after();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : 'خطای ناشناخته' });
      }
    });
  }

  const tabs = [
    { id: 'discount', label: '🎖️ انواع تخفیف' },
    { id: 'sponsor', label: '🏛️ بنیادهای حامی' },
    { id: 'formula', label: '🧮 فرمول تخصیص' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-1 border-b border-slate-100 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
          {msg.text}
        </p>
      )}

      {/* ═══ انواع تخفیف ═══ */}
      {tab === 'discount' && (
        <div className="card space-y-4">
          <form
            key={editingDiscount?.id ?? 'new-discount'}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const draft = editingDiscount;
              run(() => saveDiscountTypeAction({
                id: draft?.id,
                code: String(f.get('code') || ''),
                title: String(f.get('title') || ''),
                kind: String(f.get('kind') || 'PERCENT'),
                defaultPercent: Number(f.get('defaultPercent')) || 0,
                defaultAmount: Number(f.get('defaultAmount')) || 0,
                maxPercent: f.get('maxPercent') === '' ? null : Number(f.get('maxPercent')),
                requiresApproval: f.get('requiresApproval') === 'on',
                requiresDocument: f.get('requiresDocument') === 'on',
                isActive: f.get('isActive') === 'on',
                note: String(f.get('note') || ''),
              }), draft ? 'نوع تخفیف به‌روز شد' : 'نوع تخفیف ساخته شد', () => setEditingDiscount(null));
              e.currentTarget.reset();
            }}
            className="rounded-lg border border-slate-200 p-3"
          >
            <h4 className="mb-2 text-xs font-bold text-slate-800">
              {editingDiscount ? `ویرایش: ${editingDiscount.title}` : 'افزودن نوع تخفیف'}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className={labelCls}>کد *<input name="code" required defaultValue={editingDiscount?.code} placeholder="TOP_RANK" className={inputCls} /></label>
              <label className={`${labelCls} sm:col-span-2`}>عنوان *<input name="title" required defaultValue={editingDiscount?.title} placeholder="رتبهٔ برتر" className={inputCls} /></label>
              <label className={labelCls}>
                نوع
                <select name="kind" defaultValue={editingDiscount?.kind || 'PERCENT'} className={inputCls}>
                  <option value="PERCENT">درصدی</option>
                  <option value="FIXED">مبلغ ثابت</option>
                </select>
              </label>
              <label className={labelCls}>درصد پیش‌فرض<input name="defaultPercent" type="number" min={0} max={100} step="0.5" defaultValue={editingDiscount?.defaultPercent ?? 0} className={inputCls} /></label>
              <label className={labelCls}>مبلغ پیش‌فرض (ریال)<input name="defaultAmount" type="number" min={0} defaultValue={editingDiscount?.defaultAmount ?? 0} className={inputCls} /></label>
              <label className={labelCls}>سقف درصد مجاز (خالی = بدون سقف)<input name="maxPercent" type="number" min={0} max={100} step="0.5" defaultValue={editingDiscount?.maxPercent ?? ''} className={inputCls} /></label>
              <label className={`${labelCls} sm:col-span-2`}>یادداشت<input name="note" defaultValue={editingDiscount?.note ?? ''} className={inputCls} /></label>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
                  <input type="checkbox" name="requiresApproval" defaultChecked={editingDiscount?.requiresApproval ?? true} className="accent-emerald-700" />
                  نیازمند تأیید کارشناس مالی
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
                  <input type="checkbox" name="requiresDocument" defaultChecked={editingDiscount?.requiresDocument ?? false} className="accent-emerald-700" />
                  نیازمند مستندات
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
                  <input type="checkbox" name="isActive" defaultChecked={editingDiscount?.isActive ?? true} className="accent-emerald-700" />
                  فعال
                </label>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="submit" disabled={pending} className={btnCls}>{editingDiscount ? 'ذخیرهٔ تغییرات' : 'افزودن'}</button>
              {editingDiscount && (
                <button type="button" onClick={() => setEditingDiscount(null)} className={ghostBtn}>انصراف</button>
              )}
            </div>
          </form>

          {props.discountTypes.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">هنوز نوع تخفیفی تعریف نشده است.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                    <th className="p-2">کد</th><th className="p-2">عنوان</th><th className="p-2">نوع</th>
                    <th className="p-2">پیش‌فرض</th><th className="p-2">سقف</th><th className="p-2">وضعیت</th><th className="p-2">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {props.discountTypes.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-2 text-slate-500">{d.code}</td>
                      <td className="p-2 font-medium text-slate-800">{d.title}</td>
                      <td className="p-2">{d.kind === 'PERCENT' ? 'درصدی' : 'مبلغ ثابت'}</td>
                      <td className="p-2">{d.kind === 'PERCENT' ? `${fa(d.defaultPercent)}٪` : fa(d.defaultAmount)}</td>
                      <td className="p-2 text-slate-500">{d.maxPercent === null ? '—' : `${fa(d.maxPercent)}٪`}</td>
                      <td className="p-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${d.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {d.isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <button onClick={() => setEditingDiscount(d)} className={ghostBtn}>ویرایش</button>
                          <button disabled={pending} onClick={() => run(() => deleteDiscountTypeAction(d.id), 'حذف شد')} className={ghostBtn}>حذف</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ بنیادها ═══ */}
      {tab === 'sponsor' && (
        <div className="card space-y-4">
          <form
            key={editingSponsor?.id ?? 'new-sponsor'}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const draft = editingSponsor;
              run(() => saveSponsorAction({
                id: draft?.id,
                code: String(f.get('code') || ''),
                title: String(f.get('title') || ''),
                contactInfo: String(f.get('contactInfo') || ''),
                settlementMethod: String(f.get('settlementMethod') || 'DIRECT'),
                isActive: f.get('isActive') === 'on',
                note: String(f.get('note') || ''),
              }), draft ? 'بنیاد به‌روز شد' : 'بنیاد ساخته شد', () => setEditingSponsor(null));
              e.currentTarget.reset();
            }}
            className="rounded-lg border border-slate-200 p-3"
          >
            <h4 className="mb-2 text-xs font-bold text-slate-800">
              {editingSponsor ? `ویرایش: ${editingSponsor.title}` : 'افزودن بنیاد / نهاد حامی'}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className={labelCls}>کد *<input name="code" required defaultValue={editingSponsor?.code} placeholder="EMDAD" className={inputCls} /></label>
              <label className={`${labelCls} sm:col-span-2`}>عنوان *<input name="title" required defaultValue={editingSponsor?.title} placeholder="کمیتهٔ امداد امام خمینی" className={inputCls} /></label>
              <label className={labelCls}>
                نحوهٔ تسویه
                <select name="settlementMethod" defaultValue={editingSponsor?.settlementMethod || 'DIRECT'} className={inputCls}>
                  <option value="DIRECT">پرداخت مستقیم به دانشگاه</option>
                  <option value="REIMBURSE">پرداخت دانشجو و بازپرداخت بنیاد</option>
                </select>
              </label>
              <label className={`${labelCls} sm:col-span-2`}>اطلاعات تماس<input name="contactInfo" defaultValue={editingSponsor?.contactInfo ?? ''} className={inputCls} /></label>
              <label className={`${labelCls} sm:col-span-2`}>یادداشت<input name="note" defaultValue={editingSponsor?.note ?? ''} className={inputCls} /></label>
              <label className="flex items-end gap-1.5 pb-1.5 text-[11px] text-slate-700">
                <input type="checkbox" name="isActive" defaultChecked={editingSponsor?.isActive ?? true} className="accent-emerald-700" />
                فعال
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="submit" disabled={pending} className={btnCls}>{editingSponsor ? 'ذخیرهٔ تغییرات' : 'افزودن'}</button>
              {editingSponsor && <button type="button" onClick={() => setEditingSponsor(null)} className={ghostBtn}>انصراف</button>}
            </div>
          </form>

          {props.sponsors.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">هنوز بنیادی تعریف نشده است.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                    <th className="p-2">کد</th><th className="p-2">عنوان</th><th className="p-2">تسویه</th>
                    <th className="p-2">تماس</th><th className="p-2">وضعیت</th><th className="p-2">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {props.sponsors.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-2 text-slate-500">{s.code}</td>
                      <td className="p-2 font-medium text-slate-800">{s.title}</td>
                      <td className="p-2 text-slate-600">{s.settlementMethod === 'REIMBURSE' ? 'بازپرداخت' : 'مستقیم'}</td>
                      <td className="p-2 text-slate-500">{s.contactInfo || '—'}</td>
                      <td className="p-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${s.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {s.isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <button onClick={() => setEditingSponsor(s)} className={ghostBtn}>ویرایش</button>
                          <button disabled={pending} onClick={() => run(() => deleteSponsorAction(s.id), 'حذف شد')} className={ghostBtn}>حذف</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ فرمول تخصیص ═══ */}
      {tab === 'formula' && (
        <div className="card space-y-4">
          <form
            key={editingFormula?.id ?? 'new-formula'}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const draft = editingFormula;
              const intOr = (v: FormDataEntryValue | null) => (v === '' || v === null ? null : Number(v));
              run(() => saveFormulaAction({
                id: draft?.id,
                code: String(f.get('code') || ''),
                title: String(f.get('title') || ''),
                degreeLevelId: intOr(f.get('degreeLevelId')),
                majorId: intOr(f.get('majorId')),
                entryYearFrom: intOr(f.get('entryYearFrom')),
                entryYearTo: intOr(f.get('entryYearTo')),
                fixedAmount: Number(f.get('fixedAmount')) || 0,
                perUnitTheory: Number(f.get('perUnitTheory')) || 0,
                perUnitPractical: Number(f.get('perUnitPractical')) || 0,
                perUnitGeneral: Number(f.get('perUnitGeneral')) || 0,
                priority: Number(f.get('priority')) || 100,
                isActive: f.get('isActive') === 'on',
                note: String(f.get('note') || ''),
              }), draft ? 'فرمول به‌روز شد' : 'فرمول ساخته شد', () => setEditingFormula(null));
              e.currentTarget.reset();
            }}
            className="rounded-lg border border-slate-200 p-3"
          >
            <h4 className="mb-2 text-xs font-bold text-slate-800">
              {editingFormula ? `ویرایش: ${editingFormula.title}` : 'افزودن فرمول تخصیص'}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className={labelCls}>کد *<input name="code" required defaultValue={editingFormula?.code} className={inputCls} /></label>
              <label className={`${labelCls} sm:col-span-2`}>عنوان *<input name="title" required defaultValue={editingFormula?.title} className={inputCls} /></label>
              <label className={labelCls}>
                مقطع (خالی = همه)
                <select name="degreeLevelId" defaultValue={editingFormula?.degreeLevelId ?? ''} className={inputCls}>
                  <option value="">همهٔ مقاطع</option>
                  {props.degrees.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </label>
              <label className={labelCls}>
                رشته (خالی = همه)
                <select name="majorId" defaultValue={editingFormula?.majorId ?? ''} className={inputCls}>
                  <option value="">همهٔ رشته‌ها</option>
                  {props.majorsOptions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </label>
              <label className={labelCls}>اولویت (کوچک‌تر = بالاتر)<input name="priority" type="number" defaultValue={editingFormula?.priority ?? 100} className={inputCls} /></label>
              <label className={labelCls}>ورودی از<input name="entryYearFrom" type="number" defaultValue={editingFormula?.entryYearFrom ?? ''} className={inputCls} /></label>
              <label className={labelCls}>ورودی تا<input name="entryYearTo" type="number" defaultValue={editingFormula?.entryYearTo ?? ''} className={inputCls} /></label>
              <label className={labelCls}>شهریهٔ ثابت (ریال)<input name="fixedAmount" type="number" min={0} defaultValue={editingFormula?.fixedAmount ?? 0} className={inputCls} /></label>
              <label className={labelCls}>هر واحد نظری<input name="perUnitTheory" type="number" min={0} defaultValue={editingFormula?.perUnitTheory ?? 0} className={inputCls} /></label>
              <label className={labelCls}>هر واحد عملی<input name="perUnitPractical" type="number" min={0} defaultValue={editingFormula?.perUnitPractical ?? 0} className={inputCls} /></label>
              <label className={labelCls}>هر واحد عمومی<input name="perUnitGeneral" type="number" min={0} defaultValue={editingFormula?.perUnitGeneral ?? 0} className={inputCls} /></label>
              <label className={`${labelCls} sm:col-span-2`}>یادداشت<input name="note" defaultValue={editingFormula?.note ?? ''} className={inputCls} /></label>
              <label className="flex items-end gap-1.5 pb-1.5 text-[11px] text-slate-700">
                <input type="checkbox" name="isActive" defaultChecked={editingFormula?.isActive ?? true} className="accent-emerald-700" />
                فعال
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="submit" disabled={pending} className={btnCls}>{editingFormula ? 'ذخیرهٔ تغییرات' : 'افزودن'}</button>
              {editingFormula && <button type="button" onClick={() => setEditingFormula(null)} className={ghostBtn}>انصراف</button>}
            </div>
          </form>

          {props.formulas.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">هنوز فرمولی تعریف نشده است.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                    <th className="p-2">اولویت</th><th className="p-2">عنوان</th><th className="p-2">مقطع</th>
                    <th className="p-2">رشته</th><th className="p-2">ورودی</th><th className="p-2">ثابت</th>
                    <th className="p-2">نظری</th><th className="p-2">عملی</th><th className="p-2">عمومی</th>
                    <th className="p-2">وضعیت</th><th className="p-2">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {props.formulas.map((f) => (
                    <tr key={f.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-2 text-slate-600">{fa(f.priority)}</td>
                      <td className="p-2 font-medium text-slate-800">{f.title}<span className="mr-1 text-[10px] text-slate-400">{f.code}</span></td>
                      <td className="p-2 text-slate-600">{f.degreeLevelId ? props.degrees.find((d) => d.id === f.degreeLevelId)?.title || '—' : 'همه'}</td>
                      <td className="p-2 text-slate-600">{f.majorId ? props.majorsOptions.find((m) => m.id === f.majorId)?.title || '—' : 'همه'}</td>
                      <td className="p-2 text-slate-600">
                        {f.entryYearFrom || f.entryYearTo
                          ? `${f.entryYearFrom ? fa(f.entryYearFrom) : '…'} تا ${f.entryYearTo ? fa(f.entryYearTo) : '…'}`
                          : 'همه'}
                      </td>
                      <td className="p-2">{fa(f.fixedAmount)}</td>
                      <td className="p-2">{fa(f.perUnitTheory)}</td>
                      <td className="p-2">{fa(f.perUnitPractical)}</td>
                      <td className="p-2">{fa(f.perUnitGeneral)}</td>
                      <td className="p-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${f.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {f.isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <button onClick={() => setEditingFormula(f)} className={ghostBtn}>ویرایش</button>
                          <button disabled={pending} onClick={() => run(() => deleteFormulaAction(f.id), 'حذف شد')} className={ghostBtn}>حذف</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
