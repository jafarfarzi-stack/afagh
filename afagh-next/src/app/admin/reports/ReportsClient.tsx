'use client';

import { useEffect, useState } from 'react';
import { exportReport, runReport, type FilterOptions, type ReportResult } from './actions';
import { LINK_CARDS } from './report-links';

type Card = { kind: string; icon: string; title: string; needsTerm?: boolean; soon?: boolean; customs?: { key: string; title: string }[] };

const CARDS: Card[] = [
  { kind: 'active-term', icon: '🧑‍🎓', title: 'گزارش دانشجویان فعال ترم', needsTerm: true },
  { kind: 'status-summary', icon: '📊', title: 'گزارش خلاصه وضعیت تحصیلی' },
  { kind: 'by-faculty', icon: '🏛️', title: 'گزارش به تفکیک دانشکده' },
  { kind: 'by-major', icon: '📚', title: 'گزارش دانشجویان هر رشته' },
  { kind: 'grade-status', icon: '📝', title: 'دانشجویان برحسب وضعیت نمره', needsTerm: true },
  { kind: 'probation', icon: '⚠️', title: 'مشروطی‌های ترم', needsTerm: true },
  { kind: 'top', icon: '🏆', title: 'گزارش نمرات برتر هر رشته' },
  { kind: 'incomplete', icon: '📋', title: 'تکمیلی دانشجویان (پرونده ناقص)' },
  { kind: 'graduates', icon: '🎓', title: 'دانش‌آموختگان' },
  { kind: 'entries', icon: '📥', title: 'ورودی‌های جدید' },
  { kind: 'noshow', icon: '🚫', title: 'عدم مراجعه‌ها' },
  { kind: 'transfers', icon: '🔀', title: 'میهمان / انتقالی' },
  { kind: 'tuition', icon: '💰', title: 'گزارش شهریه / تراکنش مالی' },
  { kind: 'payesh', icon: '🗂️', title: 'گزارش پاسخ‌های طرح پایش' },
  { kind: 'jame', icon: '🧮', title: 'دانشجویان واجد شرایط آزمون جامع' },
  { kind: 'docs', icon: '📎', title: 'مدارک دانشجویان' },

  // ── موج ۲: ۵۰ گزارش خانواده‌ها (منطق در r-*.ts) ──
  // آموزشی/مشروطی
  { kind: 'probation-violations', icon: '⚠️', title: 'تخلفات مشروطی', needsTerm: true },
  { kind: 'probation-chains', icon: '🔗', title: 'مشروطی متناوب و متوالی', needsTerm: true },
  { kind: 'unit-cap-violations', icon: '📏', title: 'عدم رعایت سقف و کف واحد', needsTerm: true },
  { kind: 'repeated-courses', icon: '🔁', title: 'دروس چندبار اخذشده' },
  // آموزشی/برنامه و نمره
  { kind: 'student-weekly-conflicts', icon: '🗓', title: 'تداخل برنامه هفتگی دانشجویان', needsTerm: true },
  { kind: 'student-exam-conflicts', icon: '📝', title: 'تداخل برنامه امتحانی', needsTerm: true },
  { kind: 'prereq-violations', icon: '⛓', title: 'عدم رعایت پیش‌نیاز/هم‌نیاز', needsTerm: true },
  { kind: 'course-grade-status', icon: '📋', title: 'وضعیت درس و نمره', needsTerm: true, customs: [{ key: 'gradeStatus', title: 'وضع نمره' }, { key: 'samaCode', title: 'کد سما' }] },
  { kind: 'enrollment-pick', icon: '🧾', title: 'انتخاب واحد دانشجویان', needsTerm: true },
  // آموزشی/فهرست
  { kind: 'offered-course-roster', icon: '👥', title: 'دانشجویان درس ارائه‌شده', needsTerm: true },
  { kind: 'top-students', icon: '🏆', title: 'نفرات برتر (معدل کل)' },
  { kind: 'no-photo', icon: '📷', title: 'دانشجویان فاقد عکس' },
  { kind: 'graduates-info', icon: '🎓', title: 'اطلاعات دانش‌آموختگان' },
  // وضعیت و عملیات
  { kind: 'status-report', icon: '📊', title: 'وضعیت دانشجویان' },
  { kind: 'major-change-report', icon: '🔀', title: 'تغییر رشته' },
  { kind: 'status-change-report', icon: '🔄', title: 'تغییر وضعیت' },
  { kind: 'gpa-refresh-preview', icon: '🧮', title: 'به‌روزرسانی معدل نیمسال' },
  { kind: 'profile-refresh', icon: '👤', title: 'به‌روزرسانی نیمرخ تحصیلی' },
  { kind: 'portal-export', icon: '📡', title: 'ارسال به پرتال' },
  // امتحانات
  { kind: 'exam-session-sheet', icon: '📄', title: 'صورت‌جلسه امتحان', needsTerm: true },
  { kind: 'seat-numbers', icon: '💺', title: 'شماره صندلی', needsTerm: true },
  { kind: 'final-exam-schedule', icon: '🗓', title: 'برنامه امتحانات پایان ترم', needsTerm: true },
  { kind: 'grade-entry-report', icon: '✍️', title: 'ثبت نمره استادان', needsTerm: true },
  { kind: 'grade-deadline', icon: '⏰', title: 'زمان‌بندی ثبت نمرات', needsTerm: true },
  // کلاس‌ها
  { kind: 'empty-rooms', icon: '🏚', title: 'کلاس‌های خالی', needsTerm: true },
  { kind: 'weekly-timetable', icon: '🗓', title: 'برنامه هفتگی کلاس‌ها', needsTerm: true },
  { kind: 'room-conflicts', icon: '⚠️', title: 'تداخل برنامه کلاس‌ها', needsTerm: true },
  { kind: 'low-enrollment', icon: '📉', title: 'ظرفیت به حدنصاب نرسیده', needsTerm: true },
  { kind: 'makeup-courses', icon: '🩹', title: 'دروس جبرانی/پیش‌دانشگاهی' },
  // اساتید
  { kind: 'staff-list', icon: '👨‍🏫', title: 'اساتید', needsTerm: true },
  { kind: 'staff-courses', icon: '📚', title: 'استادان مدرس دروس', needsTerm: true },
  { kind: 'staff-timetable', icon: '🗓', title: 'برنامه هفتگی اساتید', needsTerm: true },
  { kind: 'attendance-list', icon: '📝', title: 'حضور و غیاب', needsTerm: true },
  // مالی
  { kind: 'tuition-tariff', icon: '💰', title: 'تعرفه تحصیلی' },
  { kind: 'tuition-statement', icon: '🧾', title: 'صورت‌حساب شهریه', needsTerm: true },
  // پژوهش
  { kind: 'proposal-cap', icon: '🎓', title: 'ظرفیت پروپوزال استادان', soon: true },
  { kind: 'pending-requests', icon: '⏳', title: 'درخواست‌های درانتظار' },
  { kind: 'defenses', icon: '🎤', title: 'لیست دفاعیات' },
  { kind: 'proposals', icon: '📄', title: 'پروپوزال' },
  { kind: 'seminars', icon: '💬', title: 'سمینار', soon: true },
  // شورا و مکاتبات
  { kind: 'council-edu', icon: '🏛', title: 'شورای آموزشی' },
  { kind: 'discipline', icon: '⚖', title: 'کمیته انضباطی', soon: true },
  { kind: 'letter-templates', icon: '📄', title: 'قالب‌های مکاتبات' },
  { kind: 'transcript-card', icon: '🎓', title: 'کارنامه دانشجویان' },
  { kind: 'exam-entry-card', icon: '🎟', title: 'کارت ورود به جلسه', needsTerm: true },
  { kind: 'student-card', icon: '🪪', title: 'کارت دانشجویی' },
  { kind: 'study-cert', icon: '📜', title: 'گواهی اشتغال به تحصیل' },
  { kind: 'edu-confirm', icon: '✅', title: 'تاییدیه تحصیلی' },
  { kind: 'grad-cert', icon: '🎓', title: 'گواهی پایان تحصیلات' },
  { kind: 'military-defer', icon: '🎖', title: 'معافیت تحصیلی' },
  { kind: 'finance-worklist', icon: '🗂️', title: 'کارتابل مالی (مانده دانشجویان)', customs: [{ key: 'onlyDebtors', title: 'فقط بدهکار (1)' }] },
  { kind: 'payroll-overview', icon: '💵', title: 'حق‌التدریس اساتید', needsTerm: true },
  { kind: 'bi-teaching-quality', icon: '🎯', title: 'کیفیت تدریس اساتید (BI)' },
  { kind: 'bi-facilities', icon: '🏫', title: 'امکانات کلاس‌ها (BI)' },
  { kind: 'graduation-dossiers', icon: '🎓', title: 'پرونده‌های فراغت‌التحصیل', customs: [{ key: 'dossierStatus', title: 'وضعیت (کد)' }] },
  { kind: 'grade-audit-log', icon: '📜', title: 'لاگ تغییرات نمرات' },
  { kind: 'third-attempt', icon: '🔁', title: 'دروس بار سوم (مردودی دو بار)', needsTerm: true },
];

