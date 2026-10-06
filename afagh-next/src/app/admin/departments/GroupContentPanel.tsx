'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  assignCoursesAction,
  assignMajorsAction,
  listGroupContent,
  unassignCourseAction,
  unassignMajorAction,
  type DeptRow,
  type GroupContent,
} from './actions';

const toggleIn = (prev: Set<number>, id: number) => {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/**
 * دریل‌داون محتوای هر گروه: دروس و رشته‌ها جدا از هم، با جدا کردن تکی (❌)
 * و انتقال گروهی به گروه دیگر. مثل OrphanCoursesPanel مستقیم از
 * server actionها استفاده می‌کند (بدون import ماژول server-only).
 * نکته: assign فقط ردیف بی‌گروه می‌پذیرد، پس انتقال = اول جدا کردن، بعد اتصال به مقصد.
 */
export default function GroupContentPanel({
  dept,
  depts,
  onClose,
}: {
  dept: DeptRow;
  depts: DeptRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [content, setContent] = useState<GroupContent | null>(null);
  const [selC, setSelC] = useState<Set<number>>(new Set());
  const [selM, setSelM] = useState<Set<number>>(new Set());
  const [targetId, setTargetId] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = () =>
    start(async () => {
      setContent(await listGroupContent(dept.id));
      setSelC(new Set());
      setSelM(new Set());
    });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept.id]);

  const unassignCourse = (id: number) =>
    start(async () => {
      const fd = new FormData();
      fd.set('courseId', String(id));
      const r = await unassignCourseAction(fd);
      if (r.ok) {
        setMsg({ kind: 'ok', text: 'درس از گروه جدا شد.' });
        load();
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: r.error ?? 'انجام نشد.' });
      }
    });

  const unassignMajor = (id: number) =>
    start(async () => {
      const fd = new FormData();
      fd.set('majorId', String(id));
      const r = await unassignMajorAction(fd);
      if (r.ok) {
        setMsg({ kind: 'ok', text: 'رشته از گروه جدا شد.' });
        load();
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: r.error ?? 'انجام نشد.' });
      }
    });

  const doMove = () =>
    start(async () => {
      if (!targetId) {
        setMsg({ kind: 'err', text: 'گروه مقصد را انتخاب کنید.' });
        return;
      }
      const cs = [...selC];
      const ms = [...selM];
      if (!cs.length && !ms.length) {
        setMsg({ kind: 'err', text: 'هیچ موردی انتخاب نشده است.' });
        return;
      }
      // assign فقط ردیف بی‌گروه می‌پذیرد — اول جدا می‌کنیم بعد به مقصد وصل می‌کنیم
      await Promise.all(
        cs.map(id => {
          const fd = new FormData();
          fd.set('courseId', String(id));
          return unassignCourseAction(fd);
        }),
      );
      await Promise.all(
        ms.map(id => {
          const fd = new FormData();
          fd.set('majorId', String(id));
          return unassignMajorAction(fd);
        }),
      );
      let moved = 0;
      if (cs.length) {
        const fd = new FormData();
        fd.set('deptId', targetId);
        fd.set('courseIds', cs.join(','));
        const r = await assignCoursesAction(fd);
        if (!r.ok) {
          setMsg({ kind: 'err', text: r.error ?? 'انجام نشد.' });
          load();
          router.refresh();
          return;
        }
        moved += r.moved ?? 0;
      }
      if (ms.length) {
        const fd = new FormData();
        fd.set('deptId', targetId);
        fd.set('majorIds', ms.join(','));
        const r = await assignMajorsAction(fd);
        if (!r.ok) {
          setMsg({ kind: 'err', text: r.error ?? 'انجام نشد.' });
          load();
          router.refresh();
          return;
        }
        moved += r.moved ?? 0;
      }
      setMsg({ kind: 'ok', text: `${moved.toLocaleString('fa-IR')} مورد به گروه مقصد منتقل شد.` });
      setTargetId('');
      load();
      router.refresh();
    });

  const courses = content?.courses ?? [];
  const majors = content?.majors ?? [];
  const selCount = selC.size + selM.size;
  const allC = courses.length > 0 && courses.every(c => selC.has(c.id));
  const allM = majors.length > 0 && majors.every(m => selM.has(m.id));

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">📖 دروس و رشته‌های گروه {dept.name}</h3>
        <button onClick={onClose} className="text-xs text-slate-500 hover:underline">
          بستن
        </button>
      </div>

      {msg && (
        <div
          className={
            'mb-2 rounded-xl border p-3 text-sm ' +
            (msg.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700')
          }
        >
          {msg.text}
          <button onClick={() => setMsg(null)} className="float-left text-xs opacity-60 hover:opacity-100">
            بستن
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <select
          value={targetId}
          onChange={e => setTargetId(e.target.value)}
          className="rounded-lg border border-amber-300 bg-amber-50 p-1.5 font-bold"
        >
          <option value="">انتخاب گروه مقصد…</option>
          {depts
            .filter(d => d.id !== dept.id)
            .map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
        <button
          onClick={doMove}
          disabled={pending || selCount === 0}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-50"
        >
          انتقال انتخاب‌شده‌ها{selCount > 0 && ` (${selCount.toLocaleString('fa-IR')})`}
        </button>
      </div>

      <h4 className="mb-1 text-xs font-bold text-slate-700">
        📖 دروس ({courses.length.toLocaleString('fa-IR')})
      </h4>
      <div className="mb-3 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-center text-slate-500">
              <th className="w-10 border border-slate-200 p-2">
                <input
                  type="checkbox"
                  checked={allC}
                  onChange={() => setSelC(prev => (allC ? new Set() : new Set(courses.map(c => c.id))))}
                  className="h-4 w-4 accent-emerald-600"
                />
              </th>
              <th className="border border-slate-200 p-2">کد</th>
              <th className="border border-slate-200 p-2">عنوان درس</th>
              <th className="w-12 border border-slate-200 p-2"></th>
            </tr>
          </thead>
          <tbody>
            {content === null && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  ⏳ در حال بارگذاری…
                </td>
              </tr>
            )}
            {content !== null && courses.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  درسی ثبت نشده است.
                </td>
              </tr>
            )}
            {courses.map(c => (
              <tr key={c.id} className={selC.has(c.id) ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                <td className="border border-slate-200 p-2 text-center">
                  <input
                    type="checkbox"
                    checked={selC.has(c.id)}
                    onChange={() => setSelC(prev => toggleIn(prev, c.id))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                </td>
                <td className="border border-slate-200 p-2 text-center font-mono font-bold text-indigo-900" dir="ltr">
                  {c.code}
                </td>
                <td className="border border-slate-200 p-2 font-bold">{c.title}</td>
                <td className="border border-slate-200 p-2 text-center">
                  <button
                    disabled={pending}
                    onClick={() => unassignCourse(c.id)}
                    className="text-red-500 hover:text-red-700 disabled:opacity-50"
                    title="جدا کردن از گروه"
                  >
                    ❌
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="mb-1 text-xs font-bold text-slate-700">
        🎓 رشته‌ها ({majors.length.toLocaleString('fa-IR')})
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-center text-slate-500">
              <th className="w-10 border border-slate-200 p-2">
                <input
                  type="checkbox"
                  checked={allM}
                  onChange={() => setSelM(prev => (allM ? new Set() : new Set(majors.map(m => m.id))))}
                  className="h-4 w-4 accent-emerald-600"
                />
              </th>
              <th className="border border-slate-200 p-2">کد</th>
              <th className="border border-slate-200 p-2">نام رشته</th>
              <th className="w-12 border border-slate-200 p-2"></th>
            </tr>
          </thead>
          <tbody>
            {content === null && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  ⏳ در حال بارگذاری…
                </td>
              </tr>
            )}
            {content !== null && majors.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  رشته‌ای ثبت نشده است.
                </td>
              </tr>
            )}
            {majors.map(m => (
              <tr key={m.id} className={selM.has(m.id) ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                <td className="border border-slate-200 p-2 text-center">
                  <input
                    type="checkbox"
                    checked={selM.has(m.id)}
                    onChange={() => setSelM(prev => toggleIn(prev, m.id))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                </td>
                <td className="border border-slate-200 p-2 text-center font-mono font-bold text-indigo-900" dir="ltr">
                  {m.code ?? '—'}
                </td>
                <td className="border border-slate-200 p-2 font-bold">{m.name}</td>
                <td className="border border-slate-200 p-2 text-center">
                  <button
                    disabled={pending}
                    onClick={() => unassignMajor(m.id)}
                    className="text-red-500 hover:text-red-700 disabled:opacity-50"
                    title="جدا کردن از گروه"
                  >
                    ❌
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
