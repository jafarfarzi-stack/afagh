'use client';

import React, { useState, useMemo, useRef } from 'react';
import Link from 'next/link';

// ==========================================
// INTERFACES & TYPES
// ==========================================

export type NotificationChannel = 'SMS' | 'EMAIL' | 'PUSH';

export interface NotificationTemplateItem {
  id: number;
  eventCode: string;
  title: string;
  channel: NotificationChannel;
  templateText: string;
  isActive: boolean;
  allowedVariables: { tag: string; label: string; sampleValue: string }[];
  updatedAt: string;
}

const INITIAL_TEMPLATES: NotificationTemplateItem[] = [
  {
    id: 1,
    eventCode: 'EXAM_ABSENCE',
    title: 'ثبت غیبت در جلسه آزمون پایان‌ترم',
    channel: 'SMS',
    templateText:
      'دانشجوی گرامی {نام_دانشجو}، غیبت شما در آزمون درس {نام_درس} ثبت گردید. شما حداکثر تا تاریخ {مهلت_ارائه_مدرک} فرصت دارید گواهی پزشکی خود را در پورتال {لینک_سامانه} بارگذاری فرمایید.',
    isActive: true,
    allowedVariables: [
      { tag: '{نام_دانشجو}', label: 'نام دانشجو', sampleValue: 'علی رضایی اصل' },
      { tag: '{نام_درس}', label: 'عنوان درس', sampleValue: 'ریاضی عمومی ۱' },
      { tag: '{تاریخ_امتحان}', label: 'تاریخ امتحان', sampleValue: '۱۴۰۵/۱۰/۱۸' },
      { tag: '{ساعت_امتحان}', label: 'ساعت آزمون', sampleValue: '۰۸:۳۰ الی ۱۰:۳۰' },
      { tag: '{مهلت_ارائه_مدرک}', label: 'مهلت ارائه مدرک', sampleValue: '۱۴۰۵/۱۰/۲۰ (۴۸ ساعت)' },
      { tag: '{نام_دانشکده}', label: 'نام دانشکده', sampleValue: 'دانشکده مهندسی و علوم پایه' },
      { tag: '{لینک_سامانه}', label: 'لینک سامانه', sampleValue: 'afagh.ac.ir/requests' },
    ],
    updatedAt: '۱۴۰۵/۰۸/۲۸ - ۱۰:۳۰',
  },
  {
    id: 2,
    eventCode: 'GRADE_SUBMITTED',
    title: 'ثبت نمره نهایی و بازه اعتراض',
    channel: 'SMS',
    templateText:
      '{نام_دانشجو} عزیز، نمره درس {نام_درس} توسط استاد ثبت شد. نمره شما: {نمره}. مهلت ثبت اعتراض در سامانه تا تاریخ {مهلت_ارائه_مدرک} می‌باشد.',
    isActive: true,
    allowedVariables: [
      { tag: '{نام_دانشجو}', label: 'نام دانشجو', sampleValue: 'علی رضایی اصل' },
      { tag: '{نام_درس}', label: 'عنوان درس', sampleValue: 'مبانی برنامه‌نویسی' },
      { tag: '{نمره}', label: 'نمره خام', sampleValue: '۱۸.۵۰' },
      { tag: '{مهلت_ارائه_مدرک}', label: 'مهلت اعتراض', sampleValue: '۱۴۰۵/۱۱/۰۴' },
      { tag: '{لینک_سامانه}', label: 'لینک سامانه', sampleValue: 'afagh.ac.ir/grades' },
    ],
    updatedAt: '۱۴۰۵/۰۸/۱۵ - ۱۲:۰۰',
  },
  {
    id: 3,
    eventCode: 'MAKEUP_SESSION',
    title: 'اطلاع‌رسانی تشکیل کلاس جبرانی',
    channel: 'SMS',
    templateText:
      'دانشجوی گرامی {نام_دانشجو}، جلسه جبرانی درس {نام_درس} در تاریخ {تاریخ_امتحان} ساعت {ساعت_امتحان} در محل {نام_دانشکده} تشکیل خواهد شد.',
    isActive: true,
    allowedVariables: [
      { tag: '{نام_دانشجو}', label: 'نام دانشجو', sampleValue: 'علی رضایی اصل' },
      { tag: '{نام_درس}', label: 'عنوان درس', sampleValue: 'سیستم‌های عامل' },
      { tag: '{تاریخ_امتحان}', label: 'تاریخ جبرانی', sampleValue: '۱۴۰۵/۰۹/۰۸' },
      { tag: '{ساعت_امتحان}', label: 'ساعت جبرانی', sampleValue: '۱۳:۳۰ الی ۱۵:۳۰' },
      { tag: '{نام_دانشکده}', label: 'کلاس و سالن', sampleValue: 'کلاس ۳۰۴ آموزش' },
    ],
    updatedAt: '۱۴۰۵/۰۸/۲۰ - ۱۴:۱۵',
  },
  {
    id: 4,
    eventCode: 'EXAM_CARD_RELEASED',
    title: 'فعال‌سازی کارت ورود به جلسه آزمون',
    channel: 'SMS',
    templateText:
      '{نام_دانشجو} گرامی، کارت ورود به جلسه امتحانات پایان‌ترم شما صادر گردید. جهت مشاهده شماره صندلی و سالن آزمون به {لینک_سامانه} مراجعه فرمایید.',
    isActive: true,
    allowedVariables: [
      { tag: '{نام_دانشجو}', label: 'نام دانشجو', sampleValue: 'علی رضایی اصل' },
      { tag: '{لینک_سامانه}', label: 'لینک سامانه', sampleValue: 'afagh.ac.ir/student/exam-card' },
    ],
    updatedAt: '۱۴۰۵/۰۸/۰۱ - ۰۹:۰۰',
  },
  {
    id: 5,
    eventCode: 'PROBATION_WARNING',
    title: 'اخطار مشروطی و وضعیت تحصیلی',
    channel: 'SMS',
    templateText:
      'اخطار آموزشی: {نام_دانشجو} محترم، با توجه به افت معدل نیمسال، وضعیت شما در حالت مشروط قرار گرفت. جهت پیگیری به اداره آموزش {نام_دانشکده} مراجعه نمایید.',
    isActive: true,
    allowedVariables: [
      { tag: '{نام_دانشجو}', label: 'نام دانشجو', sampleValue: 'علی رضایی اصل' },
      { tag: '{نام_دانشکده}', label: 'نام دانشکده', sampleValue: 'دانشکده مهندسی' },
    ],
    updatedAt: '۱۴۰۵/۰۷/۱۰ - ۱۱:۳۰',
  },
];

