/**
 * ═══════════════════════════════════════════════════════════════════════
 *  گیت «دامنهٔ چنددانشگاهی» موتور ثبت تطبیق واحد + خوانندهٔ کارنامه
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  پایگاه داده از تک‌دانشگاهی به ۵ دانشگاه تغییر کرده، ولی چند مسیر نوشته/خوانده
 *  با فرض تک‌دانشگاهی هنوز «بی‌دامنه» بودند. این تست‌ها هر چهار مورد را می‌بندند:
 *
 *   ۱) جست‌وجوی درس مقصد بدون فیلتر universityId → کد درس بین دانشگاه‌ها یکتا
 *      نیست (۱۷۰ تصادف عددی شمس∩آفاق) ⇒ اتصال به ردیف دانشگاه دیگر.
 *   ۲) انتخاب «ترم جاری» بدون فیلتر دانشگاه ⇒ سه ردیف isCurrent=1 (شمس ۱۳۹۹۲،
 *      آفاق ۱۴۰۵۱، علامه ۱۴۰۳۲) و انتخاب دلخواهی.
 *   ۳) درج ترم معادل‌سازی «۰۰EQn» بدون universityId: یکتایی روی
 *      (universityId, termCode) و NULL متمایز در PostgreSQL ⇒ ردیف تکراری
 *      و نامرئی در گزارش‌های دانشگاهی.
 *   ۴) پیوست legacy_grades بدون sourceCode (این جدول اصلاً ستون universityId
 *      ندارد) ⇒ مهر کد وضعیتِ دانشگاهِ دیگر روی کارنامه (۱۴۹ تصادف studentCode).
 *
 *  بدون PostgreSQL اجرا می‌شود: یک «دیتابیس قلابی» کوچک رفتار WHERE/یکتایی
 *  را تقلید می‌کند (از جمله تمایز NULL در یکتایی) و دقیقاً همان کد تولیدی
 *  drizzle را رندر می‌کند تا دامنهٔ واقعی کوئری هم سنجیده شود.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { academic_terms, courses } from '@/db/schema';
import { legacyRowOfSource, legacySourceCodeFor } from '@/app/admin/students/transcript-utils';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * enroll-engine → regulations-engine/tuition-engine → settings.ts که ماژول
 * `server-only` را می‌آورد (و آن بیرون از رانر Next عمداً پرتاب می‌کند).
 * اینجا فقط همان گارد را خنثی می‌کنیم تا منطق دامنه بدون Next قابل اجرا باشد؛
 * هیچ اتصالی به پایگاه داده برقرار نمی‌شود (تمام کوئری‌ها روی FakeDb است).
 */
const requireCjs = createRequire(import.meta.url);
const serverOnlyId = requireCjs.resolve('server-only');
(requireCjs as any).cache[serverOnlyId] = {
  id: serverOnlyId, filename: serverOnlyId, loaded: true, exports: {}, children: [], paths: [],
};

let pass = 0;
let fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>): Promise<void> => {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    fail++;
    console.log(`  ✗ ${name}\n      ${e?.message ?? e}`);
  }
};
const ok = (cond: unknown, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const eq = (got: unknown, want: unknown, msg = ''): void => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
  }
};

// ───────────────────────────────────────────────────────────────────────
//  دیتابیس قلابی: همان زیرمجموعهٔ API که enroll-engine صدا می‌زند
// ───────────────────────────────────────────────────────────────────────
type Row = Record<string, any>;

const tableOf = (name: string) => {
  if (name === 'courses') return courses;
  if (name === 'academic_terms') return academic_terms;
  throw new Error(`fake-db: جدول ناشناخته ${name}`);
};

const tableName = (table: any): string =>
  (table && (table[Symbol.for('drizzle:Name')] || table._?.name)) || '';

/**
 * شرط WHERE را با همان QueryBuilder واقعی رندر می‌کند و تساوی‌ها را روی ردیف
 * اعمال می‌کند. تساوی PostgreSQL تقلید می‌شود: `NULL = NULL` هرگز درست نیست.
 */
const matchWhere = (name: string, cond: any, row: Row): boolean => {
  const q = new QueryBuilder().select().from(tableOf(name)).where(cond).toSQL();
  const where = q.sql.slice(q.sql.indexOf(' where '));
  const preds = [...where.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)" = \$(\d+)/g)]
    .map((m) => [m[1], q.params[Number(m[2]) - 1]] as const);
  return preds.every(([col, val]) => row[col] !== null && row[col] !== undefined && row[col] === val);
};

