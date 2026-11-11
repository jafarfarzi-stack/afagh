/**
 * ════════════════════════════════════════════════════════════════════════
 *  گاردِ «بروزرسانی هدفمند» دفتر مالی (finance upsert)
 *
 *  ریشهٔ باگ: migrate-legacy-finance فقط INSERT ایدمپاتنت بود. اگر مبلغ یا
 *  شرح یک فیش در UEMS اصلاح میشد، ردیف قدیمی student_ledger همان مقدار کهنه
 *  را نگه میداشت و استخراج تازهای هم که اضافه شد نمیتوانست آن را ترمیم کند.
 *
 *  این تست دو لایه دارد:
 *   ۱) قرارداد متن سورس (بدون DB): فقط amount/description مجاز به تغییرند،
 *      UPDATE روی id+ref+type+uni پین میشود، ref تکراری/دانشگاه دیگر/NULL
 *      fail-closed اند، --apply --upsert بدون --backup رد میشود، و پرچم
 *      --fin-upsert به اورکستراتور/لانچر/کانفیگ وصل است.
 *   ۲) رفتار SQL واقعی روی PGlite: diff، update، ایدمپاتنسی، بکاپ و restore.
 * ════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');

const MIGRATE = read('scripts/migrate-legacy-finance.mjs');
const ORCH = read('scripts/weekly-uems-sync.mjs');
const BAT = read('scripts/run-weekly-uems-sync.bat');
const ENV_EXAMPLE = read('scripts/weekly-uems-sync.env.example');

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); }
};
const eq = (a: unknown, b: unknown, m: string): void => ok(a === b, `${m} (got ${String(a)}, want ${String(b)})`);

async function main(): Promise<void> {
  // ── ۱) قرارداد ایمنی ────────────────────────────────────────────────────
  ok(MIGRATE.includes('export const DIFF_SQL') && MIGRATE.includes('export const UPDATE_SQL') &&
     MIGRATE.includes('export const BACKUP_SQL'), 'سه کوئری قابلتست export شدهاند');
  ok(MIGRATE.includes('SET amount = s.amt, description = s.descr'),
    'UPDATE فقط amount و description را مینویسد');
  // بند SET را دقیقاً استخراج میکنیم (ستونهای هویتی در WHERE مجاز و لازماند)
  const setClause = (MIGRATE.match(/\nSET\s+([^\n]+)\nFROM unnest/) || [])[1] || '';
  eq(setClause.trim(), 'amount = s.amt, description = s.descr',
    'بند SET دقیقاً همان دو ستون مجاز است');
  for (const pin of ['l.id = s.id', 'l."referenceId" = s.ref', 'l."transactionType" = s.tt', 'l."universityId" = s.uni']) {
    ok(MIGRATE.includes(pin), `UPDATE روی ${pin} پین شده است`);
  }
  ok(MIGRATE.includes('IS DISTINCT FROM'), 'UPDATE بینه است (IS DISTINCT FROM)');
  ok(MIGRATE.includes('if (Number(d.n) > 1) { out.duplicateRefs++; continue; }'),
    'ref تکراری fail-closed است');
  ok(MIGRATE.includes('if (Number(d.uni) !== uni) { out.foreignUni++; continue; }'),
    'ردیف دانشگاه دیگر دستنخورده میماند');
  ok(MIGRATE.includes("if (r.ref === null) { nullRef++; continue; }"), 'referenceId NULL نادیده گرفته میشود');
  ok(MIGRATE.includes('--upsert --apply نیازمند --backup'), 'اعمال بدون بکاپ رد میشود');
  ok(MIGRATE.includes('BACKUP_SQL') && MIGRATE.includes("openSync(BACKUP, 'w')"),
    'پیش از UPDATE بکاپ JSONL نوشته میشود');
  ok(MIGRATE.includes('if (RESTORE)') && MIGRATE.includes('RESTORE: '), 'مسیر بازگردانی وجود دارد');
  ok(MIGRATE.includes('pathToFileURL(process.argv[1])'), 'import توسط تست اثر جانبی ندارد');
  ok(MIGRATE.includes('computeDiff') && MIGRATE.includes('buildExpected'),
    'درج و تشخیص تفاوت از یک لیست واحد تغذیه میشوند');
  ok(MIGRATE.includes("args.diff === 'true'"), 'حالت --diff فقطخواندنی تعریف شده است');
  ok(MIGRATE.includes("args['repair-only'] === 'true'"), 'حالت --repair-only تعریف شده است');
  ok(MIGRATE.includes('REPAIR_ONLY && (!APPLY || !UPSERT)'), '--repair-only فقط همراه apply+upsert مجاز است');
  ok(MIGRATE.includes('*** REPAIR DONE'), 'repair-only پیش از حلقههای درج/تسویه خارج میشود');

  // ── ۲) اتصال به اورکستراتور / لانچر ─────────────────────────────────────
  ok(ORCH.includes("const FIN_UPSERT = A['fin-upsert'] === 'true';"), 'پرچم --fin-upsert پارس میشود');
  ok(ORCH.includes("...(FIN_UPSERT ? ['--upsert', '--backup'"), 'گام مالی بهصورت شرطی upsert میگیرد');
  ok(ORCH.includes('ledger-before-upsert-'), 'مسیر بکاپ JSONL در work-dir ساخته میشود');
  ok(ORCH.includes('--fin-upsert'), 'پرچم در مستندات اورکستراتور آمده است');
  ok(BAT.includes('UEMS_SYNC_FIN_UPSERT') && BAT.includes('--fin-upsert'), 'لانچر ویندوزی سوئیچ را پاس میدهد');
  ok(ENV_EXAMPLE.includes('UEMS_SYNC_FIN_UPSERT'), 'نمونهٔ کانفیگ سوئیچ را توضیح داده است');

  // ── ۳) رفتار SQL واقعی روی PGlite ───────────────────────────────────────
  const mod: any = await import('../scripts/migrate-legacy-finance.mjs');
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE student_ledger (
      id serial PRIMARY KEY,
      "studentId" integer NOT NULL,
      "termId" integer,
      "transactionType" text NOT NULL,
      amount numeric(12,0) NOT NULL,
      description text,
      "referenceId" integer,
      "universityId" integer,
      "depositType" text
    );
    INSERT INTO student_ledger
      (id,"studentId","transactionType",amount,description,"referenceId","universityId","depositType") VALUES
      (1,10,'PAYMENT',          100,'old-pay',  100,1,'نقدي'),
      (2,10,'TUITION_FIXED',    500,'same-fee', 200,1,NULL),
      (3,11,'PAYMENT',          300,'foreign',  300,2,'چک'),
      (4,12,'PAYMENT',          400,'dup-a',    400,1,NULL),
      (5,12,'PAYMENT',          400,'dup-b',    400,1,NULL),
      (6,13,'PAYMENT',          600,'keep',     500,1,'نقدي'),
      (7,14,'PAYMENT',          700,'desc-old', 600,1,'چک');
  `);
  const q = async (t: string, p: unknown[]): Promise<any[]> => (await db.query(t, p as any)).rows as any[];

  const expected: any[] = [
    { ref: 100, tt: 'PAYMENT',        amount: 150,  description: 'old-pay',   uni: 1 }, // مبلغ تغییر کرده
    { ref: 200, tt: 'TUITION_FIXED',  amount: 500,  description: 'same-fee',  uni: 1 }, // بدون تغییر
    { ref: 300, tt: 'PAYMENT',        amount: 999,  description: 'foreign',   uni: 1 }, // دانشگاه دیگر
    { ref: 400, tt: 'PAYMENT',        amount: 888,  description: 'dup-a',     uni: 1 }, // ref تکراری
    { ref: 500, tt: 'PAYMENT',        amount: 600,  description: 'keep',      uni: 1 }, // بدون تغییر
    { ref: 600, tt: 'PAYMENT',        amount: 700,  description: 'desc-new',  uni: 1 }, // شرح تغییر کرده
    { ref: 700, tt: 'PAYMENT',        amount: 10,   description: 'brand-new', uni: 1 }, // مفقود
    { ref: null, tt: 'PAYMENT',       amount: 10,   description: 'null-ref',  uni: 1 }, // غیرقابلانطباق
  ];

  const diff = await mod.computeDiff(q, expected, 1, 3);
  eq(diff.expected, 7, 'هفت کلید قابلانطباق');
  eq(diff.nullRef, 1, 'یک ref NULL شمارش شد');
  eq(diff.duplicateRefs, 1, 'یک ref تکراری رد شد');
  eq(diff.foreignUni, 1, 'یک ردیف دانشگاه دیگر رد شد');
  eq(diff.missing, 1, 'یک ردیف مفقود شناسایی شد');
  eq(diff.unchanged, 2, 'دو ردیف بدونتغییر');
  eq(diff.amountDiff, 1, 'یک تفاوت مبلغ');
  eq(diff.descriptionDiff, 1, 'یک تفاوت شرح');
  eq(diff.toUpdate.length, 2, 'دو ردیف کاندید بروزرسانی');
  ok(diff.toUpdate.some((r: any) => r.id === 1) && diff.toUpdate.some((r: any) => r.id === 7),
    'id های دقیق ردیفها شناسایی شدند');

  // بکاپ پیش از اعمال
  const backupRows = await q(mod.BACKUP_SQL, [diff.toUpdate.map((r: any) => r.id)]);
  eq(backupRows.length, 2, 'بکاپ دو ردیف را گرفت');
  ok(backupRows.some((r: any) => r.id === 1 && r.amount === '100' && r.description === 'old-pay'),
    'بکاپ مقدار قدیمی مبلغ/شرح را نگه داشت');
  ok(backupRows.some((r: any) => r.id === 1 && r.depositType === 'نقدي'),
    'بکاپ ستون مستندسازت را هم ثبت کرد');

  const upd = diff.toUpdate;
  const applied = await q(mod.UPDATE_SQL, [
    upd.map((r: any) => r.id), upd.map((r: any) => r.tt), upd.map((r: any) => r.amount),
    upd.map((r: any) => r.description), upd.map((r: any) => r.uni), upd.map((r: any) => r.ref),
  ]);
  eq(applied.length, 2, 'دو ردیف بروز شد');
  const after: any = await q('SELECT id, amount::text AS amount, description, "depositType" AS dt FROM student_ledger ORDER BY id', []);
  const byId = new Map<number, any>(after.map((r: any) => [Number(r.id), r]));
  eq(String(byId.get(1).amount), '150', 'مبلغ اصلاح شد');
  eq(byId.get(1).dt, 'نقدي', 'depositType دستنخورده ماند');
  eq(byId.get(7).description, 'desc-new', 'شرح اصلاح شد');
  eq(String(byId.get(3).amount), '300', 'ردیف دانشگاه دیگر دستنخورده ماند');
  eq(String(byId.get(4).amount), '400', 'ردیف ref تکراری دستنخورده ماند');
  eq(byId.get(6).description, 'keep', 'ردیف بدونتغییر دستنخورده ماند');

  // ایدمپاتنسی: اجرای دوم نباید چیزی بنویسد
  const again = await q(mod.UPDATE_SQL, [
    upd.map((r: any) => r.id), upd.map((r: any) => r.tt), upd.map((r: any) => r.amount),
    upd.map((r: any) => r.description), upd.map((r: any) => r.uni), upd.map((r: any) => r.ref),
  ]);
  eq(again.length, 0, 'اجرای مجدد UPDATE بینه است');

  // بازگردانی از بکاپ
  const restored = await q(mod.UPDATE_SQL, [
    backupRows.map((r: any) => r.id), backupRows.map((r: any) => r.tt),
    backupRows.map((r: any) => Number(r.amount)), backupRows.map((r: any) => r.description ?? ''),
    backupRows.map((r: any) => r.uni), backupRows.map((r: any) => r.ref),
  ]);
  eq(restored.length, 2, 'بازگردانی دو ردیف را برگرداند');
  const back: any = await q('SELECT id, amount::text AS amount, description FROM student_ledger WHERE id IN (1,7) ORDER BY id', []);
  eq(String(back[0].amount), '100', 'مبلغ قدیمی برگشت');
  eq(back[1].description, 'desc-old', 'شرح قدیمی برگشت');

  await db.close();
  console.log(`\n${pass} قبول / ${fail} رد`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
