'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  approveCurriculumAction,
  assignCourseToSemesterAction,
  bulkAddCoursesAction,
  bulkAssignSemestersAction,
  createCurriculumRevisionAction,
  createCurriculumVersionAction,
  getCurriculumOverviewAction,
  getCurriculumVersionDetailAction,
  publishCurriculumAction,
  removeCourseFromCurriculumAction,
  submitCurriculumForApprovalAction,
  updateCourseInCurriculumAction,
  updateCurriculumMetaAction,
} from './actions';

// Types
export interface MajorItem {
  id: number;
  code: string;
  name: string;
  degreeLevel: string;
  degreeLevelId?: number;
  departmentName: string;
  facultyName: string;
  minUnits: number;
  tracks: string[];
}

export interface CatalogItem {
  id: number;
  majorCode: string;
  majorName: string;
  degreeLevel: string;
  studyMode: string; // آموزشی / آموزشی-پژوهشی / الکترونیکی
  track: string; // گرایش
  term: string; // مثال: 13881, 13882, 14031
  totalUnits: number;
  isFinalized?: boolean;
}

export interface CourseBankItem {
  id: number;
  code: string;
  title: string;
  courseType: string; // عمومی / پایه / تخصصی / اصلی / کارورزی / مهارتی / کارگاه / پروژه / نامشخص
  units: number;
  theoreticalUnits: number;
  practicalUnits: number;
  prerequisites: string;
  corequisites: string;
  passGrade?: number;
  failGrade?: number;
}

export interface SemesterCourseAssignment {
  courseId: number;
  isMandatoryInTerm: boolean; // الزامی در انتخاب واحد این ترم
  isGraduationReq: boolean;   // شرط الزامی فارغ‌التحصیلی
  recommendedTerm: number;    // شماره ترم مصوب ۱ تا ۸
  gradePolicy?: string;       // عادی / ارشد
}

export interface CourseTypeRule {
  typeCode: number;
  title: string;
  maxUnits: number;
}

// Initial Mock Data matching standard Iranian SIS & the screenshots
const INITIAL_MAJORS: MajorItem[] = [
  {
    id: 14,
    code: '14',
    name: 'مهندسی علوم و صنایع غذایی',
    degreeLevel: 'کارشناسی ناپیوسته',
    degreeLevelId: 1,
    departmentName: 'گروه صنایع غذایی و کشاورزی',
    facultyName: 'دانشکده کشاورزی و صنایع غذایی',
    minUnits: 70,
    tracks: ['نامشخص', 'کنترل کیفیت', 'فناوری مواد غذایی'],
  },
  {
    id: 412,
    code: '412',
    name: 'مهندسی نرم‌افزار',
    degreeLevel: 'کارشناسی پیوسته',
    degreeLevelId: 1,
    departmentName: 'گروه مهندسی کامپیوتر',
    facultyName: 'دانشکده فنی و مهندسی',
    minUnits: 140,
    tracks: ['نامشخص', 'سیستم‌های نرم‌افزاری', 'هوش مصنوعی'],
  },
  {
    id: 413,
    code: '413',
    name: 'مهندسی نرم‌افزار — انتقالی (تکمیل دوره)',
    degreeLevel: 'کارشناسی پیوسته',
    degreeLevelId: 1,
    departmentName: 'گروه مهندسی کامپیوتر',
    facultyName: 'دانشکده فنی و مهندسی',
    minUnits: 30,
    tracks: ['نامشخص'],
  },
  {
    id: 113,
    code: '113',
    name: 'مهندسی کامپیوتر – ارشد',
    degreeLevel: 'کارشناسی ارشد',
    degreeLevelId: 2,
    departmentName: 'گروه مهندسی کامپیوتر',
    facultyName: 'دانشکده فنی و مهندسی',
    minUnits: 32,
    tracks: ['نامشخص', 'هوش مصنوعی و رباتیک', 'شبکه‌های کامپیوتری'],
  },
  {
    id: 201,
    code: '201',
    name: 'حسابداری و مدیریت مالی',
    degreeLevel: 'کارشناسی پیوسته',
    degreeLevelId: 1,
    departmentName: 'گروه مدیریت و اقتصاد',
    facultyName: 'دانشکده علوم انسانی و مدیریت',
    minUnits: 135,
    tracks: ['نامشخص', 'حسابرسی', 'مدیریت سرمایه‌گذاری'],
  },
];

const ALL_TERMS = [
  '14042', '14041', '14032', '14031', '14022', '14021', '14012', '14011',
  '14002', '14001', '13993', '13992', '13991', '13982', '13981', '13972',
  '13971', '13962', '13961', '13952', '13951', '13942', '13941', '13932',
  '13931', '13922', '13921', '13912', '13911', '13903', '13902', '13901',
  '13892', '13891', '13882', '13881'
];

/** دادهٔ اولیهٔ فاز ۷ — از سرور (اکشن Overview + بانک دروس) — جایگزین Mock ها */
export interface CurriculumInitialData {
  majors: MajorItem[];
  versions: RealVersionRow[];
  tracks: { id: number; majorId: number; title: string }[];
  courseBank: CourseBankItem[];
}

export interface RealVersionRow {
  id: number;
  majorId: number | null;
  degreeLevelId: number | null;
  trackId: number | null;
  versionCode: string;
  title: string | null;
  status: string;
  entryYearFrom: number;
  entryYearTo: number | null;
  totalRequiredUnits: number | null;
  courseCount: number;
}

/** نرمال‌سازی خروجی اکشن‌ها (union های ok/error) */
type ActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
  data?: { id?: number; added?: number; versionCode?: string };
};
const asResult = (r: unknown) => r as ActionResult;

export interface VersionCheckInfo {
  check: string;
  severity: 'ERROR' | 'WARN';
  message: string;
  affected: (string | number)[];
}

export interface LoadedVersionDetail {
  status: string;
  versionCode: string;
  totalRequiredUnits: number;
  maxUnitsPerTerm: number | null;
  courses: {
    courseId: number; code: string; title: string; units: number;
    roleType: string; isRequired: number; isElective: number;
    isGraduationRequired: number; recommendedSemester: number | null;
  }[];
  rules: { courseId: number; ruleType: string; logicTree: unknown }[];
  approvals: { id: number; approvalType: string; fromStatus: string | null; toStatus: string; decisionNote: string | null; approvedAt: string | Date | null }[];
  checks: VersionCheckInfo[];
}

/** نقش‌های واقعی curriculum_courses → برچسب فارسی */
export const ROLE_LABEL: Record<string, string> = {
  GENERAL: 'عمومی', CORE: 'پایه', MAJOR: 'تخصصی', ELECTIVE: 'اختیاری', THESIS: 'پایان‌نامه', INTERNSHIP: 'کارآموزی', OTHER: 'سایر',
};

/** شناسهٔ ۱۱ چک موتور اعتبارسنجی (curriculum-validator.ts) */
const CHECK_TITLES: Record<string, string> = {
  UNITS_COVER_MIN: 'پوشش حداقل واحد الزامی (اصلی/تخصصی)',
  PREREQ_REFERENCES_VALID: 'اعتبار کدهای پیش‌نیاز در بانک دروس',
  PREREQ_CYCLE_FREE: 'آزادی گراف پیش‌نیازها از حلقهٔ دورانی',
  PREREQ_SEMESTER_ORDER: 'ترتیب ترمی پیش‌نیازها',
  COREQ_PRESENT: 'تعریف و هم‌ترمی هم‌نیازها',
  SEMESTER_LOAD: 'سقف واحد هر نیمسال',
  COURSE_TYPES_COMPLETE: 'تکمیل نقش‌های درسی (عمومی/پایه/تخصصی/…)',
  TRACK_INTEGRITY: 'یکپارچگی گرایش‌ها (Track)',
  EQUIVALENCY_DISJOINT: 'عدم هم‌پوشانی دروس هم‌ارز (Equivalence)',
  SEMESTER_UNASSIGNED: 'ترم‌بندی کامل همهٔ دروس',
  GRADUATION_COVERAGE: 'پوشش شرایط فارغ‌التحصیلی',
};

function buildCatalogsFrom(initial?: CurriculumInitialData): CatalogItem[] {
  if (!initial) return [];
  return initial.versions.map((v) => {
    const m = initial.majors.find((x) => x.id === v.majorId);
    return {
      id: v.id,
      majorCode: m?.code ?? String(v.majorId ?? ''),
      majorName: m?.name ?? '',
      degreeLevel: m?.degreeLevel ?? '',
      studyMode: 'آموزشی',
      track: initial.tracks.find((t) => t.id === v.trackId)?.title ?? 'نامشخص',
      term: v.versionCode,
      totalUnits: Number(v.totalRequiredUnits ?? 0),
      isFinalized: v.status !== 'DRAFT',
    };
  });
}

function buildCatalogsFromVersions(
  versions: RealVersionRow[],
  majors: MajorItem[],
  tracks: { id: number; title: string }[],
): CatalogItem[] {
  return versions.map((v) => {
    const m = majors.find((x) => x.id === v.majorId);
    return {
      id: v.id,
      majorCode: m?.code ?? String(v.majorId ?? ''),
      majorName: m?.name ?? '',
      degreeLevel: m?.degreeLevel ?? '',
      studyMode: 'آموزشی',
      track: tracks.find((t) => t.id === v.trackId)?.title ?? 'نامشخص',
      term: v.versionCode,
      totalUnits: Number(v.totalRequiredUnits ?? 0),
      isFinalized: v.status !== 'DRAFT',
    };
  });
}

