import QRCode from 'qrcode';
import type { CSSProperties, JSX } from 'react';
import { PROFESSOR_GRID_DAYS } from '@/lib/professor-week-grid';
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

/** تبدیل ارقام فارسی به لاتین — برای کدگذاری بارکد (اسکن‌پذیر) */
const toLatinDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());

const WEEK_FA: Record<ProfessorCalendarWeekType, string> = {
  ODD: 'فرد',
  EVEN: 'زوج',
  BOTH: 'زوج و فرد',
  ALL: '',
};

const START_MIN = 7 * 60;
const END_MIN = 20 * 60;
const TOTAL = END_MIN - START_MIN;
const HOURS = Array.from({ length: END_MIN / 60 - START_MIN / 60 + 1 }, (_, i) => START_MIN / 60 + i); // 7..20

/** نشانگر هفته (فرد/زوج/زوج و فرد) — بعد از عنوان درس */
function WeekBadge({ weekType }: { weekType: ProfessorCalendarWeekType }) {
  const w = WEEK_FA[weekType];
  if (!w) return null;
  return <span className="ds-wk">{w}</span>;
}

/** رندر بارکد Code128 از رشتهٔ باینری (۱ = نوار سیاه، ۰ = فاصله) */
function BarcodeSvg({
  binary,
  heightMm = 10,
  unitMm = 0.42,
  quiet = 10,
}: {
  binary: string;
  heightMm?: number;
  unitMm?: number;
  quiet?: number;
}) {
  const modules = binary.split('').map((c) => c === '1');
  const total = modules.length + quiet * 2;
  const W = total * unitMm;
  let x = quiet * unitMm;
  const rects: JSX.Element[] = [];
  modules.forEach((isBar, idx) => {
    if (isBar) {
      rects.push(<rect key={idx} x={x} y={0} width={unitMm} height={heightMm} fill="#000" />);
    }
    x += unitMm;
  });
  return (
    <svg className="ds-bc-svg" width={W} height={heightMm} viewBox={`0 0 ${W} ${heightMm}`} preserveAspectRatio="none">
      {rects}
    </svg>
  );
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
  qrBaseUrl = 'https://b.afagh.ac.ir',
  mono = false,
}: DoorSignPrintProps) {
  // جای‌گذاری درس‌ها در هر روز (همان منطق گریدِ تقویم، بدون وابستگی به گرید نمایشگر)
  const byDay: ProfessorCalendarEntry[][] = Array.from({ length: PROFESSOR_GRID_DAYS.length }, () => []);
  for (const e of entries) {
    const d = professorCalendarDayIndex(e.dayOfWeek);
    if (d == null) continue;
    byDay[d].push(e);
  }
  const placed = byDay.map((list) => layoutProfessorCalendarDay(list));

  // QR برای تأیید حضور استاد — آدرس توافق‌شده (فاز اجرا شد)
  const qrUrl = `${qrBaseUrl}/p/room-${room?.id ?? 0}`;
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 240 });
  } catch {
    qrDataUrl = '';
  }

  // بارکد (Code128) شناسهٔ اتاق — برای اسکن سریع روی پوستر
  const bcValue = toLatinDigits(String(room?.name ?? room?.id ?? ''));
  let bcBinary = '';
  try {
    const mod: any = await import('jsbarcode');
    const JsBarcode = mod.default ?? mod;
    const Code128 = JsBarcode.getModule('CODE128');
    const inst = new Code128(bcValue, {});
    bcBinary = (inst.encode().data as string) ?? '';
  } catch {
    bcBinary = '';
  }

  const subParts = [
    headerFaculty ? `دانشکدهٔ ${headerFaculty}` : null,
    headerDept ? `گروه ${headerDept}` : null,
    `نیمسال ${termTitle}`,
  ].filter(Boolean) as string[];

  const css = `
  .ds-sheet { width:297mm; height:210mm; padding:5mm 6mm 4mm; display:flex; flex-direction:column;
    direction:rtl; font-family:'Vazirmatn', Tahoma, 'Segoe UI', Arial, sans-serif; color:#0f172a;
    -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
  .ds-sheet * { box-sizing:border-box; }
  .ds-hd { display:flex; align-items:center; gap:5mm; height:30mm; }
  .ds-logo-col { display:flex; flex-direction:column; align-items:center; justify-content:center; height:30mm; }
  .ds-logo { height:15mm; width:auto; display:block; }
  .ds-uni { font-size:6pt; font-weight:700; color:#1e2a6e; text-align:center; margin-top:0.7mm; line-height:1.1; }
  .ds-mid { flex:1; text-align:center; min-width:0; }
  .ds-kicker { font-size:8pt; font-weight:700; color:#1e2a6e; letter-spacing:0.2px; }
  .ds-title { font-size:22pt; font-weight:800; line-height:1.1; }
  .ds-sub { font-size:7.5pt; color:#334155; margin-top:0.4mm; }
  .ds-room { text-align:center; min-width:32mm; border-inline-start:0.6pt solid #cbd5e1; border-inline-end:0.6pt solid #cbd5e1; padding:0 3mm; }
  .ds-rm-label { font-size:6.5pt; color:#475569; }
  .ds-rm-num { font-size:22pt; font-weight:700; line-height:1.05; }
  .ds-rm-sub { font-size:5.8pt; color:#475569; line-height:1.25; }
  .ds-qr { text-align:center; width:20mm; }
  .ds-qr img { width:13mm; height:13mm; display:block; margin:0 auto; }
  .ds-qr-cap { font-size:5.2pt; color:#475569; line-height:1.25; margin-top:0.5mm; }
  .ds-qr-tag { display:inline-block; border:0.5pt dashed #94a3b8; border-radius:0.8mm; padding:0 0.8mm; font-size:4.6pt; color:#64748b; }
  .ds-bc { margin-top:1.4mm; text-align:center; }
  .ds-bc-svg { width:18mm; height:10mm; display:block; margin:0 auto; }
  .ds-bc-cap { font-size:5pt; color:#475569; margin-top:0.4mm; letter-spacing:0.3px; }
  .ds-bc-ph { width:18mm; height:10mm; border:0.5pt dashed #cbd5e1; margin:0 auto; border-radius:0.6mm; }
  .ds-qr-sub { font-size:4.8pt; color:#64748b; }
  .ds-rule { border-top:1.1pt solid #1e2a6e; margin:1.2mm 0 0; }
  .ds-rule2 { border-top:0.4pt solid #94a3b8; margin:0.4mm 0 1.2mm; }
  .ds-brand { text-align:center; font-size:8pt; font-weight:800; color:#1e2a6e; margin-top:1.4mm; letter-spacing:0.3px; }

  .ds-grid { flex:1; display:grid; grid-template-columns:13.5mm repeat(7,1fr); grid-template-rows:8.5mm 1fr; min-height:0; }
  .ds-dh { font-size:12pt; font-weight:700; text-align:center; padding:1.2mm 0; letter-spacing:0.2px;
    background:#1e2a6e; color:#fff; border-inline-start:1.1pt solid #000; display:flex; align-items:center; justify-content:center; }
  .ds-dh.fri { background:#334155; }
  .ds-dh.empty { background:#fff; color:#0f172a; font-size:8pt; font-weight:700; }
  .ds-gut { position:relative; border-inline-start:1.1pt solid #000; }
  .ds-hl { position:absolute; inset-inline:0; font-size:11pt; font-weight:700; color:#0f172a; text-align:center; font-variant-numeric:tabular-nums; }
  .ds-day { position:relative; border-inline-start:1.1pt solid #000; }
  .ds-day.fri { background:#f1f5f9; }
  .ds-day:last-child { border-inline-end:1.1pt solid #000; }
  .ds-ln { position:absolute; inset-inline:0; border-top:0.6pt solid #94a3b8; }
  .ds-ln.half { border-top:0.35pt dashed #dbe3ec; }
  .ds-ln.end { border-top:1.1pt solid #000; }

  .ds-slot { position:absolute; inset-inline:0.7mm; padding:0.4mm 0; }
  .ds-card { container-type:size; width:100%; height:100%; overflow:hidden;
    border:0.7pt solid #6366f1; border-radius:1.1mm; background:#eef2ff;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.3mm; padding:0.8mm 1mm; text-align:center; }
  .ds-card.lab { border-color:#d97706; background:#fffbeb; }
  .ds-t { font-weight:700; line-height:1.06; color:#0b1020; font-size:min(34cqh,12.5cqi,15pt);
    display:block; text-align:center; max-height:3.25em; overflow:hidden; word-break:break-word; overflow-wrap:anywhere; }
  .ds-wk { display:inline-block; margin-inline-start:1mm; border:0.6pt solid #b45309; border-radius:0.7mm; padding:0 0.5mm;
    font-size:0.56em; font-weight:700; color:#b45309; vertical-align:0.14em; white-space:nowrap; }
  .ds-p { font-weight:400; line-height:1.1; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;
    font-size:min(20cqh,9cqi,9.5pt); display:none; }
  .ds-h { font-weight:700; line-height:1.1; color:#111827; white-space:nowrap;
    font-size:min(20cqh,9cqi,9.5pt); display:none; }
  @container (min-height:9mm)  { .ds-p { display:block; } }
  @container (min-height:15mm) { .ds-h { display:block; } }
  @container (max-width:22mm)  { .ds-p { display:none; } }

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
  .ds-mono .ds-kicker, .ds-mono .ds-brand, .ds-mono .ds-uni { color:#000; }
  .ds-mono .ds-qr-sub, .ds-mono .ds-bc-cap { color:#000; }
  .ds-mono .ds-card { background:#fff; border:0.8pt solid #000; }
  .ds-mono .ds-card.lab { background:#fff; border:0.9pt dashed #000; }
  .ds-mono .ds-wk { border-color:#000; color:#000; }
  .ds-mono .ds-qr-tag { border-color:#000; color:#000; }
  .ds-mono .ds-ln { border-top-color:#000; }
  .ds-mono .ds-ln.half { border-top-color:#888; }
  .ds-mono .ds-qr-cap, .ds-mono .ds-sub, .ds-mono .ds-rm-label, .ds-mono .ds-rm-sub, .ds-mono .ds-ft { color:#000; }
  .ds-mono .ds-room { border-color:#000; }
  .ds-mono .ds-sw { border-color:#000; background:#fff; }
  .ds-mono .ds-sw.lab { border-style:dashed; }
  .ds-mono .ds-chip { border-color:#000; color:#000; }
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

  return (
    <div className={`ds-sheet${mono ? ' ds-mono' : ''}`} dir="rtl">
      <style>{css}</style>

      {/* ── سربرگ ── */}
      <div className="ds-hd">
        <div className="ds-logo-col">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ds-logo" src={logoUrl} alt="آرم دانشگاه" />
          ) : (
            <div className="ds-logo" style={{ width: '15mm', height: '15mm' }} />
          )}
          {universityName ? <div className="ds-uni">{fa(universityName)}</div> : null}
        </div>
        <div className="ds-mid">
          <div className="ds-kicker">مؤسسه آموزش عالی آفاق</div>
          <div className="ds-title">کلاس</div>
          <div className="ds-sub">{subParts.join(' · ')}</div>
        </div>
        <div className="ds-room">
          <div className="ds-rm-label">شمارهٔ اتاق</div>
          <div className="ds-rm-num">{room ? fa(room.name) : '—'}</div>
          <div className="ds-rm-sub">{[room?.buildingName, room?.floor].filter(Boolean).map(s => fa(String(s))).join(' · ') || 'ساختمان دانشگاه'}</div>
        </div>
        <div className="ds-qr">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR" />
          ) : (
            <div style={{ width: '13mm', height: '13mm', border: '0.5pt dashed #94a3b8', borderRadius: '1mm' }} />
          )}
          <div className="ds-qr-cap">تأیید حضور استاد<br /><span className="ds-qr-sub">اسکن برای ثبت حضور</span></div>
          <div className="ds-bc">
            {bcBinary ? <BarcodeSvg binary={bcBinary} /> : <div className="ds-bc-ph" />}
            <div className="ds-bc-cap">{fa(room?.name ?? '')}</div>
          </div>
        </div>
      </div>

      <div className="ds-rule" />
      <div className="ds-rule2" />
      <div className="ds-brand">سامانه جامع آفاق · نسخهٔ {fa(appVersion)}</div>

      {/* ── شبکه ── */}
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
              return (
                <div
                  key={`${p.key}#${i}`}
                  className="ds-slot"
                  style={{ top: `${p.topPercent}%`, height: `${p.heightPercent}%` }}
                >
                  <div className={`ds-card${e.courseType === 'عملی' ? ' lab' : ''}`}>
                    <div className="ds-t">
                      {e.title}{e.merged ? ' 🔗' : ''}
                      <WeekBadge weekType={e.weekType} />
                    </div>
                    {e.professorName ? <div className="ds-p">{e.professorName}</div> : null}
                    <div className="ds-h"><span dir="ltr">{fa(e.startTime)} – {fa(e.endTime)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── پانویس ── */}
      <div className="ds-ft">
        <div>
          <span className="k"><span className="ds-sw" />تئوری</span>
          <span className="k"><span className="ds-sw lab" />عملی / آزمایشگاه</span>
          <span className="k"><span className="ds-chip">فرد</span><span className="ds-chip">زوج</span> هفتهٔ فرد یا زوج</span>
        </div>
        <div>هر خط افقی = یک ساعت · خط‌چین = نیم‌ساعت · ساعت‌های خالی: کلاس ندارد</div>
        <div>چاپ: <span dir="ltr">{fa(new Date().toISOString().slice(0, 10).replace(/-/g, '/'))}</span></div>
      </div>
    </div>
  );
}
