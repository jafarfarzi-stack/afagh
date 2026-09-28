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
  gender?: string | null;
  isActive?: number | null;
  userId?: number | null;
  placeOfBirth?: string;
  placeOfIssue?: string;
  nationality?: string | null;
  photoKey?: string | null;
  acceptanceType?: string | null;
  acceptanceAllocation?: string | null;
  studyingMode?: string | null;
  trainingMethod?: string | null;
  graduateDate?: string | null;
  graduateDegreeLevelId?: number | null;
  regulationId?: number | null;
  firstNameEn?: string | null;
  lastNameEn?: string | null;
  passportNumber?: string | null;
  role: string;
  // ── پروندهٔ تکمیلی سما (خوابگاه، ولی، مدرک، نظام وظیفه و…) ──
  advisorCode?: string | null;
  documentStatus?: string | null;
  scholarshipType?: string | null;
  militaryStatus?: string | null;
  militaryExemptionNo?: string | null;
  homeTell?: string | null;
  studentCardStatus?: string | null;
  archiveNo?: string | null;
  parvandehNo?: string | null;
  dormName?: string | null;
  dormRoom?: string | null;
  hasDorm?: number | null;
  guardianJobTitle?: string | null;
  guardianPhone?: string | null;
  guardianAddress?: string | null;
  guardianEmail?: string | null;
  diplomaType?: string | null;
  diplomaPlace?: string | null;
  diplomaYear?: string | null;
  diplomaGrade?: string | null;
  pishdPlace?: string | null;
  pishdYear?: string | null;
  pishdGrade?: string | null;
  tuitionType?: string | null;
  tuitionPayer?: number | null;
  englishExamType?: string | null;
  englishScore?: string | null;
  insertDate?: string | null;
  insertTime?: string | null;
  certIssued3m?: number | null;
  documentDeficiency?: string | null;
  unitsRemaining?: number | null;
  eqSemesters?: number | null;
  email?: string | null;
  postalCode?: string | null;
  address?: string | null;
  /** دانشگاه مالک رکورد (برای تشخیص مبدا/منحله در کارنامه) */
  universityId?: number | null;
  /** کد فرستندهٔ ثمین (لینک به دانشگاه مبدا) */
  senderUniversityCode?: string | null;
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
  university?: string;
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
  userId?: number | null;
  userIsActive?: number | null;
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
  /** واحدهای موثر در معدل نیمسال (مخرج معدل) — سطر «موثر» سما */
  effectiveUnits: number;
  /** واحدهای حذف‌شدهٔ احتساب‌نشده در اخذشده — سطر «حذف» سما */
  droppedUnits: number;
  /** جمع تجمیعی تا پایان این نیمسال (سطر «کل» سما) */
  cumTaken: number;
  cumPassed: number;
  cumFailed: number;
  cumPoints: number;
  cumGpa: number | null;
  /** واحدهای موثر تجمیعی در معدل کل (مخرج معدل کل با سیاست آیین‌نامه) — سطر «موثر» سما */
  cumEffectiveUnits: number;
};

export type TranscriptSummary = {
  terms: TermGroup[];
  totalTaken: number;
  totalPassed: number;
  gpa: number | null;
  /** آستانه‌های آیین‌نامه‌ای که با آن حساب شده (برای نمایش در سربرگ) */
  passGrade: number;
  probThreshold: number;
  /** حدنصاب واحد ترم برای احتساب مشروطی (۰ = بدون حد) */
  minUnits: number;
};

export type CodeLabels = {
  accept: Record<string, string>;
  acceptByTarget: Record<string, string>;
  period: Record<string, string>;
  quota: Record<string, string>;
};

/** گزینه‌های چاپ کارنامه (معادل تیک‌های «تنظیمات چاپ» سما) */
export type TranscriptPrintOptions = {
  showLegend: boolean;        // توضیح وضع نمرات
  showBreakdown: boolean;     // جدول وضعیت دروس گذرانده (صفحهٔ دوم)
  showRank: boolean;          // رتبه در رشته ورودی و میانگین کل (محاسبهٔ جدا)
  showNationality: boolean;   // ملیت دانشجو
  showPhoto: boolean;         // عکس دانشجو
  showLogo: boolean;          // آرم دانشگاه
  showAcceptance: boolean;    // نحوه ورود
  showStudyMode: boolean;     // شیوه آموزشی
  thesisQualitative: boolean; // نمرهٔ پایان‌نامه/رساله به‌صورت کیفی
};

export const DEFAULT_PRINT_OPTIONS: TranscriptPrintOptions = {
  showLegend: true,
  showBreakdown: true,
  showRank: false,
  showNationality: true,
  showPhoto: true,
  showLogo: true,
  showAcceptance: true,
  showStudyMode: true,
  thesisQualitative: false,
};

/** دانشگاه مبدا دانشجو برای درج در کارنامه */
export type OriginUniversity = {
  title: string;
  /** true یعنی دانشگاه منحله است و باید برجسته شود */
  dissolved: boolean;
};

/** آمار هم‌رشته‌ای‌های ورودی (رتبه/میانگین — مثل پانوشت سما) */
export type CohortStats = {
  scope: 'year' | 'term';
  /** رتبهٔ معدل کل دانشجو در رشته ورودی (۱ = اول) */
  rank: number | null;
  /** تعداد دانشجویان هم‌رشته ورودی شمارش‌شده */
  total: number;
  /** میانگین معدل هم‌رشته‌ای‌ها */
  avgGpa: number | null;
  /** میانگین واحد گذراندهٔ هم‌رشته‌ای‌ها */
  avgPassed: number | null;
};