export default function CurriculumManagerClient({ initial }: { initial?: CurriculumInitialData }) {
  // Navigation / Active View
  const [activeTab, setActiveTab] = useState<'TAB1_CATALOG' | 'TAB2_COURSES' | 'TAB_SEMESTERS' | 'TAB3_VERIFY' | 'TAB4_TRANSFER'>('TAB_SEMESTERS');
  const [activeModal, setActiveModal] = useState<null | 'NEW_MAJOR' | 'MAJOR_SPECS' | 'FACULTY_DEPT_TREE' | 'NEW_TRACK' | 'MAJOR_REPORT' | 'GRADUATION_AUDIT_REPORT'>(null);

  // State
  const [majors, setMajors] = useState<MajorItem[]>(() => (initial?.majors && initial.majors.length > 0 ? initial.majors : INITIAL_MAJORS));
  const [courseBank] = useState<CourseBankItem[]>(() => initial?.courseBank ?? []);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>(() => buildCatalogsFrom(initial));
  const [catalogCourses, setCatalogCourses] = useState<Record<number, number[]>>({});
  const [semesterAssignments, setSemesterAssignments] = useState<Record<number, Record<number, SemesterCourseAssignment[]>>>({});
  const [versionDetail, setVersionDetail] = useState<Record<number, LoadedVersionDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Selected filters in Catalog
  const [selectedMajorCode, setSelectedMajorCode] = useState<string>(() => initial?.majors?.[0]?.code ?? INITIAL_MAJORS[0]?.code ?? '');
  const [selectedStudyMode, setSelectedStudyMode] = useState<string>('آموزشی');
  const [selectedTrack, setSelectedTrack] = useState<string>('نامشخص');
  const [selectedCatalogId, setSelectedCatalogId] = useState<number>(() => {
    const m = initial?.majors?.[0];
    return initial?.versions?.find((x) => x.majorId === m?.id)?.id ?? initial?.versions?.[0]?.id ?? 0;
  });

  // Semester Management Tab State
  const [activeSemesterNo, setActiveSemesterNo] = useState<number>(1);
  const [selectedBankCoursesForSemester, setSelectedBankCoursesForSemester] = useState<number[]>([]);
  const [semesterSearchFilter, setSemesterSearchFilter] = useState('');
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);

  // Term Checkboxes for Tab 1 (درج اطلاعات کاتالوگ)
  const [checkedTerms, setCheckedTerms] = useState<Record<string, boolean>>({
    '14032': true,
    '14031': true,
    '14022': false,
    '14021': false,
    '14012': false,
    '14011': false,
  });

  // Tab 2 selection states
  const [courseSearch, setCourseSearch] = useState('');
  const [selectedBankCourseIds, setSelectedBankCourseIds] = useState<number[]>([]);
  const [selectedTargetCatalogIds, setSelectedTargetCatalogIds] = useState<number[]>([]);
  const [catalogCourseSearch, setCatalogCourseSearch] = useState('');
  const [selectedCatalogCourseId, setSelectedCatalogCourseId] = useState<number | null>(null);
  const [overrideCourseProperty, setOverrideCourseProperty] = useState(false);
  const [selectedCourseTypeOverride, setSelectedCourseTypeOverride] = useState('CORE');

  // Tab 4 (انتقال کاتالوگ)
  const [transferTargetMajorCode, setTransferTargetMajorCode] = useState('14');
  const [transferTargetStudyMode, setTransferTargetStudyMode] = useState('آموزشی');
  const [transferTargetTrack, setTransferTargetTrack] = useState('نامشخص');
  const [transferTargetTerm, setTransferTargetTerm] = useState('14041');
  // (فاز ۷) کپی پیش‌نیاز/نمره/ترم‌بندی دیگر آپشن نیست؛ Deep Clone واقعی در createCurriculumVersionAction(cloneFromId) است.

  // Modals state
  const [newMajorForm, setNewMajorForm] = useState({
    code: '',
    name: '',
    degreeLevel: 'کارشناسی پیوسته',
    facultyName: 'دانشکده فنی و مهندسی',
    departmentName: 'گروه مهندسی کامپیوتر',
    minUnits: 140,
  });

  const [newTrackForm, setNewTrackForm] = useState({
    majorCode: '14',
    trackName: '',
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Active Major Info
  // ─────────── فاز ۷: بارگیری جزئیات واقعی نسخه از سرور ───────────
  const loadVersionDetail = useCallback(async (versionId: number, force = false) => {
    if (!versionId || (versionDetail[versionId] && !force)) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await getCurriculumVersionDetailAction(versionId);
      if (!res.ok) { setDetailError(res.error ?? 'خطا در بارگیری جزئیات نسخه'); return; }
      const d = res.data;
      if (!d?.courses || !d?.version || !d?.checks) { setDetailError('دادهٔ ناقص از سرور'); return; }
      const dCourses = d.courses;
      const semMap: Record<number, SemesterCourseAssignment[]> = {};
      for (const c of dCourses) {
        const sem = c.recommendedSemester ?? 1;
        (semMap[sem] ??= []).push({
          courseId: c.courseId,
          isMandatoryInTerm: c.isRequired === 1,
          isGraduationReq: c.isGraduationRequired === 1,
          recommendedTerm: sem,
        });
      }
      setCatalogCourses((prev) => ({ ...prev, [versionId]: dCourses.map((c) => c.courseId) }));
      setSemesterAssignments((prev) => ({ ...prev, [versionId]: semMap }));
      setVersionDetail((prev) => ({
        ...prev,
        [versionId]: {
          status: d.version.status,
          versionCode: d.version.versionCode,
          totalRequiredUnits: Number(d.version.totalRequiredUnits ?? 0),
          maxUnitsPerTerm: d.version.maxUnitsPerTerm ?? null,
          courses: dCourses,
          rules: d.rules ?? [],
          approvals: d.approvals ?? [],
          checks: d.checks,
        },
      }));
    } catch (e) {
      console.error('loadVersionDetail:', e);
      setDetailError('خطا در بارگیری جزئیات نسخه');
    } finally {
      setDetailLoading(false);
    }
  }, [versionDetail]);

  /** باز-بارگیری فهرست نسخه‌ها پس از ساخت/انتشار */
  const refreshCatalogs = useCallback(async () => {
    const res = await getCurriculumOverviewAction();
    if (res.ok && res.data) {
      const versions: RealVersionRow[] = (res.data.versions ?? []).map((v) => ({
        ...v,
        totalRequiredUnits: v.totalRequiredUnits != null ? Number(v.totalRequiredUnits) : null,
      }));
      setCatalogs(buildCatalogsFromVersions(versions, majors, res.data.tracks));
      return true;
    }
    return false;
  }, [majors]);

  // بارگیری خودکار بار اول + تغییر کاتالوگ
  useEffect(() => {
    if (selectedCatalogId) loadVersionDetail(selectedCatalogId);
  }, [selectedCatalogId, loadVersionDetail]);

  // هماهنگ‌سازی انتخاب کاتالوگ با رشتهٔ فعال
  useEffect(() => {
    const list = catalogs.filter((c) => c.majorCode === selectedMajorCode);
    if (list.length > 0 && !list.some((c) => c.id === selectedCatalogId)) {
      setSelectedCatalogId(list[0].id);
    }
  }, [selectedMajorCode, catalogs, selectedCatalogId]);

  const activeMajor = useMemo(() => {
    return majors.find(m => m.code === selectedMajorCode) || majors[0];
  }, [majors, selectedMajorCode]);

  // Catalogs matching active filters
  const filteredCatalogs = useMemo(() => {
    return catalogs.filter(c => c.majorCode === selectedMajorCode);
  }, [catalogs, selectedMajorCode]);

  // Active Catalog Object
  const activeCatalog = useMemo(() => {
    return catalogs.find(c => c.id === selectedCatalogId) || catalogs[0] || null;
  }, [catalogs, selectedCatalogId]);

  // Active Catalog Assigned Courses
  const activeAssignedCourses = useMemo(() => {
    if (!activeCatalog) return [];
    const ids = catalogCourses[activeCatalog.id] || [];
    return courseBank.filter(c => ids.includes(c.id));
  }, [activeCatalog, catalogCourses]);

  // Active Semester Assignments for active catalog
  const activeCatalogSemesterMap = useMemo(() => {
    if (!activeCatalog) return {};
    return semesterAssignments[activeCatalog.id] || {};
  }, [activeCatalog, semesterAssignments]);

  const activeSemesterCourseAssignments = useMemo(() => {
    return activeCatalogSemesterMap[activeSemesterNo] || [];
  }, [activeCatalogSemesterMap, activeSemesterNo]);

  // Assigned course IDs in current semester
  const activeSemesterAssignedCourseIds = useMemo(() => {
    return activeSemesterCourseAssignments.map(a => a.courseId);
  }, [activeSemesterCourseAssignments]);

  // All assigned course IDs across all semesters in this catalog
  const allAssignedSemesterCourseIds = useMemo(() => {
    const set = new Set<number>();
    Object.values(activeCatalogSemesterMap).forEach(list => {
      list.forEach(item => set.add(item.courseId));
    });
    return set;
  }, [activeCatalogSemesterMap]);

  // Semester Total Units Calculation
  const activeSemesterTotalUnits = useMemo(() => {
    return activeSemesterCourseAssignments.reduce((sum, item) => {
      const course = courseBank.find(c => c.id === item.courseId);
      return sum + (course ? course.units : 0);
    }, 0);
  }, [activeSemesterCourseAssignments]);

  // Grand Total Units across all 8 semesters in active catalog
  const grandTotalSemesterUnits = useMemo(() => {
    let sum = 0;
    Object.values(activeCatalogSemesterMap).forEach(list => {
      list.forEach(item => {
        const c = courseBank.find(crs => crs.id === item.courseId);
        if (c) sum += c.units;
      });
    });
    return sum;
  }, [activeCatalogSemesterMap]);

  // Type Rules for Active Catalog
  const activeTypeRules = useMemo(() => {
    if (!activeCatalog) return [];
    const d = versionDetail[activeCatalog.id];
    if (!d) return [];
    const rows: CourseTypeRule[] = [];
    for (const c of d.courses) {
      const title = ROLE_LABEL[c.roleType] ?? c.roleType;
      const row = rows.find((r) => r.title === title);
      if (row) row.maxUnits += c.units;
      else rows.push({ typeCode: rows.length + 1, title, maxUnits: c.units });
    }
    rows.push({ typeCode: 0, title: 'سقف واحد هر نیمسال', maxUnits: d.maxUnitsPerTerm ?? 0 });
    return rows;
  }, [activeCatalog, versionDetail]);

  // Aggregation for Tab 4 (*جمع ۱ و *جمع ۲)
  const courseTypeSummary = useMemo(() => {
    if (!activeCatalog) return [];
    const d = versionDetail[activeCatalog.id];
    if (!d) return [];
    const rows = new Map<string, { code: number; title: string; maxAllowed: number; actualAssigned: number }>();
    for (const c of d.courses) {
      const title = ROLE_LABEL[c.roleType] ?? c.roleType;
      const row = rows.get(title) ?? { code: rows.size + 1, title, maxAllowed: 0, actualAssigned: 0 };
      row.actualAssigned += c.units;
      rows.set(title, row);
    }
    for (const r of rows.values()) {
      if (r.title === ROLE_LABEL.CORE || r.title === ROLE_LABEL.MAJOR) r.maxAllowed = d.maxUnitsPerTerm ?? 0;
    }
    return Array.from(rows.values());
  }, [activeCatalog, versionDetail]);

  // Filtered Course Bank
  const filteredBankCourses = useMemo(() => {
    let list = courseBank;
    if (courseSearch.trim()) {
      const q = courseSearch.trim().toLowerCase();
      list = list.filter(c => c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.courseType.toLowerCase().includes(q));
    }
    return list;
  }, [courseSearch]);

  // Handlers for Semester Planner
  const handleAssignCoursesToSemester = async () => {
    if (!activeCatalog) return;
    if (selectedBankCoursesForSemester.length === 0) {
      alert('لطفاً حداقل یک درس را با تیک انتخاب فرمایید.');
      return;
    }
    setDetailLoading(true);
    const res = await bulkAssignSemestersAction(
      activeCatalog.id,
      selectedBankCoursesForSemester.map((courseId) => ({ courseId, semesterNo: activeSemesterNo })),
    );
    setDetailLoading(false);
    if (res.ok) {
      showToast(`✅ ${selectedBankCoursesForSemester.length} درس به ترم ${activeSemesterNo} نسخهٔ ${activeCatalog.term} منصوب شد.`);
      setSelectedBankCoursesForSemester([]);
      await loadVersionDetail(activeCatalog.id, true);
    } else {
      showToast(`⚠️ ${res.error ?? 'خطا در ترم‌بندی'}`);
    }
  };

  const handleRemoveCourseFromSemester = async (courseId: number) => {
    if (!activeCatalog) return;
    setDetailLoading(true);
    const res = await assignCourseToSemesterAction(activeCatalog.id, courseId, null);
    setDetailLoading(false);
    if (res.ok) showToast('درس از چارت ترم‌بندی خارج شد و در انتخاب واحد در دسترس نیست.');
    else showToast(`⚠️ ${res.error ?? 'خطا در حذف از ترم'}`);
    await loadVersionDetail(activeCatalog.id, true);
  };

  const handleToggleMandatoryInTerm = async (courseId: number) => {
    if (!activeCatalog) return;
    const cur = activeSemesterCourseAssignments.find((a) => a.courseId === courseId);
    const res = await updateCourseInCurriculumAction(activeCatalog.id, courseId, { isRequired: cur?.isMandatoryInTerm ? 0 : 1 });
    if (res.ok) showToast('الزامی/اختیاری بودن درس به‌روزرسانی شد و در انتخاب واحد اعمال می‌گردد.');
    else showToast(`⚠️ ${res.error ?? 'خطا'}`);
    await loadVersionDetail(activeCatalog.id, true);
  };

  const handleToggleGraduationReq = async (courseId: number) => {
    if (!activeCatalog) return;
    const cur = activeSemesterCourseAssignments.find((a) => a.courseId === courseId);
    const res = await updateCourseInCurriculumAction(activeCatalog.id, courseId, { isGraduationRequired: cur?.isGraduationReq ? 0 : 1 });
    if (res.ok) showToast('شرط فارغ‌التحصیلی درس به‌روزرسانی شد.');
    else showToast(`⚠️ ${res.error ?? 'خطا'}`);
    await loadVersionDetail(activeCatalog.id, true);
  };

  const handleSyncWithEnrollmentEngine = async () => {
    const d = activeCatalog ? versionDetail[activeCatalog.id] : undefined;
    if (d && (d.status === 'PUBLISHED' || d.status === 'ARCHIVED')) {
      showToast('⚡ این نسخه به‌صورت خودکار در موتور انتخاب واحد و فارغ‌التحصیلی فعال است (همگام‌سازی دستی لازم نیست).');
    } else {
      showToast(`ℹ️ وضعیت نسخه: ${d?.status ?? '—'} — پس از PUBLISH به‌صورت خودکار در موتور انتخاب واحد فعال می‌شود.`);
    }
  };

  // Handlers for Tab 1
  const handleApplyNewTermCatalogs = async () => {
    if (!activeMajor) {
      alert('ابتدا یک رشته را از فهرست بالا انتخاب کنید.');
      return;
    }
    const selectedTerms = Object.keys(checkedTerms).filter(t => checkedTerms[t]);
    if (selectedTerms.length === 0) {
      alert('لطفاً حداقل یک نیمسال ورود را از لیست انتخاب کنید.');
      return;
    }

    let addedCount = 0;
    const errors: string[] = [];
    for (const term of selectedTerms) {
      const exists = catalogs.some(c => c.majorCode === activeMajor.code && c.term === term);
      if (exists) {
        errors.push(`${term} (تکراری)`);
        continue;
      }
      const track = (initial?.tracks ?? []).find((t) => t.majorId === activeMajor.id && t.title === selectedTrack);
      const res = asResult(await createCurriculumVersionAction({
        majorId: activeMajor.id,
        trackId: track?.id ?? null,
        versionCode: term,
        title: `${activeMajor.name} — ورودی ${term}`,
        entryYearFrom: Number(String(term).slice(0, 4)),
        totalRequiredUnits: activeMajor.minUnits > 0 ? activeMajor.minUnits : undefined,
        cloneFromId: activeCatalog?.id,
      }));
      if (res.ok) addedCount++;
      else errors.push(`${term}: ${res.error ?? 'خطا'}`);
    }

    if (addedCount > 0) {
      await refreshCatalogs();
      showToast(`✅ ${addedCount} کاتالوگ برای نیمسال‌های انتخاب‌شده ساخته شد${errors.length ? ` — ${errors.join(' | ')}` : ''}.`);
    } else {
      showToast(`⚠️ ${errors.join(' | ') || 'هیچ کاتالوگی ساخته نشد.'}`);
    }
  };

  const handleDeleteCatalog = async (id: number) => {
    if (!confirm('نسخه‌های برنامهٔ درسی قابل حذف نیستند (قاعدهٔ D1: تغییر = نسخهٔ جدید).\nیک نسخهٔ جدید (Revision) از روی نسخهٔ فعلی ساخته می‌شود.')) return;
    const res = asResult(await createCurriculumRevisionAction(id));
    if (res.ok) {
      await refreshCatalogs();
      const newId = (res.data as { id?: number } | undefined)?.id;
      if (newId) setSelectedCatalogId(newId);
      showToast(`✅ نسخهٔ جدید (Revision) از کاتالوگ ${id} ساخته شد.`);
    } else {
      showToast(`⚠️ ${res.error ?? 'ساخت Revision فقط از نسخهٔ تأییدشده/منتشر ممکن است.'}`);
    }
  };

  const handleUpdateRuleUnit = async (typeCode: number, newVal: number) => {
    if (!activeCatalog) return;
    if (typeCode !== 0) {
      showToast('ℹ️ سقف واحدِ تک‌نقش‌ها از پیکربندی موتور اعمال می‌شود؛ فقط «سقف واحد هر نیمسال» نسخه قابل ویرایش است.');
      return;
    }
    const res = await updateCurriculumMetaAction(activeCatalog.id, { maxUnitsPerTerm: newVal });
    if (res.ok) {
      showToast('✅ سقف واحد هر نیمسال نسخه به‌روزرسانی شد.');
      await loadVersionDetail(activeCatalog.id, true);
    } else {
      showToast(`⚠️ ${res.error ?? 'خطا در به‌روزرسانی سقف'}`);
    }
  };

  // Handlers for Tab 2
  const handleTransferSelectedCoursesToCatalog = async () => {
    if (selectedBankCourseIds.length === 0) {
      alert('لطفاً حداقل یک درس را از جدول "کل دروس" انتخاب فرمایید.');
      return;
    }
    if (selectedTargetCatalogIds.length === 0) {
      alert('لطفاً حداقل یک کاتالوگ را از جدول "اطلاعات کاتالوگ" انتخاب نمایید.');
      return;
    }

    let added = 0;
    const errors: string[] = [];
    for (const catId of selectedTargetCatalogIds) {
      const res = await bulkAddCoursesAction(
        catId,
        selectedBankCourseIds.map((courseId) =>
          overrideCourseProperty ? { courseId, roleType: selectedCourseTypeOverride } : { courseId },
        ),
      );
      if (res.ok) {
        added += res.data?.added ?? selectedBankCourseIds.length;
        await loadVersionDetail(catId, true);
      } else {
        errors.push(res.error ?? 'خطا');
      }
    }
    showToast(`✅ ${added} درس به ${selectedTargetCatalogIds.length} نسخه افزوده شد.${errors.length ? ` ⚠️ ${errors.join(' | ')}` : ''}`);
    setSelectedBankCourseIds([]);
  };

  const handleRemoveCoursesFromActiveCatalog = async () => {
    if (!selectedCatalogCourseId) return;
    const targets = selectedTargetCatalogIds.length > 0 ? selectedTargetCatalogIds : (activeCatalog ? [activeCatalog.id] : []);
    if (targets.length === 0) return;
    let removed = 0;
    const errors: string[] = [];
    for (const vId of targets) {
      const res = await removeCourseFromCurriculumAction(vId, selectedCatalogCourseId);
      if (res.ok) { removed++; await loadVersionDetail(vId, true); }
      else { errors.push(res.error ?? 'خطا'); }
    }
    if (removed > 0) showToast(`درس از ${removed} نسخه حذف شد${errors.length ? ` — ${errors.join(' | ')}` : ''}.`);
    else showToast(`⚠️ ${errors.join(' | ') || 'حذف ممکن نیست'}`);
  };

  // Handlers for Tab 4
  const handleExecuteCatalogTransfer = async () => {
    if (!activeCatalog) return;
    const targetMajor = majors.find(m => m.code === transferTargetMajorCode) || activeMajor;
    const res = asResult(await createCurriculumVersionAction({
      majorId: targetMajor.id,
      versionCode: transferTargetTerm,
      title: `${targetMajor.name} — ورودی ${transferTargetTerm} (کپی از نسخهٔ ${activeCatalog.term})`,
      entryYearFrom: Number(String(transferTargetTerm).slice(0, 4)),
      totalRequiredUnits: activeCatalog.totalUnits > 0 ? activeCatalog.totalUnits : undefined,
      cloneFromId: activeCatalog.id,
    }));
    if (res.ok) {
      await refreshCatalogs();
      const newId = (res.data as { id?: number } | undefined)?.id;
      if (newId) setSelectedCatalogId(newId);
      showToast(`🎉 نسخهٔ ${transferTargetTerm} از کاتالوگ ${activeCatalog.term} با کپی کامل چارت (دروس + پیش‌نیازها + ترم‌بندی + نمره‌ها) ساخته شد.`);
      setActiveTab('TAB_SEMESTERS');
    } else {
      showToast(`⚠️ ${res.error ?? 'خطا در انتقال'}`);
    }
  };

  // ─────────── فاز ۷: آمار اعتبارسنجی واقعی (موتور Validation Engine) ───────────
  const activeDetail = activeCatalog ? versionDetail[activeCatalog.id] : undefined;
  const verifyChecks: VersionCheckInfo[] = activeDetail?.checks ?? [];
  const verifyErrorCount = verifyChecks.filter((c) => c.severity === 'ERROR').length;
  const verifyWarnCount = verifyChecks.filter((c) => c.severity === 'WARN').length;
  const verifyTotalChecks = Object.keys(CHECK_TITLES).length;
  const verifyPercent = verifyTotalChecks > 0
    ? Math.max(0, Math.round((100 * (verifyTotalChecks - verifyErrorCount - verifyWarnCount)) / verifyTotalChecks))
    : 0;
  const findCheck = (id: string) => verifyChecks.find((c) => c.check === id);
  const activeDetailTotalUnits = (activeDetail?.courses ?? []).reduce((sum, c) => sum + c.units, 0);
  const activeDetailUnassigned = (activeDetail?.courses ?? []).filter((c) => c.recommendedSemester == null).length;
  const isVersionLive = !!activeDetail && (activeDetail.status === 'PUBLISHED' || activeDetail.status === 'ARCHIVED');

  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const runLifecycle = async () => {
    if (!activeCatalog) return;
    setLifecycleBusy(true);
    const st = activeDetail?.status ?? 'DRAFT';
    const res = asResult(st === 'DRAFT' ? await submitCurriculumForApprovalAction(activeCatalog.id)
      : st === 'REVIEW' ? await approveCurriculumAction(activeCatalog.id)
      : st === 'APPROVED' ? await publishCurriculumAction(activeCatalog.id)
      : await createCurriculumRevisionAction(activeCatalog.id));
    setLifecycleBusy(false);
    if (res.ok) {
      if (st === 'DRAFT') showToast('📤 نسخه به وضعیت REVIEW ارسال شد (برای Edit قفل شد).');
      else if (st === 'REVIEW') showToast('✅ نسخه تأیید نهایی شد (APPROVED).');
      else if (st === 'APPROVED') showToast('🚀 نسخه منتشر شد (PUBLISHED) — از این پس در انتخاب واحد فعال است.');
      else showToast('🆕 نسخهٔ جدید (Revision) ساخته شد.');
      await refreshCatalogs();
      await loadVersionDetail(activeCatalog.id, true);
    } else {
      showToast(`⚠️ ${res.error ?? 'خطا در چرخهٔ تأیید'}`);
    }
  };

  return (
    <div className="space-y-4 text-slate-800 font-sans" dir="rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 bg-slate-900/95 text-white px-5 py-3 rounded-xl shadow-2xl border border-indigo-500/50 flex items-center gap-3 backdrop-blur-md animate-fade-in">
          <span className="text-xl">✨</span>
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Top Banner / Breadcrumb */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-indigo-900/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-300 text-xs font-medium mb-1">
              <Link href="/admin" className="hover:underline">داشبورد مدیریت</Link>
              <span>/</span>
              <span>مدیریت آموزش و برنامه‌ریزی درسی</span>
              <span>/</span>
              <span className="text-white font-bold">کاتالوگ و مشخصات رشته‌های دانشگاه</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>📚</span>
              <span>سامانهٔ مدیریت جامع کاتالوگ، چارت و سرفصل رشته‌ها</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              کنترل هوشمند انتخاب واحد و فارغ‌التحصیلی فعال
            </span>
          </div>
        </div>
      </div>

      {/* 5 Action Buttons Bar (Matching Image 1) */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200">
        <p className="text-xs font-bold text-slate-500 mb-2 px-1">عملیات سریع و پنجره‌های مدیریتی رشته‌ها (مطابق منوی دانشگاه):</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <button
            onClick={() => setActiveModal('NEW_MAJOR')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 transition-all text-slate-700 hover:text-indigo-950 group"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-100/80 group-hover:bg-indigo-200 text-indigo-700 flex items-center justify-center text-xl mb-1.5 shadow-sm">
              📁
            </div>
            <span className="text-xs font-bold">تعریف رشته جدید</span>
          </button>

          <button
            onClick={() => setActiveModal('MAJOR_SPECS')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 transition-all text-slate-700 hover:text-indigo-950 group"
          >
            <div className="w-10 h-10 rounded-lg bg-sky-100/80 group-hover:bg-sky-200 text-sky-700 flex items-center justify-center text-xl mb-1.5 shadow-sm">
              📑
            </div>
            <span className="text-xs font-bold">مشخصات رشته‌های دانشگاه</span>
          </button>

          <button
            onClick={() => setActiveModal('FACULTY_DEPT_TREE')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 transition-all text-slate-700 hover:text-indigo-950 group"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-100/80 group-hover:bg-amber-200 text-amber-700 flex items-center justify-center text-xl mb-1.5 shadow-sm">
              🏫
            </div>
            <span className="text-xs font-bold">دانشکده - رشته - گروه</span>
          </button>

          <button
            onClick={() => setActiveModal('NEW_TRACK')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 transition-all text-slate-700 hover:text-indigo-950 group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-100/80 group-hover:bg-emerald-200 text-emerald-700 flex items-center justify-center text-xl mb-1.5 shadow-sm">
              🗂️
            </div>
            <span className="text-xs font-bold">تعریف گرایش</span>
          </button>

          <button
            onClick={() => setActiveModal('MAJOR_REPORT')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 transition-all text-slate-700 hover:text-indigo-950 group col-span-2 sm:col-span-1"
          >
            <div className="w-10 h-10 rounded-lg bg-rose-100/80 group-hover:bg-rose-200 text-rose-700 flex items-center justify-center text-xl mb-1.5 shadow-sm">
              📊
            </div>
            <span className="text-xs font-bold">گزارش رشته‌ها</span>
          </button>
        </div>
      </div>

      {/* Main Catalog Window Wrapper (Windows SIS Theme matching Images 2, 3, 4 + Semester Planning) */}
      <div className="bg-slate-100 rounded-2xl border-2 border-slate-300 shadow-xl overflow-hidden">
        {/* Title Bar */}
        <div className="bg-gradient-to-r from-slate-200 to-slate-300 px-4 py-2 border-b border-slate-300 flex items-center justify-between text-xs font-bold text-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-indigo-700 font-black">🗃️</span>
            <span>کاتالوگ رشته — تنظیمات سرفصل مصوب و ترم‌بندی</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-slate-400 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-slate-400 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-rose-400 inline-block"></span>
          </div>
        </div>

        {/* Top 5 Tabs Navigation */}
        <div className="flex border-b border-slate-300 bg-slate-200/90 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setActiveTab('TAB1_CATALOG')}
            className={`px-4 py-2.5 border-l border-slate-300 transition-colors whitespace-nowrap ${
              activeTab === 'TAB1_CATALOG'
                ? 'bg-white text-indigo-950 border-t-2 border-t-indigo-600 shadow-inner'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            ورود اطلاعات کاتالوگ رشته
          </button>

          <button
            onClick={() => setActiveTab('TAB2_COURSES')}
            className={`px-4 py-2.5 border-l border-slate-300 transition-colors whitespace-nowrap ${
              activeTab === 'TAB2_COURSES'
                ? 'bg-white text-indigo-950 border-t-2 border-t-indigo-600 shadow-inner'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            ورود اطلاعات درس در کاتالوگ رشته
          </button>

          <button
            onClick={() => setActiveTab('TAB_SEMESTERS')}
            className={`px-4 py-2.5 border-l border-slate-300 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'TAB_SEMESTERS'
                ? 'bg-white text-emerald-950 border-t-2 border-t-emerald-600 shadow-inner'
                : 'text-slate-700 hover:bg-emerald-50/70 font-black'
            }`}
          >
            <span>📅</span>
            <span>ترم‌بندی چارت و کنترل انتخاب واحد / فارغ‌التحصیلی</span>
          </button>

          <button
            onClick={() => setActiveTab('TAB3_VERIFY')}
            className={`px-4 py-2.5 border-l border-slate-300 transition-colors whitespace-nowrap ${
              activeTab === 'TAB3_VERIFY'
                ? 'bg-white text-indigo-950 border-t-2 border-t-indigo-600 shadow-inner'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            بررسی و خاتمه
          </button>

          <button
            onClick={() => setActiveTab('TAB4_TRANSFER')}
            className={`px-4 py-2.5 transition-colors whitespace-nowrap ${
              activeTab === 'TAB4_TRANSFER'
                ? 'bg-white text-indigo-950 border-t-2 border-t-indigo-600 shadow-inner'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            انتقال کاتالوگ
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* تب اختصاصی جدید: ترم‌بندی چارت و کنترل انتخاب واحد و فارغ‌التحصیلی */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'TAB_SEMESTERS' && (
          <div className="p-4 bg-white space-y-4">
            {/* Context Summary Header */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-extrabold text-emerald-950 text-sm flex items-center gap-1.5">
                  <span>🗺️</span>
                  <span>برنامه‌ریزی ترمیک سرفصل: {activeCatalog?.majorName} (کاتالوگ {activeCatalog?.id} — ترم {activeCatalog?.term})</span>
                </span>
                <p className="text-emerald-800 text-[11px] mt-0.5">
                  در این بخش دروس مورد نیاز هر ترم تحصیلی را تیک زده و اضافه نمایید. این تنظیمات در <b>موتور انتخاب واحد</b> و <b>تطبیق فارغ‌التحصیلی دانشجو</b> به صورت خودکار ملاک عمل قرار می‌گیرد.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-left bg-white px-3 py-1.5 rounded-lg border border-emerald-300 shadow-sm">
                  <div className="text-[10px] text-slate-500">مجموع واحدهای کل چارت:</div>
                  <div className="font-mono font-extrabold text-indigo-900 text-sm">
                    {grandTotalSemesterUnits} / {activeMajor.minUnits} واحد مصوب
                  </div>
                </div>

                <button
                  onClick={handleSyncWithEnrollmentEngine}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>⚡</span>
                  <span>اعمال در انتخاب واحد و فارغ‌التحصیلی</span>
                </button>
              </div>
            </div>

            {/* Semesters 1 to 8 Pill Navigation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
                <span>انتخاب ترم تحصیلی جهت تخصیص دروس:</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  سقف استاندارد هر ترم: ۱۲ الی ۲۰ واحد (ترم‌های عادی) / حداکثر ۶ واحد (ترم تابستان)
                </span>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-9 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(semNo => {
                  const semItems = activeCatalogSemesterMap[semNo] || [];
                  const semUnits = semItems.reduce((acc, item) => {
                    const crs = courseBank.find(c => c.id === item.courseId);
                    return acc + (crs ? crs.units : 0);
                  }, 0);
                  const isSelected = activeSemesterNo === semNo;

                  return (
                    <button
                      key={semNo}
                      onClick={() => setActiveSemesterNo(semNo)}
                      className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-between min-h-[64px] ${
                        isSelected
                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-md scale-105 z-10'
                          : 'bg-slate-50 hover:bg-emerald-50/60 border-slate-300 text-slate-700'
                      }`}
                    >
                      <span className="text-xs font-extrabold">ترم {semNo}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full mt-1 ${
                        isSelected
                          ? 'bg-emerald-800 text-emerald-100 font-bold'
                          : semUnits > 0
                          ? 'bg-emerald-100 text-emerald-800 font-bold'
                          : 'bg-slate-200 text-slate-500'
                      }`}>
                        {semUnits} واحد ({semItems.length} درس)
                      </span>
                    </button>
                  );
                })}

                {/* Summer Term */}
                <button
                  onClick={() => setActiveSemesterNo(9)}
                  className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-between min-h-[64px] ${
                    activeSemesterNo === 9
                      ? 'bg-amber-600 text-white border-amber-700 shadow-md scale-105 z-10'
                      : 'bg-amber-50/60 hover:bg-amber-100/70 border-amber-300 text-amber-900'
                  }`}
                >
                  <span className="text-xs font-extrabold">☀️ تابستان</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full mt-1 bg-amber-200/80 text-amber-900 font-bold">
                    {(activeCatalogSemesterMap[9] || []).length} درس
                  </span>
                </button>
              </div>
            </div>

            {/* Split Screen: Left = بانک دروس کاتالوگ با تیک‌زدن, Right = دروس مصوب ترم جاری */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left Box: تیک‌زدن و انتخاب دروس از کاتالوگ (6 Cols) */}
              <div className="md:col-span-6 border border-slate-300 rounded-xl overflow-hidden bg-white flex flex-col justify-between">
                <div>
                  <div className="bg-slate-100 px-3 py-2 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700">
                    <div className="flex items-center gap-2">
                      <span>دروس ثبت‌شده در کاتالوگ</span>
                      <span className="text-[11px] text-slate-500 font-normal">({activeAssignedCourses.length} درس فعال)</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={semesterSearchFilter}
                        onChange={e => setSemesterSearchFilter(e.target.value)}
                        placeholder="فیلتر کد یا نام..."
                        className="bg-white border border-slate-300 px-2 py-0.5 rounded text-xs w-32"
                      />
                    </div>
                  </div>

                  <div className="p-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px]">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        checked={showOnlyUnassigned}
                        onChange={e => setShowOnlyUnassigned(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span>فقط دروس تخصیص‌نیافته به چارت</span>
                    </label>

                    <button
                      onClick={() => {
                        const candidateIds = activeAssignedCourses
                          .filter(c => !activeSemesterAssignedCourseIds.includes(c.id))
                          .map(c => c.id);
                        setSelectedBankCoursesForSemester(candidateIds);
                      }}
                      className="text-indigo-700 hover:underline font-bold"
                    >
                      ☑️ انتخاب همه دروس آزاد
                    </button>
                  </div>

                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2 border-l border-slate-200 text-center w-10">تیک</th>
                          <th className="p-2 border-l border-slate-200 text-center w-20">کد درس</th>
                          <th className="p-2 border-l border-slate-200">عنوان درس</th>
                          <th className="p-2 border-l border-slate-200 text-center w-14">واحد</th>
                          <th className="p-2 border-l border-slate-200">نوع</th>
                          <th className="p-2 border-l border-slate-200 text-center w-24">وضعیت چارت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeAssignedCourses
                          .filter(c => {
                            if (showOnlyUnassigned && allAssignedSemesterCourseIds.has(c.id)) return false;
                            if (semesterSearchFilter.trim()) {
                              const q = semesterSearchFilter.trim().toLowerCase();
                              return c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
                            }
                            return true;
                          })
                          .map(course => {
                            const isSelected = selectedBankCoursesForSemester.includes(course.id);
                            const assignedToThisSem = activeSemesterAssignedCourseIds.includes(course.id);

                            // Find which semester this course is assigned to
                            let assignedSem = 0;
                            Object.entries(activeCatalogSemesterMap).forEach(([sem, list]) => {
                              if (list.some(item => item.courseId === course.id)) assignedSem = Number(sem);
                            });

                            return (
                              <tr
                                key={course.id}
                                onClick={() => {
                                  if (assignedToThisSem) return;
                                  setSelectedBankCoursesForSemester(prev =>
                                    prev.includes(course.id) ? prev.filter(id => id !== course.id) : [...prev, course.id]
                                  );
                                }}
                                className={`border-b border-slate-100 cursor-pointer ${
                                  assignedToThisSem
                                    ? 'bg-emerald-50/50 opacity-60'
                                    : isSelected
                                    ? 'bg-indigo-100 font-bold text-indigo-950'
                                    : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="p-2 border-l border-slate-200 text-center" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    disabled={assignedToThisSem}
                                    checked={isSelected}
                                    onChange={e => {
                                      if (e.target.checked) setSelectedBankCoursesForSemester(prev => [...prev, course.id]);
                                      else setSelectedBankCoursesForSemester(prev => prev.filter(id => id !== course.id));
                                    }}
                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                  />
                                </td>
                                <td className="p-2 border-l border-slate-200 text-center font-mono">{course.code}</td>
                                <td className="p-2 border-l border-slate-200 font-semibold">{course.title}</td>
                                <td className="p-2 border-l border-slate-200 text-center font-mono font-bold">{course.units}</td>
                                <td className="p-2 border-l border-slate-200 text-slate-600">{course.courseType}</td>
                                <td className="p-2 border-l border-slate-200 text-center">
                                  {assignedToThisSem ? (
                                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                      در همین ترم ✓
                                    </span>
                                  ) : assignedSem > 0 ? (
                                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px]">
                                      ترم {assignedSem}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px]">
                                      بدون ترم
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-300 flex items-center justify-between">
                  <span className="text-[11px] text-slate-600">
                    تعداد دروس انتخاب‌شده: <b>{selectedBankCoursesForSemester.length} درس</b>
                  </span>

                  <button
                    onClick={handleAssignCoursesToSemester}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold px-5 py-1.5 rounded-lg text-xs shadow transition-all flex items-center gap-1.5"
                  >
                    <span>➕</span>
                    <span>افزودن دروس تیک‌خورده به ترم {activeSemesterNo === 9 ? 'تابستان' : activeSemesterNo}</span>
                  </button>
                </div>
              </div>

              {/* Right Box: دروس مصوب ترم انتخاب‌شده با کنترل‌های تیک و فارغ‌التحصیلی (6 Cols) */}
              <div className="md:col-span-6 border border-slate-300 rounded-xl overflow-hidden bg-white flex flex-col justify-between">
                <div>
                  <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-200 flex items-center justify-between text-xs font-bold text-emerald-950">
                    <div className="flex items-center gap-2">
                      <span>دروس مصوب ترم {activeSemesterNo === 9 ? 'تابستان' : activeSemesterNo}</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-mono text-[11px]">
                        مجموع: {activeSemesterTotalUnits} واحد
                      </span>
                    </div>

                    <span className="text-[11px] font-normal text-emerald-800">
                      {activeSemesterTotalUnits >= 12 && activeSemesterTotalUnits <= 20 ? (
                        <span className="text-emerald-700 font-bold">متوازن (۱۲ الی ۲۰ واحد) ✓</span>
                      ) : activeSemesterTotalUnits < 12 ? (
                        <span className="text-amber-700 font-bold">کمتر از سقف مجاز ۱۲ واحد ⚠️</span>
                      ) : (
                        <span className="text-rose-700 font-bold">بیش از سقف مجاز ۲۰ واحد ⛔</span>
                      )}
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2 border-l border-slate-200 text-center w-16">کد</th>
                          <th className="p-2 border-l border-slate-200">عنوان درس در این ترم</th>
                          <th className="p-2 border-l border-slate-200 text-center w-12">واحد</th>
                          <th className="p-2 border-l border-slate-200 text-center w-24">الزام انتخاب‌واحد</th>
                          <th className="p-2 border-l border-slate-200 text-center w-24">شرط فارغ‌التحصیلی</th>
                          <th className="p-2 border-l border-slate-200 text-center w-12">حذف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeSemesterCourseAssignments.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400">
                              هنوز درسی به ترم {activeSemesterNo} تخصیص نیافته است. از پنل سمت راست دروس مورد نظر را تیک زده و دکمه افزودن را بزنید.
                            </td>
                          </tr>
                        ) : (
                          activeSemesterCourseAssignments.map(assignment => {
                            const course = courseBank.find(c => c.id === assignment.courseId);
                            if (!course) return null;

                            return (
                              <tr key={assignment.courseId} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="p-2 border-l border-slate-200 text-center font-mono">{course.code}</td>
                                <td className="p-2 border-l border-slate-200 font-bold text-slate-900">
                                  {course.title}
                                  <span className="block text-[10px] text-slate-500 font-normal">
                                    {course.courseType} | پیش‌نیاز: {course.prerequisites}
                                  </span>
                                </td>
                                <td className="p-2 border-l border-slate-200 text-center font-mono font-bold">{course.units}</td>

                                {/* چک‌باکس الزام در انتخاب واحد این ترم */}
                                <td className="p-2 border-l border-slate-200 text-center">
                                  <label className="inline-flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={assignment.isMandatoryInTerm}
                                      onChange={() => handleToggleMandatoryInTerm(assignment.courseId)}
                                      className="rounded text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className={`text-[10px] font-bold ${assignment.isMandatoryInTerm ? 'text-emerald-700' : 'text-slate-400'}`}>
                                      {assignment.isMandatoryInTerm ? 'الزامی' : 'پیشنهادی'}
                                    </span>
                                  </label>
                                </td>

                                {/* چک‌باکس شرط فارغ‌التحصیلی */}
                                <td className="p-2 border-l border-slate-200 text-center">
                                  <label className="inline-flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={assignment.isGraduationReq}
                                      onChange={() => handleToggleGraduationReq(assignment.courseId)}
                                      className="rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className={`text-[10px] font-bold ${assignment.isGraduationReq ? 'text-indigo-700' : 'text-slate-400'}`}>
                                      {assignment.isGraduationReq ? 'اجباری' : 'اختیاری'}
                                    </span>
                                  </label>
                                </td>

                                <td className="p-2 border-l border-slate-200 text-center">
                                  <button
                                    onClick={() => handleRemoveCourseFromSemester(assignment.courseId)}
                                    className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-1 rounded font-bold"
                                    title="حذف از این ترم"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="text-[11px] text-slate-500">
                    💡 <b>راهنما:</b> دروسی که تیک «الزامی» دارند، هنگام ورود دانشجو به صفحهٔ انتخاب واحد در ترم {activeSemesterNo} به عنوان دروس دارای اولویت قطعی بارگذاری می‌شوند.
                  </div>

                  <button
                    onClick={() => setActiveModal('GRADUATION_AUDIT_REPORT')}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1"
                  >
                    <span>🎓</span>
                    <span>ماتریس تطبیق فارغ‌التحصیلی</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Visual 8-Semester Curriculum Chart Preview */}
            <div className="border border-slate-300 rounded-xl p-4 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="font-extrabold text-slate-800 text-xs flex items-center gap-2">
                  <span>🗺️</span>
                  <span>پیش‌نمایش کلی چارت مصوب ترم‌های ۱ تا ۸ (توزیع واحدهای فارغ‌التحصیلی)</span>
                </h3>
                <span className="text-[11px] text-slate-500 font-mono">
                  جمع کل: {grandTotalSemesterUnits} واحد از {activeMajor.minUnits} واحد مصوب
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(sNum => {
                  const items = activeCatalogSemesterMap[sNum] || [];
                  const uSum = items.reduce((sum, item) => {
                    const c = courseBank.find(crs => crs.id === item.courseId);
                    return sum + (c ? c.units : 0);
                  }, 0);

                  return (
                    <div
                      key={sNum}
                      onClick={() => setActiveSemesterNo(sNum)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        activeSemesterNo === sNum
                          ? 'bg-white border-emerald-500 ring-2 ring-emerald-400 shadow-md'
                          : 'bg-white/80 border-slate-200 hover:border-slate-300 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                        <span className="font-extrabold text-xs text-slate-800">ترم {sNum}</span>
                        <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {uSum} واحد
                        </span>
                      </div>

                      <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                        {items.length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic">بدون درس ثبت‌شده</span>
                        ) : (
                          items.map(it => {
                            const crs = courseBank.find(c => c.id === it.courseId);
                            if (!crs) return null;
                            return (
                              <div key={it.courseId} className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-50">
                                <span className="truncate text-slate-700 font-medium" title={crs.title}>
                                  • {crs.title}
                                </span>
                                <span className="font-mono text-[10px] text-slate-500 mr-1">{crs.units}و</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Window Buttons */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('TAB2_COURSES')}
                  className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-6 py-1.5 rounded text-xs font-bold text-slate-800 shadow-sm"
                >
                  &lt; قبلی
                </button>
                <button
                  onClick={() => setActiveTab('TAB3_VERIFY')}
                  className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-6 py-1.5 rounded text-xs font-bold text-slate-800 shadow-sm"
                >
                  بعدی &gt;
                </button>
              </div>
              <button
                onClick={() => showToast('خروج از پنجره کاتالوگ رشته')}
                className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-6 py-1.5 rounded text-xs font-bold text-slate-800 shadow-sm flex items-center gap-1.5"
              >
                <span>🚪</span>
                <span>خروج</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 1 Content: ورود اطلاعات کاتالوگ رشته (Matching Image 2) */}
        {activeTab === 'TAB1_CATALOG' && (
          <div className="p-4 bg-white space-y-4">
            {/* Top Filters Bar */}
            <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">کد رشته :</span>
                <input
                  type="text"
                  value={selectedMajorCode}
                  onChange={e => setSelectedMajorCode(e.target.value)}
                  className="w-14 bg-yellow-100 border border-slate-400 px-2 py-1 text-center font-bold font-mono rounded"
                />
                <select
                  value={selectedMajorCode}
                  onChange={e => setSelectedMajorCode(e.target.value)}
                  className="bg-white border border-slate-300 px-2.5 py-1 rounded font-bold text-slate-800"
                >
                  {majors.map(m => (
                    <option key={m.code} value={m.code}>
                      {m.name} / مقطع: {m.degreeLevel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-700">شیوه آموزشی :</span>
                <input type="text" value="1" readOnly className="w-8 bg-slate-100 border border-slate-300 px-1 py-1 text-center font-mono rounded text-[11px]" />
                <select
                  value={selectedStudyMode}
                  onChange={e => setSelectedStudyMode(e.target.value)}
                  className="bg-white border border-slate-300 px-2 py-1 rounded text-xs"
                >
                  <option value="آموزشی">آموزشی</option>
                  <option value="آموزشی-پژوهشی">آموزشی-پژوهشی</option>
                  <option value="پژوهش‌محور">پژوهش‌محور</option>
                  <option value="الکترونیکی">الکترونیکی</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-700">گرایش :</span>
                <input type="text" value="0" readOnly className="w-8 bg-slate-100 border border-slate-300 px-1 py-1 text-center font-mono rounded text-[11px]" />
                <select
                  value={selectedTrack}
                  onChange={e => setSelectedTrack(e.target.value)}
                  className="bg-white border border-slate-300 px-2 py-1 rounded text-xs"
                >
                  {(activeMajor.tracks || ['نامشخص']).map((t, idx) => (
                    <option key={idx} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => showToast(`اطلاعات کاتالوگ رشته ${activeMajor.name} بازیابی شد.`)}
                className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-4 py-1 rounded text-xs font-bold text-slate-800 shadow-sm"
              >
                بازیابی
              </button>
            </div>

            {/* Middle Section: Left = کاتالوگ‌ها, Right = درج اطلاعات کاتالوگ */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left Grid: مشاهده اطلاعات کاتالوگ (8 Cols) */}
              <div className="md:col-span-8 border border-slate-300 rounded-lg overflow-hidden flex flex-col justify-between bg-white">
                <div>
                  <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 text-xs font-bold text-slate-700 flex justify-between items-center">
                    <span>مشاهده اطلاعات کاتالوگ</span>
                    <span className="text-[11px] text-slate-500 font-normal">تعداد کاتالوگ‌های فعال: {filteredCatalogs.length}</span>
                  </div>
                  <div className="overflow-x-auto max-h-56 overflow-y-auto">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2 border-l border-slate-200 text-center w-20">کد کاتالوگ</th>
                          <th className="p-2 border-l border-slate-200">رشته</th>
                          <th className="p-2 border-l border-slate-200">شیوه آموزشی</th>
                          <th className="p-2 border-l border-slate-200">گرایش</th>
                          <th className="p-2 border-l border-slate-200 text-center w-20">ترم</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCatalogs.map(cat => (
                          <tr
                            key={cat.id}
                            onClick={() => setSelectedCatalogId(cat.id)}
                            className={`border-b border-slate-100 cursor-pointer transition-colors ${
                              selectedCatalogId === cat.id ? 'bg-indigo-100 font-bold text-indigo-950' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="p-2 border-l border-slate-200 text-center font-mono">{cat.id}</td>
                            <td className="p-2 border-l border-slate-200">{cat.majorName}</td>
                            <td className="p-2 border-l border-slate-200">{cat.studyMode}</td>
                            <td className="p-2 border-l border-slate-200">{cat.track}</td>
                            <td className="p-2 border-l border-slate-200 text-center font-mono">{cat.term}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-2 bg-slate-50 border-t border-slate-200 flex justify-start">
                  <button
                    onClick={() => handleDeleteCatalog(selectedCatalogId)}
                    className="bg-slate-200 hover:bg-indigo-100 hover:text-indigo-800 border border-slate-400 px-4 py-1 rounded text-xs font-bold text-slate-700 transition-colors"
                  >
                    ایجاد نسخهٔ جدید (Revision) از کاتالوگ انتخاب‌شده
                  </button>
                </div>
              </div>

              {/* Right Box: درج اطلاعات کاتالوگ (4 Cols) */}
              <div className="md:col-span-4 border border-slate-300 rounded-lg overflow-hidden flex flex-col bg-white">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 text-xs font-bold text-slate-700">
                  درج اطلاعات کاتالوگ
                </div>
                <div className="p-2.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-600">نیمسال ورود :</p>
                    <div className="border border-slate-300 rounded p-2 max-h-40 overflow-y-auto space-y-1 bg-slate-50/50">
                      {ALL_TERMS.slice(0, 15).map(term => (
                        <label key={term} className="flex items-center gap-2 text-xs text-slate-700 hover:bg-slate-100 px-1 py-0.5 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!checkedTerms[term]}
                            onChange={e => setCheckedTerms(prev => ({ ...prev, [term]: e.target.checked }))}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-mono text-xs">{term}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const all: Record<string, boolean> = {};
                          ALL_TERMS.slice(0, 15).forEach(t => all[t] = true);
                          setCheckedTerms(all);
                        }}
                        className="p-1 border border-slate-300 rounded hover:bg-slate-100 text-xs"
                        title="انتخاب همه"
                      >
                        ☑️
                      </button>
                      <button
                        onClick={() => setCheckedTerms({})}
                        className="p-1 border border-slate-300 rounded hover:bg-slate-100 text-xs"
                        title="عدم انتخاب"
                      >
                        ⬜
                      </button>
                    </div>
                    <button
                      onClick={handleApplyNewTermCatalogs}
                      className="bg-slate-200 hover:bg-indigo-600 hover:text-white border border-slate-400 px-6 py-1 rounded text-xs font-bold text-slate-800 transition-colors shadow-sm"
                    >
                      اعمال
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Section: نوع درس و حداکثر تعداد واحدهای نوع درس */}
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>نوع درس و حداکثر تعداد واحد های نوع درس (کاتالوگ {selectedCatalogId})</span>
                <span className="text-[11px] text-slate-500 font-normal">کل واحدهای تعریف‌شده: {activeTypeRules.reduce((a, b) => a + Number(b.maxUnits || 0), 0)} واحد</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-2 border-l border-slate-200 text-center w-20">نوع درس</th>
                      <th className="p-2 border-l border-slate-200">عنوان نوع درس</th>
                      <th className="p-2 border-l border-slate-200 text-center w-36">تعداد واحد مجاز</th>
                      <th className="p-2 border-l border-slate-200 text-left">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTypeRules.map(rule => (
                      <tr key={rule.typeCode} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2 border-l border-slate-200 text-center font-mono font-bold text-slate-600">{rule.typeCode}</td>
                        <td className="p-2 border-l border-slate-200 font-semibold text-slate-800">{rule.title}</td>
                        <td className="p-2 border-l border-slate-200 text-center">
                          <input
                            type="number"
                            min="0"
                            max="150"
                            value={rule.maxUnits}
                            disabled={rule.typeCode !== 0}
                            onChange={e => handleUpdateRuleUnit(rule.typeCode, Number(e.target.value))}
                            className="w-20 border border-slate-300 bg-white px-2 py-0.5 text-center font-mono font-bold rounded disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </td>
                        <td className="p-2 border-l border-slate-200 text-left">
                          <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            تنظیم مصوب
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Grid Toolbar */}
              <div className="p-2 bg-slate-100 border-t border-slate-300 flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs">
                  <button onClick={() => showToast('افزودن سرفصل جدید به جدول')} className="px-3 py-0.5 bg-slate-200 hover:bg-slate-300 border border-slate-400 rounded font-bold">➕</button>
                  <button onClick={() => showToast('حذف نوع درس')} className="px-3 py-0.5 bg-slate-200 hover:bg-slate-300 border border-slate-400 rounded font-bold">➖</button>
                  <button className="px-3 py-0.5 bg-slate-200 hover:bg-slate-300 border border-slate-400 rounded font-bold">▲</button>
                  <button className="px-3 py-0.5 bg-slate-200 hover:bg-slate-300 border border-slate-400 rounded font-bold">▼</button>
                  <button onClick={() => showToast('تغییرات سقف واحدهای کاتالوگ با موفقیت ثبت شد.')} className="px-3 py-0.5 bg-slate-200 hover:bg-emerald-100 hover:text-emerald-800 border border-slate-400 rounded font-bold">✔️ ذخیره</button>
                  <button onClick={() => showToast('انصراف از ویرایش')} className="px-3 py-0.5 bg-slate-200 hover:bg-rose-100 hover:text-rose-800 border border-slate-400 rounded font-bold">❌</button>
                  <button onClick={() => showToast('به‌روزرسانی داده‌ها')} className="px-3 py-0.5 bg-slate-200 hover:bg-slate-300 border border-slate-400 rounded font-bold">🔄</button>
                </div>
              </div>
            </div>

            {/* Bottom Window Buttons */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <button
                onClick={() => setActiveTab('TAB2_COURSES')}
                className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-6 py-1.5 rounded text-xs font-bold text-slate-800 shadow-sm"
              >
                بعدی &gt;
              </button>
              <button
                onClick={() => showToast('خروج از پنجره کاتالوگ رشته')}
                className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-6 py-1.5 rounded text-xs font-bold text-slate-800 shadow-sm flex items-center gap-1.5"
              >
                <span>🚪</span>
                <span>خروج</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2 Content: ورود اطلاعات درس در کاتالوگ رشته (Matching Image 3) */}
        {activeTab === 'TAB2_COURSES' && (
          <div className="p-4 bg-white space-y-4">
            {/* Top Section: کل دروس */}
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700">
                <div className="flex items-center gap-4">
                  <span>کل دروس</span>
                  <span className="text-[11px] text-slate-500 font-normal">تعداد : {courseBank.length}</span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-normal">
                    <input
                      type="checkbox"
                      checked={selectedBankCourseIds.length === courseBank.length}
                      onChange={e => {
                        if (e.target.checked) setSelectedBankCourseIds(courseBank.map(c => c.id));
                        else setSelectedBankCourseIds([]);
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>انتخاب همه</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-normal text-slate-600">جستجو :</span>
                  <input
                    type="text"
                    value={courseSearch}
                    onChange={e => setCourseSearch(e.target.value)}
                    placeholder="نام درس یا کد..."
                    className="bg-white border border-slate-300 px-2 py-0.5 rounded text-xs w-48"
                  />
                </div>
              </div>

              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2 border-l border-slate-200 text-center w-10">تیک</th>
                      <th className="p-2 border-l border-slate-200 text-center w-24">کد درس</th>
                      <th className="p-2 border-l border-slate-200">نام درس</th>
                      <th className="p-2 border-l border-slate-200">نوع درس</th>
                      <th className="p-2 border-l border-slate-200 text-center w-14">واحد</th>
                      <th className="p-2 border-l border-slate-200">پیشنیاز</th>
                      <th className="p-2 border-l border-slate-200">همنیاز</th>
                      <th className="p-2 border-l border-slate-200 text-center w-16">واحد تئوری</th>
                      <th className="p-2 border-l border-slate-200 text-center w-16">واحد عملی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBankCourses.map(course => {
                      const isChecked = selectedBankCourseIds.includes(course.id);
                      return (
                        <tr
                          key={course.id}
                          onClick={() => {
                            setSelectedBankCourseIds(prev =>
                              prev.includes(course.id) ? prev.filter(id => id !== course.id) : [...prev, course.id]
                            );
                          }}
                          className={`border-b border-slate-100 cursor-pointer ${
                            isChecked ? 'bg-indigo-100 font-bold text-indigo-950' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-2 border-l border-slate-200 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) setSelectedBankCourseIds(prev => [...prev, course.id]);
                                else setSelectedBankCourseIds(prev => prev.filter(id => id !== course.id));
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-2 border-l border-slate-200 text-center font-mono">{course.code}</td>
                          <td className="p-2 border-l border-slate-200 font-semibold text-slate-900">{course.title}</td>
                          <td className="p-2 border-l border-slate-200">{course.courseType}</td>
                          <td className="p-2 border-l border-slate-200 text-center font-mono font-bold">{course.units}</td>
                          <td className="p-2 border-l border-slate-200 text-slate-500">{course.prerequisites}</td>
                          <td className="p-2 border-l border-slate-200 text-slate-500">{course.corequisites}</td>
                          <td className="p-2 border-l border-slate-200 text-center font-mono">{course.theoreticalUnits}</td>
                          <td className="p-2 border-l border-slate-200 text-center font-mono">{course.practicalUnits}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Middle Section: اطلاعات کاتالوگ */}
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 flex items-center justify-between text-xs font-bold text-slate-700">
                <div className="flex items-center gap-3">
                  <span>اطلاعات کاتالوگ</span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-normal">
                    <input
                      type="checkbox"
                      checked={selectedTargetCatalogIds.length === filteredCatalogs.length}
                      onChange={e => {
                        if (e.target.checked) setSelectedTargetCatalogIds(filteredCatalogs.map(c => c.id));
                        else setSelectedTargetCatalogIds([]);
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>انتخاب همه</span>
                  </label>
                </div>
              </div>

              <div className="overflow-x-auto max-h-36 overflow-y-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2 border-l border-slate-200 text-center w-10">تیک</th>
                      <th className="p-2 border-l border-slate-200 text-center w-24">کد کاتالوگ</th>
                      <th className="p-2 border-l border-slate-200">رشته</th>
                      <th className="p-2 border-l border-slate-200">شیوه آموزشی</th>
                      <th className="p-2 border-l border-slate-200">گرایش</th>
                      <th className="p-2 border-l border-slate-200 text-center w-20">ترم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalogs.map(cat => {
                      const isChecked = selectedTargetCatalogIds.includes(cat.id);
                      return (
                        <tr
                          key={cat.id}
                          onClick={() => {
                            setSelectedTargetCatalogIds(prev =>
                              prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                            );
                            setSelectedCatalogId(cat.id);
                          }}
                          className={`border-b border-slate-100 cursor-pointer ${
                            isChecked ? 'bg-indigo-100 font-bold text-indigo-950' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-2 border-l border-slate-200 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) setSelectedTargetCatalogIds(prev => [...prev, cat.id]);
                                else setSelectedTargetCatalogIds(prev => prev.filter(id => id !== cat.id));
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-2 border-l border-slate-200 text-center font-mono">{cat.id}</td>
                          <td className="p-2 border-l border-slate-200">{cat.majorName}</td>
                          <td className="p-2 border-l border-slate-200">{cat.studyMode}</td>
                          <td className="p-2 border-l border-slate-200">{cat.track}</td>
                          <td className="p-2 border-l border-slate-200 text-center font-mono">{cat.term}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Transfer & Action Buttons Row (Matching Image 3) */}
            <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleRemoveCoursesFromActiveCatalog}
                  className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-3 py-1.5 rounded font-bold text-slate-800 flex items-center gap-1"
                >
                  <span>⌃</span>
                  <span>حذف دروس انتخابی از یک کاتالوگ</span>
                </button>
                <button
                  onClick={() => {
                    if (confirm('آیا مایلید این درس از تمام کاتالوگ‌های انتخاب‌شده حذف شود؟')) {
                      handleRemoveCoursesFromActiveCatalog();
                    }
                  }}
                  className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-3 py-1.5 rounded font-bold text-slate-800 flex items-center gap-1"
                >
                  <span>⌃</span>
                  <span>حذف تک درس از چند کاتالوگ</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={overrideCourseProperty}
                    onChange={e => setOverrideCourseProperty(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>مقدار دهی ویژگی درس</span>
                </label>
                <select
                  disabled={!overrideCourseProperty}
                  value={selectedCourseTypeOverride}
                  onChange={e => setSelectedCourseTypeOverride(e.target.value)}
                  className="bg-white border border-slate-300 px-2 py-1 rounded text-xs disabled:opacity-50"
                >
                  <option value="GENERAL">عمومی (GENERAL)</option>
                  <option value="CORE">پایه (CORE)</option>
                  <option value="MAJOR">تخصصی (MAJOR)</option>
                  <option value="ELECTIVE">اختیاری (ELECTIVE)</option>
                  <option value="THESIS">پایان‌نامه (THESIS)</option>
                  <option value="INTERNSHIP">کارآموزی (INTERNSHIP)</option>
                  <option value="OTHER">سایر (OTHER)</option>
                </select>

                <button
                  onClick={handleTransferSelectedCoursesToCatalog}
                  className="bg-slate-200 hover:bg-indigo-600 hover:text-white border border-slate-400 px-4 py-1.5 rounded font-bold text-slate-800 transition-colors flex items-center gap-1 shadow-sm"
                >
                  <span>⌄</span>
                  <span>انتقال دروس انتخابی</span>
                </button>
              </div>
            </div>

            {/* Bottom Section: دروس کاتالوگ و پنل ویژگی‌ها */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left Grid: دروس کاتالوگ (8 Cols) */}
              <div className="md:col-span-8 border border-slate-300 rounded-lg overflow-hidden bg-white">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>دروس کاتالوگ {selectedCatalogId} ({activeCatalog?.term})</span>
                  <div className="flex items-center gap-2">
                    <span className="font-normal text-slate-600">جستجو :</span>
                    <input
                      type="text"
                      value={catalogCourseSearch}
                      onChange={e => setCatalogCourseSearch(e.target.value)}
                      placeholder="کد یا نام..."
                      className="bg-white border border-slate-300 px-2 py-0.5 rounded text-xs w-36"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2 border-l border-slate-200 text-center w-24">کد درس</th>
                        <th className="p-2 border-l border-slate-200">نام درس</th>
                        <th className="p-2 border-l border-slate-200">ویژگی (نوع درس)</th>
                        <th className="p-2 border-l border-slate-200 text-center w-14">واحد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeAssignedCourses
                        .filter(c => !catalogCourseSearch.trim() || c.title.includes(catalogCourseSearch) || c.code.includes(catalogCourseSearch))
                        .map(course => (
                          <tr
                            key={course.id}
                            onClick={() => setSelectedCatalogCourseId(course.id)}
                            className={`border-b border-slate-100 cursor-pointer ${
                              selectedCatalogCourseId === course.id ? 'bg-indigo-100 font-bold text-indigo-950' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="p-2 border-l border-slate-200 text-center font-mono">{course.code}</td>
                            <td className="p-2 border-l border-slate-200 font-semibold text-slate-900">{course.title}</td>
                            <td className="p-2 border-l border-slate-200">{course.courseType}</td>
                            <td className="p-2 border-l border-slate-200 text-center font-mono font-bold">{course.units}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Panel: تنظیمات پیش‌نیاز، هم‌نیاز و وضعیت نمره (4 Cols) */}
              <div className="md:col-span-4 border border-slate-300 rounded-lg overflow-hidden bg-white flex flex-col justify-between">
                <div>
                  <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 text-xs font-bold text-slate-700">
                    مشخصات درس انتخابی در کاتالوگ
                  </div>
                  <div className="p-3 space-y-3 text-xs">
                    <div>
                      <span className="text-slate-600 font-medium">پیش‌نیاز :</span>
                      <input
                        type="text"
                        defaultValue={courseBank.find(c => c.id === selectedCatalogCourseId)?.prerequisites || '—'}
                        className="w-full mt-1 bg-slate-50 border border-slate-300 px-2 py-1 rounded font-mono text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-slate-600 font-medium">هم‌نیاز :</span>
                      <input
                        type="text"
                        defaultValue={courseBank.find(c => c.id === selectedCatalogCourseId)?.corequisites || '—'}
                        className="w-full mt-1 bg-slate-50 border border-slate-300 px-2 py-1 rounded font-mono text-xs"
                      />
                    </div>
                    <div className="border-t border-slate-200 pt-2 space-y-2">
                      <span className="font-bold text-slate-700 block">وضعیت نمره پیش‌فرض :</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[11px] text-slate-500">حداقل قبولی:</span>
                          <input type="text" defaultValue="10.00" className="w-full border border-slate-300 px-2 py-1 rounded text-center font-mono font-bold text-xs" />
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500">مردودی:</span>
                          <input type="text" defaultValue="0 - 9.99" className="w-full border border-slate-300 px-2 py-1 rounded text-center font-mono text-xs" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-2 bg-slate-50 border-t border-slate-200 flex justify-end gap-1">
                  <button onClick={() => showToast('تنظیمات درس در کاتالوگ ذخیره شد.')} className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-4 py-1 rounded text-xs font-bold text-slate-800">
                    ✔️ ذخیره
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Window Buttons */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('TAB1_CATALOG')}
                  className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-6 py-1.5 rounded text-xs font-bold text-slate-800 shadow-sm"
                >
                  &lt; قبلی
                </button>
                <button
                  onClick={() => setActiveTab('TAB_SEMESTERS')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 px-6 py-1.5 rounded text-xs font-bold shadow-sm"
                >
                  رفتن به ترم‌بندی چارت &gt;
                </button>
              </div>
              <button
                onClick={() => showToast('خروج از پنجره کاتالوگ رشته')}
                className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-6 py-1.5 rounded text-xs font-bold text-slate-800 shadow-sm flex items-center gap-1.5"
              >
                <span>🚪</span>
                <span>خروج</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3 Content: بررسی و خاتمه (Verification & Finalization) */}
        {activeTab === 'TAB3_VERIFY' && (
          <div className="p-4 bg-white space-y-4 text-xs">
            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
              <h3 className="font-extrabold text-indigo-950 text-sm flex items-center gap-2">
                <span>🛡️</span>
                <span>ماتریس تطابق واحدها، ترم‌بندی و اعتبارسنجی نهایی — {activeCatalog?.term} ({activeCatalog?.majorName})</span>
              </h3>
              <p className="text-indigo-800 text-xs">
                نتایج زیر خروجی مستقیم موتور اعتبارسنجی برنامهٔ درسی است (۱۱ بررسی؛ عدم وجود خطا = اجازهٔ پیشرفت در چرخهٔ تأیید).
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-white border border-indigo-300 font-bold text-indigo-900">
                  وضعیت نسخه: {activeDetail?.status ?? '—'}
                </span>
                <span className={`px-2.5 py-1 rounded-lg border font-bold ${verifyErrorCount === 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'}`}>
                  {verifyErrorCount === 0 ? `✓ بدون خطا (${verifyWarnCount} هشدار)` : `✗ ${verifyErrorCount} خطای مانع تأیید ${verifyWarnCount ? `+ ${verifyWarnCount} هشدار` : ''}`}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 font-bold text-slate-700">
                  {verifyPercent}٪ از ۱۱ بررسی سبز
                </span>
              </div>
              {detailLoading && <p className="text-indigo-500 font-bold">⏳ در حال بارگیری نتایج اعتبارسنجی…</p>}
              {detailError && <p className="text-rose-600 font-bold">⚠️ {detailError}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-slate-300 rounded-lg p-3 bg-white space-y-2">
                <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-2">✅ بررسی تطابق واحدها</h4>
                {[
                  ['UNITS_COVER_MIN', `تأمین ${activeDetail?.totalRequiredUnits ?? 0} واحد الزامی — تعریف‌شده: ${activeDetailTotalUnits}`],
                  ['SEMESTER_LOAD', `سقف واحد هر نیمسال: ${activeDetail?.maxUnitsPerTerm ?? 'نامشخص'}`],
                  ['GRADUATION_COVERAGE', 'پوشش شروط فارغ‌التحصیلی'],
                  ['COURSE_TYPES_COMPLETE', 'تکمیل نقش‌های درسی'],
                ].map(([id, label]) => {
                  const check = findCheck(id as string);
                  return (
                    <div key={id} className="flex justify-between items-center gap-2 p-2 rounded bg-slate-50">
                      <span>{label}</span>
                      {!check
                        ? <span className="font-mono font-bold text-emerald-700 whitespace-nowrap">✓ منطبق</span>
                        : <span className={`font-mono font-bold whitespace-nowrap ${check.severity === 'ERROR' ? 'text-rose-700' : 'text-amber-700'}`}>{check.severity === 'ERROR' ? '✗ خطا' : '⚠ هشدار'}</span>}
                    </div>
                  );
                })}
              </div>

              <div className="border border-slate-300 rounded-lg p-3 bg-white space-y-2">
                <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-2">📅 وضعیت ترم‌بندی چارت</h4>
                <div className="flex justify-between items-center p-2 rounded bg-slate-50">
                  <span>واحدهای چارت ({activeDetail?.courses.length ?? 0} درس):</span>
                  <span className="font-mono font-bold text-emerald-700">{activeDetailTotalUnits} واحد</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-50">
                  <span>دروس بدون ترم مصوب:</span>
                  <span className={`font-mono font-bold ${activeDetailUnassigned === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{activeDetailUnassigned} درس</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-50">
                  <span>اتصال به انتخاب واحد:</span>
                  <span className="font-mono font-bold text-emerald-700">{isVersionLive ? 'فعال (خودکار) ✓' : 'پس از انتشار'}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-50">
                  <span>تطبیق فارغ‌التحصیلی:</span>
                  <span className={`font-mono font-bold ${!findCheck('GRADUATION_COVERAGE') ? 'text-emerald-700' : 'text-amber-700'}`}>{!findCheck('GRADUATION_COVERAGE') ? 'آماده بررسی ✓' : 'نیاز به بررسی'}</span>
                </div>
              </div>

              <div className="border border-slate-300 rounded-lg p-3 bg-white space-y-2">
                <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-2">🔍 گراف پیش‌نیازها، هم‌نیازها و هم‌ارزی</h4>
                {[
                  ['PREREQ_CYCLE_FREE', 'عدم وجود حلقهٔ دورانی (Circular Dependency) در گراف پیش‌نیازها'],
                  ['PREREQ_REFERENCES_VALID', 'تمام کدهای پیش‌نیاز در بانک مرکزی دروس تعریف شده‌اند'],
                  ['COREQ_PRESENT', 'هم‌نیازها داخل نسخه و هم‌ترم‌اند'],
                  ['PREREQ_SEMESTER_ORDER', 'ترتیب ترمی پیش‌نیازها رعایت شده است'],
                  ['EQUIVALENCY_DISJOINT', 'دروس هم‌ارز (خوشه) بدون هم‌پوشانی‌اند'],
                ].map(([id, label]) => {
                  const check = findCheck(id as string);
                  return (
                    <div key={id} className={`flex items-start gap-2 p-2 rounded border ${!check ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : check.severity === 'ERROR' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                      <span className="font-black">{!check ? '✓' : check.severity === 'ERROR' ? '✗' : '⚠'}</span>
                      <span>{check ? check.message : label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-extrabold text-emerald-950 text-sm">
                  {isVersionLive ? 'نسخهٔ منتشره — تغییر فقط با نسخهٔ جدید (Revision)' : verifyErrorCount === 0 ? 'آمادهٔ پیشرفت در چرخهٔ تأیید' : 'خطاهای اعتبارسنجی مانع پیشرفت‌اند'}
                </p>
                <p className="text-emerald-800 text-xs">چرخهٔ مصوب: DRAFT ← REVIEW ← APPROVED ← PUBLISHED ← ARCHIVED (نسخه‌های منتشر خودکار در انتخاب واحد فعال‌اند).</p>
              </div>
              <button
                onClick={runLifecycle}
                disabled={lifecycleBusy}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold px-6 py-2 rounded-xl shadow-md transition-colors"
              >
                {lifecycleBusy ? '⏳ در حال انجام…' : activeDetail?.status === 'DRAFT' ? '📤 ارسال برای بررسی (REVIEW)'
                  : activeDetail?.status === 'REVIEW' ? '✅ تأیید نهایی (APPROVED)'
                  : activeDetail?.status === 'APPROVED' ? '🚀 انتشار (PUBLISHED)'
                  : '🆕 ساخت نسخهٔ جدید (Revision)'}
              </button>
            </div>

            {/* Bottom Window Buttons */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('TAB_SEMESTERS')}
                  className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-6 py-1.5 rounded text-xs font-bold text-slate-800 shadow-sm"
                >
                  &lt; قبلی
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'TAB4_TRANSFER' && (
          <div className="p-4 bg-white space-y-4">
            {/* Top Box: اطلاعات کاتالوگ مبدا */}
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 text-xs font-bold text-slate-700">
                اطلاعات کاتالوگ مبدا
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-2 border-l border-slate-200 text-center w-24">کد کاتالوگ</th>
                      <th className="p-2 border-l border-slate-200">رشته</th>
                      <th className="p-2 border-l border-slate-200">شیوه آموزشی</th>
                      <th className="p-2 border-l border-slate-200">گرایش</th>
                      <th className="p-2 border-l border-slate-200 text-center w-24">ترم</th>
                      <th className="p-2 border-l border-slate-200 text-center w-28">مجموع واحد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCatalog && (
                      <tr className="bg-indigo-50/60 font-bold text-indigo-950">
                        <td className="p-2 border-l border-slate-200 text-center font-mono">{activeCatalog.id}</td>
                        <td className="p-2 border-l border-slate-200">{activeCatalog.majorName}</td>
                        <td className="p-2 border-l border-slate-200">{activeCatalog.studyMode}</td>
                        <td className="p-2 border-l border-slate-200">{activeCatalog.track}</td>
                        <td className="p-2 border-l border-slate-200 text-center font-mono">{activeCatalog.term}</td>
                        <td className="p-2 border-l border-slate-200 text-center font-mono">{activeCatalog.totalUnits}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Middle Split: Left = نمایش اطلاعات دروس, Right = نمایش اطلاعات نوع درس */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Middle Left: نمایش اطلاعات دروس (6 Cols) */}
              <div className="md:col-span-6 border border-slate-300 rounded-lg overflow-hidden bg-white">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 text-xs font-bold text-slate-700">
                  نمایش اطلاعات دروس
                </div>
                <div className="overflow-x-auto max-h-56 overflow-y-auto">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2 border-l border-slate-200 text-center w-24">کد درس</th>
                        <th className="p-2 border-l border-slate-200">نام درس</th>
                        <th className="p-2 border-l border-slate-200 text-center w-24">تعداد واحد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeAssignedCourses.map(course => (
                        <tr key={course.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-2 border-l border-slate-200 text-center font-mono">{course.code}</td>
                          <td className="p-2 border-l border-slate-200">{course.title}</td>
                          <td className="p-2 border-l border-slate-200 text-center font-mono font-bold">{course.units}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Middle Right: نمایش اطلاعات نوع درس (6 Cols) */}
              <div className="md:col-span-6 border border-slate-300 rounded-lg overflow-hidden bg-white flex flex-col justify-between">
                <div>
                  <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 text-xs font-bold text-slate-700">
                    نمایش اطلاعات نوع درس
                  </div>
                  <div className="overflow-x-auto max-h-44 overflow-y-auto">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2 border-l border-slate-200 text-center w-14">کد</th>
                          <th className="p-2 border-l border-slate-200">عنوان</th>
                          <th className="p-2 border-l border-slate-200 text-center w-20">* جمع ۱</th>
                          <th className="p-2 border-l border-slate-200 text-center w-20">* جمع ۲</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseTypeSummary.map(row => (
                          <tr key={row.code} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-1.5 border-l border-slate-200 text-center font-mono font-bold">{row.code}</td>
                            <td className="p-1.5 border-l border-slate-200">{row.title}</td>
                            <td className="p-1.5 border-l border-slate-200 text-center font-mono font-bold text-slate-700">
                              {row.maxAllowed > 0 ? row.maxAllowed : '•'}
                            </td>
                            <td className="p-1.5 border-l border-slate-200 text-center font-mono font-bold text-indigo-700">
                              {row.actualAssigned > 0 ? row.actualAssigned : '•'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Red Footnote Notes matching Image 4 */}
                <div className="p-2.5 bg-rose-50/70 border-t border-rose-200 text-[11px] space-y-1 text-rose-700 font-medium">
                  <p>* جمع ۱ : حداکثر تعداد واحد های لازم بر اساس نوع درس می باشد که در کاتالوگ ثبت شده است.</p>
                  <p>* جمع ۲ : مجموع واحدهای دروسی میباشد که در کاتالوگ ثبت شده است.</p>
                </div>
              </div>
            </div>

            {/* Bottom Section: اطلاعات کاتالوگ مقصد */}
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50 space-y-3">
              <div className="text-xs font-bold text-slate-700 border-b border-slate-200 pb-1">
                اطلاعات کاتالوگ مقصد
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs">
                {/* Major Select */}
                <div className="md:col-span-6 flex items-center gap-2">
                  <span className="font-bold text-slate-700 whitespace-nowrap">کد رشته :</span>
                  <input
                    type="text"
                    value={transferTargetMajorCode}
                    onChange={e => setTransferTargetMajorCode(e.target.value)}
                    className="w-14 bg-yellow-100 border border-slate-400 px-2 py-1 text-center font-bold font-mono rounded"
                  />
                  <select
                    value={transferTargetMajorCode}
                    onChange={e => setTransferTargetMajorCode(e.target.value)}
                    className="flex-1 bg-white border border-slate-300 px-2.5 py-1 rounded font-bold text-slate-800"
                  >
                    {majors.map(m => (
                      <option key={m.code} value={m.code}>
                        {m.name} / مقطع: {m.degreeLevel}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Study Mode */}
                <div className="md:col-span-2 flex items-center gap-1.5">
                  <span className="text-slate-700 whitespace-nowrap">شیوه :</span>
                  <select
                    value={transferTargetStudyMode}
                    onChange={e => setTransferTargetStudyMode(e.target.value)}
                    className="w-full bg-white border border-slate-300 px-2 py-1 rounded text-xs"
                  >
                    <option value="آموزشی">آموزشی</option>
                    <option value="آموزشی-پژوهشی">آموزشی-پژوهشی</option>
                    <option value="پژوهش‌محور">پژوهش‌محور</option>
                    <option value="الکترونیکی">الکترونیکی</option>
                  </select>
                </div>

                {/* Track */}
                <div className="md:col-span-2 flex items-center gap-1.5">
                  <span className="text-slate-700 whitespace-nowrap">گرایش :</span>
                  <select
                    value={transferTargetTrack}
                    onChange={e => setTransferTargetTrack(e.target.value)}
                    className="w-full bg-white border border-slate-300 px-2 py-1 rounded text-xs"
                  >
                    {(majors.find(m => m.code === transferTargetMajorCode)?.tracks || ['نامشخص']).map((t, idx) => (
                      <option key={idx} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Term */}
                <div className="md:col-span-2 flex items-center gap-1.5">
                  <span className="text-slate-700 whitespace-nowrap">ترم ورود :</span>
                  <select
                    value={transferTargetTerm}
                    onChange={e => setTransferTargetTerm(e.target.value)}
                    className="w-full bg-white border border-slate-300 px-2 py-1 rounded text-xs font-mono"
                  >
                    {ALL_TERMS.slice(0, 15).map(term => (
                      <option key={term} value={term}>{term}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-2 text-xs">
                                <div className="space-y-1.5 text-slate-700">
                  <p className="flex items-center gap-2 font-bold text-emerald-800">
                    <span>🔁</span>
                    <span>انتقال کامل به‌صورت Deep Clone در موتور نسخه‌ها (cloneFromId)</span>
                  </p>
                  <p className="text-[11px] text-slate-500 pr-6">
                    دروس، پیش‌نیاز/هم‌نیازها (logicTree)، نمرهٔ قبولی، ترم‌بندی و شروط فارغ‌التحصیلی همگی در نسخهٔ جدید کپی می‌شوند — طبق قاعدهٔ D1 (نسخهٔ تأییدشده تغییرناپذیر است).
                  </p>
                </div>

                <button
                  onClick={handleExecuteCatalogTransfer}
                  className="bg-gradient-to-r from-indigo-700 to-indigo-900 hover:from-indigo-800 hover:to-indigo-950 text-white font-extrabold px-8 py-2 rounded-lg shadow-md transition-all text-xs flex items-center gap-2"
                >
                  <span>🚀</span>
                  <span>انتقال و کپی کاتالوگ و چارت</span>
                </button>
              </div>
            </div>

            {/* Bottom Window Buttons */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <button
                onClick={() => setActiveTab('TAB3_VERIFY')}
                className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-6 py-1.5 rounded text-xs font-bold text-slate-800 shadow-sm"
              >
                &lt; قبلی
              </button>
              <button
                onClick={() => showToast('خروج از پنجره کاتالوگ رشته')}
                className="bg-slate-200 hover:bg-slate-300 border border-slate-400 px-6 py-1.5 rounded text-xs font-bold text-slate-800 shadow-sm flex items-center gap-1.5"
              >
                <span>🚪</span>
                <span>خروج</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: ماتریس تطبیق فارغ‌التحصیلی */}
      {activeModal === 'GRADUATION_AUDIT_REPORT' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-4xl w-full overflow-hidden print:shadow-none print:border-0 print:rounded-none print:max-w-full animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-emerald-900 to-teal-950 text-white px-4 py-3 flex items-center justify-between print:hidden">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>🎓</span>
                <span>ماتریس تطبیق سرفصل و شرایط فارغ‌التحصیلی ({activeMajor.name})</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-300 hover:text-white font-bold">✕</button>
            </div>
            <div className="print-area p-4 space-y-4 text-xs max-h-[75vh] overflow-y-auto print:max-h-none print:overflow-visible">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <div className="text-lg font-black text-emerald-950 font-mono">{grandTotalSemesterUnits}</div>
                  <div className="text-[11px] text-emerald-700">کل واحدهای مصوب در چارت</div>
                </div>
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-center">
                  <div className="text-lg font-black text-indigo-950 font-mono">{activeMajor.minUnits}</div>
                  <div className="text-[11px] text-indigo-700">حداقل واحد فارغ‌التحصیلی</div>
                </div>
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-center">
                  <div className="text-lg font-black text-sky-950 font-mono">
                    {grandTotalSemesterUnits >= activeMajor.minUnits ? 'تکمیل ✓' : `${activeMajor.minUnits - grandTotalSemesterUnits} واحد کمبود`}
                  </div>
                  <div className="text-[11px] text-sky-700">وضعیت تعادل واحدها</div>
                </div>
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-center">
                  <div className="text-lg font-black text-purple-950 font-mono">{verifyPercent}٪</div>
                  <div className="text-[11px] text-purple-700">تطابق اعتبارسنجی موتور ({verifyErrorCount} خطا)</div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                    <tr>
                      <th className="p-2 border-l border-slate-200 text-center w-16">ترم</th>
                      <th className="p-2 border-l border-slate-200">دروس مصوب الزامی</th>
                      <th className="p-2 border-l border-slate-200 text-center w-24">مجموع واحد</th>
                      <th className="p-2 border-l border-slate-200 text-center w-28">وضعیت تطبیق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(sNum => {
                      const list = activeCatalogSemesterMap[sNum] || [];
                      const u = list.reduce((sum, item) => {
                        const c = courseBank.find(crs => crs.id === item.courseId);
                        return sum + (c ? c.units : 0);
                      }, 0);

                      return (
                        <tr key={sNum} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-2 border-l border-slate-200 text-center font-bold">ترم {sNum}</td>
                          <td className="p-2 border-l border-slate-200">
                            {list.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {list.map(it => {
                                  const c = courseBank.find(crs => crs.id === it.courseId);
                                  return (
                                    <span key={it.courseId} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] border border-slate-200">
                                      {c?.title} ({c?.units}و)
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">درسی تعریف نشده</span>
                            )}
                          </td>
                          <td className="p-2 border-l border-slate-200 text-center font-mono font-bold">{u} واحد</td>
                          <td className="p-2 border-l border-slate-200 text-center">
                            {u > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                تطبیق‌یافته ✓
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px]">
                                اختیاری
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center print:hidden">
              <button
                onClick={() => window.print()}
                className="px-4 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs flex items-center gap-1.5"
              >
                <span>🖨️</span>
                <span>چاپ کارنامه تطبیق فارغ‌التحصیلی</span>
              </button>
              <button onClick={() => setActiveModal(null)} className="px-5 py-1.5 rounded bg-slate-200 text-slate-700 font-bold text-xs">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: تعریف رشته جدید (Matching Button 1) */}
      {activeModal === 'NEW_MAJOR' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>📁</span>
                <span>تعریف رشته تحصیلی جدید</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-300 hover:text-white font-bold">✕</button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">کد رشته (عددی):</label>
                  <input
                    type="text"
                    value={newMajorForm.code}
                    onChange={e => setNewMajorForm({ ...newMajorForm, code: e.target.value })}
                    placeholder="مثال: 512"
                    className="w-full border border-slate-300 px-3 py-1.5 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">مقطع تحصیلی:</label>
                  <select
                    value={newMajorForm.degreeLevel}
                    onChange={e => setNewMajorForm({ ...newMajorForm, degreeLevel: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-1.5 rounded"
                  >
                    <option value="کاردانی">کاردانی</option>
                    <option value="کارشناسی پیوسته">کارشناسی پیوسته</option>
                    <option value="کارشناسی ناپیوسته">کارشناسی ناپیوسته</option>
                    <option value="کارشناسی ارشد">کارشناسی ارشد</option>
                    <option value="دکتری تخصصی">دکتری تخصصی</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">نام کامل رشته تحصیلی:</label>
                <input
                  type="text"
                  value={newMajorForm.name}
                  onChange={e => setNewMajorForm({ ...newMajorForm, name: e.target.value })}
                  placeholder="مثال: مهندسی هوش مصنوعی و رباتیک"
                  className="w-full border border-slate-300 px-3 py-1.5 rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">دانشکده مربوطه:</label>
                  <input
                    type="text"
                    value={newMajorForm.facultyName}
                    onChange={e => setNewMajorForm({ ...newMajorForm, facultyName: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-1.5 rounded"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">گروه آموزشی:</label>
                  <input
                    type="text"
                    value={newMajorForm.departmentName}
                    onChange={e => setNewMajorForm({ ...newMajorForm, departmentName: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-1.5 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">حداقل کل واحدهای فارغ‌التحصیلی:</label>
                <input
                  type="number"
                  value={newMajorForm.minUnits}
                  onChange={e => setNewMajorForm({ ...newMajorForm, minUnits: Number(e.target.value) })}
                  className="w-32 border border-slate-300 px-3 py-1.5 rounded font-mono font-bold"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-1.5 rounded bg-slate-200 text-slate-700 font-bold text-xs">
                انصراف
              </button>
              <button
                onClick={() => {
                  if (!newMajorForm.code || !newMajorForm.name) {
                    alert('لطفاً کد و نام رشته را وارد فرمایید.');
                    return;
                  }
                  const created: MajorItem = {
                    id: Number(newMajorForm.code) || Math.floor(Math.random() * 900) + 100,
                    code: newMajorForm.code,
                    name: newMajorForm.name,
                    degreeLevel: newMajorForm.degreeLevel,
                    departmentName: newMajorForm.departmentName,
                    facultyName: newMajorForm.facultyName,
                    minUnits: newMajorForm.minUnits,
                    tracks: ['نامشخص'],
                  };
                  setMajors(prev => [...prev, created]);
                  setSelectedMajorCode(created.code);
                  setActiveModal(null);
                  showToast(`رشته جدید «${created.name}» با موفقیت تعریف شد.`);
                }}
                className="px-5 py-1.5 rounded bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs shadow"
              >
                ذخیره و ثبت رشته
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: مشخصات رشته‌های دانشگاه (Matching Button 2) */}
      {activeModal === 'MAJOR_SPECS' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-3xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-sky-900 to-indigo-950 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>📑</span>
                <span>مشخصات و کاتالوگ رشته‌های فعال دانشگاه</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-300 hover:text-white font-bold">✕</button>
            </div>
            <div className="p-4 space-y-3 text-xs max-h-[70vh] overflow-y-auto">
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-l border-slate-200 text-center w-16">کد رشته</th>
                    <th className="p-2 border-l border-slate-200">نام رشته</th>
                    <th className="p-2 border-l border-slate-200">مقطع تحصیلی</th>
                    <th className="p-2 border-l border-slate-200">دانشکده و گروه</th>
                    <th className="p-2 border-l border-slate-200 text-center w-20">حداقل واحد</th>
                    <th className="p-2 border-l border-slate-200">گرایش‌های فعال</th>
                  </tr>
                </thead>
                <tbody>
                  {majors.map(m => (
                    <tr key={m.code} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-2 border-l border-slate-200 text-center font-mono font-bold text-slate-700">{m.code}</td>
                      <td className="p-2 border-l border-slate-200 font-bold text-indigo-950">{m.name}</td>
                      <td className="p-2 border-l border-slate-200">{m.degreeLevel}</td>
                      <td className="p-2 border-l border-slate-200 text-slate-600">{m.facultyName} / {m.departmentName}</td>
                      <td className="p-2 border-l border-slate-200 text-center font-mono font-bold">{m.minUnits}</td>
                      <td className="p-2 border-l border-slate-200 text-slate-500">{m.tracks.join('، ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button onClick={() => setActiveModal(null)} className="px-5 py-1.5 rounded bg-slate-200 text-slate-700 font-bold text-xs">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: دانشکده - رشته - گروه (Matching Button 3) */}
      {activeModal === 'FACULTY_DEPT_TREE' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-amber-900 to-slate-900 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>🏫</span>
                <span>درخت ساختار دانشکده - رشته - گروه آموزشی</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-300 hover:text-white font-bold">✕</button>
            </div>
            <div className="p-4 space-y-4 text-xs max-h-[70vh] overflow-y-auto">
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-3">
                <div className="font-extrabold text-indigo-950 flex items-center gap-2">
                  <span>🏛️</span>
                  <span>دانشکده فنی و مهندسی</span>
                </div>
                <div className="mr-4 space-y-2 border-r-2 border-indigo-200 pr-3">
                  <div className="font-bold text-slate-800">▫️ گروه مهندسی کامپیوتر و فناوری اطلاعات</div>
                  <ul className="mr-4 space-y-1 text-slate-600">
                    <li>• کد ۴۱۲ : مهندسی نرم‌افزار (کارشناسی پیوسته)</li>
                    <li>• کد ۴۱۳ : مهندسی نرم‌افزار - انتقالی (کارشناسی پیوسته)</li>
                    <li>• کد ۱۱۳ : مهندسی کامپیوتر (کارشناسی ارشد)</li>
                  </ul>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-3">
                <div className="font-extrabold text-emerald-950 flex items-center gap-2">
                  <span>🌾</span>
                  <span>دانشکده کشاورزی و صنایع غذایی</span>
                </div>
                <div className="mr-4 space-y-2 border-r-2 border-emerald-200 pr-3">
                  <div className="font-bold text-slate-800">▫️ گروه صنایع غذایی و علوم تغذیه</div>
                  <ul className="mr-4 space-y-1 text-slate-600">
                    <li>• کد ۱۴ : مهندسی علوم و صنایع غذایی (کارشناسی ناپیوسته)</li>
                  </ul>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-3">
                <div className="font-extrabold text-amber-950 flex items-center gap-2">
                  <span>💼</span>
                  <span>دانشکده علوم انسانی و مدیریت</span>
                </div>
                <div className="mr-4 space-y-2 border-r-2 border-amber-200 pr-3">
                  <div className="font-bold text-slate-800">▫️ گروه مدیریت و اقتصاد</div>
                  <ul className="mr-4 space-y-1 text-slate-600">
                    <li>• کد ۲۰۱ : حسابداری و مدیریت مالی (کارشناسی پیوسته)</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button onClick={() => setActiveModal(null)} className="px-5 py-1.5 rounded bg-slate-200 text-slate-700 font-bold text-xs">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: تعریف گرایش (Matching Button 4) */}
      {activeModal === 'NEW_TRACK' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-emerald-900 to-slate-900 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>🗂️</span>
                <span>تعریف گرایش تحصیلی جدید</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-300 hover:text-white font-bold">✕</button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">انتخاب رشته مادر:</label>
                <select
                  value={newTrackForm.majorCode}
                  onChange={e => setNewTrackForm({ ...newTrackForm, majorCode: e.target.value })}
                  className="w-full border border-slate-300 px-3 py-1.5 rounded"
                >
                  {majors.map(m => (
                    <option key={m.code} value={m.code}>{m.code} — {m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">عنوان گرایش جدید:</label>
                <input
                  type="text"
                  value={newTrackForm.trackName}
                  onChange={e => setNewTrackForm({ ...newTrackForm, trackName: e.target.value })}
                  placeholder="مثال: بیوانفورماتیک و صنایع نوین"
                  className="w-full border border-slate-300 px-3 py-1.5 rounded"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-1.5 rounded bg-slate-200 text-slate-700 font-bold text-xs">
                انصراف
              </button>
              <button
                onClick={() => {
                  if (!newTrackForm.trackName.trim()) {
                    alert('لطفاً نام گرایش را وارد فرمایید.');
                    return;
                  }
                  setMajors(prev =>
                    prev.map(m =>
                      m.code === newTrackForm.majorCode
                        ? { ...m, tracks: Array.from(new Set([...m.tracks, newTrackForm.trackName.trim()])) }
                        : m
                    )
                  );
                  setActiveModal(null);
                  showToast(`گرایش «${newTrackForm.trackName}» با موفقیت اضافه شد.`);
                }}
                className="px-5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow"
              >
                افزودن گرایش
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: گزارش رشته‌ها (Matching Button 5) */}
      {activeModal === 'MAJOR_REPORT' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-4xl w-full overflow-hidden print:shadow-none print:border-0 print:rounded-none print:max-w-full animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-rose-900 to-slate-900 text-white px-4 py-3 flex items-center justify-between print:hidden">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>📊</span>
                <span>گزارش جامع آماری کاتالوگ و سرفصل رشته‌های دانشگاه</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-300 hover:text-white font-bold">✕</button>
            </div>
            <div className="print-area p-4 space-y-4 text-xs max-h-[75vh] overflow-y-auto print:max-h-none print:overflow-visible">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-center">
                  <div className="text-lg font-black text-indigo-950 font-mono">{majors.length}</div>
                  <div className="text-[11px] text-indigo-700">تعداد کل رشته‌ها</div>
                </div>
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-center">
                  <div className="text-lg font-black text-sky-950 font-mono">{catalogs.length}</div>
                  <div className="text-[11px] text-sky-700">تعداد کل کاتالوگ‌های ترمیک</div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <div className="text-lg font-black text-emerald-950 font-mono">{courseBank.length}</div>
                  <div className="text-[11px] text-emerald-700">بانک عناوین دروس</div>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                  <div className="text-lg font-black text-amber-950 font-mono">{catalogs.filter(c => c.isFinalized).length}</div>
                  <div className="text-[11px] text-amber-700">نسخه‌های مصوب/منتشر (غیر پیش‌نویس)</div>
                </div>
              </div>

              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-l border-slate-200 text-center w-16">کد</th>
                    <th className="p-2 border-l border-slate-200">نام رشته</th>
                    <th className="p-2 border-l border-slate-200">مقطع</th>
                    <th className="p-2 border-l border-slate-200 text-center">کاتالوگ‌های فعال</th>
                    <th className="p-2 border-l border-slate-200 text-center">واحدهای مصوب</th>
                    <th className="p-2 border-l border-slate-200 text-center">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {majors.map(m => {
                    const count = catalogs.filter(c => c.majorCode === m.code).length;
                    return (
                      <tr key={m.code} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2 border-l border-slate-200 text-center font-mono font-bold">{m.code}</td>
                        <td className="p-2 border-l border-slate-200 font-bold text-slate-800">{m.name}</td>
                        <td className="p-2 border-l border-slate-200">{m.degreeLevel}</td>
                        <td className="p-2 border-l border-slate-200 text-center font-mono">{count} ترم</td>
                        <td className="p-2 border-l border-slate-200 text-center font-mono font-bold">{m.minUnits} واحد</td>
                        <td className="p-2 border-l border-slate-200 text-center">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${count > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {count > 0 ? 'دارای نسخهٔ مصوب ✓' : 'در حال تدوین (پیش‌نویس)'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center print:hidden">
              <button
                onClick={() => window.print()}
                className="px-4 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs flex items-center gap-1.5"
              >
                <span>🖨️</span>
                <span>چاپ گزارش سرفصل‌ها</span>
              </button>
              <button onClick={() => setActiveModal(null)} className="px-5 py-1.5 rounded bg-slate-200 text-slate-700 font-bold text-xs">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
