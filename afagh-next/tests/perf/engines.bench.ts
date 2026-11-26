/**
 * میکروبنچمارک موتورهای خالص (بدون دیتابیس و بدون React).
 *
 * اجرا (حتماً با condition react-server چون payroll-engine خط ۱ دارای
 * `import 'server-only'` است و بدون این condition ایمپورت failed میشود):
 *
 *   npx tsx --conditions=react-server tests/perf/engines.bench.ts
 *
 * خروجی CI: با تنظیم BENCH_OUT خلاصهٔ نتایج بهصورت JSON در آن مسیر نوشته میشود.
 *
 * معنای gate: این gate کیفیت اندازهگیری است، NOT تشخیص رگرسیون عملکرد.
 * CV (خام یا مقاوم) scale-invariant است و کندی ۱۰٪ را نمیبیند؛ تشخیص رگرسیون
 * نیازمند مقایسه با baseline در مرحلهٔ ۲ است (فعلاً فقط مستندسازی شده است).
 * p50/p95/p99 مربوط به «کمینهٔ subRuns اجرا»اند، نه بدترین اجرای خام.
 */
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { calcStaffPayrollFromData } from '../../src/lib/payroll-engine.ts';
import { calculateSlotScore, type SlotScoreInput } from '../../src/lib/scheduling-core.ts';
import { validateCheckIns } from '../../src/lib/exam-core.ts';

// TermData export نشده است؛ شکل آنرا از ورودی تابع میگیریم.
type BenchData = Parameters<typeof calcStaffPayrollFromData>[0];

const ok = (label: string, cond: boolean): void => {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
};

function syntheticData(n = 1500): BenchData {
  const staffInfo: BenchData['staffInfo'] = new Map();
  const offeringsByStaff: BenchData['offeringsByStaff'] = new Map();
  const rateByStaff: BenchData['rateByStaff'] = new Map();

  for (let i = 1; i <= n; i++) {
    staffInfo.set(i, { name: `Bench ${i}`, staffCode: null, rank: 'استادیار', base: null, degree: null, userId: i });
    rateByStaff.set(i, 5_000_000);
    // ۴ ارائه به ازای هر استاد (نزدیک به میانگین واقعی لوادتست ≈ ۲٫۲): علاوه بر واقعیبودن،
    // نمونهٔ زمانسنجی را به اندازهای طولانی میکند که توقفهای GC کوتاه CV را زیر ۵٪ نگه دارند.
    const offerings: NonNullable<ReturnType<typeof offeringsByStaff.get>> = [];
    for (let k = 0; k < 4; k++) {
      const oid = (i - 1) * 4 + k + 1;
      offerings.push({
        offeringId: oid,
        courseCode: `BENCH-${100 + k}`,
        courseTitle: 'Benchmark Course',
        unitsInt: 3,
        practicalUnits: 0,
        groupNumber: k + 1,
        enrolledCount: 30,
        offeringType: 'NORMAL',
        payRole: 'MAIN_LECTURER',
        sharePct: 100,
        mergeKey: null,
        courseId: oid,
        theoryUnits: 3,
        deptId: null,
        courseType: null,
      });
    }
    offeringsByStaff.set(i, offerings);
  }

  // تمام ابعاد PayRule پر شدهاند تا مسیر evalFormula پوشش یابد (همهٔ فیلدها اختیاریاند ← قانون عمومی).
  const rules: BenchData['rules'] = [{
    id: 1,
    offeringType: null,
    professorRole: null,
    academicRank: null,
    classMode: 'ANY',
    minStudents: null,
    maxStudents: null,
    departmentId: null,
    courseType: null,
    repeatNumber: null,
    expression: 'RT*UN',
    flatBase: null,
    perStudentHours: null,
    title: 'BENCH',
  }];

  return {
    termId: 1,
    termTitle: 'BENCH',
    coefs: { practical: 1, msLevel: 1, crowded: 1, crowdedTier: null },
    rules,
    rateByStaff,
    contracts: new Map(),
    effectiveDuties: new Map(),
    staffInfo,
    offeringsByStaff,
    sessionsByOffering: new Map(),
    slotsByOffering: new Map(),
    gatesByStaff: new Map(),
    statementsByStaff: new Map(),
    msPrefixes: [],
    crowdedThreshold: 40,
    crowdedStep: 1,
    crowdedStepUp: 1,
    rateFraction: false,
    rateDivisor: 1,
    rateSource: new Map(),
    plannedSessionsDefault: 16,
    roleTitles: new Map(),
    payRoleOverride: new Map(),
    repeatCount: new Map(),
  };
}

type BenchResult = { samples: number[]; mean: number; sd: number; cv: number; rawCv: number };

const percentile = (samples: number[], p: number): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;
};

// CV پایدار (MAD-based): sd/mean خام در میزبانهای شلوغ با تک تک توقفهای GC/OS به ۵٪ میرسد.
// ۱٫۴۸۲۶ × MAD/median برآورد نرمالِ sd است و نسبت به تک تک outliers مقاوم است.
const robustCv = (samples: number[]): number => {
  const med = percentile(samples, 0.5);
  const mad = percentile(samples.map(x => Math.abs(x - med)), 0.5);
  return med > 0 ? (1.4826 * mad) / med : 0;
};

