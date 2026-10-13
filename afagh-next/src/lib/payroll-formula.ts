/**
 * ارزیابی‌کنندهٔ امن عبارات فرمول حق‌التدریس (الگوریتم یکپارچه).
 *
 * متغیرها نام‌های خوانا و متمایز دارند (نه تک‌حرفی):
 * TH ساعت نظری، PH ساعت عملی، WH ساعت کارگاهی، UN واحد درس،
 * ST تعداد دانشجو، RT نرخ، CF ضریب جمعی، BS مبلغ مبنا، HR ساعت.
 * حروف قدیمی سما (N A W U C R K F H) همچنان به‌عنوان نام مستعار
 * پذیرفته می‌شوند تا فرمول‌های منتقل‌شده از راهنما کار کنند.
 *
 * عمداً از eval/new Function استفاده نشده: پارسر بازگشتی کوچک فقط
 * عدد، متغیر مجاز و عملگرهای + - * / ( ) را می‌فهمد؛ هر چیز دیگر خطاست.
 */

/** نام اصلی → نام‌های مستعار قدیمی */
const ALIASES: Record<string, string[]> = {
  TH: ['N'], PH: ['A'], WH: ['W'], UN: ['U'], ST: ['C'],
  RT: ['R'], CF: ['K'], BS: ['F'], HR: ['H'],
};

const CANON = new Set(Object.keys(ALIASES));
const ALIAS_TO_CANON: Record<string, string> = {};
for (const [canon, olds] of Object.entries(ALIASES)) {
  ALIAS_TO_CANON[canon] = canon;
  for (const o of olds) ALIAS_TO_CANON[o] = canon;
}

export type FormulaVars = Partial<Record<'TH' | 'PH' | 'WH' | 'UN' | 'ST' | 'RT' | 'CF' | 'BS' | 'HR', number>>;

type Tok =
  | { t: 'num'; v: number }
  | { t: 'var'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new Error(`عدد نامعتبر در فرمول`);
      toks.push({ t: 'num', v });
      i = j;
      continue;
    }
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
      let j = i;
      while (j < src.length && /[A-Za-z_]/.test(src[j])) j++;
      const name = src.slice(i, j).toUpperCase();
      const canon = ALIAS_TO_CANON[name];
      if (!canon) throw new Error(`متغیر ناشناخته: ${src.slice(i, j)} (مجاز: TH PH WH UN ST RT CF BS HR)`);
      toks.push({ t: 'var', v: canon });
      i = j;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') { toks.push({ t: 'op', v: ch }); i++; continue; }
    if (ch === '(') { toks.push({ t: 'lp' }); i++; continue; }
    if (ch === ')') { toks.push({ t: 'rp' }); i++; continue; }
    throw new Error(`نویسهٔ نامعتبر در فرمول: ${ch}`);
  }
  return toks;
}

/** پارسر بازگشتی: expr := term (('+'|'-') term)* ; term := factor (('*'|'/') factor)* */
function parse(toks: Tok[], vars: FormulaVars): number {
  let pos = 0;
  const peek = (): Tok | null => toks[pos] ?? null;
  const next = (): Tok => toks[pos++];

  function expr(): number {
    let v = term();
    for (;;) {
      const t = peek();
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) {
        next();
        const r = term();
        v = t.v === '+' ? v + r : v - r;
      } else return v;
    }
  }
  function term(): number {
    let v = factor();
    for (;;) {
      const t = peek();
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) {
        next();
        const r = factor();
        if (t.v === '/') {
          if (r === 0) throw new Error('تقسیم بر صفر در فرمول');
          v = v / r;
        } else v = v * r;
      } else return v;
    }
  }
  function factor(): number {
    const t = next();
    if (!t) throw new Error('پایان ناگهانی فرمول');
    if (t.t === 'num') return t.v;
    if (t.t === 'var') return Number(vars[t.v as keyof FormulaVars] ?? 0);
    if (t.t === 'lp') {
      const v = expr();
      const c = next();
      if (!c || c.t !== 'rp') throw new Error('پرانتز بسته نشده در فرمول');
      return v;
    }
    if (t.t === 'op' && t.v === '-') return -factor();
    if (t.t === 'op' && t.v === '+') return factor();
    throw new Error('ساختار نامعتبر در فرمول');
  }

  const v = expr();
  if (pos < toks.length) throw new Error('عبارت اضافی در پایان فرمول');
  return v;
}

/** اعتبارسنجی هنگام ذخیره — خطا را به‌صورت پیام فارسی برمی‌گرداند */
export function validateFormula(src: string): string | null {
  try {
    if (!src || !src.trim()) return 'فرمول خالی است';
    if (src.length > 500) return 'فرمول بیش از حد طولانی است';
    const v = parse(tokenize(src), { TH: 2, PH: 2, WH: 0, UN: 3, ST: 20, RT: 100000, CF: 1, BS: 500000, HR: 2 });
    if (!Number.isFinite(v)) return 'نتیجهٔ فرمول عدد معتبر نیست';
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** محاسبه — فرض: فرمول قبلاً اعتبارسنجی شده؛ خطا = fail-closed */
export function evalFormula(src: string, vars: FormulaVars): number {
  const v = parse(tokenize(src), vars);
  if (!Number.isFinite(v)) throw new Error('نتیجهٔ فرمول عدد معتبر نیست');
  return v;
}

/** راهنمای متغیرها برای نمایش در فرم */
export const FORMULA_VAR_HELP: { v: string; fa: string; old?: string }[] = [
  { v: 'TH', fa: 'ساعت نظری هفتگی', old: 'N' },
  { v: 'PH', fa: 'ساعت عملی هفتگی (واحد×۲)', old: 'A' },
  { v: 'WH', fa: 'ساعت کارگاهی هفتگی', old: 'W' },
  { v: 'UN', fa: 'تعداد واحد درس', old: 'U' },
  { v: 'ST', fa: 'تعداد دانشجو', old: 'C' },
  { v: 'RT', fa: 'نرخ حق‌التدریس (ریال)', old: 'R' },
  { v: 'CF', fa: 'ضریب جمعی کلاس', old: 'K' },
  { v: 'BS', fa: 'مبلغ مبنای سطر', old: 'F' },
  { v: 'HR', fa: 'ساعت به‌ازای دانشجو', old: 'H' },
];
