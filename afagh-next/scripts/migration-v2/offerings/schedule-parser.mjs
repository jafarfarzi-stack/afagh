/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Schedule Parser
 *  — تجزیه و نرمال‌سازی زمان‌بندی جلسات هفتگی و کلاسی
 *  — پشتیبانی از فرمت پایگاه داده سما (DayCode, StartTime, EndTime, CrossType)
 *  — پشتیبانی از متون آزاد و فارسی (شنبه ۰۸:۰۰ الی ۱۰:۰۰، هفته‌های زوج/فرد)
 *  — نگاشت روزهای هفته به قرارداد سیستم (۱=شنبه ... ۷=جمعه)
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * تبدیل ارقام فارسی و عربی به ارقام انگلیسی
 * @param {string|number} val 
 * @returns {string}
 */
export function cleanPersianDigits(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
}

/**
 * نگاشت نام روز فارسی به شناسه روز هفته (۱=شنبه ... ۷=جمعه)
 * قرارداد سامانه: ۱: شنبه، ۲: یکشنبه، ۳: دوشنبه، ۴: سه‌شنبه، ۵: چهارشنبه، ۶: پنج‌شنبه، ۷: جمعه
 * @param {string} text 
 * @returns {number|null}
 */
export function parsePersianDayOfWeek(text) {
  if (!text) return null;
  const s = cleanPersianDigits(text)
    .replace(/[\u200c\s_\-]+/g, '') // حذف نیم‌فاصله، فاصله و خط تیره
    .toLowerCase();

  if (/^(شنبه|0شنبه)$/.test(s)) return 1;
  if (/^(یکشنبه|یک‌شنبه|1شنبه)$/.test(s)) return 2;
  if (/^(دوشنبه|دو‌شنبه|2شنبه)$/.test(s)) return 3;
  if (/^(سهشنبه|سه‌شنبه|3شنبه)$/.test(s)) return 4;
  if (/^(چهارشنبه|چهار‌شنبه|4شنبه)$/.test(s)) return 5;
  if (/^(پنجشنبه|پنج‌شنبه|5شنبه)$/.test(s)) return 6;
  if (/^(جمعه|آدینه|6شنبه|7شنبه)$/.test(s)) return 7;

  // بررسی تطابق نسبی اگر در متن بلندتر باشد
  if (s.includes('جمعه') || s.includes('آدینه')) return 7;
  if (s.includes('پنجشنبه')) return 6;
  if (s.includes('چهارشنبه')) return 5;
  if (s.includes('سهشنبه')) return 4;
  if (s.includes('دوشنبه')) return 3;
  if (s.includes('یکشنبه')) return 2;
  if (s.includes('شنبه')) return 1;

  return null;
}

/**
 * نام فارسی روز هفته از روی شناسه عددی ۱..۷
 * @param {number} dayNumber 
 * @returns {string}
 */
export function dayOfWeekToPersian(dayNumber) {
  const map = {
    1: 'شنبه',
    2: 'یکشنبه',
    3: 'دوشنبه',
    4: 'سه‌شنبه',
    5: 'چهارشنبه',
    6: 'پنج‌شنبه',
    7: 'جمعه',
  };
  return map[dayNumber] || '';
}

/**
 * تبدیل کد روز سما به قرارداد سامانه (۱..۷)
 * سما: 0=شنبه, 1=یکشنبه, ..., 6=جمعه, -1=بدون زمان‌بندی
 * @param {string|number} samaDayCode 
 * @returns {number|null}
 */
export function samaDayCodeToDayOfWeek(samaDayCode) {
  if (samaDayCode === null || samaDayCode === undefined) return null;
  const code = parseInt(cleanPersianDigits(samaDayCode), 10);
  if (isNaN(code) || code < 0 || code > 6) return null;
  return code + 1; // 0 -> 1 (شنبه), ..., 6 -> 7 (جمعه)
}

/**
 * تبدیل زمان از عدد سما یا رشته به فرمت استاندارد HH:MM:SS
 * مقادیر ورودی:
 * - عدد سما: 800 -> "08:00:00", 1130 -> "11:30:00", 1400 -> "14:00:00"
 * - رشته: "8:00", "08:30", "14", "17:15"
 * @param {string|number} rawTime 
 * @returns {string|null}
 */