/** یکتایی uq_terms_uni_code با رفتار PostgreSQL: NULL متمایز است (تکرار مجاز) */
const conflicts = (table: string, store: Row[], v: Row): boolean => {
  if (table !== 'academic_terms') return false;
  return store.some(
    (r) => r.universityId != null && v.universityId != null
      && r.universityId === v.universityId && r.termCode === v.termCode,
  );
};

type Captured = { table: string; sql: string; params: unknown[] };

class FakeDb {
  tables: Record<string, Row[]> = {};
  wheres: Captured[] = [];
  inserts: { table: string; values: Row; conflict: any }[] = [];
  /** حالت خراب: کوئری بی‌دامنه (pre-fix) را تقلید می‌کند و WHERE را نادیده می‌گیرد */
  ignoreWhere = false;
  private seq = 0;

  constructor(seed: Record<string, Row[]>) {
    for (const [k, v] of Object.entries(seed)) this.tables[k] = v.map((r) => ({ ...r }));
  }

  select(_fields?: unknown) {
    const self = this;
    return {
      from(table: any) {
        const name = tableName(table);
        return {
          where(cond: any) {
            const q = new QueryBuilder().select().from(tableOf(name)).where(cond).toSQL();
            self.wheres.push({ table: name, sql: q.sql.slice(q.sql.indexOf(' where ')), params: q.params });
            return {
              limit: (n?: number) => {
                let rows = (self.tables[name] ?? []).filter(
                  (r) => self.ignoreWhere || matchWhere(name, cond, r),
                );
                if (n != null) rows = rows.slice(0, n);
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
            };
          },
        };
      },
    };
  }

  insert(table: any) {
    const self = this;
    const name = tableName(table);
    return {
      values(v: Row) {
        return {
          onConflictDoNothing(cfg?: any) {
            return {
              returning: () => {
                self.inserts.push({ table: name, values: { ...v }, conflict: cfg ?? null });
                const store = self.tables[name] ?? (self.tables[name] = []);
                if (conflicts(name, store, v)) return Promise.resolve([]);
                const row = { id: ++self.seq, ...v };
                store.push(row);
                return Promise.resolve([{ ...row }]);
              },
            };
          },
        };
      },
    };
  }

  transaction<T>(cb: (tx: FakeDb) => Promise<T>): Promise<T> {
    return cb(this);
  }

  update(): never {
    throw new Error('fake-db: update خارج از دامنهٔ این تست است');
  }
}

/** درج خام (تقلید رفتار کد پیش از اصلاح) — برای witness بازتولید اشکال */
const rawInsert = (db: FakeDb, table: string, values: Row): Row[] => {
  const store = db.tables[table] ?? (db.tables[table] = []);
  if (conflicts(table, store, values)) return [];
  const row = { id: ++(db as any).seq, ...values };
  store.push(row);
  return [row];
};

// دادهٔ نمونه: ۱۷۰ کد مشترک شمس∩آفاق و سه ترم جاری
const AFAGH = 1, SHAMS = 3;
const seed = () => new FakeDb({
  courses: [
    { id: 1, code: '1010', title: 'ریاضی ۱ — آفاق', units: '3', universityId: AFAGH },
    { id: 2, code: '1010', title: 'ریاضی ۱ — شمس', units: '4', universityId: SHAMS },
    { id: 3, code: '2020', title: 'فیزیک ۱ — آفاق', units: '3', universityId: AFAGH },
  ],
  academic_terms: [
    { id: 11, termCode: '13992', title: 'نیمسال اول ۱۳۹۹', isCurrent: 1, universityId: SHAMS },
    { id: 12, termCode: '14051', title: 'نیمسال اول ۱۴۰۵', isCurrent: 1, universityId: AFAGH },
    { id: 13, termCode: '14032', title: 'نیمسال اول ۱۴۰۳', isCurrent: 1, universityId: 2 },
  ],
});

async function main(): Promise<void> {
  // پس از خنثی‌سازی گارد server-only بارگذاری می‌شوند (بارگذاری پویا)
  const { applyCourseTransfer, resolveCurrentTerm, resolveTargetCourse } =
    await import('@/lib/enroll-engine/transfer');
  const { applyEquivalenceBatch, ensureEquivalenceTerm } =
    await import('@/lib/enroll-engine/equivalence');

  // ═══ ۱) کد درس بین دانشگاه‌ها یکتا نیست ═══════════════════════════════
  console.log('۱) جست‌وجوی درس مقصد — دامنهٔ دانشگاه اجباری');

  await t('کد مشترک ۱۰۱۰: درس دانشگاهِ خودِ دانشجو انتخاب می‌شود (نه دانشگاه دیگر)', async () => {
    const db = seed();
    const shams = await resolveTargetCourse(db as any, SHAMS, '1010');
    eq(shams?.id, 2, 'درس شمس باید انتخاب شود');
    eq(shams?.title, 'ریاضی ۱ — شمس');
    const afagh = await resolveTargetCourse(db as any, AFAGH, '1010');
    eq(afagh?.id, 1, 'درس آفاق باید انتخاب شود');
  });

  await t('کوئریِ بی‌دامنه به ردیف دانشگاه دیگر نمی‌چسبد (fail-closed)', async () => {
    const db = seed();
    db.ignoreWhere = true; // تقلید رفتار پیش از اصلاح: بدون فیلتر universityId
    eq(await resolveTargetCourse(db as any, SHAMS, '1010'), null, 'درس آفاق نباید برگردد');
    eq((await resolveTargetCourse(db as any, AFAGH, '1010'))?.universityId, AFAGH, 'فقط ردیف آفاق برگردد');
  });

  await t('WHERE تولیدشده برای درس مقصد شامل universityId است', async () => {
    const db = seed();
    await resolveTargetCourse(db as any, SHAMS, '1010');
    const w = db.wheres.at(-1)!;
    ok(w.sql.includes('"courses"."code" = $1'), `WHERE کد درس ندارد: ${w.sql}`);
    ok(/"courses"\."universityId" = \$2/.test(w.sql), `WHERE دامنهٔ دانشگاه ندارد: ${w.sql}`);
  });

  await t('کد درسِ ناموجود در چارت آن دانشگاه → null (نه ردیف دانشگاه دیگر)', async () => {
    const db = seed();
    db.tables.courses = [{ id: 2, code: '1010', title: 'ریاضی ۱ — شمس', universityId: SHAMS }];
    eq(await resolveTargetCourse(db as any, AFAGH, '1010'), null);
  });

  await t('بدون universityId خطای صریح می‌دهد؛ کوئری سراسری در کار نیست', async () => {
    for (const uid of [0, -1, Number.NaN, undefined as any]) {
      const res = await applyCourseTransfer({ studentId: 7, universityId: uid, targetCourseCode: '1010' });
      ok(res.ok === false, 'باید ناموفق باشد');
      ok(res.enrollmentId === undefined, 'نباید enrollment بسازد');
    }
    const batch = await applyEquivalenceBatch({
      studentId: 7,
      universityId: 0,
      items: [{ sourceTitle: 'ریاضی', sourceGrade: 18, sourceUnits: 3, targetCourseCode: '1010' }],
    });
    eq(batch.ok, false);
    eq(batch.registered, [], 'هیچ درسی ثبت نشود');
    eq(batch.termsCreated, 0);
  });

  // ═══ ۲) ترم جاریِ غیر یکتا ═══════════════════════════════════════════
  console.log('۲) ترم جاری — سه ردیف isCurrent=1 در سه دانشگاه');

  await t('ترم جاریِ دانشگاهِ خودِ دانشجو انتخاب می‌شود', async () => {
    const db = seed();
    eq((await resolveCurrentTerm(db as any, AFAGH))?.termCode, '14051', 'آفاق → ۱۴۰۵۱');
    eq((await resolveCurrentTerm(db as any, SHAMS))?.termCode, '13992', 'شمس → ۱۳۹۹۲');
    eq((await resolveCurrentTerm(db as any, 2))?.termCode, '14032', 'علامه → ۱۴۰۳۲');
  });

  await t('دانشگاهِ بدون ترم جاری → null (نه ترم دلخواهیِ دانشگاه دیگر)', async () => {
    const db = seed();
    eq(await resolveCurrentTerm(db as any, 99), null);
  });

  await t('حتی با کوئری بی‌دامنه، ترمِ دانشگاه دیگر انتخاب نمی‌شود', async () => {
    const db = seed();
    db.ignoreWhere = true; // سه ترم جاری، بدون فیلتر → اولین ردیف دلخواهی
    eq((await resolveCurrentTerm(db as any, AFAGH))?.termCode, '14051');
  });

  await t('WHERE تولیدشده برای ترم جاری شامل universityId است', async () => {
    const db = seed();
    await resolveCurrentTerm(db as any, AFAGH);
    const w = db.wheres.at(-1)!;
    ok(w.sql.includes('"academic_terms"."isCurrent" = $1'), `WHERE isCurrent ندارد: ${w.sql}`);
    ok(/"academic_terms"\."universityId" = \$2/.test(w.sql), `WHERE دامنهٔ دانشگاه ندارد: ${w.sql}`);
  });

  // ═══ ۳) ترم معادل‌سازی: ایدمپوتنت و دامنه‌دار ══════════════════════════
  console.log('۳) ترم معادل‌سازی «۰۰EQn» — مهر دانشگاه + ایدمپوتنتی');

  await t('بار اول ساخته می‌شود و universityId روی ردیف می‌نشیند', async () => {
    const db = seed();
    const term = await ensureEquivalenceTerm(db as any, {
      universityId: SHAMS, termCode: '00EQ1', title: 'معادل‌سازی — نوبت ۱',
    });
    ok(term, 'ترم ساخته نشد');
    eq(term!.universityId, SHAMS, 'ردیف بدون دانشگاه درج شد');
    eq(term!.termCode, '00EQ1');
    eq(term!.termType, 'EQUIVALENCE');
    eq(term!.isCurrent, 0);
    eq(db.inserts.at(-1)!.values.universityId, SHAMS, 'مقدار INSERT فاقد universityId است');
  });

  await t('اجرای دوم همان ردیف را برمی‌گرداند — بدون ردیف تکراری', async () => {
    const db = seed();
    const a = await ensureEquivalenceTerm(db as any, { universityId: AFAGH, termCode: '00EQ1', title: 'معادل‌سازی — نوبت ۱' });
    const b = await ensureEquivalenceTerm(db as any, { universityId: AFAGH, termCode: '00EQ1', title: 'معادل‌سازی — نوبت ۱' });
    eq(b!.id, a!.id, 'شناسهٔ ترم در اجرای دوم عوض شد');
    eq(db.tables.academic_terms.filter((r) => r.termCode === '00EQ1' && r.universityId === AFAGH).length, 1);
    eq(db.inserts.length, 1, 'بار دوم نباید INSERT بزند');
  });

  await t('دو دانشگاه، ترم معادل‌سازی جداگانه (عدم اشتراک «۰۰EQ۱»)', async () => {
    const db = seed();
    const s = await ensureEquivalenceTerm(db as any, { universityId: SHAMS, termCode: '00EQ1', title: 'معادل‌سازی — نوبت ۱' });
    const a = await ensureEquivalenceTerm(db as any, { universityId: AFAGH, termCode: '00EQ1', title: 'معادل‌سازی — نوبت ۱' });
    ok(s!.id !== a!.id, 'ترم دو دانشگاه یکی شد');
    eq(db.tables.academic_terms.filter((r) => r.termCode === '00EQ1').length, 2);
  });

  await t('هدف تعارض INSERT صریحاً روی (universityId, termCode) است', async () => {
    const db = seed();
    await ensureEquivalenceTerm(db as any, { universityId: AFAGH, termCode: '00EQ1', title: 'معادل‌سازی — نوبت ۱' });
    const target = db.inserts.at(-1)!.conflict?.target;
    ok(Array.isArray(target), 'هدف تعارض تعریف نشده (NULL-distinct!)');
    eq(target.map((c: any) => c.name), ['universityId', 'termCode']);
  });

  await t('بازخوانیِ ترم پس از ساخت هم دامنه‌دار است', async () => {
    const db = seed();
    db.tables.academic_terms.push({ id: 77, termCode: '00EQ1', title: 'orphan', universityId: null });
    await ensureEquivalenceTerm(db as any, { universityId: AFAGH, termCode: '00EQ1', title: 'معادل‌سازی — نوبت ۱' });
    ok(
      db.wheres.every((w) => w.sql.includes('"academic_terms"."universityId"')),
      'یکی از کوئری‌های ترم معادل‌سازی بی‌دامنه بود',
    );
    const terms = db.tables.academic_terms.filter((r) => r.termCode === '00EQ1');
    eq(terms.length, 2, 'ردیف orphan نباید بازاستفاده شود');
    eq(terms.filter((r) => r.universityId === null).length, 1);
  });

  await t('شاهد بازتولید اشکال: درجِ بدون universityId در هر اجرا ردیف تکراری می‌سازد', async () => {
    // رفتار کد «پیش از اصلاح»: values بدون دانشگاه + onConflictDoNothing() بی‌هدف
    const db = seed();
    const vals = { termCode: '00EQ1', title: 'معادل‌سازی — نوبت ۱', termType: 'EQUIVALENCE', isCurrent: 0 };
    rawInsert(db, 'academic_terms', vals);
    rawInsert(db, 'academic_terms', vals);
    eq(
      db.tables.academic_terms.filter((r) => r.termCode === '00EQ1' && r.universityId == null).length,
      2,
      'باید تکراری شود تا بازتولید اشکال معتبر باشد',
    );
    // و مسیر اصلاح‌شده در همان شرایط فقط یک ردیف می‌سازد
    const fixed = seed();
    await ensureEquivalenceTerm(fixed as any, { universityId: AFAGH, termCode: '00EQ1', title: 'x' });
    await ensureEquivalenceTerm(fixed as any, { universityId: AFAGH, termCode: '00EQ1', title: 'x' });
    eq(fixed.tables.academic_terms.filter((r) => r.termCode === '00EQ1').length, 1);
  });

  // ═══ ۴) پیوست legacy_grades ═════════════════════════════════════════
  console.log('۴) legacy_grades — جدول بدون ستون دانشگاه، مرزبندی با sourceCode');

  await t('کد مبدأ از کد دانشگاه ساخته می‌شود (قرارداد sourceCode = universities.code)', () => {
    eq(legacySourceCodeFor('SHAMS'), 'SHAMS');
    eq(legacySourceCodeFor('shams'), 'SHAMS', 'حروف کوچک باید نرمال شود');
    eq(legacySourceCodeFor('  afagh '), 'AFAGH');
    eq(legacySourceCodeFor(null), null);
    eq(legacySourceCodeFor(undefined), null);
    eq(legacySourceCodeFor(''), null);
    eq(legacySourceCodeFor('SH AMS'), null, 'کد نامعتبر نباید به کوئری برسد');
  });

  await t('دانشگاه نامشخص → هیچ ردیفی (هرگز پیوست بی‌دامنه)', () => {
    const rows = [{ sourceCode: 'SHAMS', raw: '{"markStat":"7"}' }];
    eq(legacyRowOfSource(rows, null), []);
  });

  await t('ردیف هم‌کدِ دانشگاه دیگر نادیده گرفته می‌شود (۱۴۹ تصادف شمس∩آفاق)', () => {
    const rows = [
      { studentCode: '4002239606', sourceCode: 'AFAGH', raw: '{"markStat":"1"}' },
      { studentCode: '4002239606', sourceCode: 'SHAMS', raw: '{"markStat":"7"}' },
    ];
    const shams = legacyRowOfSource(rows, 'SHAMS');
    eq(shams.length, 1);
    eq(JSON.parse(shams[0].raw).markStat, '7', 'کدِ وضعیتِ دانشگاه دیگر مهر شد');
    const afagh = legacyRowOfSource(rows, 'AFAGH');
    eq(JSON.parse(afagh[0].raw).markStat, '1');
    eq(legacyRowOfSource(rows, 'ALLAME').length, 0);
  });

  await t('دروازهٔ ایستا: پیوست کارنامه حتماً sourceCode دارد', () => {
    const src = readFileSync(path.join(HERE, '..', 'src/app/admin/students/actions.ts'), 'utf8');
    ok(src.includes('lg."sourceCode" = ${legacySource}'), 'پیوست lg فاقد فیلتر مبدأ است');
    const eqCount = src.split('eq(legacy_grades.sourceCode, legacySource)').length - 1;
    ok(eqCount >= 2, `دو کوئری مستقیم legacy_grades باید فیلتر مبدأ داشته باشند (${eqCount})`);
    ok(!/\.where\(eq\(legacy_grades\.studentCode, stu\.code\)\)/.test(src), 'کوئری بی‌دامنهٔ legacy_grades باقی مانده');
  });

  await t('دروازهٔ ایستا: enroll-engine کوئری بی‌دامنهٔ courses/academic_terms ندارد', () => {
    for (const f of ['transfer.ts', 'equivalence.ts']) {
      const src = readFileSync(path.join(HERE, '..', 'src/lib/enroll-engine', f), 'utf8');
      ok(!/\.from\(courses\)\s*\.where\(eq\(/.test(src), `${f}: جست‌وجوی درس بدون دامنه`);
      ok(!/\.from\(academic_terms\)\s*\.where\(eq\(academic_terms\.isCurrent/.test(src), `${f}: ترم جاری بدون دانشگاه`);
      ok(!/\.from\(academic_terms\)\s*\.where\(eq\(academic_terms\.termCode/.test(src), `${f}: ترم بدون دامنه`);
    }
  });

  console.log(`\nنتیجه: ${pass} موفق | ${fail} شکست`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
