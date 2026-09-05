'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DeptRow, StaffPick } from './actions';

type Res = { ok: boolean; error?: string; moved?: number };
type Act = (fd: FormData) => Promise<Res>;

const KINDS = {
  ACADEMIC: { label: 'گروه آموزشی (رشته‌دار)', chip: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  GENERAL: { label: 'دروس عمومی و مشترک', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
} as const;

export default function DepartmentsClient({
  depts,
  staffPicks,
  faculties,
  orphanCourses,
  createAction,
  updateAction,
  setHeadAction,
  setStaffDeptAction,
  assignOrphansAction,
}: {
  depts: DeptRow[];
  staffPicks: StaffPick[];
  faculties: { id: number; name: string }[];
  orphanCourses: number;
  createAction: Act;
  updateAction: Act;
  setHeadAction: Act;
  setStaffDeptAction: Act;
  assignOrphansAction: Act;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [editing, setEditing] = useState<DeptRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [memberOf, setMemberOf] = useState<DeptRow | null>(null);

  /** چند گروه را یک نفر اداره می‌کند — برای نشان‌دادن «مدیر ۲ گروه» */
  const headCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of depts) if (d.headStaffId) m.set(d.headStaffId, (m.get(d.headStaffId) ?? 0) + 1);
    return m;
  }, [depts]);

  const run = (action: Act, fd: FormData, okText: string, after?: () => void) =>
    start(async () => {
      const r = await action(fd);
      if (r.ok) {
        setMsg({ kind: 'ok', text: r.moved != null ? `${okText} (${r.moved.toLocaleString('fa-IR')} درس)` : okText });
        after?.();
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: r.error ?? 'انجام نشد.' });
      }
    });

  const filtered = useMemo(() => {
    const t = q.trim();
    if (!t) return depts;
    return depts.filter(d => d.name.includes(t) || d.facultyName.includes(t) || (d.headName ?? '').includes(t) || (d.code ?? '').includes(t));
  }, [depts, q]);

  const noHead = depts.filter(d => !d.headStaffId && d.isActive).length;

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={
            'rounded-xl border p-3 text-sm ' +
            (msg.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')
          }
        >
          {msg.text}
          <button onClick={() => setMsg(null)} className="float-left text-xs opacity-60 hover:opacity-100">بستن</button>
        </div>
      )}

      {(noHead > 0 || orphanCourses > 0) && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs leading-6 text-amber-900">
          {noHead > 0 && <p>⚠️ {noHead.toLocaleString('fa-IR')} گروه فعال هنوز مدیر ندارد؛ دروس آن‌ها در پنل مدیر گروه دیده نمی‌شود.</p>}
          {orphanCourses > 0 && (
            <form
              onSubmit={e => {
                e.preventDefault();
                run(assignOrphansAction, new FormData(e.currentTarget), 'دروس بی‌گروه منتقل شدند.');
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <span>⚠️ {orphanCourses.toLocaleString('fa-IR')} درس به هیچ گروهی وصل نیست. انتقال همه به گروه:</span>
              <select name="deptId" className="rounded-lg border border-amber-300 bg-white p-1.5 text-xs" defaultValue="">
                <option value="" disabled>انتخاب گروه…</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button disabled={pending} className="rounded-lg bg-amber-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">انتقال</button>
            </form>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="جستجوی گروه، دانشکده یا نام مدیر…"
          className="w-64 rounded-xl border border-slate-300 p-2 text-sm"
        />
        <button
          onClick={() => { setCreating(true); setEditing(null); }}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
        >
          + تعریف گروه آموزشی
        </button>
      </div>

      {(creating || editing) && (
        <DeptForm
          key={editing?.id ?? 'new'}
          dept={editing}
          faculties={faculties}
          staffPicks={staffPicks}
          pending={pending}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSubmit={fd =>
            run(editing ? updateAction : createAction, fd, editing ? 'گروه به‌روزرسانی شد.' : 'گروه ساخته شد.', () => {
              setCreating(false);
              setEditing(null);
            })
          }
        />
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-2.5">گروه</th>
              <th className="p-2.5">دانشکده</th>
              <th className="p-2.5">نوع</th>
              <th className="p-2.5">مدیر گروه</th>
              <th className="p-2.5">اعضا</th>
              <th className="p-2.5">دروس</th>
              <th className="p-2.5">رشته‌ها</th>
              <th className="p-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id} className={'border-t border-slate-100 ' + (d.isActive ? '' : 'opacity-50')}>
                <td className="p-2.5">
                  <span className="font-bold text-slate-800">{d.name}</span>
                  {d.code && <span className="mr-1 text-slate-400" dir="ltr">({d.code})</span>}
                  {!d.isActive && <span className="mr-1 rounded bg-slate-200 px-1 text-[10px]">غیرفعال</span>}
                </td>
                <td className="p-2.5 text-slate-600">{d.facultyName}</td>
                <td className="p-2.5">
                  <span className={'rounded-md border px-1.5 py-0.5 text-[10px] ' + KINDS[d.kind].chip}>{KINDS[d.kind].label}</span>
                </td>
                <td className="p-2.5">
                  <HeadPicker
                    dept={d}
                    staffPicks={staffPicks}
                    headCount={headCount}
                    pending={pending}
                    onPick={staffId => {
                      const fd = new FormData();
                      fd.set('deptId', String(d.id));
                      fd.set('staffId', staffId ? String(staffId) : '');
                      run(setHeadAction, fd, staffId ? 'مدیر گروه ثبت شد و نقشش فعال شد.' : 'مدیر گروه برداشته شد.');
                    }}
                  />
                </td>
                <td className="p-2.5 text-center tabular-nums">{d.members.toLocaleString('fa-IR')}</td>
                <td className="p-2.5 text-center tabular-nums">{d.coursesCount.toLocaleString('fa-IR')}</td>
                <td className="p-2.5 text-center tabular-nums">{d.majorsCount.toLocaleString('fa-IR')}</td>
                <td className="p-2.5 whitespace-nowrap">
                  <button onClick={() => { setEditing(d); setCreating(false); }} className="text-indigo-600 hover:underline">ویرایش</button>
                  <button onClick={() => setMemberOf(d)} className="mr-2 text-slate-500 hover:underline">اعضا</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">گروهی یافت نشد.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {memberOf && (
        <MembersPanel
          dept={memberOf}
          staffPicks={staffPicks}
          pending={pending}
          onClose={() => setMemberOf(null)}
          onMove={(staffId, deptId) => {
            const fd = new FormData();
            fd.set('staffId', String(staffId));
            fd.set('deptId', deptId ? String(deptId) : '');
            run(setStaffDeptAction, fd, 'عضویت به‌روزرسانی شد.');
          }}
        />
      )}
    </div>
  );
}

function DeptForm({
  dept,
  faculties,
  staffPicks,
  pending,
  onSubmit,
  onCancel,
}: {
  dept: DeptRow | null;
  faculties: { id: number; name: string }[];
  staffPicks: StaffPick[];
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={e => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }}
      className="grid gap-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {dept && <input type="hidden" name="id" value={dept.id} />}
      <label className="text-xs">
        <span className="mb-1 block font-bold text-slate-600">نام گروه *</span>
        <input name="name" required defaultValue={dept?.name ?? ''} className="w-full rounded-lg border border-slate-300 p-2" placeholder="مثلاً مهندسی کامپیوتر" />
      </label>
      <label className="text-xs">
        <span className="mb-1 block font-bold text-slate-600">دانشکده *</span>
        <select name="facultyId" required defaultValue={dept?.facultyId ?? ''} className="w-full rounded-lg border border-slate-300 bg-white p-2">
          <option value="" disabled>انتخاب کنید…</option>
          {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block font-bold text-slate-600">کد گروه</span>
        <input name="code" defaultValue={dept?.code ?? ''} dir="ltr" className="w-full rounded-lg border border-slate-300 p-2" placeholder="اختیاری" />
      </label>
      <label className="text-xs">
        <span className="mb-1 block font-bold text-slate-600">نوع گروه</span>
        <select name="kind" defaultValue={dept?.kind ?? 'ACADEMIC'} className="w-full rounded-lg border border-slate-300 bg-white p-2">
          <option value="ACADEMIC">گروه آموزشی (رشته‌دار)</option>
          <option value="GENERAL">دروس عمومی و مشترک</option>
        </select>
      </label>
      {!dept && (
        <label className="text-xs">
          <span className="mb-1 block font-bold text-slate-600">مدیر گروه</span>
          <select name="headStaffId" defaultValue="" className="w-full rounded-lg border border-slate-300 bg-white p-2">
            <option value="">بعداً انتخاب می‌کنم</option>
            {staffPicks.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.deptName ? ` — ${s.deptName}` : ''}</option>
            ))}
          </select>
        </label>
      )}
      {dept && (
        <label className="text-xs">
          <span className="mb-1 block font-bold text-slate-600">وضعیت</span>
          <select name="isActive" defaultValue={dept.isActive ? '1' : '0'} className="w-full rounded-lg border border-slate-300 bg-white p-2">
            <option value="1">فعال</option>
            <option value="0">غیرفعال</option>
          </select>
        </label>
      )}
      <div className="flex items-end gap-2">
        <button disabled={pending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {pending ? 'در حال ذخیره…' : dept ? 'ذخیرهٔ تغییرات' : 'ساخت گروه'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">انصراف</button>
      </div>
    </form>
  );
}

function HeadPicker({
  dept,
  staffPicks,
  headCount,
  pending,
  onPick,
}: {
  dept: DeptRow;
  staffPicks: StaffPick[];
  headCount: Map<number, number>;
  pending: boolean;
  onPick: (staffId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const t = q.trim();
    const base = t ? staffPicks.filter(s => s.name.includes(t) || (s.staffCode ?? '').includes(t)) : staffPicks;
    return base.slice(0, 40);
  }, [staffPicks, q]);

  if (!open) {
    const n = dept.headStaffId ? headCount.get(dept.headStaffId) ?? 0 : 0;
    return (
      <div className="flex items-center gap-1.5">
        {dept.headName ? (
          <>
            <span className="font-medium text-slate-700">{dept.headName}</span>
            {n > 1 && <span className="rounded bg-teal-100 px-1 text-[10px] text-teal-800">مدیر {n.toLocaleString('fa-IR')} گروه</span>}
          </>
        ) : (
          <span className="text-amber-700">— تعیین نشده —</span>
        )}
        <button onClick={() => setOpen(true)} className="text-[11px] text-indigo-600 hover:underline">{dept.headName ? 'تغییر' : 'انتخاب'}</button>
      </div>
    );
  }

  return (
    <div className="w-64 rounded-lg border border-indigo-200 bg-white p-2 shadow-sm">
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="نام یا کد استاد…" className="mb-1.5 w-full rounded border border-slate-300 p-1.5 text-xs" />
      <div className="max-h-52 overflow-y-auto">
        {list.map(s => (
          <button
            key={s.id}
            disabled={pending}
            onClick={() => { onPick(s.id); setOpen(false); }}
            className="block w-full rounded p-1.5 text-right hover:bg-indigo-50 disabled:opacity-50"
          >
            <span className="font-medium">{s.name}</span>
            <span className="mr-1 text-[10px] text-slate-400">
              {s.deptName ?? 'بدون گروه'}{s.deptId && s.deptId !== dept.id ? ' · از گروه دیگر' : ''}
            </span>
          </button>
        ))}
        {list.length === 0 && <p className="p-2 text-center text-[11px] text-slate-400">موردی نیست.</p>}
      </div>
      <div className="mt-1 flex justify-between border-t border-slate-100 pt-1.5">
        {dept.headStaffId && (
          <button disabled={pending} onClick={() => { onPick(null); setOpen(false); }} className="text-[11px] text-red-600 hover:underline">برداشتن مدیر</button>
        )}
        <button onClick={() => setOpen(false)} className="mr-auto text-[11px] text-slate-500 hover:underline">بستن</button>
      </div>
    </div>
  );
}

function MembersPanel({
  dept,
  staffPicks,
  pending,
  onClose,
  onMove,
}: {
  dept: DeptRow;
  staffPicks: StaffPick[];
  pending: boolean;
  onClose: () => void;
  onMove: (staffId: number, deptId: number | null) => void;
}) {
  const [q, setQ] = useState('');
  const members = staffPicks.filter(s => s.deptId === dept.id);
  const candidates = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    return staffPicks.filter(s => s.deptId !== dept.id && (s.name.includes(t) || (s.staffCode ?? '').includes(t))).slice(0, 20);
  }, [staffPicks, q, dept.id]);

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">اعضای گروه {dept.name}</h3>
        <button onClick={onClose} className="text-xs text-slate-500 hover:underline">بستن</button>
      </div>
      {dept.kind === 'GENERAL' && (
        <p className="mb-2 rounded-lg bg-amber-50 p-2 text-[11px] leading-5 text-amber-800">
          گروه دروس عمومی معمولاً عضو ثابت ندارد؛ مدیرش کافی است. استادانی که درس عمومی می‌دهند می‌توانند عضو گروه
          تخصصی خودشان بمانند.
        </p>
      )}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {members.map(m => (
          <span key={m.id} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
            {m.name}
            <button disabled={pending} onClick={() => onMove(m.id, null)} className="text-red-500 hover:text-red-700" title="خارج کردن از گروه">×</button>
          </span>
        ))}
        {members.length === 0 && <span className="text-xs text-slate-400">عضوی ثبت نشده است.</span>}
      </div>
      <label className="text-xs">
        <span className="mb-1 block font-bold text-slate-600">افزودن عضو</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="نام استاد را بنویسید…" className="w-full max-w-sm rounded-lg border border-slate-300 p-2" />
      </label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {candidates.map(c => (
          <button
            key={c.id}
            disabled={pending}
            onClick={() => { onMove(c.id, dept.id); setQ(''); }}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
          >
            + {c.name} <span className="text-[10px] text-slate-400">({c.deptName ?? 'بدون گروه'})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
