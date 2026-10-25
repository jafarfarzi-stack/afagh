import QRCode from 'qrcode';
import type { CSSProperties } from 'react';
import { Fragment } from 'react';
import { PROFESSOR_GRID_DAYS } from '@/lib/professor-week-grid';
import { jalaliDateOf } from '@/lib/scheduling-core';
import {
  layoutProfessorCalendarDay,
  professorCalendarDayIndex,
  type ProfessorCalendarWeekType,
} from '@/lib/professor-calendar-layout';
import type { ProfessorCalendarEntry } from '@/app/professor/professor-calendar-grid';

/**
 * پوستر سردر کلاسی (درب اتاق) — یک برگهٔ A4 افقی، کل هفته در یک صفحه.
 * این کامپوننت کاملاً مستقل از گریدِ نمایشگرِ «تابلوی هفتگی» نوشته شده تا
 * دقیقاً همان چیدمانِ نمونهٔ تأییدشده (gen2 / v5) را بازتولید کند:
 *   · سربرگ: لوگو (راست) + بلوک عنوان وسط + جعبهٔ شمارهٔ اتاق + QR (چپ)
 *   · برند نرمافزار زیر سربرگ (درخواست کاربر)
 *   · شبکه: ۷ ستون شنبه→جمعه، محور عمودی ۰۷:۰۰→۲۰:۰۰، جداکنندهٔ عمودی مشکی
 *   · کارت درس: نردبان اولویت (عنوان → استاد → ساعت) با container query
 * ابعاد برگه دقیقاً ۲۹۷×۲۱۰mm است (بدون اسکیل توسط مرورگر چاپ) تا متن بزرگ و
 * اعداد ساعت روی خطوط بنشینند — برخلاف گریدِ نمایشگر که عرضش ۹۶۰px بود و
 * هنگام چاپ فشرده می‌شد.
 */

const fa = (s: string | number) =>
  String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/**
 * فاصلهٔ دیداری دورِ ارقام: نام کلاس‌ها در پایگاه داده اغلب بی‌فاصله است
 * («كلاس2كشاورزي») و روی پوستر به‌هم می‌چسبد. این تابع فقط بین رقم و حرفِ
 * مجاور فاصله می‌گذارد، پس «كلاس ۲ كشاورزي» می‌شود و بقیهٔ متن دست‌نخورده
 * می‌ماند. باید پس از `fa` صدا زده شود (ورودی، ارقامِ فارسی می‌گیرد).
 */
const spaceDigits = (s: string) =>
  s.replace(/([^\s۰-۹])([۰-۹])/g, '$1 $2').replace(/([۰-۹])([^\s۰-۹])/g, '$1 $2');

/** تبدیل ارقام فارسی به لاتین — برای کدگذاری بارکد (اسکن‌پذیر) */
const toLatinDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());

const WEEK_FA: Record<ProfessorCalendarWeekType, string> = {
  ODD: 'فرد',
  EVEN: 'زوج',
  BOTH: 'زوج و فرد',
  // «ALL» یعنی هر هفته (scheduleType=CLASS) — برچسب نمی‌گیرد (درخواستِ کاربر)
  ALL: '',
};

/** پهنای تقریبی متن بر حسب em (حروف فارسی عریض‌تر از لاتین) */
const emOfText = (s: string) => {
  const wide = (s.match(/[\u0600-\u06FF\uFB8A-\uFEFC]/g) ?? []).length;
  return wide * 0.54 + (s.length - wide) * 0.32;
};

/* ── سه حالتِ جزئیاتِ کارت (درخواست کاربر) ───────────────────────────────
   پیش از این، نمایشِ استاد و ساعت با container query بر پایهٔ «فضای تصادفیِ»
   هر کارت تصمیم گرفته می‌شد؛ نتیجه این بود که در یک پوستر بعضی کارت‌ها استاد
   داشتند و بعضی نه، و کاربر نمی‌توانست بگوید «این پوستر فقط نام درس باشد».
   حالا حالت صریح است و انتخابش با کاربر:

     ۱) title → فقط نام درس (+ برچسب زوج/فرد)
     ۲) prof  → نام درس + نام استاد
     ۳) full  → نام درس + استاد + ساعت (رفتار پیش‌فرضِ قبلی)

   سهمِ ارتفاعِ عنوان (titleShare) همان چیزی است که «فونتِ هر حالت» را تعیین
   می‌کند: در حالت ۱ کلِ ارتفاعِ کارت به تیتر می‌رسد، در حالت ۳ فقط کمی بیش از
   نیمِ آن. بقیهٔ ارتفاع بین استاد و ساعت تقسیم می‌شود. */
export type DoorSignDetail = 'title' | 'prof' | 'full';

const DETAIL: Record<DoorSignDetail, {
  /** سهمِ ارتفاعِ کارت که به تیتر می‌رسد (۰..۱) */
  titleShare: number;
  /**
   * اندازهٔ «استانداردِ» تیتر (pt) — سقفِ مطلق است، نه هدفِ رشد.
   * درسِ کوتاه در کارتِ بزرگ هم از این عدد بزرگ‌تر نمی‌شود؛ فقط اگر جا
   * نشد کوچک‌تر می‌شود. قبلاً این عدد ۲۰/۱۵/۱۳ بود و فونت با بزرگ‌شدنِ
   * کارت بزرگ می‌شد، نتیجه این بود که روی یک پوستر چند اندازهٔ متفاوت
   * دیده می‌شد («کارت بزرگ بود، فونت را هم بزرگ کرد»).
   */
  maxPt: number;
  label: string;
}> = {
  title: { titleShare: 1.0, maxPt: 15, label: 'فقط نام درس' },
  prof: { titleShare: 0.72, maxPt: 13, label: 'نام درس + استاد' },
  full: { titleShare: 0.56, maxPt: 11, label: 'نام درس + استاد + ساعت' },
};

/** پهنای برچسبِ هفته بر حسب em از فونتِ تیتر — تا در محاسبهٔ fit تیتر حساب شود
 *  (وگرنه برچسب به سطرِ بعد می‌رود و با line-clamp بریده می‌شود). */
const badgeEmOf = (wt: ProfessorCalendarWeekType) => {
  const l = WEEK_FA[wt];
  if (!l) return 0;
  const scale = l.length > 4 ? 0.46 : 0.56; // برچسبِ بلند («زوج و فرد») ریزتر
  return scale * emOfText(l) + 0.6;         // + پدینگِ برچسب و فاصلهٔ ۱mm
};

/** بازهٔ پیش‌فرضِ محور زمانِ پوستر (۸→۲۰). بعضی دانشگاه‌ها کلاس‌ها را مثلاً ۸→۱۸ دارند. */
const DEFAULT_AXIS_FROM = 8;
const DEFAULT_AXIS_TO = 20;
/** بیش از این مقدار ستونِ ساعت آن‌قدر باریک می‌شود که برچسبِ ساعت‌ها خوانا نماند. */
const MAX_AXIS_SPAN = 18;

/** ساعتِ ابتدا/انتهای محور را اعتبارسنجی و نرمال‌سازی می‌کند (نامعتبر → پیش‌فرضِ ۷→۲۰). */
function normalizeAxisHours(from?: number, to?: number): { from: number; to: number } {
  const clamp = (v: number | undefined, d: number) =>
    Number.isInteger(v) ? Math.min(Math.max(v as number, 0), 24) : d;
  const a = clamp(from, DEFAULT_AXIS_FROM);
  const b = clamp(to, DEFAULT_AXIS_TO);
  if (b - a < 1 || b - a > MAX_AXIS_SPAN) return { from: DEFAULT_AXIS_FROM, to: DEFAULT_AXIS_TO };
  return { from: a, to: b };
}

