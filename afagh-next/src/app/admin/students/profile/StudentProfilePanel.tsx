'use client';

// ═══════════════════════════════════════════════════════════════════════
//  StudentProfilePanel — پروندهٔ دانشجو (سربرگ چسبان + کارت‌ها + تب‌های داخلی)
//
//  بازطراحی (UI/UX):
//    • یک سربرگ چسبانِ مشترک (عکس، نام، شمارهٔ دانشجویی، وضعیت، شماره‌های
//      قبلی، قبلی/بعدی، و تنها دکمهٔ ویرایش/ذخیره/انصراف).
//    • «یک ویرایش + یک ذخیره»: همهٔ فیلدها در حالت مشاهده فقط‌خواندنی‌اند؛
//      دکمه‌های ذخیرهٔ تک‌بخشی (هویت/تکمیلی/سایر/اضافی/کد ورود) حذف شدند.
//    • فیلدهای بدون مسیر ذخیره (نام، کد ملی، تاریخ تولد، مقطع، رشته،
//      سهمیه، نحوهٔ ورود، نوع دوره، شیوهٔ آموزشی) به‌صورت برچسب/مقدار
//      فقط‌خواندنی نمایش داده می‌شوند — نه ورودی فعالِ بی‌اثر.
//    • کادر عکس و دکمه‌های تزئینی «فایل تصویر/حذف تصویر/کپی تصویر» و
//      چک‌باکس‌های تسویهٔ دانش‌آموختگان (هیچ‌کدام مسیر ذخیره نداشتند) حذف شدند.
//    • «وضعیت نظام وظیفه» دقیقاً یک کنترل دارد (کنترل تکراری بخش «اضافی» حذف شد).
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import StickyIdentityHeader from './StickyIdentityHeader';
import { Field, ReadOnlyField, SelectField, TextField, inputClass } from './Field';
import type { ProfileDraft } from './profile-draft';
import { entryTermFromMonth, formatJalaliDateInput } from './profile-draft';
import type { RegulationPick, StudentItem } from '../types';
import Link from 'next/link';
import { SAMA_STATUS_TITLE, QUOTA_FA, STUDENT_STATUS_FA, studentStatusChip, studentStatusFa } from '@/lib/student-labels';
import { dateToJalali, faNum } from '../transcript-utils';
import { normalizeFa, toEnDigits } from '@/lib/persian-search';

// ── لوک‌آپ‌های سما: کد خام ← عنوان فارسی (فایل‌های «دوره.txt»، «شيوه آموزش.txt»، «نحوه ورود به دانشگاه.txt») ──
const COURSE_TYPE_FA: Record<string, string> = {
  '0': 'نامشخص', '1': 'روزانه', '2': 'شبانه', '3': 'نیمه حضوری', '4': 'غیرانتفاعی',
  '5': 'دانشجویان خارجی', '6': 'روزانه - موارد خاص', '7': 'پیام نور',
  '8': 'دوره‌های آموزش عالی آزاد', '10': 'مجازی', '202': 'مهمانی',
};
const TRAINING_METHOD_FA: Record<string, string> = {
  '0': 'نامشخص', '1': 'آموزشی', '2': 'آموزشی - تغییر رشته دارای مغایرت', '3': 'آموزشی و پژوهشی',
  '4': 'آموزشی پژوهشی', '8': 'آموزشی - تغییر رشته', '11': 'پژوهش محور',
};
// نحوهٔ ورود (فایل «نحوه ورود به دانشگاه.txt» کد ۰..۱۷ — عنوان‌ها نرمال‌شده با normalizeFa)
const ACCEPT_TYPE_FA: [string, string][] = [
  ['0', 'نامشخص'], ['1', 'قبولی کنکور سراسری'], ['2', 'دانشجوی علامه خویی'], ['3', 'دانشجوی زرینه خوی'],
  ['4', 'دانشجوی شمس خوی'], ['5', 'بدون آزمون - سوابق تحصیلی'], ['6', 'کنکور سراسری'], ['7', 'دانشجوی نژند'],
  ['8', 'انتقال از خارج'], ['9', 'استعداد درخشان'], ['10', 'ممتاز'], ['11', 'نفر اول دوره قبلی'],
  ['12', 'مهمان از دانشگاه دیگر'], ['13', 'انتقالی'], ['14', 'کنکور فنی و حرفه‌ای'],
  ['15', 'کنکور کاردانی به کارشناسی ناپیوسته'], ['16', 'آموزش عالی آزاد'],
  ['17', 'صرفاً بر اساس سوابق تحصیلی (کاردانی به کارشناسی)'],
];
/** عنوان نرمال‌شدهٔ نحوهٔ ورود — مقدار DB را هم نرمال می‌کند تا گزینهٔ متناظر پیدا شود */
const acceptTypeTitle = (raw?: string | null) => {
  const n = normalizeFa(raw || '');
  if (!n) return '';
  return ACCEPT_TYPE_FA.find(([, t]) => normalizeFa(t) === n)?.[1] || raw || '';
};

