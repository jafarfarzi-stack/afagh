'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { askConfirm, notify } from '@/lib/ui-feedback';

/**
 * ThesisInboxClient — کارتابل پایان‌نامهٔ استاد.
 *
 * چهار بخش: «در انتظار تأیید من»، «دفاع‌های پیش‌رو»، «نمرهٔ در انتظار» و
 * «بایگانی». تنها کنشِ نوشتنی، تأیید/رد درخواست دفاع است که به‌صورت prop از
 * سرور می‌آید (اکشن سرور در کلاینت ایمپورت نمی‌شود — فقط به‌عنوان action prop).
 *
 * همهٔ تاریخ‌ها و درصدها از سرور به‌صورت رشتهٔ فارسی آماده می‌رسند تا رندرِ
 * سرور و هیدریشن دقیقاً یکی باشد (بدون اختلافِ منطقهٔ زمانی/تقویم).
 */

export type PendingDefenseRow = {
  auditId: number;
  studentName: string;
  studentCode: string;
  title: string;
  /** درصد همانندجویی پروپوزال به شکل فارسی، یا «—» */
  similarity: string;
  requestedAt: string;
  /** فقط استاد راهنما می‌تواند تصمیم بگیرد؛ مشاور فقط می‌بیند. */
  canDecide: boolean;
};

export type UpcomingDefenseRow = {
  sessionId: number;
  auditId: number;
  studentName: string;
  studentCode: string;
  title: string;
  scheduledAt: string;
  roomName: string;
  roleLabel: string;
};

export type PendingGradeRow = {
  auditId: number;
  studentName: string;
  studentCode: string;
  title: string;
  resultLabel: string;
  conductedAt: string;
};

export type ArchivedThesisRow = {
  auditId: number;
  studentName: string;
  studentCode: string;
  title: string;
  statusLabel: string;
  resultLabel: string;
  at: string;
};

type DecisionInput = { auditId: number; approved: boolean; reason?: string };
type DecisionResult = { ok: true; message: string } | { ok: false; error: string };

type CountedSectionProps = {
  icon: string;
  title: string;
  hint: string;
  count: number;
  tone: 'amber' | 'indigo' | 'sky' | 'slate';
  emptyText: string;
  children: ReactNode;
};

const SECTION_TONES: Record<CountedSectionProps['tone'], { badge: string; ring: string }> = {
  amber: { badge: 'bg-amber-100 text-amber-900', ring: 'border-amber-200' },
  indigo: { badge: 'bg-indigo-100 text-indigo-900', ring: 'border-indigo-200' },
  sky: { badge: 'bg-sky-100 text-sky-900', ring: 'border-sky-200' },
  slate: { badge: 'bg-slate-200 text-slate-700', ring: 'border-slate-200' },
};

