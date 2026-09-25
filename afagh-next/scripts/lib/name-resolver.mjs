/**
 * ════════════════════════════════════════════════════════════════════════════════
 *  ماژول مشترک حل نام «نامشخص» دانشجویان
 *
 *  هم توسط import-sama-afagh.mjs (گارد لحظهٔ واردات) و هم توسط
 *  fix-unknown-names.mjs (اصلاح دفعه‌ای) استفاده می‌شود.
 *
 *  استفاده:
 *    import { norm, buildDictionary, resolveName } from './lib/name-resolver.mjs';
 *    const dict = await buildDictionary(pool);
 *    const r = resolveName(rawName, uniId, dict);  // { fn, ln } یا null
 * ════════════════════════════════════════════════════════════════════════════════
 */

// ── نرمال‌سازی ──
export function norm(s) {
  return String(s || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/أ/g, 'ا')
    .replace(/إ/g, 'ا')
    .replace(/[\u200c\u200b]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── پارتیکل‌ها و پسوند‌های خانوادگی ──
const PARTICLE_RE = /^(زاده|پور|نژاد|فر|وند|لو|لی|اصل|پناه|نیا|طلب|خواه|پرور|منش|یار|فرد|آباد|کندی|باشی|اوغلی|بالو|سابق|جو|دوست|مقدم)$/;
const isFamilyParticle = (w) => PARTICLE_RE.test(norm(w));

const SUFFIX_RE = /(زاده|پور|لو|لی|وند|نژاد|فر|یان|پناه|نیا|طلب|خواه|پرور|منش|یار|فرد|آباد|کندی|باشی|اوغلی|بالو|اصل|سابق|مقدم|دوست|جو|انزابی|کیانی|احمدی|قمری|مولودی|علولی|مرادی|رحمانی|جمشیدی|جلالی|حبیبی|سرکاری|خرازی)$/;
const hasFamilySuffix = (w) => SUFFIX_RE.test(norm(w));

// Compound-name leading words ("سید علی", "میر هاشم", "نجم الدین", ...)
const COMPOUND_PREFIX = new Set(['سید', 'میر', 'ملک', 'حاجی', 'آقا', 'نجم', 'عبد', 'غلام', 'ضیاء', 'نور', 'جمال']);
// A compound first name's leading word
const VALID_COMPOUND_FN_PREFIXES = ['سید', 'سيده', 'میر', 'محمد', 'امیر', 'علی', 'عبد', 'غلام', 'فاطمه', 'نازنین', 'نجم', 'جمال', 'ضیاء', 'نور', 'شمس', 'رحمت', 'حاجی', 'آقا', 'ملا', 'ملک', 'قلی'];

// ── لیست اضافی نام‌های اول (ثابت) ──
export const EXTRA_FIRST_NAMES = [
  'علی', 'محمد', 'مهدی', 'حسین', 'رضا', 'حسن', 'امیر', 'زهرا', 'فاطمه', 'مریم',
  'سارا', 'الناز', 'مینا', 'فرناز', 'رویا', 'سحر', 'آرزو', 'پریسا', 'امید', 'بهزاد',
  'امین', 'سالار', 'سعید', 'مسعود', 'بابک', 'دانیال', 'جابر', 'شایان', 'پیمان',
  'سینا', 'سهیل', 'نیما', 'سپیده', 'مهسا', 'نسترن', 'صبا', 'هادی', 'وحید', 'یاسر',
  'حمید', 'جواد', 'نوید', 'مصطفی', 'مرتضی', 'میلاد', 'میثم', 'فرزاد', 'بهنام',
  'سمیه', 'حبیبه', 'شیرین', 'معصومه', 'نسیبه', 'یعقوب', 'منیره', 'سیما', 'شبنم',
  'سعیده', 'سوسن', 'افسانه', 'حجت', 'سمیرا', 'دیاکو', 'آمانج', 'ایلیا', 'سبا',
  'رقیه', 'نجم الدین', 'آیدا', 'محسن', 'پرستو', 'حافظ', 'نعمت', 'عزیز', 'مظفر',
  'طاهر', 'هوشنگ', 'جمشید', 'بهرنگ', 'میرهاشم', 'میر هاشم', 'جعفر', 'بهمن', 'هیمن',
  'جمال الدین', 'اصغر', 'صاحبعلی', 'سکینه', 'فروغ', 'امیررضا', 'میرحسن', 'محمدباقر',
  'محمدرضا', 'امیرمحمد', 'امیرعلی', 'علیرضا', 'غلامرضا', 'مجید', 'شیوا', 'شیما',
  'مجتبی', 'پیام', 'یونس', 'هاجر', 'فرزانه', 'الهام', 'لیلا', 'اکرم', 'پروانه',
  'آفاق', 'فاطمه زهرا', 'نازنین', 'مونا', 'سید علی', 'سید محمد', 'سید مهدی',
  'پویا', 'احسان', 'تورج', 'کامیار', 'افشین', 'سامان',
  'سهراب', 'کوروش', 'داریوش', 'فرامرز', 'اشکان', 'شهاب', 'شاهرخ', 'آرش', 'کیان',
  'آیدین', 'ائلدار', 'یاشار', 'افشار', 'سولماز', 'ساناز', 'آیناز', 'مهناز',
  'سیامک', 'ساسان', 'فرشاد', 'فرهاد', 'شیدا', 'ندا', 'مژگان', 'شایسته',
  'پرویز', 'کامران', 'شهروز', 'کیوان', 'فرید', 'فریدون', 'سیروس', 'صادق',
  // regional (Azeri/Turkish) given names
  'لعیا', 'آیلار', 'نازیلدا', 'نازيلا', 'آینور', 'آیناز', 'ترانه', 'سوگل', 'بنفشه',
  'شهرزاد', 'آسیه', 'حوریه', 'نساء', 'پروین', 'گیتی', 'ظریفه', 'مژده', 'شکوفه',
  'پریناز', 'ایوب', 'آیدین', 'آرمان', 'باران', 'بهرام', 'پویان', 'پیام',
  'فواد', 'قاسم', 'کاظم', 'ناصر', 'صمد', 'ولی', 'قلی', 'عسگر', 'اسمعیل', 'اسماعیل',
  'شاهین', 'ارسلان', 'فرهاد', 'مهران', 'هومن', 'ایمان', 'بهنام', 'آرمان', 'مهران',
  'اقدس', 'زکیه', 'کلثوم', 'آمنه', 'مرجان', 'سیما', 'بهاره', 'پرستو', 'مهرناز',
  'سیران', 'کارو', 'داریا', 'موحد', 'حامد', 'نیما', 'روژین', 'باران', 'سهراب',
  'اتش', 'آتش', 'منصور', 'قهرمان', 'جهانگیر', 'مصیب', 'توحید', 'لقمان', 'برهان',
  'سرگون', 'فیروز', 'قهرمان', 'رحیم', 'کریم', 'مجید', 'مختار', 'رامین', 'باقر',
  'آقاجان', 'روح اله', 'روح الله', 'روح', 'اله', 'الله', 'الدين',
  'عبدالله', 'عبداله', 'اسدالله', 'اسداله', 'شمس اله', 'رحمت اله', 'رحمت الله', 'شمس الله', 'قربانعلی',
  'علیار', 'نجم الدینی', 'روژین', 'آیدین', 'سیران', 'شیرزاد', 'بهروز', 'مسعود'
];

// نام‌های چسبیدهٔ ساختگی (بدون فاصله، ZWNJ داخلی)
export const HARDCODED = {
  'نقي‌لواميد': { fn: 'امید', ln: 'نقی لو' },
  'سعيدرضائي': { fn: 'سعید', ln: 'رضائی' },
  'سعيدميرزائي': { fn: 'سعید', ln: 'میرزائی' },
  'سعيدخسروي': { fn: 'سعید', ln: 'خسروی' },
  'سالاربرزگر': { fn: 'سالار', ln: 'برزگر' },
  'دين جهاني': { fn: 'دین', ln: 'جهانی' },
  'علي محمد لو حميد': { fn: 'حمید', ln: 'علی محمد لو' },
};

// ── ساخت دیکشنری از پایگاه داده ──
export async function buildDictionary(pool) {
  const [fnRes, lastRes] = await Promise.all([
    pool.query(`
      SELECT "firstName", count(*) as cnt
      FROM users
      WHERE "firstName" != 'نامشخص' AND length("firstName") > 1
      GROUP BY "firstName"
      HAVING count(*) >= 2
    `),
    pool.query(`
      SELECT unnest(string_to_array("lastName", ' ')) AS tok, count(*) as cnt
      FROM users
      WHERE "lastName" != '' AND "lastName" IS NOT NULL
      GROUP BY tok
      HAVING count(*) >= 2
    `),
  ]);

  const firstFreq = new Map();
  for (const r of fnRes.rows) firstFreq.set(norm(r.firstName), Number(r.cnt));

  const lastFreq = new Map();
  for (const r of lastRes.rows) {
    const t = norm(r.tok);
    lastFreq.set(t, (lastFreq.get(t) || 0) + Number(r.cnt));
  }

  // Purge tokens that are predominantly family-name tokens
  const firstNamesSet = new Set();
  for (const [tok, cnt] of firstFreq) {
    const lastCnt = lastFreq.get(tok) || 0;
    if (lastCnt >= cnt) continue; // purge
    firstNamesSet.add(tok);
  }
  for (const tok of [...firstNamesSet]) {
    const lastCnt = lastFreq.get(tok) || 0;
    if (lastCnt > 10 && lastCnt > (firstFreq.get(tok) || 0) * 6) {
      firstNamesSet.delete(tok);
    }
  }
  for (const n of EXTRA_FIRST_NAMES) firstNamesSet.add(norm(n));

  const compoundFirstSet = new Set(
    [...firstNamesSet].filter(t => t.includes(' ') && firstFreq.has(t))
  );
  for (const n of EXTRA_FIRST_NAMES) {
    if (norm(n).includes(' ')) compoundFirstSet.add(norm(n));
  }

  const lastTokenSet = new Set([...lastFreq.keys()]);

  return { firstNamesSet, lastTokenSet, compoundFirstSet };
}

// ── اسکورها ──
function nameScore(t, dict) {
  const { firstNamesSet, lastTokenSet, compoundFirstSet } = dict;
  const n = norm(t);
  if (firstNamesSet.has(n)) return 3;
  if (COMPOUND_PREFIX.has(n)) return 1;
  if (lastTokenSet.has(n)) return -3;
  if (isFamilyParticle(n)) return -3;
  if (hasFamilySuffix(n)) return -2;
  return 0;
}
function familyScore(t, dict) {
  const { firstNamesSet, lastTokenSet } = dict;
  const n = norm(t);
  if (lastTokenSet.has(n)) return 2;
  if (isFamilyParticle(n)) return 2;
  if (hasFamilySuffix(n)) return 1;
  if (COMPOUND_PREFIX.has(n)) return 1;
  if (firstNamesSet.has(n)) return -2;
  return 0;
}

const COMPOUND_TAILS = new Set(['اله', 'الله', 'الدين']);

function scoreSplit(ln, fn, parts, dict) {
  const { firstNamesSet, lastTokenSet, compoundFirstSet } = dict;
  let s = ln.reduce((a, t) => a + familyScore(t, dict), 0) + fn.reduce((a, t) => a + nameScore(t, dict), 0);
  if (isFamilyParticle(norm(ln[0]))) s -= 2;
  if (fn.length === 1 && firstNamesSet.has(norm(fn[0]))) s += 1;
  if (fn.length > 1) {
    const fnJoined = fn.map(norm).join(' ');
    if (compoundFirstSet.has(fnJoined)) {
      s += 2;
    } else if (
      VALID_COMPOUND_FN_PREFIXES.some(p => norm(fn[0]) === p || norm(fn[0]).startsWith(p === 'سید' ? 'سید' : p === 'میر' ? 'میر' : p))
      && !isFamilyParticle(norm(fn[fn.length - 1] || ''))
      && fn.some(t => firstNamesSet.has(norm(t)))
    ) {
      s += 2;
    } else {
      s -= 3;
    }
  }
  if (fn.length === 2 && COMPOUND_TAILS.has(norm(fn[1]))) s += 3;
  if (fn.length === 1 && COMPOUND_TAILS.has(norm(fn[0]))) s -= 3;
  const nextIdx = parts.indexOf(fn[0]) + fn.length;
  if (fn.length > 1 && nextIdx < parts.length && isFamilyParticle(norm(parts[nextIdx]))) s -= 3;
  return s;
}

function solve(parts, uni, dict) {
  const cands = [];
  const n = parts.length;
  for (let i = 1; i <= n - 1; i++) {
    if (isFamilyParticle(norm(parts[i]))) {
      cands.push({ ln: parts.slice(i - 1), fn: parts.slice(0, i - 1), kind: 'particle' });
    }
  }
  for (let k = 1; k <= n - 1; k++) {
    cands.push({ ln: parts.slice(0, k), fn: parts.slice(k), kind: 'fam-first' });
    cands.push({ ln: parts.slice(k), fn: parts.slice(0, k), kind: 'first-first' });
  }
  const seen = new Set();
  const uniq = [];
  for (const c of cands) {
    if (!c.fn.length || !c.ln.length) continue;
    const key = c.ln.join('|') + '::' + c.fn.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    c.score = scoreSplit(c.ln, c.fn, parts, dict);
    uniq.push(c);
  }
  uniq.sort((a, b) => b.score - a.score);
  const shapePrior = uni === 1 ? 'first-first' : 'fam-first';
  for (const c of uniq) {
    c.prio = c.score + (c.kind === shapePrior ? 0.75 : 0);
  }
  uniq.sort((a, b) => b.prio - a.prio);
  return uniq;
}

export { solve };

// ── تابع اصلی resolve ──
// returns { fn, ln } یا null (اگر نام قابل حل نباشد)
export function resolveName(rawName, uniId, dict) {
  const { firstNamesSet, lastTokenSet, compoundFirstSet } = dict;
  let raw = (rawName || '').trim();

  // خالی یا نامشخص صرف
  if (!raw || raw === 'نامشخص' || /^نامشخص\d*$/.test(raw)) return null;

  // underscore-separated: family_first_name
  if (raw.includes('_')) {
    const parts = raw.split('_').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { fn: parts[parts.length - 1], ln: parts.slice(0, -1).join(' '), kind: 'underscore' };
    }
  }

  // leading dash -> strip and continue
  if (raw.startsWith('-')) raw = raw.replace(/^-+/, '').trim();

  // hardcoded concatenated names
  const hk = HARDCODED[raw];
  if (hk) return { fn: hk.fn, ln: hk.ln, kind: 'hard' };

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    if (firstNamesSet.has(norm(parts[0]))) {
      return { fn: parts[0], ln: 'نامشخص', kind: 'single-name' };
    }
    // single unknown token: cannot determine a real given name
    return null;
  }

  const ranked = solve(parts, uniId, dict);
  const best = ranked[0];
  let chosen = best;
  if (ranked.length >= 2 && best.score - ranked[1].score <= 1) {
    const prioTop = ranked.filter(c => c.prio === best.prio);
    chosen = prioTop.length && prioTop[0].score > best.score - 2 ? prioTop[0] : best;
  }

  return { fn: chosen.fn.join(' '), ln: chosen.ln.join(' '), kind: 'split', score: chosen.score };
}
