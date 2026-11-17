'use client';

// ═══════════════════════════════════════════════════════════════════════
//  پیش‌نویس (draft) فرم پروندهٔ دانشجو / استاد — منطق خالص، بدون کوئری.
//
//  قاعده‌های طراحی:
//    • یک ویرایش + یک ذخیره: کل فرم در یک آبجکت draft نگه‌داری می‌شود؛
//      دکمهٔ ذخیره فقط «کلیدهای تغییرکرده» را می‌فرستد.
//    • فقط کلیدهای allow-list اکشن سرور (zod `.strict()`) ارسال می‌شوند؛
//      هر کلید ناشناخته باعث رد شدن کل وصله می‌شد.
//    • تاریخ ورود دانشجو در ستون `students.entryDate` «شمسی» ذخیره می‌شود
//      (YYYY-MM-DD) — نه میلادی؛ پس هیچ تبدیل Date/ISO انجام نمی‌شود.
// ═══════════════════════════════════════════════════════════════════════

import { toEnDigits } from '@/lib/persian-search';
import { jalaliMonthLength, toGregorian, toJalali } from '@/lib/calendar';
import type { StaffItem, StudentItem } from '../types';
import { dateToJalali } from '../transcript-utils';

export type ProfileDraft = Record<string, string | number | null>;

/** نتیجهٔ ساخت وصله — یا patch آمادهٔ ارسال، یا خطای اعتبارسنجی */
export type PatchResult = { patch: Record<string, string | number | null> } | { error: string };

/** کلیدهای متنی مجاز دانشجو (هم‌گام با studentProfilePatchSchema در actions.ts) */
export const STUDENT_TEXT_KEYS = [
  'firstName', 'lastName', 'nationalCode', 'status', 'samaStatusCode', 'quotaType', 'acceptanceType', 'studyingMode', 'trainingMethod',
  'address',
  'fatherName', 'birthCertNo', 'placeOfBirth', 'placeOfIssue', 'gender', 'mobile', 'email', 'postalCode',
  'advisorCode', 'documentStatus', 'scholarshipType', 'militaryStatus', 'militaryExemptionNo', 'homeTell',
  'studentCardStatus', 'archiveNo', 'parvandehNo', 'dormName', 'dormRoom', 'guardianJobTitle', 'guardianPhone',
  'diplomaType', 'diplomaPlace', 'diplomaYear', 'diplomaGrade', 'pishdPlace', 'pishdYear', 'pishdGrade',
  'tuitionType', 'englishExamType', 'englishScore', 'documentDeficiency',
] as const satisfies readonly (keyof StudentItem)[];

/** کلیدهای عددیِ همیشه‌عدد دانشجو (۰ پیش‌فرض) */
export const STUDENT_NUM_KEYS = ['hasDorm', 'tuitionPayer', 'certIssued3m', 'eqSemesters', 'degreeLevelId', 'majorId'] as const satisfies readonly (keyof StudentItem)[];

/** کلیدهای متنی مجاز استاد (هم‌گام با staffProfilePatchSchema در actions.ts) */
export const STAFF_TEXT_KEYS = [
  'firstName', 'lastName', 'nationalCode', 'mobile', 'email', 'address', 'birthDate',
  'academicRank', 'degree', 'cooperationType', 'staffType', 'personnelNo', 'hireDate',
  'bankAccountNo', 'academicBase', 'fieldOfStudy', 'lastDegreeUniversity', 'lastDegreeCountryCode',
  'maritalStatus', 'phone',
] as const satisfies readonly (keyof StaffItem)[];

// ── تاریخ شمسیِ ورودی (بدون تبدیل تقویم: ارقام همین‌جا شمسی‌اند) ──

/** `YYYY-MM-DD` (شمسی) → متن ورودی `YYYY/MM/DD` */
export function entryDateInput(v?: string | null): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (!m) return s;
  return `${m[1]}/${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}`;
}

