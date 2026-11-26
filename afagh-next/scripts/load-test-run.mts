#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  اجرای تست سنگین موتور حقوق روی دیتابیس زندهٔ PostgreSQL
 *
 *  فازها (متغیر PHASE، پیش‌فرض همه):
 *   warmup | load | compute | overview | midterm | settle | report
 *
 *  اجرا:  DATABASE_URL=… PHASE=all npx tsx --conditions=react-server scripts/load-test-run.mts
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';
import { performance } from 'node:perf_hooks';

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL الزامی است.'); process.exit(2); }

// ── محافظ سخت production: باید قبل از پچ کوئریها و ایمپورت موتور اجرا شود ──
// این اسکریپت payroll_statements و audit_logs مینویسد؛ اجرای تصادفی روی production خطرناک است.
{
  const guard = new pg.Client({ connectionString: URL });
  let db = null;
  let addr = null;
  let denied = false;
  try {
    await guard.connect();
    const row = (await guard.query('SELECT current_database() AS db, inet_server_addr()::text AS addr')).rows[0];
    if (!row) {
      console.error('❌ محافظ نتوانست هویت دیتابیس را شناسایی کند (کوئری بدون نتیجه) — اجرا متوقف میشود.');
      denied = true;
    } else {
      db = row.db;
      addr = row.addr;
      denied = (db === 'afagh_db' || addr === '100.70.187.120') && process.env.ALLOW_PROD_BENCH !== '1';
      if (denied) {
        console.error('⛔ شناسایی دیتابیس production — اجرای bench ممنوع است.');
        console.error(`   current_database=${db} · server_addr=${addr}`);
        console.error('   از دیتابیس جداگانهٔ afagh_bench استفاده کنید یا ALLOW_PROD_BENCH=1 تنظیم نمایید.');
      }
    }
  } catch (e) {
    console.error('❌ نتوانستیم دیتابیس را برای بررسی محافظ شناسایی کنیم:', String(e));
    denied = true;
  } finally {
    await guard.end().catch(() => {});
  }
  if (denied) process.exit(2);
}

const PHASE = (process.env.PHASE || 'all').split(',').map(s => s.trim());
const has = (p) => PHASE.includes(p) || PHASE.includes('all');

// ── شمارندهٔ دقیق کوئری‌ها: فقط Client.prototype (Pool.query در نهایت به Client می‌رسد؛
//    در تراکنش هم drizzle مستقیم Client را صدا می‌زند؛ پس شمارش دوباره رخ نمی‌دهد) ──
const stats = { sql: 0, bySql: new Map(), phase: null, times: [] };
function snap(sqlText, ms) {
  if (!stats.phase) return;
  stats.sql++;
  stats.times.push(ms);
  const key = (sqlText ?? '').slice(0, 100).replace(/\s+/g, ' ').trim();
  stats.bySql.set(key, (stats.bySql.get(key) ?? 0) + 1);
}
const pct = (sorted, p) => sorted.length
  ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]
  : 0;
const origClientQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) {
  const [a] = args;
  const text = typeof a === 'string' ? a : a?.text;
  const t0 = performance.now();
  let recorded = false;
  // once محافظت میکند؛ recorded تضمین میکند حتی اگرend و error هر دو آمدند دوبار شمارش نشود.
  const record = () => {
    if (recorded) return;
    recorded = true;
    snap(text, performance.now() - t0);
  };
  let ret;
  try {
    ret = origClientQuery.apply(this, args);
  } catch (e) {
    record(); // خطای همزمان هنگام ساخت کوئری
    throw e;
  }
  if (ret && typeof ret.then === 'function') {
    // Promise: موفقیت و شکست هر دو ثبت میشوند؛ همان promise اصلی به caller برگردانده میشود.
    ret.then(record, record);
  } else if (ret && typeof ret.on === 'function') {
    // مسیر callback/Query-Emitter
    ret.once('end', record);
    ret.once('error', record);
  } else {
    record();
  }
  return ret;
};
const origPoolQuery = pg.Pool.prototype.query;
pg.Pool.prototype.query = function (...args) { return origPoolQuery.apply(this, args); };

// ── موتور حقوق (import داینامیک بعد از patch) ──
const engine = await import('../src/lib/payroll-engine.ts');
const { loadTermPayrollData, computeTermPayroll, payMidterm, settleFinal, currentTerm } = engine;

async function timed(label, fn) {
  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;
  console.log(`⏱  ${label}: ${(ms / 1000).toFixed(2)} ثانیه`);
  return { result, ms };
}
const begin = (p) => { stats.phase = p; stats.sql = 0; stats.times = []; stats.bySql.clear(); };
const end = () => {
  const times = [...stats.times].sort((a, b) => a - b);
  const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const p95 = pct(times, 0.95);
  const p99 = pct(times, 0.99);
  console.log(`   ⏱  زمان کوئریها (${times.length}): mean=${mean.toFixed(2)}ms p95=${p95.toFixed(2)}ms p99=${p99.toFixed(2)}ms`);
  stats.phase = null;
  return { sql: stats.sql, bySql: stats.bySql, times: stats.times, mean, p95, p99 };
};

console.log('════════════ شروع تست سنگین بارگذاری ════════════');
const term = await currentTerm();
console.log('📅 ترم جاری:', term?.title, '(id=' + term?.id + ')');

if (has('warmup')) {
  // گرمکردن کش تنظیمات تا اندازه‌گیری «خالص» باشد
  begin('warmup');
  await loadTermPayrollData(term.id);
  end();
}

