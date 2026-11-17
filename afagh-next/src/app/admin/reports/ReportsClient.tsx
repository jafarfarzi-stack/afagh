'use client';

import { useEffect, useState } from 'react';
import { exportReport, fetchReportForPrint, runReport, type FilterOptions, type ReportResult } from './actions';
import { LINK_CARDS } from './report-links';
import { faIncludes } from '@/lib/persian-search';
import { MAX_TERM_CODES, parseTermSelection } from '@/lib/term-selection';
import { CODE_LIST_LIMIT, parseCodeList } from '@/lib/code-list';
import { faNum, formatReportCell as fmtCell } from '@/lib/report-format';
import ReportPrint from '@/components/ui/ReportPrint';

/** دستهبندی کارتهای گزارش: مالی به سه گروه منطقی تقسیم شده است */
type ReportCat = 'students' | 'probation' | 'program' | 'exams' | 'classes' | 'finance' | 'finance-academic' | 'finance-ops' | 'graduates' | 'council' | 'research';

type Card = { kind: string; icon: string; title: string; cat: ReportCat; needsTerm?: boolean; soon?: boolean; desc?: string; customs?: { key: string; title: string }[] };

/** تمام دستههای مالی — هم در فیلتر Scope و هم در فیلتر تبها استفاده میشود */
const FINANCE_CATS = new Set<ReportCat>(['finance', 'finance-academic', 'finance-ops']);

const CATEGORIES: { key: ReportCat; label: string }[] = [
  { key: 'students', label: '🧑‍🎓 دانشجویی و فهرست' },
  { key: 'probation', label: '⚠️ مشروطی و آیین‌نامه' },
  { key: 'program', label: '🗓️ برنامه و نمره' },
  { key: 'exams', label: '📝 امتحانات' },
  { key: 'classes', label: '🏫 کلاس‌ها و استادان' },
  { key: 'graduates', label: '🎓 دانش‌آموختگان و مدارک' },
  { key: 'council', label: '🏛️ شورا و مکاتبات' },
  { key: 'research', label: '🔬 پژوهش و آزمون جامع' },
  { key: 'finance', label: '💰 پرداخت و حسابداری' },
  { key: 'finance-academic', label: '🎓 شهریه و مالی تحصیلی' },
  { key: 'finance-ops', label: '📦 انبار، قراردادها و پیمانکاران' },
];

/** تب «همه» — کل فهرست یک‌جا، تا کاربر ناآشنا به دسته‌بندی گم نشود */
const ALL_TAB = '__all';

/**
 * زیرگروهِ هر گزارش داخل تب خودش — یک تب ۱۳ کارتی به چند بخش قابل اسکن
 * تبدیل می‌شود (ایراد «دکمه‌ها در هم‌برهم‌اند و دسته‌بندی ندارند»).
 * کلیدِ ناموجود = «سایر».
 */
const SUB: Record<string, string> = {
  'active-term': 'فهرست و وضعیت', 'status-summary': 'فهرست و وضعیت', 'status-report': 'فهرست و وضعیت',
  'by-faculty': 'فهرست و وضعیت', 'by-major': 'فهرست و وضعیت', 'grade-status': 'وضعیت نمره',
  entries: 'فهرست و وضعیت', incomplete: 'پروندهٔ ناقص', docs: 'پروندهٔ ناقص',
  'no-photo': 'پروندهٔ ناقص', noshow: 'تغییرات', transfers: 'تغییرات',
  'major-change-report': 'تغییرات', 'status-change-report': 'تغییرات',
  top: 'برترین‌ها', 'top-students': 'برترین‌ها',
  probation: 'مشروطی', 'probation-violations': 'مشروطی', 'probation-chains': 'مشروطی',
  'unit-cap-violations': 'سقف و کف واحد', 'repeated-courses': 'دروس', 'third-attempt': 'دروس',
  'prereq-violations': 'دروس', 'course-grade-status': 'دروس',
  'enrollment-pick': 'ثبت‌نام و درس', 'offered-course-roster': 'ثبت‌نام و درس',
  'student-weekly-conflicts': 'تداخل برنامه', 'student-exam-conflicts': 'تداخل برنامه',
  'gpa-refresh-preview': 'معدل و پرونده', 'profile-refresh': 'معدل و پرونده',
  'portal-export': 'معدل و پرونده', 'grade-audit-log': 'معدل و پرونده',
  'exam-session-sheet': 'جلسه و صندلی', 'seat-numbers': 'جلسه و صندلی',
  'final-exam-schedule': 'جلسه و صندلی', 'exam-entry-card': 'جلسه و صندلی',
  'grade-entry-report': 'ثبت نمره', 'grade-deadline': 'ثبت نمره', 'transcript-card': 'کارنامه',
  'empty-rooms': 'کلاس و سالن', 'weekly-timetable': 'کلاس و سالن', 'room-conflicts': 'کلاس و سالن',
  'low-enrollment': 'کلاس و سالن', 'makeup-courses': 'کلاس و سالن',
  'staff-list': 'استادان', 'staff-courses': 'استادان', 'staff-timetable': 'استادان',
  'prof-formation-summary': 'تشکیل جلسات', 'prof-formation-detail': 'تشکیل جلسات',
  'prof-formation-none': 'تشکیل جلسات', 'prof-sessions-unformed': 'تشکیل جلسات',
  'attendance-list': 'حضور و غیاب',
  'total-payments': 'پرداخت‌ها', 'student-payments': 'پرداخت‌ها', 'term-payments': 'پرداخت‌ها',
  'finance-worklist': 'پرداخت‌ها', tuition: 'شهریه',
  'accounting-voucher': 'حسابداری', 'general-ledger': 'حسابداری', 'daily-journal': 'حسابداری',
  'income-statement': 'صورت‌های مالی', 'balance-sheet': 'صورت‌های مالی', 'cash-flow': 'صورت‌های مالی',
  'costing-report': 'صورت‌های مالی', 'budget-variance': 'صورت‌های مالی', 'sales-report': 'صورت‌های مالی',
  'revenue-hierarchy': 'صورت‌های مالی', 'vat-report': 'حسابداری', 'company-expenses': 'هزینه‌ها',
  'allocation-report': 'هزینه‌ها',
  'contractor-report': 'قرارداد و انبار', 'contractor-settlement': 'قرارداد و انبار',
  'insurance-report': 'قرارداد و انبار', 'legal-report': 'قرارداد و انبار', 'inventory-report': 'قرارداد و انبار',
  'tuition-statement': 'شهریهٔ دانشجو', 'tuition-overview': 'شهریهٔ دانشجو',
  'tuition-faculty-detail': 'شهریهٔ دانشجو', 'faculty-financial': 'شهریهٔ دانشجو',
  'major-financial': 'شهریهٔ دانشجو', 'term-financial': 'شهریهٔ دانشجو',
  'tuition-tariff': 'تعرفه', 'payroll-overview': 'حق‌التدریس',
  'bi-teaching-quality': 'کیفیت و امکانات', 'bi-facilities': 'کیفیت و امکانات',
  proposals: 'پروپوزال و دفاع', 'proposal-cap': 'پروپوزال و دفاع', defenses: 'پروپوزال و دفاع',
  seminars: 'پروپوزال و دفاع', jame: 'آزمون جامع', payesh: 'پایش',
  'council-edu': 'شورا', discipline: 'شورا', 'letter-templates': 'مکاتبات', 'pending-requests': 'مکاتبات',
  graduates: 'دانش‌آموختگان', 'graduates-info': 'دانش‌آموختگان', 'grad-cert': 'گواهی‌ها',
  'study-cert': 'گواهی‌ها', 'edu-confirm': 'گواهی‌ها', 'military-defer': 'گواهی‌ها',
  'student-card': 'کارت و پرونده', 'graduation-dossiers': 'کارت و پرونده',
};