/** پاک‌سازی تایپ کاربر: ارقام فارسی → لاتین، فقط ۸ رقم با اسلش‌های خودکار */
export function formatJalaliDateInput(raw: string): string {
  const d = toEnDigits(raw).replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}/${d.slice(4)}`;
  return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6)}`;
}

/**
 * اعتبارسنجی متن `YYYY/MM/DD` با تقویم جلالی.
 * خروجی: `{ value: 'YYYY-MM-DD' }`، `{ value: null }` برای خالی، یا `{ error }`.
 */
export function parseJalaliEntryDate(raw: string): { value: string | null } | { error: string } {
  const t = toEnDigits(raw).trim();
  if (!t) return { value: null };
  const m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(t);
  if (!m) return { error: 'تاریخ ورود باید به شکل YYYY/MM/DD باشد (مثال: ۱۴۰۳/۰۷/۰۱).' };
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (jy < 1300 || jy > 1500) return { error: 'سال تاریخ ورود باید بین ۱۳۰۰ تا ۱۵۰۰ باشد.' };
  if (jm < 1 || jm > 12) return { error: 'ماه تاریخ ورود باید بین ۱ تا ۱۲ باشد.' };
  const len = jalaliMonthLength(jy, jm);
  if (jd < 1 || jd > len) return { error: `روز تاریخ ورود برای این ماه باید بین ۱ تا ${len} باشد.` };
  return { value: `${m[1]}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}` };
}

/**
 * ترم ورود از ماه تاریخ ورود (اگر قابل استنتاج باشد):
 *   مهر..دی (۷..۱۰) → ترم ۱ | بهمن/اسفند (۱۱،۱۲) → ترم ۲ | فروردین..شهریور (۱..۶) → ترم ۳
 */
export function entryTermFromMonth(jm: number): number | null {
  if (jm >= 7 && jm <= 10) return 1;
  if (jm >= 11 && jm <= 12) return 2;
  if (jm >= 1 && jm <= 6) return 3;
  return null;
}

/** `YYYY-MM-DD` میلادی → متن شمسی `YYYY/MM/DD` (برای تاریخ تولد) */
export function birthDateInput(iso?: string | null): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(iso ?? '').trim());
  if (!m) return '';
  const { jy, jm, jd } = toJalali(Number(m[1]), Number(m[2]), Number(m[3]));
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

/** متن شمسی `YYYY/MM/DD` → `YYYY-MM-DD` میلادی (برای users.birthDate) */
export function parseJalaliBirthDate(raw: string): { value: string | null } | { error: string } {
  const t = toEnDigits(String(raw ?? '')).trim();
  if (!t) return { value: null };
  const m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(t);
  if (!m) return { error: 'تاریخ تولد باید به شکل YYYY/MM/DD باشد.' };
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (jy < 1300 || jy > 1500) return { error: 'سال تاریخ تولد باید بین ۱۳۰۰ تا ۱۵۰۰ باشد.' };
  if (jm < 1 || jm > 12) return { error: 'ماه تاریخ تولد نامعتبر است.' };
  if (jd < 1 || jd > jalaliMonthLength(jy, jm)) return { error: 'روز تاریخ تولد برای این ماه نامعتبر است.' };
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return { value: `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}` };
}

// ── دانشجو ──

export function buildStudentDraft(s: StudentItem): ProfileDraft {
  const d: ProfileDraft = {};
  for (const k of STUDENT_TEXT_KEYS) d[k] = String(s[k] ?? '');
  for (const k of STUDENT_NUM_KEYS) d[k] = Number(s[k] ?? 0);
  d.unitsRemaining = s.unitsRemaining ?? '';
  d.entryYear = s.entryYear;
  d.entryTerm = s.entryTerm;
  d.entryDate = entryDateInput(s.entryDate);
  d.birthDate = birthDateInput(s.birthDate);
  return d;
}

