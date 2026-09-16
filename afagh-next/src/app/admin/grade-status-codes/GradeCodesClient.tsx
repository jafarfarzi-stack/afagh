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

type BankCourse = {
  id: number; code: string; title: string; theoreticalUnits: string; practicalUnits: string;
  units: string; courseType: string | null; gradingType: string | null; affectsGpa: number | null;
  departmentId: number | null; departmentName: string | null;
  degreeLevelId: number | null; degreeLevelTitle: string | null;
  clusterId: number | null; clusterTitle: string | null;
  offeringScope: string | null; locationType: string | null;
  courseNature: string | null; englishName: string | null; description: string | null;
  weeklyTheoryHours: string | null; weeklyPracticalHours: string | null;
  isThesis: number | null; hasProject: number | null; internshipUnits: string | null;
  minPassedMark: string | null; defaultAcceptMarkState: string | null; defaultRejectMarkState: string | null;
};

type Department = { id: number; name: string };
type DegreeLevel = { id: number; title: string };
type Cluster = { id: number; clusterTitle: string };

const COURSE_TYPES = ['عمومی', 'پایه', 'تخصصی', 'اختیاری'];
const COURSE_NATURES = ['نظری', 'عملی', 'نظری-عملی', 'کارگاهی', 'کارآموزی', 'پروژه', 'پایان‌نامه', 'رساله', 'معرفی به استاد', 'خودخوان'];
const OFFERING_SCOPES = [
  { value: 'DEPARTMENTAL', label: 'گروهی (DEPARTMENTAL)' },
  { value: 'GENERAL_SERVICE', label: 'خدماتی (GENERAL_SERVICE)' },
];
const LOCATION_TYPES = [
  { value: 'IN_CAMPUS', label: 'داخل دانشگاه' },
  { value: 'OUT_CAMPUS', label: 'خارج دانشگاه' },
];

