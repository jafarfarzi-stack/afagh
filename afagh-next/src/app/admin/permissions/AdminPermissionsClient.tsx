'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createRoleAction,
  deleteRoleAction,
  saveRolePermissionsAction,
  type PermissionsWorkspace,
} from './actions';

const faNum = (n: any) =>
  n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** مجوزی که هرگز نباید از مدیر ارشد گرفته شود (هم‌راستا با گارد سمت سرور) */
const ADMIN_LOCKED_CODE = 'system:manage_roles';

type Draft = Record<number, string[]>;

export default function AdminPermissionsClient({ initial }: { initial: PermissionsWorkspace }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const { roles, permissions, categories } = initial;

  // ── وضعیت پیش‌نویس: تیک‌ها تا زدن «تأیید» فقط اینجا می‌نشینند ──
  const baseline = useMemo<Draft>(() => {
    const m: Draft = {};
    for (const r of roles) m[r.id] = [...r.permissions].sort();
    return m;
  }, [roles]);

  const [draft, setDraft] = useState<Draft>(baseline);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [newRoleTitle, setNewRoleTitle] = useState('');
  const [newRoleCode, setNewRoleCode] = useState('');

  // هر بار داده از سرور تازه شد (router.refresh)، پیش‌نویس هم هم‌تراز می‌شود
  useEffect(() => setDraft(baseline), [baseline]);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 6000);
  };

  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

  const dirtyRoleIds = useMemo(
    () => roles.filter(r => !same(draft[r.id] ?? [], baseline[r.id] ?? [])).map(r => r.id),
    [roles, draft, baseline],
  );
  const isDirty = dirtyRoleIds.length > 0;

  // هشدار مرورگر هنگام خروج با تغییرِ ذخیره‌نشده
  useEffect(() => {
    if (!isDirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [isDirty]);

  const togglePermission = (roleId: number, code: string, roleCode: string) => {
    if (roleCode === 'ADMIN' && code === ADMIN_LOCKED_CODE) return;
    setDraft(prev => {
      const cur = prev[roleId] ?? [];
      const next = cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code].sort();
      return { ...prev, [roleId]: next };
    });
  };

  /** تیک/برداشتن کل یک ستون (نقش) برای مجوزهای دیدهٔ فعلی */
  const toggleColumn = (roleId: number, roleCode: string, on: boolean) => {
    const codes = filteredPermissions.map(p => p.code);
    setDraft(prev => {
      const cur = new Set(prev[roleId] ?? []);
      for (const c of codes) {
        if (roleCode === 'ADMIN' && c === ADMIN_LOCKED_CODE) continue;
        if (on) cur.add(c);
        else cur.delete(c);
      }
      return { ...prev, [roleId]: [...cur].sort() };
    });
  };

  const filteredPermissions = useMemo(
    () => permissions.filter(p => selectedCategory === 'ALL' || p.category === selectedCategory),
    [permissions, selectedCategory],
  );

  // ── تأیید تغییرات: فقط نقش‌های تغییرکرده به سرور می‌روند ──
  const handleSave = () => {
    startTransition(async () => {
      const failures: string[] = [];
      for (const roleId of dirtyRoleIds) {
        const role = roles.find(r => r.id === roleId);
        const res = await saveRolePermissionsAction({ roleId, codes: draft[roleId] ?? [] });
        if (!res.ok) failures.push(`${role?.title ?? roleId}: ${res.error}`);
      }
      if (failures.length) {
        showToast('err', `ذخیرهٔ برخی نقش‌ها ناموفق بود — ${failures.join(' | ')}`);
      } else {
        showToast('ok', `تغییر دسترسی ${faNum(dirtyRoleIds.length)} نقش با موفقیت ثبت و در دفتر ممیزی درج شد.`);
      }
      router.refresh();
    });
  };

  const handleDiscard = () => {
    setDraft(baseline);
    showToast('ok', 'تغییرات ذخیره‌نشده لغو شد و ماتریس به آخرین وضعیت ثبت‌شده برگشت.');
  };

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createRoleAction({ code: newRoleCode, title: newRoleTitle });
      if (!res.ok) return showToast('err', res.error);
      setNewRoleTitle('');
      setNewRoleCode('');
      setIsCreatingRole(false);
      showToast('ok', `نقش «${res.data.title}» ساخته شد؛ اکنون مجوزهایش را تیک بزنید و «تأیید تغییرات» را بزنید.`);
      router.refresh();
    });
  };

  const handleDeleteRole = (roleId: number, title: string) => {
    if (!confirm(`نقش «${title}» حذف شود؟ این کار برگشت‌پذیر نیست.`)) return;
    startTransition(async () => {
      const res = await deleteRoleAction({ roleId });
      if (!res.ok) return showToast('err', res.error);
      showToast('ok', `نقش «${title}» حذف شد.`);
      router.refresh();
    });
  };

  const totalGrants = useMemo(
    () => Object.values(draft).reduce((s, list) => s + list.length, 0),
    [draft],
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Toast */}
      {toast && (
        <div
          className={`p-4 rounded-2xl shadow-xl border font-bold text-sm flex items-center justify-between animate-fadeIn ${
            toast.type === 'ok'
              ? 'bg-emerald-950 text-emerald-100 border-emerald-600'
              : 'bg-rose-950 text-rose-100 border-rose-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{toast.type === 'ok' ? '✅' : '⛔'}</span>
            <span>{toast.text}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-white/60 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-800/50 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-400 text-slate-950">
              امنیت و کنترل دسترسی (Dynamic RBAC)
            </span>
            <span className="text-xs text-indigo-300">
              {faNum(roles.length)} نقش واقعی · {faNum(permissions.length)} مجوز · {faNum(totalGrants)} تخصیص
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black">
            🛡️ ماتریس پویا و مدیریت سطوح دسترسی کاربران و کارشناسان
          </h1>
          <p className="text-xs text-indigo-200 mt-1">
            داده‌ها از جدول‌های واقعی <span className="font-mono" dir="ltr">roles / permissions / role_permissions</span> خوانده می‌شود؛
            هر تغییر پس از تأیید در زنجیرهٔ ممیزی ثبت می‌گردد.
          </p>
        </div>

        <button
          onClick={() => setIsCreatingRole(!isCreatingRole)}
          className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg transition flex items-center gap-1.5"
        >
          <span>+ تعریف نقش سازمانی جدید</span>
        </button>
      </div>

      {/* ── نوار تأیید تغییرات (چسبان) ── */}
      <div
        className={`sticky top-2 z-20 rounded-2xl border-2 shadow-lg px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition ${
          isDirty ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200'
        }`}
      >
        <div className="text-xs font-bold">
          {isDirty ? (
            <span className="text-amber-900">
              ✏️ {faNum(dirtyRoleIds.length)} نقش تغییر ذخیره‌نشده دارد:{' '}
              <span className="font-black">
                {dirtyRoleIds.map(id => roles.find(r => r.id === id)?.title).filter(Boolean).join('، ')}
              </span>
            </span>
          ) : (
            <span className="text-slate-500">✅ ماتریس با آخرین وضعیت ثبت‌شده در دیتابیس یکسان است.</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDiscard}
            disabled={!isDirty || pending}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs disabled:opacity-40"
          >
            انصراف از تغییرات
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || pending}
            className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs shadow disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? '⏳ در حال ثبت…' : '✅ تأیید و ذخیرهٔ تغییر دسترسی‌ها'}
          </button>
        </div>
      </div>

      {/* Segregation of Duties Info Box */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center gap-2 text-indigo-900 font-black">
            <span>🎓</span>
            <span>تفکیک وظایف (Segregation of Duties):</span>
          </div>
          <p className="text-slate-600 leading-5">
            نقش‌های آموزشی و مالی نباید هم‌پوشانی داشته باشند؛ ستون‌های ماتریس را طوری تنظیم کنید که هیچ نقشی هم‌زمان
            «ثبت نمره» و «تسویهٔ مالی» نگیرد.
          </p>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center gap-2 text-emerald-900 font-black">
            <span>🧾</span>
            <span>ردپای ممیزی:</span>
          </div>
          <p className="text-slate-600 leading-5">
            هر بار «تأیید تغییر دسترسی» یک رکورد زنجیره‌ای در <span className="font-mono" dir="ltr">audit_logs</span> می‌سازد
            که وضعیت قبل و بعد را نگه می‌دارد.
          </p>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center gap-2 text-amber-900 font-black">
            <span>🔒</span>
            <span>گارد قفل‌شدن سامانه:</span>
          </div>
          <p className="text-slate-600 leading-5">
            مجوز «مدیریت نقش و دسترسی» روی نقش مدیر ارشد قفل است تا هیچ‌وقت دسترسی به همین صفحه از دست نرود.
          </p>
        </div>
      </div>

      {/* New Role Drawer */}
      {isCreatingRole && (
        <form
          onSubmit={handleCreateRole}
          className="p-5 bg-white rounded-3xl border-2 border-indigo-500/60 shadow-lg space-y-4 animate-scaleUp"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-black text-slate-900 text-sm">تعریف نقش سازمانی سفارشی جدید (Custom Role)</h3>
            <button type="button" onClick={() => setIsCreatingRole(false)} className="text-slate-400 hover:text-slate-700 text-xs">
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">عنوان فارسی نقش سازمانی *</label>
              <input
                type="text"
                required
                placeholder="مثال: کارشناس امور فرهنگی و دانشجویی"
                value={newRoleTitle}
                onChange={e => setNewRoleTitle(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">کد سیستمی نقش (لاتین بزرگ) *</label>
              <input
                type="text"
                required
                placeholder="CULTURAL_OFFICER"
                value={newRoleCode}
                onChange={e => setNewRoleCode(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500"
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => setIsCreatingRole(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">
              انصراف
            </button>
            <button type="submit" disabled={pending} className="px-6 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-black text-xs shadow-xs disabled:opacity-40">
              + ثبت نقش در دیتابیس
            </button>
          </div>
        </form>
      )}

      {/* Permission Matrix */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
        {/* Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-500 shrink-0">فیلتر بخش‌ها:</span>
          {['ALL', ...categories].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === cat ? 'bg-indigo-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'ALL' ? 'همه بخش‌ها' : cat}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-3 w-64">عنوان مجوز و شرح دسترسی</th>
                <th className="p-3">دسته‌بندی</th>
                {roles.map(r => {
                  const list = draft[r.id] ?? [];
                  const changed = dirtyRoleIds.includes(r.id);
                  const allOn = filteredPermissions.length > 0 && filteredPermissions.every(p => list.includes(p.code));
                  return (
                    <th key={r.id} className={`p-3 text-center min-w-[120px] ${changed ? 'bg-amber-600/70' : ''}`}>
                      <div className="font-black">{r.title}</div>
                      <div className="text-[10px] text-indigo-300 font-mono" dir="ltr">
                        {r.code}
                      </div>
                      <div className="text-[10px] text-indigo-200 mt-0.5">
                        👤 {faNum(r.userCount)} کاربر
                        {r.isSystem ? <span className="mr-1 text-amber-300">· سیستمی</span> : null}
                      </div>
                      <button
                        onClick={() => toggleColumn(r.id, r.code, !allOn)}
                        className="mt-1 text-[10px] underline text-indigo-200 hover:text-white"
                      >
                        {allOn ? 'برداشتن همه' : 'انتخاب همه'}
                      </button>
                      {!r.isSystem && r.userCount === 0 && (
                        <button
                          onClick={() => handleDeleteRole(r.id, r.title)}
                          className="block w-full mt-1 text-[10px] text-rose-300 hover:text-rose-100"
                        >
                          حذف نقش
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredPermissions.map((perm, idx) => (
                <tr
                  key={perm.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                >
                  <td className="p-3">
                    <div className="font-black text-slate-900">{perm.title}</div>
                    <div className="text-slate-500 leading-4">{perm.description}</div>
                    <div className="font-mono text-[10px] text-slate-400" dir="ltr">
                      {perm.code}
                    </div>
                  </td>

                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{perm.category}</span>
                  </td>

                  {roles.map(role => {
                    const list = draft[role.id] ?? [];
                    const isAllowed = list.includes(perm.code);
                    const wasAllowed = (baseline[role.id] ?? []).includes(perm.code);
                    const changed = isAllowed !== wasAllowed;
                    const locked = role.code === 'ADMIN' && perm.code === ADMIN_LOCKED_CODE;

                    return (
                      <td key={role.id} className={`p-3 text-center ${changed ? 'bg-amber-100' : ''}`}>
                        <label className="inline-flex items-center justify-center cursor-pointer" title={locked ? 'این مجوز روی مدیر ارشد قفل است' : ''}>
                          <input
                            type="checkbox"
                            checked={isAllowed}
                            disabled={locked || pending}
                            onChange={() => togglePermission(role.id, perm.code, role.code)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-70"
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filteredPermissions.length === 0 && (
                <tr>
                  <td colSpan={2 + roles.length} className="p-8 text-center text-slate-500 font-bold">
                    برای این دسته مجوزی تعریف نشده است.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <span>خانه‌های زردرنگ = تغییر ذخیره‌نشده. تا زدن دکمهٔ «تأیید»، هیچ چیزی در دیتابیس نوشته نمی‌شود.</span>
          <span className="font-bold text-indigo-900">
            نمایش {faNum(filteredPermissions.length)} از {faNum(permissions.length)} مجوز
          </span>
        </div>
      </div>
    </div>
  );
}
