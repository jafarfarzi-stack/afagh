// ════════════════════════════════════════════════════════════════════════
//  قرارداد دادهٔ ماژول برنامهٔ درسی — بدون React، بدون کوئری.
//  (تا این دور داخل فایل `use client` بود و صفحهٔ سرور نمی‌توانست type بگیرد.)
// ════════════════════════════════════════════════════════════════════════
import { type LogicNode } from '@/lib/curriculum-types';

export interface MajorItem {
  id: number;
  code: string;
  name: string;
  degreeLevelId: number | null;
  degreeTitle: string | null;
  /** کد مقطع + تعداد ترم چارت + تکمیلی‌بودن — از degree_level_configs (قابل ویرایش در مرکز کدها) */
  degreeCode?: string | null;
  degreeTermCount?: number | null;
  degreeIsGraduate?: number | null;
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

export interface CourseRow {
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

export interface RuleRow { courseId: number; ruleType: string; logicTree: LogicNode; }
export interface ApprovalRow {
  id: number; approvalType: string; fromStatus: string; toStatus: string;
  decisionNote: string | null; approvedAt: Date | string | null;
}
export interface CheckRow { check: string; severity: 'ERROR' | 'WARN'; message: string; affected: (string | number)[]; }

export interface VersionDetail {
  version: VersionRow & { maxUnitsPerTerm: number | null };
  courses: CourseRow[];
  rules: RuleRow[];
  approvals: ApprovalRow[];
  checks: CheckRow[];
}

export interface BankCourse { id: number; code: string; title: string; units: string; courseType: string; }

export type CurriculumTab = 'CATALOG' | 'COURSES' | 'SEMESTERS' | 'VERIFY' | 'TRANSFER';