export default function GradeCodesClient() {
  const [tab, setTab] = useState<'bank' | 'grade'>('bank');

  // ─── بانک دروس ───
  const [bankCourses, setBankCourses] = useState<BankCourse[]>([]);
  const [bankQ, setBankQ] = useState('');
  const [bankLoading, setBankLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [degreeLevels, setDegreeLevels] = useState<DegreeLevel[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<BankCourse | null>(null);
  const [bankMsg, setBankMsg] = useState('');
  const [bankSaving, setBankSaving] = useState(false);

  // ─── کدهای وضعیت نمره ───
  const [majors, setMajors] = useState<Major[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedMajor, setSelectedMajor] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [q, setQ] = useState('');

  // ─── بارگذاری اولیه ───
  const loadBank = useCallback(async (search?: string) => {
    setBankLoading(true);
    try {
      const r = await fetch(`/api/admin/curriculum/bank?q=${encodeURIComponent(search || '')}`);
      const d = await r.json();
      setBankCourses(d.courses ?? []);
    } catch { setBankCourses([]); }
    setBankLoading(false);
  }, []);

  useEffect(() => {
    loadBank();
    fetch('/api/admin/curriculum/departments').then(r => r.json()).then(d => setDepartments(d.departments ?? [])).catch(() => {});
    fetch('/api/admin/curriculum/degree-levels').then(r => r.json()).then(d => setDegreeLevels(d.degreeLevels ?? [])).catch(() => {});
    fetch('/api/admin/curriculum/clusters').then(r => r.json()).then(d => setClusters(d.clusters ?? [])).catch(() => {});
  }, [loadBank]);

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

  useEffect(() => {
    const t = setTimeout(() => loadBank(bankQ), 300);
    return () => clearTimeout(t);
  }, [bankQ, loadBank]);

  // ─── ذخیره درس (ایجاد/ویرایش) ───
  const saveCourse = async (fd: FormData) => {
    setBankSaving(true);
    setBankMsg('');
    try {
      const payload: Record<string, unknown> = {
        code: String(fd.get('code') || '').trim(),
        title: String(fd.get('title') || '').trim(),
        theoreticalUnits: Number(fd.get('theoreticalUnits') || 0),
        practicalUnits: Number(fd.get('practicalUnits') || 0),
        courseType: String(fd.get('courseType') || 'تخصصی'),
        gradingType: String(fd.get('gradingType') || 'NUMERIC'),
        affectsGpa: fd.get('affectsGpa') === 'on' ? 1 : 0,
        departmentId: Number(fd.get('departmentId') || 0) || null,
        degreeLevelId: Number(fd.get('degreeLevelId') || 0) || null,
        clusterId: Number(fd.get('clusterId') || 0) || null,
        offeringScope: String(fd.get('offeringScope') || 'DEPARTMENTAL'),
        locationType: String(fd.get('locationType') || 'IN_CAMPUS'),
        courseNature: String(fd.get('courseNature') || '') || null,
        englishName: String(fd.get('englishName') || '') || null,
        description: String(fd.get('description') || '') || null,
        weeklyTheoryHours: Number(fd.get('weeklyTheoryHours') || 0) || null,
        weeklyPracticalHours: Number(fd.get('weeklyPracticalHours') || 0) || null,
        isThesis: fd.get('isThesis') === 'on' ? 1 : 0,
        hasProject: fd.get('hasProject') === 'on' ? 1 : 0,
        internshipUnits: Number(fd.get('internshipUnits') || 0) || 0,
        minPassedMark: Number(fd.get('minPassedMark') || 0) || null,
        defaultAcceptMarkState: String(fd.get('defaultAcceptMarkState') || '') || null,
        defaultRejectMarkState: String(fd.get('defaultRejectMarkState') || '') || null,
      };

      const isEdit = !!editingCourse;
      let url = '/api/admin/curriculum/bank';
      if (isEdit) url += `?id=${editingCourse!.id}`;

      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.ok) {
        setBankMsg(isEdit ? 'ویرایش شد' : `درس «${payload.title}» تعریف شد`);
        setModalOpen(false);
        setEditingCourse(null);
        loadBank(bankQ);
      } else {
        setBankMsg(d.error || 'خطا در ذخیره');
      }
    } catch {
      setBankMsg('خطا در ارتباط با سرور');
    }
    setBankSaving(false);
    setTimeout(() => setBankMsg(''), 3000);
  };

  // ─── ویرایش کد وضعیت نمره ───
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

  const openNewCourse = () => { setEditingCourse(null); setModalOpen(true); };
  const openEditCourse = (c: BankCourse) => { setEditingCourse(c); setModalOpen(true); };

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-6 space-y-5" dir="rtl">
      {/* هدر */}
      <div className="bg-gradient-to-l from-amber-900 to-orange-900 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏷️</span>
          <div>
            <h1 className="text-lg font-extrabold">مدیریت دروس و کدهای وضعیت نمره</h1>
            <p className="text-xs text-amber-200 mt-0.5">تعریف، ویرایش و کدگذاری وضعیت نمره دروس بانک و چارت</p>
          </div>
        </div>
      </div>

      {/* تب‌ها */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button onClick={() => setTab('bank')} className={`flex-1 px-4 py-3 text-sm font-extrabold transition-colors ${tab === 'bank' ? 'bg-amber-50 text-amber-900 border-b-2 border-amber-600' : 'text-slate-500 hover:bg-slate-50'}`}>
            📘 بانک دروس
          </button>
          <button onClick={() => setTab('grade')} className={`flex-1 px-4 py-3 text-sm font-extrabold transition-colors ${tab === 'grade' ? 'bg-amber-50 text-amber-900 border-b-2 border-amber-600' : 'text-slate-500 hover:bg-slate-50'}`}>
            🏷️ کدهای وضعیت نمره در چارت
          </button>
        </div>

        {/* ═══ تب بانک دروس ═══ */}
        {tab === 'bank' && (
          <div className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-600 mb-1">جستجوی درس</label>
                <input value={bankQ} onChange={e => setBankQ(e.target.value)} placeholder="کد یا عنوان درس..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" />
              </div>
              <button onClick={openNewCourse} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap">
                + تعریف درس جدید
              </button>
            </div>

            {bankMsg && (
              <div className={`text-xs p-2 rounded font-bold ${bankMsg.includes('خطا') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
                {bankMsg}
              </div>
            )}

            <div className="overflow-x-auto">
              {bankLoading && <div className="p-4 text-center text-xs text-slate-400 font-bold">بارگذاری...</div>}
              {!bankLoading && bankCourses.length === 0 && <div className="p-6 text-center text-xs text-slate-400 font-bold">درسی یافت نشد.</div>}
              {!bankLoading && bankCourses.length > 0 && (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white text-center">
                      <th className="p-2 border border-slate-800 w-10">ردیف</th>
                      <th className="p-2 border border-slate-800">کد</th>
                      <th className="p-2 border border-slate-800">عنوان درس</th>
                      <th className="p-2 border border-slate-800">واحد</th>
                      <th className="p-2 border border-slate-800">ن-نظری</th>
                      <th className="p-2 border border-slate-800">ن-عملی</th>
                      <th className="p-2 border border-slate-800">ماهیت</th>
                      <th className="p-2 border border-slate-800">نوع</th>
                      <th className="p-2 border border-slate-800">گروه</th>
                      <th className="p-2 border border-slate-800">مقطع</th>
                      <th className="p-2 border border-slate-800">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankCourses.map((c, idx) => (
                      <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td className="p-1.5 border border-slate-200 text-center text-slate-500">{idx + 1}</td>
                        <td className="p-1.5 border border-slate-200 font-mono text-center font-bold text-indigo-900">{c.code}</td>
                        <td className="p-1.5 border border-slate-200 font-extrabold text-right">{c.title}</td>
                        <td className="p-1.5 border border-slate-200 text-center font-black">{c.units}</td>
                        <td className="p-1.5 border border-slate-200 text-center">{c.theoreticalUnits}</td>
                        <td className="p-1.5 border border-slate-200 text-center">{c.practicalUnits}</td>
                        <td className="p-1.5 border border-slate-200 text-center text-[10px]">{c.courseNature || '—'}</td>
                        <td className="p-1.5 border border-slate-200 text-center text-[10px]">{c.courseType || '—'}</td>
                        <td className="p-1.5 border border-slate-200 text-center text-[10px]">{c.departmentName || '—'}</td>
                        <td className="p-1.5 border border-slate-200 text-center text-[10px]">{c.degreeLevelTitle || '—'}</td>
                        <td className="p-1.5 border border-slate-200 text-center">
                          <button onClick={() => openEditCourse(c)} className="text-indigo-600 hover:underline font-bold">ویرایش</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ═══ تب کدهای وضعیت نمره ═══ */}
        {tab === 'grade' && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">رشته / گروه آموزشی</label>
                <select value={selectedMajor ?? ''} onChange={e => { setSelectedMajor(Number(e.target.value) || null); setSelectedVersion(null); }} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                  <option value="">انتخاب رشته...</option>
                  {majors.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">نسخه برنامه درسی</label>
                <select value={selectedVersion ?? ''} onChange={e => setSelectedVersion(Number(e.target.value) || null)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" disabled={!selectedMajor}>
                  <option value="">انتخاب نسخه...</option>
                  {versions.map(v => <option key={v.id} value={v.id}>{v.versionCode} — {v.title} ({v.status})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">جستجوی درس</label>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="کد یا عنوان درس..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" disabled={!selectedVersion} />
              </div>
            </div>

            {selectedVersion && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-900 text-sm">📖 دروس نسخه ({filtered.length} درس)</h3>
                  {loading && <span className="text-xs text-slate-400 font-bold">بارگذاری...</span>}
                </div>
                {filtered.length === 0 && !loading && <div className="p-6 text-center text-xs text-slate-400 font-bold">درسی یافت نشد.</div>}
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
                              <select value={c.passGradeStatusCode ?? ''} onChange={e => updateCode(c.courseId, 'passGradeStatusCode', e.target.value)} disabled={saving === c.courseId} className="border border-slate-300 rounded px-1.5 py-1 text-[11px] font-bold bg-white max-w-[180px] disabled:opacity-50" title={gradeStatusTitleOf(c.passGradeStatusCode) ?? 'پیش‌فرض: 1'}>
                                <option value="">پیش‌فرض (1)</option>
                                {GRADE_STATUS_CODES.filter(g => g.passed).map(g => <option key={g.code} value={g.code}>{gradeStatusOptionLabel(g)}</option>)}
                              </select>
                            </td>
                            <td className="p-2 border border-slate-200 text-center">
                              <select value={c.failGradeStatusCode ?? ''} onChange={e => updateCode(c.courseId, 'failGradeStatusCode', e.target.value)} disabled={saving === c.courseId} className="border border-slate-300 rounded px-1.5 py-1 text-[11px] font-bold bg-white max-w-[180px] disabled:opacity-50" title={gradeStatusTitleOf(c.failGradeStatusCode) ?? 'پیش‌فرض: 2'}>
                                <option value="">پیش‌فرض (2)</option>
                                {GRADE_STATUS_CODES.filter(g => !g.passed).map(g => <option key={g.code} value={g.code}>{gradeStatusOptionLabel(g)}</option>)}
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

            <div className="rounded-xl bg-amber-50/80 p-3.5 text-xs text-amber-900 border border-amber-200">
              💡 <b>راهنما:</b> کد قبولی و مردودی هر درس را از لیست کشویی انتخاب کنید. تغییرات فوراً ذخیره می‌شوند.
            </div>
          </div>
        )}
      </div>

      {/* ═══ مودال تعریف/ویرایش درس ═══ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="font-extrabold text-slate-900">
                {editingCourse ? `✏️ ویرایش درس: ${editingCourse.code}` : '📘 تعریف درس جدید'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>
            </div>
            <form action={saveCourse} className="p-6 space-y-5">
              <input type="hidden" name="id" value={editingCourse?.id ?? ''} />

              {/* ردیف ۱: کد + عنوان */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">کد درس *</label>
                  <input name="code" required defaultValue={editingCourse?.code ?? ''} placeholder="مثلاً 10001" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" disabled={!!editingCourse} />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-bold text-slate-600 mb-1">عنوان درس *</label>
                  <input name="title" required defaultValue={editingCourse?.title ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" />
                </div>
              </div>

              {/* ردیف ۲: واحدها */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">واحد نظری *</label>
                  <input name="theoreticalUnits" type="number" step="0.5" min="0" defaultValue={editingCourse?.theoreticalUnits ?? '0'} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">واحد عملی</label>
                  <input name="practicalUnits" type="number" step="0.5" min="0" defaultValue={editingCourse?.practicalUnits ?? '0'} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">ساعت هفتگی نظری</label>
                  <input name="weeklyTheoryHours" type="number" step="0.5" min="0" defaultValue={editingCourse?.weeklyTheoryHours ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">ساعت هفتگی عملی</label>
                  <input name="weeklyPracticalHours" type="number" step="0.5" min="0" defaultValue={editingCourse?.weeklyPracticalHours ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" />
                </div>
              </div>

              {/* ردیف ۳: نوع + ماهیت + گروه + مقطع */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">نوع درس</label>
                  <select name="courseType" defaultValue={editingCourse?.courseType ?? 'تخصصی'} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                    {COURSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">ماهیت درس</label>
                  <select name="courseNature" defaultValue={editingCourse?.courseNature ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                    <option value="">انتخاب...</option>
                    {COURSE_NATURES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">گروه آموزشی</label>
                  <select name="departmentId" defaultValue={editingCourse?.departmentId ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                    <option value="">بدون گروه</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">مقطع</label>
                  <select name="degreeLevelId" defaultValue={editingCourse?.degreeLevelId ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                    <option value="">همه مقاطع</option>
                    {degreeLevels.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                </div>
              </div>

              {/* ردیف ۴: scope + location + خوشه + وضعیت نمره */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">نحوه ارائه</label>
                  <select name="offeringScope" defaultValue={editingCourse?.offeringScope ?? 'DEPARTMENTAL'} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                    {OFFERING_SCOPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">محل ارائه</label>
                  <select name="locationType" defaultValue={editingCourse?.locationType ?? 'IN_CAMPUS'} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                    {LOCATION_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">خوشه هم‌ارزی</label>
                  <select name="clusterId" defaultValue={editingCourse?.clusterId ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                    <option value="">بدون خوشه</option>
                    {clusters.map(c => <option key={c.id} value={c.id}>{c.clusterTitle}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">وضعیت نمره</label>
                  <select name="gradingType" defaultValue={editingCourse?.gradingType ?? 'NUMERIC'} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                    <option value="NUMERIC">نمره‌ای (NUMERIC)</option>
                    <option value="PASS_FAIL">قبول/مردود (PASS_FAIL)</option>
                  </select>
                </div>
              </div>

              {/* ردیف ۵: کدهای وضعیت + حداقل نمره */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">کد وضعیت قبولی (سما)</label>
                  <select name="defaultAcceptMarkState" defaultValue={editingCourse?.defaultAcceptMarkState ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                    <option value="">پیش‌فرض (1)</option>
                    {GRADE_STATUS_CODES.filter(g => g.passed).map(g => <option key={g.code} value={g.code}>{gradeStatusOptionLabel(g)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">کد وضعیت مردودی (سما)</label>
                  <select name="defaultRejectMarkState" defaultValue={editingCourse?.defaultRejectMarkState ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white">
                    <option value="">پیش‌فرض (2)</option>
                    {GRADE_STATUS_CODES.filter(g => !g.passed).map(g => <option key={g.code} value={g.code}>{gradeStatusOptionLabel(g)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">حداقل نمره قبولی</label>
                  <input name="minPassedMark" type="number" step="0.25" min="0" max="20" defaultValue={editingCourse?.minPassedMark ?? ''} placeholder="پیش‌فرض مقطع" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" />
                </div>
              </div>

              {/* ردیف ۶: نام انگلیسی + کارآموزی + چک‌باکس‌ها */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">نام انگلیسی درس</label>
                  <input name="englishName" defaultValue={editingCourse?.englishName ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">واحد کارآموزی</label>
                  <input name="internshipUnits" type="number" step="0.5" min="0" defaultValue={editingCourse?.internshipUnits ?? '0'} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white" />
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <input type="checkbox" name="affectsGpa" defaultChecked={editingCourse ? editingCourse.affectsGpa === 1 : true} className="w-4 h-4 accent-amber-600" /> تاثیر در معدل
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <input type="checkbox" name="isThesis" defaultChecked={editingCourse?.isThesis === 1} className="w-4 h-4 accent-amber-600" /> پایان‌نامه
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <input type="checkbox" name="hasProject" defaultChecked={editingCourse?.hasProject === 1} className="w-4 h-4 accent-amber-600" /> پروژه
                  </label>
                </div>
              </div>

              {/* ردیف ۷: توضیحات */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">توضیحات درس</label>
                <textarea name="description" rows={2} defaultValue={editingCourse?.description ?? ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white resize-none" />
              </div>

              {/* دکمه‌ها */}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button type="submit" disabled={bankSaving} className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
                  {bankSaving ? 'در حال ذخیره...' : editingCourse ? 'ذخیره تغییرات' : 'ذخیره درس'}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="border border-slate-300 px-5 py-2.5 rounded-lg text-sm font-bold">انصراف</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
