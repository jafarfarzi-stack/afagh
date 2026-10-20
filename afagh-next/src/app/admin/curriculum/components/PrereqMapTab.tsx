'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurriculum } from '../curriculum-context';
import { leafCourseCodesOf } from '../curriculum-core';

/**
 * نقشهٔ بصری پیش‌نیازها: ستون‌ها = ترم‌ها، کارت‌ها = دروس،
 * پیکان‌ها = وابستگی پیش‌نیاز. پیش‌نیاز «عقب» (ترم ≥ ترم درس) قرمز؛
 * پیش‌نیازی که در این نسخه نیست با برچسب «بیرون از نسخه» مشخص می‌شود.
 *
 * نکته‌های پیاده‌سازی:
 *   • موقعیت‌ها نسبت به «مبدأ محتوای اسکرول» اندازه‌گیری می‌شوند (scrollLeft/scrollTop)
 *     تا با اسکرول افقی، پیکان‌ها از کارت‌ها جدا نشوند.
 *   • هر پیکان از لبهٔ کارت مبدأ تا لبهٔ کارت مقصد رسم می‌شود (نه مرکز)، پس
 *     نوک پیکان زیر کارت مقصد پنهان نمی‌شود.
 *   • ابعاد SVG برابر ابعاد واقعی محتوا ست می‌شود تا کمان‌های ستون‌های دور هم دیده شوند.
 */

type Box = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

/** فاصلهٔ نوک پیکان از لبهٔ کارت تا روی کادر نیفتد */
const EDGE_GAP = 5;

