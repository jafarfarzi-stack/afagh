'use client';

import { useEffect, useRef, useState, useActionState, type ReactNode } from 'react';
import { adminSaveClassroomAction, type SaveClassroomResult } from './actions';

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

const ROOM_TYPES = ['کلاس درس', 'آزمایشگاه', 'سالن', 'ورزشی', 'کارگاه', 'اداری'];

const INITIAL: SaveClassroomResult = { ok: false };

/**
 * قالبِ ستون‌ها — یک منبعِ واحد برای سرسطر و ردیف‌ها.
 *
 * چرا ثابتِ مشترک؟ قبلاً سرسطر ۷ عنوان داشت ولی هر ردیف یک `<td colSpan={7}>`
 * با فرمِ flex-wrap بود؛ یعنی عنوان‌ها هیچ‌وقت روی کادرها نمی‌افتادند و معلوم
 * نبود هر کادر مال کدام عنوان است. حالا سرسطر و هر ردیف همان template را
 * می‌گیرند، پس ستون‌ها دقیقاً زیر هم می‌نشینند.
 *
 * ترتیب RTL: اولین فرزند = راست‌ترین ستون ⇒ «کد» اولین ستون است.
 */
const COLS =
  'grid-cols-2 sm:grid-cols-3 ' +
  'md:grid-cols-[4.5rem_minmax(7rem,1.2fr)_4.5rem_6.5rem_minmax(6.5rem,1fr)_3.25rem_5.75rem_5.5rem_5.75rem]';

const INP =
  'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px] text-slate-800 ' +
  'outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

/** یک خانه: برچسب فقط در موبایل بالای کادر دیده می‌شود (سرسطر در موبایل مخفی است). */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-0.5 block text-[10px] font-bold text-slate-400 md:hidden">{label}</span>
      {children}
    </div>
  );
}

const HEADERS: Array<[string, string]> = [
  ['کد', 'کد کلاس در سما (LT4.Code) — همان کدی که برنامهٔ هفتگی و سالن امتحان با آن کار می‌کند'],
  ['نام کلاس', 'نامی که در انتخاب‌گر کلاس و برنامهٔ هفتگی دیده می‌شود'],
  ['ظرفیت', 'ظرفیت اسمی اتاق (نفر)'],
  ['نوع', 'کلاس درس / آزمایشگاه / سالن / ورزشی / کارگاه'],
  ['دانشکده', 'دانشکدهٔ مالکِ اتاق — در سوییچ دانشگاه هم‌تراز می‌ماند'],
  ['طبقه', 'شمارهٔ طبقه'],
  ['نیمکت (ردیف × ستون)', 'چیدمان نیمکت‌ها برای نقشهٔ حضور و غیاب — ابتدا تعداد ردیف، بعد تعداد ستون'],
  ['وضعیت', 'کلاس غیرفعال در انتخاب‌گر سردر کلاس نمایش داده نمی‌شود'],
  ['عملیات', 'ذخیره یا حذف همین ردیف'],
];