export default function TemplateEngineClient() {
  const [templates, setTemplates] = useState<NotificationTemplateItem[]>(INITIAL_TEMPLATES);
  const [selectedEventCode, setSelectedEventCode] = useState<string>('EXAM_ABSENCE');
  const [testMobileNumber, setTestMobileNumber] = useState<string>('09123456789');
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentTemplate = useMemo(() => {
    return templates.find(t => t.eventCode === selectedEventCode) || templates[0];
  }, [templates, selectedEventCode]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 6000);
  };

  // Insert variable tag into textarea at cursor position
  const handleInsertVariable = (tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = currentTemplate.templateText;
    const newText = text.substring(0, start) + tag + text.substring(end);

    setTemplates(prev =>
      prev.map(t => (t.eventCode === selectedEventCode ? { ...t, templateText: newText } : t))
    );

    // Restore focus and cursor position after insertion
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 50);
  };

  // Update Template Text
  const handleUpdateText = (text: string) => {
    setTemplates(prev =>
      prev.map(t => (t.eventCode === selectedEventCode ? { ...t, templateText: text } : t))
    );
  };

  // Preset Tones for Exam Absence
  const handleApplyAbsenceTone = (tone: 'HELPFUL' | 'WARNING' | 'COMPACT') => {
    let newText = '';
    if (tone === 'HELPFUL') {
      newText =
        '{نام_دانشجو} عزیز، غیبت شما در امتحان {نام_درس} ثبت شد. لطفاً گواهی پزشکی خود را نهایتاً تا {مهلت_ارائه_مدرک} در لینک {لینک_سامانه} بارگذاری فرمایید.';
    } else if (tone === 'WARNING') {
      newText =
        'اخطار: غیبت غیرموجه در درس {نام_درس}. {نام_دانشجو}، در صورت عدم مراجعه به آموزش {نام_دانشکده} تا تاریخ {مهلت_ارائه_مدرک}، نمره شما صفر لحاظ شده و پرونده به کمیسیون ارجاع می‌گردد.';
    } else {
      newText = 'غیبت امتحان {نام_درس} ثبت شد. پیگیری تا {مهلت_ارائه_مدرک} در پورتال {لینک_سامانه}.';
    }

    setTemplates(prev =>
      prev.map(t => (t.eventCode === selectedEventCode ? { ...t, templateText: newText } : t))
    );
    showToast('الگوی متن انتخابی با موفقیت در ویرایشگر بارگذاری گردید.');
  };

  // Render Real-time Preview Text
  const renderedPreviewText = useMemo(() => {
    let text = currentTemplate.templateText;
    currentTemplate.allowedVariables.forEach(v => {
      text = text.replaceAll(v.tag, v.sampleValue);
    });
    return text;
  }, [currentTemplate]);

  // Character and SMS Segment Count
  const charCount = renderedPreviewText.length;
  const smsSegments = charCount <= 70 ? 1 : Math.ceil(charCount / 67);

  // Send Test SMS
  const handleSendTestSms = () => {
    if (!testMobileNumber.trim()) {
      showToast('لطفاً شماره تلفن همراه را وارد نمایید.');
      return;
    }
    setIsSendingTest(true);
    setTimeout(() => {
      setIsSendingTest(false);
      showToast(`📲 پیامک آزمایشی با موفقیت به شماره ${testMobileNumber} ارسال شد.`);
    }, 1000);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="card bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white p-5 rounded-2xl shadow-lg border border-indigo-800/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-3xl shadow-inner">
              📨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-lg sm:text-xl tracking-tight">
                  موتور مدیریت و طراحی قالب‌های ارتباطی و پیامک‌ها
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500 text-white shadow-xs">
                  رویدادمحور (Event-Driven)
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-1">
                کنترل کامل متون پیامک بدون هاردکد، تگ‌های پویای قابل کلیک، پیش‌نمایش زنده در گوشی و تست ارسال آنی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/exams"
              className="px-3.5 py-2 rounded-xl bg-indigo-800 hover:bg-indigo-700 text-white font-bold text-xs border border-indigo-600/50 flex items-center gap-1.5 transition"
            >
              <span>📝 بازگشت به امتحانات ←</span>
            </Link>
          </div>
        </div>

        {/* Global KPI Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4 mt-4 border-t border-indigo-800/60 text-xs">
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[10px]">قالب‌های فعال سیستم:</span>
            <strong className="text-white text-base font-black">{templates.length} رویداد پیامکی</strong>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[10px]">درگاه ارسال پیامک:</span>
            <strong className="text-emerald-400 text-xs font-bold">وب‌سرویس مستقیم مگفا / همراه اول</strong>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[10px]">نرخ تحویل پیامک‌ها:</span>
            <strong className="text-emerald-400 text-base font-black">۹۹.۴٪ موفق</strong>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[10px]">جدول پایگاه داده:</span>
            <strong className="text-amber-300 font-mono text-xs font-bold">notification_templates</strong>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-lg">📢</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-700 font-black">✕</button>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Event Catalog Menu (4 cols) */}
        <div className="lg:col-span-4 card space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="font-black text-slate-900 text-sm">
              📋 کاتالوگ رویدادهای اطلاع‌رسانی
            </h3>
            <span className="text-[10px] text-slate-500 font-bold">انتخاب جهت ویرایش</span>
          </div>

          <div className="space-y-1.5">
            {templates.map(tmpl => {
              const isSelected = tmpl.eventCode === selectedEventCode;

              return (
                <div
                  key={tmpl.id}
                  onClick={() => setSelectedEventCode(tmpl.eventCode)}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    isSelected
                      ? 'bg-indigo-900 text-white border-indigo-950 shadow-md scale-[1.02]'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">{tmpl.title}</span>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold ${
                        isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tmpl.eventCode}
                    </span>
                  </div>

                  <p
                    className={`text-[11px] truncate mt-1 ${
                      isSelected ? 'text-indigo-200' : 'text-slate-500'
                    }`}
                  >
                    {tmpl.templateText}
                  </p>

                  <div className="flex items-center justify-between text-[10px] mt-2 pt-1 border-t border-white/10">
                    <span className={isSelected ? 'text-indigo-300' : 'text-slate-400'}>
                      کانال: 📲 پیامک (SMS)
                    </span>
                    <span className={isSelected ? 'text-emerald-300 font-bold' : 'text-emerald-700 font-bold'}>
                      ✓ فعال
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Dynamic Editor & Live Mobile Preview (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="card space-y-4">
            {/* Header of Editor */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-black text-slate-900 text-base">
                    طراحی قالب رویداد: {currentTemplate.title}
                  </h2>
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-mono text-xs font-bold">
                    {currentTemplate.eventCode}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  متن پیامک کاملاً آزاد و در اختیار مدیر است؛ هیچ کلمه‌ای هاردکد نشده است.
                </p>
              </div>

              <button
                onClick={() => {
                  showToast(`💾 تغییرات قالب «${currentTemplate.title}» با موفقیت در پایگاه داده ذخیره و در صف ارسال قرار گرفت.`);
                }}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
              >
                <span>💾 ذخیره قالب در دیتابیس</span>
              </button>
            </div>

            {/* Quick Presets (For Exam Absence) */}
            {selectedEventCode === 'EXAM_ABSENCE' && (
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 space-y-2 text-xs">
                <span className="font-black text-amber-950 block">
                  💡 الگوهای آماده جهت اعمال سریع لحن پیامک:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleApplyAbsenceTone('HELPFUL')}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100 text-amber-900 font-bold text-xs border border-amber-300 shadow-xs"
                  >
                    ۱. لحن راهنما (گواهی پزشکی در پرتال) 🏥
                  </button>
                  <button
                    onClick={() => handleApplyAbsenceTone('WARNING')}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-100 text-rose-900 font-bold text-xs border border-rose-300 shadow-xs"
                  >
                    ۲. لحن اخطار و ارجاع به کمیسیون ⚠️
                  </button>
                  <button
                    onClick={() => handleApplyAbsenceTone('COMPACT')}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-indigo-100 text-indigo-900 font-bold text-xs border border-indigo-300 shadow-xs"
                  >
                    ۳. لحن خلاصه و کم‌هزینه (تک‌پارت) ✂️
                  </button>
                </div>
              </div>
            )}

            {/* Dynamic Variables Box (Click to Insert) */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-800">
                  🏷️ جعبه متغیرهای پویا (جهت درج در متن، روی تگ کلیک کنید):
                </span>
                <span className="text-[11px] text-slate-500">جایگذاری خودکار اطلاعات دانشجو</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {currentTemplate.allowedVariables.map(v => (
                  <button
                    key={v.tag}
                    onClick={() => handleInsertVariable(v.tag)}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border-2 border-indigo-300 text-indigo-950 font-mono font-bold text-xs shadow-xs transition hover:scale-105 flex items-center gap-1"
                    title={`نمونه مقدار: ${v.sampleValue}`}
                  >
                    <span>➕</span>
                    <span>{v.tag}</span>
                    <span className="text-[10px] text-slate-500 font-sans font-normal">({v.label})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Free Text Area */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 text-xs block">
                متن آزاد قالب پیامک (قابل ویرایش کامل توسط مدیر):
              </label>
              <textarea
                ref={textareaRef}
                rows={5}
                value={currentTemplate.templateText}
                onChange={e => handleUpdateText(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-2xl p-3 text-xs font-bold bg-white text-slate-900 leading-relaxed focus:border-indigo-600 shadow-inner"
              />
            </div>

            {/* Live Mobile Screen Preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Mobile Phone Mockup */}
              <div className="bg-slate-900 text-white p-4 rounded-3xl border-4 border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>📱 پیامک دریافتی دانشجو</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">سامانه آفاق</span>
                </div>

                {/* SMS Bubble */}
                <div className="p-3.5 bg-slate-800 rounded-2xl rounded-tr-none text-xs text-white leading-relaxed font-medium space-y-1 border border-slate-700">
                  <p>{renderedPreviewText}</p>
                  <span className="text-[9px] text-slate-400 block text-left font-mono">هم‌اکنون · پیامک دانشگاه</span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>تعداد کاراکتر: <strong>{charCount}</strong></span>
                  <span>تعداد پارت پیامک: <strong className="text-amber-400">{smsSegments} پارت فارسی</strong></span>
                </div>
              </div>

              {/* Test Dispatch Tool */}
              <div className="p-4 bg-indigo-50/70 rounded-3xl border border-indigo-200 space-y-3 text-xs flex flex-col justify-between">
                <div className="space-y-2">
                  <h4 className="font-black text-indigo-950 text-xs sm:text-sm">
                    📲 تست زنده ارسال پیامک به شماره همراه:
                  </h4>
                  <p className="text-slate-600 text-[11px]">
                    شماره موبایل را وارد نموده و با متغیرهای نمونه ارسال آزمایشی را تست کنید.
                  </p>
                  <input
                    type="text"
                    value={testMobileNumber}
                    onChange={e => setTestMobileNumber(e.target.value)}
                    placeholder="09123456789"
                    className="w-full border border-slate-300 rounded-xl p-2.5 font-mono font-bold text-center bg-white"
                  />
                </div>

                <button
                  onClick={handleSendTestSms}
                  disabled={isSendingTest}
                  className="w-full py-2.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-extrabold text-xs shadow transition flex items-center justify-center gap-1.5"
                >
                  <span>📲 {isSendingTest ? 'در حال ارسال تست…' : 'ارسال آزمایشی به شماره فوق'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
