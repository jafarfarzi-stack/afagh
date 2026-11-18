'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { askConfirm } from '@/lib/ui-feedback';
import {
  applyDuplicateCleanupAction,
  fixOfferingDriftAction,
  fixTermDriftAction,
  previewDuplicateCleanupAction,
} from './actions';

type Msg = { text: string; kind: 'ok' | 'error' } | null;

export interface DriftRow {
  offeringId: number;
  stored: number;
  computed: number;
  courseCode: string | null;
  courseTitle: string | null;
  groupNumber: number | null;
  termId: number;
  termCode: string | null;
  capacity: number | null;
}

export interface DupRow {
  enrollmentId: number;
  offeringId: number;
  groupNumber: number | null;
  status: string;
  gradeValue: number | null;
  registeredAt: string | null;
  keep: boolean;
}

export interface DupGroup {
  key: string;
  studentId: number;
  studentCode: string | null;
  studentName: string;
  termId: number;
  termCode: string;
  courseId: number;
  courseCode: string;
  courseTitle: string;
  rows: DupRow[];
  keepReason: string;
}

interface Props {
  universityName: string;
  scopeTermCode: string | null;
  kpi: { driftOfferings: number; totalDrift: number; duplicateGroups: number; extraRows: number };
  drift: DriftRow[];
  duplicates: DupGroup[];
  terms: { id: number; termCode: string }[];
}

type PreviewData = { groups: number; rowsToDrop: number; sample: DupGroup[] };

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: 'ثبت‌شده',
  WAITLISTED: 'لیست انتظار',
  PENDING_COUNCIL: 'در انتظار شورا',
  DROPPED: 'حذف‌شده',
};

const fa = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('fa-IR');

const faDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
};

function statusChip(status: string): string {
  if (status === 'REGISTERED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'WAITLISTED') return 'bg-sky-100 text-sky-800';
  if (status === 'PENDING_COUNCIL') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-200 text-slate-600';
}

function KpiCard({ title, value, hint, tone }: { title: string; value: string; hint: string; tone: string }) {
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="text-xs text-slate-600">{title}</div>
      <div className="mt-1 text-xl font-bold text-slate-800">{value}</div>
      <div className="mt-1 text-3xs text-slate-500 leading-5">{hint}</div>
    </div>
  );
}

