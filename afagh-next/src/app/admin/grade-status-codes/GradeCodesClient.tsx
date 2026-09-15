'use client';

import { useEffect, useState, useCallback } from 'react';
import { GRADE_STATUS_CODES, gradeStatusOptionLabel, gradeStatusTitleOf } from '@/lib/grade-status-codes';

type Major = { id: number; code: string; name: string };
type Version = { id: number; versionCode: string; title: string; status: string; majorId: number; entryYearFrom: number; entryYearTo: number | null };
type Course = {
  courseId: number; code: string; title: string; units: number;
  passGradeStatusCode: string | null; failGradeStatusCode: string | null;
  roleType: string; recommendedSemester: number | null;
};

export default function GradeCodesClient() {
  const [majors, setMajors] = useState<Major[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedMajor, setSelectedMajor] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/admin/curriculum/majors').then(r => r.json()).then(d => setMajors(d.majors ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedMajor) { setVersions([]); return; }
    fetch(`/api/admin/curriculum/versions?majorId=${selectedMajor}`).then(r => r.json()).then(d => setVersions(d.versions ?? [])).catch(() => {});
  }, [selectedMajor]);

  const loadCourses = useCallback(async (versionId: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/curriculum/courses?versionId=${versionId}`);
      const d = await r.json();
      setCourses(d.courses ?? []);
    } catch { setCourses([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedVersion) loadCourses(selectedVersion);
    else setCourses([]);
  }, [selectedVersion, loadCourses]);

  const updateCode = async (courseId: number, field: 'passGradeStatusCode' | 'failGradeStatusCode', value: string | null) => {
    if (!selectedVersion) return;
    setSaving(courseId);
    try {
      const otherField = field === 'passGradeStatusCode' ? 'failGradeStatusCode' : 'passGradeStatusCode';
      const course = courses.find(c => c.courseId === courseId);
      const payload: Record<string, string | null> = { [field]: value || null, [otherField]: course?.[otherField] ?? null };
      const r = await fetch(`/api/admin/curriculum/grade-codes?versionId=${selectedVersion}&courseId=${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.ok) {
        setCourses(prev => prev.map(c => c.courseId === courseId ? { ...c, [field]: value || null } : c));
        setToast('ذخیره شد');
        setTimeout(() => setToast(''), 2000);
      } else {
        setToast(d.error || 'خطا در ذخیره');
        setTimeout(() => setToast(''), 3000);
      }
    } catch {
      setToast('خطا در ارتباط با سرور');
      setTimeout(() => setToast(''), 3000);
    }
    setSaving(null);
  };

  const filtered = courses.filter(c => {
    if (!q.trim()) return true;
    const t = q.trim();
    return c.code.includes(t) || c.title.includes(t);
  });

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-6 space-y-5" dir="rtl">
      {/* هدر */}
      <div className="bg-gradient-to-l from-amber-900 to-orange-900 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏷️</span>
          <div>
            <h1 className="text-lg font-extrabold">ویرایش کدهای وضعیت نمره دروس</h1>
            <p className="text-xs text-amber-200 mt-0.5">کد قبولی/مردودی هر درس در هر نسخه برنامه درسی — معادل «ویرایش اطلاعات دروس» سما</p>
          </div>
        </div>
      </div>

      {/* فیلترها */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">رشته / گروه آموزشی</label>
            <select
              value={selectedMajor ?? ''}
              onChange={e => { setSelectedMajor(Number(e.target.value) || null); setSelectedVersion(null); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white"
            >
              <option value="">انتخاب رشته...</option>
              {majors.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">نسخه برنامه درسی</label>
            <select
              value={selectedVersion ?? ''}
              onChange={e => setSelectedVersion(Number(e.target.value) || null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white"
              disabled={!selectedMajor}
            >
              <option value="">انتخاب نسخه...</option>
              {versions.map(v => <option key={v.id} value={v.id}>{v.versionCode} — {v.title} ({v.status})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">جستجوی درس</label>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="کد یا عنوان درس..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white"
              disabled={!selectedVersion}
            />
          </div>
        </div>
      </div>

      {/* جدول دروس */}
      {selectedVersion && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-slate-900 text-sm">
              📖 دروس نسخه ({filtered.length} درس)
            </h3>
            {loading && <span className="text-xs text-slate-400 font-bold">بارگذاری...</span>}
          </div>

          {filtered.length === 0 && !loading && (
            <div className="p-6 text-center text-xs text-slate-400 font-bold">درسی یافت نشد.</div>
          )}

          {filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-center">
                    <th className="p-2.5 border border-slate-800 w-10">ردیف</th>
                    <th className="p-2.5 border border-slate-800">کد درس</th>
                    <th className="p-2.5 border border-slate-800">عنوان درس</th>
                    <th className="p-2.5 border border-slate-800">واحد</th>
                    <th className="p-2.5 border border-slate-800">ترم</th>
                    <th className="p-2.5 border border-slate-800" title="کد وضعیت سما هنگام قبولی">کد قبولی</th>
                    <th className="p-2.5 border border-slate-800" title="کد وضعیت سما هنگام مردودی">کد مردودی</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, idx) => (
                    <tr key={c.courseId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      <td className="p-2 border border-slate-200 text-center text-slate-500 font-bold">{idx + 1}</td>
                      <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{c.code}</td>
                      <td className="p-2 border border-slate-200 font-extrabold text-right">{c.title}</td>
                      <td className="p-2 border border-slate-200 text-center font-black">{c.units}</td>
                      <td className="p-2 border border-slate-200 text-center font-bold">{c.recommendedSemester ?? '—'}</td>
                      <td className="p-2 border border-slate-200 text-center">
                        <select
                          value={c.passGradeStatusCode ?? ''}
                          onChange={e => updateCode(c.courseId, 'passGradeStatusCode', e.target.value)}
                          disabled={saving === c.courseId}
                          className="border border-slate-300 rounded px-1.5 py-1 text-[11px] font-bold bg-white max-w-[180px] disabled:opacity-50"
                          title={gradeStatusTitleOf(c.passGradeStatusCode) ?? 'پیش‌فرض: 1 (قبول عادی)'}
                        >
                          <option value="">پیش‌فرض (1)</option>
                          {GRADE_STATUS_CODES.filter(g => g.passed).map(g => (
                            <option key={g.code} value={g.code}>{gradeStatusOptionLabel(g)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 border border-slate-200 text-center">
                        <select
                          value={c.failGradeStatusCode ?? ''}
                          onChange={e => updateCode(c.courseId, 'failGradeStatusCode', e.target.value)}
                          disabled={saving === c.courseId}
                          className="border border-slate-300 rounded px-1.5 py-1 text-[11px] font-bold bg-white max-w-[180px] disabled:opacity-50"
                          title={gradeStatusTitleOf(c.failGradeStatusCode) ?? 'پیش‌فرض: 2 (مردود عادی)'}
                        >
                          <option value="">پیش‌فرض (2)</option>
                          {GRADE_STATUS_CODES.filter(g => !g.passed).map(g => (
                            <option key={g.code} value={g.code}>{gradeStatusOptionLabel(g)}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* راهنما */}
      <div className="rounded-xl bg-amber-50/80 p-3.5 text-xs text-amber-900 border border-amber-200">
        💡 <b>راهنما:</b> کد قبولی و مردودی هر درس را از لیست کشویی انتخاب کنید. تغییرات فوراً ذخیره می‌شوند.
        کد <b>1</b> = قبول عادی (موثر در معدل)، کد <b>12</b> = جبرانی (بدون احتساب در معدل)، کد <b>11</b> = جبرانی (با احتساب در معدل).
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