/** توضیح یک‌خطی فقط برای کارت‌هایی که عنوانشان به‌تنهایی گویا نیست */
const DESC: Record<string, string> = {
  'status-summary': 'شمارش دانشجویان به تفکیک وضعیت و مقطع',
  'status-report': 'یک ردیف برای هر دانشجو با وضعیت فعلی',
  'status-change-report': 'گذارِ وضعیت از ترمی به ترم دیگر',
  'major-change-report': 'دانشجویان با کد وضعیتِ تغییر رشته',
  top: 'میانگین سادهٔ نمرات دروس (حداقل ۱۷ و ۱۰ درس)',
  'top-students': 'معدلِ رسمی و وزنی، با رتبه',
  probation: 'مشروطیِ همین ترم بر پایهٔ معدل رسمی',
  'probation-violations': 'تعداد ترم‌های مشروطی در برابر سقف آیین‌نامه',
  'probation-chains': 'طولانی‌ترین زنجیرهٔ مشروطیِ متوالی',
  incomplete: 'دانشجویان با کد ملی/موبایل/رشتهٔ ناقص',
  docs: 'وضعیت مدارک پروندهٔ دانشجویان فعال',
  'no-photo': 'برای پیگیری عکس دانشجو',
  'offered-course-roster': 'نیازمند کد یا نام درس — یک ردیف per ثبت‌نام',
  'enrollment-pick': 'تجمیعی per دانشجو در یک ترم',
  'exam-session-sheet': 'شمارش حاضر/غایب هر سانس',
  'seat-numbers': 'دانشجو × صندلی هر سانس',
  'final-exam-schedule': 'تاریخ و ساعت هر درس',
  'grade-entry-report': 'وضعیت ثبت نمرهٔ استادان',
  'grade-deadline': 'روزهای باقی‌مانده تا مهلت ثبت',
  'staff-list': 'کد/مرتبه/گروه + تعداد ارائه (پیش‌فرض: فقط فعال)',
  'staff-courses': 'ارائه‌های هر استاد در ترم',
  'staff-timetable': 'جلسات هفتگی هر استاد',
  'prof-formation-summary': 'درصد تشکیل جلسات per استاد',
  'prof-formation-detail': 'همان آمار per استاد × درس',
  'prof-formation-none': 'استادانی که حضوری ثبت نکرده‌اند',
  'prof-sessions-unformed': 'ریز جلساتی که حضور استاد ثبت نشده',
  'attendance-list': 'حضور/غیاب دانشجویان هر ارائه',
  'total-payments': 'مانده + کل پرداختی هر دانشجو',
  'student-payments': 'ریز فیش‌های پرداخت',
  'term-payments': 'جمع پرداختی هر ترم',
  'finance-worklist': 'ماندهٔ مالی همهٔ دانشجویان',
  tuition: 'ریز تراکنش‌های شهریه',
  'tuition-statement': 'بدهی/تخفیف/پرداختی/مانده هر دانشجو',
  'tuition-overview': 'مانده + واحد و مساعده',
  'exam-entry-card': 'کارت ورود به جلسهٔ دانشجو',
  'transcript-card': 'کارنامهٔ تحصیلی',
  'graduation-dossiers': 'وضعیت پروندهٔ فراغت‌التحصیلی',
  payesh: 'پاسخ‌های طرح پایش',
  jame: 'واجدان شرایط آزمون جامع',
};

