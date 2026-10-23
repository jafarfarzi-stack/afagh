'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import MobileCardList, { type CardColumn } from '@/components/MobileCardList';
import {
  loadConflictsAction,
  markConflictReviewedAction,
  markOfferingsMergedAction,
  undoConflictReviewAction,
} from './actions';
import {
  CONFLICT_REASON_LABELS,
  CONFLICT_REASON_CODES,
  DAY_NAMES_FA,
  minutesToHm,
  type ConflictPair,
} from '@/lib/schedule-conflicts-core';
import type { ScheduleConflictReport } from '@/lib/schedule-conflicts';

type Term = { id: number; termCode: string; title: string };

const fa = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString('fa-IR');
const KIND_BADGE: Record<ConflictPair['kind'], { label: string; cls: string }> = {
  PROFESSOR: { label: 'استاد', cls: 'bg-violet-700/30 text-violet-200 border-violet-500/40' },
  ROOM: { label: 'سالن', cls: 'bg-amber-700/30 text-amber-200 border-amber-500/40' },
};

export default function ScheduleConflictsClient({ terms }: { terms: Term[] }) {
  const [termId, setTermId] = useState<number | null>(terms[0]?.id ?? null);
  const [report, setReport] = useState<ScheduleConflictReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<'ALL' | 'PROFESSOR' | 'ROOM'>('ALL');
  const [showReviewed, setShowReviewed] = useState(false);
  const [q, setQ] = useState('');
  const [, startTransition] = useTransition();

  const load = useCallback((tid: number) => {
    setError(null);
    setMsg(null);
    setLoading(true);
    startTransition(async () => {
      const res = await loadConflictsAction(tid);
      setLoading(false);
      if (res.ok) setReport(res.report);
      else setError(res.error);
    });
  }, []);

  useEffect(() => {
    if (termId) load(termId);
  }, [termId, load]);

  const reviewedPairs = useMemo(() => {
    if (!report) return [] as ConflictPair[];
    return report.pairs.filter((p) => report.reviewed[p.fingerprint]);
  }, [report]);

  const openPairs = useMemo(() => {
    if (!report) return [] as ConflictPair[];
    return report.pairs.filter((p) => !report.reviewed[p.fingerprint]);
  }, [report]);

  const visible = useMemo(() => {
    const src = showReviewed ? reviewedPairs : openPairs;
    const filtered = kind === 'ALL' ? src : src.filter((p) => p.kind === kind);
    const needle = q.trim();
    if (!needle) return filtered;
    return filtered.filter((p) =>
      [p.entityName, p.a.courseTitle, p.a.courseCode, p.b.courseTitle, p.b.courseCode].some((v) =>
        String(v ?? '').includes(needle),
      ),
    );
  }, [openPairs, reviewedPairs, showReviewed, kind, q]);

  const summary = report?.summary;

  const onMerge = (p: ConflictPair) => {
    if (!termId) return;
    if (!window.confirm(`دو کلاس «${p.a.courseTitle}» و «${p.b.courseTitle}» ادغام شوند؟\nدر تقویم استاد با برچسب «کلاس ادغامی» نمایش داده می‌شوند.`)) return;
    setMsg(null);
    startTransition(async () => {
      const res = await markOfferingsMergedAction(termId, [p.a.offeringId, p.b.offeringId]);
      setMsg(res.ok ? res.message ?? 'ادغام شد.' : res.error);
      if (res.ok) load(termId);
    });
  };

  const onAccept = (p: ConflictPair, reasonCode: string) => {
    if (!termId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await markConflictReviewedAction({
        termId,
        fingerprint: p.fingerprint,
        kind: p.kind,
        entityId: p.entityId,
        dayOfWeek: p.dayOfWeek,
        scheduleAId: p.a.scheduleId,
        scheduleBId: p.b.scheduleId,
        reasonCode,
      });
      setMsg(res.ok ? 'بررسی شد.' : res.error);
      if (res.ok) load(termId);
    });
  };

  const onUndo = (fp: string) => {
    if (!termId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await undoConflictReviewAction(termId, fp);
      setMsg(res.ok ? res.message ?? 'بازگشت.' : res.error);
      if (res.ok) load(termId);
    });
  };

  const renderActions = (p: ConflictPair) => (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onMerge(p)}
        className="rounded bg-violet-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-violet-500"
      >
        ادغام
      </button>
      <button
        onClick={() => onAccept(p, 'MERGED_OK')}
        className="rounded border px-2 py-1 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800"
        title={CONFLICT_REASON_LABELS.MERGED_OK}
      >
        پذیرش
      </button>
      <Link
        href="/admin/offering-editor"
        className="rounded border border-slate-400 px-2 py-1 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        اصلاح
      </Link>
    </div>
  );

  const columns: CardColumn<ConflictPair>[] = [
    { key: 'entity', label: 'موجودیت', title: true, render: (p) => `${p.entityName}` },
    { key: 'dayoverlap', label: 'روز / تداخل', subtitle: true, render: (p) => `${p.dayName} • ${minutesToHm(p.overlapFrom)}–${minutesToHm(p.overlapTo)} (${fa(p.overlapMinutes)} دقیقه)` },
    { key: 'courseA', label: 'درس اول', render: (p) => `${p.a.courseTitle} (${p.a.courseCode} • گروه ${p.a.groupNumber})` },
    { key: 'courseB', label: 'درس دوم', render: (p) => `${p.b.courseTitle} (${p.b.courseCode} • گروه ${p.b.groupNumber})` },
    { key: 'students', label: 'دانشجو', render: (p) => fa(Number(p.a.enrolledCount) + Number(p.b.enrolledCount)) },
  ];

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">گزارش تداخل‌های واقعی برنامهٔ هفتگی</h1>
        <span className="text-xs text-slate-400">کارشناس آموزش — بررسی و رفع</span>
        <select
          value={termId ?? ''}
          onChange={(e) => setTermId(Number(e.target.value))}
          className="ms-auto rounded border px-2 py-1.5 text-sm bg-white dark:bg-slate-800"
        >
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      {msg && <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-2 text-sm text-emerald-200">{msg}</div>}
      {error && <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-2 text-sm text-rose-200">{error}</div>}

      {summary && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="تداخلِ واقعیِ باز" value={fa(openPairs.length)} tone="rose" />
          <Stat
            label="هم‌پوشانیِ خام (قبل از فیلتر ادغام)"
            value={fa(summary ? (report?.rawOverlaps ?? 0) : 0)}
          />
          <Stat label="ادغامی (حذف‌شده از گزارش)" value={fa(report?.mergedSkipped ?? 0)} tone="ok" />
          <Stat
            label={`استاد / سالن درگیر (${fa(summary.professorEntities)} / ${fa(summary.roomEntities)})`}
            value={fa(summary.professor + summary.room)}
          />
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 text-xs">
            {(['ALL', 'PROFESSOR', 'ROOM'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded px-2.5 py-1 ${kind === k ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
              >
                {k === 'ALL' ? 'همه' : k === 'PROFESSOR' ? 'استاد' : 'سالن'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={showReviewed}
              onChange={(e) => setShowReviewed(e.target.checked)}
              className="size-4"
            />
            نمایش بررسی‌شده‌ها ({fa(reviewedPairs.length)})
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جست‌وجو درس / استاد / سالن…"
            className="ms-auto w-56 rounded border px-2 py-1.5 text-sm bg-white dark:bg-slate-800"
          />
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">در حال بارگذاری…</div>}

      {!loading && report && (
        <>
          {/* نمای دسکتاپ */}
          <div className="card hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs rt">
                <thead>
                  <tr className="text-slate-500">
                    <th className="p-2">نوع</th>
                    <th className="p-2">موجودیت</th>
                    <th className="p-2">روز</th>
                    <th className="p-2">بازهٔ تداخل</th>
                    <th className="p-2">درس اول</th>
                    <th className="p-2">درس دوم</th>
                    <th className="p-2">دانشجو</th>
                    <th className="p-2">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => {
                    const badge = KIND_BADGE[p.kind];
                    const reviewed = report.reviewed[p.fingerprint];
                    return (
                      <tr key={p.fingerprint} className="border-t border-slate-100 dark:border-slate-700">
                        <td className="p-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${badge.cls}`}>{badge.label}</span>
                        </td>
                        <td className="p-2 font-medium">{p.entityName}</td>
                        <td className="p-2">{p.dayName}</td>
                        <td className="p-2" dir="ltr">
                          {minutesToHm(p.overlapFrom)}–{minutesToHm(p.overlapTo)}
                          <span className="text-slate-400"> ({fa(p.overlapMinutes)}′)</span>
                        </td>
                        <td className="p-2">
                          <div>{p.a.courseTitle}</div>
                          <div className="text-[11px] text-slate-500" dir="ltr">
                            {p.a.courseCode} • گروه {p.a.groupNumber}
                          </div>
                        </td>
                        <td className="p-2">
                          <div>{p.b.courseTitle}</div>
                          <div className="text-[11px] text-slate-500" dir="ltr">
                            {p.b.courseCode} • گروه {p.b.groupNumber}
                          </div>
                        </td>
                        <td className="p-2 font-mono" dir="ltr">
                          {fa(Number(p.a.enrolledCount) + Number(p.b.enrolledCount))}
                        </td>
                        <td className="p-2">
                          {reviewed ? (
                            <div className="space-y-1">
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                بررسی‌شده: {CONFLICT_REASON_LABELS[reviewed.reasonCode ?? 'OTHER'] ?? reviewed.reasonCode}
                              </span>
                              <div>
                                <button
                                  onClick={() => onUndo(p.fingerprint)}
                                  className="rounded border px-2 py-0.5 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  بازگردانی
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                onClick={() => onMerge(p)}
                                className="rounded bg-violet-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-violet-500"
                              >
                                ادغام
                              </button>
                              <select
                                defaultValue=""
                                onChange={(e) => e.target.value && onAccept(p, e.target.value)}
                                className="rounded border px-1.5 py-1 text-[11px] bg-white dark:bg-slate-800"
                              >
                                <option value="">پذیرش…</option>
                                {CONFLICT_REASON_CODES.map((c) => (
                                  <option key={c} value={c}>
                                    {CONFLICT_REASON_LABELS[c] ?? c}
                                  </option>
                                ))}
                              </select>
                              <Link
                                href="/admin/offering-editor"
                                className="rounded border border-slate-400 px-2 py-1 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                اصلاح
                              </Link>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-slate-400">
                        {showReviewed ? 'موردی بررسی‌شده یافت نشد.' : 'تداخلِ واقعیِ باز یافت نشد. 🎉'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* نمای موبایل (≤۷۶۸px) */}
          <MobileCardList
            rows={visible}
            columns={columns}
            getKey={(p) => p.fingerprint}
            renderActions={(p) =>
              report.reviewed[p.fingerprint] ? (
                <button
                  onClick={() => onUndo(p.fingerprint)}
                  className="rounded border px-3 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  بازگردانیِ بررسی
                </button>
              ) : (
                renderActions(p)
              )
            }
          />
        </>
      )}

      <p className="text-[11px] leading-6 text-slate-500">
        تشخیصِ تداخل از همان قاعدهٔ «کلاس ادغامی» سامانه پیروی می‌کند: اگر دو ارائه روز، ساعت و سالنِ یکسان
        داشته باشند یک جلسه‌اند، نه تداخل. ستونِ «هم‌پوشانیِ خام» می‌گوید چند جفت اسلات با استاد/سالنِ مشترک
        ساعتی را اشغال کرده‌اند، پیش از آنکه موارد ادغامی کنار گذاشته شوند.
        {report ? (
          <>
            {' '}این ترم {fa(report.slotsScanned)} ردیفِ برنامه بررسی شد
            {report.duplicateSlots > 0 ? ` (${fa(report.duplicateSlots)} ردیفِ تکراری یک‌بار شمرده شد)` : ''}.
          </>
        ) : null}{' '}
        تداخلِ امتحانی و تداخلِ برنامهٔ دانشجویان در{' '}
        <Link href="/admin/reports" className="text-indigo-600 underline">
          مرکز گزارش‌ها
        </Link>{' '}
        قابل مشاهده است.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'rose' | 'ok' }) {
  const cls =
    tone === 'rose'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : tone === 'ok'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-slate-200 bg-slate-50 text-slate-800';
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <p className="text-[10px] opacity-80">{label}</p>
      <p className="font-mono text-base font-bold" dir="ltr">{value}</p>
    </div>
  );
}
