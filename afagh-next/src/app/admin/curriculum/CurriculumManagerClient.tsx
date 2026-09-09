'use client';

// ════════════════════════════════════════════════════════════════════════
// فاز ۷ — Thin Client برنامهٔ درسی
// ────────────────────────────────────────────────────────────────────────
// قانون طلایی (توافق): هیچ دادهٔ Mock در این فایل نیست. همهچیز از
// Server Actions دامنه خوانده می‌شود؛ هر تغییر = یک اکشن گارددار با تراکنش
// و زنجیرهٔ حسابرسی. UI فقط «نمایش وضعیت واقعی» و «فراخوانی اکشن» است.
// ════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getCurriculumOverviewAction, getCurriculumVersionDetailAction, listCourseBankAction,
  listDepartmentsAction, createCourseBankAction, setCoursePrerequisiteAction, setCourseCorequisiteAction,
  setCoursePassingGradeAction,
  createCurriculumVersionAction, addCourseToCurriculumAction, bulkAddCoursesAction,
  removeCourseFromCurriculumAction, updateCourseInCurriculumAction, updateCurriculumMetaAction,
  assignCourseToSemesterAction, validateCurriculumAction,
  submitCurriculumForApprovalAction, approveCurriculumAction, rejectCurriculumAction,
  publishCurriculumAction, archiveCurriculumAction, createCurriculumRevisionAction,
} from './actions';
import { describeLogicNode, type LogicNode } from '@/lib/curriculum-types';

// ─────────────────────────── Types ───────────────────────────

export interface MajorItem {
  id: number;
  code: string;
  name: string;
  degreeLevelId: number | null;
  degreeTitle: string | null;
  /** غنی‌سازی صفحهٔ سرور (ادغام فاز ۷الف): دانشکده/گروه/واحد الزامی/گرایش‌ها */
  departmentName?: string;
  facultyName?: string;
  minUnits?: number;
  tracks?: string[];
}

export interface VersionRow {
  id: number;
  majorId: number;
  degreeLevelId: number;
  trackId: number | null;
  versionCode: string;
  title: string;
  status: string;
  entryYearFrom: number;
  entryYearTo: number | null;
  totalRequiredUnits: string;
  courseCount: number;
}

export interface CurriculumWorkspace {
  majors: MajorItem[];
  versions: VersionRow[];
  tracks: { id: number; code: string | null; title: string }[];
}

interface CourseRow {
  courseId: number;
  code: string;
  title: string;
  units: number;
  roleType: string;
  isRequired: number;
  isElective: number;
  isGraduationRequired: number;
  recommendedSemester: number | null;
  minGrade: number | null;
}

interface RuleRow { courseId: number; ruleType: string; logicTree: LogicNode; }
interface ApprovalRow {
  id: number; approvalType: string; fromStatus: string; toStatus: string;
  decisionNote: string | null; approvedAt: Date | string | null;
}
interface CheckRow { check: string; severity: 'ERROR' | 'WARN'; message: string; affected: (string | number)[]; }

interface VersionDetail {
  version: VersionRow & { maxUnitsPerTerm: number | null };
  courses: CourseRow[];
  rules: RuleRow[];
  approvals: ApprovalRow[];
  checks: CheckRow[];
}

interface BankCourse { id: number; code: string; title: string; units: string; courseType: string; }

// ─────────────────────────── ثابت‌های نمایشی ───────────────────────────

const faNum = (n: any) => (n === null || n === undefined || n === '' ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'پیش‌نویس', cls: 'bg-slate-200 text-slate-800' },
  REVIEW: { label: 'در بازبینی', cls: 'bg-amber-200 text-amber-900' },
  APPROVED: { label: 'تأییدشده', cls: 'bg-blue-200 text-blue-900' },
  PUBLISHED: { label: 'منتشرشده', cls: 'bg-emerald-200 text-emerald-900' },
  ARCHIVED: { label: 'بایگانی‌شده', cls: 'bg-rose-200 text-rose-900' },
};

const ROLE_LABELS: Record<string, string> = {
  CORE: 'پایه', MAJOR: 'اصلی', ELECTIVE: 'اختیاری', GENERAL: 'عمومی',
  THESIS: 'پایان‌نامه', INTERNSHIP: 'کارآموزی', WORKSHOP: 'کارگاه',
};

// نگاشت نوع درس بانک → نقش کاتالوگ (پیش‌فرض هر ردیف؛ قابل تغییر تکی)
const BANK_TYPE_TO_ROLE: Record<string, string> = {
  'عمومی': 'GENERAL', 'پایه': 'CORE', 'تخصصی': 'MAJOR', 'اصلی': 'MAJOR',
  'اختیاری': 'ELECTIVE', 'جبرانی': 'ELECTIVE',
};
const roleFromBankType = (t: string | null | undefined) => BANK_TYPE_TO_ROLE[(t ?? '').trim()] ?? 'CORE';

type CurriculumTab = 'CATALOG' | 'COURSES' | 'SEMESTERS' | 'VERIFY' | 'TRANSFER';

const TABS: { key: CurriculumTab; icon: string; label: string }[] = [
  { key: 'CATALOG', icon: '🗂️', label: 'تعریف کاتالوگ رشته' },
  { key: 'COURSES', icon: '📖', label: 'دروس کاتالوگ' },
  { key: 'SEMESTERS', icon: '📅', label: 'ترم‌بندی چارت' },
  { key: 'VERIFY', icon: '🧪', label: 'بررسی و خاتمه' },
  { key: 'TRANSFER', icon: '🔄', label: 'انتقال کاتالوگ' },
];

const faDate = (d: Date | string | null | undefined) => {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(dt);
};

// ─────────────────────────── کامپوننت ───────────────────────────