export function parseTimeString(rawTime) {
  if (rawTime === null || rawTime === undefined) return null;
  const s = cleanPersianDigits(rawTime).trim();
  if (!s || s === '0' || s === '-1') return null;

  // ۱. فرمت زمان سما با عدد فشرده: مثلاً 800 (8:00), 930 (9:30), 1130 (11:30), 1400 (14:00)
  if (/^\d{3,4}$/.test(s) && !s.includes(':')) {
    const num = parseInt(s, 10);
    const hours = Math.floor(num / 100);
    const mins = num % 100;
    if (hours >= 0 && hours <= 23 && mins >= 0 && mins <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
    }
  }

  // ۲. فرمت با دو نقطه HH:MM یا H:MM یا HH:MM:SS
  const matchColon = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (matchColon) {
    const hours = parseInt(matchColon[1], 10);
    const mins = parseInt(matchColon[2], 10);
    const secs = matchColon[3] ? parseInt(matchColon[3], 10) : 0;
    if (hours >= 0 && hours <= 23 && mins >= 0 && mins <= 59 && secs >= 0 && secs <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }

  // ۳. فرمت فقط ساعت: مثلاً "8" یا "14"
  if (/^\d{1,2}$/.test(s)) {
    const hours = parseInt(s, 10);
    if (hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, '0')}:00:00`;
    }
  }

  return null;
}

/**
 * استخراج بازه زمانی شروع و پایان از یک رشته متن
 * پشتیبانی از:
 * "08:00 - 10:00", "8 الی 9:30", "14:00 تا 15:30", "8-10", "11:30_13:00"
 * @param {string} text 
 * @returns {{ startTime: string, endTime: string } | null}
 */
export function parseTimeRange(text) {
  if (!text) return null;
  const s = cleanPersianDigits(text).trim();

  // جداکننده‌ها: الی، تا، -، _، ~
  const sepRegex = /\s*(?:الی|تا|\-|–|—|_|~)\s*/;
  const parts = s.split(sepRegex);
  if (parts.length < 2) return null;

  const start = parseTimeString(parts[0]);
  const end = parseTimeString(parts[1]);

  if (start && end) {
    return { startTime: start, endTime: end };
  }
  return null;
}

/**
 * تشخیص نوع توالی و تناوب هفتگی
 * weeklyCrossTypeID سما:
 * 1 -> CLASS (هفتگی / تمام هفته‌ها)
 * 2 -> ODD (هفته‌های فرد)
 * 3 -> EVEN (هفته‌های زوج)
 * @param {string|number} val 
 * @returns {'CLASS'|'EVEN'|'ODD'}
 */
export function parseWeekParity(val) {
  if (val === null || val === undefined) return 'CLASS';
  const s = cleanPersianDigits(val).trim().toLowerCase();

  if (s === '3' || s.includes('زوج') || s.includes('even')) return 'EVEN';
  if (s === '2' || s.includes('فرد') || s.includes('odd')) return 'ODD';
  return 'CLASS';
}

/**
 * تجزیه یک سطر برنامه هفتگی خروجی سما
 * @param {{
 *   dayCode?: string|number,
 *   startTime?: string|number,
 *   endTime?: string|number,
 *   placeCode?: string|number,
 *   weeklyCrossTypeID?: string|number
 * }} row
 * @returns {{
 *   dayOfWeek: number|null,
 *   startTime: string|null,
 *   endTime: string|null,
 *   scheduleType: 'CLASS'|'EVEN'|'ODD',
 *   roomCode: string|null,
 *   hasSchedule: boolean
 * }}
 */
export function parseSamaScheduleSlot(row) {
  const dayOfWeek = samaDayCodeToDayOfWeek(row.dayCode);
  const startTime = parseTimeString(row.startTime);
  const endTime = parseTimeString(row.endTime);
  const scheduleType = parseWeekParity(row.weeklyCrossTypeID);

  let roomCode = cleanPersianDigits(row.placeCode).trim();
  if (!roomCode || roomCode === '0' || roomCode === '-1') {
    roomCode = null;
  }

  const hasSchedule = Boolean(dayOfWeek && startTime && endTime);

  return {
    dayOfWeek,
    startTime,
    endTime,
    scheduleType,
    roomCode,
    hasSchedule,
  };
}

/**
 * تجزیه متن آزاد برنامه هفتگی به آرایه‌ای از اسلات‌ها
 * مثال: "شنبه ۰۸:۰۰ - ۱۰:۰۰ (کلاس ۱۰۱) / دوشنبه ۱۰:۰۰ - ۱۲:۰۰"
 * @param {string} text 
 * @returns {Array<{
 *   dayOfWeek: number,
 *   startTime: string,
 *   endTime: string,
 *   scheduleType: 'CLASS'|'EVEN'|'ODD',
 *   roomHint: string|null
 * }>}
 */
export function parseScheduleString(text) {
  if (!text) return [];
  const s = cleanPersianDigits(text).trim();
  if (!s) return [];

  // تفکیک بخش‌های چندگانه با / یا \n یا ؛ یا ;
  const segments = s.split(/[\/\n;؛]+/).map(seg => seg.trim()).filter(Boolean);
  const results = [];

  for (const seg of segments) {
    const day = parsePersianDayOfWeek(seg);
    if (!day) continue;

    const parity = parseWeekParity(seg);

    // استخراج شماره یا نام کلاس درون پرانتز یا بعد از کلمه کلاس/اتاق
    let roomHint = null;
    const roomMatch = seg.match(/(?:کلاس|اتاق|سالن)?\s*(?:\(|\[)?\s*(\d{2,4}|[A-Za-z0-9\u0600-\u06FF\s]+)\s*(?:\)|\])?$/);
    const explicitRoom = seg.match(/(?:کلاس|اتاق|سالن)\s+([A-Za-z0-9\u0600-\u06FF]+)/);
    if (explicitRoom) {
      roomHint = explicitRoom[1].trim();
    }

    // استخراج بازه زمانی
    const timeMatch = seg.match(/(\d{1,2}(?::\d{1,2})?)\s*(?:تا|الی|\-|–|—|_|~)\s*(\d{1,2}(?::\d{1,2})?)/);
    if (timeMatch) {
      const startTime = parseTimeString(timeMatch[1]);
      const endTime = parseTimeString(timeMatch[2]);
      if (startTime && endTime) {
        results.push({
          dayOfWeek: day,
          startTime,
          endTime,
          scheduleType: parity,
          roomHint,
        });
      }
    }
  }

  return results;
}
