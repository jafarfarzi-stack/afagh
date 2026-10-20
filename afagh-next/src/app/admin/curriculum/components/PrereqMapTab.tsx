'use client';

import { useEffect, useRef, useState } from 'react';
import { useCurriculum } from '../curriculum-context';
import { leafCourseCodesOf } from '../curriculum-core';

/**
 * نقشهٔ بصری پیش‌نیازها: ستون‌ها = ترم‌ها، کارت‌ها = دروس،
 * پیکان‌ها = وابستگی پیش‌نیاز. پیش‌نیاز «عقب» (ترم ≥ ترم درس) قرمز؛
 * پیش‌نیازی که در این نسخه نیست با برچسب «بیرون از نسخه» مشخص می‌شود.
 */
export default function PrereqMapTab() {
  const { activeTab, detail } = useCurriculum();
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [positions, setPositions] = useState<Map<number, { x: number; y: number }>>(new Map());

  const courses = detail?.courses ?? [];
  const rules = detail?.rules ?? [];

  // ستون‌های ترم
  const semesters = [...new Set(courses.map(c => c.recommendedSemester).filter((s): s is number => s != null))]
    .sort((a, b) => a - b);
  const hasUnassigned = courses.some(c => c.recommendedSemester == null);

  const byCode = new Map(courses.map(c => [c.code, c]));
  const rulesByCourse = new Map(rules.filter(r => r.ruleType === 'PREREQ').map(r => [r.courseId, r]));

  const prereqCodesOf = (courseId: number): string[] => {
    const r = rulesByCourse.get(courseId);
    return r ? leafCourseCodesOf(r.logicTree) : [];
  };

  const outsidePrereqs = (courseId: number): string[] =>
    prereqCodesOf(courseId).filter(code => !byCode.has(code));

  // اندازه‌گیری موقعیت کارت‌ها برای رسم پیکان
  useEffect(() => {
    if (activeTab !== 'PREREQMAP') return;
    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const next = new Map<number, { x: number; y: number }>();
      boxRefs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        next.set(id, {
          x: r.left - cRect.left + r.width / 2,
          y: r.top - cRect.top + r.height / 2,
        });
      });
      setPositions(next);
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeTab, detail]);

  if (activeTab !== 'PREREQMAP') return null;
  if (!detail) return <div className="text-xs text-slate-500 p-4">ابتدا یک نسخه را انتخاب کنید.</div>;

  // ساخت پیکان‌ها
  const arrows: { from: { x: number; y: number }; to: { x: number; y: number }; backward: boolean; key: string }[] = [];
  for (const c of courses) {
    for (const code of prereqCodesOf(c.courseId)) {
      const prereq = byCode.get(code);
      if (!prereq) continue;
      const from = positions.get(prereq.courseId);
      const to = positions.get(c.courseId);
      if (!from || !to) continue;
      const backward =
        prereq.recommendedSemester != null &&
        c.recommendedSemester != null &&
        prereq.recommendedSemester >= c.recommendedSemester;
      arrows.push({ from, to, backward, key: `${prereq.courseId}->${c.courseId}` });
    }
  }

  const columns: { key: string; label: string; courses: typeof courses; overflow?: boolean }[] = [
    ...semesters.map(s => ({
      key: `sem-${s}`,
      label: `ترم ${String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}`,
      courses: courses.filter(c => c.recommendedSemester === s),
      overflow: false,
    })),
  ];
  if (hasUnassigned) {
    columns.push({
      key: 'unassigned',
      label: 'بدون ترم',
      courses: courses.filter(c => c.recommendedSemester == null),
      overflow: false,
    });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="font-extrabold text-slate-900 text-sm">🗺️ نقشهٔ پیش‌نیازها ({courses.length} درس)</h4>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="inline-flex items-center gap-1"><span className="w-6 h-0.5 bg-indigo-600 inline-block" /> پیش‌نیاز پیش‌رو (ترم قبل)</span>
          <span className="inline-flex items-center gap-1"><span className="w-6 h-0.5 bg-red-600 inline-block" /> پیش‌نیاز عقب (هم‌ترم یا بعد)</span>
          <span className="inline-flex items-center gap-1 text-rose-600 font-bold">⚠ بیرون از نسخه</span>
        </div>
      </div>

      <div ref={containerRef} className="relative overflow-x-auto">
        <div className="flex gap-3 min-w-max pb-2">
          {columns.map(col => (
            <div key={col.key} className="flex flex-col gap-2 min-w-[170px] max-w-[220px]">
              <div className="text-center text-xs font-black text-slate-700 bg-slate-100 rounded-lg py-1.5 border border-slate-200">
                {col.label}
                <span className="block text-[9px] text-slate-500 font-normal">{col.courses.length} درس</span>
              </div>
              <div className="space-y-2">
                {col.courses.map(c => {
                  const outs = outsidePrereqs(c.courseId);
                  return (
                    <div
                      key={c.courseId}
                      ref={el => {
                        if (el) boxRefs.current.set(c.courseId, el);
                        else boxRefs.current.delete(c.courseId);
                      }}
                      className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold text-indigo-900 text-[11px]" dir="ltr">{c.code}</span>
                        <span className="text-[9px] bg-white border border-slate-200 rounded px-1 text-slate-600">{c.units}u</span>
                      </div>
                      <div className="text-[10px] text-slate-700 leading-tight mt-0.5 line-clamp-2">{c.title}</div>
                      {outs.length > 0 && (
                        <div className="mt-1 text-[9px] font-bold text-rose-600">
                          ⚠ پیش‌نیاز بیرون از نسخه: {outs.join('، ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <svg
          className="absolute top-0 left-0 pointer-events-none"
          width="100%"
          height="100%"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <marker id="prereq-arrow-forward" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#4f46e5" />
            </marker>
            <marker id="prereq-arrow-backward" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#dc2626" />
            </marker>
          </defs>
          {arrows.map(a => (
            <line
              key={a.key}
              x1={a.from.x}
              y1={a.from.y}
              x2={a.to.x}
              y2={a.to.y}
              stroke={a.backward ? '#dc2626' : '#4f46e5'}
              strokeWidth={1.6}
              strokeOpacity={0.85}
              markerEnd={a.backward ? 'url(#prereq-arrow-backward)' : 'url(#prereq-arrow-forward)'}
            />
          ))}
        </svg>
      </div>

      {courses.length === 0 && (
        <p className="text-xs text-slate-500">این نسخه هنوز درسی ندارد.</p>
      )}
    </div>
  );
}