export default function CurriculumManagerClient({ initial }: { initial: CurriculumWorkspace }) {
  const [majors, setMajors] = useState<MajorItem[]>(initial.majors);
  const [versions, setVersions] = useState<VersionRow[]>(initial.versions);
  const [tracks] = useState(initial.tracks);
  const [selectedMajorId, setSelectedMajorId] = useState<number>(initial.majors[0]?.id ?? 0);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bank, setBank] = useState<BankCourse[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankQuery, setBankQuery] = useState('');
  const [codePrefix, setCodePrefix] = useState('');
  const [bankSelected, setBankSelected] = useState<Set<number>>(new Set());
  const [bankRoles, setBankRoles] = useState<Record<number, string>>({});
  const [bulkRoleType, setBulkRoleType] = useState('CORE');

  const [modal, setModal] = useState<null | 'NEW_VERSION' | 'ADD_COURSE' | 'NEW_COURSE' | 'RULES' | 'REJECT'>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // فرم‌ها
  const [newVersionForm, setNewVersionForm] = useState({
    versionCode: '', title: '', entryYearFrom: 1405, totalRequiredUnits: 140, maxUnitsPerTerm: 20, cloneFromId: '',
  });
  const [addCourseForm, setAddCourseForm] = useState({ courseId: '', roleType: 'CORE', recommendedSemester: '' });
  const [rejectNote, setRejectNote] = useState('');
  const [newCourseForm, setNewCourseForm] = useState({
    code: '', title: '', theo: 3, prac: 0, courseType: 'تخصصی', grading: 'NUMERIC', gpa: true, departmentId: '',
  });
  const [depts, setDepts] = useState<{ id: number; name: string }[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(false);
  const [ruleCourseId, setRuleCourseId] = useState<number | null>(null);
  const [ruleForm, setRuleForm] = useState({ pre: [] as string[], preOp: 'AND' as 'AND' | 'OR', co: [] as string[], coOp: 'AND' as 'AND' | 'OR', minGrade: '' });
  const [activeTab, setActiveTab] = useState<CurriculumTab>('CATALOG');
  const [transferMajorId, setTransferMajorId] = useState(0);
  const [facultyFilter, setFacultyFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4200);
  }, []);

  const selectedVersion = versions.find(v => v.id === selectedVersionId) ?? null;
  const majorVersions = versions.filter(v => v.majorId === selectedMajorId);

  const reloadOverview = useCallback(async () => {
    const w = await getCurriculumOverviewAction();
    if (!w.ok) { showToast(w.error, 'error'); return; }
    setMajors(w.data.majors.map(m => ({ ...m, code: m.code ?? String(m.id) })));
    setVersions(w.data.versions);
  }, []);

  const reloadDetail = useCallback(async (versionId: number) => {
    setDetailLoading(true);
    try {
      const r = await getCurriculumVersionDetailAction(versionId);
      if (!r.ok) { showToast(r.error, 'error'); return; }
      setDetail(r.data as unknown as VersionDetail);
    } finally {
      setDetailLoading(false);
    }
  }, [showToast]);

  // پاک‌سازی انتخاب بانک هنگام بستن مودال
  const closeAddCourse = () => {
    setModal(null);
    setBankQuery('');
    setCodePrefix('');
    setBankSelected(new Set());
    setBankRoles({});
  };

  // بارگذاری جزئیات با تغییر نسخهٔ انتخابی
  useEffect(() => {
    if (selectedVersionId == null) { setDetail(null); return; }
    reloadDetail(selectedVersionId);
  }, [selectedVersionId, reloadDetail]);

  // بانک دروس (هنگام نیاز برای افزودن)
  useEffect(() => {
    if (modal !== 'ADD_COURSE' || bank.length > 0 || bankLoading) return;
    setBankLoading(true);
    listCourseBankAction().then(r => {
      setBankLoading(false);
      if (r.ok) setBank(r.data);
      else showToast(r.error, 'error');
    });
  }, [modal, bank.length, bankLoading, showToast]);

  // گروه‌های آموزشی (هنگام نیاز برای تعریف درس جدید)
  useEffect(() => {
    if (modal !== 'NEW_COURSE' || depts.length > 0 || deptsLoading) return;
    setDeptsLoading(true);
    listDepartmentsAction().then(r => {
      setDeptsLoading(false);
      if (r.ok) setDepts(r.data);
      else showToast(r.error, 'error');
    });
  }, [modal, depts.length, deptsLoading, showToast]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = async (fn: () => Promise<any>, okText?: string) => {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) { showToast(res.error ?? 'عملیات ناموفق بود.', 'error'); return false; }
      showToast(okText ?? res.message ?? 'انجام شد.', 'success');
      return true;
    } finally {
      setBusy(false);
    }
  };

  // ── چرخهٔ حیات ──
  const handleValidate = async () => {
    if (selectedVersionId == null) return;
    setBusy(true);
    try {
      const r = await validateCurriculumAction(selectedVersionId);
      if (!r.ok) { showToast(r.error, 'error'); return; }
      showToast(`اعتبارسنجی کامل شد: ${r.data.checks.length} یافته (${r.data.checks.filter(c => c.severity === 'ERROR').length} مانع جدی).`, 'success');
    } finally {
      setBusy(false);
    }
    reloadDetail(selectedVersionId);
  };

  const handleSubmit = async (note: string) => {
    if (selectedVersionId == null) return;
    const ok = await run(() => submitCurriculumForApprovalAction(selectedVersionId, note));
    if (ok) { reloadOverview(); reloadDetail(selectedVersionId); }
  };

  const handleApprove = async (note: string) => {
    if (selectedVersionId == null) return;
    const ok = await run(() => approveCurriculumAction(selectedVersionId, note));
    if (ok) { reloadOverview(); reloadDetail(selectedVersionId); }
  };

  const handleReject = async (note: string) => {
    if (selectedVersionId == null) return;
    const ok = await run(() => rejectCurriculumAction(selectedVersionId, note));
    if (ok) { setModal(null); reloadOverview(); reloadDetail(selectedVersionId); }
  };

  const handlePublish = async () => {
    if (selectedVersionId == null) return;
    const ok = await run(() => publishCurriculumAction(selectedVersionId));
    if (ok) { reloadOverview(); reloadDetail(selectedVersionId); }
  };

  const handleArchive = async () => {
    if (selectedVersionId == null) return;
    const ok = await run(() => archiveCurriculumAction(selectedVersionId));
    if (ok) { reloadOverview(); reloadDetail(selectedVersionId); }
  };

  const handleCreateRevision = async () => {
    if (selectedVersionId == null) return;
    const ok = await run(() => createCurriculumRevisionAction(selectedVersionId).then(r =>
      r.ok ? { ok: true, message: `نسخهٔ جدید (${r.data.versionCode}) ساخته شد.` } : r
    ));
    if (ok) reloadOverview();
  };

  const handleCreateVersion = async () => {
    const f = newVersionForm;
    if (!f.versionCode.trim() || !f.entryYearFrom) { showToast('کد نسخه و سال ورودی الزامی است.', 'error'); return; }
    const ok = await run(() => createCurriculumVersionAction({
      majorId: selectedMajorId,
      versionCode: f.versionCode.trim(),
      title: f.title.trim() || `برنامهٔ ${majors.find(m => m.id === selectedMajorId)?.name ?? ''} ${f.versionCode.trim()}`,
      entryYearFrom: f.entryYearFrom,
      totalRequiredUnits: f.totalRequiredUnits,
      maxUnitsPerTerm: f.maxUnitsPerTerm || null,
      cloneFromId: f.cloneFromId ? Number(f.cloneFromId) : undefined,
    }));
    if (ok) { setModal(null); setNewVersionForm({ versionCode: '', title: '', entryYearFrom: 1405, totalRequiredUnits: 140, maxUnitsPerTerm: 20, cloneFromId: '' }); reloadOverview(); }
  };

  const handleTransferToMajor = async () => {
    if (selectedVersionId == null) return;
    const src = versions.find(v => v.id === selectedVersionId);
    if (!src) return;
    const targetMajor = majors.find(m => m.id === (transferMajorId || selectedMajorId));
    if (!targetMajor) return;
    const ok = await run(() => createCurriculumVersionAction({
      majorId: targetMajor.id,
      versionCode: `${src.entryYearFrom}-T1`,
      title: `${targetMajor.name} — کپی از نسخهٔ ${src.versionCode} (${src.title})`,
      entryYearFrom: src.entryYearFrom,
      totalRequiredUnits: Number(src.totalRequiredUnits) || 140,
      maxUnitsPerTerm: detail?.version.maxUnitsPerTerm ?? 20,
      cloneFromId: src.id,
    }));
    if (ok) { reloadOverview(); setActiveTab('CATALOG'); }
  };

  // ── ویرایش دروس (فقط DRAFT؛ اکشن خودش گیت می‌زند) ──
  const handleAddCourse = async () => {
    if (selectedVersionId == null || !addCourseForm.courseId) return;
    const picked = bank.find(b => b.id === Number(addCourseForm.courseId));
    const ok = await run(() => addCourseToCurriculumAction(selectedVersionId, {
      courseId: Number(addCourseForm.courseId),
      roleType: picked ? roleForBank(picked) : addCourseForm.roleType,
      recommendedSemester: addCourseForm.recommendedSemester ? Number(addCourseForm.recommendedSemester) : null,
    }));
    if (ok) { setModal(null); setAddCourseForm({ courseId: '', roleType: 'CORE', recommendedSemester: '' }); reloadDetail(selectedVersionId); }
  };

  const handleBulkAddCourses = async () => {
    if (selectedVersionId == null || bankSelected.size === 0) return;
    const items = [...bankSelected].map(courseId => {
      const b = bank.find(x => x.id === courseId);
      return {
        courseId,
        roleType: b ? roleForBank(b) : addCourseForm.roleType,
        recommendedSemester: null,
      };
    });
    const ok = await run(() => bulkAddCoursesAction(selectedVersionId, items));
    if (ok) { closeAddCourse(); reloadDetail(selectedVersionId); setActiveTab('SEMESTERS'); }
  };

  const handleCreateBankCourse = async () => {
    const f = newCourseForm;
    if (!f.code.trim() || !f.title.trim()) { showToast('کد درس و نام درس الزامی است.', 'error'); return; }
    const theo = Number(f.theo) || 0;
    const prac = Number(f.prac) || 0;
    if (theo < 0 || prac < 0 || theo + prac <= 0) { showToast('واحد نظری/عملی نامعتبر است.', 'error'); return; }
    setBusy(true);
    try {
      const r = await createCourseBankAction({
        code: f.code.trim(),
        title: f.title.trim(),
        theoreticalUnits: theo,
        practicalUnits: prac,
        courseType: f.courseType,
        gradingType: f.grading === 'PASS_FAIL' ? 'PASS_FAIL' : 'NUMERIC',
        affectsGpa: f.gpa ? 1 : 0,
        departmentId: f.departmentId ? Number(f.departmentId) : null,
      });
      if (!r.ok) { showToast(r.error, 'error'); return; }
      showToast(r.message, 'success');
      const newId = r.data.id;
      const entry = { id: newId, code: f.code.trim(), title: f.title.trim(), units: String(theo + prac), courseType: f.courseType };
      setBank(b => (b.some(x => x.id === newId) ? b : [...b, entry]));
      setAddCourseForm(af => ({ ...af, courseId: String(newId) }));
      setBankSelected(new Set([newId]));
      setModal(null);
      setNewCourseForm({ code: '', title: '', theo: 3, prac: 0, courseType: 'تخصصی', grading: 'NUMERIC', gpa: true, departmentId: '' });
    } finally {
      setBusy(false);
    }
  };

  // ── ویرایش پیش‌نیاز/هم‌نیاز (فقط DRAFT؛ اکشن‌ها گیت می‌زنند + audit) ──
  // درخت فقط از کدهای دروس همین نسخه ساخته می‌شود → کد نامعتبر و خودارجاعی از ریشه غیرممکن است.
  const leafCourseCodesOf = (t: LogicNode | undefined): string[] => {
    if (!t) return [];
    const out: string[] = [];
    for (const c of t.conditions ?? []) {
      const n = c as unknown as LogicNode;
      if (n.operator) out.push(...leafCourseCodesOf(n));
      else if ((c as { course?: unknown }).course != null) out.push(String((c as { course?: unknown }).course));
    }
    return out;
  };

  const leafTotalOf = (t: LogicNode | undefined): number => {
    if (!t) return 0;
    let n = 0;
    for (const c of t.conditions ?? []) {
      const sn = c as unknown as LogicNode;
      n += sn.operator ? leafTotalOf(sn) : 1;
    }
    return n;
  };

  const openRules = (courseId: number) => {
    const pre = detail?.rules.find(r => r.courseId === courseId && r.ruleType === 'PREREQ');
    const co = detail?.rules.find(r => r.courseId === courseId && r.ruleType === 'COREQ');
    const course = detail?.courses.find(c => c.courseId === courseId);
    setRuleForm({
      pre: leafCourseCodesOf(pre?.logicTree), preOp: pre?.logicTree.operator ?? 'AND',
      co: leafCourseCodesOf(co?.logicTree), coOp: co?.logicTree.operator ?? 'AND',
      minGrade: course?.minGrade != null ? String(course.minGrade) : '',
    });
    setRuleCourseId(courseId);
    setModal('RULES');
  };

  const toggleRuleCode = (group: 'pre' | 'co', code: string) => {
    setRuleForm(f => {
      const arr = group === 'pre' ? f.pre : f.co;
      const next = arr.includes(code) ? arr.filter(x => x !== code) : [...arr, code];
      return group === 'pre' ? { ...f, pre: next } : { ...f, co: next };
    });
  };

  const handleSaveRules = async () => {
    if (selectedVersionId == null || ruleCourseId == null) return;
    const buildTree = (codes: string[], op: 'AND' | 'OR') =>
      codes.length === 0 ? null : { operator: op, conditions: codes.map(code => ({ course: code })) };
    const okPre = await run(() => setCoursePrerequisiteAction(selectedVersionId, ruleCourseId, buildTree(ruleForm.pre, ruleForm.preOp)));
    if (!okPre) return;
    const okCo = await run(() => setCourseCorequisiteAction(selectedVersionId, ruleCourseId, buildTree(ruleForm.co, ruleForm.coOp)));
    if (!okCo) return;
    const currentMin = ruleCourse?.minGrade != null ? String(ruleCourse.minGrade) : '';
    if (ruleForm.minGrade.trim() !== currentMin) {
      const trimmed = ruleForm.minGrade.trim();
      const parsed = trimmed === '' ? null : Number(trimmed);
      if (parsed != null && (!(parsed >= 0) || !(parsed <= 20))) { showToast('کف نمره باید بین ۰ تا ۲۰ باشد.', 'error'); return; }
      const okMin = await run(() => setCoursePassingGradeAction(selectedVersionId, ruleCourseId, parsed));
      if (!okMin) return;
    }
    setModal(null);
    setRuleCourseId(null);
    reloadDetail(selectedVersionId);
  };

  const ruleText = (courseId: number, type: string): string | null => {
    const r = detail?.rules.find(x => x.courseId === courseId && x.ruleType === type);
    if (!r || (r.logicTree.conditions ?? []).length === 0) return null;
    const titleOf = (code: string) => detail?.courses.find(x => x.code === code)?.title ?? code;
    return describeLogicNode(r.logicTree, titleOf);
  };

  const ruleCourse = ruleCourseId != null ? detail?.courses.find(c => c.courseId === ruleCourseId) ?? null : null;

  const handleRemoveCourse = async (courseId: number) => {
    if (selectedVersionId == null) return;
    const ok = await run(() => removeCourseFromCurriculumAction(selectedVersionId, courseId));
    if (ok) reloadDetail(selectedVersionId);
  };

  const handleAssignSemester = async (courseId: number, semesterNo: number | null) => {
    if (selectedVersionId == null) return;
    await run(() => assignCourseToSemesterAction(selectedVersionId, courseId, semesterNo));
    reloadDetail(selectedVersionId);
  };

  const handleUpdateMaxUnits = async (value: number) => {
    if (selectedVersionId == null) return;
    await run(() => updateCurriculumMetaAction(selectedVersionId, { maxUnitsPerTerm: value || null }));
    reloadDetail(selectedVersionId);
  };

  const handleUpdateRequired = async (courseId: number, isRequired: number) => {
    if (selectedVersionId == null) return;
    await run(() => updateCourseInCurriculumAction(selectedVersionId, courseId, { isRequired }));
    reloadDetail(selectedVersionId);
  };

  const handleUpdateRole = async (courseId: number, roleType: string) => {
    if (selectedVersionId == null) return;
    await run(() => updateCourseInCurriculumAction(selectedVersionId, courseId, { roleType }));
    reloadDetail(selectedVersionId);
  };

  const handleUpdateGradReq = async (courseId: number, isGraduationRequired: number) => {
    if (selectedVersionId == null) return;
    await run(() => updateCourseInCurriculumAction(selectedVersionId, courseId, { isGraduationRequired }));
    reloadDetail(selectedVersionId);
  };

  // ── فیلتر درختی رشته: دانشکده → گروه → رشته ──
  const faculties = useMemo(() => [...new Set(majors.map(m => m.facultyName).filter(Boolean) as string[])].sort((a,b)=>a.localeCompare(b,'fa')), [majors]);
  const departments = useMemo(() => {
    const pool = facultyFilter ? majors.filter(m => m.facultyName === facultyFilter) : majors;
    return [...new Set(pool.map(m => m.departmentName).filter(Boolean) as string[])].sort((a,b)=>a.localeCompare(b,'fa'));
  }, [majors, facultyFilter]);
  const filteredMajors = useMemo(() => majors.filter(m =>
    (!facultyFilter || m.facultyName === facultyFilter) &&
    (!deptFilter || m.departmentName === deptFilter)
  ), [majors, facultyFilter, deptFilter]);

  useEffect(() => {
    // اگر رشتهٔ انتخابی بعد از فیلتر مخفی شد، به اولین رشتهٔ قابل‌نمایش سوییچ کن
    if (filteredMajors.length > 0 && !filteredMajors.some(m => m.id === selectedMajorId)) {
      setSelectedMajorId(filteredMajors[0].id);
      setSelectedVersionId(null);
      setDetail(null);
    }
  }, [filteredMajors, selectedMajorId]);

  // ── رندر ──
  const courseCodeOf = new Map((detail?.courses ?? []).map(c => [c.courseId, c.code]));
  const isDraft = (detail?.version.status ?? selectedVersion?.status) === 'DRAFT';
  const semesterCourses = new Map<number, CourseRow[]>();
  const unassignedCourses: CourseRow[] = [];
  (detail?.courses ?? []).forEach(c => {
    if (c.recommendedSemester != null) {
      const arr = semesterCourses.get(c.recommendedSemester) ?? [];
      arr.push(c);
      semesterCourses.set(c.recommendedSemester, arr);
    } else {
      unassignedCourses.push(c);
    }
  });
  const semesterUnitTotal = (list: CourseRow[] | undefined) => (list ?? []).reduce((s, c) => s + Number(c.units || 0), 0);
  const totalPlannedUnits = (detail?.courses ?? []).reduce((s, c) => s + Number(c.units || 0), 0);

  // ── فیلتر بانک: جستجو + پیشوند کد رشته ──
  const bankFiltered = bank.filter(b => {
    const q = bankQuery.trim();
    const p = codePrefix.trim();
    const okQ = !q || String(b.id).includes(q) || b.code.includes(q) || b.title.includes(q);
    const okP = !p || b.code.startsWith(p);
    return okQ && okP;
  });
  const bankVisible = bankFiltered.slice(0, 60);
  const allFilteredSelected = bankFiltered.length > 0 && bankFiltered.every(b => bankSelected.has(b.id));
  const roleForBank = (b: { id: number; courseType: string }) => bankRoles[b.id] ?? roleFromBankType(b.courseType);
  const toggleSelectAllBank = () => {
    const ids = bankFiltered.map(b => b.id);
    if (allFilteredSelected) {
      setBankSelected(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
      setBankRoles(prev => { const next = { ...prev }; ids.forEach(id => { delete next[id]; }); return next; });
    } else {
      setBankSelected(prev => new Set([...prev, ...ids]));
      setBankRoles(prev => { const next = { ...prev }; bankFiltered.forEach(b => { if (!(b.id in next)) next[b.id] = roleFromBankType(b.courseType); }); return next; });
      const last = bankFiltered[bankFiltered.length - 1];
      if (last) setAddCourseForm(f => ({ ...f, courseId: String(last.id) }));
    }
  };

  // ── جمع‌بندی نوع درس نسخه (معادل «نمایش اطلاعات نوع درس» مدل قدیم: جمع ۲) ──
  const typeSummary = (() => {
    const m = new Map<string, { count: number; units: number }>();
    for (const c of detail?.courses ?? []) {
      const e = m.get(c.roleType) ?? { count: 0, units: 0 };
      e.count += 1; e.units += Number(c.units || 0);
      m.set(c.roleType, e);
    }
    const order = Object.keys(ROLE_LABELS);
    return [...m.entries()]
      .map(([role, v]) => ({ role, ...v }))
      .sort((a, b) => (order.indexOf(a.role) === -1 ? 99 : order.indexOf(a.role)) - (order.indexOf(b.role) === -1 ? 99 : order.indexOf(b.role)));
  })();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-3 sm:p-6 space-y-5" dir="rtl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:right-auto sm:left-6 z-50 p-4 rounded-xl shadow-2xl border text-sm font-bold ${
          toast.type === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
            : toast.type === 'error' ? 'bg-rose-900 text-rose-100 border-rose-700'
            : 'bg-blue-900 text-blue-100 border-blue-700'
        }`}>
          {toast.type === 'success' ? '✅' : toast.type === 'error' ? '⚠️' : 'ℹ️'} {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-l from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-indigo-700/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">ماژول برنامهٔ درسی</span>
              <span className="text-xs text-indigo-200">{faNum(majorVersions.length)} نسخه در {majors.find(m => m.id === selectedMajorId)?.name ?? '—'}</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">📚 مدیریت نسخه‌های برنامهٔ درسی (چرخهٔ حیات مصوب)</h1>
          </div>
          <button
            onClick={() => setModal('NEW_VERSION')}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-extrabold text-xs shadow-md transition"
          >
            ➕ نسخهٔ جدید
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-indigo-200 font-bold block mb-1">دانشکده:</label>
            <select
              value={facultyFilter}
              onChange={e => { setFacultyFilter(e.target.value); setDeptFilter(''); }}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold"
            >
              <option value="">همه دانشکده‌ها</option>
              {faculties.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-indigo-200 font-bold block mb-1">گروه آموزشی:</label>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold"
            >
              <option value="">همه گروه‌ها</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-indigo-200 font-bold block mb-1">رشته / مقطع {filteredMajors.length !== majors.length ? `(${faNum(filteredMajors.length)} از ${faNum(majors.length)})` : `(${faNum(majors.length)})`}:</label>
            <select
              value={selectedMajorId}
              onChange={e => { setSelectedMajorId(Number(e.target.value)); setSelectedVersionId(null); setDetail(null); }}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-2.5 py-2 font-bold"
            >
              {filteredMajors.map(m => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name} — {m.degreeTitle ?? '—'}{m.facultyName ? ` (${m.facultyName}${m.departmentName ? ` / ${m.departmentName}` : ''})` : ''}
                </option>
              ))}
              {filteredMajors.length === 0 && <option value={selectedMajorId}>— موردی با این فیلتر یافت نشد —</option>}
            </select>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            {(() => { const m = majors.find(x => x.id === selectedMajorId); if (!m) return null; return (
              <p className="text-[10px] text-indigo-300 font-bold leading-relaxed">
                کد {m.code} · {m.facultyName ?? '—'} · {m.departmentName ?? '—'} · {faNum(m.minUnits ?? 0)} واحد الزامی
                {m.tracks && m.tracks.length > 0 ? ` · گرایش: ${m.tracks.join('، ')}` : ''}
              </p>
            ); })()}
          </div>
          <div className="sm:col-span-2 flex items-end">
            <p className="text-[11px] text-indigo-200 leading-relaxed bg-white/5 rounded-xl p-3 border border-white/10">
              هر تغییر پس از تأیید فقط با <b>نسخهٔ جدید (R1, R2,…)</b> انجام می‌شود؛ نسخهٔ تأییدشده هرگز درجا ویرایش نمی‌شود.
              وضعیت هر نسخه و «یافته‌های اعتبارسنجی» (CheckResult) مستقیماً از موتور واقعی خوانده می‌شود.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-200/80 rounded-2xl p-1.5 flex flex-wrap items-center gap-1.5 text-xs font-bold">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
              activeTab === t.key
                ? 'bg-indigo-900 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-indigo-100 hover:text-indigo-900'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
        {selectedVersion && (
          <span className="mr-auto px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-800 text-[11px] font-black">
            نسخهٔ فعال: {selectedVersion.versionCode} — {(STATUS_UI[selectedVersion.status] ?? { label: selectedVersion.status }).label}
          </span>
        )}
      </div>

      {/* Versions Table — تب: تعریف کاتالوگ رشته */}
      {activeTab === 'CATALOG' && (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-sm">🗂️ نسخه‌های این رشته</h3>
          <span className="text-[11px] text-slate-500 font-bold">{isDraft ? 'حالت پیش‌نویس: ویرایش فعال' : 'حالت فقط‌خواندنی (بسته به وضعیت)'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white text-center">
                <th className="p-2.5 border border-slate-800">کد نسخه</th>
                <th className="p-2.5 border border-slate-800">عنوان</th>
                <th className="p-2.5 border border-slate-800">ورودی</th>
                <th className="p-2.5 border border-slate-800">واحد الزامی</th>
                <th className="p-2.5 border border-slate-800">تعداد درس</th>
                <th className="p-2.5 border border-slate-800">وضعیت</th>
                <th className="p-2.5 border border-slate-800 w-28">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {majorVersions.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400 font-bold">هنوز نسخه‌ای برای این رشته ساخته نشده است.</td></tr>
              )}
              {majorVersions.map(v => {
                const st = STATUS_UI[v.status] ?? { label: v.status, cls: 'bg-slate-200 text-slate-800' };
                return (
                  <tr key={v.id} className={`text-center transition ${selectedVersionId === v.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                    <td className="p-2.5 border border-slate-200 font-mono font-black text-indigo-900">{v.versionCode}</td>
                    <td className="p-2.5 border border-slate-200 font-bold text-slate-800 text-right">{v.title}</td>
                    <td className="p-2.5 border border-slate-200">{faNum(v.entryYearFrom)}{v.entryYearTo ? `–${faNum(v.entryYearTo)}` : ' به بعد'}</td>
                    <td className="p-2.5 border border-slate-200 font-extrabold">{faNum(v.totalRequiredUnits)}</td>
                    <td className="p-2.5 border border-slate-200 font-extrabold">{faNum(v.courseCount)} درس</td>
                    <td className="p-2.5 border border-slate-200">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="p-2.5 border border-slate-200">
                      <button
                        onClick={() => setSelectedVersionId(v.id)}
                        className={`px-3 py-1.5 rounded-lg font-extrabold text-[11px] transition ${
                          selectedVersionId === v.id ? 'bg-indigo-900 text-white' : 'bg-indigo-100 text-indigo-900 hover:bg-indigo-200'
                        }`}
                      >
                        {selectedVersionId === v.id ? 'باز است' : 'باز کردن'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Detail */}
      {selectedVersion && (
        <div className="space-y-5">
          {activeTab !== 'VERIFY' && (
            <div className="bg-indigo-900/95 text-white rounded-2xl shadow-sm border border-indigo-700/50 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold">📄 {selectedVersion.title}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${(STATUS_UI[selectedVersion.status] ?? { cls: 'bg-slate-200 text-slate-800' }).cls}`}>
                    {(STATUS_UI[selectedVersion.status] ?? { label: selectedVersion.status }).label}
                  </span>
                </div>
                <p className="text-[11px] text-indigo-200 mt-1 font-bold">
                  کد {selectedVersion.versionCode} · ورودی {faNum(selectedVersion.entryYearFrom)}
                  {' '}· واحد الزامی {faNum(selectedVersion.totalRequiredUnits)}
                  {detail ? ` · ${faNum(detail.courses.length)} درس · مجموع ${faNum(totalPlannedUnits)} واحد` : ''}
                  {detail?.version.maxUnitsPerTerm != null ? ` · سقف ترم ${faNum(detail.version.maxUnitsPerTerm)} واحد` : ''}
                </p>
              </div>
              <button
                onClick={handleCreateRevision}
                disabled={busy}
                className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-[11px] disabled:opacity-50"
              >
                🔁 ایجاد نسخهٔ جدید (R+1)
              </button>
            </div>
          )}

          {/* Detail header + transitions — تب: بررسی و خاتمه */}
          {activeTab === 'VERIFY' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-slate-900 text-base">📄 {selectedVersion.title}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${(STATUS_UI[selectedVersion.status] ?? { cls: 'bg-slate-200 text-slate-800' }).cls}`}>
                    {(STATUS_UI[selectedVersion.status] ?? { label: selectedVersion.status }).label}
                  </span>
                  {isDraft && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">✏️ قابل ویرایش</span>}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  کد {selectedVersion.versionCode} · ورودی {faNum(selectedVersion.entryYearFrom)}{selectedVersion.entryYearTo ? ` تا ${faNum(selectedVersion.entryYearTo)}` : ' به بعد'}
                  {' '}· واحد الزامی {faNum(selectedVersion.totalRequiredUnits)}
                  {' '}· سقف ترم {isDraft ? (
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        type="number"
                        defaultValue={detail?.version.maxUnitsPerTerm ?? ''}
                        key={detail?.version.maxUnitsPerTerm ?? 'none'}
                        onBlur={e => { const v = Number(e.target.value); if (v && v !== detail?.version.maxUnitsPerTerm) handleUpdateMaxUnits(v); }}
                        className="w-16 border border-slate-300 rounded px-1.5 py-0.5 font-bold text-center"
                      />
                      <span className="text-[10px] text-slate-400">واحد (Enter/Blur برای ذخیره)</span>
                    </span>
                  ) : `${faNum(detail?.version.maxUnitsPerTerm ?? '—')} واحد`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={handleValidate} disabled={busy} className="px-3 py-2 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-extrabold text-[11px] disabled:opacity-50">
                  🔍 اعتبارسنجی کامل
                </button>
                {selectedVersion.status === 'DRAFT' && (
                  <button
                    onClick={() => handleSubmit('')}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-[11px] disabled:opacity-50"
                  >
                    📤 ارجاع به بازبینی (REVIEW)
                  </button>
                )}
                {selectedVersion.status === 'REVIEW' && (
                  <>
                    <button onClick={() => handleApprove('')} disabled={busy} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] disabled:opacity-50">
                      ✓ تأیید (APPROVED)
                    </button>
                    <button onClick={() => setModal('REJECT')} disabled={busy} className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] disabled:opacity-50">
                      ✕ رد و بازگشت به پیش‌نویس
                    </button>
                  </>
                )}
                {selectedVersion.status === 'APPROVED' && (
                  <button onClick={handlePublish} disabled={busy} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] disabled:opacity-50">
                    🚀 انتشار (PUBLISHED)
                  </button>
                )}
                {selectedVersion.status === 'PUBLISHED' && (
                  <button onClick={handleArchive} disabled={busy} className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white font-extrabold text-[11px] disabled:opacity-50">
                    🗃️ بایگانی (ARCHIVED)
                  </button>
                )}
                {(selectedVersion.status === 'APPROVED' || selectedVersion.status === 'PUBLISHED' || selectedVersion.status === 'ARCHIVED') && (
                  <button onClick={handleCreateRevision} disabled={busy} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-[11px] disabled:opacity-50">
                    🔁 ایجاد نسخهٔ جدید (R+1)
                  </button>
                )}
              </div>
            </div>
            {detailLoading && <div className="text-center text-xs text-slate-400 font-bold py-4">در حال بارگذاری جزئیات از سرور…</div>}
          </div>
          )}

          {/* Checks — تب: بررسی و خاتمه */}
          {activeTab === 'VERIFY' && detail && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
              <h4 className="font-extrabold text-slate-900 text-sm">🧪 نتایج اعتبارسنجی (Validator — از موتور واقعی)</h4>
              {detail.checks.length === 0 && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center text-xs font-bold text-emerald-800">
                  بدون یافته — برنامهٔ درسی سالم است. ✓
                </div>
              )}
              <div className="space-y-2">
                {detail.checks.map((c, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      c.severity === 'ERROR' ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-black text-slate-900">
                        {c.severity === 'ERROR' ? '⛔' : '⚠️'} {c.check}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                        c.severity === 'ERROR' ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'
                      }`}>
                        {c.severity === 'ERROR' ? 'مانع تأیید' : 'هشدار'}
                      </span>
                    </div>
                    <p className="text-slate-700 leading-relaxed font-bold">{c.message}</p>
                    {c.affected.length > 0 && (
                      <p className="text-[10px] text-slate-500 font-mono">{c.affected.map(a => faNum(a)).join('، ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Courses — تب: دروس کاتالوگ */}
          {activeTab === 'COURSES' && detail && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-900 text-sm">📖 دروس نسخه ({faNum(detail.courses.length)} درس)</h4>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setModal('NEW_COURSE')}
                    className="px-3 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-[11px]"
                  >
                    ✨ تعریف درس جدید
                  </button>
                  {isDraft && (
                    <button
                      onClick={() => setModal('ADD_COURSE')}
                      className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[11px]"
                    >
                      ➕ افزودن درس از بانک
                    </button>
                  )}
                </div>
              </div>
              {detail.courses.length === 0 && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs font-bold text-slate-500">
                  هنوز درسی به این نسخه افزوده نشده است.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white text-center">
                      <th className="p-2.5 border border-slate-800 w-10">ردیف</th>
                      <th className="p-2.5 border border-slate-800">کد</th>
                      <th className="p-2.5 border border-slate-800">عنوان درس</th>
                      <th className="p-2.5 border border-slate-800">واحد</th>
                      <th className="p-2.5 border border-slate-800">نقش</th>
                      <th className="p-2.5 border border-slate-800">ترم پیشنهادی</th>
                      <th className="p-2.5 border border-slate-800">الزامی در ترم</th>
                      <th className="p-2.5 border border-slate-800">الزام پایان‌نامه</th>
                      <th className="p-2.5 border border-slate-800">پیش‌نیاز / هم‌نیاز</th>
                      <th className="p-2.5 border border-slate-800">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.courses.map((c, idx) => (
                      <tr key={c.courseId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td className="p-2 border border-slate-200 text-center text-slate-500 font-bold">{faNum(idx + 1)}</td>
                        <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{c.code}</td>
                        <td className="p-2 border border-slate-200 font-extrabold text-right">{c.title}</td>
                        <td className="p-2 border border-slate-200 text-center font-black">{faNum(c.units)}</td>
                        <td className="p-2 border border-slate-200 text-center">
                          {isDraft ? (
                            <select
                              value={c.roleType}
                              onChange={e => handleUpdateRole(c.courseId, e.target.value)}
                              className="border border-slate-300 rounded px-1.5 py-1 font-bold bg-white"
                            >
                              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-bold">{ROLE_LABELS[c.roleType] ?? c.roleType}</span>
                          )}
                        </td>
                        <td className="p-2 border border-slate-200 text-center">
                          {isDraft ? (
                            <select
                              value={c.recommendedSemester ?? ''}
                              onChange={e => handleAssignSemester(c.courseId, e.target.value ? Number(e.target.value) : null)}
                              className="border border-slate-300 rounded px-1.5 py-1 font-bold bg-white"
                            >
                              <option value="">نامشخص</option>
                              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>ترم {faNum(s)}</option>)}
                            </select>
                          ) : (
                            <span className="font-bold">{c.recommendedSemester ? `ترم ${faNum(c.recommendedSemester)}` : 'نامشخص'}</span>
                          )}
                        </td>
                        <td className="p-2 border border-slate-200 text-center">
                          <input
                            type="checkbox"
                            checked={c.isRequired === 1}
                            disabled={!isDraft}
                            onChange={e => handleUpdateRequired(c.courseId, e.target.checked ? 1 : 0)}
                            className="accent-indigo-700 w-4 h-4"
                          />
                        </td>
                        <td className="p-2 border border-slate-200 text-center">
                          <input
                            type="checkbox"
                            checked={c.isGraduationRequired === 1}
                            disabled={!isDraft}
                            onChange={e => handleUpdateGradReq(c.courseId, e.target.checked ? 1 : 0)}
                            className="accent-indigo-700 w-4 h-4"
                          />
                        </td>
                        <td className="p-2 border border-slate-200 text-center">
                          <div className="text-[10px] font-bold text-slate-600 leading-relaxed max-w-44">
                            {(() => {
                              const pre = ruleText(c.courseId, 'PREREQ');
                              const co = ruleText(c.courseId, 'COREQ');
                              if (!pre && !co && c.minGrade == null) return <span className="text-slate-300">—</span>;
                              return (<>
                                {pre && <div className="truncate" title={pre}>پیش: {pre}</div>}
                                {co && <div className="truncate" title={co}>هم: {co}</div>}
                                {c.minGrade != null && <div className="text-indigo-700">کف: {faNum(c.minGrade)}</div>}
                              </>);
                            })()}
                          </div>
                          {isDraft && (
                            <button
                              onClick={() => openRules(c.courseId)}
                              className="mt-1 px-2 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-extrabold text-[10px]"
                            >
                              🔗 ویرایش
                            </button>
                          )}
                        </td>
                        <td className="p-2 border border-slate-200 text-center">
                          {isDraft && (
                            <button
                              onClick={() => handleRemoveCourse(c.courseId)}
                              className="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-extrabold text-[10px]"
                            >
                              حذف
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* جمع‌بندی نوع درس — معادل «نمایش اطلاعات نوع درس» مدل قدیم (جمع ۲) */}
              {detail.courses.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <h5 className="font-extrabold text-slate-900 text-xs">📊 جمع‌بندی نوع درس (ثبت‌شده در این نسخه)</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-white text-center">
                          <th className="p-2.5 border border-slate-800">نوع درس</th>
                          <th className="p-2.5 border border-slate-800">تعداد درس (جمع ۲)</th>
                          <th className="p-2.5 border border-slate-800">مجموع واحد</th>
                        </tr>
                      </thead>
                      <tbody>
                        {typeSummary.map(r => (
                          <tr key={r.role} className="text-center">
                            <td className="p-2 border border-slate-200 font-extrabold">{ROLE_LABELS[r.role] ?? r.role}</td>
                            <td className="p-2 border border-slate-200 font-black">{faNum(r.count)}</td>
                            <td className="p-2 border border-slate-200 font-black">{faNum(r.units)}</td>
                          </tr>
                        ))}
                        <tr className="text-center bg-indigo-50 font-black">
                          <td className="p-2 border border-indigo-200">جمع کل</td>
                          <td className="p-2 border border-indigo-200">{faNum(detail.courses.length)} درس</td>
                          <td className="p-2 border border-indigo-200">{faNum(totalPlannedUnits)} از {faNum(detail.version.totalRequiredUnits)} واحد الزامی</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold">حداقل‌های مقرر هر نقش در تب «بررسی و خاتمه» (COURSE_TYPES_COMPLETE) کنترل می‌شود.</p>
                </div>
              )}

              {/* Rules */}
              {(detail.rules.length > 0) && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <h5 className="font-extrabold text-slate-900 text-xs">🔗 قواعد پیش‌نیاز / هم‌نیاز / نمرهٔ قبولی (از course_rules — درخت منطقی)</h5>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {detail.rules.map((r, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px]">
                        <span className="font-black text-indigo-900">{courseCodeOf.get(r.courseId) ?? r.courseId}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span className="font-bold text-slate-600">
                          {r.ruleType === 'PREREQ' ? 'پیش‌نیاز' : r.ruleType === 'COREQ' ? 'هم‌نیاز' : r.ruleType === 'PASSING_GRADE' ? 'نمرهٔ قبولی' : r.ruleType}
                        </span>
                        <div className="text-slate-700 font-bold mt-1">{describeLogicNode(r.logicTree, code => courseCodeOf.get(Number(code)) ?? code) || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approvals */}
              {(detail.approvals.length > 0) && (
                <div className="pt-3 border-t border-slate-200 space-y-1.5">
                  <h5 className="font-extrabold text-slate-900 text-xs">📜 تاریخچهٔ تأیید (append-only)</h5>
                  {detail.approvals.map((a, i) => (
                    <div key={a.id ?? i} className="flex items-center justify-between gap-2 bg-indigo-50/60 rounded-lg p-2 text-[11px]">
                      <span className="font-bold text-slate-700">
                        {a.fromStatus} ← {a.toStatus} <span className="text-slate-400">({a.approvalType})</span>
                      </span>
                      <span className="text-slate-500">{faDate(a.approvedAt)}{a.decisionNote ? ` — ${a.decisionNote}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ترمبندی چارت — تب: ترمبندی چارت */}
          {activeTab === 'SEMESTERS' && detail && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">🗺️ ترمبندی چارت — {selectedVersion.title}</h4>
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                    تخصیص درس به ترم تحصیلی؛ موتور انتخاب واحد و تطبیق فارغالتحصیلی بر اساس همین ترمبندی عمل میکنند.
                  </p>
                </div>
                <div className="text-[11px] bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 font-black text-indigo-900">
                  مجموع واحدهای چارت: {faNum(totalPlannedUnits)} از {faNum(detail.version.totalRequiredUnits)} واحد الزامی
                  {detail.version.maxUnitsPerTerm != null ? ` · سقف هر ترم: ${faNum(detail.version.maxUnitsPerTerm)} واحد` : ''}
                </div>
              </div>

              {!isDraft && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-600">
                  ⚠️ این نسخه «{(STATUS_UI[selectedVersion.status] ?? { label: selectedVersion.status }).label}» است و فقط مشاهده مجاز است؛ برای تغییر ترمبندی از «🔁 ایجاد نسخهٔ جدید (R+1)» یک پیشنویس بسازید.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => {
                  const list = semesterCourses.get(sem) ?? [];
                  const units = semesterUnitTotal(list);
                  const over = detail.version.maxUnitsPerTerm != null && units > (detail.version.maxUnitsPerTerm as number);
                  return (
                    <div key={sem} className={`rounded-xl border p-3 space-y-2 ${over ? 'border-rose-300 bg-rose-50' : 'border-emerald-200 bg-emerald-50/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-black text-emerald-950 text-xs">ترم {faNum(sem)}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${over ? 'bg-rose-200 text-rose-900' : 'bg-emerald-200 text-emerald-900'}`}>
                          {faNum(units)} واحد
                        </span>
                      </div>
                      {over && <div className="text-[10px] font-bold text-rose-700">⚠️ بیش از سقف ترم!</div>}
                      {list.length === 0 && <div className="text-[10px] text-slate-400 font-bold py-2 text-center">— بدون درس —</div>}
                      <div className="space-y-1.5">
                        {list.map(c => (
                          <div key={c.courseId} className="flex items-center justify-between gap-1 bg-white rounded-lg px-2 py-1 border border-emerald-100 text-[11px]">
                            <span className="font-mono text-indigo-900 text-[10px]">{c.code}</span>
                            <span className="truncate font-bold flex-1">{c.title}</span>
                            <span className="text-slate-400 text-[10px]">{faNum(c.units)}</span>
                            {isDraft && (
                              <button
                                onClick={() => handleAssignSemester(c.courseId, null)}
                                title="حذف از این ترم (نامشخص)"
                                className="text-rose-500 hover:text-rose-700 font-black px-1"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-black text-slate-800 text-xs">🌫️ دروس بدون ترم (نامشخص) — {faNum(unassignedCourses.length)} درس</span>
                  <span className="text-[10px] text-slate-400 font-bold">با انتخاب «ترم» از منوی هر درس، به ترمبندی اضافه میشود</span>
                </div>
                {unassignedCourses.length === 0 && <div className="text-[10px] text-slate-400 font-bold py-2 text-center">همهٔ دروس ترمبندی شدهاند. ✓</div>}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {unassignedCourses.map(c => (
                    <div key={c.courseId} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-slate-200 text-[11px]">
                      <span className="font-mono text-indigo-900 text-[10px]">{c.code}</span>
                      <span className="truncate font-bold flex-1">{c.title}</span>
                      <span className="text-slate-400 text-[10px]">{faNum(c.units)} واحد</span>
                      {isDraft ? (
                        <select
                          value=""
                          onChange={e => e.target.value && handleAssignSemester(c.courseId, Number(e.target.value))}
                          className="border border-slate-300 rounded px-1 py-0.5 font-bold text-[10px] bg-white"
                        >
                          <option value="">ترم…</option>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>ترم {faNum(s)}</option>)}
                        </select>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold">نامشخص</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* انتقال کاتالوگ — تب: انتقال کاتالوگ */}
          {activeTab === 'TRANSFER' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
              <h4 className="font-extrabold text-slate-900 text-sm">🔄 انتقال / کپی عمیق کاتالوگ «{selectedVersion.versionCode}»</h4>
              <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                کپی عمیق = کل چارت (دروس + پیشنیازها + همنیازها + ترمبندی + نمرهها + سقف واحد) به یک نسخهٔ جدید منتقل میشود؛ هیچ دادهٔ مشترکی بین دو نسخه باقی نمیماند.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <span className="font-black text-xs text-slate-800">1️⃣ نسخهٔ جدید (R+1) از همین نسخه</span>
                  <p className="text-[11px] text-slate-500 font-bold">مناسب اصلاحات پس از انتشار/تأیید — نسخههای نهایی هرگز درجا ویرایش نمیشوند.</p>
                  <button
                    onClick={handleCreateRevision}
                    disabled={busy}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs disabled:opacity-50"
                  >
                    🔁 ایجاد نسخهٔ جدید R+1
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <span className="font-black text-xs text-slate-800">2️⃣ کپی به رشتهٔ دیگر (انتقال چارت)</span>
                  <p className="text-[11px] text-slate-500 font-bold">همان کاتالوگ به یک رشتهٔ مقصد کپی میشود (نسخهٔ DRAFT در مقصد).</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex-1 min-w-40 text-[11px] font-bold text-slate-600">
                      رشتهٔ مقصد:
                      <select
                        value={transferMajorId || selectedMajorId}
                        onChange={e => setTransferMajorId(Number(e.target.value))}
                        className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white text-xs"
                      >
                        {majors.map(m => (
                          <option key={m.id} value={m.id}>{m.name}{m.degreeTitle ? ` — ${m.degreeTitle}` : ''}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={handleTransferToMajor}
                      disabled={busy}
                      className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs disabled:opacity-50"
                    >
                      ⇄ انتقال کاتالوگ
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] font-bold text-amber-900">
                💡 همچنین میتوانید از دکمهٔ «➕ نسخهٔ جدید» در بالای صفحه استفاده کنید و «کپی عمیق از نسخهٔ دیگر» را انتخاب نمایید.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: New version ── */}
      {modal === 'NEW_VERSION' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">➕ ایجاد نسخهٔ جدید برای «{majors.find(m => m.id === selectedMajorId)?.name}»</h3>
            <div className="space-y-2 text-xs">
              <label className="block font-bold text-slate-700">
                کد نسخه (مثل ۱۴۰۴ یا ۱۴۰۴-R1):
                <input value={newVersionForm.versionCode} onChange={e => setNewVersionForm({ ...newVersionForm, versionCode: e.target.value })}
                  placeholder="1405-R1" className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-mono font-bold" />
              </label>
              <label className="block font-bold text-slate-700">
                عنوان:
                <input value={newVersionForm.title} onChange={e => setNewVersionForm({ ...newVersionForm, title: e.target.value })}
                  placeholder="برنامهٔ …" className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
              </label>
              <label className="block font-bold text-slate-700">
                کپی عمیق از نسخهٔ دیگر (انتقال کاتالوگ — دروس + پیش‌نیازها + ترم‌بندی + نمره‌ها):
                <select
                  value={newVersionForm.cloneFromId}
                  onChange={e => setNewVersionForm({ ...newVersionForm, cloneFromId: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white"
                >
                  <option value="">بدون کپی (نسخهٔ خالی)</option>
                  {versions.filter(v => v.id !== selectedVersionId).map(v => (
                    <option key={v.id} value={v.id}>
                      {v.versionCode} — {v.title} ({STATUS_UI[v.status]?.label ?? v.status})
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block font-bold text-slate-700">
                  ورودی از:
                  <input type="number" value={newVersionForm.entryYearFrom} onChange={e => setNewVersionForm({ ...newVersionForm, entryYearFrom: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
                </label>
                <label className="block font-bold text-slate-700">
                  کل واحد:
                  <input type="number" value={newVersionForm.totalRequiredUnits} onChange={e => setNewVersionForm({ ...newVersionForm, totalRequiredUnits: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
                </label>
                <label className="block font-bold text-slate-700">
                  سقف ترم:
                  <input type="number" value={newVersionForm.maxUnitsPerTerm} onChange={e => setNewVersionForm({ ...newVersionForm, maxUnitsPerTerm: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
                </label>
              </div>
              <p className="text-[10px] text-slate-400 font-bold">
                (کپی عمیق از نسخهٔ مرجع = از دکمهٔ «ایجاد نسخهٔ جدید R+1» روی همان نسخه استفاده کنید)
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button onClick={handleCreateVersion} disabled={busy} className="px-5 py-1.5 rounded-lg bg-emerald-700 text-white font-extrabold text-xs disabled:opacity-50">
                ایجاد نسخه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: New bank course (معرفی درس جدید از صفر) ── */}
      {modal === 'NEW_COURSE' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">✨ معرفی درس جدید در بانک دروس</h3>
            <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
              درس از صفر در بانک سراسری تعریف می‌شود؛ پس از ثبت، همان‌جا برای افزودن به نسخه انتخاب می‌شود. پیش‌نیاز/هم‌نیاز هر درس در سطح کاتالوگ (تب «دروس کاتالوگ» ← قواعد) ثبت می‌گردد.
            </p>
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <label className="block font-bold text-slate-700">
                  شماره درس (کد) *:
                  <input value={newCourseForm.code} onChange={e => setNewCourseForm({ ...newCourseForm, code: e.target.value })}
                    placeholder="مثلاً 5122305" dir="ltr" className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-mono font-bold" />
                </label>
                <label className="block font-bold text-slate-700 col-span-2">
                  نام درس *:
                  <input value={newCourseForm.title} onChange={e => setNewCourseForm({ ...newCourseForm, title: e.target.value })}
                    placeholder="مثلاً یادگیری ماشین" className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold" />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block font-bold text-slate-700">
                  واحد نظری:
                  <input type="number" min={0} step="0.5" value={newCourseForm.theo} onChange={e => setNewCourseForm({ ...newCourseForm, theo: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold" dir="ltr" />
                </label>
                <label className="block font-bold text-slate-700">
                  واحد عملی:
                  <input type="number" min={0} step="0.5" value={newCourseForm.prac} onChange={e => setNewCourseForm({ ...newCourseForm, prac: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold" dir="ltr" />
                </label>
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2 text-center">
                  <div className="text-[10px] text-slate-500 font-bold">تعداد واحد</div>
                  <div className="font-black text-indigo-900 text-base">{faNum((Number(newCourseForm.theo) || 0) + (Number(newCourseForm.prac) || 0))}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block font-bold text-slate-700">
                  نوع درس:
                  <select value={newCourseForm.courseType} onChange={e => setNewCourseForm({ ...newCourseForm, courseType: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white">
                    {['عمومی', 'پایه', 'تخصصی', 'اختیاری'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="block font-bold text-slate-700">
                  گروه آموزشی:
                  <select value={newCourseForm.departmentId} onChange={e => setNewCourseForm({ ...newCourseForm, departmentId: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white">
                    <option value="">— عمومی / بدون گروه —</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block font-bold text-slate-700">
                  نمره‌دهی:
                  <select value={newCourseForm.grading} onChange={e => setNewCourseForm({ ...newCourseForm, grading: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white">
                    <option value="NUMERIC">عددی</option>
                    <option value="PASS_FAIL">قبول / رد</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 pt-5">
                  <input type="checkbox" checked={newCourseForm.gpa} onChange={e => setNewCourseForm({ ...newCourseForm, gpa: e.target.checked })} className="size-4 accent-indigo-700" />
                  موثر بر معدل
                </label>
              </div>
              {deptsLoading && <p className="text-[10px] text-slate-400 font-bold">در حال بارگیری گروه‌ها…</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button onClick={handleCreateBankCourse} disabled={busy || !newCourseForm.code.trim() || !newCourseForm.title.trim()} className="px-5 py-1.5 rounded-lg bg-indigo-700 text-white font-extrabold text-xs disabled:opacity-50">
                ثبت درس در بانک
              </button>
            </div>
          </div>
        </div>
      )}

{/* ── Modal: Rules (پیش‌نیاز / هم‌نیاز درس) ── */}
      {modal === 'RULES' && ruleCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">🔗 پیش‌نیاز / هم‌نیاز — {ruleCourse.code} · {ruleCourse.title}</h3>
            <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
              فقط از دروس همین نسخه می‌توان انتخاب کرد (کد نامعتبر و خودارجاعی ممکن نیست). خالی گذاشتن یک گروه + «ثبت» = حذف آن قاعده. نتیجه بلافاصله در تب «بررسی و خاتمه» اعتبارسنجی می‌شود (تشخیص دور و مغایرت ترمی).
            </p>
            {(() => {
              const trees = (detail?.rules ?? []).filter(r => r.courseId === ruleCourse.courseId && (r.ruleType === 'PREREQ' || r.ruleType === 'COREQ'));
              const complex = trees.some(t => leafTotalOf(t.logicTree) !== leafCourseCodesOf(t.logicTree).length);
              if (!complex) return null;
              return <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">⚠️ قاعدهٔ فعلی این درس شرط ترکیبی/واحدی دارد؛ با «ثبت»، کل درخت با انتخاب‌های زیر جایگزین می‌شود.</p>;
            })()}
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-xs text-slate-800">پیش‌نیازها (باید قبلاً گذرانده شود)</span>
                <select value={ruleForm.preOp} onChange={e => setRuleForm({ ...ruleForm, preOp: e.target.value === 'OR' ? 'OR' : 'AND' })}
                  className="border border-slate-300 rounded-lg px-2 py-1 font-bold text-[11px] bg-white">
                  <option value="AND">همه (AND)</option>
                  <option value="OR">یکی (OR)</option>
                </select>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {(detail?.courses ?? []).filter(c => c.courseId !== ruleCourse.courseId).map(c => (
                  <label key={c.courseId} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-indigo-50 cursor-pointer text-[11px] font-bold">
                    <input type="checkbox" className="accent-indigo-700 w-3.5 h-3.5 shrink-0"
                      checked={ruleForm.pre.includes(c.code)} onChange={() => toggleRuleCode('pre', c.code)} />
                    <span className="font-mono text-indigo-900 shrink-0">{c.code}</span>
                    <span className="truncate">{c.title}</span>
                  </label>
                ))}
              </div>
              {ruleForm.pre.length > 0 && <p className="text-[10px] font-black text-indigo-700">{faNum(ruleForm.pre.length)} درس به‌عنوان پیش‌نیاز انتخاب شد.</p>}
            </div>
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-xs text-slate-800">هم‌نیازها (باید هم‌زمان اخذ شود)</span>
                <select value={ruleForm.coOp} onChange={e => setRuleForm({ ...ruleForm, coOp: e.target.value === 'OR' ? 'OR' : 'AND' })}
                  className="border border-slate-300 rounded-lg px-2 py-1 font-bold text-[11px] bg-white">
                  <option value="AND">همه (AND)</option>
                  <option value="OR">یکی (OR)</option>
                </select>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {(detail?.courses ?? []).filter(c => c.courseId !== ruleCourse.courseId).map(c => (
                  <label key={c.courseId} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-indigo-50 cursor-pointer text-[11px] font-bold">
                    <input type="checkbox" className="accent-indigo-700 w-3.5 h-3.5 shrink-0"
                      checked={ruleForm.co.includes(c.code)} onChange={() => toggleRuleCode('co', c.code)} />
                    <span className="font-mono text-indigo-900 shrink-0">{c.code}</span>
                    <span className="truncate">{c.title}</span>
                  </label>
                ))}
              </div>
              {ruleForm.co.length > 0 && <p className="text-[10px] font-black text-indigo-700">{faNum(ruleForm.co.length)} درس به‌عنوان هم‌نیاز انتخاب شد.</p>}
            </div>
            <div className="rounded-xl border border-slate-200 p-3 space-y-1.5">
              <label className="block font-bold text-xs text-slate-800">
                کف نمره قبولی این درس در این نسخه (۰ تا ۲۰) — خالی = بدون کف خاص:
                <input type="number" min={0} max={20} step="0.5" value={ruleForm.minGrade}
                  onChange={e => setRuleForm({ ...ruleForm, minGrade: e.target.value })}
                  placeholder="مثلاً ۱۲" dir="ltr"
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold" />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setModal(null); setRuleCourseId(null); }} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button onClick={handleSaveRules} disabled={busy} className="px-5 py-1.5 rounded-lg bg-indigo-700 text-white font-extrabold text-xs disabled:opacity-50">
                ثبت قواعد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add course from bank ── */}
      {modal === 'ADD_COURSE' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">➕ افزودن درس از بانک دروس</h3>
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <label className="block font-bold text-slate-700">
                  جستجو (کد یا عنوان):
                  <input
                    value={bankQuery}
                    onChange={e => setBankQuery(e.target.value)}
                    placeholder="مثلاً ریاضی یا 101…"
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold"
                  />
                </label>
                <label className="block font-bold text-slate-700">
                  پیشوند کد رشته (مثل 99):
                  <div className="mt-1 flex gap-2">
                    <input
                      value={codePrefix}
                      onChange={e => setCodePrefix(e.target.value)}
                      placeholder="مثلاً 99…"
                      dir="ltr"
                      className="w-full border border-slate-300 rounded-lg p-2 font-bold font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => { setBank([]); }}
                      className="px-3 rounded-lg bg-indigo-100 text-indigo-900 font-extrabold text-[10px] shrink-0"
                    >
                      {bankLoading ? '…' : 'به‌روزرسانی'}
                    </button>
                  </div>
                </label>
              </div>
              {bank.length > 0 && (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-indigo-50/70 border border-indigo-100 px-2.5 py-1.5">
                    <label className="flex items-center gap-2 font-black text-indigo-900 cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        className="accent-indigo-700 w-4 h-4"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllBank}
                      />
                      انتخاب همه ({faNum(bankFiltered.length)} درس)
                    </label>
                    <span className="text-[10px] font-black text-indigo-700">{faNum(bankSelected.size)} انتخاب شد</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {bankVisible.map(b => (
                      <div key={b.id} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-indigo-50 text-[11px] font-bold">
                        <input
                          type="checkbox"
                          className="accent-indigo-700 w-3.5 h-3.5 shrink-0"
                          checked={bankSelected.has(b.id)}
                          onChange={e => {
                            const next = new Set(bankSelected);
                            if (e.target.checked) {
                              next.add(b.id);
                              setAddCourseForm(f => ({ ...f, courseId: String(b.id) }));
                              setBankRoles(prev => (b.id in prev ? prev : { ...prev, [b.id]: roleFromBankType(b.courseType) }));
                            } else {
                              next.delete(b.id);
                              setBankRoles(prev => { const nx = { ...prev }; delete nx[b.id]; return nx; });
                            }
                            setBankSelected(next);
                          }}
                        />
                        <span className="font-mono text-indigo-900 shrink-0">{b.code}</span>
                        <span className="truncate flex-1">{b.title}</span>
                        <span className="text-slate-400 shrink-0">({faNum(b.units)} واحد)</span>
                        <select
                          value={roleForBank(b)}
                          onChange={e => setBankRoles(prev => ({ ...prev, [b.id]: e.target.value }))}
                          title={`نوع بانک: ${b.courseType}`}
                          className="border border-slate-300 rounded px-1 py-0.5 font-bold text-[10px] bg-white shrink-0"
                        >
                          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}{roleFromBankType(b.courseType) === k ? ' •' : ''}</option>)}
                        </select>
                      </div>
                    ))}
                    {bankFiltered.length > bankVisible.length && (
                      <div className="px-2.5 py-1.5 text-[10px] text-slate-400 font-bold text-center">
                        … و {faNum(bankFiltered.length - bankVisible.length)} مورد دیگر — فیلتر را دقیق‌تر کنید
                      </div>
                    )}
                  </div>
                </>
              )}
              <label className="block font-bold text-slate-700">
                نقش دروس منتخب (اعمال به همه):
                <select value={addCourseForm.roleType} onChange={e => {
                    const v = e.target.value;
                    setAddCourseForm({ ...addCourseForm, roleType: v });
                    setBulkRoleType(v);
                    setBankRoles(prev => { const next = { ...prev }; bankSelected.forEach(id => { next[id] = v; }); return next; });
                  }}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white">
                  {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                نوع هر ردیف به‌صورت پیش‌فرض از بانک خوانده می‌شود (•) و تکی قابل تغییر است. دروس بدون ترم افزوده می‌شوند؛ ترم‌بندی در مرحلهٔ بعد — تب «📅 ترم‌بندی چارت».
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeAddCourse} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button onClick={handleAddCourse} disabled={busy || !addCourseForm.courseId} className="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-900 font-extrabold text-xs disabled:opacity-50">
                افزودن انتخابی
              </button>
              <button onClick={handleBulkAddCourses} disabled={busy || bankSelected.size === 0} className="px-5 py-1.5 rounded-lg bg-emerald-700 text-white font-extrabold text-xs disabled:opacity-50">
                افزودن {bankSelected.size > 0 ? faNum(bankSelected.size) : ''} درس منتخب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Reject with note ── */}
      {modal === 'REJECT' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">✕ رد نسخه و بازگشت به پیش‌نویس</h3>
            <label className="block text-xs font-bold text-slate-700">
              دلیل رد (الزامی):
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                rows={3}
                className="mt-1 w-full border border-slate-300 rounded-lg p-2"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button
                onClick={() => rejectNote.trim() && handleReject(rejectNote.trim())}
                disabled={busy || !rejectNote.trim()}
                className="px-5 py-1.5 rounded-lg bg-rose-600 text-white font-extrabold text-xs disabled:opacity-50"
              >
                ثبت رد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