const centerOf = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** نقطهٔ برخورد پاره‌خط «مرکز جعبه → نقطهٔ مقابل» با لبهٔ جعبه */
function edgePoint(box: Box, toward: Point): Point {
  const c = centerOf(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return c;
  const halfW = box.w / 2 + EDGE_GAP;
  const halfH = box.h / 2 + EDGE_GAP;
  const tx = Math.abs(dx) < 1e-6 ? Infinity : halfW / Math.abs(dx);
  const ty = Math.abs(dy) < 1e-6 ? Infinity : halfH / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

const fa = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export default function PrereqMapTab() {
  const { activeTab, detail } = useCurriculum();
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [boxes, setBoxes] = useState<Map<number, Box>>(new Map());
  const [canvas, setCanvas] = useState({ w: 0, h: 0 });
  const [onlyLinked, setOnlyLinked] = useState(false);

  const courses = detail?.courses ?? [];
  const rules = detail?.rules ?? [];

  // کدهای درسی که در دست‌کم یک رابطهٔ پیش‌نیاز (به‌عنوان درس یا پیش‌نیاز) هستند
  const linkedCodes = useMemo(() => {
    const byId = new Map(courses.map(c => [c.courseId, c.code]));
    const set = new Set<string>();
    for (const r of rules) {
      if (r.ruleType !== 'PREREQ') continue;
      const self = byId.get(r.courseId);
      if (self) set.add(self);
      for (const code of leafCourseCodesOf(r.logicTree)) set.add(code);
    }
    const clusterCount = new Map<number, number>();
    for (const c of courses) {
      if (c.clusterId == null) continue;
      clusterCount.set(c.clusterId, (clusterCount.get(c.clusterId) ?? 0) + 1);
    }
    for (const c of courses) {
      if (c.clusterId != null && (clusterCount.get(c.clusterId) ?? 0) > 1) set.add(c.code);
    }
    return set;
  }, [courses, rules]);

  const visibleCourses = useMemo(
    () => (onlyLinked ? courses.filter(c => linkedCodes.has(c.code)) : courses),
    [courses, onlyLinked, linkedCodes],
  );

  // اندازه‌گیری موقعیت کارت‌ها برای رسم پیکان
  useEffect(() => {
    if (activeTab !== 'PREREQMAP') return;
    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const next = new Map<number, Box>();
      boxRefs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        next.set(id, {
          // + scrollLeft/scrollTop → مختصات نسبت به مبدأ محتوا، نه لبهٔ دید
          x: r.left - cRect.left + container.scrollLeft,
          y: r.top - cRect.top + container.scrollTop,
          w: r.width,
          h: r.height,
        });
      });
      setBoxes(prev => {
        if (prev.size !== next.size) return next;
        for (const [id, b] of next) {
          const p = prev.get(id);
          if (!p || p.x !== b.x || p.y !== b.y || p.w !== b.w || p.h !== b.h) return next;
        }
        return prev;
      });
      const size = { w: container.scrollWidth, h: container.scrollHeight };
      setCanvas(prev => (prev.w === size.w && prev.h === size.h ? prev : size));
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
  }, [activeTab, detail, onlyLinked]);

  if (activeTab !== 'PREREQMAP') return null;
  if (!detail) return <div className="text-xs text-slate-500 p-4">ابتدا یک نسخه را انتخاب کنید.</div>;

  const byCode = new Map(courses.map(c => [c.code, c]));
  const rulesByCourse = new Map<number, (typeof rules)[number]>();
  for (const r of rules) if (r.ruleType === 'PREREQ') rulesByCourse.set(r.courseId, r);

  const prereqCodesOf = (courseId: number): string[] => {
    const r = rulesByCourse.get(courseId);
    return r ? [...new Set(leafCourseCodesOf(r.logicTree))] : [];
  };

  const visibleCodes = new Set(visibleCourses.map(c => c.code));

  const clusterMembers = new Map<number, typeof courses>();
  for (const c of courses) {
    if (c.clusterId == null) continue;
    const list = clusterMembers.get(c.clusterId) ?? [];
    list.push(c);
    clusterMembers.set(c.clusterId, list);
  }
  const equivalentCodesOf = (c: (typeof courses)[number]): string[] =>
    c.clusterId == null
      ? []
      : (clusterMembers.get(c.clusterId) ?? []).filter(x => x.courseId !== c.courseId).map(x => x.code);
  let equivalencePairs = 0;
  for (const list of clusterMembers.values()) {
    if (list.length > 1) equivalencePairs += (list.length * (list.length - 1)) / 2;
  }

  const columns: { key: string; label: string; courses: typeof courses }[] = [];
  const semesters = [...new Set(visibleCourses.map(c => c.recommendedSemester).filter((s): s is number => s != null))]
    .sort((a, b) => a - b);
  for (const s of semesters) {
    columns.push({
      key: `sem-${s}`,
      label: `ترم ${fa(s)}`,
      courses: visibleCourses.filter(c => c.recommendedSemester === s),
    });
  }
  if (visibleCourses.some(c => c.recommendedSemester == null)) {
    columns.push({
      key: 'unassigned',
      label: 'بدون ترم',
      courses: visibleCourses.filter(c => c.recommendedSemester == null),
    });
  }

  // شمارش‌های خلاصه (کل نسخه، مستقل از فیلتر)
  let inVersionLinks = 0;
  let backwardLinks = 0;
  const outsideSet = new Set<string>();
  const seenLinks = new Set<string>();
  for (const c of courses) {
    for (const code of prereqCodesOf(c.courseId)) {
      const prereq = byCode.get(code);
      if (!prereq) { outsideSet.add(code); continue; }
      const key = `${prereq.courseId}->${c.courseId}`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      inVersionLinks += 1;
      if (
        prereq.recommendedSemester != null &&
        c.recommendedSemester != null &&
        prereq.recommendedSemester >= c.recommendedSemester
      ) backwardLinks += 1;
    }
  }

  // ساخت پیکان‌ها (فقط بین کارت‌های قابل‌نمایش)
  const arrows: { from: Point; to: Point; backward: boolean; key: string }[] = [];
  const drawn = new Set<string>();
  for (const c of visibleCourses) {
    for (const code of prereqCodesOf(c.courseId)) {
      if (!visibleCodes.has(code)) continue;
      const prereq = byCode.get(code);
      if (!prereq) continue;
      const key = `${prereq.courseId}->${c.courseId}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const fromBox = boxes.get(prereq.courseId);
      const toBox = boxes.get(c.courseId);
      if (!fromBox || !toBox) continue;
      const backward =
        prereq.recommendedSemester != null &&
        c.recommendedSemester != null &&
        prereq.recommendedSemester >= c.recommendedSemester;
      arrows.push({
        from: edgePoint(fromBox, centerOf(toBox)),
        to: edgePoint(toBox, centerOf(fromBox)),
        backward,
        key,
      });
    }
  }

  const equivLinks: { a: Point; b: Point; key: string }[] = [];
  const drawnEquiv = new Set<string>();
  for (const list of clusterMembers.values()) {
    const vis = list.filter(c => visibleCodes.has(c.code));
    for (let i = 0; i < vis.length; i += 1) {
      for (let j = i + 1; j < vis.length; j += 1) {
        const a = vis[i];
        const b = vis[j];
        const key = `eq-${Math.min(a.courseId, b.courseId)}-${Math.max(a.courseId, b.courseId)}`;
        if (drawnEquiv.has(key)) continue;
        drawnEquiv.add(key);
        const ab = boxes.get(a.courseId);
        const bb = boxes.get(b.courseId);
        if (!ab || !bb) continue;
        equivLinks.push({ a: centerOf(ab), b: centerOf(bb), key });
      }
    }
  }

  const outsideFor = (courseId: number): string[] =>
    prereqCodesOf(courseId).filter(code => !byCode.has(code));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="font-extrabold text-slate-900 text-sm">
          🗺️ نقشهٔ پیش‌نیازها ({fa(courses.length)} درس)
        </h4>
        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-bold">
            🔗 {fa(inVersionLinks)} پیوند
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-bold ${backwardLinks > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
            ⚠ {fa(backwardLinks)} عقب
          </span>
          {equivalencePairs > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-50 text-teal-700 font-bold">
              ⇄ {fa(equivalencePairs)} هم‌ارز
            </span>
          )}
          {outsideSet.size > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold">
              🚫 {fa(outsideSet.size)} بیرون از نسخه
            </span>
          )}
          <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={onlyLinked}
              onChange={e => setOnlyLinked(e.target.checked)}
            />
            فقط دروس مرتبط
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[10px] text-slate-600">
        <span className="inline-flex items-center gap-1"><span className="w-6 h-0.5 bg-indigo-600 inline-block" /> پیش‌نیاز پیش‌رو</span>
        <span className="inline-flex items-center gap-1"><span className="w-6 h-0.5 bg-red-600 inline-block" /> پیش‌نیاز عقب (هم‌ترم یا بعد)</span>
        <span className="inline-flex items-center gap-1 text-teal-700 font-bold"><span className="w-6 h-0.5 border-t-2 border-dashed border-teal-600 inline-block" /> هم‌ارز (خوشه)</span>
        <span className="inline-flex items-center gap-1 text-rose-600 font-bold">⚠ بیرون از نسخه</span>
      </div>

      <div ref={containerRef} className="relative overflow-x-auto">
        <div className="flex gap-3 min-w-max pb-2">
          {columns.map(col => (
            <div key={col.key} className="flex flex-col gap-2 min-w-[170px] max-w-[220px]">
              <div className="text-center text-xs font-black text-slate-700 bg-slate-100 rounded-lg py-1.5 border border-slate-200">
                {col.label}
                <span className="block text-[9px] text-slate-500 font-normal">{fa(col.courses.length)} درس</span>
              </div>
              <div className="space-y-2">
                {col.courses.map(c => {
                  const outs = outsideFor(c.courseId);
                  const eqCodes = equivalentCodesOf(c);
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
                        <span className="text-[9px] bg-white border border-slate-200 rounded px-1 text-slate-600">{fa(Number(c.units || 0))}u</span>
                      </div>
                      <div className="text-[10px] text-slate-700 leading-tight mt-0.5 line-clamp-2">{c.title}</div>
                      {eqCodes.length > 0 && (
                        <div className="mt-1 text-[9px] font-bold text-teal-700" dir="ltr">
                          ⇄ {eqCodes.join(' / ')}
                        </div>
                      )}
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
          width={canvas.w || '100%'}
          height={canvas.h || '100%'}
          style={{ overflow: 'visible' }}
          aria-hidden="true"
        >
          <defs>
            <marker id="prereq-arrow-forward" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#4f46e5" />
            </marker>
            <marker id="prereq-arrow-backward" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#dc2626" />
            </marker>
          </defs>
          {equivLinks.map(l => (
            <line
              key={l.key}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              stroke="#0d9488"
              strokeWidth={1.2}
              strokeOpacity={0.7}
              strokeDasharray="5 4"
            />
          ))}
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
              strokeLinecap="round"
              markerEnd={a.backward ? 'url(#prereq-arrow-backward)' : 'url(#prereq-arrow-forward)'}
            />
          ))}
        </svg>
      </div>

      {courses.length === 0 && (
        <p className="text-xs text-slate-500">این نسخه هنوز درسی ندارد.</p>
      )}
      {courses.length > 0 && visibleCourses.length === 0 && (
        <p className="text-xs text-slate-500">هیچ درسی در رابطهٔ پیش‌نیاز نیست؛ فیلتر «فقط دروس مرتبط» را بردارید.</p>
      )}
    </div>
  );
}