const NEW_KINDS = new Set(['finance-worklist', 'payroll-overview', 'bi-teaching-quality', 'bi-facilities', 'graduation-dossiers', 'grade-audit-log', 'probation-violations', 'probation-chains', 'unit-cap-violations', 'repeated-courses', 'student-weekly-conflicts', 'student-exam-conflicts', 'prereq-violations', 'course-grade-status', 'enrollment-pick', 'offered-course-roster', 'top-students', 'no-photo', 'graduates-info', 'status-report', 'major-change-report', 'status-change-report', 'gpa-refresh-preview', 'profile-refresh', 'portal-export', 'exam-session-sheet', 'seat-numbers', 'final-exam-schedule', 'grade-entry-report', 'grade-deadline', 'empty-rooms', 'weekly-timetable', 'room-conflicts', 'low-enrollment', 'makeup-courses', 'staff-list', 'staff-courses', 'staff-timetable', 'attendance-list', 'tuition-tariff', 'tuition-statement', 'pending-requests', 'defenses', 'proposals', 'council-edu', 'letter-templates', 'transcript-card', 'exam-entry-card', 'student-card', 'study-cert', 'edu-confirm', 'grad-cert', 'military-defer']);

export default function ReportsClient({ opts, initialUniversityId, allowedKinds }: { opts: FilterOptions; initialUniversityId?: number; allowedKinds?: string[] | null }) {
  const [kind, setKind] = useState<string>('active-term');
  const [term, setTerm] = useState(opts.latestTerm);
  const [degreeId, setDegreeId] = useState(0);
  const [facultyId, setFacultyId] = useState(0);
  const [departmentId, setDepartmentId] = useState(0);
  const [majorId, setMajorId] = useState(0);
  const [entryYear, setEntryYear] = useState(0);
  const [q, setQ] = useState('');
  const [nationalCode, setNationalCode] = useState('');
  const [miss, setMiss] = useState('national');
  const [universityId, setUniversityId] = useState(initialUniversityId ?? 0);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [res, setRes] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState('');
  const [showLinks, setShowLinks] = useState(false);

  const visibleCards = allowedKinds ? CARDS.filter(c => allowedKinds.includes(c.kind)) : CARDS;
  const card = visibleCards.find(c => c.kind === kind);
  useEffect(() => {
    if (!visibleCards.some(c => c.kind === kind)) setKind(visibleCards[0]?.kind ?? 'active-term');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedKinds]);
  const filters = { term, degreeId, facultyId, departmentId, majorId, entryYear, q: q.trim(), nationalCode: nationalCode.trim(), miss, page: 1, universityId, ...extra };

  const run = async (page = 1) => {
    setLoading(true);
    setErr('');
    try {
      setRes(await runReport(kind, { ...filters, page }));
      setTimeout(() => {
        document.getElementById('report-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'خطای نامشخص در اجرای گزارش');
    } finally {
      setLoading(false);
    }
  };

  const pick = (k: string) => {
    setKind(k);
    setRes(null);
    setErr('');
    setTimeout(() => {
      const el = document.getElementById('report-result');
      void el;
    }, 0);
  };

  const doExport = async () => {
    setExporting(true);
    setErr('');
    try {
      const { header, lines } = await exportReport(kind, { ...filters, page: 1 });
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const csv = '﻿' + [header.map(esc).join(','), ...lines.map(l => l.map(esc).join(','))].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report-${kind}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'خطای نامشخص در خروجی');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* نوار دسته‌بندی به سبک سما */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {visibleCards.map(c => (
          <button
            key={c.kind}
            disabled={c.soon}
            onClick={() => pick(c.kind)}
            className={`flex items-center gap-2 p-3 rounded-lg border-2 text-right font-bold text-[13px] transition-all shadow-sm
              ${c.soon
                ? 'bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed'
                : kind === c.kind
                  ? 'bg-indigo-50 border-indigo-500 text-indigo-950 shadow-md'
                  : 'bg-gradient-to-b from-white to-slate-100 border-slate-300 text-slate-700 hover:border-indigo-300 hover:shadow'}`}
          >
            <span className="text-2xl">{c.icon}</span>
            <span>{c.title}{c.soon && <span className="block text-[10px] font-normal">به‌زودی</span>}</span>
          </button>
        ))}
      </div>

      {/* نوار فیلتر */}
      {!card?.soon && (
        <div className="bg-white border border-slate-300 rounded-xl p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {opts.universities.length > 1 && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">دانشگاه:</span>
                <select value={universityId} onChange={e => setUniversityId(Number(e.target.value))} className="bg-indigo-50 border border-indigo-300 rounded px-2 py-1.5 font-bold">
                  <option value={0}>همه</option>
                  {opts.universities.map(u => <option key={u.id} value={u.id}>{u.title}{u.kind === 'DISSOLVED' ? ' (منحله)' : ''}</option>)}
                </select>
              </label>
            )}
            {card?.needsTerm && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">ترم:</span>
                <select value={term} onChange={e => setTerm(e.target.value)} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" dir="ltr">
                  {opts.terms.map(t => <option key={t.code} value={t.code}>{t.code}</option>)}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1">
              <span className="font-bold text-slate-600">مقطع:</span>
              <select value={degreeId} onChange={e => setDegreeId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-44">
                <option value={0}>همه</option>
                {opts.degrees.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
            {(kind === 'by-major' || kind === 'active-term' || kind === 'top' || kind === 'third-attempt' || NEW_KINDS.has(kind)) && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">دانشکده:</span>
                <select value={facultyId} onChange={e => setFacultyId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-44">
                  <option value={0}>همه</option>
                  {opts.faculties.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1">
              <span className="font-bold text-slate-600">گروه آموزشی:</span>
              <select value={departmentId} onChange={e => setDepartmentId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-44">
                <option value={0}>همه</option>
                {opts.departments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            {(kind === 'top' || kind === 'graduates' || kind === 'entries' || kind === 'third-attempt' || NEW_KINDS.has(kind)) && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">رشته:</span>
                <select value={majorId} onChange={e => setMajorId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-52">
                  <option value={0}>همه</option>
                  {opts.majors.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            )}
            {(kind === 'entries' || kind === 'graduates' || kind === 'top' || NEW_KINDS.has(kind)) && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">ورودی:</span>
                <select value={entryYear} onChange={e => setEntryYear(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" dir="ltr">
                  <option value={0}>همه</option>
                  {opts.entryYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1">
              <span className="font-bold text-slate-600">کد ملی:</span>
              <input
                value={nationalCode} onChange={e => setNationalCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && run(1)}
                placeholder="کد ملی..."
                className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 w-36 font-mono" dir="ltr"
              />
            </label>
            {kind === 'incomplete' && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">نقص:</span>
                <select value={miss} onChange={e => setMiss(e.target.value)} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5">
                  <option value="national">کد ملی نامعتبر/خالی</option>
                  <option value="mobile">موبایل خالی</option>
                  <option value="major">بدون رشته</option>
                </select>
              </label>
            )}
            {(card?.customs ?? []).map(c => (
              <label key={c.key} className="flex items-center gap-1">
                <span className="font-bold text-slate-600">{c.title}:</span>
                <input
                  value={extra[c.key] ?? ''}
                  onChange={e => setExtra({ ...extra, [c.key]: e.target.value })}
                  className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 w-28"
                />
              </label>
            ))}
            <input
              value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run(1)}
              placeholder="🔍 شماره/نام/کد ملی..."
              className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 w-48"
            />
            <button onClick={() => run(1)} disabled={loading} className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded disabled:opacity-50">
              {loading ? '⏳ در حال اجرا...' : '▶ اجرای گزارش'}
            </button>
            {res && res.rows.length > 0 && (
              <button onClick={doExport} disabled={exporting} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded disabled:opacity-50 mr-auto">
                {exporting ? '⏳...' : '📥 خروجی Excel (CSV)'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* پیوند به صفحات تخصصی — جمع‌شونده در انتها تا مسیر اجرا→نتیجه تمیز بماند */}
      {/* نتیجه */}
      <div id="report-result" className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden scroll-mt-4">
        {err ? (
          <p className="p-8 text-center text-rose-700 bg-rose-50 text-sm font-bold">خطا: {err}</p>
        ) : !res ? (
          <p className="p-8 text-center text-slate-500 text-sm">
            گزارش «{card?.title}» را انتخاب و <b>اجرای گزارش</b> را بزنید.
          </p>
        ) : res.rows.length === 0 ? (
          <p className="p-8 text-center text-amber-700 bg-amber-50 text-sm">رکوردی با این فیلترها یافت نشد.</p>
        ) : (
          <>
            {res.summary && <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">{res.summary}</div>}
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700 sticky top-0">
                  <tr>
                    {res.columns.map(c => <th key={c.key} className="p-2 whitespace-nowrap">{c.title}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-200 hover:bg-slate-50">
                      {res.columns.map(c => (
                        <td key={c.key} className="p-2 whitespace-nowrap font-mono" dir={/^[0-9]/.test(String(r[c.key] ?? '')) ? 'ltr' : 'auto'}>
                          {String(r[c.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {res.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-3 text-xs border-t border-slate-200">
                <button disabled={res.page <= 1} onClick={() => runReport(kind, { ...filters, page: res.page - 1 }).then(setRes)} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold disabled:opacity-40">قبلی ▶</button>
                <span className="font-bold">صفحه {res.page.toLocaleString('fa-IR')} از {res.totalPages.toLocaleString('fa-IR')} ({res.total.toLocaleString('fa-IR')} رکورد)</span>
                <button disabled={res.page >= res.totalPages} onClick={() => runReport(kind, { ...filters, page: res.page + 1 }).then(setRes)} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold disabled:opacity-40">◀ بعدی</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* پیوند به صفحات تخصصی — جمع‌شونده در انتهای صفحه */}
      <div className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowLinks(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
        >
          <span>🔗 پیوندهای سریع به میزهای تخصصی ({LINK_CARDS.length})</span>
          <span>{showLinks ? '▲ بستن' : '▼ نمایش'}</span>
        </button>
        {showLinks && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3 pt-0">
            {LINK_CARDS.map(l => (
              <a key={l.kind} href={l.href} className="flex items-center gap-2 p-3 rounded-lg border-2 text-right font-bold text-[13px] bg-white border-slate-300 hover:border-indigo-300 hover:shadow">
                <span className="text-2xl">{l.icon}</span><span>{l.title}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
