'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { notify, askConfirm } from '@/lib/ui-feedback';
import { faId } from '@/lib/calendar';
import { ENTITIES, type EntitySpec, type FieldSpec } from '@/lib/finance-base/entities';

const faNum = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');
const fmtMoney = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : faNum(v));

type Row = Record<string, unknown>;
type RefOpt = { value: number; label: string };
type Opt = { value: string; label: string };

interface Payload {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  refs: Record<string, RefOpt[]>;
  terms: Opt[];
}

const BASE = '/api/admin/finance/base-data';

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data?.errors) ? data.errors.join(' · ') : (data?.message ?? data?.error);
    throw new Error(msg ? String(msg) : 'خطای سرور');
  }
  return data;
}

/** مقدارِ ستون برای نمایش در جدول */
function cellText(spec: EntitySpec, field: string, row: Row, refs: Record<string, RefOpt[]>): string {
  const v = row[field];
  if (v === null || v === undefined || v === '') return '—';
  const f = spec.fields.find((x) => x.name === field);
  if (f?.kind === 'select' && f.options) {
    return f.options.find((o) => o.value === String(v))?.label ?? String(v);
  }
  if (f?.kind === 'ref' && f.ref) {
    const hit = (refs[f.ref] ?? []).find((o) => Number(o.value) === Number(v));
    return hit?.label ?? `#${v}`;
  }
  if (f?.kind === 'term') {
    const hit = (refs.__termIds ?? []).find((o) => Number(o.value) === Number(v));
    return hit?.label ?? `#${v}`;
  }
  if (f?.kind === 'money') return faNum(v);
  if (f?.kind === 'number') return faNum(v);
  return String(v);
}