// ── ۱) اثبات ثابت‌بودن تعداد کوئری (عدم N+1) ──
if (has('load')) {
  begin('load');
  const data0 = await loadTermPayrollData(term.id);
  const r1 = end();
  console.log(`\n🔍 loadTermPayrollData #1 → ${r1.sql} کوئری (۱۵۰۰ استاد، ۳۳۰۰ کلاس، ۵۳۷۸۸ جلسه)`);

  begin('load');
  await loadTermPayrollData(term.id);
  const r2 = end();
  console.log(`🔍 loadTermPayrollData #2 → ${r2.sql} کوئری — ${r2.sql === r1.sql ? '✅ ثابت (مستقل از تعداد استاد = عدم N+1)' : '❌ متغیر!'}`);
  console.log('   توزیع کوئری‌ها:');
  for (const [k, n] of r2.bySql.entries()) console.log(`     • ${n}× ${k.slice(0, 90)}`);
}

// ── ۲) محاسبهٔ فیش همهٔ ۱۵۰۰ استاد ──
if (has('compute')) {
  const { result: computeRes, ms } = await timed('computeTermPayroll (۱۵۰۰ استاد)', () => computeTermPayroll(null, term.id));
  console.log('   نتیجه:', JSON.stringify(computeRes));
  console.log(`   ⚡ توان عملیاتی: ${(computeRes.computed / (ms / 1000)).toFixed(0)} فیش/ثانیه`);
}

// ── ۳) داشبورد + گلوگاه‌ها ──
let overview = null;
if (has('overview')) {
  const { result } = await timed('getOverview (داشبورد ۱۵۰۰ ردیف)', () => engine.getOverview(term.id));
  overview = result;
  const gates = { open: 0, closed: 0 };
  const statuses = {};
  let sumNet = 0;
  for (const row of overview.list) {
    const g = row.gates;
    if (g.gradesFinalized && g.docsSigned) gates.open++; else gates.closed++;
    statuses[row.status] = (statuses[row.status] ?? 0) + 1;
    sumNet += row.net;
  }
  console.log(`\n🚦 گلوگاه تسویه: باز (نمرات FINALIZED + اسناد SIGNED): ${gates.open} · بسته (گلوگاه): ${gates.closed}`);
  console.log('   وضعیت فیش‌ها:', JSON.stringify(statuses));
  console.log(`   مجموع خالص: ${sumNet} ریال`);
  const r0 = overview.list[0];
  console.log(`   نمونهٔ فیش: ${r0.name} → ناخالص ${r0.gross} · خالص ${r0.net} · واحد ${r0.payableUnits} · گلوگاه ${JSON.stringify(r0.gates)}`);
}

// ── ۴) علی‌الحساب میان‌ترم ──
if (has('midterm')) {
  if (!overview) overview = await engine.getOverview(term.id);
  const payable = overview.list.filter(r => r.gates.gradesFinalized && r.gates.docsSigned);
  let midPaid = 0, midBlocked = 0;
  let midSum = 0;
  begin('midterm');
  const midT0 = performance.now();
  for (const row of payable) {
    try {
      const res = await payMidterm(row.id, null, term.id);
      if (res?.ok) { midPaid++; midSum += res.amount; }
    } catch { midBlocked++; }
  }
  const midMs = performance.now() - midT0;
  const qm = end();
  console.log(`\n💵 علی‌الحساب میان‌ترم: ${midPaid} استاد در ${(midMs / 1000).toFixed(2)} ثانیه (${(midMs / Math.max(midPaid, 1)).toFixed(0)}ms/استاد) · مبلغ ${midSum} ریال · مسدود ${midBlocked}`);
  console.log(`   کوئری‌های فاز: ${qm.sql} (${(qm.sql / Math.max(midPaid, 1)).toFixed(1)} به‌ازای هر استاد)`);
}

// ── ۵) تسویهٔ نهایی ──
if (has('settle')) {
  const ov = await engine.getOverview(term.id);
  const settledable = ov.list.filter(r => r.gates.gradesFinalized && r.gates.docsSigned);
  let settled = 0, settleBlocked = 0, finSum = 0;
  begin('settle');
  const finT0 = performance.now();
  for (const row of settledable) {
    try {
      const res = await settleFinal(row.id, null, term.id);
      if (res?.ok) { settled++; finSum += res.amount; }
    } catch { settleBlocked++; }
  }
  const finMs = performance.now() - finT0;
  const qs = end();
  console.log(`\n✅ تسویهٔ نهایی: ${settled} استاد در ${(finMs / 1000).toFixed(2)} ثانیه (${(finMs / Math.max(settled, 1)).toFixed(0)}ms/استاد) · مبلغ ${finSum} ریال · مسدود ${settleBlocked}`);
  console.log(`   کوئری‌های فاز: ${qs.sql} (${(qs.sql / Math.max(settled, 1)).toFixed(1)} به‌ازای هر استاد — شامل بارگذاری گلوگاه داخل تراکنش)`);
}

// ── ۶) گزارش نهایی ──
if (has('report')) {
  const finalOverview = await engine.getOverview(term.id);
  const fStatuses = {};
  let budget = 0, paid = 0, remaining = 0;
  for (const row of finalOverview.list) {
    fStatuses[row.status] = (fStatuses[row.status] ?? 0) + 1;
    budget += row.net; paid += row.midtermPaid + row.finalPaid; remaining += row.remaining;
  }
  console.log('\n📊 گزارش نهایی:');
  console.log('   وضعیت فیش‌ها:', JSON.stringify(fStatuses));
  console.log(`   بودجه (مجموع خالص): ${budget} ریال`);
  console.log(`   پرداخت‌شده: ${paid} ریال · باقی‌مانده: ${remaining} ریال`);
  console.log(`   تطابق: ${budget === paid + remaining ? '✅' : '❌'} (${budget.toLocaleString('en')} = ${(paid + remaining).toLocaleString('en')})`);
}

console.log('\n════════════ پایان تست سنگین ════════════');
process.exit(0);