const CARDS: Card[] = [
  { kind: 'active-term', cat: 'students', icon: '🧑‍🎓', title: 'گزارش دانشجویان فعال ترم', needsTerm: true },
  { kind: 'status-summary', cat: 'students', icon: '📊', title: 'گزارش خلاصه وضعیت تحصیلی' },
  { kind: 'by-faculty', cat: 'students', icon: '🏛️', title: 'گزارش به تفکیک دانشکده' },
  { kind: 'by-major', cat: 'students', icon: '📚', title: 'گزارش دانشجویان هر رشته' },
  { kind: 'grade-status', cat: 'students', icon: '📝', title: 'دانشجویان برحسب وضعیت نمره', needsTerm: true },
  { kind: 'probation', cat: 'probation', icon: '⚠️', title: 'مشروطی‌های ترم', needsTerm: true },
  { kind: 'top', cat: 'program', icon: '🏆', title: 'گزارش نمرات برتر هر رشته' },
  { kind: 'incomplete', cat: 'students', icon: '📋', title: 'تکمیلی دانشجویان (پرونده ناقص)' },
  { kind: 'graduates', cat: 'graduates', icon: '🎓', title: 'دانش‌آموختگان', desc: 'فهرست پایه: کد، نام، کد ملی، رشته، مقطع، ورودی' },
  { kind: 'entries', cat: 'students', icon: '📥', title: 'ورودی‌های جدید' },
  { kind: 'noshow', cat: 'students', icon: '🚫', title: 'عدم مراجعه‌ها' },
  { kind: 'transfers', cat: 'students', icon: '🔀', title: 'میهمان / انتقالی' },
  { kind: 'tuition', cat: 'finance-academic', icon: '💰', title: 'گزارش شهریه / تراکنش مالی', needsTerm: true },
  { kind: 'payesh', cat: 'research', icon: '🗂️', title: 'گزارش پاسخ‌های طرح پایش' },
  { kind: 'jame', cat: 'research', icon: '🧮', title: 'دانشجویان واجد شرایط آزمون جامع' },
  { kind: 'docs', cat: 'graduates', icon: '📎', title: 'مدارک دانشجویان' },

  // ── موج ۲: ۵۰ گزارش خانواده‌ها (منطق در r-*.ts) ──
  // آموزشی/مشروطی
  { kind: 'probation-violations', cat: 'probation', icon: '⚠️', title: 'تخلفات مشروطی', needsTerm: true },
  { kind: 'probation-chains', cat: 'probation', icon: '🔗', title: 'مشروطی متناوب و متوالی', needsTerm: true },
  { kind: 'unit-cap-violations', cat: 'probation', icon: '📏', title: 'عدم رعایت سقف و کف واحد', needsTerm: true },
  { kind: 'repeated-courses', cat: 'probation', icon: '🔁', title: 'دروس چندبار اخذشده' },
  // آموزشی/برنامه و نمره
  { kind: 'student-weekly-conflicts', cat: 'program', icon: '🗓', title: 'تداخل برنامه هفتگی دانشجویان', needsTerm: true },
  { kind: 'student-exam-conflicts', cat: 'program', icon: '📝', title: 'تداخل برنامه امتحانی', needsTerm: true },
  { kind: 'prereq-violations', cat: 'probation', icon: '⛓', title: 'عدم رعایت پیش‌نیاز/هم‌نیاز', needsTerm: true },
  { kind: 'course-grade-status', cat: 'probation', icon: '📋', title: 'وضعیت درس و نمره', needsTerm: true, customs: [{ key: 'gradeStatus', title: 'وضع نمره' }, { key: 'samaCode', title: 'کد سما' }] },
  { kind: 'enrollment-pick', cat: 'program', icon: '🧾', title: 'انتخاب واحد دانشجویان', needsTerm: true },
  // آموزشی/فهرست
  { kind: 'offered-course-roster', cat: 'program', icon: '👥', title: 'دانشجویان درس ارائه‌شده', needsTerm: true },
  { kind: 'top-students', cat: 'program', icon: '🏆', title: 'نفرات برتر (معدل کل)' },
  { kind: 'no-photo', cat: 'students', icon: '📷', title: 'دانشجویان فاقد عکس' },
  { kind: 'graduates-info', cat: 'graduates', icon: '🎓', title: 'اطلاعات دانش‌آموختگان' },
  // وضعیت و عملیات
  { kind: 'status-report', cat: 'students', icon: '📊', title: 'وضعیت دانشجویان' },
  { kind: 'major-change-report', cat: 'students', icon: '🔀', title: 'تغییر رشته' },
  { kind: 'status-change-report', cat: 'students', icon: '🔄', title: 'تغییر وضعیت' },
  { kind: 'gpa-refresh-preview', cat: 'program', icon: '🧮', title: 'به‌روزرسانی معدل نیمسال' },
  { kind: 'profile-refresh', cat: 'program', icon: '👤', title: 'به‌روزرسانی نیمرخ تحصیلی' },
  { kind: 'portal-export', cat: 'program', icon: '📡', title: 'ارسال به پرتال' },
  // امتحانات
  { kind: 'exam-session-sheet', cat: 'exams', icon: '📄', title: 'صورت‌جلسه امتحان', needsTerm: true },
  { kind: 'seat-numbers', cat: 'exams', icon: '💺', title: 'شماره صندلی', needsTerm: true },
  { kind: 'final-exam-schedule', cat: 'exams', icon: '🗓', title: 'برنامه امتحانات پایان ترم', needsTerm: true },
  { kind: 'grade-entry-report', cat: 'exams', icon: '✍️', title: 'ثبت نمره استادان', needsTerm: true },
  { kind: 'grade-deadline', cat: 'exams', icon: '⏰', title: 'زمان‌بندی ثبت نمرات', needsTerm: true },
  // کلاس‌ها
  { kind: 'empty-rooms', cat: 'classes', icon: '🏚', title: 'کلاس‌های خالی', needsTerm: true },
  { kind: 'weekly-timetable', cat: 'classes', icon: '🗓', title: 'برنامه هفتگی کلاس‌ها', needsTerm: true },
  { kind: 'room-conflicts', cat: 'classes', icon: '⚠️', title: 'تداخل برنامه کلاس‌ها', needsTerm: true },
  { kind: 'low-enrollment', cat: 'classes', icon: '📉', title: 'ظرفیت به حدنصاب نرسیده', needsTerm: true },
  { kind: 'makeup-courses', cat: 'classes', icon: '🩹', title: 'دروس جبرانی/پیش‌دانشگاهی' },
  // اساتید
  { kind: 'staff-list', cat: 'classes', icon: '👨‍🏫', title: 'اساتید', needsTerm: true },
  { kind: 'staff-courses', cat: 'classes', icon: '📚', title: 'استادان مدرس دروس', needsTerm: true },
  { kind: 'staff-timetable', cat: 'classes', icon: '🗓', title: 'برنامه هفتگی اساتید', needsTerm: true },
  // تشکیل کلاس استادان — معیار: ثبتِ حضور استاد برای جلسه (professor_class_attendance)
  { kind: 'prof-formation-summary', cat: 'classes', icon: '📊', title: 'تشکیل کلاس استادان (خلاصه)', needsTerm: true },
  { kind: 'prof-formation-detail', cat: 'classes', icon: '📚', title: 'تشکیل کلاس استادان (به تفکیک درس)', needsTerm: true },
  { kind: 'prof-formation-none', cat: 'classes', icon: '🚫', title: 'استادان بدون جلسهٔ تشکیل‌شده', needsTerm: true },
  { kind: 'prof-sessions-unformed', cat: 'classes', icon: '⏳', title: 'جلسات تشکیل‌نشده', needsTerm: true, customs: [{ key: 'dateFrom', title: 'از تاریخ' }, { key: 'dateTo', title: 'تا تاریخ' }] },
  { kind: 'attendance-list', cat: 'classes', icon: '📝', title: 'حضور و غیاب', needsTerm: true },
  // مالی
  { kind: 'tuition-tariff', cat: 'finance-academic', icon: '💰', title: 'تعرفه تحصیلی', needsTerm: true },
  { kind: 'tuition-statement', cat: 'finance-academic', icon: '🧾', title: 'صورت‌حساب شهریه', needsTerm: true },
  // ── گزارش‌های پرداختی (هم‌ریخت با اسناد رسمی سما) ──
  { kind: 'total-payments', cat: 'finance', icon: '📊', title: 'گزارش کل پرداختی دانشجویان', needsTerm: true },
  { kind: 'student-payments', cat: 'finance', icon: '🧾', title: 'گزارش پرداختی دانشجویان (تفصیلی)', needsTerm: true },
  { kind: 'term-payments', cat: 'finance', icon: '💳', title: 'گزارش مبلغ پرداختی نیمسال', needsTerm: true },
  { kind: 'accounting-voucher', cat: 'finance', icon: '📑', title: 'سند حسابداری (دفتر روزنامه)', needsTerm: true, customs: [{ key: 'voucherNo', title: 'شماره سند' }] },
  { kind: 'term-financial', cat: 'finance-academic', icon: '📈', title: 'گزارش مالی نیمسال (تجمیعی)', needsTerm: true },
  { kind: 'tuition-overview', cat: 'finance-academic', icon: '🧮', title: 'مدیریت کلان وضعیت شهریه (هر دانشجو)', needsTerm: true },
  { kind: 'tuition-faculty-detail', cat: 'finance-academic', icon: '🏛️', title: 'تفصیلی مالی (دانشکده × مقطع)', needsTerm: true },
  { kind: 'faculty-financial', cat: 'finance-academic', icon: '🏢', title: 'گزارش مالی دانشکده‌ها', needsTerm: true },
  { kind: 'major-financial', cat: 'finance-academic', icon: '📚', title: 'گزارش مالی نیمسال (مقطع × رشته)', needsTerm: true },
  // ── گزارش‌های مالیِ کلان (r-finance-statements) ──
  // دسته‌هایی که در سیستم قدیم بود و در آفاق نبود: فروش، سود و زیان، ترازنامه،
  // نقدینگی، پیمانکاری، بیمه/حقوقی/VAT، دفتر روزنامه، کالا، هزینه، تخصیص، درآمد.
  { kind: 'sales-report', cat: 'finance', icon: '🧾', title: 'فروش مالی (خدمات آموزشی)', needsTerm: true },
  { kind: 'income-statement', cat: 'finance', icon: '📈', title: 'صورت سود و زیان', needsTerm: true },
  { kind: 'costing-report', cat: 'finance', icon: '🧮', title: 'بهای تمام‌شده و حاشیه', needsTerm: true },
  { kind: 'budget-variance', cat: 'finance', icon: '🎯', title: 'انحراف بودجه', needsTerm: true },
  { kind: 'balance-sheet', cat: 'finance', icon: '⚖️', title: 'صورت وضعیت مالی (ترازنامه)', needsTerm: true },
  // cashFlowRows فیلتر ترم را پشتیبانی میکند — پس کارت آن هم needsTerm میگیرد
  { kind: 'cash-flow', cat: 'finance', icon: '💧', title: 'صورت جریان نقدی (دریافت و پرداخت)', needsTerm: true },
  { kind: 'contractor-report', cat: 'finance-ops', icon: '🏗️', title: 'پیمانکاران و قراردادها', needsTerm: true },
  { kind: 'contractor-settlement', cat: 'finance-ops', icon: '🧾', title: 'ماه‌حساب پیمانکاران', needsTerm: true },
  { kind: 'insurance-report', cat: 'finance-ops', icon: '🛡️', title: 'بیمه و کسورات حق‌التدریس', needsTerm: true },
  { kind: 'legal-report', cat: 'finance-ops', icon: '⚖️', title: 'پرونده‌های حقوقی' },
  { kind: 'vat-report', cat: 'finance', icon: '🏷️', title: 'مالیات بر ارزش افزوده', needsTerm: true },
  { kind: 'general-ledger', cat: 'finance', icon: '📚', title: 'ریز دفتر کل', needsTerm: true },
  { kind: 'daily-journal', cat: 'finance', icon: '📅', title: 'دفتر روزنامه (روزانه)', needsTerm: true },
  { kind: 'inventory-report', cat: 'finance-ops', icon: '📦', title: 'موجودی کالا' },
  { kind: 'company-expenses', cat: 'finance', icon: '💸', title: 'هزینه‌های شرکت', needsTerm: true },
  { kind: 'allocation-report', cat: 'finance', icon: '🔀', title: 'تخصیص هزینه‌های مشترک', needsTerm: true },
  { kind: 'revenue-hierarchy', cat: 'finance', icon: '🏛️', title: 'درآمد به تفکیک سلسله‌مراتب دانشکده/رشته', needsTerm: true },
  // پژوهش
  { kind: 'proposal-cap', cat: 'research', icon: '🎓', title: 'ظرفیت پروپوزال استادان', soon: true },
  { kind: 'defenses', cat: 'research', icon: '🎤', title: 'لیست دفاعیات' },
  { kind: 'proposals', cat: 'research', icon: '📄', title: 'پروپوزال' },
  { kind: 'seminars', cat: 'research', icon: '💬', title: 'سمینار', soon: true },
  // شورا و مکاتبات
  { kind: 'council-edu', cat: 'council', icon: '🏛', title: 'شورای آموزشی', needsTerm: true },
  { kind: 'discipline', cat: 'council', icon: '⚖', title: 'کمیته انضباطی', soon: true },
  { kind: 'letter-templates', cat: 'council', icon: '📄', title: 'قالب‌های مکاتبات' },
  { kind: 'pending-requests', cat: 'council', icon: '⏳', title: 'درخواست‌های درانتظار' },
  { kind: 'transcript-card', cat: 'exams', icon: '🎓', title: 'کارنامه دانشجویان' },
  { kind: 'exam-entry-card', cat: 'exams', icon: '🎟', title: 'کارت ورود به جلسه', needsTerm: true },
  // مدارک و دانش‌آموختگان
  { kind: 'student-card', cat: 'graduates', icon: '🪪', title: 'کارت دانشجویی' },
  { kind: 'study-cert', cat: 'graduates', icon: '📜', title: 'گواهی اشتغال به تحصیل' },
  { kind: 'edu-confirm', cat: 'graduates', icon: '✅', title: 'تاییدیه تحصیلی' },
  { kind: 'grad-cert', cat: 'graduates', icon: '🎓', title: 'گواهی پایان تحصیلات' },
  { kind: 'military-defer', cat: 'graduates', icon: '🎖', title: 'معافیت تحصیلی' },
  { kind: 'finance-worklist', cat: 'finance', icon: '🗂️', title: 'کارتابل مالی (مانده دانشجویان)', customs: [{ key: 'onlyDebtors', title: 'فقط بدهکار (1)' }] },
  { kind: 'payroll-overview', cat: 'finance-academic', icon: '💵', title: 'حق‌التدریس اساتید', needsTerm: true },
  { kind: 'bi-teaching-quality', cat: 'finance-academic', icon: '🎯', title: 'کیفیت تدریس اساتید (BI)' },
  { kind: 'bi-facilities', cat: 'finance-academic', icon: '🏫', title: 'امکانات کلاس‌ها (BI)' },
  { kind: 'graduation-dossiers', cat: 'graduates', icon: '🎓', title: 'پرونده‌های فراغت‌التحصیل', customs: [{ key: 'dossierStatus', title: 'وضعیت (کد)' }] },
  { kind: 'grade-audit-log', cat: 'program', icon: '📜', title: 'لاگ تغییرات نمرات', needsTerm: true },
  { kind: 'third-attempt', cat: 'probation', icon: '🔁', title: 'دروس بار سوم (مردودی دو بار)', needsTerm: true },
];