/** فرم افزودن کلاس جدید — «کد» اولین فیلد است تا با ستون اول جدول هم‌نام باشد. */
function AddForm({ faculties }: { faculties: FacultyOption[] }) {
  const [state, action, pending] = useActionState(adminSaveClassroomAction, INITIAL);
  const LBL = 'flex min-w-0 flex-col gap-1 text-[11px] font-bold text-slate-500';
  return (
    <form
      action={action}
      className="grid grid-cols-2 items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-4 lg:grid-cols-5"
    >
      <label className={LBL}>کد کلاس
        <input name="code" className={`${INP} text-center font-mono`} dir="ltr" placeholder="مثلاً 201" />
      </label>
      <label className={`${LBL} col-span-2 sm:col-span-1`}>نام
        <input name="name" required className={INP} placeholder="مثلاً کلاس ۳۰۵" />
      </label>
      <label className={LBL}>ظرفیت
        <input name="cap" type="number" min={1} required className={INP} dir="ltr" placeholder="۴۰" />
      </label>
      <label className={LBL}>نوع
        <select name="roomType" className={INP}>
          <option value="">—</option>
          {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className={`${LBL} col-span-2`}>دانشکده
        <select name="facultyId" className={INP}>
          <option value="">— بدون دانشکده —</option>
          {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label className={LBL}>طبقه
        <input name="floor" className={INP} dir="ltr" placeholder="۲" />
      </label>
      <label className={LBL}>ردیف
        <input name="rows" type="number" min={0} className={INP} dir="ltr" placeholder="۵" />
      </label>
      <label className={LBL}>ستون
        <input name="cols" type="number" min={0} className={INP} dir="ltr" placeholder="۸" />
      </label>
      <label className="flex items-center gap-1.5 pb-2 text-xs font-bold text-slate-600">
        <input type="checkbox" name="isActive" value="1" defaultChecked className="h-4 w-4" /> فعال
      </label>
      <button className="rounded-xl bg-indigo-700 px-5 py-2 text-sm font-black text-white disabled:opacity-60" disabled={pending}>
        {pending ? 'در حال افزودن…' : 'افزودن کلاس'}
      </button>
      {state.err && <p className="col-span-full text-[11px] font-bold text-rose-600">⛔ {state.err}</p>}
      {state.msg && <p className="col-span-full text-[11px] font-bold text-emerald-700">✓ {state.msg}</p>}
    </form>
  );
}

/** یک ردیف کامل = یک فرم؛ حذف هم با `intent=delete` از همین فرم می‌رود. */
function RowForm({ room, faculties }: { room: RoomData; faculties: FacultyOption[] }) {
  const [state, action, pending] = useActionState(adminSaveClassroomAction, INITIAL);
  const [confirmDel, setConfirmDel] = useState(false);

  // پس از ذخیرهٔ موفق، فرم را ری‌مانت می‌کنیم تا مقادیرِ تازه (پس از revalidate)
  // جای مقدار قدیمی را بگیرند؛ وگرنه React فرم را ریست می‌کرد و مقدار قبلی می‌ماند.
  const lastStateRef = useRef<SaveClassroomResult | null>(null);
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    if (state !== lastStateRef.current && state.ok) {
      lastStateRef.current = state;
      setResetKey(k => k + 1);
      setConfirmDel(false);
    }
  }, [state]);

  const isActive = room.isActive ?? 1;
  const noCode = !room.code;

  return (
    <form
      key={resetKey}
      action={action}
      className={`grid ${COLS} items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5 md:items-center md:gap-1.5 md:rounded-none md:border-0 md:border-t md:border-slate-100 md:p-1.5`}
    >
      <input type="hidden" name="id" value={room.id} />

      <Cell label="کد">
        <input
          name="code"
          defaultValue={room.code ?? ''}
          placeholder="بدون کد"
          title={noCode ? 'این اتاق در سما کد ندارد' : `کد سما: ${room.code}`}
          dir="ltr"
          className={`${INP} text-center font-mono ${noCode ? 'border-amber-300 bg-amber-50 placeholder:text-[10px] placeholder:font-sans placeholder:text-amber-600' : ''}`}
        />
      </Cell>

      <Cell label="نام کلاس">
        <input name="name" defaultValue={room.name} className={`${INP} font-bold`} />
      </Cell>

      <Cell label="ظرفیت">
        <input name="cap" type="number" min={1} defaultValue={room.capacity} dir="ltr" className={`${INP} text-center`} />
      </Cell>

      <Cell label="نوع">
        <input name="roomType" list="room-type-list" defaultValue={room.roomType ?? ''} placeholder="—" className={INP} />
      </Cell>

      <Cell label="دانشکده">
        <select name="facultyId" defaultValue={String(room.facultyId ?? '')} className={INP}>
          <option value="">— بدون دانشکده —</option>
          {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </Cell>

      <Cell label="طبقه">
        <input name="floor" defaultValue={room.floor ?? ''} dir="ltr" placeholder="—" className={`${INP} text-center`} />
      </Cell>

      <Cell label="نیمکت (ردیف × ستون)">
        <div className="flex items-center gap-1" dir="ltr">
          <input name="rows" type="number" min={0} defaultValue={room.rowsCount ?? ''} placeholder="—" title="تعداد ردیف" className={`${INP} px-1 text-center`} />
          <span className="shrink-0 text-slate-400">×</span>
          <input name="cols" type="number" min={0} defaultValue={room.colsCount ?? ''} placeholder="—" title="تعداد ستون" className={`${INP} px-1 text-center`} />
        </div>
      </Cell>

      <Cell label="وضعیت">
        <select name="isActive" defaultValue={String(isActive)} className={INP}>
          <option value="1">فعال</option>
          <option value="0">غیرفعال</option>
        </select>
      </Cell>

      <Cell label="عملیات">
        <div className="flex flex-wrap items-center gap-1">
          <button
            className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
            disabled={pending}
          >
            {pending ? '…' : 'ذخیره'}
          </button>
          {confirmDel ? (
            <>
              <button
                name="intent"
                value="delete"
                className="rounded-lg bg-rose-600 px-2 py-1.5 text-[11px] font-bold text-white"
                disabled={pending}
              >
                حذف؟
              </button>
              <button type="button" onClick={() => setConfirmDel(false)} className="rounded-lg border border-slate-300 px-1.5 py-1.5 text-[11px] text-slate-600">
                ✕
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
            >
              حذف
            </button>
          )}
        </div>
      </Cell>

      {state.err && (
        <p className="col-span-full text-[11px] font-bold text-rose-600">⛔ {state.err}</p>
      )}
      {state.msg && (
        <p className="col-span-full text-[11px] font-bold text-emerald-700">✓ {state.msg}</p>
      )}
    </form>
  );
}

export default function ClassroomManager({ rooms, faculties }: { rooms: RoomData[]; faculties: FacultyOption[] }) {
  const withCode = rooms.filter(r => r.code).length;
  const missing = rooms.length - withCode;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-slate-800">کلاس‌ها (اتاق‌های درس قابل برنامه‌ریزی)</h3>
        <p className="text-[11px] text-slate-500">
          <span className="font-bold text-slate-700">{rooms.length.toLocaleString('fa-IR')}</span> اتاق ·{' '}
          <span className="font-bold text-emerald-700">{withCode.toLocaleString('fa-IR')}</span> دارای کد
          {missing > 0 && (
            <>
              {' '}· <span className="font-bold text-amber-600">{missing.toLocaleString('fa-IR')}</span> بدون کد
            </>
          )}
        </p>
      </div>

      <datalist id="room-type-list">
        {ROOM_TYPES.map(t => <option key={t} value={t} />)}
      </datalist>

      <AddForm faculties={faculties} />

      <p className="text-[11px] text-slate-400">
        «کد کلاس» همان <span className="font-mono">LT4.Code</span> در سامانهٔ سماست؛ برنامهٔ هفتگی و سالن امتحان
        اتاق‌ها را با همین کد می‌شناسند. ردیف/ستون فقط برای چیدمانِ نقشهٔ حضور و غیاب است.
      </p>

      <div className="overflow-x-auto">
        <div className="md:min-w-[54rem]">
          {/* سرسطر — فقط از دسکتاپ؛ در موبایل هر کادر برچسب خودش را بالای سر دارد. */}
          <div className={`hidden md:grid ${COLS} items-center gap-1.5 px-1.5 pb-1.5`}>
            {HEADERS.map(([label, hint]) => (
              <div
                key={label}
                title={hint}
                className="cursor-help truncate border-b-2 border-slate-200 pb-1 text-[11px] font-black text-slate-600"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="space-y-2 md:space-y-0">
            {rooms.map(r => <RowForm key={r.id} room={r} faculties={faculties} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