export function studentPatchFromDraft(draft: ProfileDraft, initial: ProfileDraft): PatchResult {
  const patch: Record<string, string | number | null> = {};

  for (const k of STUDENT_TEXT_KEYS) {
    const v = String(draft[k] ?? '').trim();
    if (v !== String(initial[k] ?? '').trim()) patch[k] = v;
  }
  for (const k of STUDENT_NUM_KEYS) {
    const v = Number(draft[k] ?? 0);
    if (v !== Number(initial[k] ?? 0)) patch[k] = v;
  }
  // صفر = «انتخاب نشده» برای کلیدهای خارجی (اسکیمای سرور فقط مثبت می‌پذیرد)
  if (patch.degreeLevelId === 0) patch.degreeLevelId = null;
  if (patch.majorId === 0) patch.majorId = null;

  const ur = draft.unitsRemaining === '' || draft.unitsRemaining == null ? null : Number(draft.unitsRemaining);
  const ur0 = initial.unitsRemaining === '' || initial.unitsRemaining == null ? null : Number(initial.unitsRemaining);
  if (ur !== ur0) patch.unitsRemaining = ur;

  // تاریخ ورود: متن شمسی → همان ارقام با جداکنندهٔ `-` (بدون تبدیل تقویم)
  if (String(draft.entryDate ?? '').trim() !== String(initial.entryDate ?? '').trim()) {
    const parsed = parseJalaliEntryDate(String(draft.entryDate ?? ''));
    if ('error' in parsed) return parsed;
    patch.entryDate = parsed.value ?? '';
  }

  // تاریخ تولد: متن شمسی → ISO میلادی برای users.birthDate
  if (String(draft.birthDate ?? '').trim() !== String(initial.birthDate ?? '').trim()) {
    const parsed = parseJalaliBirthDate(String(draft.birthDate ?? ''));
    if ('error' in parsed) return parsed;
    patch.birthDate = parsed.value ?? '';
  }

  const ey = Number(draft.entryYear ?? 0);
  const et = Number(draft.entryTerm ?? 0);
  if (ey !== Number(initial.entryYear ?? 0)) patch.entryYear = ey;
  if (et !== Number(initial.entryTerm ?? 0)) patch.entryTerm = et;
  if ('entryYear' in patch || 'entryTerm' in patch) {
    if (!Number.isInteger(ey) || ey < 1300 || ey > 1500) return { error: 'سال ورود باید عددی بین ۱۳۰۰ تا ۱۵۰۰ باشد.' };
    if (!Number.isInteger(et) || et < 1 || et > 3) return { error: 'ترم ورود باید ۱ (مهر)، ۲ (بهمن) یا ۳ (تابستان) باشد.' };
  }

  return { patch };
}

// ── استاد / کارمند ──

export function buildStaffDraft(s: StaffItem): ProfileDraft {
  const d: ProfileDraft = {};
  for (const k of STAFF_TEXT_KEYS) d[k] = String(s[k] ?? '');
  // تاریخ تولد در DB میلادی است؛ فرم آن را شمسی نشان می‌دهد (اکشن سرور معکوس می‌کند)
  d.birthDate = s.birthDate ? dateToJalali(s.birthDate) : '';
  d.isActive = s.isActive ?? 1;
  return d;
}

export function staffPatchFromDraft(draft: ProfileDraft, initial: ProfileDraft): PatchResult {
  const patch: Record<string, string | number | null> = {};
  for (const k of STAFF_TEXT_KEYS) {
    let v = String(draft[k] ?? '').trim();
    // ارقام فارسی تاریخ تولد را لاتین می‌کنیم؛ regex اعتبارسنجی سرور فقط \d را می‌شناسد
    if (k === 'birthDate') v = toEnDigits(v).replace(/-/g, '/');
    if (v !== String(initial[k] ?? '').trim()) patch[k] = v;
  }
  const active = Number(draft.isActive ?? 1) === 0 ? 0 : 1;
  if (active !== Number(initial.isActive ?? 1)) patch.isActive = active;
  return { patch };
}

/** مقایسهٔ سادهٔ پیش‌نویس با نسخهٔ اولیه (برای شاخص «تغییرات ذخیره‌نشده») */
export function isDraftDirty(draft: ProfileDraft, initialJson: string): boolean {
  return JSON.stringify(draft) !== initialJson;
}