/** نشانگر هفته (فرد/زوج/زوج و فرد) — همیشه، در هر سه حالتِ جزئیات، بعد از عنوان */
function WeekBadge({ weekType }: { weekType: ProfessorCalendarWeekType }) {
  const w = WEEK_FA[weekType];
  if (!w) return null;
  return <span className={`ds-wk${w.length > 4 ? ' ds-wk-lg' : ''}`}>{w}</span>;
}


export interface DoorSignPrintProps {
  entries: ProfessorCalendarEntry[];
  logoUrl: string | null;
  room: { id: number; name: string; buildingName: string | null; floor: string | null } | null;
  termTitle: string;
  headerFaculty: string;
  headerDept: string;
  appVersion: string;
  /** نام دانشگاه — زیر لوگو نمایش داده می‌شود (درخواست کاربر R-AA) */
  universityName: string | null;
  qrBaseUrl?: string;
  /** حالت چاپ سیاه‌سفید: رنگ‌ها حذف می‌شوند و درس عملی خط‌چین می‌شود */
  mono?: boolean;
  /** مدل چیدمان: 'A' = روزها ستون (پیش‌فرض)، 'B' = روزها سطر (زمان ستون) */
  model?: 'A' | 'B';
  /** ساعتِ شروعِ محور زمان (پیش‌فرض ۷) — دانشگاه می‌تواند از تنظیمات تغییرش دهد */
  startHour?: number;
  /** ساعتِ پایانِ محور زمان (پیش‌فرض ۲۰) */
  endHour?: number;
  /**
   * حالتِ جزئیاتِ کارت — انتخابِ کاربر، نه نتیجهٔ خودکارِ فضا:
   *   'title' فقط نام درس | 'prof' درس+استاد | 'full' درس+استاد+ساعت
   */
  detail?: DoorSignDetail;
  /**
   * نمایشِ کد درس روی کارت (فیلترِ «کد درس» از نوار فیلتر). پیش‌فرض خاموش
   * چون کد کارت را شلوغ می‌کند؛ کاربر با زدنِ تیکِ «کد درس» آن را فعال می‌کند.
   */
  showCode?: boolean;
  /**
   * نمایشِ تعداد دانشجو (👥 n/ظرفیت) روی کارت (فیلترِ «تعداد دانشجو در چاپ»).
   */
  printCount?: boolean;
}

