'use client';

import { useEffect, useRef, useState, useActionState } from 'react';
import { adminSaveClassroomAction, adminDeleteClassroomAction, type SaveClassroomResult } from './actions';

interface FacultyOption {
  id: number;
  name: string;
}

interface RoomData {
  id: number;
  name: string;
  code: string | null;
  capacity: number;
  roomType: string | null;
  facultyId: number | null;
  floor: string | null;
  rowsCount: number | null;
  colsCount: number | null;
  isActive: number | null;
}

const ROOM_TYPES = ['', 'کلاس درس', 'آزمایشگاه', 'سالن', 'ورزشی'];

const INITIAL: SaveClassroomResult = { ok: false };

/** فرم افزودن کلاس جدید — همراه با فیلدِ «کد» (اختیاری). */
function AddForm({ faculties }: { faculties: FacultyOption[] }) {
  const [state, action, pending] = useActionState(adminSaveClassroomAction, INITIAL);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 text-xs">
      <label className="text-slate-500">نام<input name="name" required className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="مثلاً اتاق ۳۰۵" /></label>
      <label className="text-slate-500">کد<input name="code" className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-24" dir="ltr" placeholder="اختیاری" /></label>
      <label className="text-slate-500">ظرفیت<input name="cap" type="number" min={1} required className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-20" dir="ltr" /></label>
      <label className="text-slate-500">نوع
        <select name="roomType" className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm">
          {ROOM_TYPES.map(t => <option key={t} value={t}>{t || '—'}</option>)}
        </select>
      </label>
      <label className="text-slate-500">دانشکده
        <select name="facultyId" className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm max-w-48">
          <option value="">— بدون دانشکده —</option>
          {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label className="text-slate-500">طبقه<input name="floor" className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-16" dir="ltr" placeholder="مثلاً ۲" /></label>
      <label className="text-slate-500">ردیف‌ها<input name="rows" type="number" min={0} className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-16" dir="ltr" /></label>
      <label className="text-slate-500">ستون‌ها<input name="cols" type="number" min={0} className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-16" dir="ltr" /></label>
      <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" name="isActive" value="1" defaultChecked className="w-4 h-4" /> فعال</label>
      <button className="rounded-xl bg-indigo-700 px-5 py-2 text-white font-black text-sm" disabled={pending}>{pending ? 'در حال افزودن…' : 'افزودن کلاس'}</button>
      {state.err && <p className="text-[11px] text-rose-600 font-bold">⛔ {state.err}</p>}
      {state.msg && <p className="text-[11px] text-emerald-700 font-bold">✓ {state.msg}</p>}
    </form>
  );
}

/** فرم ویرایش یک کلاس (همراه با حذف) — هر ردیف state مستقل دارد. */
function RowForm({ room, faculties }: { room: RoomData; faculties: FacultyOption[] }) {
  const [state, action, pending] = useActionState(adminSaveClassroomAction, INITIAL);
  const [delState, delAction, delPending] = useActionState(adminDeleteClassroomAction, INITIAL);

  // پس از ذخیرهٔ موفق، کلید فرم را می‌زنیم تا با مقادیرِ تازه (پس از revalidate)
  // ری‌ماونت شود — در غیر این صورت React فرم را ریست می‌کرد و مقدار قدیمی می‌ماند.
  const lastStateRef = useRef<SaveClassroomResult | null>(null);
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    if (state !== lastStateRef.current && state.ok) {
      lastStateRef.current = state;
      setResetKey(k => k + 1);
    }
  }, [state]);

  const isActive = room.isActive ?? 1;
  return (
    <div className="space-y-1">
      <form key={resetKey} action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={room.id} />
        <input name="name" defaultValue={room.name} className="border border-slate-300 rounded-lg px-2 py-1 w-32 text-sm" />
        <input name="code" defaultValue={room.code ?? ''} className="border border-slate-300 rounded-lg px-2 py-1 w-24 text-sm" dir="ltr" placeholder="کد" />
        <input name="cap" type="number" min={1} defaultValue={room.capacity} className="border border-slate-300 rounded-lg px-2 py-1 w-16 text-sm" dir="ltr" />
        <input name="roomType" defaultValue={room.roomType ?? ''} className="border border-slate-300 rounded-lg px-2 py-1 w-24 text-sm" />
        <select name="facultyId" defaultValue={String(room.facultyId ?? '')} className="border border-slate-300 rounded-lg px-2 py-1 w-40 text-sm">
          <option value="">— بدون دانشکده —</option>
          {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <input name="floor" defaultValue={room.floor ?? ''} className="border border-slate-300 rounded-lg px-2 py-1 w-14 text-sm" dir="ltr" />
        <input name="rows" type="number" defaultValue={room.rowsCount ?? ''} className="border border-slate-300 rounded-lg px-2 py-1 w-14 text-sm" dir="ltr" />
        <input name="cols" type="number" defaultValue={room.colsCount ?? ''} className="border border-slate-300 rounded-lg px-2 py-1 w-14 text-sm" dir="ltr" />
        <select name="isActive" defaultValue={String(isActive)} className="border border-slate-300 rounded-lg px-2 py-1 w-20 text-sm">
          <option value="1">فعال</option>
          <option value="0">غیرفعال</option>
        </select>
        <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50" disabled={pending}>{pending ? '…' : 'ذخیره'}</button>
        {state.err && <span className="text-[11px] text-rose-600 font-bold">⛔ {state.err}</span>}
        {state.msg && <span className="text-[11px] text-emerald-700 font-bold">✓ {state.msg}</span>}
      </form>
      <form action={delAction} className="flex items-center gap-2">
        <input type="hidden" name="id" value={room.id} />
        <button className="text-red-600 hover:underline text-xs" disabled={delPending}>{delPending ? 'در حال حذف…' : 'حذف'}</button>
        {delState.err && <span className="text-[11px] text-rose-600 font-bold">⛔ {delState.err}</span>}
        {delState.msg && <span className="text-[11px] text-emerald-700 font-bold">✓ {delState.msg}</span>}
      </form>
    </div>
  );
}

export default function ClassroomManager({ rooms, faculties }: { rooms: RoomData[]; faculties: FacultyOption[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      <h3 className="font-bold text-slate-800">کلاس‌ها (اتاق‌های درس قابل برنامه‌ریزی)</h3>
      <AddForm faculties={faculties} />
      <p className="text-[11px] text-slate-400">ردیف/ستون برای نقشهٔ حضور و غیاب. کلاس غیرفعال در انتخاب‌گر سردر کلاس نمایش داده نمی‌شود.</p>

      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs rt">
          <thead>
            <tr className="text-slate-500">
              <th className="p-2">نام</th><th className="p-2">کد</th><th className="p-2">ظرفیت</th><th className="p-2">نوع</th>
              <th className="p-2">دانشکده</th><th className="p-2">طبقه</th><th className="p-2">نیمکت (ر×س)</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map(r => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="p-2" colSpan={7}>
                  <RowForm room={r} faculties={faculties} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