const MILITARY_OPTIONS = [
  '—',
  'خانم است و وضعیت نظام وظیفه ندارد',
  'مشمول است و دفترچه دارد',
  'مشمول است ولی دفترچه ندارد',
  'معافیت پزشکی یا کفالت',
  'کارت پایان خدمت',
  'سرباز ترخیصی',
  'معافیت تحصیلی فعال',
  'معافیت دائم',
  'کارمند آموزش و پرورش',
  'کارمند',
  'دانشجوی سال آخر مقطع قبل',
  'فارغ‌التحصیل بدون غیبت',
  'دانشجوی انصرافی',
  'متولد ماقبل ۱۳۵۲',
  'کارکنان متعهد خدمت ارگان‌ها',
  'مشمول نیست',
  'فاقد معافیت',
  'در حال تحصیل (معافیت موقت)',
].map(v => ({ value: v === '—' ? '' : v, label: v }));

const GENDER_OPTIONS = [
  { value: '', label: '—' },
  { value: 'MALE', label: 'مرد' },
  { value: 'FEMALE', label: 'زن' },
];

const DOC_STATUS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'تکمیل و تأییدشده ✓', label: 'تکمیل و تأییدشده ✓' },
  { value: 'دارای نقص مدرک', label: 'دارای نقص مدرک' },
];

const ENGLISH_EXAM_OPTIONS = [
  { value: '', label: '—' },
  { value: 'MSRT', label: 'MSRT' },
  { value: 'Tolimo', label: 'Tolimo' },
  { value: 'IELTS', label: 'IELTS' },
  { value: 'TOEFL', label: 'TOEFL' },
];

type CardTab = 'identity' | 'extra' | 'other' | 'file';

const CARDS: { key: CardTab; label: string }[] = [
  { key: 'identity', label: '🪪 هویت و تحصیلی' },
  { key: 'extra', label: '📄 تکمیلی و زبان' },
  { key: 'other', label: '🏠 سایر اطلاعات' },
  { key: 'file', label: '🗂️ پرونده و دانش‌آموختگان' },
];

/**
 * دراپ‌داون محل تولد/صدور از فهرست geo — مقدار ذخیره‌شده همان «عنوان» است
 * و اکشن سرور کد وزارت را خودکار resolve می‌کند. اگر مقدار قدیمی در فهرست
 * نباشد به‌صورت گزینهٔ «(قدیمی)» نمایش داده می‌شود تا از دست نرود.
 */
function GeoSelect({
  label,
  value,
  places,
  onChange,
}: {
  label: string;
  value: string;
  places: string[];
  onChange?: (v: string) => void;
}) {
  const set = new Set(places.map(t => normalizeFa(t)));
  const current = String(value ?? '');
  const matched = current && set.has(normalizeFa(current))
    ? (places.find(t => normalizeFa(t) === normalizeFa(current)) ?? current)
    : current;
  const extra = !!current && !set.has(normalizeFa(current));
  return (
    <Field label={label} hint="از فهرست geo — کد وزارت خودکار ثبت می‌شود">
      <select
        value={matched}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        disabled={!onChange}
        className={`${inputClass(!onChange)} font-semibold`}
      >
        <option value="">—</option>
        {places.map(t => <option key={`geo-${t}`} value={t}>{t}</option>)}
        {extra && <option value={current}>{current} (قدیمی)</option>}
      </select>
    </Field>
  );
}