export default function BaseDataClient() {
  const [active, setActive] = useState<string>(ENTITIES[0].key);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, startTransition] = useTransition();

  const spec = useMemo(
    () => ENTITIES.find((e) => e.key === active) ?? ENTITIES[0],
    [active],
  );

  const load = useCallback(async (key: string, p: number) => {
    const data = (await api(`${BASE}?entity=${key}&page=${p}`)) as Payload;
    setPayload(data);
  }, []);

  useEffect(() => {
    startTransition(() => {
      load(active, page).catch((e) => notify(e instanceof Error ? e.message : 'خطا', 'error'));
    });
  }, [active, page, load]);

  const openCreate = () => {
    const init: Record<string, string> = {};
    for (const f of spec.fields) {
      if (f.kind === 'select' && f.options?.length) init[f.name] = f.options[0].value;
      else init[f.name] = '';
    }
    setForm(init);
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (row: Row) => {
    const init: Record<string, string> = {};
    for (const f of spec.fields) {
      const v = row[f.name];
      init[f.name] = v === null || v === undefined ? '' : String(v);
    }
    setForm(init);
    setEditing(row);
    setFormOpen(true);
  };

  const submit = async () => {
    try {
      if (editing) {
        await api(`${BASE}?entity=${active}&id=${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        notify('ویرایش ثبت شد', 'success');
      } else {
        await api(`${BASE}?entity=${active}`, { method: 'POST', body: JSON.stringify(form) });
        notify('ردیف جدید ثبت شد', 'success');
      }
      setFormOpen(false);
      await load(active, page);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'خطا در ثبت', 'error');
    }
  };

  const remove = async (row: Row) => {
    const ok = await askConfirm({
      title: 'حذف ردیف',
      body: `این ردیف از «${spec.title}» حذف شود؟ این عمل بازگشت‌ناپذیر است.`,
      confirmText: 'حذف کن',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`${BASE}?entity=${active}&id=${row.id}`, { method: 'DELETE' });
      notify('حذف شد', 'success');
      await load(active, page);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'خطا در حذف', 'error');
    }
  };

  const refs = payload?.refs ?? {};
  const terms = payload?.terms ?? [];
  const total = payload?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (payload?.pageSize ?? 50)));

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── سربرگ ── */}
      <div className="overflow-hidden rounded-2xl border border-indigo-900/20 bg-gradient-to-l from-indigo-700 via-slate-800 to-slate-900 p-4 text-white shadow-lg print:hidden sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black sm:text-xl">🗂️ دادهٔ پایهٔ مالی</h1>
            <p className="mt-1 text-xs text-indigo-50/90">
              ورود داده برای گزارش‌های سود و زیان، ترازنامه، پیمانکاری، VAT، انبار، هزینه و حقوقی
            </p>
          </div>
          <button
            onClick={openCreate}
            className="rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-black backdrop-blur transition hover:bg-white/25"
          >
            ＋ ردیف جدید
          </button>
        </div>
      </div>

      {/* ── تبِ موجودیت‌ها ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {ENTITIES.map((e) => (
          <button
            key={e.key}
            onClick={() => {
              setActive(e.key);
              setPage(1);
              setPayload(null);
              setFormOpen(false);
            }}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
              active === e.key
                ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="me-1">{e.icon}</span>
            {e.title}
          </button>
        ))}
      </div>

      {/* ── فرم ── */}
      {formOpen && (
        <div className="card border-2 border-indigo-200">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-800">
              {editing ? `ویرایش ردیف #${editing.id}` : `ردیف جدید — ${spec.title}`}
            </h2>
            <button onClick={() => setFormOpen(false)} className="text-xs text-slate-500 hover:text-slate-800">
              ✕ بستن
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spec.fields.map((f) => (
              <FieldInput
                key={f.name}
                field={f}
                value={form[f.name] ?? ''}
                onChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))}
                refs={refs}
                terms={terms}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-black text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {editing ? 'ذخیرهٔ تغییرات' : 'ثبت'}
            </button>
            <button
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              انصراف
            </button>
            <span className="text-2xs text-slate-500">
              فیلدهای ستاره‌دار الزامی‌اند · مبلغ‌ها به ریالِ صحیح ذخیره می‌شوند
            </span>
          </div>
        </div>
      )}

      {/* ── جدول ── */}
      <div className="card overflow-x-auto">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800">
            {spec.icon} {spec.title}
            <span className="ms-2 text-2xs font-normal text-slate-500">
              {faNum(total)} ردیف · تغذیهٔ: {spec.feeds.join('، ')}
            </span>
          </h2>
          {pages > 1 && (
            <div className="flex items-center gap-1 text-2xs">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              >
                قبلی
              </button>
              <span className="px-1 text-slate-600">
                {faNum(page)} / {faNum(pages)}
              </span>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              >
                بعدی
              </button>
            </div>
          )}
        </div>

        {!payload ? (
          <div className="py-10 text-center text-xs text-slate-500">در حال بارگذاری…</div>
        ) : payload.rows.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            هنوز ردیفی ثبت نشده است. با «＋ ردیف جدید» شروع کنید.
            <div className="mt-1 text-2xs text-slate-400">
              تا وقتی این جدول خالی است، گزارش‌های مرتبط پیام «داده‌ای نیست» می‌دهند.
            </div>
          </div>
        ) : (
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th scope="col" className="px-2 py-2 text-right font-bold">#</th>
                {spec.list.map((c) => (
                  <th scope="col" key={c} className="whitespace-nowrap px-2 py-2 text-right font-bold">
                    {spec.fields.find((f) => f.name === c)?.label ?? c}
                  </th>
                ))}
                <th scope="col" className="px-2 py-2 text-center font-bold">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {payload.rows.map((row) => (
                <tr key={String(row.id)} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="px-2 py-1.5 text-slate-400">{faId(row.id)}</td>
                  {spec.list.map((c) => (
                    <td key={c} className="whitespace-nowrap px-2 py-1.5 text-slate-800">
                      {cellText(spec, c, row, refs)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => openEdit(row)}
                      className="rounded px-1.5 py-0.5 text-indigo-700 hover:bg-indigo-50"
                      title="ویرایش"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => remove(row)}
                      className="rounded px-1.5 py-0.5 text-rose-700 hover:bg-rose-50"
                      title="حذف"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── کنترلِ فیلد بر اساس نوع ─────────────────────────────────────────

function FieldInput({
  field,
  value,
  onChange,
  refs,
  terms,
}: {
  field: FieldSpec;
  value: string;
  onChange: (v: string) => void;
  refs: Record<string, RefOpt[]>;
  terms: Opt[];
}) {
  const cls =
    'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none';

  const label = (
    <label className="mb-1 block text-2xs font-bold text-slate-600">
      {field.label}
      {field.required && <span className="text-rose-600"> *</span>}
    </label>
  );

  let control: React.ReactNode;

  if (field.kind === 'select' && field.options) {
    control = (
      <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        {!field.required && <option value="">—</option>}
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === 'ref' && field.ref) {
    const opts = refs[field.ref] ?? [];
    control = (
      <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— انتخاب کنید —</option>
        {opts.map((o) => (
          <option key={o.value} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === 'term') {
    const opts = refs.__termIds ?? [];
    control = (
      <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— سالانه —</option>
        {opts.map((o) => (
          <option key={o.value} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === 'termCode') {
    control = (
      <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— سالانه —</option>
        {terms.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === 'textarea') {
    control = (
      <textarea
        className={`${cls} min-h-[64px]`}
        value={value}
        maxLength={field.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if (field.kind === 'date') {
    control = <input type="date" className={cls} value={value} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.kind === 'money' || field.kind === 'number') {
    // مبلغ = ریالِ صحیح ⇒ فقط رقم. عدد (مثل نرخ VAT) ⇒ یک ممیز مجاز است.
    const isMoney = field.kind === 'money';
    control = (
      <input
        type="text"
        inputMode={isMoney ? 'numeric' : 'decimal'}
        dir="ltr"
        className={`${cls} text-left`}
        value={value}
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.]/g, '');
          if (isMoney) {
            onChange(raw.replace(/\./g, ''));
            return;
          }
          // فقط اولین ممیز حفظ می‌شود
          const i = raw.indexOf('.');
          onChange(i === -1 ? raw : raw.slice(0, i + 1) + raw.slice(i + 1).replace(/\./g, ''));
        }}
      />
    );
  } else {
    control = (
      <input
        type="text"
        className={cls}
        value={value}
        maxLength={field.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div>
      {label}
      {control}
      {field.hint && <div className="mt-0.5 text-2xs text-slate-400">{field.hint}</div>}
    </div>
  );
}