export default function IntegrityClient({ universityName, scopeTermCode, kpi, drift, duplicates, terms }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [termId, setTermId] = useState<number>(terms[0]?.id ?? 0);

  const runPreview = () => start(async () => {
    setMsg(null);
    try {
      const r = await previewDuplicateCleanupAction();
      if (!r.ok) {
        setPreview(null);
        setMsg({ text: r.error, kind: 'error' });
        return;
      }
      setPreview({ groups: r.groups, rowsToDrop: r.rowsToDrop, sample: r.sample as DupGroup[] });
      setMsg({
        text: r.groups
          ? `پیش‌نمایش آماده شد: ${fa(r.groups)} گروه تکراری و ${fa(r.rowsToDrop)} ردیفِ قابلِ حذفِ نرم. هنوز هیچ تغییری اعمال نشده است.`
          : 'گروه تکراری فعالی برای پاک‌سازی پیدا نشد.',
        kind: 'ok',
      });
    } catch (e: any) {
      setMsg({ text: e?.message ?? 'خطا در ساخت پیش‌نمایش.', kind: 'error' });
    }
  });

  const runApply = async () => {
    if (!preview || preview.rowsToDrop === 0) return;
    const ok = await askConfirm({
      title: 'تأیید پاک‌سازی ردیف‌های تکراری',
      body: `در ${fa(preview.groups)} گروه، ${fa(preview.rowsToDrop)} ردیفِ اضافی به وضعیت «حذف‌شده» تغییر می‌کند. هیچ ردیفی حذف نمی‌شود و نمره/حضور/اعتراضِ آن‌ها باقی می‌ماند. ادامه می‌دهید؟`,
      confirmText: 'اجرا کن',
      cancelText: 'انصراف',
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      try {
        const r = await applyDuplicateCleanupAction(true);
        if (!r.ok) {
          setMsg({ text: r.error, kind: 'error' });
          return;
        }
        setMsg({
          text: `پاک‌سازی انجام شد: ${fa(r.rowsDropped)} ردیف در ${fa(r.groups)} گروه به «حذف‌شده» تغییر کرد و شمارندهٔ ${fa(r.offeringsRecounted)} ارائه بازشماری شد.`,
          kind: 'ok',
        });
        setPreview(null);
        router.refresh();
      } catch (e: any) {
        setMsg({ text: e?.message ?? 'خطا در اجرای پاک‌سازی.', kind: 'error' });
      }
    });
  };

  const fixDrift = () => start(async () => {
    setMsg(null);
    try {
      const r = await fixOfferingDriftAction();
      if (!r.ok) {
        setMsg({ text: r.error, kind: 'error' });
        return;
      }
      setMsg({
        text: r.offerings
          ? `${fa(r.offerings)} ارائه اصلاح شد (مجموع اختلاف پیش از اصلاح: ${fa(r.driftBefore)} صندلی).`
          : 'هیچ ارائهٔ ناهمگامی برای اصلاح نبود.',
        kind: 'ok',
      });
      router.refresh();
    } catch (e: any) {
      setMsg({ text: e?.message ?? 'خطا در اصلاح شمارنده.', kind: 'error' });
    }
  });

  const fixTerm = () => start(async () => {
    setMsg(null);
    if (!termId) {
      setMsg({ text: 'ابتدا یک ترم انتخاب کنید.', kind: 'error' });
      return;
    }
    try {
      const r = await fixTermDriftAction(termId);
      if (!r.ok) {
        setMsg({ text: r.error, kind: 'error' });
        return;
      }
      setMsg({
        text: r.updated
          ? `شمارندهٔ ${fa(r.updated)} ارائهٔ این ترم بازشماری شد.`
          : 'همهٔ ارائه‌های این ترم از قبل درست بودند.',
        kind: 'ok',
      });
      router.refresh();
    } catch (e: any) {
      setMsg({ text: e?.message ?? 'خطا در اصلاح ترم.', kind: 'error' });
    }
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">سلامت ثبت‌نام‌ها</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {universityName} — یکسان‌سازی شمارندهٔ صندلی و پاک‌سازی ردیف‌های تکراری؛
            هیچ ردیف ثبت‌نامی حذف نمی‌شود (فقط «حذف‌شده» می‌شود تا تاریخچهٔ نمره/حضور حفظ بماند).
          </p>
        </div>
        <div className="text-3xs text-slate-500 leading-5 max-w-md">
          تعریفِ رسمی: صندلیِ اشغال‌شده = ثبت‌نام‌های «ثبت‌شده» + رزروهای معتبرِ درخواست‌های بدون
          پیش‌نیاز/تداخل (در انتظار مدیر یا کارشناس).
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            msg.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* ── KPI ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          title="تعداد ارائه‌های ناهمگام"
          value={fa(kpi.driftOfferings)}
          hint={`ارائه‌هایی که عددِ ذخیره‌شده با شمارشِ واقعی یکی نیست${scopeTermCode ? ` — نیمسال ${scopeTermCode}` : ''}`}
          tone="border-amber-200 bg-amber-50"
        />
        <KpiCard
          title="مجموع اختلاف صندلی"
          value={fa(kpi.totalDrift)}
          hint={`جمع قدرمطلقِ اختلافِ شمارنده با شمارشِ واقعی${scopeTermCode ? ` — نیمسال ${scopeTermCode}` : ''}`}
          tone="border-rose-200 bg-rose-50"
        />
        <KpiCard
          title="تعداد گروه‌های تکراری"
          value={fa(kpi.duplicateGroups)}
          hint="گروه‌های (دانشجو، ترم، درس) با بیش از یک ردیف فعال"
          tone="border-sky-200 bg-sky-50"
        />
        <KpiCard
          title="تعداد ردیف‌های اضافی"
          value={fa(kpi.extraRows)}
          hint="ردیف‌هایی که پس از نگه‌داشتنِ یک ردیف در هر گروه، اضافه‌اند"
          tone="border-slate-200 bg-slate-50"
        />
      </div>

      {/* ── جدول ۱: ناهمگامی شمارنده ── */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 px-3 py-2">
          <h2 className="text-sm font-bold text-slate-800">ناهمگامی شمارندهٔ صندلی</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={termId}
              onChange={e => setTermId(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              disabled={pending || !terms.length}
            >
              {!terms.length && <option value={0}>ترمی ثبت نشده</option>}
              {terms.map(t => (
                <option key={t.id} value={t.id}>
                  ترم {t.termCode}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={fixTerm}
              disabled={pending || !termId}
              className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              اصلاح کل ترم
            </button>
            <button
              type="button"
              onClick={fixDrift}
              disabled={pending || kpi.driftOfferings === 0}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              اصلاح همه ({fa(kpi.driftOfferings)})
            </button>
          </div>
        </div>
        <div className="rt-wrap">
          <table className="rt w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-2 text-right">درس</th>
                <th className="px-2 py-2 text-right">ترم</th>
                <th className="px-2 py-2 text-center">گروه</th>
                <th className="px-2 py-2 text-center">ظرفیت</th>
                <th className="px-2 py-2 text-center">ذخیره‌شده</th>
                <th className="px-2 py-2 text-center">شمارش واقعی</th>
                <th className="px-2 py-2 text-center">اختلاف</th>
                <th className="px-2 py-2 text-center">اصلاح</th>
              </tr>
            </thead>
            <tbody>
              {!drift.length ? (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-slate-500">
                    شمارندهٔ همهٔ ارائه‌ها با شمارش واقعی یکی است. 🎉
                  </td>
                </tr>
              ) : (
                drift.map(row => {
                  const diff = row.computed - row.stored;
                  return (
                    <tr key={row.offeringId} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        <div className="font-bold text-slate-800">{row.courseTitle ?? '—'}</div>
                        <div className="text-3xs text-slate-500">
                          {row.courseCode ?? '—'} · شناسهٔ ارائه {fa(row.offeringId)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">{row.termCode ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">{row.groupNumber ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">{fa(row.capacity)}</td>
                      <td className="px-2 py-1.5 text-center font-mono">{fa(row.stored)}</td>
                      <td className="px-2 py-1.5 text-center font-mono">{fa(row.computed)}</td>
                      <td
                        className={`px-2 py-1.5 text-center font-mono font-bold ${
                          diff > 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {diff > 0 ? `+${fa(diff)}` : fa(diff)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={fixDrift}
                          disabled={pending}
                          className="rounded-md bg-amber-100 px-2 py-0.5 text-3xs font-bold text-amber-800 hover:bg-amber-200 disabled:opacity-50"
                        >
                          اصلاح
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-3xs text-slate-500">
          نمایش حداکثر ۱۰۰ مورد، بدترین اختلاف اول. «اختلاف مثبت» یعنی شمارنده کمتر از واقعیت است.
        </div>
      </section>

      {/* ── جدول ۲: گروه‌های تکراری ── */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 px-3 py-2">
          <h2 className="text-sm font-bold text-slate-800">گروه‌های تکراری (دانشجو، ترم، درس)</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runPreview}
              disabled={pending}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              ۱) پیش‌نمایش پاک‌سازی
            </button>
            <button
              type="button"
              onClick={runApply}
              disabled={pending || !preview || preview.rowsToDrop === 0}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              ۲) اجرای پاک‌سازی
            </button>
          </div>
        </div>

        {preview && (
          <div className="border-b border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            پیش‌نمایش (بدون نوشتن): {fa(preview.groups)} گروه، {fa(preview.rowsToDrop)} ردیفِ
            قابلِ حذفِ نرم. قاعده: ردیفِ دارای نمره (بالاترین نمره) ← قدیمی‌ترین «ثبت‌شده» ←
            قدیمی‌ترین ردیف.
          </div>
        )}

        <div className="rt-wrap">
          <table className="rt w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-2 text-right">دانشجو</th>
                <th className="px-2 py-2 text-right">درس / ترم</th>
                <th className="px-2 py-2 text-right">ردیف‌های فعال</th>
                <th className="px-2 py-2 text-right">قاعدهٔ نگه‌داشتن</th>
              </tr>
            </thead>
            <tbody>
              {!duplicates.length ? (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-slate-500">
                    هیچ گروه تکراریِ فعالی در این دانشگاه نیست. 🎉
                  </td>
                </tr>
              ) : (
                duplicates.map(g => (
                  <tr key={g.key} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-1.5">
                      <div className="font-bold text-slate-800">{g.studentName}</div>
                      <div className="text-3xs text-slate-500 font-mono">{g.studentCode ?? '—'}</div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-bold text-slate-800">{g.courseTitle}</div>
                      <div className="text-3xs text-slate-500">
                        {g.courseCode} · ترم {g.termCode}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {g.rows.map(r => (
                          <span
                            key={r.enrollmentId}
                            title={`شناسهٔ ثبت‌نام ${r.enrollmentId} · تاریخ ${faDate(r.registeredAt)}`}
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-3xs font-bold ${statusChip(
                              r.status,
                            )} ${r.keep ? 'ring-1 ring-emerald-500' : ''}`}
                          >
                            گروه {r.groupNumber ?? '—'} · {STATUS_LABEL[r.status] ?? r.status}
                            {r.gradeValue != null ? ` · نمره ${fa(r.gradeValue)}` : ''}
                            {r.keep ? ' ✓' : ''}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-3xs text-slate-600">{g.keepReason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-3xs text-slate-500">
          حداکثر ۱۰۰ گروه نمایش داده می‌شود (بیشترین تکرار اول). ردیفِ دارای ✓ همان ردیفی است که
          می‌ماند؛ بقیه «حذف‌شده» می‌شوند و دلیلش در ستون توضیح اورراید ثبت می‌شود.
        </div>
      </section>

      {preview && preview.sample.length > 0 && (
        <section className="rounded-xl border border-sky-200 bg-white">
          <div className="border-b border-sky-100 px-3 py-2 text-sm font-bold text-slate-800">
            نمونهٔ پلنِ پاک‌سازی (تا ۵۰ گروه)
          </div>
          <div className="rt-wrap">
            <table className="rt w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="px-2 py-2 text-right">دانشجو</th>
                  <th className="px-2 py-2 text-right">درس / ترم</th>
                  <th className="px-2 py-2 text-right">می‌ماند</th>
                  <th className="px-2 py-2 text-right">حذفِ نرم</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map(g => {
                  const keepRows = g.rows.filter(r => r.keep);
                  const dropRows = g.rows.filter(r => !r.keep);
                  return (
                    <tr key={`p-${g.key}`} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-1.5">
                        <div className="font-bold text-slate-800">{g.studentName}</div>
                        <div className="text-3xs text-slate-500 font-mono">{g.studentCode ?? '—'}</div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-bold text-slate-800">{g.courseTitle}</div>
                        <div className="text-3xs text-slate-500">
                          {g.courseCode} · ترم {g.termCode}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        {keepRows.map(r => (
                          <div key={r.enrollmentId} className="text-3xs text-emerald-800">
                            #{r.enrollmentId} · گروه {r.groupNumber ?? '—'} ·{' '}
                            {STATUS_LABEL[r.status] ?? r.status}
                            {r.gradeValue != null ? ` · نمره ${fa(r.gradeValue)}` : ''} —{' '}
                            {g.keepReason}
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-1.5">
                        {dropRows.map(r => (
                          <div key={r.enrollmentId} className="text-3xs text-rose-700">
                            #{r.enrollmentId} · گروه {r.groupNumber ?? '—'} ·{' '}
                            {STATUS_LABEL[r.status] ?? r.status}
                            {r.gradeValue != null ? ` · نمره ${fa(r.gradeValue)}` : ''}
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {pending && (
        <div className="text-xs text-slate-500">در حال اجرا…</div>
      )}
    </div>
  );
}