function bench(label: string, fn: () => void, runs = 30, warmup = 3, subRuns = 5): BenchResult {
  // گرمکردن بیرون از ناحیهٔ زمانسنجی.
  for (let i = 0; i < warmup; i++) fn();

  // نویز میزبان یکطرفه است (GC و وقفهٔ سیستم فقط کند میکنند): کمینهٔ subRuns اجرا، نمونهٔ کمآسیبترین است.
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    let best = Infinity;
    for (let j = 0; j < subRuns; j++) {
      const t0 = performance.now();
      fn();
      best = Math.min(best, performance.now() - t0);
    }
    samples.push(best);
  }

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const sd = Math.sqrt(samples.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, samples.length - 1));
  const rawCv = mean > 0 ? sd / mean : 0;
  const cv = robustCv(samples);

  const warn = rawCv > 0.10 ? '  ⚠ rawCv>10%' : '';
  console.log(
    `${label.padEnd(18)} n=${samples.length} ` +
    `p50=${percentile(samples, 0.5).toFixed(3)}ms ` +
    `p95=${percentile(samples, 0.95).toFixed(3)}ms ` +
    `p99=${percentile(samples, 0.99).toFixed(3)}ms ` +
    `mean=${mean.toFixed(3)}ms sd=${sd.toFixed(3)}ms cv=${(cv * 100).toFixed(2)}% (raw ${(rawCv * 100).toFixed(2)}%)` +
    warn,
  );
  return { samples, mean, sd, cv, rawCv };
}

const data = syntheticData(1500);
// sink قابل مشاهده (در انتها چاپ میشود) تا V8 نتواند محاسبات بنچمارک را حذف کند.
let sink = 0;

const slotInput: SlotScoreInput = {
  roomFacultyId: 1,
  targetFacultyId: 1,
  inPreferredWindow: true,
  inAvailableWindow: true,
  roomCapacity: 40,
  requiredCapacity: 30,
  adjacentToExisting: true,
  dayAlreadyUsed: true,
  gapsCreated: 0,
};
// برچسب «1000» تعداد ردیفها در هر فراخوانی است؛ ۱۰۰ فراخوانی در هر نمونه.
const checkIns = Array.from({ length: 1000 }, (_, i) => ({ studentId: i + 1, isPresent: 1, method: 'QR_SCAN' }));

type ResultRow = { label: string; result: BenchResult };

function runAll(subRuns: number): ResultRow[] {
  const out: ResultRow[] = [];
  const run = (label: string, fn: () => void, warmup = 3) => {
    out.push({ label, result: bench(label, fn, 30, warmup, subRuns) });
  };

  run('payroll 1500', () => {
    for (let i = 1; i <= 1500; i++) calcStaffPayrollFromData(data, i);
  }, 10);

  // برچسب «×10k» بار اسمی کار است؛ برای پایداری CV هر نمونه ۱۰ برابر (۱۰۰k) اجرا میشود.
  run('slot score ×10k', () => {
    for (let i = 0; i < 100_000; i++) sink += calculateSlotScore(slotInput).score;
  }, 300);

  run('validate 1000', () => {
    for (let i = 0; i < 100; i++) sink += validateCheckIns(checkIns)[0].studentId;
  }, 300);

  return out;
}

// طبق Node guide «increase n and try again»: شکست gate میتواند قرمز کاذب ناشی از
// نویز میزبان باشد؛ تمام بنچمارک را تا ۲ بار با subRuns بالاتر تکرار میکنیم و
// تنها در صورت شکست مجدد exit=1 میدهیم.
const SUBRUNS = [5, 10, 20];
let results: ResultRow[] = [];
let retries = 0;
let reliable = false;
for (let attempt = 0; attempt < SUBRUNS.length; attempt++) {
  if (attempt > 0) {
    retries = attempt;
    console.log(`\n🔁 تکرار ${attempt}/${SUBRUNS.length - 1} با subRuns=${SUBRUNS[attempt]} (پس از شکست gate)`);
  }
  results = runAll(SUBRUNS[attempt]);
  reliable = results.every(({ result }) => result.cv <= 0.05);
  if (reliable) break;
}

const rawReliable = results.every(({ result }) => result.rawCv <= 0.10);
console.log(`sink=${sink} · تکرار gate: ${retries}`);
if (!rawReliable) console.log('⚠ هشدار: rawCv برخی بنچمارکها بالای ۱۰٪ است (تأثیری بر exit code فعلی ندارد).');
console.log('ℹ gate کیفیت اندازهگیری است، NOT تشخیص رگرسیون عملکرد — CV (خام یا مقاوم) scale-invariant است و کندی ۱۰٪ را نمیبیند؛ تشخیص رگرسیون نیازمند مقایسه با baseline مرحلهٔ ۲ است.');

const summary = results.map(({ label, result }) => ({
  label,
  p50: percentile(result.samples, 0.5),
  p95: percentile(result.samples, 0.95),
  p99: percentile(result.samples, 0.99),
  mean: result.mean,
  sd: result.sd,
  cv: result.cv,
  rawCv: result.rawCv,
  reliable: result.cv <= 0.05,
  rawReliable: result.rawCv <= 0.10,
  retry: retries,
}));

if (process.env.BENCH_OUT) {
  const out = process.env.BENCH_OUT;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(`📄 خلاصهٔ JSON: ${out}`);
}

ok('CV ≤ 5% for all', reliable);
process.exit(reliable ? 0 : 1);