export type StudentProfilePanelProps = {
  student: StudentItem;
  /** پیش‌نویس مشترک فرم — کلیدها همان allow-list اکشن ذخیرهٔ پرونده است */
  profile: ProfileDraft;
  /** تغییر یک کلید پیش‌نویس (در حالت مشاهده نادیده گرفته می‌شود) */
  onField: (key: string, value: string | number) => void;
  editing: boolean;
  /** فقط ADMIN — ذخیرهٔ پروندهٔ دانشجو سمت سرور هم فقط ADMIN است */
  canEditProfile: boolean;
  /** ADMIN / EDU_EXPERT / GRADUATEAFFAIRS — اکشن تغییر آیین‌نامه */
  canEditRegulation: boolean;
  saving: boolean;
  dirty: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  positionLabel: string;
  /** عناوین geo برای محل تولد/صدور (مقدار ذخیره‌شده همان عنوان است) */
  geoPlaces: string[];
  regulations: RegulationPick[];
  degrees: { id: number; title: string }[];
  majors: { id: number; name: string; code?: string | null; facultyId?: number | null; degreeLevelId?: number | null }[];
  faculties: { id: number; name: string }[];
  acceptOptions: { code: string; title: string }[];
  /** کد دانشگاه جاری/مالک رکورد — برای استثناهای عنوان وضعیت سما */
  uniCode: string | null;
  onRegulationChange: (regulationId: number) => Promise<boolean>;
  onToggleActive: () => void;
  onChangePassword: () => void;
  /** حذف کامل پرونده (فقط وقتی هیچ سابقهٔ درسی/مالی/ترمی ندارد) */
  onDelete?: () => void;
};