export default async function DoorSignPrint({
  entries,
  logoUrl,
  room,
  termTitle,
  headerFaculty,
  headerDept,
  appVersion,
  universityName,
  qrBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://b.afagh.ac.ir',
  mono = false,
  model = 'A',
  startHour = DEFAULT_AXIS_FROM,
  endHour = DEFAULT_AXIS_TO,
  detail = 'full',
  showCode = false,
  printCount = false,
}: DoorSignPrintProps) {
  // بازهٔ محور زمان (قابل تنظیم توسط دانشگاه) — محورِ دقیقه‌ای برای چیدمان کارت‌ها
  const axis = normalizeAxisHours(startHour, endHour);
  const axisRange = { startMinutes: axis.from * 60, endMinutes: axis.to * 60 };
  const HOURS = Array.from({ length: axis.to - axis.from + 1 }, (_, i) => axis.from + i);
  const hourCols = HOURS.length; // ۱۳ برای بازهٔ ۷→۲۰
  // جای‌گذاری درس‌ها در هر روز (همان منطق گریدِ تقویم، بدون وابستگی به گرید نمایشگر)
  const byDay: ProfessorCalendarEntry[][] = Array.from({ length: PROFESSOR_GRID_DAYS.length }, () => []);
  for (const e of entries) {
    const d = professorCalendarDayIndex(e.dayOfWeek);
    if (d == null) continue;
    byDay[d].push(e);
  }
  const placed = byDay.map((list) => layoutProfessorCalendarDay(list, axisRange));
  // سانس‌های بیرون از بازهٔ انتخابی به لبه چسبانده می‌شوند → به کاربر خبر بدهیم
  const clippedCount = placed.reduce((s, day) => s + day.filter(p => p.clipped).length, 0);

  // QR برای تأیید حضور استاد — آدرس توافق‌شده (فاز اجرا شد)
  const qrUrl = `${qrBaseUrl}/p/room-${room?.id ?? 0}`;
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 240 });
  } catch {
    qrDataUrl = '';
  }


  /* تاریخِ چاپ به شمسی و به وقتِ تهران. کانتینر UTC است و بین ۰۰:۰۰ تا
     ۰۳:۳۰ تهران تاریخِ UTC یک روز عقب‌تر است؛ با گرفتنِ اجزای تاریخ در
     Asia/Tehran و تبدیلِ همان، تاریخِ پوستر در هر ساعتی درست می‌ماند. */
  const printDate = (() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
    const gy = get('year'), gm = get('month'), gd = get('day');
    if (!gy || !gm || !gd) return '';
    return jalaliDateOf(new Date(gy, gm - 1, gd));
  })();

  // ساختمان و طبقه از رِکورد خودِ کلاس (نه هاردکد)
  const roomPlace = [room?.buildingName, room?.floor]
    .filter(Boolean)
    .map(s => fa(String(s)))
    .join(' · ');

  // عنوانِ ترم در بعضی جاها خودش با «نیمسال» شروع می‌شود؛ دوباره نچسبان
  const termLabel = /^نیمسال/.test(termTitle) ? termTitle : `نیمسال ${termTitle}`;

  const subParts = [
    headerFaculty ? `دانشکدهٔ ${headerFaculty}` : null,
    headerDept ? `گروه ${headerDept}` : null,
    termLabel,
    roomPlace || null,
  ].filter(Boolean) as string[];

  const css = `
  /* ── فونت‌ها ──────────────────────────────────────────────────────────
     متنِ پوستر: Shabnam — فونتِ فارسیِ گرد و باز، مخصوصِ اندازه‌های کوچکِ
     چاپی؛ در ۹pt روی کاغذ از Vazirmatn خواناتر است.
     تیتر: Vazirmatn Black (۹۰۰) — سنگین و پوستری برای نامِ کلاس.
     font-display:block تا در چاپ، متن هرگز با فونتِ جانشین (Tahoma) رندر
     نشود؛ چون چاپ بلافاصله پس از لود صفحه انجام می‌شود و swap فرصت ندارد. */
  @font-face { font-family:'Shabnam'; font-style:normal; font-weight:400;
    src:url('/fonts/shabnam-400.woff2') format('woff2'); font-display:block; }
  @font-face { font-family:'Shabnam'; font-style:normal; font-weight:700;
    src:url('/fonts/shabnam-700.woff2') format('woff2'); font-display:block; }
  @font-face { font-family:'Vazirmatn Display'; font-style:normal; font-weight:900;
    src:url('/fonts/vazirmatn-900.woff2') format('woff2'); font-display:block; }
  .ds-sheet { width:297mm; height:210mm; padding:5mm 6mm 4mm; display:flex; flex-direction:column;
    direction:rtl; font-family:'Shabnam', 'Vazirmatn', Tahoma, 'Segoe UI', Arial, sans-serif; color:#0f172a;
    -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
  .ds-sheet * { box-sizing:border-box; }
  .ds-hd { display:flex; align-items:center; gap:5mm; height:30mm; }
  .ds-logo-col { display:flex; flex-direction:column; align-items:center; justify-content:center; height:30mm; }
  .ds-logo { height:16mm; width:auto; display:block; }
  .ds-uni { font-size:8pt; font-weight:700; color:#1e2a6e; text-align:center; margin-top:1.4mm; line-height:1.2; }
  .ds-mid { flex:1; text-align:center; min-width:0; }
  .ds-kicker { font-size:8pt; font-weight:700; color:#1e2a6e; letter-spacing:0.2px; }
  .ds-title { font-family:'Vazirmatn Display','Shabnam',sans-serif; font-size:30pt; font-weight:900;
    line-height:1.16; color:#0b1020; letter-spacing:0; }
  .ds-sub { font-size:8.2pt; color:#334155; margin-top:1.6mm; }
  .ds-room { text-align:center; min-width:32mm; border-inline-start:0.6pt solid #cbd5e1; border-inline-end:0.6pt solid #cbd5e1; padding:0 3mm; }
  .ds-rm-label { font-size:6.5pt; color:#475569; }
  .ds-rm-num { font-size:22pt; font-weight:700; line-height:1.05; }
  .ds-rm-sub { font-size:5.8pt; color:#475569; line-height:1.25; }
  .ds-qr { text-align:center; width:28mm; }
  .ds-qr img { width:22mm; height:22mm; display:block; margin:0 auto; }
  .ds-qr-cap { font-size:5.2pt; color:#475569; line-height:1.25; margin-top:0.5mm; }
  .ds-qr-tag { display:inline-block; border:0.5pt dashed #94a3b8; border-radius:0.8mm; padding:0 0.8mm; font-size:4.6pt; color:#64748b; }
  .ds-qr-sub { font-size:4.8pt; color:#64748b; }
  .ds-rule { border-top:1.1pt solid #1e2a6e; margin:1.2mm 0 0; }
  .ds-rule2 { border-top:0.4pt solid #94a3b8; margin:0.4mm 0 1.2mm; }
  /* نام نرمافزار پایین پوستر (در فوتر)، نه بالای جدول — درخواست کاربر */
  .ds-brand-b { text-align:center; font-size:7pt; font-weight:800; color:#1e2a6e; padding-top:1mm; letter-spacing:0.3px; }

  /* کادرِ بیرونیِ جدول: بدون این border، سمت چپ و پایینِ جدول باز می‌ماند و
     پوستر «ناتماس» دیده می‌شود. لبه‌های داخلی از خودِ سلول‌ها می‌آید، پس
     فقط لبه‌های هم‌پوشان با کادر حذف شده‌اند تا خط دوبل نشود. */
  .ds-grid { flex:1; display:grid; grid-template-columns:13.5mm repeat(7,1fr); grid-template-rows:8.5mm 1fr;
    min-height:0; border:1.1pt solid #000; }
  .ds-dh { font-family:'Vazirmatn Display','Shabnam',sans-serif;
    font-size:12pt; font-weight:700; text-align:center; padding:1.2mm 0; letter-spacing:0.2px;
    background:#1e2a6e; color:#fff; border-inline-start:1.1pt solid #000; display:flex; align-items:center; justify-content:center; }
  .ds-dh.fri { background:#334155; }
  .ds-dh.empty { background:#fff; color:#0f172a; font-size:8pt; font-weight:700; }
  .ds-dh:first-child { border-inline-start:0; }
  .ds-gut { position:relative; }
  .ds-hl { position:absolute; inset-inline:0; font-size:11pt; font-weight:700; color:#0f172a; text-align:center; font-variant-numeric:tabular-nums; }
  /* برچسبِ نیم‌ساعت — کوچک و کم‌رنگ تا شلوغ نکند ولی «۹ و نیم» خوانده شود */
  .ds-hh { position:absolute; inset-inline:0; font-size:6.2pt; font-weight:600; color:#6b7280;
    text-align:center; font-variant-numeric:tabular-nums; line-height:1; }
  .ds-day { position:relative; border-inline-start:1.1pt solid #000; }
  .ds-day.fri { background:#f1f5f9; }
  .ds-day:last-child { border-inline-end:0; }
  /* خطِ ساعت‌ها: ساعتِ کامل پُررنگ، نیم‌ساعت خط‌چین و کم‌رنگ‌تر — تا «۹ و نیم»
     از «۱۰» در یک نگاه تفکیک شود. رنگ قبلیِ نیم‌ساعت (#dbe3ec) تقریباً سفید بود
     و روی کاغذ دیده نمی‌شد. */
  .ds-ln { position:absolute; inset-inline:0; border-top:0.7pt solid #64748b; }
  .ds-ln.half { border-top:0.5pt dashed #94a3b8; }
  .ds-ln.end { border-top:0; }

  /* جای‌گذاری افقیِ هر سانس از خودِ placement می‌آید (leftPercent/widthPercent)،
     دقیقاً مثل گریدِ نمایشگر. قبلاً inset-inline ثابت بود و هر سانسی تمامِ عرضِ
     ستون را می‌گرفت؛ پس دو کلاسِ هم‌زمان در یک اتاق روی هم می‌افتادند و متنِ
     کارتِ زیرین «بریده» دیده می‌شد. حالا هرکدام ستونِ خودش را دارد.
     padding افقی = فاصلهٔ دیداری بین ستون‌های هم‌پوشان و حاشیهٔ ستون از خطوط. */
  .ds-slot { position:absolute; box-sizing:border-box; padding:0.4mm 0.35mm; }
  .ds-card { container-type:size; width:100%; height:100%; overflow:hidden;
    border:0.7pt solid #6366f1; border-radius:1.1mm; background:#eef2ff;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.2mm; padding:0.5mm 0.9mm; text-align:center; }
  .ds-card.lab { border-color:#d97706; background:#fffbeb; }
  /* ── سلسله‌مراتبِ متنِ کارت ────────────────────────────────────────────
     اولویتِ قطعی (قابل‌مذاکره نیست):
       ۱) عنوان درس + برچسبِ زوج/فرد  ← همیشه دیده می‌شود
       ۲) نام استاد                  ← اگر فضا بود
       ۳) ساعتِ شروع–پایان            ← اگر فضا بود
     برچسبِ زوج/فرد عمداً inline داخلِ .ds-t است، نه خطِ جدا: اگر خطِ خودش را
     داشت در کارتِ باریک یا کارت را بیرون می‌راند یا با line-clamp حذف می‌شد.
     هیچ اندازهٔ ثابتی برای «کارتِ کوچک / بزرگ» وجود ندارد: اندازه‌ها از ارتفاع
     (cqh) و عرض (cqi) خودِ کارت گرفته می‌شوند و با clamp می‌توانند shrink کنند،
     پس کارتِ یک‌ساعته و سه‌ساعته هرکدام اندازهٔ خودشان را می‌گیرند. سقفِ pt
     مانع بزرگ‌شدنِ بی‌جا می‌شود — یعنی اگر فردا چیدمان/تعداد ستون‌ها عوض شد،
     متن خودش را تطبیق می‌دهد. */
  .ds-t { font-weight:700; line-height:1.14; color:#0b1020;
    /* shrink-to-fit: اندازه از ارتفاع و عرضِ خودِ کارت گرفته می‌شود و می‌تواند
       تا ۶.۵pt برسد. قبلاً max(11pt, …) یک کفِ سفت بود و کارتِ باریک/کوتاه
       را مجبور می‌کرد کلمه را وسطِ حرف بشکند (همان «مدیریت تولید» عمودی). */
    font-size:clamp(6.5pt, min(32cqh,13cqi), 15pt);
    display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3;
    overflow:hidden; text-align:center; word-break:break-word; overflow-wrap:anywhere; }
  .ds-wk { display:inline-block; margin-inline-start:1mm; border:0.6pt solid #b45309; border-radius:0.7mm; padding:0 0.5mm;
    font-size:0.56em; font-weight:700; color:#b45309; vertical-align:0.14em; white-space:nowrap; }
  /* برچسبِ بلند («زوج و فرد») ریزتر است تا نصفِ عرضِ کارت را نگیرد */
  .ds-wk-lg { font-size:0.46em; padding:0 0.4mm; margin-inline-start:0.7mm; }
  /* نام استاد: یک پله پایین‌تر از عنوان. نام در دو سطر می‌شکند (نه nowrap)
     چون با ellipsis به «دکتر سعید پورمح…» تبدیل می‌شد و بی‌فایده بود. */
  .ds-p { font-family:'Shabnam', 'Vazirmatn', Tahoma, sans-serif; font-weight:400; line-height:1.14;
    color:#1f2937; max-width:100%; overflow:hidden; text-align:center;
    font-size:clamp(5.5pt, min(14cqh,7.5cqi), 8pt); display:none;
    -webkit-box-orient:vertical; -webkit-line-clamp:2; word-break:break-word; }
  /* ساعتِ شروع/پایان: سومِ اولویت — کوچک‌ترین و کم‌رنگ‌ترین (بالای ستون‌ها و
     روی خط‌های ساعت هم پیداست). */
  .ds-h { font-weight:500; line-height:1.1; color:#475569;
    font-size:clamp(5pt, min(11cqh,5.5cqi), 7pt); display:none; }
  /* کد درس: برچسبِ کوچکِ نشان‌دار بالای عنوان — فقط وقتی فیلترِ «کد درس» روشن
     است رندر می‌شود (پس پیش‌فرضِ نمایش همیشه روشن است). */
  .ds-code { display:inline-block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-family:'Vazirmatn','Shabnam',Tahoma,sans-serif; font-weight:700; line-height:1.1;
    color:#3730a3; background:#e0e7ff; border:0.5pt solid #6366f1; border-radius:0.7mm;
    padding:0 1mm; font-size:clamp(6pt, min(14cqh,8cqi), 9pt); }
  /* تعداد دانشجو (👥 n/ظرفیت): زیرِ ساعت. فقط وقتی فیلترِ «تعداد دانشجو» روشن است. */
  .ds-cnt { display:block; font-weight:600; line-height:1.1; color:#0f766e;
    font-size:clamp(5pt, min(11cqh,5.5cqi), 7pt); }

  /* کدام سطرها دیده شوند — از روی فضای واقعیِ خودِ کارت.
     هندسهٔ فعلی: هر ساعت ≈ ۱۲mm، پس ۱ ساعت ≈ ۱۲mm · ۲ ساعت ≈ ۲۴mm · ۳ ساعت ≈ ۳۶mm.
     اولویت دقیقاً همان چیزی است که گفته شد: عنوان درس هرگز قربانی نمی‌شود؛
     اول نام استاد و بعد ساعت کنار می‌روند. */
  /* ── سلسله‌مراتبِ دیده‌شدن بر پایهٔ فضای واقعیِ کارت (مدل الف) ─────────────
     اولویتِ قطعی: ۱) عنوان درس + برچسبِ زوج/فرد (inline داخل .ds-t) — همیشه
     ۲) نام استاد  ۳) ساعتِ شروع–پایان. هیچ‌کدام هرگز عنوان را بیرون نمی‌رانند:
     اگر فضا کم بود استاد و بعد ساعت کنار می‌روند، نه عنوان.
     هندسهٔ مدل الف: ارتفاعِ کارت با مدتِ درس grows می‌شود (۱ ساعت ≈ ۱۲mm) و
     عرضش ستونِ روز است (≈۲۳mm؛ با سانس‌های هم‌پوشان نصف می‌شود). آستانه‌ها روی
     کانتینرِ نام‌دارِ dsa محدود شده‌اند تا قواعد مدل ب را هدف نگیرند. */
  .ds-grid .ds-card{ container-name:dsa; }
  @container dsa (min-height:11mm) and (min-width:19mm) { .ds-grid .ds-p { display:-webkit-box; } }
  @container dsa (min-height:14mm) and (min-width:22mm) { .ds-grid .ds-h { display:block; } }
  @container dsa (max-height:28mm) { .ds-grid .ds-t { -webkit-line-clamp:2; } }
  @container dsa (max-height:13mm) { .ds-grid .ds-p { display:none; } }
  @container dsa (max-width:22mm)  { .ds-grid .ds-p { display:none; } }
  @container dsa (max-width:22mm)  { .ds-grid .ds-h { display:none; } }

  /* ── حالتِ صریحِ جزئیات (انتخابِ کاربر) ──────────────────────────────────
     قواعدِ بالا می‌گویند «اگر جا بود»؛ این قواعد می‌گویند «اگر خواسته شد».
     عمداً !important دارند چون تصمیمِ کاربر باید بر تصمیمِ خودکارِ فضا مقدم
     باشد — ولی فقط برای حذف (نمایشِ اجباری نداریم؛ اگر کارت واقعاً کوچک بود
     چیزی که جا نمی‌شود نمایش داده نمی‌شود). */
  .ds-m1 .ds-p, .ds-m1 .ds-h { display:none !important; }
  .ds-m2 .ds-h { display:none !important; }
  /* در حالتِ دو‌سطری، استاد سهمِ بیشتری از ارتفاع دارد → کمی درشت‌تر.
     سه کلاس نوشته شده تا بر قاعدهٔ مخصوصِ مدل ب (.ds-day-b .ds-p) هم مقدم باشد. */
  .ds-m2 .ds-card .ds-p { font-size:clamp(6pt, min(17cqh,8cqi), 9.5pt); }

  .ds-ft { display:flex; align-items:center; justify-content:space-between; gap:4mm; font-size:7pt; color:#334155; padding-top:1.2mm; }
  .ds-ft .k { display:inline-flex; align-items:center; gap:1mm; margin-inline-end:3mm; }
  .ds-chip { display:inline-block; border:0.6pt solid #b45309; border-radius:0.7mm; padding:0 0.9mm; color:#b45309; font-weight:700; font-size:6pt; }
  .ds-sw { display:inline-block; width:3mm; height:2mm; border:0.6pt solid #6366f1; background:#eef2ff; border-radius:0.5mm; vertical-align:middle; }
  .ds-sw.lab { border-color:#d97706; background:#fffbeb; }

  /* ── حالت چاپ سیاه‌سفید: همهٔ رنگ‌ها حذف، درس عملی خط‌چین ── */
  .ds-mono .ds-dh { background:#fff; color:#0f172a; }
  .ds-mono .ds-dh.fri { background:#f1f5f9; color:#0f172a; }
  .ds-mono .ds-rule { border-top-color:#000; }
  .ds-mono .ds-rule2 { border-top-color:#000; }
  .ds-mono .ds-kicker, .ds-mono .ds-brand-b, .ds-mono .ds-uni { color:#000; }
  .ds-mono .ds-qr-sub { color:#000; }
  .ds-mono .ds-card { background:#fff; border:0.8pt solid #000; }
  .ds-mono .ds-card.lab { background:#fff; border:0.9pt dashed #000; }
  .ds-mono .ds-wk { border-color:#000; color:#000; }
  .ds-mono .ds-qr-tag { border-color:#000; color:#000; }
  .ds-mono .ds-ln { border-top-color:#000; }
  .ds-mono .ds-ln.half { border-top-color:#4b5563; }
  .ds-mono .ds-hh { color:#4b5563; }
  .ds-mono .ds-qr-cap, .ds-mono .ds-sub, .ds-mono .ds-rm-label, .ds-mono .ds-rm-sub, .ds-mono .ds-ft { color:#000; }
  .ds-mono .ds-room { border-color:#000; }
  .ds-mono .ds-sw { border-color:#000; background:#fff; }
  .ds-mono .ds-sw.lab { border-style:dashed; }
  .ds-mono .ds-chip { border-color:#000; color:#000; }
  .ds-mono .ds-code { color:#000; background:#fff; border-color:#000; }
  .ds-mono .ds-cnt { color:#000; }

  /* ── مدل ب: روزها در سطر، زمان در ستون ── */
  .ds-grid-b{ flex:1; display:grid; min-height:0;
    grid-template-columns:24mm 0.5fr repeat(${hourCols},1fr) 0.5fr; grid-template-rows:9mm repeat(7,1fr); border:1.1pt solid #000; }
  .ds-grid-b *{ box-sizing:border-box; }
  .ds-th-b{ grid-column:2/${hourCols + 4}; grid-row:1; position:relative; background:#fff; color:#0f172a; border-bottom:1.1pt solid #000; }
  .ds-thl-b{ position:absolute; top:50%; font-family:'Vazirmatn Display','Shabnam',sans-serif; font-size:12pt; font-weight:700; text-align:center; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .ds-dl-b{ grid-column:1; border-inline-end:1.1pt solid #000; border-bottom:1.1pt solid #000; background:#fff; color:#0f172a; display:flex; align-items:center; justify-content:center; font-family:'Vazirmatn Display','Shabnam',sans-serif; font-size:12pt; font-weight:700; line-height:1.1; text-align:center; }
  .ds-dl-b.fri{ background:#f1f5f9; color:#0f172a; }
  /* گوشهٔ بالا‑راست: برچسب «ساعت» (معادلِ سلولِ خالیِ سرستونِ زمان در مدل الف) */
  .ds-corner-b{ grid-column:1; grid-row:1; border-inline-end:1.1pt solid #000; border-bottom:1.1pt solid #000; background:#fff; color:#0f172a; display:flex; align-items:center; justify-content:center; font-size:8pt; font-weight:700; }
  .ds-mono .ds-corner-b{ background:#fff; color:#0f172a; }
  .ds-day-b{ grid-column:2/${hourCols + 4}; position:relative; border-bottom:1.1pt solid #000; background-image:none; }
  .ds-day-b.fri{ background-color:#f1f5f9; }
  .ds-lnv{ position:absolute; top:0; bottom:0; width:0; border-inline-start:.7pt solid #64748b; }
  .ds-lnv.half{ border-inline-start:.5pt dashed #94a3b8; }
  .ds-lnv.end{ border-inline-start:0; }
  .ds-empty-b{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#cbd5e1; font-size:16pt; font-weight:900; user-select:none; }
  /* mono برای مدل ب */
  .ds-mono .ds-th-b{ background:#fff; color:#0f172a; }
  .ds-mono .ds-dl-b{ background:#fff; color:#0f172a; }
  .ds-mono .ds-dl-b.fri{ background:#f1f5f9; color:#0f172a; }
  .ds-mono .ds-grid-b{ border-color:#000; }
  .ds-mono .ds-day-b{ background-image:none; }
  .ds-mono .ds-lnv{ border-inline-start-color:#000; }
  .ds-mono .ds-lnv.half{ border-inline-start-color:#4b5563; }
  .ds-mono .ds-thl-b{ color:#0f172a; }

  /* ── کارتِ مدل ب: ارتفاع ثابت (~۲۱mm = ارتفاع سطرِ روز)، عرض grows با مدتِ درس ──
     در مدل الف ارتفاع کارت با مدت grows می‌شود (۱ ساعت ≈ ۱۲mm … ۳ ساعت ≈ ۳۶mm) و
     آستانه‌های cqhِ کارت برایش کافی بود. در مدل ب هر کارت به‌اندازهٔ یک سطرِ روز
     است، پس با همان آستانه‌ها تیتر بزرگ می‌شد و سطرهای «استاد/ساعت» از کارت بیرون
     می‌زدند و با overflow:hidden بریده می‌شدند. حالا سهمِ هر سطر از عرضِ کارت
     (cqi) حساب می‌شود تا هر سه سطر جا شوند. کانتینرِ نام‌دار (dsb) تضمین می‌کند
     این قواعد فقط مدل ب را هدف بگیرند و کارت‌های مدل الف دست‌نخورده بمانند. */
  .ds-day-b .ds-card{ container-name:dsb; }
  /* مدل ب: ارتفاع ثابت (~۲۱mm)، عرض = مدتِ درس ÷ تعدادِ سانس‌های هم‌پوشان.
     ⚠️ font-size عنوان از JS می‌آید (fitTitlePt — shrink-to-fit واقعی بر
     پایهٔ پهنای کارت و طولِ عنوان)، پس اینجا فقط line-clamp را کنترل
     می‌کنیم. هر قاعدۀ font-size اینجا مقدار inline را لغو می‌کرد. */
  .ds-day-b .ds-p{ font-size:clamp(5.5pt, min(10cqh,5cqi), 8pt); display:none; }
  .ds-day-b .ds-h{ font-size:clamp(5pt, min(8cqh,3.6cqi), 7pt); display:none; }
  /* همان اولویت: عنوان همیشه؛ استاد اگر عرض ≥ ۱۹mm؛ ساعت اگر عرض ≥ ۲۴mm */
  @container dsb (min-width:19mm){ .ds-day-b .ds-p{ display:-webkit-box; } }
  @container dsb (min-width:24mm){ .ds-day-b .ds-h{ display:block; } }
  /* line-clamp با maxTitleLines هم‌خوان است (۳/۲/۱ سطر بر اساس پهنای کارت) */
  @container dsb (max-width:30mm){ .ds-day-b .ds-t{ -webkit-line-clamp:3; } }
  @container dsb (min-width:30mm) and (max-width:74mm){ .ds-day-b .ds-t{ -webkit-line-clamp:2; } }
  @container dsb (min-width:74mm){ .ds-day-b .ds-t{ -webkit-line-clamp:1; } }

  /* ── نمایشِ روی صفحه: پوستر ۲۹۷mm عرض دارد، پس روی نمایشگرِ معمولی
     سرریز می‌کرد و کل صفحهٔ مدیریت را از حالت ریسپانسیو بیرون می‌برد
     (اسکرول افقیِ تمام‌صفحه). با zoom پوستر همان‌قدر کوچک می‌شود که
     در عرضِ پنجره جا شود؛ چاپ تحت تأثیر نیست (zoom در @media print صفر
     می‌شود) و نسبت‌ها هم حفظ می‌مانند چون همهٔ واحدها نسبی‌اند. */
  @media screen {
    .ds-sheet { zoom: .82; margin-inline: auto; }
  }
  @media screen and (max-width: 1600px) { .ds-sheet { zoom: .72; } }
  @media screen and (max-width: 1280px) { .ds-sheet { zoom: .60; } }
  @media screen and (max-width: 1024px) { .ds-sheet { zoom: .48; } }
  @media screen and (max-width: 820px)  { .ds-sheet { zoom: .38; } }
  @media screen and (max-width: 640px)  { .ds-sheet { zoom: .30; } }

  /* ── چاپ: فقط پوستر، دقیقاً یک برگِ A4 افقی ────────────────────────────
     بدون این بلوک، دو چیز پوستر را می‌شکست:
       ۱) @pageِ سراسریِ globals.css که «A4 portrait + حاشیهٔ ۱۰mm» است،
          پس برگ عمودی می‌شد و عرضِ ۲۹۷mm سرریز می‌کرد و روی کاغذ جا نمی‌شد.
       ۲) پوستهٔ پنل مدیریت (<main class="max-w-[1600px] p-5">) که عرض را محدود
          و پوستر را از گوشهٔ کاغذ جدا می‌کرد.
     همچنین نوار فیلترها/تب‌ها نباید روی کاغذ بیاید: کلاس .wb-chrome در
     صفحهٔ میزبان فقط برای همین کار اضافه شده است.

     چرا «برگِ نام‌دار» (named page) هم اضافه شده: قاعدهٔ @page سراسری و
     قاعدهٔ اینجا هر دو در @media print‌اند و بردِ یکی بر دیگری به ترتیبِ
     بارگذاریِ استایل وابسته است — روی برخی مرورگرها/کش‌ها همان سراسری
     برنده می‌شد و خروجی عمودی می‌ماند. با page: ds-a4 به‌همراه @page ds-a4
     انتخابِ کاغذ قطعی است و دیگر به ترتیب وابسته نیست.
     ارتفاع ۲۰۹mm (نه ۲۱۰) تا خطای گِردکردنِ زیرپیکسلی برگِ دوم نسازد. */
  @media print {
    @page { size: 297mm 210mm; margin: 0; }
    @page ds-a4 { size: 297mm 210mm; margin: 0; }
    html, body { margin:0 !important; padding:0 !important; background:#fff !important; height:auto !important; }
    body:has(.ds-sheet) .wb-chrome { display:none !important; }
    body:has(.ds-sheet) main { max-width:none !important; width:auto !important; margin:0 !important; padding:0 !important; }
    body:has(.ds-sheet) .print-area { display:none !important; }
    /* پوستهٔ پنل (min-h-screen) در چاپ ارتفاعِ یک صفحهٔ کامل می‌گیرد و پوسترِ
       ۲۰۹mm را به لبه می‌چسباند؛ یک پیکسل بیشتر = برگِ دومِ خالی. */
    body:has(.ds-sheet) > div,
    body:has(.ds-sheet) .min-h-screen { min-height:0 !important; }
    .ds-sheet { page: ds-a4; zoom:1 !important; width:297mm; height:209mm;
      margin:0 !important; border-radius:0 !important; box-shadow:none !important;
      overflow:hidden; break-inside:avoid; page-break-inside:avoid;
      break-after:avoid; page-break-after:avoid; }

    /* ── سه حالتِ جزئیات باید در چاپ هم دقیقاً همان باشند ──────────────────
       قاعدههای .ds-m1/.ds-m2 بیرونِ این بلوک‌اند؛ ولی در چاپ، container query
       با ابعادِ کاغذ بازمحاسبه می‌شود و مرورگر می‌تواند قاعدهٔ فضایی
       (.ds-grid .ds-p { display:-webkit-box }) را دوباره برنده کند. تکرارِ
       صریحِ همین دو قاعده اینجا تضمین می‌کند خروجیِ کاغذ با پیش‌نمایشِ صفحه
       یکی باشد — همان چیزی که کاربر گفت «در چاپ اعمال نمی‌شود». */
    .ds-m1 .ds-p, .ds-m1 .ds-h { display:none !important; }
    .ds-m2 .ds-h { display:none !important; }
  }
  `;

  const n = HOURS.length - 1; // 13 فاصله
  const hourLabels = HOURS.map((h, i) => {
    const top = (i / n) * 100;
    const tf = i === 0 ? 'translateY(0)' : i === n ? 'translateY(-100%)' : 'translateY(-50%)';
    return { h, top, tf };
  });
  const hourLines: { top: number; half: boolean; end?: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    hourLines.push({ top: (i / n) * 100, half: false });
    hourLines.push({ top: ((i + 0.5) / n) * 100, half: true });
  }
  hourLines.push({ top: 100, half: false, end: true });

  // خطوط عمودیِ ساعت برای مدل ب (محور زمان افقی): محور ۶:۳۰→۲۰:۳۰ با بافرِ
  // نیم‌ساعته در هر دو سر، تا برچسب‌های ساعت روی خطِ خودشان بنشینند و از
  // لبهٔ کادر بیرون نزنند. n=13 ستونِ ساعتی + ۲×۰.۵fr بافر = ۱۴fr کل.
  const BUF = 0.5;
  const AXIS = n;               // ۱۳ ستونِ ساعتی (۷:۰۰→۲۰:۰۰)
  const TOTAL_FR = n + 2 * BUF; // ۱۴fr
  const remapX = (pct: number) => (BUF + (pct / 100) * AXIS) / TOTAL_FR * 100;
  const vLines: { right: number; half: boolean; end?: boolean }[] = [];
  for (let k = 0; k <= n; k++) {
    vLines.push({ right: ((BUF + k) / TOTAL_FR) * 100, half: false });
  }
  for (let k = 0; k < n; k++) {
    vLines.push({ right: ((BUF + k + 0.5) / TOTAL_FR) * 100, half: true });
  }

  /* ── shrink-to-fit عنوان درس ────────────────────────────────────────────
     مشکل: کارتِ مدل ب باریک است (۱ ساعت ≈ ۱۸.۶mm) و عنوانِ چندکلمه‌ای مثل
     «مبانی مددکاری تجربی اجتماعی» به ۴ خط می‌شکست و با line-clamp بریده
     می‌شد. کاربر می‌خواهد عنوان «در سطر خودش» کوچک شود، نه اینکه بشکند.

     راه‌حل: CSS نمی‌تواند عرضِ متن را اندازه بگیرد، پس از قبل حساب می‌کنیم.
     عرضِ کارت از هندسهٔ گرید می‌آید (برگهٔ ۲۹۷mm − پدینگِ ۱۲mm − ستونِ
     برچسبِ ۲۴mm، تقسیم بر TOTAL_FR). سپس بزرگ‌ترین فونتِ نردبان را بر
     می‌داریم که عنوان در حداکثر maxLines سطر جا شود.

     عرضِ تقریبیِ هر حرف فارسی در Vazirmatn ≈ ۰.۵۴em (میانگین وزن‌دار)،
     فاصله ≈ ۰.۲۸em. این تخمین محافظه‌کارانه است: اگر واقعیت کوچک‌تر بود،
     فونت فقط کمی بزرگ‌تر می‌شود و همچنان جا دارد. */
  const SHEET_MM = 297;
  const SHEET_PAD_MM = 6 + 6;          // padding افقی برگه
  const LABEL_COL_MM = 24;             // ستون برچسب روز در مدل ب
  const AXIS_MM = (SHEET_MM - SHEET_PAD_MM - LABEL_COL_MM) / TOTAL_FR; // ≈۲۰mm per fr
  const CARD_PAD_MM = 0.35 * 2 + 0.9 * 2; // پدینگ افقی slot + کارت
  const PT_PER_MM = 72 / 25.4;
  const LINE_H = 1.16;                 // line-height مؤثر .ds-t + حاشیهٔ اطمینان

  /* ── ارتفاعِ واقعیِ کارت ─────────────────────────────────────────────────
     تا امروز فقط «عرض» در محاسبهٔ فونت دخیل بود؛ به همین دلیل در حالتِ
     عنوان‌تنها فونت بزرگ نمی‌شد — هنوز فکر می‌کرد استاد و ساعت هم باید جا
     شوند. حالا ارتفاعِ کارت هم از هندسهٔ برگه حساب می‌شود:
       برگه ۲۱۰mm − پدینگِ عمودی ۹ − سربرگ ۳۰ − دو خط ۲.۸ − پانویس ۸ ≈ ۱۶۰mm
     مدل الف: ۱۶۰ − سرستونِ ۸.۵ ≈ ۱۵۱.۵mm برای کلِ محور زمان.
     مدل ب  : ۱۶۰ − سرستونِ ۹ ≈ ۱۵۱mm ÷ ۷ سطرِ روز ≈ ۲۱.۶mm هر روز. */
  const GRID_MM = 210 - (5 + 4) - 30 - 2.8 - 8;   // ≈۱۶۰
  const BODY_MM_A = GRID_MM - 8.5;                // ارتفاعِ محور در مدل الف
  const ROW_MM_B = (GRID_MM - 9) / 7;             // ارتفاعِ سطرِ روز در مدل ب
  const CARD_PAD_V_MM = 0.4 * 2 + 0.5 * 2;        // پدینگ عمودی slot + کارت

  /**
   * بزرگ‌ترین فونتِ تیتر (pt) که هم در عرض و هم در ارتفاعِ مجازِ همان حالت
   * جا شود. فرمولِ قبلی فقط عرض را می‌دید و ارتفاع را به clampِ CSS می‌سپرد؛
   * نتیجه این بود که «حالت» نمی‌توانست فونت را عوض کند. اینجا هر سه قید با
   * هم بررسی می‌شوند:
   *   ۱) تعداد سطرها از عرضِ کارت بیرون نزند،
   *   ۲) مجموعِ ارتفاعِ سطرها از سهمِ تیتر در همان حالت بیرون نزند،
   *   ۳) بلندترین «کلمه» در یک سطر جا شود — وگرنه مرورگر کلمه را وسطِ حرف
   *      می‌شکند (همان «مدیریت تولید» عمودی که کاربر شکایت کرد).
   */
  function fitTitlePt(
    title: string, cardWmm: number, cardHmm: number, maxLines: number,
    mode: DoorSignDetail, badgeEm: number,
  ): number {
    const innerW = Math.max(cardWmm - CARD_PAD_MM, 3) * PT_PER_MM;
    const budgetH = Math.max(cardHmm - CARD_PAD_V_MM, 3) * PT_PER_MM * DETAIL[mode].titleShare;
    const words = title.split(/\s+/).filter(Boolean);
    const widestWord = words.length ? Math.max(...words.map(emOfText)) : 1;
    // برچسبِ هفته inline داخلِ تیتر است، پس عرضش را هم حساب می‌کنیم
    // ۱.۰۶ = حاشیهٔ اطمینان برای شکستنِ سطر روی مرزِ کلمه
    const emWidth = Math.max(emOfText(title) + badgeEm, 0.6) * 1.06;
    // نردبانِ ریزِ ۰.۲۵pt از سقفِ حالت به پایین؛ اولین اندازه‌ای که جا شود برنده است
    for (let pt = DETAIL[mode].maxPt; pt >= 5; pt -= 0.25) {
      if (widestWord * pt > innerW) continue;              // کلمهٔ بلندتر از سطر
      const lines = Math.ceil((emWidth * pt) / innerW);
      if (lines > maxLines) continue;                      // سطرِ بیشتر از مجاز
      if (lines * pt * LINE_H > budgetH) continue;         // بلندتر از سهمِ ارتفاع
      return Math.round(pt * 10) / 10;
    }
    return 5;
  }

  /** حداکثر سطرهای مجاز بر اساس پهنای کارت — کارتِ عریض‌تر = سطرِ کمتر.
   *  در «فقط نام درس» یک سطر بیشتر مجاز است، چون ارتفاعِ استاد/ساعت آزاد شده. */
  function maxTitleLines(cardMm: number, mode: DoorSignDetail): number {
    const base = cardMm >= 74 ? 1 : cardMm >= 30 ? 2 : 3;
    return mode === 'title' ? Math.min(base + 1, 4) : base;
  }

  const modeClass = detail === 'title' ? 'ds-m1' : detail === 'prof' ? 'ds-m2' : 'ds-m3';

  return (
    <div className={`ds-sheet${mono ? ' ds-mono' : ''} ${modeClass}`} dir="rtl">
      <style>{css}</style>

      {/* ── سربرگ ──
          نام کلاس، عنوانِ وسط است (از classrooms.name). نام مؤسسه از دادهٔ
          دانشگاه زیر آرم می‌آید و در وسط تکرار نمی‌شود. */}
      <div className="ds-hd">
        <div className="ds-logo-col">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ds-logo" src={logoUrl} alt="آرم دانشگاه" />
          ) : (
            <div className="ds-logo" style={{ width: '20mm', height: '20mm' }} />
          )}
          {universityName ? <div className="ds-uni">{fa(universityName)}</div> : null}
        </div>
        <div className="ds-mid">
          <div className="ds-title">{room ? spaceDigits(fa(room.name)) : 'سردر کلاسی'}</div>
          <div className="ds-sub">{subParts.join(' · ')}</div>
        </div>
        <div className="ds-qr">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR" />
          ) : (
            <div style={{ width: '13mm', height: '13mm', border: '0.5pt dashed #94a3b8', borderRadius: '1mm' }} />
          )}
          <div className="ds-qr-cap">تأیید حضور استاد<br /><span className="ds-qr-sub">اسکن برای ثبت حضور</span></div>
        </div>
      </div>

      <div className="ds-rule" />
      <div className="ds-rule2" />

      {/* ── شبکه ── */}
      {model === 'B' ? (
        /* مدل ب: روزها در سطر، زمان در ستون. همان کارت‌ها (.ds-slot/.ds-card)
           را بازاستفاده می‌کنیم؛ فقط محور عوض می‌شود: محور زمان افقی
           (چپ‌بندی از p.topPercent و عرض از p.heightPercent) و ستونِ هم‌پوشان
           عمودی (بالا از p.leftPercent و ارتفاع از p.widthPercent). منطق
           layoutProfessorCalendarDay دست‌نخورده می‌ماند. */
        <div className="ds-grid-b">
          <div className="ds-th-b">
            {HOURS.map((h, i) => {
              /* برچسب دقیقاً روی خطِ ساعتِ خودش می‌نشیند — همان‌جایی که لبهٔ
                 کارت‌ها و خطوط عمودی هستن (مثل مدل الف). بافرِ نیم‌ساعتهٔ دو سر
                 (۶:۳۰ و ۲۰:۳۰ نانوشته) فاصلهٔ کافی تا لبهٔ کادر می‌دهد، پس ۷:۰۰
                 در ۳.۶٪ و ۲۰:۰۰ در ۹۶.۴٪ از لبهٔ راست می‌نشینند و بیرون نمی‌زنند. */
              return (
                <div
                  key={h}
                  className="ds-thl-b"
                  style={{
                    right: `${((BUF + i) / TOTAL_FR) * 100}%`,
                    /* ⚠️ با لنگرِ right، مرکز کردن با ‎+50%‎ انجام می‌شود نه ‎-50%‎.
                       با ‎-50%‎ برچسب به‌اندازهٔ تمامِ عرضِ خودش چپ‌تر می‌افتاد
                       (≈۰.۵ ساعت برای ارقام یک‌رقمی) — همان «نیم ساعت جلوتر». */
                    transform: 'translate(50%, -50%)',
                  }}
                >{`${fa(h)}:۰۰`}</div>
              );
            })}
          </div>
          {placed.map((dayPlaced, dayIdx) => (
            <Fragment key={dayIdx}>
              <div className={`ds-dl-b${dayIdx === 6 ? ' fri' : ''}`} style={{ gridRow: dayIdx + 2 }}>{PROFESSOR_GRID_DAYS[dayIdx]}</div>
              <div className={`ds-day-b${dayIdx === 6 ? ' fri' : ''}`} style={{ gridRow: dayIdx + 2 }}>
                {vLines.map((ln, i) => (
                  <div key={i} className={`ds-lnv${ln.half ? ' half' : ''}${ln.end ? ' end' : ''}`} style={{ right: `${ln.right}%` }} />
                ))}
                {dayPlaced.length === 0 && (
                  <div className="ds-empty-b">—</div>
                )}
                {dayPlaced.map((p, i) => {
                  const e = p.entry as ProfessorCalendarEntry;
                  // پهنای واقعی کارت بر حسب میلی‌متر — برای shrink-to-fit عنوان
                  const cardMm = (p.heightPercent / 100) * AXIS * AXIS_MM;
                  const cardHmm = (p.widthPercent / 100) * ROW_MM_B;
                  const lines = maxTitleLines(cardMm, detail);
                  return (
                    <div
                      key={`${p.key}#${i}`}
                      className="ds-slot"
                      style={{
                        top: `${p.leftPercent}%`,
                        height: `${p.widthPercent}%`,
                        // محور زمان افقی با بافر: چپ‌بندی و عرض را از اسپنِ ۷–۲۰
                        // به اسپنِ بافر‌دار (۶:۳۰→۲۰:۳۰) بازنگاشت می‌کنیم
                        insetInlineStart: `${remapX(p.topPercent)}%`,
                        width: `${p.heightPercent * (AXIS / TOTAL_FR)}%`,
                      }}
                    >
                      <div className={`ds-card${e.courseType === 'عملی' ? ' lab' : ''}`}>
                        {showCode && e.code ? <div className="ds-code">{fa(e.code)}</div> : null}
                        <div className="ds-t" style={{ fontSize: `${fitTitlePt(e.title, cardMm, cardHmm, lines, detail, badgeEmOf(e.weekType))}pt`, WebkitLineClamp: lines }}>
                          {e.title}{e.merged ? ' 🔗' : ''}
                          <WeekBadge weekType={e.weekType} />
                        </div>
                        {e.professorName ? <div className="ds-p">{e.professorName}</div> : null}
                        <div className="ds-h"><span dir="ltr">{fa(e.startTime)} – {fa(e.endTime)}</span></div>
                        {printCount && (e.enrolledCount != null || e.capacity != null) ? (
                          <div className="ds-cnt"><span dir="ltr">👥 {fa(e.enrolledCount ?? '—')}/{fa(e.capacity ?? '—')}</span></div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="ds-grid">
          <div className="ds-dh empty">ساعت</div>
          {PROFESSOR_GRID_DAYS.map((day, i) => (
            <div key={day} className={`ds-dh${i === 6 ? ' fri' : ''}`}>{day}</div>
          ))}

          <div className="ds-gut">
            {hourLabels.map(({ h, top, tf }) => (
              <div key={h} className="ds-hl" style={{ top: `${top}%`, transform: tf } as CSSProperties}>
                {fa(h)}
              </div>
            ))}
            {/* نشانگرِ نیم‌ساعت: «۳۰» کوچک روی خطِ خط‌چین، تا ۹:۳۰ از ۱۰ تفکیک شود */}
            {hourLabels.slice(0, -1).map(({ h, top }) => (
              <div
                key={`half-${h}`}
                className="ds-hh"
                style={{ top: `${top + 50 / n}%`, transform: 'translateY(-50%)' } as CSSProperties}
              >
                ۳۰
              </div>
            ))}
          </div>
          {placed.map((dayPlaced, dayIdx) => (
            <div key={dayIdx} className={`ds-day${dayIdx === 6 ? ' fri' : ''}`}>
              {hourLines.map((ln, i) => (
                <div
                  key={i}
                  className={`ds-ln${ln.half ? ' half' : ''}${ln.end ? ' end' : ''}`}
                  style={{ top: `${ln.top}%` }}
                />
              ))}
              {dayPlaced.length === 0 && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '16pt', fontWeight: 900, userSelect: 'none' }}>—</div>
              )}
              {dayPlaced.map((p, i) => {
                const e = p.entry as ProfessorCalendarEntry;
                // پهنای واقعی کارت: ستونِ روز ≈ (۲۸۵ − ۱۳.۵)/۷ ≈ ۳۸.۸mm،
                // ضربدر سهمِ این کارت از ستون (p.widthPercent) — برای shrink-to-fit
                const dayColMm = (SHEET_MM - SHEET_PAD_MM - 13.5) / 7;
                const cardMm = (p.widthPercent / 100) * dayColMm;
                const cardHmm = (p.heightPercent / 100) * BODY_MM_A;
                const lines = maxTitleLines(cardMm, detail);
                return (
                  <div
                    key={`${p.key}#${i}`}
                    className="ds-slot"
                    style={{
                      top: `${p.topPercent}%`,
                      height: `${p.heightPercent}%`,
                      // در RTL، inline-start همان لبهٔ راست است؛ سانسِ زودتر
                      // (col 0) سمت راست می‌نشیند که ترتیبِ خواندنِ فارسی است.
                      insetInlineStart: `${p.leftPercent}%`,
                      width: `${p.widthPercent}%`,
                    }}
                  >
                    <div className={`ds-card${e.courseType === 'عملی' ? ' lab' : ''}`}>
                      {showCode && e.code ? <div className="ds-code">{fa(e.code)}</div> : null}
                      <div className="ds-t" style={{ fontSize: `${fitTitlePt(e.title, cardMm, cardHmm, lines, detail, badgeEmOf(e.weekType))}pt`, WebkitLineClamp: lines }}>
                        {e.title}{e.merged ? ' 🔗' : ''}
                        <WeekBadge weekType={e.weekType} />
                      </div>
                      {e.professorName ? <div className="ds-p">{e.professorName}</div> : null}
                      <div className="ds-h"><span dir="ltr">{fa(e.startTime)} – {fa(e.endTime)}</span></div>
                      {printCount && (e.enrolledCount != null || e.capacity != null) ? (
                        <div className="ds-cnt"><span dir="ltr">👥 {fa(e.enrolledCount ?? '—')}/{fa(e.capacity ?? '—')}</span></div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── پانویس ── */}
      {clippedCount > 0 && (
        <div style={{ fontSize: '6.6pt', fontWeight: 700, color: '#b45309', textAlign: 'center', paddingTop: '0.7mm' }}>
          {fa(clippedCount)} سانس بیرون از بازهٔ {fa(axis.from)}:۰۰–{fa(axis.to)}:۰۰ است و به لبهٔ نمودار چسبانده شد.
        </div>
      )}
      <div className="ds-ft">
        <div>
          <span className="k"><span className="ds-sw" />تئوری</span>
          <span className="k"><span className="ds-sw lab" />عملی / آزمایشگاه</span>
          <span className="k"><span className="ds-chip">فرد</span><span className="ds-chip">زوج</span> هفتهٔ فرد یا زوج</span>
        </div>
        <div>محور زمان {fa(axis.from)}:۰۰ تا {fa(axis.to)}:۰۰ · هر {model === 'B' ? 'ستون' : 'خط افقی'} = یک ساعت · خط‌چین = نیم‌ساعت · ساعت‌های خالی: کلاس ندارد · کارت: {DETAIL[detail].label}</div>
        <div>چاپ: <span dir="ltr">{fa(printDate)}</span></div>
      </div>
      <div className="ds-brand-b">سامانه جامع آفاق · نسخهٔ {fa(appVersion)}{model === 'B' ? ' · مدل ب (روزها در سطر)' : ''}</div>
    </div>
  );
}
