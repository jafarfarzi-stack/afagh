// ═══════════════════════════════════════════════════════════════════════
//  قرارداد دادهٔ پنل دانشجویان/اعضا — بدون React، بدون کوئری.
//  (تا پیش از این داخل فایل کلاینت بود و صفحهٔ سرور مجبور بود type را از
//   یک ماژول „use client“ وارد کند.)
// ═══════════════════════════════════════════════════════════════════════
import type { TranscriptRow } from './actions';

export type StudentItem = {
  id: number;
  studentCode: string;
  nationalCode: string;
  firstName: string;
  lastName: string;
  mobile: string;
  entryYear: number;
  entryTerm: number;
  status: string;
  samaStatusCode?: string | null;
  quotaType: string;
  currentTermNo: number;
  majorName: string;
  majorCode: string;
  facultyName?: string;
  degreeLevel: string;
  degreeLevelId: number;
  degreeCode: string;
  regulationTitle: string;
  fatherName?: string;
  birthCertNo?: string;
  birthDate?: string | null;
  placeOfBirth?: string;
  placeOfIssue?: string;
  nationality?: string | null;
  photoKey?: string | null;
  acceptanceType?: string | null;
  acceptanceAllocation?: string | null;
  studyingMode?: string | null;
  trainingMethod?: string | null;
  graduateDate?: string | null;
  regulationId?: number | null;
  role: string;
};

export type RegulationPick = { id: number; title: string; degreeLevelId: number };

export type Pagination = {
  total: number;
  page: number;
  per: number;
  totalPages: number;
  q: string;
  status: string;
  degree: number;
  sort?: string;
  f_code?: string;
  f_name?: string;
  f_nc?: string;
  f_major?: string;
  f_year?: string;
};

export type StaffItem = {
  id: number;
  staffCode: string;
  nationalCode: string;
  firstName: string;
  lastName: string;
  mobile: string;
  academicRank: string;
  degree: string;
  staffType: string;
  role: string;
  departmentName?: string;
  departmentCode?: string | null;
  facultyName?: string;
  facultyCode?: string | null;
  fieldOfStudy?: string | null;
  fieldMain?: string | null;
  lastDegreeUniversity?: string | null;
  lastDegreeCountryCode?: string | null;
  personnelNo?: string | null;
  hireDate?: string | null;
  bankAccountNo?: string | null;
  cooperationType?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
  maritalStatus?: string | null;
  academicBase?: string | null;
  isActive?: number | null;
};

export type TermGroup = {
  termCode: string;
  termTitle: string | null;
  /** وضعیت همان نیمسال از فایل (نه وضعیت کلی دانشجو) */
  termStatusTitle: string | null;
  /** مشروطی: اول از فایل Mashroot، وگرنه معدل زیر ۱۲ */
  probation: boolean;
  rows: TranscriptRow[];
  taken: number;
  passed: number;
  failed: number;
  points: number;
  gpa: number | null;
  /** جمع تجمیعی تا پایان این نیمسال (سطر «کل» سما) */
  cumTaken: number;
  cumPassed: number;
  cumFailed: number;
  cumPoints: number;
  cumGpa: number | null;
};

export type TranscriptSummary = {
  terms: TermGroup[];
  totalTaken: number;
  totalPassed: number;
  gpa: number | null;
  /** آستانه‌های آیین‌نامه‌ای که با آن حساب شده (برای نمایش در سربرگ) */
  passGrade: number;
  probThreshold: number;
};

export type CodeLabels = {
  accept: Record<string, string>;
  acceptByTarget: Record<string, string>;
  period: Record<string, string>;
  quota: Record<string, string>;
};