export default function StudentProfilePanel({
  student,
  profile,
  onField,
  editing,
  canEditProfile,
  canEditRegulation,
  saving,
  dirty,
  onEdit,
  onSave,
  onCancel,
  onPrev,
  onNext,
  canPrev,
  canNext,
  positionLabel,
  geoPlaces,
  regulations,
  degrees,
  majors,
  faculties,
  acceptOptions,
  uniCode,
  onRegulationChange,
  onToggleActive,
  onChangePassword,
  onDelete,
}: StudentProfilePanelProps) {
  const [tab, setTab] = useState<CardTab>('identity');

  /**
   * کد ورود ۵ رقمی (سال ۴ رقمی + ترم ۱ رقمی) یک «ویرایشگر» برای
   * entryYear/entryTerm است. متن محلی نگه داشته می‌شود تا تایپ ترم پس از
   * سال، مقدار ساخته‌شده را دوباره جای‌گذاری نکند.
   */
  const draftYear = Number(profile.entryYear ?? 0);
  const draftTerm = Number(profile.entryTerm ?? 0);
  const [entryCodeText, setEntryCodeText] = useState('');
  useEffect(() => {
    if (!editing) setEntryCodeText(`${draftYear || ''}${draftTerm || ''}`);
    // فقط با خروج از حالت ویرایش / عوض شدن رکورد همگام می‌شود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, student.id]);

  const onEntryCode = (raw: string) => {
    const digits = toEnDigits(raw).replace(/\D/g, '').slice(0, 5);
    setEntryCodeText(digits);
    if (digits.length >= 4) {
      const y = Number(digits.slice(0, 4));
      if (y >= 1300 && y <= 1500) onField('entryYear', y);
    }
    if (digits.length === 5) {
      const t = Number(digits.slice(4));
      if (t >= 1 && t <= 3) onField('entryTerm', t);
    }
  };

  const onEntryDate = (raw: string) => {
    // تاریخ ورود مستقل است: تایپ دستیِ آن سال/ترم را بازنویسی نمی‌کند
    onField('entryDate', formatJalaliDateInput(raw));
  };

  const bind = (key: string) => (editing ? (v: string) => onField(key, v) : undefined);

  /** رشتهٔ انتخاب‌شده — مبنای نمایش خودکار دانشکده و همگام‌سازی مقطع */
  const selectedMajor = majors.find(mm => String(mm.id) === String(profile.majorId ?? ''));
  const majorFacultyName = selectedMajor?.facultyId
    ? (faculties.find(f => f.id === selectedMajor.facultyId)?.name ?? student.facultyName)
    : student.facultyName;
  const onMajorChange = (v: string) => {
    const id = Number(v);
    onField('majorId', id);
    // مقطع از خودِ جدول رشته‌ها می‌آید (رشته تعیین‌کنندهٔ مقطع است)
    const mm = majors.find(x => x.id === id);
    if (mm?.degreeLevelId) onField('degreeLevelId', mm.degreeLevelId);
  };

  const entryYear = draftYear;
  const entryTerm = draftTerm;
  /** تاریخ پیش‌فرضِ شروع ترم: مهر ۰۷/۰۱ · بهمن ۱۱/۰۱ · تابستان ۰۵/۰۱ */
  const defaultEntryDate = (y: number, t: number): string =>
    y >= 1300 && y <= 1500 && t >= 1 && t <= 3
      ? `${y}/${t === 2 ? '11' : t === 3 ? '05' : '07'}/01`
      : '';
  const entryStart = defaultEntryDate(entryYear, entryTerm)?.replace(/\//g, '/') ?? null;

  /**
   * پیش‌فرضِ تاریخ از روی سال/ترم ساخته می‌شود (نه برعکس). اگر کاربر تاریخ
   * را دستی عوض کرده باشد (مثلاً ۱۴۰۳/۰۵/۰۷)، با تغییر ترم پاک نمی‌شود؛
   * فقط وقتی مقدار خالی است یا همان پیش‌فرض قبلی است، به پیش‌فرض تازه
   * به‌روزرسانی می‌شود.
   */
  const lastDefaultDate = useRef('');
  useEffect(() => {
    if (!editing) return;
    const next = defaultEntryDate(draftYear, draftTerm);
    if (!next) return;
    const cur = String(profile.entryDate ?? '').trim();
    if (!cur || cur === lastDefaultDate.current) onField('entryDate', next);
    lastDefaultDate.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draftYear, draftTerm]);

  const statusLabel = studentStatusFa(student.status, student.samaStatusCode, uniCode);

  /**
   * انتخاب آیین‌نامه دراپ‌داون کنترل‌شده است؛ مقدار محلی تا تأیید/اجرای
   * اکشن نگه داشته می‌شود و در صورت انصراف به مقدار ذخیره‌شده برمی‌گردد.
   */
  const [regulationPick, setRegulationPick] = useState(String(student.regulationId ?? 0));
  useEffect(() => {
    setRegulationPick(String(student.regulationId ?? 0));
  }, [student.id, student.regulationId]);
  const changeRegulation = async (next: string) => {
    setRegulationPick(next);
    const applied = await onRegulationChange(Number(next));
    if (!applied) setRegulationPick(String(student.regulationId ?? 0));
  };

  return (
    <div className="space-y-2">
      <StickyIdentityHeader
        userId={student.userId}
        hasPhoto={!!student.photoKey}
        photoIcon="👨‍🎓"
        photoLabel="عکس دانشجو"
        title={`${student.lastName} - ${student.firstName}`}
        codeLabel="شمارهٔ دانشجویی"
        code={student.studentCode}
        status={(
          <span className={`rounded-full px-2 py-0.5 text-3xs font-bold ${studentStatusChip(student.status)}`} title={student.samaStatusCode ? `کد سما: ${student.samaStatusCode}` : student.status}>
            {statusLabel}
          </span>
        )}
        previousCodes={student.previousCodes ?? []}
        positionLabel={positionLabel}
        onPrev={onPrev}
        onNext={onNext}
        canPrev={canPrev}
        canNext={canNext}
        editing={editing}
        canEdit={canEditProfile}
        dirty={dirty}
        saving={saving}
        onEdit={onEdit}
        onSave={onSave}
        onCancel={onCancel}
        extraActions={canEditProfile && !editing && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            title="حذف کامل پرونده؛ فقط اگر هیچ سابقهٔ درسی، مالی یا ترمی نداشته باشد"
            className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-2xs font-bold text-rose-700 hover:bg-rose-100"
          >
            🗑️ حذف کامل
          </button>
        ) : undefined}
      />

      {/* تب‌های داخل پرونده — هر کارت یک گروه منطقی از فیلدهاست */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 print:hidden">
        {CARDS.map(c => (
          <button
            key={c.key}
            type="button"
            onClick={() => setTab(c.key)}
            className={`rounded px-2.5 py-1 text-2xs font-bold transition-colors ${
              tab === c.key ? 'bg-indigo-700 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {c.label}
          </button>
        ))}
        <span className="mr-auto text-3xs text-slate-500">
          {editing ? '✏️ حالت ویرایش — تغییرات را با «💾 ذخیره» ثبت کنید' : 'برای ویرایش، «✏️ ویرایش» در سربرگ را بزنید'}
        </span>
      </div>

      <div key={`stu-${student.id}`} className="space-y-3 rounded-b-md border border-slate-400 bg-white p-3 sm:p-5">
        {tab === 'identity' && (
          <div className="space-y-3">
            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              <TextField label="نام" value={String(profile.firstName ?? '')} onChange={bind('firstName')} />
              <TextField label="نام خانوادگی" value={String(profile.lastName ?? '')} onChange={bind('lastName')} />
              <TextField label="کد ملی" value={String(profile.nationalCode ?? '')} onChange={bind('nationalCode')} mono dir="ltr" hint="۱۰ رقم" />
              <TextField
                label="تاریخ تولد (شمسی)"
                value={String(profile.birthDate ?? '')}
                onChange={editing ? (v) => onField('birthDate', formatJalaliDateInput(v)) : undefined}
                dir="ltr"
                mono
                placeholder="۱۳۸۵/۰۶/۲۲"
                hint={student.birthDate ? `میلادی ذخیره‌شده: ${String(student.birthDate).slice(0, 10)}` : 'خالی = نامشخص'}
              />
              <SelectField
                label="وضعیت تحصیلی"
                value={String(profile.samaStatusCode ?? '')}
                onChange={editing ? (v) => onField('samaStatusCode', v) : undefined}
                options={[
                  { value: '', label: '—' },
                  ...Object.entries(SAMA_STATUS_TITLE).map(([code, label]) => ({ value: code, label: `${label} (کد ${code})` })),
                ]}
                hint="همان عنوانی که کنار شمارهٔ دانشجویی دیده می‌شود؛ از کدینگ وضعیت سما"
              />
              <SelectField
                label="مقطع"
                value={String(profile.degreeLevelId ?? 0)}
                onChange={editing ? (v) => onField('degreeLevelId', Number(v)) : undefined}
                options={[{ value: '0', label: '—' }, ...degrees.map(d => ({ value: String(d.id), label: d.title }))]}
              />
              <SelectField
                label="رشته (کد — نام)"
                value={String(profile.majorId ?? 0)}
                onChange={editing ? onMajorChange : undefined}
                options={[
                  { value: '0', label: '—' },
                  ...majors.map(mm => ({ value: String(mm.id), label: mm.code ? `${mm.code} — ${mm.name}` : mm.name })),
                ]}
                hint="با تغییر رشته، مقطع و دانشکده از جدول رشته‌ها به‌روز می‌شوند"
              />
              <ReadOnlyField label="دانشکده" value={majorFacultyName} hint="خودکار از رشتهٔ انتخاب‌شده" />
              <SelectField
                label="سهمیهٔ نهایی"
                value={String(profile.quotaType ?? '')}
                onChange={editing ? (v) => onField('quotaType', v) : undefined}
                options={Object.entries(QUOTA_FA).map(([value, label]) => ({ value, label }))}
              />
              <SelectField
                label="نحوهٔ ورود"
                value={String(profile.acceptanceType ?? '')}
                onChange={editing ? (v) => onField('acceptanceType', v) : undefined}
                options={[
                  { value: '', label: '—' },
                  ...acceptOptions.map(o => ({ value: o.code, label: `${o.title} (${o.code})` })),
                  ...(profile.acceptanceType && !acceptOptions.some(o => o.code === String(profile.acceptanceType))
                    ? [{ value: String(profile.acceptanceType), label: `${profile.acceptanceType} — خارج از کدینگ` }]
                    : []),
                ]}
              />
              <SelectField
                label="نوع دوره"
                value={String(profile.studyingMode ?? '')}
                onChange={editing ? (v) => onField('studyingMode', v) : undefined}
                options={Object.entries(COURSE_TYPE_FA).map(([value, label]) => ({ value, label }))}
              />
              <SelectField
                label="شیوهٔ آموزشی"
                value={String(profile.trainingMethod ?? '')}
                onChange={editing ? (v) => onField('trainingMethod', v) : undefined}
                options={Object.entries(TRAINING_METHOD_FA).map(([value, label]) => ({ value, label }))}
              />
              {student.samaStatusCode && (
                <ReadOnlyField label="وضعیت در سما" value={`کد ${student.samaStatusCode}`} mono />
              )}
            </section>

            <h4 className="border-t border-slate-200 pt-2 text-xs font-bold text-slate-800">
              🗓️ ورود و اطلاعات هویتی
            </h4>
            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              <TextField
                label="کد ترم ورود (سال + ترم)"
                value={editing ? entryCodeText : `${entryYear}${entryTerm}`}
                onChange={editing ? onEntryCode : undefined}
                dir="ltr"
                mono
                center
                maxLength={5}
                inputMode="numeric"
                placeholder="مثل 14032"
                hint={(
                  <>
                    {entryStart ? `شروع: ${entryStart}` : 'سال ۴ رقمی + ترم ۱ رقمی'}
                    {entryYear ? ` — سال ${faNum(entryYear, 0)}` : ''}
                    {entryTerm ? ` / ترم ${faNum(entryTerm, 0)}` : ''}
                  </>
                )}
              />
              <TextField
                label="تاریخ ورود (شمسی)"
                value={String(profile.entryDate ?? '')}
                onChange={editing ? onEntryDate : undefined}
                dir="ltr"
                mono
                placeholder="۱۴۰۳/۰۷/۰۱"
                hint="پیش‌فرض از روی ترم/سال ورود ساخته می‌شود؛ برای موارد استثنایی (مثل ۱۴۰۳/۰۵/۰۷) دستی قابل تغییر است"
              />
              <TextField label="نام پدر" value={String(profile.fatherName ?? '')} onChange={bind('fatherName')} />
              <SelectField label="جنسیت" value={String(profile.gender ?? '')} onChange={bind('gender')} options={GENDER_OPTIONS} />
              <TextField label="شمارهٔ شناسنامه" value={String(profile.birthCertNo ?? '')} onChange={bind('birthCertNo')} dir="ltr" mono />
              <GeoSelect
                label="محل صدور"
                value={String(profile.placeOfIssue ?? '')}
                places={geoPlaces}
                onChange={editing ? v => onField('placeOfIssue', v) : undefined}
              />
              <GeoSelect
                label="محل تولد"
                value={String(profile.placeOfBirth ?? '')}
                places={geoPlaces}
                onChange={editing ? v => onField('placeOfBirth', v) : undefined}
              />
              <TextField label="شمارهٔ همراه" value={String(profile.mobile ?? '')} onChange={bind('mobile')} dir="ltr" mono maxLength={11} inputMode="tel" />
              <TextField label="تلفن ثابت منزل" value={String(profile.homeTell ?? '')} onChange={bind('homeTell')} dir="ltr" mono />
            </section>

            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Field
                label="آیین‌نامهٔ ملاک"
                hint="تغییر آیین‌نامه، کدهای وضعیت نمرات این دانشجو را بازمحاسبه می‌کند؛ به همین دلیل تأیید جداگانه دارد و با دکمهٔ ذخیرهٔ فرم ارسال نمی‌شود."
              >
                {canEditRegulation ? (
                  <select
                    value={regulationPick}
                    onChange={e => void changeRegulation(e.target.value)}
                    className={inputClass(false)}
                  >
                    <option value={0} disabled>{student.regulationTitle}</option>
                    {regulations.map(r => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </select>
                ) : (
                  <div className={`${inputClass(true)} font-semibold`}>{student.regulationTitle}</div>
                )}
              </Field>

              {canEditProfile && (
                <div className="rounded border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">🔐 حساب وب:</span>
                    <span className={`rounded-full px-2 py-0.5 text-3xs font-bold ${student.isActive === 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {student.isActive === 0 ? '⛔ غیرفعال' : '✅ فعال'}
                    </span>
                    <div className="mr-auto flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={onToggleActive}
                        className={`rounded border px-2.5 py-1 text-2xs font-bold ${
                          student.isActive === 0
                            ? 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800'
                            : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
                        }`}
                        title="فعال/غیرفعال‌سازی کامل حساب (ورود، کارتابل، برنامه‌ریزی، نشست‌ها، OTPها) — فقط مدیر سیستم"
                      >
                        {student.isActive === 0 ? 'فعال‌سازی کامل' : 'غیرفعال‌سازی کامل'}
                      </button>
                      <button
                        type="button"
                        onClick={onChangePassword}
                        className="rounded bg-slate-700 px-2.5 py-1 text-2xs font-bold text-white hover:bg-slate-800"
                        title="تغییر رمز عبور دانشجو (فقط مدیر سیستم)"
                      >
                        🔑 تغییر رمز
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-3xs text-slate-500">
                    فعال/غیرفعال‌سازی حساب کامل و تغییر رمز، مستقل از ویرایش پرونده و بلافاصله اعمال می‌شود.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'extra' && (
          <div className="space-y-3">
            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              <TextField
                label="استاد راهنما"
                value={String(profile.advisorCode ?? '')}
                onChange={bind('advisorCode')}
                placeholder="کد/نام استاد راهنما"
              />
              <SelectField
                label="وضعیت نظام وظیفه"
                value={String(profile.militaryStatus ?? '')}
                onChange={bind('militaryStatus')}
                options={MILITARY_OPTIONS}
              />
              <SelectField
                label="وضعیت مدارک"
                value={String(profile.documentStatus ?? '')}
                onChange={bind('documentStatus')}
                options={DOC_STATUS_OPTIONS}
              />
              <TextField label="نوع بورسیه" value={String(profile.scholarshipType ?? '')} onChange={bind('scholarshipType')} />
              <TextField label="شمارهٔ معافیت" value={String(profile.militaryExemptionNo ?? '')} onChange={bind('militaryExemptionNo')} mono />
              <TextField label="شمارهٔ پاسپورت" value={student.passportNumber ?? ''} readOnly dir="ltr" mono />
              <ReadOnlyField
                label="ملیت"
                value={student.nationality === '120001' ? 'ایرانی' : (student.nationality || '')}
              />
            </section>

            <section className="rounded border border-slate-300 bg-slate-50 p-2.5">
              <h4 className="border-b border-slate-200 pb-1 font-bold text-slate-800">📝 وضعیت نمرهٔ آزمون زبان انگلیسی</h4>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <SelectField label="نوع آزمون" value={String(profile.englishExamType ?? '')} onChange={bind('englishExamType')} options={ENGLISH_EXAM_OPTIONS} />
                <TextField label="نمرهٔ آزمون" value={String(profile.englishScore ?? '')} onChange={bind('englishScore')} mono center placeholder="—" />
                <ReadOnlyField
                  label="تاریخ فارغ‌التحصیلی"
                  value={student.graduateDate || ''}
                  mono
                />
              </div>
            </section>

            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              <ReadOnlyField
                label="Full Name (لاتین)"
                value={[student.firstNameEn, student.lastNameEn].filter(Boolean).join(' ')}
                dir="ltr"
                mono
              />
              <ReadOnlyField label="Father Name (لاتین)" value={student.fatherName} dir="ltr" mono />
              <ReadOnlyField label="اولین ثبت‌کننده" value={(student.insertDate || student.insertTime) ? `سما — ${student.insertDate || '—'} ${student.insertTime || ''}`.trim() : ''} />
            </section>
          </div>
        )}

        {tab === 'other' && (
          <div className="space-y-3">
            <section className="rounded border border-slate-300 bg-slate-50 p-2.5">
              <h4 className="border-b border-slate-200 pb-1 font-bold text-slate-800">🏠 خوابگاه، ولی و تماس</h4>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                <TextField label="نام خوابگاه" value={String(profile.dormName ?? '')} onChange={bind('dormName')} />
                <TextField label="شمارهٔ اتاق" value={String(profile.dormRoom ?? '')} onChange={bind('dormRoom')} mono center />
                <TextField label="عنوان و شغل ولی/قیم" value={String(profile.guardianJobTitle ?? '')} onChange={bind('guardianJobTitle')} />
                <TextField label="تلفن ولی" value={String(profile.guardianPhone ?? '')} onChange={bind('guardianPhone')} dir="ltr" mono />
                <TextField label="کد پستی" value={String(profile.postalCode ?? '')} onChange={bind('postalCode')} dir="ltr" mono maxLength={10} inputMode="numeric" />
                <TextField label="ایمیل دانشجو" value={String(profile.email ?? '')} onChange={bind('email')} dir="ltr" mono type="email" />
                <TextField label="نشانی محل سکونت" value={String(profile.address ?? '')} onChange={bind('address')} />
                <TextField label="نشانی ولی/قیم" value={String(profile.guardianAddress ?? '')} onChange={bind('guardianAddress')} />
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded border border-slate-300 bg-slate-50 p-2.5">
                <h4 className="border-b border-slate-200 pb-1 font-bold text-slate-800">🎒 سوابق دیپلم و پیش‌دانشگاهی</h4>
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <TextField label="محل اخذ دیپلم" value={String(profile.diplomaPlace ?? '')} onChange={bind('diplomaPlace')} />
                  <TextField label="سال اخذ دیپلم" value={String(profile.diplomaYear ?? '')} onChange={bind('diplomaYear')} mono center />
                  <TextField label="معدل کتبی دیپلم" value={String(profile.diplomaGrade ?? '')} onChange={bind('diplomaGrade')} mono center />
                  <TextField label="محل پیش‌دانشگاهی" value={String(profile.pishdPlace ?? '')} onChange={bind('pishdPlace')} />
                  <TextField label="سال پیش‌دانشگاهی" value={String(profile.pishdYear ?? '')} onChange={bind('pishdYear')} mono center />
                  <TextField label="معدل پیش‌دانشگاهی" value={String(profile.pishdGrade ?? '')} onChange={bind('pishdGrade')} mono center />
                </div>
              </div>

              <div className="rounded border border-slate-300 bg-slate-50 p-2.5">
                <h4 className="border-b border-slate-200 pb-1 font-bold text-slate-800">💳 وضعیت شهریه</h4>
                <div className="mt-2 space-y-2.5">
                  <TextField
                    label="نوع دورهٔ شهریه"
                    value={String(profile.tuitionType ?? '')}
                    onChange={bind('tuitionType')}
                    placeholder="روزانه (آموزش رایگان دولتی) —"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      id="stu-tuition-payer"
                      type="checkbox"
                      checked={Number(profile.tuitionPayer ?? 0) === 1}
                      onChange={editing ? e => onField('tuitionPayer', e.target.checked ? 1 : 0) : undefined}
                      disabled={!editing}
                      className="h-4 w-4 rounded accent-emerald-600 disabled:opacity-60"
                    />
                    <label htmlFor="stu-tuition-payer" className="font-bold">دانشجوی شهریه‌پرداز است (نوبت دوم/پردیس)</label>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === 'file' && (
          <div className="space-y-3">
            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              <TextField label="نوع دیپلم پایه" value={String(profile.diplomaType ?? '')} onChange={bind('diplomaType')} />
              <TextField label="کد صحت مدارک / آرشیو" value={String(profile.archiveNo ?? '')} onChange={bind('archiveNo')} mono />
              <TextField label="شمارهٔ پرونده" value={String(profile.parvandehNo ?? '')} onChange={bind('parvandehNo')} mono />
              <TextField label="وضعیت صدور کارت دانشجویی" value={String(profile.studentCardStatus ?? '')} onChange={bind('studentCardStatus')} placeholder="صادر و تحویل شده" />
              <TextField label="نواقص پرونده" value={String(profile.documentDeficiency ?? '')} onChange={bind('documentDeficiency')} placeholder="فاقد نقص پرونده" />
              <TextField
                label="تعداد صدور گواهی ۳ ماهه"
                value={String(profile.certIssued3m ?? 0)}
                onChange={editing ? v => onField('certIssued3m', v === '' ? 0 : Number(v) || 0) : undefined}
                type="number"
                inputMode="numeric"
                mono
                center
              />
              <TextField
                label="تعداد ترم معادل‌سازی"
                value={String(profile.eqSemesters ?? 0)}
                onChange={editing ? v => onField('eqSemesters', v === '' ? 0 : Number(v) || 0) : undefined}
                type="number"
                inputMode="numeric"
                mono
                center
              />
              <TextField
                label="واحد مانده تا فارغ‌التحصیلی"
                value={String(profile.unitsRemaining ?? '')}
                onChange={editing ? v => onField('unitsRemaining', v === '' ? '' : Number(v) || 0) : undefined}
                type="number"
                inputMode="numeric"
                mono
                center
              />
            </section>

            <section className="rounded border border-slate-300 bg-slate-50 p-2.5">
              <h4 className="border-b border-slate-200 pb-1 font-bold text-slate-800">🎓 دانش‌آموختگان و تسویه‌ها</h4>
              <div className="mt-2 rounded border border-slate-200 bg-white p-2.5 text-2xs leading-6 text-slate-600">
                مدارک صادرشده (دانشنامه، ریزنمرات، گواهی موقت) شماره و تاریخ صدورشان در این فرم نگه‌داری
                نمی‌شود؛ از{' '}
                <Link prefetch={false} href="/admin/graduation" className="font-bold text-indigo-700 underline">
                  ماژول فارغ‌التحصیلی و صدور مدارک
                </Link>{' '}
                خوانده می‌شود. تعداد گواهی سه‌ماههٔ صادرشده در فیلد بالای همین کارت نمایش داده می‌شود.
              </div>
              <p className="mt-2 text-2xs text-slate-500">
                تسویه‌حساب‌ها و صدور مدارک در ماژول فارغ‌التحصیلان انجام می‌شود؛ در این فرم فیلدی برای ثبت آن وجود ندارد.
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