const NEW_KINDS = new Set(['finance-worklist', 'payroll-overview', 'bi-teaching-quality', 'bi-facilities', 'graduation-dossiers', 'grade-audit-log', 'probation-violations', 'probation-chains', 'unit-cap-violations', 'repeated-courses', 'student-weekly-conflicts', 'student-exam-conflicts', 'prereq-violations', 'course-grade-status', 'enrollment-pick', 'offered-course-roster', 'top-students', 'no-photo', 'graduates-info', 'status-report', 'major-change-report', 'status-change-report', 'gpa-refresh-preview', 'profile-refresh', 'portal-export', 'exam-session-sheet', 'seat-numbers', 'final-exam-schedule', 'grade-entry-report', 'grade-deadline', 'empty-rooms', 'weekly-timetable', 'room-conflicts', 'low-enrollment', 'makeup-courses', 'staff-list', 'staff-courses', 'staff-timetable', 'attendance-list', 'tuition-tariff', 'tuition-statement', 'pending-requests', 'defenses', 'proposals', 'council-edu', 'letter-templates', 'transcript-card', 'exam-entry-card', 'student-card', 'study-cert', 'edu-confirm', 'grad-cert', 'military-defer']);

export default function ReportsClient({ opts, initialUniversityId, allowedKinds, scope = 'all', initialKind, initialTerm, initialExtra }: { opts: FilterOptions; initialUniversityId?: number; allowedKinds?: string[] | null; scope?: 'all' | 'edu' | 'finance'; initialKind?: string; initialTerm?: string; initialExtra?: Record<string, string> }) {
  const [kind, setKind] = useState<string>(initialKind ?? 'active-term');
  const [cat, setCat] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const initialTermCodes = (initialTerm ?? '').split(/[,،\s]+/).map(s => s.trim()).filter(Boolean);
  const [term, setTerm] = useState(initialTermCodes[0] || opts.latestTerm);
  /** حالت فیلتر ترم: یک ترم / چند ترم / همهٔ ترمها (بدون فیلتر) */
  const [termMode, setTermMode] = useState<'one' | 'many' | 'all'>(initialTermCodes.length > 1 ? 'many' : 'one');
  const [manyTerms, setManyTerms] = useState<string[]>(initialTermCodes.length > 1 ? initialTermCodes : []);
  /** ورودیِ آزادِ «چند ترم» — بازه یا فهرستِ ویرگولی (مثل «14031-14035,14044») */
  const [termInput, setTermInput] = useState('');
  const [termMsg, setTermMsg] = useState('');
  const [degreeId, setDegreeId] = useState(0);
  const [facultyId, setFacultyId] = useState(0);
  const [departmentId, setDepartmentId] = useState(0);
  const [majorId, setMajorId] = useState(0);
  const [entryYear, setEntryYear] = useState(0);
  const [q, setQ] = useState('');
  const [nationalCode, setNationalCode] = useState('');
  const [miss, setMiss] = useState('national');
  /** وضعیت تحصیلی — پیش‌فرض «در حال تحصیل» است تا فهرست‌ها با کل دانشجویان
   *  (فارغ‌التحصیل/انصرافی/فوت‌شده) پر نشوند. بقیهٔ وضعیت‌ها از همین منو
   *  قابل انتخاب‌اند. گزارش‌های ماهیت‌وضعیتی و گزارش‌هایی که سرور خودش
   *  وضعیت را تعیین می‌کند، از این پیش‌فرض مستثنا هستند (STATUS_FIXED). */
  const [status, setStatus] = useState('ACTIVE');
  /** دامنه: all = کل دوره، term = فقط نیمسالِ انتخاب‌شده */
  const [scopeMode, setScopeMode] = useState<'all' | 'term'>('all');
  /** لیست کد دانشجو: متنِ خام کاربر + کدهای نرمال‌شده‌ی اعمال‌شده */
  const [studentList, setStudentList] = useState('');
  const [studentCodes, setStudentCodes] = useState('');
  const [studentMsg, setStudentMsg] = useState('');
  const [studentListOpen, setStudentListOpen] = useState(false);
  const [universityId, setUniversityId] = useState(initialUniversityId ?? 0);
  const [extra, setExtra] = useState<Record<string, string>>(initialExtra ?? {});
  const [res, setRes] = useState<ReportResult | null>(null);
  /** اثر انگشتِ فیلترهایی که نتیجهٔ جاری با آن‌ها اجرا شده (برای هشدار کهنگی) */
  const [ranKey, setRanKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [showLinks, setShowLinks] = useState(false);

  // ── محدودسازی بر اساس مرکز (scope) + مجوزها ──
  const scopeFiltered = CARDS.filter(c =>
    scope === 'finance' ? FINANCE_CATS.has(c.cat) : scope === 'edu' ? !FINANCE_CATS.has(c.cat) : true,
  );
  const visibleCards = allowedKinds ? scopeFiltered.filter(c => allowedKinds.includes(c.kind)) : scopeFiltered;
  /** تبها = «همه» + هر دستهای که کارت مجاز دارد (با شمارنده) */
  const catKeys = CATEGORIES.map(c => c.key).filter(k => visibleCards.some(c => c.cat === k));
  const tabKeys: string[] = [ALL_TAB, ...catKeys];
  const activeTab = cat && tabKeys.includes(cat) ? cat : (catKeys[0] ?? ALL_TAB);
  const countIn = (k: ReportCat) => visibleCards.filter(c => c.cat === k).length;
  /**
   * جست‌وجو **در همهٔ دسته‌ها** انجام می‌شود؛ قبلاً فقط تب فعال جست‌وجو می‌شد و
   * عبارتِ موجود در تب دیگر پیام «یافت نشد» می‌داد.
   */
  const searchActive = search.trim().length > 0;
  const searchedCards = searchActive ? visibleCards.filter(c => faIncludes(c.title, search) || faIncludes(c.kind, search)) : visibleCards;
  const gridCards = searchActive || activeTab === ALL_TAB ? searchedCards : searchedCards.filter(c => c.cat === activeTab);
  /** گروه‌بندی نمایش: در جست‌وجو/تب «همه» بر اساس دسته، وگرنه بر اساس زیرگروهِ تب */
  const cardGroups: { label: string; cards: Card[] }[] = (() => {
    const byCat = searchActive || activeTab === ALL_TAB;
    const order: string[] = [];
    const map = new Map<string, Card[]>();
    for (const c of gridCards) {
      const label = byCat
        ? (CATEGORIES.find(x => x.key === c.cat)?.label ?? 'سایر')
        : (SUB[c.kind] ?? 'سایر');
      if (!map.has(label)) { map.set(label, []); order.push(label); }
      map.get(label)!.push(c);
    }
    return order.map(label => ({ label, cards: map.get(label)! }));
  })();

  const card = visibleCards.find(c => c.kind === kind);
  /**
   * گزارش‌های سطح درس/سالن/استاد: فیلترهای دانشجویی (مقطع/دانشکده/گروه/رشته/ورودی/کدملی)
   * برایشان معنا ندارد؛ پس در UI هم نمایش داده نمی‌شوند تا کاربر فیلتری نزند که
   * بی‌اثر است (به‌جای نشان‌دادن و نادیده‌گرفتن).
   */
  const COURSE_LEVEL_KINDS = new Set([
    'weekly-timetable', 'room-conflicts', 'empty-rooms', 'low-enrollment', 'makeup-courses',
    'staff-list', 'staff-courses', 'staff-timetable', 'payesh',
    'prof-formation-summary', 'prof-formation-detail', 'prof-formation-none', 'prof-sessions-unformed',
    'tuition-tariff', 'letter-templates', 'payroll-overview', 'bi-teaching-quality',
    'bi-facilities', 'graduation-dossiers', 'grade-audit-log',
  ]);
  const showStudentFilters = !COURSE_LEVEL_KINDS.has(kind);
  /**
   * گزارش‌هایی که **ماهیتشان** یک وضعیت خاص است و نباید فیلتر وضعیت رویشان
   * اعمال شود (وگرنه با شرطِ خودِ کوئری تضاد می‌کند و خروجی خالی می‌شود).
   * برای این‌ها `status` با مقدار ALL فرستاده می‌شود و شرطِ خودِ سرور می‌ماند؛
   * در UI هم منو قفل و دلیلش نوشته می‌شود.
   */
  const STATUS_FIXED: Record<string, string> = {
    graduates: 'GRADUATED',
    'graduates-info': 'GRADUATED',
    'portal-export': 'GRADUATED',
    noshow: 'NO_SHOW',
    transfers: 'TRANSFERRED',
    docs: 'ACTIVE',
    tuition: 'ACTIVE',
  };
  /** گزارش‌های توزیعی: فیلتر وضعیت خودِ گزارش را بی‌معنا می‌کند. */
  const STATUS_ANY_KINDS = new Set([
    'status-summary', 'status-report', 'status-change-report', 'major-change-report',
  ]);
  const fixedStatus = STATUS_FIXED[kind];
  const statusValue = fixedStatus ? 'ALL' : STATUS_ANY_KINDS.has(kind) ? 'ALL' : status;
  const STATUS_FA: Record<string, string> = {
    ACTIVE: 'در حال تحصیل',
    GRADUATED: 'فارغ‌التحصیل',
    SUSPENDED: 'محروم از تحصیل',
    WITHDRAWN: 'انصراف',
    EXPELLED: 'اخراج',
    TRANSFERRED: 'انتقالی / میهمان',
    NO_SHOW: 'عدم مراجعه',
    DECEASED: 'فوت',
    UNKNOWN: 'نامشخص',
  };
  useEffect(() => {
    if (!visibleCards.some(c => c.kind === kind)) setKind(visibleCards[0]?.kind ?? 'active-term');
    if (cat && cat !== ALL_TAB && !visibleCards.some(c => c.cat === cat)) setCat(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedKinds, scope]);
  // «همهٔ ترمها» = term خالی (همهٔ ماژولهای r-*.ts آن را «بدون فیلتر» میگیرند)؛
  // «چند ترم» = فهرست کدها در f.terms، سرور آنها را جدا اجرا و ادغام میکند.
  const effectiveTerm = termMode === 'all' ? '' : termMode === 'many' ? (manyTerms[0] ?? '') : term;
  const multiTerms = termMode === 'many' ? manyTerms.join(',') : undefined;
  /**
   * اثر انگشتِ فیلترها (بدون شمارهٔ صفحه) — برای تشخیص «نتیجهٔ کهنه»:
   * اگر کاربر بعد از اجرا فیلتر را عوض کند، جدول قبلی می‌ماند و ممکن است
   * آن را با فیلتر جدید اشتباه بگیرد و چاپ/خروجی بگیرد.
   */
  const filterKey = (o: Record<string, unknown>) =>
    JSON.stringify(Object.entries(o).filter(([k]) => k !== 'page').sort(([a], [b]) => a.localeCompare(b)));
  const filters = { term: effectiveTerm, terms: multiTerms, studentCodes, degreeId, facultyId, departmentId, majorId, entryYear, q: q.trim(), nationalCode: nationalCode.trim(), miss, page: 1, universityId, status: statusValue, scope: scopeMode, ...extra };
  const staleResult = !!res && ranKey !== '' && ranKey !== filterKey(filters as Record<string, unknown>);

  const run = async (page = 1, kindOverride?: string) => {
    const k = kindOverride ?? kind;
    if (!k) { setErr('ابتدا یک گزارش را از فهرست بالا انتخاب کنید.'); return; }
    if (termMode === 'many' && manyTerms.length === 0 && page === 1) {
      setErr('دستکم یک ترم انتخاب کنید، یا حالت «همهٔ ترمها» را بزنید.');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const used = { ...filters, page };
      const result = await runReport(k, used);
      setRes(result);
      setRanKey(filterKey(used));
      setTimeout(() => {
        const el = document.getElementById('report-result');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // جابه‌جاییِ فوکوس تا صفحه‌خوان از نتیجه باخبر شود (tabIndex=-1 روی همان عنصر)
        (el as HTMLElement | null)?.focus?.({ preventScroll: true });
      }, 50);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'خطای نامشخص در اجرای گزارش');
    } finally {
      setLoading(false);
    }
  };

  /**
   * انتخاب کارت گزارش = **فقط انتخاب**؛ هیچ درخواستی به سرور نمی‌رود.
   *
   * چرا: کاربر باید پیش از اجرا بتواند ترم/مقطع/دانشکده/رشته/وضعیت/دامنه و
   * جست‌وجو را تنظیم کند. نسخهٔ قبل با `void run(1, k)` بلافاصله شروع به
   * لود می‌کرد (و هنگام ورود با `?kind=...` یک `useEffect` هم اجرای خودکار
   * داشت)، یعنی فیلترها عملاً بعد از اجرا تعریف می‌شدند و نتیجهٔ اول بیهوده
   * بود. اجرا فقط با دکمهٔ صریح «▶ اجرای گزارش» (یا Enter در جست‌وجو)
   * انجام می‌شود.
   */
  const pick = (k: string) => {
    setKind(k);
    setRes(null);
    setErr('');
    // فیلترهای سفارشیِ گزارش قبلی نباید بی‌صدا روی گزارش جدید اثر بگذارند
    // (مثلاً «نیمسال ورود» که فقط در «نفرات برتر» دیده می‌شود).
    setExtra({});
  };

  /**
   * اعمالِ ورودیِ آزادِ «چند ترم» — بازه («14031-14035»)، ویرگولی
   * («14031,14033») یا ترکیبی؛ ارقام فارسی و «تا» هم پشتیبانی می‌شوند.
   * فقط ترم‌های موجودِ همین دانشگاه اضافه می‌شوند تا تایپِ اشتباه، گزارش را
   * بی‌صدا صفر نکند.
   */
  const applyTermInput = () => {
    if (!termInput.trim()) { setTermMsg(''); return; }
    const parsed = parseTermSelection(termInput, opts.terms.map(t => t.code));
    const merged = [...new Set([...manyTerms, ...parsed.codes])]
      .sort((a, b) => Number(a) - Number(b))
      .slice(0, MAX_TERM_CODES);
    setManyTerms(merged);
    const parts: string[] = [];
    if (parsed.codes.length) parts.push(`${faNum(parsed.codes.length)} ترم اضافه شد`);
    if (parsed.unknown.length) parts.push(`در این دانشگاه نیست: ${parsed.unknown.map(faNum).join('، ')}`);
    if (parsed.invalid.length) parts.push(`نامعتبر: ${parsed.invalid.slice(0, 5).join('، ')}`);
    if (merged.length >= MAX_TERM_CODES) parts.push(`سقف ${faNum(MAX_TERM_CODES)} ترم`);
    setTermMsg(parts.join(' — ') || 'ترمی پیدا نشد');
    if (parsed.codes.length) setTermInput('');
  };

  /**
   * اعمالِ «لیست کد دانشجو» — فهرستی که کاربر از Excel می‌چسباند.
   * تا وقتی «اعمال» نزند، فیلترِ قبلی معتبر می‌ماند (تا تایپِ نیمه‌کاره،
   * گزارش را عوض نکند).
   */
  const applyStudentList = () => {
    if (!studentList.trim()) {
      setStudentCodes('');
      setStudentMsg('فیلتر لیست برداشته شد');
      return;
    }
    const parsed = parseCodeList(studentList, { minDigits: 4, maxDigits: 20 });
    setStudentCodes(parsed.codes.join(','));
    const parts: string[] = [];
    if (parsed.codes.length) parts.push(`${faNum(parsed.codes.length)} کد اعمال شد`);
    else parts.push('هیچ کد معتبری نبود — گزارش خالی می‌شود');
    if (parsed.invalid.length) parts.push(`نامعتبر: ${parsed.invalid.slice(0, 5).join('، ')}`);
    if (parsed.truncated) parts.push(`فقط ${faNum(CODE_LIST_LIMIT)} کد اول`);
    setStudentMsg(parts.join(' — '));
  };

  const doExport = async () => {
    setExporting(true);
    setErr('');
    try {
      const { header, lines, total, truncated } = await exportReport(kind, { ...filters, page: 1 });
      // گارد تزریق فرمول CSV: مقادیر شروع‌شونده با = + - @ | تب/CR با ' خنثی می‌شوند
      const esc = (v: string) => {
        const s = /^[=+\-@|\t\r]/.test(v.trimStart()) ? `'${v}` : v;
        return `"${s.replace(/"/g, '""')}"`;
      };
      // خروجی در سرور با همان `format` ستون‌ها قالب‌بندی شده است (تاریخ شمسی/مبلغ)
      const csv = '﻿' + [header.map(esc).join(','), ...lines.map(l => l.map(esc).join(','))].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report-${kind}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      setInfoMsg(
        truncated
          ? `فایل CSV ساخته شد: ${faNum(lines.length)} ردیف از ${faNum(total)} ردیف (سقف خروجی). برای دریافت کامل، بازه/فیلتر را محدود کنید.`
          : `فایل CSV ساخته شد: ${faNum(lines.length)} ردیف.`,
      );
      setTimeout(() => setInfoMsg(''), 9000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'خطای نامشخص در خروجی');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* زیرعنوان مرکز مالی */}
      {scope === 'finance' && (
        <p className="text-xs font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">مرکز گزارش‌های مالی</p>
      )}

      {/* نوار دسته‌بندی (تب‌ها) — با شمارنده و تب «همه» */}
      {tabKeys.length > 0 && (
        <div role="tablist" aria-label="دسته‌بندی گزارش‌ها" className="flex flex-wrap items-center gap-2">
          {[{ key: ALL_TAB, label: '📚 همه' }, ...CATEGORIES]
            .filter(c => c.key === ALL_TAB || ((scope === 'finance' ? FINANCE_CATS.has(c.key as ReportCat) : scope === 'edu' ? !FINANCE_CATS.has(c.key as ReportCat) : true) && catKeys.includes(c.key as ReportCat)))
            .map(c => {
              const isAll = c.key === ALL_TAB;
              const n = isAll ? visibleCards.length : countIn(c.key as ReportCat);
              const active = activeTab === c.key;
              return (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setCat(c.key);
                    // انتخابِ قبلی اگر در تب جدید نیست پاک شود تا «اجرای گزارش»
                    // گزارشِ تبی را که دیده نمی‌شود اجرا نکند (باگ قبلی).
                    if (!isAll && !visibleCards.some(x => x.cat === c.key && x.kind === kind)) {
                      setKind('');
                      setRes(null);
                      setRanKey('');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full border-2 text-xs font-bold transition-all shadow-sm
                    ${active
                      ? 'bg-indigo-600 border-indigo-700 text-white shadow-md'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-300 hover:shadow'}`}
                >
                  {c.label}
                  <span className={`ms-1 text-2xs font-normal ${active ? 'text-indigo-100' : 'text-slate-400'}`}>
                    ({faNum(n)})
                  </span>
                </button>
              );
            })}
        </div>
      )}

      {/* جست‌وجوی گزارش‌ها — در همهٔ دسته‌ها */}
      <input
        value={search}
        aria-label="جست‌وجو در گزارش‌ها"
        onChange={e => setSearch(e.target.value)}
        placeholder={`🔍 جست‌وجو در همهٔ گزارش‌ها (نام گزارش)… (${faNum(visibleCards.length)} گزارش)`}
        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none"
      />

      {/* نوار عملیات چسبان: اجرا / Excel / چاپ — درست بعد از تبها و جستوجو و قبل از فیلترها */}
      {!card?.soon && (
        <div className="sticky top-[6.5rem] z-20 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur print:hidden">
          <span className="ml-1 hidden max-w-56 truncate text-2xs font-extrabold text-slate-600 sm:inline">
            {card?.title ?? 'گزارش'}
          </span>
          <button onClick={() => run(1)} disabled={loading || !card} title={!card ? 'ابتدا یک گزارش را انتخاب کنید' : undefined} className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded disabled:opacity-50">
            {loading ? '⏳ در حال اجرا...' : '▶ اجرای گزارش'}
          </button>
          {res && res.rows.length > 0 && (
            <>
              <button onClick={doExport} disabled={exporting} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded disabled:opacity-50 mr-auto">
                {exporting ? '⏳...' : '📥 خروجی Excel (CSV)'}
              </button>
              <ReportPrint
                title={card?.title ?? 'گزارش'}
                subtitle={[
                  card?.needsTerm
                    ? termMode === 'all'
                      ? 'همهٔ ترمها'
                      : termMode === 'many'
                        ? `ترمهای ${manyTerms.map(faNum).join('، ')}`
                        : `ترم ${faNum(term)}`
                    : null,
                  scopeMode === 'term' ? 'فقط همین نیمسال' : 'کل دوره',
                  studentCodes ? `فیلتر لیست (${faNum(studentCodes.split(',').length)} دانشجو)` : null,
                  `${faNum(res.total)} رکورد`,
                ].filter(Boolean).join('  •  ')}
                columns={res.columns}
                rows={res.rows}
                summary={res.summary}
                universityTitle={opts.universityTitle}
                universityLogoUrl={opts.universityLogoUrl}
                signers={opts.signers}
                fetchAll={() => fetchReportForPrint(kind, { ...filters })}
              />
            </>
          )}
        </div>
      )}

      {/* کارت‌های گزارش — گروه‌بندی‌شده تا هر تب قابل اسکن باشد */}
      {gridCards.length === 0 ? (
        <p className="p-6 text-center text-slate-500 text-sm bg-white border border-slate-300 rounded-xl shadow-sm">گزارشی با این عبارت یافت نشد.</p>
      ) : (
        <div className="space-y-4">
          {cardGroups.map(g => (
            <section key={g.label}>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-500">
                <span className="h-1 w-1 rounded-full bg-indigo-400" />
                {g.label}
                <span className="text-2xs font-normal text-slate-400">({faNum(g.cards.length)})</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {g.cards.map(c => {
                  const desc = c.desc ?? DESC[c.kind];
                  return (
                    <button
                      key={c.kind}
                      disabled={c.soon}
                      aria-pressed={kind === c.kind}
                      title={desc ? `${c.title} — ${desc}` : c.title}
                      onClick={() => pick(c.kind)}
                      className={`flex items-start gap-2 p-3 rounded-lg border-2 text-right font-bold text-[13px] leading-snug transition-all shadow-sm
                        ${c.soon
                          ? 'bg-stone-100 border-stone-200 text-stone-500 cursor-not-allowed'
                          : kind === c.kind
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-950 shadow-md ring-1 ring-indigo-200'
                            : 'bg-gradient-to-b from-white to-slate-100 border-slate-300 text-slate-700 hover:border-indigo-300 hover:shadow'}`}
                    >
                      <span className="text-2xl leading-none">{c.icon}</span>
                      <span className="min-w-0">
                        <span className="block line-clamp-2">{c.title}</span>
                        {desc && <span className="mt-0.5 block text-3xs font-normal text-slate-500 line-clamp-2">{desc}</span>}
                        {(c.needsTerm || c.soon) && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-200/70 px-1.5 py-0.5 text-3xs font-bold text-slate-600">
                            {c.soon ? 'به‌زودی' : 'نیازمند ترم'}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

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
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-slate-600">ترم:</span>
                <select
                  value={termMode}
                  onChange={e => setTermMode(e.target.value === 'many' ? 'many' : e.target.value === 'all' ? 'all' : 'one')}
                  className="bg-indigo-50 border border-indigo-300 rounded px-2 py-1.5 font-bold"
                  title="یک ترم، چند ترم بهصورت همزمان، یا همهٔ ترمها بدون فیلتر"
                >
                  <option value="one">یک ترم</option>
                  <option value="many">چند ترم…</option>
                  <option value="all">همهٔ ترمها</option>
                </select>
                {termMode === 'one' && (
                  <select value={term} onChange={e => setTerm(e.target.value)} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" dir="ltr">
                    {opts.terms.map(t => <option key={t.code} value={t.code}>{t.title ? `${t.title} (${t.code})` : t.code}</option>)}
                  </select>
                )}
                {termMode === 'many' && (
                  <div className="w-full space-y-1.5 rounded border border-slate-200 bg-slate-50 p-2">
                    {/* تایپِ بازه/فهرست — راهِ سریعِ انتخاب ده‌ها ترم */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        value={termInput}
                        onChange={e => { setTermInput(e.target.value); setTermMsg(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyTermInput(); } }}
                        placeholder="تایپ: 14031-14035 یا 14031,14033 یا «۱۴۰۳۱ تا ۱۴۰۳۵»"
                        className="min-w-64 flex-1 bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs"
                        dir="ltr"
                      />
                      <button type="button" onClick={applyTermInput} className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-2xs">افزودن</button>
                      <button type="button" onClick={() => setManyTerms(opts.terms.map(t => t.code))} className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-2xs">انتخاب همه</button>
                      <button type="button" onClick={() => { setManyTerms([]); setTermMsg(''); }} className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-2xs">پاک کردن</button>
                    </div>
                    {termMsg && <p className="text-2xs font-bold text-indigo-700">{termMsg}</p>}
                    {/* ترم‌های انتخاب‌شده — هر کدام با یک کلیک حذف می‌شود */}
                    <div className="flex max-h-24 flex-wrap items-center gap-1 overflow-y-auto">
                      {manyTerms.length === 0 ? (
                        <span className="text-2xs text-slate-500">هنوز ترمی انتخاب نشده است — تایپ کنید یا از فهرست پایین بزنید.</span>
                      ) : manyTerms.map(code => {
                        const t = opts.terms.find(x => x.code === code);
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => setManyTerms(prev => prev.filter(x => x !== code))}
                            title="حذف از فهرست"
                            className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-2xs hover:border-rose-400 hover:text-rose-700"
                            dir="ltr"
                          >
                            {code}{t?.title ? ` · ${t.title}` : ''} ×
                          </button>
                        );
                      })}
                      <span className="font-extrabold text-indigo-700 text-2xs">{faNum(manyTerms.length)} ترم انتخاب شد</span>
                    </div>
                    <details className="rounded border border-slate-200 bg-white px-2 py-1">
                      <summary className="cursor-pointer text-2xs font-bold text-slate-600">انتخاب از فهرست ترم‌ها</summary>
                      <div className="mt-1 flex max-h-40 flex-wrap items-center gap-1.5 overflow-y-auto">
                        {opts.terms.map(t => (
                          <label key={t.code} className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono text-2xs" dir="ltr">
                            <input
                              type="checkbox"
                              checked={manyTerms.includes(t.code)}
                              onChange={e => setManyTerms(prev => e.target.checked ? [...prev, t.code] : prev.filter(x => x !== t.code))}
                            />
                            {t.title || t.code} ({t.code})
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
            <label className="flex items-center gap-1">
              <span className="font-bold text-slate-600">مقطع:</span>
              <select value={degreeId} onChange={e => setDegreeId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-44">
                <option value={0}>همه</option>
                {opts.degrees.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
            {showStudentFilters && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">دانشکده:</span>
                <select value={facultyId} onChange={e => setFacultyId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-44">
                  <option value={0}>همه</option>
                  {opts.faculties.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            )}
            {showStudentFilters && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">گروه آموزشی:</span>
                <select value={departmentId} onChange={e => setDepartmentId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-44">
                  <option value={0}>همه</option>
                  {opts.departments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            )}
            {showStudentFilters && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">رشته:</span>
                <select value={majorId} onChange={e => setMajorId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-52">
                  <option value={0}>همه</option>
                  {opts.majors.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            )}
            {showStudentFilters && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">ورودی:</span>
                <select value={entryYear} onChange={e => setEntryYear(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" dir="ltr">
                  <option value={0}>همه</option>
                  {opts.entryYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            )}
            {kind === 'top-students' && (
              <>
                <label className="flex items-center gap-1">
                  <span className="font-bold text-slate-600">ملاک معدل:</span>
                  <select value={extra.gpaMode ?? 'OVERALL'} onChange={e => setExtra({ ...extra, gpaMode: e.target.value })} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-56">
                    <option value="OVERALL">معدل کل</option>
                    <option value="TERM">معدل یک نیمسال مشخص</option>
                    <option value="CUMULATIVE">معدل کل تا یک نیمسال</option>
                  </select>
                </label>
                {extra.gpaMode === 'TERM' && (
                  <label className="flex items-center gap-1">
                    <span className="font-bold text-slate-600">نیمسال ملاک:</span>
                    <select value={extra.gpaTerm ?? ''} onChange={e => setExtra({ ...extra, gpaTerm: e.target.value })} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-56">
                      <option value="">انتخاب کنید…</option>
                      {opts.terms.map(t => <option key={t.code} value={t.code}>{t.title || t.code}</option>)}
                    </select>
                  </label>
                )}
                {extra.gpaMode === 'CUMULATIVE' && (
                  <>
                    <label className="flex items-center gap-1">
                      <span className="font-bold text-slate-600">از نیمسال:</span>
                      <select value={extra.gpaTermFrom ?? ''} onChange={e => setExtra({ ...extra, gpaTermFrom: e.target.value })} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-52">
                        <option value="">از ابتدا</option>
                        {opts.terms.map(t => <option key={t.code} value={t.code}>{t.title || t.code}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-1">
                      <span className="font-bold text-slate-600">تا پایان نیمسال:</span>
                      <select value={extra.gpaTerm ?? ''} onChange={e => setExtra({ ...extra, gpaTerm: e.target.value })} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-52">
                        <option value="">انتخاب کنید…</option>
                        {opts.terms.map(t => <option key={t.code} value={t.code}>{t.title || t.code}</option>)}
                      </select>
                    </label>
                  </>
                )}
                <label className="flex items-center gap-1">
                  <span className="font-bold text-slate-600">تعداد نفرات برتر:</span>
                  <input value={extra.topN ?? ''} onChange={e => setExtra({ ...extra, topN: e.target.value })} type="number" min="0" max="500" placeholder="همه" className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 w-20" dir="ltr" />
                </label>
                <label className="flex items-center gap-1">
                  <span className="font-bold text-slate-600">نیمسال ورود:</span>
                  <select value={extra.entryTerm ?? ''} onChange={e => setExtra({ ...extra, entryTerm: e.target.value })} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5">
                    <option value="">همه</option>
                    <option value="1">نیمسال اول</option>
                    <option value="2">نیمسال دوم</option>
                    <option value="3">تابستان</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <span className="font-bold text-slate-600">بازهٔ ورودی:</span>
                  <input value={extra.entryYearFrom ?? ''} onChange={e => setExtra({ ...extra, entryYearFrom: e.target.value })} type="number" placeholder="از" className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 w-20" dir="ltr" />
                  <input value={extra.entryYearTo ?? ''} onChange={e => setExtra({ ...extra, entryYearTo: e.target.value })} type="number" placeholder="تا" className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 w-20" dir="ltr" />
                </label>
                <label className="flex items-center gap-1">
                  <span className="font-bold text-slate-600">جنسیت:</span>
                  <select value={extra.gender ?? ''} onChange={e => setExtra({ ...extra, gender: e.target.value })} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5">
                    <option value="">همه</option>
                    <option value="MALE">مرد</option>
                    <option value="FEMALE">زن</option>
                  </select>
                </label>
                <label className="flex items-center gap-1" title="وضعیت فعالیت دانشجو (مستقل از وضعیت تحصیلی)">
                  <span className="font-bold text-slate-600">وضعیت فعالیت:</span>
                  <select value={extra.statusScope ?? 'ALL'} onChange={e => setExtra({ ...extra, statusScope: e.target.value })} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5">
                    <option value="ALL">همه</option>
                    <option value="ACTIVE">فعال</option>
                    <option value="INACTIVE">غیرفعال</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <span className="font-bold text-slate-600">سهمیه:</span>
                  <select value={extra.quotaType ?? ''} onChange={e => setExtra({ ...extra, quotaType: e.target.value })} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5">
                    <option value="">همه</option>
                    <option value="NORMAL">عادی</option>
                    <option value="SHAHED">شاهد / ایثارگر</option>
                    <option value="STAFF">کارکنان</option>
                    <option value="TOP_TALENT">استعداد درخشان</option>
                  </select>
                </label>
              </>
            )}
            {kind === 'attendance-list' && (
              <>
                <label className="flex items-center gap-1">
                  <span className="font-bold text-slate-600">کد درس:</span>
                  <input value={extra.courseCode ?? ''} onChange={e => setExtra({ ...extra, courseCode: e.target.value })} placeholder="مثلاً 53012" className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 w-28" dir="ltr" />
                </label>
                <label className="flex items-center gap-1">
                  <span className="font-bold text-slate-600">کد استاد:</span>
                  <input value={extra.professorCode ?? ''} onChange={e => setExtra({ ...extra, professorCode: e.target.value })} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 w-28" dir="ltr" />
                </label>
                <label className="flex items-center gap-1">
                  <span className="font-bold text-slate-600">ترتیب اسامی:</span>
                  <select value={extra.orderBy ?? 'NAME'} onChange={e => setExtra({ ...extra, orderBy: e.target.value })} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5">
                    <option value="NAME">نام و نام خانوادگی</option>
                    <option value="CODE">شمارهٔ دانشجویی</option>
                    <option value="PROF">کد استاد و ساعت درس</option>
                  </select>
                </label>
                <label className="flex items-center gap-1 pb-2 text-2xs font-bold text-slate-700">
                  <input type="checkbox" checked={extra.showFinance === '1'} onChange={e => setExtra({ ...extra, showFinance: e.target.checked ? '1' : '' })} />
                  نمایش وضعیت مالی
                </label>
              </>
            )}
            {showStudentFilters && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">کد ملی:</span>
                <input
                  value={nationalCode} onChange={e => setNationalCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && run(1)}
                  placeholder="کد ملی..."
                  className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 w-36 font-mono" dir="ltr"
                />
              </label>
            )}
            {/* ── وضعیت استاد (فقط گزارش «اساتید»): پیش‌فرض فقط فعال‌ها ----------
                چرا: جدول staff برای آفاق ۱٬۳۹۹ رکورد دارد که تنها ۴۴۶ تای آن‌ها
                فعال‌اند؛ بدون این فیلتر، «اساتید» بیش از سه برابر واقعیت شمرده
                می‌شد. بقیهٔ وضعیت‌ها از همین منو قابل انتخاب‌اند. */}
            {kind === 'staff-list' && (
              <label className="flex items-center gap-1" title="پیش‌فرض فقط استادان فعال است؛ غیرفعال‌ها از همین منو">
                <span className="font-bold text-slate-600">وضعیت استاد:</span>
                <select
                  value={extra.staffStatus ?? 'ACTIVE'}
                  onChange={e => setExtra({ ...extra, staffStatus: e.target.value })}
                  className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5"
                >
                  <option value="ACTIVE">فعال (پیش‌فرض)</option>
                  <option value="INACTIVE">غیرفعال</option>
                  <option value="ALL">همه</option>
                </select>
              </label>
            )}
            {/* ── وضعیت تحصیلی + دامنهٔ گزارش (همهٔ گزارش‌ها) ── */}
            {showStudentFilters && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">وضعیت تحصیلی:</span>
                {fixedStatus ? (
                  <span className="rounded border border-slate-200 bg-slate-100 px-2 py-1.5 text-slate-600" title="این گزارش ماهیتاً فقط همین وضعیت را نشان می‌دهد">
                    {STATUS_FA[fixedStatus] ?? fixedStatus} — ثابتِ این گزارش
                  </span>
                ) : STATUS_ANY_KINDS.has(kind) ? (
                  <span className="rounded border border-slate-200 bg-slate-100 px-2 py-1.5 text-slate-600" title="این گزارش همهٔ وضعیت‌ها را برای محاسبه لازم دارد">
                    همهٔ وضعیت‌ها — لازمهٔ این گزارش
                  </span>
                ) : (
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5"
                  >
                    <option value="ACTIVE">در حال تحصیل (پیش‌فرض)</option>
                    <option value="ALL">همهٔ وضعیت‌ها</option>
                    <option value="GRADUATED">فارغ‌التحصیل</option>
                    <option value="SUSPENDED">محروم از تحصیل</option>
                    <option value="WITHDRAWN">انصراف</option>
                    <option value="EXPELLED">اخراج</option>
                    <option value="TRANSFERRED">انتقالی / میهمان</option>
                    <option value="NO_SHOW">عدم مراجعه</option>
                    <option value="DECEASED">فوت</option>
                    <option value="UNKNOWN">نامشخص</option>
                  </select>
                )}
              </label>
            )}
            {showStudentFilters && (
              <label className="flex items-center gap-1" title="کل دوره = همهٔ دانشجویان؛ فقط فعالان نیمسال = دانشجویانی که در ترم انتخابی ثبت‌نام یا ردیف مالی دارند">
                <span className="font-bold text-slate-600">دامنهٔ نیمسال:</span>
                <select
                  value={scopeMode}
                  disabled={termMode !== 'one'}
                  onChange={e => setScopeMode(e.target.value === 'term' ? 'term' : 'all')}
                  className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 disabled:opacity-50"
                  title={termMode !== 'one' ? 'برای این فیلتر، ترم را روی «یک ترم» بگذارید' : undefined}
                >
                  <option value="all">کل دوره</option>
                  <option value="term">فقط فعالان نیمسال</option>
                </select>
              </label>
            )}
            {showStudentFilters && (
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStudentListOpen(v => !v)}
                    className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-2xs hover:border-indigo-300"
                  >
                    {studentListOpen ? '▾' : '▸'} 📋 فیلترِ لیست دانشجویان
                    {studentCodes ? ` (${faNum(studentCodes.split(',').length)} کد)` : ''}
                  </button>
                  {studentCodes && (
                    <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-2xs font-bold text-emerald-800">
                      فقط این {faNum(studentCodes.split(',').length)} دانشجو
                    </span>
                  )}
                  {studentCodes && (
                    <button
                      type="button"
                      onClick={() => { setStudentList(''); setStudentCodes(''); setStudentMsg('فیلتر لیست برداشته شد'); }}
                      className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-2xs hover:border-rose-300"
                    >
                      برداشتن فیلتر
                    </button>
                  )}
                  {studentMsg && <span className="text-2xs font-bold text-indigo-700">{studentMsg}</span>}
                </div>
                {studentListOpen && (
                  <div className="mt-1.5 space-y-1.5">
                    <textarea
                      value={studentList}
                      onChange={e => { setStudentList(e.target.value); setStudentMsg(''); }}
                      onKeyDown={e => {
                        // Enter + Ctrl/Cmd = اعمال (Enter تنها برای خط جدید در لیست)
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyStudentList(); }
                      }}
                      rows={2}
                      placeholder="کدهای دانشجو را بچسبانید: 4021370010، 4021370011 یا بازه: 4021370010-4021370015 (Ctrl+Enter = اعمال)"
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs"
                      dir="ltr"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={applyStudentList}
                        className="px-3 py-1 bg-indigo-700 hover:bg-indigo-800 text-white rounded font-bold text-2xs"
                      >
                        ✔ اعمال لیست
                      </button>
                      <button
                        type="button"
                        onClick={() => { setStudentList(''); setStudentCodes(''); setStudentMsg(''); }}
                        className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-2xs"
                      >
                        پاک کردن
                      </button>
                      <span className="text-2xs text-slate-500">
                        جداکننده: ویرگول، فاصله یا خط جدید — بازهٔ کد هم مجاز است (حداکثر {faNum(CODE_LIST_LIMIT)} کد).
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
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
          </div>
        </div>
      )}

      {/* هشدار «نتیجهٔ کهنه»: فیلترها بعد از اجرا عوض شده‌اند */}
      {staleResult && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 print:hidden">
          نتیجهٔ نمایش‌داده‌شده مربوط به فیلترهای قبلی است. برای اعمال فیلترهای جدید، «▶ اجرای گزارش» را بزنید.
        </p>
      )}

      {/* پیام موفقیت خروجی/چاپ */}
      {infoMsg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 print:hidden">
          {infoMsg}
        </p>
      )}

      {/* پیوند به صفحات تخصصی — جمع‌شونده در انتها تا مسیر اجرا→نتیجه تمیز بماند */}
      {/* نتیجه */}
      <div id="report-result" tabIndex={-1} className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden scroll-mt-[10rem] print:hidden focus:outline-none">
        {err ? (
          <p role="alert" className="p-8 text-center text-rose-700 bg-rose-50 text-sm font-bold">خطا: {err}</p>
        ) : loading ? (
          <p className="p-8 text-center text-slate-600 text-sm font-bold" role="status" aria-live="polite">
            ⏳ در حال اجرای گزارش «{card?.title}»…
          </p>
        ) : !res ? (
          <p className="p-8 text-center text-slate-500 text-sm">
            {card
              ? `گزارش «${card.title}» انتخاب شد. ابتدا فیلترهای بالا را تنظیم کنید، سپس «▶ اجرای گزارش» را بزنید.`
              : 'یک گزارش را از فهرست بالا انتخاب کنید.'}
          </p>
        ) : res.rows.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-bold text-amber-700">رکوردی با این فیلترها یافت نشد.</p>
            {/* پیام تشخیصی سرور (مثل «نخست ترم را انتخاب کنید») در حالت خالی هم باید دیده شود */}
            {res.summary && <p className="mt-2 text-xs leading-6 text-slate-600">{res.summary}</p>}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
              <span role="status" aria-live="polite">
                {faNum(res.total)} رکورد در {faNum(res.totalPages)} صفحه
              </span>
              {res.summary && <span className="font-normal text-slate-600">{res.summary}</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs rt">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700 sticky top-0">
                  <tr>
                    {res.columns.map(c => <th scope="col" key={c.key} className="p-2 print:whitespace-normal">{c.title}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-200 hover:bg-slate-50">
                      {res.columns.map(c => (
                        <td key={c.key} className="p-2 font-mono print:whitespace-normal print:break-words" dir={/^[0-9]/.test(String(r[c.key] ?? '')) ? 'ltr' : 'auto'}>
                          {fmtCell(r[c.key], c.format)}
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
      <div className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden print:hidden">
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