function Section({ icon, title, hint, count, tone, emptyText, children }: CountedSectionProps) {
  const t = SECTION_TONES[tone];
  return (
    <section className="card space-y-3 border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span aria-hidden className="text-lg leading-none">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-900 sm:text-base">{title}</h2>
            <p className="mt-0.5 text-2xs leading-5 text-slate-500">{hint}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-black ring-1 ring-inset ${t.badge} ${t.ring}`}
          title={`${count.toLocaleString('fa-IR')} مورد`}
        >
          {count.toLocaleString('fa-IR')} مورد
        </span>
      </div>
      {count === 0 ? (
        <p className="rounded-xl bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">{emptyText}</p>
      ) : (
        children
      )}
    </section>
  );
}

export default function ThesisInboxClient({
  pending,
  upcoming,
  pendingGrades,
  archive,
  approveAction,
}: {
  pending: PendingDefenseRow[];
  upcoming: UpcomingDefenseRow[];
  pendingGrades: PendingGradeRow[];
  archive: ArchivedThesisRow[];
  approveAction: (input: DecisionInput) => Promise<DecisionResult>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [decided, setDecided] = useState<number[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingDefenseRow | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  // صفِ «در انتظار تأیید» از props می‌آید و فقط ردیف‌های تازه‌تصمیم‌گرفته‌شده
  // به‌صورت خوش‌بینانه پنهان می‌شوند؛ با `router.refresh()` فهرستِ تازه از سرور
  // می‌رسد و ردیف‌های جدیدِ دیگر هم بی‌درنگ دیده می‌شوند.
  const rows = pending.filter(r => !decided.includes(r.auditId));

  const allEmpty =
    rows.length === 0 && upcoming.length === 0 && pendingGrades.length === 0 && archive.length === 0;

  const submitting = busyId !== null;

  async function submit(row: PendingDefenseRow, input: { approved: boolean; reason?: string }) {
    setBusyId(row.auditId);
    try {
      const res = await approveAction({ auditId: row.auditId, ...input });
      if (!res.ok) {
        notify(res.error, 'error');
        return;
      }
      notify(res.message, 'success');
      setDecided(prev => (prev.includes(row.auditId) ? prev : [...prev, row.auditId]));
      setRejectTarget(null);
      setReason('');
      setReasonError('');
      // سایر بخش‌ها (دفاع‌های پیش‌رو، نوار آمارِ بالای صفحه) از سرور تازه می‌شوند
      startTransition(() => router.refresh());
    } catch {
      notify('ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function approve(row: PendingDefenseRow) {
    const ok = await askConfirm({
      title: 'تأیید درخواست دفاع',
      body: `درخواست دفاع ${row.studentName} (${row.studentCode}) تأیید شود؟\nپس از تأیید، تعیین وقت و هیأت داوران بر عهدهٔ کارشناس آموزش است.`,
      confirmText: 'تأیید می‌کنم',
      cancelText: 'انصراف',
      danger: false,
    });
    if (!ok) return;
    await submit(row, { approved: true });
  }

  function openReject(row: PendingDefenseRow) {
    setRejectTarget(row);
    setReason('');
    setReasonError('');
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    const text = reason.trim();
    if (text.length < 3) {
      setReasonError('دلیل رد را دست‌کم در ۳ نویسه بنویسید تا دانشجو بداند چه چیزی باید اصلاح کند.');
      return;
    }
    const ok = await askConfirm({
      title: 'رد درخواست دفاع',
      body: `درخواست دفاع ${rejectTarget.studentName} (${rejectTarget.studentCode}) رد شود؟`,
      confirmText: 'رد کن',
      cancelText: 'انصراف',
      danger: true,
    });
    if (!ok) return;
    await submit(rejectTarget, { approved: false, reason: text });
  }

  if (allEmpty) {
    return (
      <div className="card space-y-2 p-6 text-center sm:p-8">
        <p className="text-sm font-black text-slate-700 sm:text-base">برای شما هنوز پایان‌نامه‌ای ثبت نشده</p>
        <p className="mx-auto max-w-xl text-xs leading-6 text-slate-500">
          وقتی تحصیلات تکمیلی یا کارشناس آموزش شما را به‌عنوان استاد راهنما یا مشاور یک پایان‌نامه ثبت کند،
          درخواست‌های دفاع، جلسات پیش‌رو و نتیجهٔ نهایی همین‌جا نمایش داده می‌شود.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <Section
        icon="✍️"
        title="در انتظار تأیید من"
        hint="درخواست‌های دفاعی که دانشجو ثبت کرده و منتظر تصمیم استاد راهنما هستند."
        count={rows.length}
        tone="amber"
        emptyText="در حال حاضر درخواست دفاعی در انتظار تأیید شما نیست."
      >
        <div className="rt-wrap">
          <table className="rt w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-2 text-right">دانشجو</th>
                <th className="px-2 py-2 text-right">عنوان پایان‌نامه</th>
                <th className="px-2 py-2 text-center">همانندجویی پروپوزال</th>
                <th className="px-2 py-2 text-center">تاریخ درخواست</th>
                <th className="px-2 py-2 text-center">تصمیم</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.auditId} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2">
                    <span className="font-extrabold text-slate-800">{r.studentName}</span>
                    <span className="mt-0.5 block font-mono text-2xs text-slate-500">{r.studentCode}</span>
                  </td>
                  <td className="px-2 py-2 leading-6 text-slate-700">{r.title}</td>
                  <td className="px-2 py-2 text-center font-bold text-slate-700">{r.similarity}</td>
                  <td className="px-2 py-2 text-center text-slate-600">{r.requestedAt || '—'}</td>
                  <td className="px-2 py-2">
                    {r.canDecide ? (
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <Button size="sm" variant="success" onClick={() => approve(r)} loading={busyId === r.auditId} disabled={submitting}>
                          تأیید
                        </Button>
                        <Button size="sm" variant="dangerGhost" onClick={() => openReject(r)} disabled={submitting}>
                          رد
                        </Button>
                      </div>
                    ) : (
                      <span className="block text-center text-2xs font-bold text-slate-500">
                        در انتظار تصمیم استاد راهنما (شما مشاور هستید)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        icon="🗓️"
        title="دفاع‌های پیش‌رو"
        hint="جلسات دفاعِ زمان‌بندی‌شده که هنوز برگزار نشده‌اند."
        count={upcoming.length}
        tone="indigo"
        emptyText="جلسهٔ دفاعی در آینده برای شما زمان‌بندی نشده است."
      >
        <div className="rt-wrap">
          <table className="rt w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-2 text-right">دانشجو</th>
                <th className="px-2 py-2 text-right">عنوان پایان‌نامه</th>
                <th className="px-2 py-2 text-center">زمان دفاع</th>
                <th className="px-2 py-2 text-center">اتاق</th>
                <th className="px-2 py-2 text-center">نقش من</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map(r => (
                <tr key={r.sessionId} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2">
                    <span className="font-extrabold text-slate-800">{r.studentName}</span>
                    <span className="mt-0.5 block font-mono text-2xs text-slate-500">{r.studentCode}</span>
                  </td>
                  <td className="px-2 py-2 leading-6 text-slate-700">{r.title}</td>
                  <td className="px-2 py-2 text-center font-bold text-indigo-800">{r.scheduledAt || '—'}</td>
                  <td className="px-2 py-2 text-center text-slate-600">{r.roomName}</td>
                  <td className="px-2 py-2 text-center">
                    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-bold text-slate-700">
                      {r.roleLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        icon="📝"
        title="نمرهٔ پایان‌نامه‌های در انتظار"
        hint="دفاع این دانشجویان قبول شده، اما نمرهٔ کیفی پایان‌نامه هنوز ثبت نشده است."
        count={pendingGrades.length}
        tone="sky"
        emptyText="نمرهٔ ثبت‌نشده‌ای برای پایان‌نامه‌های شما وجود ندارد."
      >
        <p className="rounded-xl border border-sky-100 bg-sky-50 p-2.5 text-2xs leading-6 font-bold text-sky-900">
          ثبت نمرهٔ کیفی پایان‌نامه (مواد ۳۶ و ۴۸) بر عهدهٔ کارشناس تحصیلات تکمیلی است؛ این فهرست فقط برای
          اطلاع شماست و از این صفحه ثبت نمی‌شود.
        </p>
        <div className="rt-wrap">
          <table className="rt w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-2 text-right">دانشجو</th>
                <th className="px-2 py-2 text-right">عنوان پایان‌نامه</th>
                <th className="px-2 py-2 text-center">نتیجهٔ دفاع</th>
                <th className="px-2 py-2 text-center">تاریخ دفاع</th>
              </tr>
            </thead>
            <tbody>
              {pendingGrades.map(r => (
                <tr key={r.auditId} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2">
                    <span className="font-extrabold text-slate-800">{r.studentName}</span>
                    <span className="mt-0.5 block font-mono text-2xs text-slate-500">{r.studentCode}</span>
                  </td>
                  <td className="px-2 py-2 leading-6 text-slate-700">{r.title}</td>
                  <td className="px-2 py-2 text-center font-bold text-emerald-800">{r.resultLabel}</td>
                  <td className="px-2 py-2 text-center text-slate-600">{r.conductedAt || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        icon="🗄️"
        title="بایگانی"
        hint="۲۰ پایان‌نامهٔ آخر که دفاعشان با نتیجهٔ قبول یا مردود بسته شده است."
        count={archive.length}
        tone="slate"
        emptyText="هنوز پایان‌نامهٔ بسته‌شده‌ای در بایگانی شما نیست."
      >
        <div className="rt-wrap">
          <table className="rt w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-2 text-right">دانشجو</th>
                <th className="px-2 py-2 text-right">عنوان پایان‌نامه</th>
                <th className="px-2 py-2 text-center">وضعیت درخواست</th>
                <th className="px-2 py-2 text-center">نتیجه</th>
                <th className="px-2 py-2 text-center">آخرین به‌روزرسانی</th>
              </tr>
            </thead>
            <tbody>
              {archive.map(r => (
                <tr key={r.auditId} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2">
                    <span className="font-extrabold text-slate-800">{r.studentName}</span>
                    <span className="mt-0.5 block font-mono text-2xs text-slate-500">{r.studentCode}</span>
                  </td>
                  <td className="px-2 py-2 leading-6 text-slate-700">{r.title}</td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-2xs font-black ${
                        r.statusLabel === 'قبول' ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
                      }`}
                    >
                      {r.statusLabel}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center text-slate-700">{r.resultLabel}</td>
                  <td className="px-2 py-2 text-center text-slate-600">{r.at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          if (submitting) return;
          setRejectTarget(null);
        }}
        title="رد درخواست دفاع"
        size="md"
        footer={
          <>
            <Button variant="danger" onClick={confirmReject} loading={submitting}>
              ثبت رد درخواست
            </Button>
            <Button variant="secondary" onClick={() => setRejectTarget(null)} disabled={submitting}>
              انصراف
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-xs leading-6 text-slate-600">
            برای رد درخواست دفاع، ثبت دلیل الزامی است؛ روشن بنویسید چه چیزی باید اصلاح شود.
          </p>
          <label htmlFor="thesis-reject-reason" className="block text-2xs font-black text-slate-700">
            دلیل رد (الزامی)
          </label>
          <textarea
            id="thesis-reject-reason"
            value={reason}
            onChange={e => {
              setReason(e.target.value);
              setReasonError('');
            }}
            rows={4}
            maxLength={500}
            className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs leading-6 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="مثال: نتایج فصل چهارم با اهداف پروپوزال هم‌خوان نیست و نیاز به بازنویسی دارد."
          />
          <div className="flex items-center justify-between gap-2">
            <span className={`text-2xs font-bold ${reasonError ? 'text-rose-700' : 'text-slate-400'}`}>
              {reasonError || 'حداقل ۳ نویسه'}
            </span>
            <span className="text-2xs text-slate-400">{reason.trim().length.toLocaleString('fa-IR')} / ۵۰۰</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
