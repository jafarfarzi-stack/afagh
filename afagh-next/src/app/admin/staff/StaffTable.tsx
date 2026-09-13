'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ClientTh, useClientTable, type ColumnDef } from '@/components/DataTable';

export type StaffRow = {
  userId: number;
  code: string;
  name: string;
  family: string;
  staffCode: string | null;
  dept: string | null;
  rank: string | null;
  type: string | null;
};

export type RoleOption = { id: number; code: string; title: string | null; isSystem: number | null };

export default function StaffTable({
  rows,
  headUserIds,
  ledBy,
  toggleAction,
  rolesAll,
  userRoleIds,
  saveRolesAction,
  createAction,
  departments,
}: {
  rows: StaffRow[];
  headUserIds: number[];
  ledBy: Record<number, string[]>;
  toggleAction: (fd: FormData) => void;
  rolesAll: RoleOption[];
  userRoleIds: Record<number, number[]>;
  saveRolesAction: (userId: number, roleIds: number[]) => Promise<{ ok: boolean; error?: string; added?: number; removed?: number }>;
  createAction: (input: {
    nationalCode: string; firstName: string; lastName: string;
    fatherName?: string; birthCertNo?: string; gender?: string; mobile?: string;
    email?: string; staffCode?: string; departmentId?: number | null; staffType?: string;
  }) => Promise<{ ok: boolean; error?: string; userId?: number }>;
  departments: { id: number; name: string }[];
}) {
  const heads = new Set(headUserIds);
  const router = useRouter();
  const [roleModalFor, setRoleModalFor] = useState<StaffRow | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cmsg, setCmsg] = useState('');
  const [cf, setCf] = useState({
    nc: '', fn: '', ln: '', father: '', bcn: '', gender: '', mobile: '', email: '', staffCode: '', dept: '',
  });

  const setF = (k: keyof typeof cf) => (v: string) => setCf(prev => ({ ...prev, [k]: v }));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCmsg('');
    try {
      const res = await createAction({
        nationalCode: cf.nc, firstName: cf.fn, lastName: cf.ln,
        fatherName: cf.father, birthCertNo: cf.bcn, gender: cf.gender || undefined,
        mobile: cf.mobile, email: cf.email, staffCode: cf.staffCode,
        departmentId: cf.dept ? Number(cf.dept) : null,
      });
      if (!res.ok) { setCmsg(`⚠ ${res.error || 'ثبت نشد.'}`); return; }
      setCmsg('✅ حساب ساخته شد؛ حالا از ستون «نقش‌ها» نقش‌های کارشناس را بدهید.');
      setCreateOpen(false);
      setCf({ nc: '', fn: '', ln: '', father: '', bcn: '', gender: '', mobile: '', email: '', staffCode: '', dept: '' });
      router.refresh();
    } catch (err: any) {
      setCmsg(`⚠ ${err?.message || 'خطا در ارتباط با سرور.'}`);
    } finally {
      setCreating(false);
    }
  };

  const roleTitle = (id: number) => {
    const r = rolesAll.find(x => x.id === id);
    return r ? (r.title || r.code) : `#${id}`;
  };

  const openModal = (r: StaffRow) => {
    setRoleModalFor(r);
    setSel([...(userRoleIds[r.userId] ?? [])]);
    setMsg('');
  };

  const save = async () => {
    if (!roleModalFor) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await saveRolesAction(roleModalFor.userId, sel);
      if (!res.ok) { setMsg(`⚠ ${res.error || 'انجام نشد.'}`); return; }
      setMsg(`✅ ${res.added ?? 0} نقش اضافه، ${res.removed ?? 0} حذف شد.`);
      setRoleModalFor(null);
      router.refresh();
    } catch (e: any) {
      setMsg(`⚠ ${e?.message || 'خطا در ارتباط با سرور.'}`);
    } finally {
      setSaving(false);
    }
  };

  const COLS: ColumnDef<StaffRow>[] = [
    { key: 'name', label: 'نام', get: r => `${r.name} ${r.family}` },
    { key: 'code', label: 'کد', get: r => r.staffCode ?? '' },
    { key: 'dept', label: 'گروه', get: r => r.dept ?? '' },
    { key: 'rank', label: 'رتبه/نوع', get: r => r.rank ?? r.type ?? '' },
    { key: 'led', label: 'مدیر کدام گروه', get: r => (ledBy[r.userId] ?? []).join('، ') },
  ];
  const t = useClientTable(rows, COLS);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button
          onClick={() => { setCreateOpen(true); setCmsg(''); }}
          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold"
          title="ثبت حساب کاربری کارشناس/کارمند جدید (نه استاد و نه دانشجو)"
        >
          ＋ کارشناس / کارمند جدید
        </button>
        <span className="text-[10px] text-slate-500">هویت در users + ردیف کارکنان؛ رمز اولیه = کد ملی و مجبور به تغییر در اولین ورود</span>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full table-fixed text-right text-xs">
        <colgroup>
          <col style={{ width: 150 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 130 }} />
          <col />
          <col style={{ width: 110 }} />
          <col style={{ width: 110 }} />
        </colgroup>
        <thead>
          <tr className="text-slate-500">
            {COLS.map(c => (
              <ClientTh
                key={c.key}
                col={c}
                sortKey={t.sortKey}
                sortDir={t.sortDir}
                filter={t.filters[c.key] ?? ''}
                onSort={() => t.toggleSort(c.key)}
                onFilter={v => t.setFilter(c.key, v)}
              />
            ))}
            <th className="p-2">نقش مدیر گروه</th>
            <th className="p-2">نقش‌ها</th>
          </tr>
        </thead>
        <tbody>
          {t.visible.map(r => {
            const myRoles = userRoleIds[r.userId] ?? [];
            return (
              <tr key={r.userId} className={'border-t border-slate-100' + (heads.has(r.userId) ? ' bg-teal-50' : '')}>
                <td className="p-2 font-medium">{r.name} {r.family}</td>
                <td className="p-2" dir="ltr">{r.staffCode}</td>
                <td className="p-2">{r.dept ?? '—'}</td>
                <td className="p-2">{r.rank ?? r.type ?? '—'}</td>
                <td className="p-2 text-slate-600">{(ledBy[r.userId] ?? []).join('، ') || '—'}</td>
                <td className="p-2">
                  <form action={toggleAction}>
                    <input type="hidden" name="userId" value={r.userId} />
                    <input type="hidden" name="assign" value={heads.has(r.userId) ? '0' : '1'} />
                    <button className={heads.has(r.userId) ? 'text-red-600 hover:underline' : 'text-teal-700 hover:underline'}>
                      {heads.has(r.userId) ? 'گرفتن نقش' : 'دادن نقش'}
                    </button>
                  </form>
                </td>
                <td className="p-2">
                  <button
                    onClick={() => openModal(r)}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[11px]"
                    title={`نقش‌های فعلی: ${myRoles.map(roleTitle).join('، ') || 'هیچ'}`}
                  >
                    {myRoles.length > 0 ? `⚙ ${myRoles.length} نقش` : '⚙ نقش‌ها'}
                  </button>
                </td>
              </tr>
            );
          })}
          {t.visible.length === 0 && (
            <tr><td colSpan={7} className="p-6 text-center text-slate-400">موردی یافت نشد.</td></tr>
          )}
        </tbody>
      </table>

      {roleModalFor && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-800 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-extrabold text-sm">⚙ نقش‌های «{roleModalFor.name} {roleModalFor.family}»</h3>
              <button type="button" onClick={() => setRoleModalFor(null)} className="text-slate-300 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-600">
                نقش‌های تعریف‌شده را تیک بزنید/بردارید (کارشناس، مدیر گروه، استاد، …). برای تعریف نقش جدید به صفحهٔ «مدیریت سطوح دسترسی و نقش‌ها» بروید.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
                {rolesAll.map(r => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer border border-slate-200 rounded px-2.5 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-slate-800 rounded"
                      checked={sel.includes(r.id)}
                      onChange={e => setSel(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id))}
                    />
                    <span className="font-bold">{r.title || r.code}</span>
                    {!r.title && <span className="text-slate-400 text-[10px]">({r.code})</span>}
                    {r.code === 'ADMIN' && <span className="text-[9px] text-amber-700 mr-auto">مدیر ارشد</span>}
                  </label>
                ))}
              </div>
              {msg && <p className="text-[11px]" dir="auto">{msg}</p>}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setRoleModalFor(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg">انصراف</button>
                <button type="button" disabled={saving} onClick={save} className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white font-bold rounded-lg">
                  {saving ? 'در حال ثبت…' : '💾 ثبت نقش‌ها'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-800 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-extrabold text-sm">＋ ثبت کارشناس / کارمند جدید</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="text-slate-300 hover:text-white text-lg leading-none">✕</button>
            </div>
            <form onSubmit={create} className="p-5 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
              <p className="text-slate-600">
                اطلاعات شناسنامه‌ای و شغلی این فرد ثبت می‌شود؛ رمز ورود اولیه = کد ملی و در اولین ورود مجبور به تغییر است. پس از ثبت، از ستون «نقش‌ها» نقش‌های کارشناس (مثل EDU_EXPERT) را بدهید.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block col-span-1">
                  <span className="text-slate-600 font-bold block mb-0.5">کد ملی (رمز اولیه) *</span>
                  <input required pattern="[0-9]{10}" value={cf.nc} onChange={e => setF('nc')(e.target.value)} dir="ltr" className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" placeholder="کد ملی ۱۰ رقم" />
                </label>
                <label className="block col-span-1">
                  <span className="text-slate-600 font-bold block mb-0.5">نام *</span>
                  <input required value={cf.fn} onChange={e => setF('fn')(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5" />
                </label>
                <label className="block col-span-1">
                  <span className="text-slate-600 font-bold block mb-0.5">نام خانوادگی *</span>
                  <input required value={cf.ln} onChange={e => setF('ln')(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5" />
                </label>
                <label className="block col-span-1">
                  <span className="text-slate-600 font-bold block mb-0.5">نام پدر</span>
                  <input value={cf.father} onChange={e => setF('father')(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5" />
                </label>
                <label className="block col-span-1">
                  <span className="text-slate-600 font-bold block mb-0.5">شمارهٔ شناسنامه</span>
                  <input value={cf.bcn} onChange={e => setF('bcn')(e.target.value)} dir="ltr" className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" />
                </label>
                <label className="block col-span-1">
                  <span className="text-slate-600 font-bold block mb-0.5">جنسیت</span>
                  <select value={cf.gender} onChange={e => setF('gender')(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5">
                    <option value="">—</option>
                    <option value="MALE">مرد</option>
                    <option value="FEMALE">زن</option>
                  </select>
                </label>
                <label className="block col-span-1">
                  <span className="text-slate-600 font-bold block mb-0.5">موبایل</span>
                  <input value={cf.mobile} onChange={e => setF('mobile')(e.target.value)} dir="ltr" className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" placeholder="0912…" />
                </label>
                <label className="block col-span-1">
                  <span className="text-slate-600 font-bold block mb-0.5">ایمیل</span>
                  <input type="email" value={cf.email} onChange={e => setF('email')(e.target.value)} dir="ltr" className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" />
                </label>
                <label className="block col-span-1">
                  <span className="text-slate-600 font-bold block mb-0.5">کد پرسنلی (خالی = کد ملی)</span>
                  <input value={cf.staffCode} onChange={e => setF('staffCode')(e.target.value)} dir="ltr" className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" />
                </label>
                <label className="block col-span-1">
                  <span className="text-slate-600 font-bold block mb-0.5">گروه آموزشی</span>
                  <select value={cf.dept} onChange={e => setF('dept')(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5">
                    <option value="">—</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              </div>
              {cmsg && <p className="text-[11px]" dir="auto">{cmsg}</p>}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg">انصراف</button>
                <button type="submit" disabled={creating} className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white font-bold rounded-lg">
                  {creating ? 'در حال ثبت…' : '💾 ثبت حساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}