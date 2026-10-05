#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  ابزار بازبینیِ انسانیِ معادل‌سازی درس — آفاق ⇄ زرینه/علامه/شمس/نژند
 *
 *  تا وقتی آموزش این معادل‌ها را تأیید نکند، هیچ چیزی به کارنامه نوشته نمی‌شود.
 *  این ابزار فقط «پیشنهاد» می‌سازد، CSV بازبینی می‌دهد، تصمیم انسان را ثبت
 *  می‌کند، و گزارش می‌دهد. هیچ مسیری خودکار کارنامه را دست نمی‌زند.
 *
 *  ── نامِ فایل ──
 *  قراردادِ نام‌گذاریِ این ریپو: kebab-case + پسوند mjs برای اسکریپت‌های اجرایی و
 *  یک ماژولِ خالصِ هم‌نام در scripts/lib/ برای منطقِ قابل‌تست (همان الگوی
 *  merge-duplicate-users.mjs ↔ lib/duplicate-user-merge.mjs و
 *  fix-student-nc-v2.mjs ↔ lib/student-nc-repair.mjs). نامِ جدولِ مقصد
 *  course_equivalences است، پس course-equivalence.mjs همان امضا را بدون
 *  ابهام منتقل می‌کند.
 *
 *  ── ایمنی ──
 *  • dev  : postgres://afagh:afagh@localhost:5432/afagh_db  (پیش‌فرض)
 *  • prod : 172.20.0.3:5432 — فقط خواندنی. اتصال با
 *           PGOPTIONS='-c default_transaction_read_only=on' باز می‌شود و در
 *           شروعِ کار روشن بودنش راستی‌آزمایی می‌شود؛ هر فرمانِ نوشتنی رد می‌شود.
 *  • نوشتن در جدولِ course_equivalences فقط با --apply و فقط روی dev.
 *  • اگر جدول نباشد، ساخته نمی‌شود (مالکیتِ مهاجرت با دیگری است) — فقط گزارش می‌شود.
 *
 *  ── نمونه ──
 *    node scripts/course-equivalence.mjs propose --university all
 *    node scripts/course-equivalence.mjs propose --university ZARINE --target prod
 *    node scripts/course-equivalence.mjs export  --out outbox/course-equivalence/review.csv
 *    node scripts/course-equivalence.mjs import  --file ... --decided-by 42
 *    node scripts/course-equivalence.mjs report
 * ══════════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

import {
  MATCH_METHODS,
  METHOD_MANUAL,
  METHOD_RANK,
  METHOD_LABELS_FA,
  DEFAULT_MIN_FUZZY,
  DEFAULT_MIN_CONTAINMENT,
  IMPORT_ACTIONS,
  normTitle,
  titleKey,
  titleTokens,
  tokenJaccard,
  diceBigrams,
  containmentScore,
  markAmbiguity,
  confidenceFor,
  stateOf,
  levelKey,
  majorKey,
  toCsv,
  parseCsv,
  planImport,
} from './lib/course-equivalence.mjs';

const { Pool } = pg;

// ───────────────────────────────────────────────────────────────────────────
//  پیکربندی
// ───────────────────────────────────────────────────────────────────────────

const DEV_URL = process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const PROD_HOST = process.env.AFAGH_PROD_HOST || '172.20.0.3';
const PROD_ENV_FILE = process.env.AFAGH_ENV_FILE || '/root/afagh/.env';

const AFAGH_UNIVERSITY_ID = 1;
const LOCAL_UNIVERSITIES = {
  ZARINE: 2,
  ALLAME: 3,
  SHAMS: 4,
  NAZHAND: 5,
};
const WRITE_COMMANDS = new Set(['propose', 'import']);

// کدهای وضعیت نمره که در src/lib/grade-status-codes.ts «قبول» علامت خورده‌اند
const PASSED_SAMA_CODES = [
  '1', '3', '11', '12', '16', '17', '18', '23', '27', '32', '40', '44', '50', '53', '54',
];

const OUT_DIR = 'outbox/course-equivalence';

// ───────────────────────────────────────────────────────────────────────────
//  کمکی‌های CLI
// ───────────────────────────────────────────────────────────────────────────

const log = (...a) => console.log(...a);
const h1 = (t) => log(`\n${'═'.repeat(78)}\n  ${t}\n${'═'.repeat(78)}`);
const h2 = (t) => log(`\n── ${t} ${'─'.repeat(Math.max(0, 74 - t.length))}`);
const sum = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
        else {
          out[a.slice(2)] = next;
          i++;
        }
      }
    } else out._.push(a);
  }
  return out;
}

function prodPassword() {
  let txt;
  try {
    txt = fs.readFileSync(PROD_ENV_FILE, 'utf8');
  } catch {
    throw new Error(`فایل ${PROD_ENV_FILE} پیدا نشد — رمزِ prod را نمی‌توانم بخوانم.`);
  }
  const m = txt.match(/^POSTGRES_PASSWORD=(.*)$/m);
  if (!m) throw new Error('POSTGRES_PASSWORD در .env پیدا نشد.');
  return m[1].trim();
}

/** اتصال: روی prod اجباراً فقط‌خواندنی، و راستی‌آزماییِ همین موضوع در همان ابتدا. */
async function connect(target) {
  if (target !== 'prod') {
    const pool = new Pool({ connectionString: DEV_URL });
    return { pool, readOnly: false, label: `dev (${DEV_URL.replace(/:[^:@]*@/, ':***@')})` };
  }
  const pw = prodPassword();
  const pool = new Pool({
    host: PROD_HOST,
    port: 5432,
    user: 'afagh',
    password: pw,
    database: 'afagh_db',
    options: '-c default_transaction_read_only=on',
  });
  const chk = await pool.query(`SELECT current_setting('default_transaction_read_only') AS ro`);
  if (chk.rows[0].ro !== 'on') {
    await pool.end();
    throw new Error('اتصال به prod فقط‌خواندنی نشد — ابزار ادامه نمی‌دهد.');
  }
  return { pool, readOnly: true, label: `prod (${PROD_HOST}:5432/afagh_db, فقط‌خواندنی)` };
}

const outPath = (p) => {
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
};

// ───────────────────────────────────────────────────────────────────────────
//  بارگذاریِ داده
// ───────────────────────────────────────────────────────────────────────────

async function loadUniversities(pool) {
  const { rows } = await pool.query(`SELECT id, code, title FROM universities ORDER BY id`);
  return new Map(rows.map((r) => [r.id, r]));
}

async function tableExists(pool, name) {
  const { rows } = await pool.query(`SELECT to_regclass($1) AS t`, [`public.${name}`]);
  return Boolean(rows[0]?.t);
}

async function loadCourses(pool, uniIds) {
  const { rows } = await pool.query(
    `SELECT c.id, c.code, c.title, c."universityId", c."degreeLevelId", c.units, c."courseIsActive"
       FROM courses c WHERE c."universityId" = ANY($1::int[])`,
    [uniIds],
  );
  const byUni = new Map();
  for (const r of rows) {
    if (!byUni.has(r.universityId)) byUni.set(r.universityId, []);
    byUni.get(r.universityId).push(r);
  }
  return byUni;
}

/** کلیدِ نرمالِ درس را یک‌بار حساب می‌کند تا در حلقهٔ تطبیق دوباره محاسبه نشود. */
function prepCourse(c) {
  if (c._t !== undefined) return c;
  if (c._k === undefined) c._k = titleKey(c.title);
  c._t = titleTokens(c.title);
  c._c = normTitle(c.code || '').replace(/\s+/g, '');
  return c;
}

/**
 * تطبیقِ نامزدها، با استفاده از همان تعریفِ روش‌ها ولی روی فرمِ از پیش نرمال‌شده.
 * منطقِ امتیازدهی در lib است؛ این فقط لایهٔ سرعت است.
 */
function candidatesFor(afagh, locals, opts) {
  prepCourse(afagh);
  const minFuzzy = opts.minFuzzy;
  const minContain = opts.minContainment;
  const res = [];
  for (const raw of locals) {
    const l = prepCourse(raw);
    if (!afagh._k || !l._k) continue;
    let method = null;
    let score = null;
    if (afagh._c && l._c && afagh._c === l._c) {
      method = 'CODE_EXACT';
      score = 1;
    } else if (afagh._k === l._k) {
      method = 'TITLE_EXACT';
      score = 1;
    } else {
      const cont = Math.max(containmentScore(l._t, afagh._t), containmentScore(afagh._t, l._t));
      if (cont >= minContain) {
        method = 'TITLE_WORD_CONTAINMENT';
        score = Math.round(cont * 10000) / 10000;
      } else {
        const fz = Math.max(
          tokenJaccard(afagh._t, l._t),
          diceBigrams(afagh._k, l._k),
        );
        if (fz >= minFuzzy) {
          method = 'TITLE_FUZZY';
          score = Math.round(fz * 10000) / 10000;
        }
      }
    }
    if (method) {
      res.push({
        courseIdA: afagh.id,
        codeA: afagh.code,
        titleA: afagh.title,
        courseIdB: l.id,
        codeB: l.code,
        titleB: l.title,
        method,
        methodRank: METHOD_RANK[method],
        score,
      });
    }
  }
  res.sort((x, y) => y.methodRank - x.methodRank || y.score - x.score || x.courseIdB - y.courseIdB);
  return res;
}

/**
 * جمعیتِ آماده‌سازی: دانشجوی آfixtures — به‌اختصار:
 *   دانشجوی آفاق × دانشجوی محلی، روی **users.id یکسان**،
 *   با `degree_level_configs.standardCode` برابر و نامِ رشته (نرمال‌شده) برابر.
 * هر شرطی که به کلیدِ نرمالِ عقب‌نشسته بود، `levelKeySource` شمارش و گزارش می‌شود.
 */
async function loadPopulation(pool, pairBy, relax = {}) {
  const uniIds = [AFAGH_UNIVERSITY_ID, ...Object.values(LOCAL_UNIVERSITIES)];

  const [{ rows: dlcs }, { rows: majors }, { rows: students }] = await Promise.all([
    pool.query(`SELECT id, title, code, "standardCode" FROM degree_level_configs`),
    pool.query(`SELECT id, name FROM majors`),
    pool.query(
      `SELECT s.id, s."userId", s."universityId", s."degreeLevelId", s."majorId", u."nationalCode"
         FROM students s JOIN users u ON u.id = s."userId"
        WHERE s."universityId" = ANY($1::int[])`,
      [uniIds],
    ),
  ]);

  const dlcMap = new Map(dlcs.map((d) => [d.id, levelKey(d)]));
  const majorMap = new Map(majors.map((m) => [m.id, majorKey(m.name)]));

  // نگاشتِ کلیدِ جفت‌شدن → فهرستِ دانشجویانِ آفاق
  const afaghByKey = new Map();
  for (const s of students) {
    if (s.universityId !== AFAGH_UNIVERSITY_ID) continue;
    const k = pairBy === 'nationalCode' ? `nc:${s.nationalCode}` : `uid:${s.userId}`;
    if (!afaghByKey.has(k)) afaghByKey.set(k, []);
    afaghByKey.get(k).push(s);
  }

  const pairsByUni = new Map(); // uniId → [{ af, local }]
  const levelSources = new Map(); // uniId → { STANDARD_CODE: n, TITLE: n }
  const dropped = new Map(); // uniId → { noLevel, noMajor, noPair }

  for (const s of students) {
    if (s.universityId === AFAGH_UNIVERSITY_ID) continue;
    const k = pairBy === 'nationalCode' ? `nc:${s.nationalCode}` : `uid:${s.userId}`;
    const afList = afaghByKey.get(k) || [];
    if (!afList.length) {
      bump(dropped, s.universityId, 'noPair');
      continue;
    }
    if (!pairsByUni.has(s.universityId)) pairsByUni.set(s.universityId, []);
    for (const af of afList) {
      const la = dlcMap.get(af.degreeLevelId);
      const ll = dlcMap.get(s.degreeLevelId);
      if (!la?.key || !ll?.key) {
        bump(dropped, s.universityId, 'noLevel');
        continue;
      }
      if (la.key !== ll.key) {
        bump(dropped, s.universityId, 'levelMismatch');
        if (!relax.level) continue;
      }
      bump(levelSources, s.universityId, la.source);
      const ma = majorMap.get(af.majorId);
      const ml = majorMap.get(s.majorId);
      if (!ma || !ml) {
        bump(dropped, s.universityId, 'noMajor');
        continue;
      }
      if (ma !== ml) {
        bump(dropped, s.universityId, 'majorMismatch');
        if (!relax.major) continue;
      }
      pairsByUni.get(s.universityId).push({ af, local: s });
    }
  }
  return { pairsByUni, levelSources, dropped };
}

const bump = (m, k, f) => {
  if (!m.has(k)) m.set(k, {});
  const o = m.get(k);
  o[f] = (o[f] || 0) + 1;
};

/** درس‌های «قبول‌شده» هر دانشجو، بر پایهٔ همان قاعدهٔ فاز اندازه‌گیری. */
async function loadPassed(pool, studentIds) {
  const { rows } = await pool.query(
    `SELECT e."studentId", o."courseId"
       FROM enrollments e
       JOIN course_offerings o ON o.id = e."offeringId"
       JOIN courses c ON c.id = o."courseId"
      WHERE e."studentId" = ANY($1::int[])
        AND ( e."gradeStatus" IN ('EXEMPTED','EXEMPT','PASSED_NO_GRADE')
           OR ( e."gradeStatus" = 'FINALIZED'
                AND ( e."samaGradeStatusCode" = ANY($2::text[])
                      OR e."gradeValue" >= COALESCE(NULLIF(c."minPassedMark", 0), 10) ) ) )`,
    [studentIds, PASSED_SAMA_CODES],
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.studentId)) m.set(r.studentId, new Set());
    m.get(r.studentId).add(r.courseId);
  }
  return m;
}

// ───────────────────────────────────────────────────────────────────────────
//  فرمان ۱: propose
// ───────────────────────────────────────────────────────────────────────────

async function cmdPropose(args, conn) {
  const { pool, readOnly, label } = conn;
  const uniArg = String(args.university || 'all').toUpperCase();
  const pairBy = String(args['pair-by'] || 'userId');
  const opts = {
    minFuzzy: args['min-fuzzy'] !== undefined ? Number(args['min-fuzzy']) : DEFAULT_MIN_FUZZY,
    minContainment:
      args['min-containment'] !== undefined ? Number(args['min-containment']) : DEFAULT_MIN_CONTAINMENT,
  };
  const apply = Boolean(args.apply) && !args['dry-run'];

  const targets =
    uniArg === 'ALL'
      ? Object.entries(LOCAL_UNIVERSITIES)
      : Object.entries(LOCAL_UNIVERSITIES).filter(([k]) => k === uniArg);
  if (!targets.length) {
    throw new Error(`--university نامعتبر: ${uniArg} (مجاز: ${Object.keys(LOCAL_UNIVERSITIES).join('|')}|all)`);
  }

  h1(`propose — ${label}`);
  log(`روشِ جفت‌سازیِ دانشجو: ${pairBy}`);
  log(`آستانهٔ فاز تقریبی: ${opts.minFuzzy}   آستانهٔ شامل‌بودن: ${opts.minContainment}`);
  if (readOnly && apply) {
    log('\n⛔ اتصال prod فقط‌خواندنی است؛ --apply نادیده گرفته شد (هیچ نوشتنی انجام نمی‌شود).');
  }

  const hasTable = await tableExists(pool, 'course_equivalences');
  if (!hasTable) {
    log('\n⚠️  جدولِ public.course_equivalences روی این پایگاه‌داده وجود ندارد.');
    log('    ساختنش با من نیست (مالکیتِ مهاجرت با دیگری است). خروجیِ CSV باز هم نوشته می‌شود،');
    log('    ولی نوشتنِ جدول انجام نمی‌شود. پس از اعمالِ مهاجرت دوباره اجرا کنید.');
  } else {
    log(`\nجدولِ course_equivalences موجود است. نوشتن: ${apply ? 'روشن (--apply)' : 'خاموش (حالت برنامه)'}`);
  }

  const unis = await loadUniversities(pool);
  const allUniIds = [AFAGH_UNIVERSITY_ID, ...targets.map(([, id]) => id)];
  const coursesByUni = await loadCourses(pool, allUniIds);
  const afaghCatalog = (coursesByUni.get(AFAGH_UNIVERSITY_ID) || []).map(prepCourse);

  const relax = { major: Boolean(args['relax-major']), level: Boolean(args['relax-level']) };
  if (relax.major || relax.level) {
    log('');
    log('⚠️  حالتِ تشخیصی: شرطِ جمعیتِ آزاد شده است — خروجی برای سنجشِ حساسیت است، نه پیشنهاد.');
    log(`    ${relax.level ? 'فیلترِ مقطع برداشته شد.' : ''}${relax.major ? 'فیلترِ رشته برداشته شد.' : ''}`);
    log('    در این حالت هیچ نوشتنی در جدول انجام نمی‌شود، حتی با --apply.');
  }
  const { pairsByUni, levelSources, dropped } = await loadPopulation(pool, pairBy, relax);

  h2('جمعیتِ آماده‌سازی');
  const totals = {};
  for (const [name, uniId] of targets) {
    const pairs = pairsByUni.get(uniId) || [];
    const students = new Set(pairs.map((p) => p.local.id));
    const afStudents = new Set(pairs.map((p) => p.af.id));
    totals[name] = {
      uniId,
      pairs: pairs.length,
      localStudents: students.size,
      afaghStudents: afStudents.size,
      levels: levelSources.get(uniId) || {},
      dropped: dropped.get(uniId) || {},
    };
    const u = unis.get(uniId);
    log(
      `${name.padEnd(8)} (id=${uniId} ${(u?.title || '').trim()})  pairs=${String(pairs.length).padStart(5)}` +
        `  دانشجو محلی=${String(students.size).padStart(4)}  دانشجوی آفاق=${String(afStudents.size).padStart(4)}`,
    );
    log(`         منبعِ کلیدِ مقطع: ${JSON.stringify(totals[name].levels)}`);
    log(`         حذف‌شده: ${JSON.stringify(totals[name].dropped)}`);
  }

  // ── درس‌های «لازم»: گرفته‌شده در آفاق، غایب در محلی (تشخیص با کلیدِ عنوان) ──
  h2('فیلترِ «لازم» (پاس در آفاق ⇒ غایب در محلی)');
  const neededByUni = new Map(); // uniId → { afCourseId → {students:Set, items:number} }
  let totalItemsAll = 0;
  const afCourseById = new Map(afaghCatalog.map((c) => [c.id, c]));

  for (const [name, uniId] of targets) {
    const pairs = pairsByUni.get(uniId) || [];
    if (!pairs.length) {
      neededByUni.set(uniId, new Map());
      totals[name].items = 0;
      totals[name].afaghCoursesNeeded = 0;
      log(`${name.padEnd(8)}  هیچ جفتی در جمعیت نیست ⇒ ۰ آیتم`);
      continue;
    }
    const localIds = [...new Set(pairs.map((p) => p.local.id))];
    const afIds = [...new Set(pairs.map((p) => p.af.id))];
    const [passedLocal, passedAfagh] = await Promise.all([
      loadPassed(pool, localIds),
      loadPassed(pool, afIds),
    ]);

    const localCourseById = new Map((coursesByUni.get(uniId) || []).map((c) => [c.id, c]));
    const need = new Map(); // afCourseId → {students:Set, items}
    let items = 0;
    for (const p of pairs) {
      const pa = passedAfagh.get(p.af.id) || new Set();
      const pl = passedLocal.get(p.local.id) || new Set();
      const localKeys = new Set(
        [...pl].map((cid) => localCourseById.get(cid)).filter(Boolean).map((c) => c._k ?? (c._k = titleKey(c.title))),
      );
      for (const cid of pa) {
        const c = afCourseById.get(cid);
        if (!c) continue;
        if (localKeys.has(titleKey(c.title))) continue; // عملاً پاس شده
        items++;
        if (!need.has(cid)) need.set(cid, { students: new Set(), items: 0 });
        const e = need.get(cid);
        e.students.add(p.local.id);
        e.items++;
      }
    }
    neededByUni.set(uniId, need);
    totals[name].items = items;
    totals[name].afaghCoursesNeeded = need.size;
    totalItemsAll += items;
    log(
      `${name.padEnd(8)}  آیتم‌های رکوردنشده=${String(items).padStart(5)}` +
        `  درس‌های آفاقِ متمایز=${String(need.size).padStart(5)}`,
    );
  }

  // ── نامزدیابی + پرچم ابهام ──
  h2('نامزدها');
  const allRows = [];
  for (const [name, uniId] of targets) {
    const need = neededByUni.get(uniId) || new Map();
    const localCatalog = (coursesByUni.get(uniId) || []).map(prepCourse);
    const afaghNeeded = afaghCatalog.filter((c) => need.has(c.id));

    // بدون فیلترِ «لازم» چند نامزد داشتیم؟ (برای گزارشِ میزانِ کوچک‌شدن)
    const unfilteredMerged = [];
    for (const a of afaghCatalog) {
      unfilteredMerged.push(...candidatesFor(a, localCatalog, opts));
    }

    const merged = [];
    for (const a of afaghNeeded) {
      merged.push(...candidatesFor(a, localCatalog, opts));
    }
    const flagged = markAmbiguity(merged);

    for (const a of afaghNeeded) {
      const info = need.get(a.id);
      const mine = flagged.filter((c) => c.courseIdA === a.id);
      for (const c of mine) {
        allRows.push({
          university_id_a: AFAGH_UNIVERSITY_ID,
          course_id_a: c.courseIdA,
          course_code_a: c.codeA,
          course_title_a: c.titleA,
          university_b: name,
          university_id_b: uniId,
          course_id_b: c.courseIdB,
          course_code_b: c.codeB,
          course_title_b: c.titleB,
          match_method: c.method,
          match_score: c.score,
          confidence: confidenceFor(c.method, c.score),
          ambiguous: c.ambiguous ? 'YES' : 'no',
          ambiguity_reasons: c.ambiguityReasons.join('|'),
          candidate_count: c.candidateCount,
          competing_candidates: c.competingCandidates.join(' || '),
          competing_course_ids_a: c.competingCourseIdsA.join('|'),
          affected_students: info ? info.students.size : 0,
          affected_items: info ? info.items : 0,
          state: 'PROPOSED',
          decided_by: '',
          decided_at: '',
          rejected: 0,
          decided_reason: '',
          rank: c.rank,
          review_decision: 'PENDING',
          review_match_method: '',
          review_course_id_b: '',
          review_confidence: '',
          review_reason: '',
        });
      }
    }
    const amb = flagged.filter((c) => c.ambiguous).length;
    const contested = new Set(flagged.filter((c) => c.competingCourseIdsA.length).map((c) => c.courseIdB));
    const maxFanOut = flagged.reduce((m, c) => Math.max(m, c.candidateCount), 0);
    const maxFanIn = flagged.reduce(
      (m, c) => Math.max(m, c.competingCourseIdsA.length + (c.competingCourseIdsA.length ? 1 : 0)),
      0,
    );
    totals[name].proposed = flagged.length;
    totals[name].ambiguous = amb;
    totals[name].contestedLocal = contested.size;
    totals[name].maxFanOut = maxFanOut;
    totals[name].maxFanIn = maxFanIn;
    totals[name].afCoursesWithCandidates = new Set(flagged.map((c) => c.courseIdA)).size;
    totals[name].localCoursesClaimed = new Set(flagged.map((c) => c.courseIdB)).size;
    totals[name].pairsWithoutNeededFilter = unfilteredMerged.length;

    log(
      `${name.padEnd(8)}  پیشنهاد=${String(flagged.length).padStart(5)}` +
        `  مبهم=${String(amb).padStart(5)}  درس محلیِ مورد مناقشه=${String(contested.size).padStart(4)}` +
        `  بیشینه واگرایی=${maxFanOut}  بیشینه رقابت مقصد=${maxFanIn}`,
    );
    const byMethod = {};
    for (const c of flagged) byMethod[c.method] = (byMethod[c.method] || 0) + 1;
    log(`         روش‌ها: ${MATCH_METHODS.map((m) => `${m}=${byMethod[m] || 0}`).join('  ')}`);
    const unproposed = afaghNeeded.length - totals[name].afCoursesWithCandidates;
    log(
      `         درس‌های آفاقِ لازم بدونِ هیچ نامزد محلی: ${unproposed}` +
        ` (کاتالوگ محلی=${localCatalog.length} درس)`,
    );
    totals[name].afCoursesUnmatched = unproposed;
    const shrink = unfilteredMerged.length
      ? (100 * (1 - flagged.length / unfilteredMerged.length)).toFixed(1)
      : '—';
    log(
      `         بدونِ فیلترِ «لازم»: ${unfilteredMerged.length} جفت ⇒ ` +
        `با فیلتر: ${flagged.length} جفت  (کوچک‌شدن ${shrink}٪)`,
    );
  }

  // ── خروجی ──
  h2('خروجی');
  allRows.sort(
    (a, b) =>
      b.affected_students - a.affected_students ||
      String(a.university_b).localeCompare(String(b.university_b)) ||
      (METHOD_RANK[b.match_method] || 0) - (METHOD_RANK[a.match_method] || 0) ||
      b.match_score - a.match_score,
  );
  const outFile = outPath(
    String(args.out || `${OUT_DIR}/propose-${uniArg.toLowerCase()}-${pairBy}.csv`),
  );
  fs.writeFileSync(outFile, toCsv(allRows), 'utf8');
  log(`CSV بازبینی: ${outFile}`);
  log(`سطرها: ${allRows.length}   مبهم: ${allRows.filter((r) => r.ambiguous === 'YES').length}`);

  h2('خلاصه');
  log(
    `  ${'دانشگاه'.padEnd(9)}${'جفت'.padStart(6)}${'آیتم'.padStart(7)}${'درس لازم'.padStart(9)}` +
      `${'پیشنهاد'.padStart(9)}${'مبهم'.padStart(7)}${'بدون نامزد'.padStart(11)}${'بدون فیلتر'.padStart(12)}`,
  );
  for (const [name] of targets) {
    const t = totals[name];
    log(
      `  ${name.padEnd(9)}${String(t.pairs).padStart(6)}${String(t.items).padStart(7)}` +
        `${String(t.afaghCoursesNeeded).padStart(9)}${String(t.proposed).padStart(9)}` +
        `${String(t.ambiguous).padStart(7)}${String(t.afCoursesUnmatched).padStart(11)}` +
        `${String(t.pairsWithoutNeededFilter).padStart(12)}`,
    );
  }
  log(`  ${'همه'.padEnd(9)}${String(sum(targets.map(([n]) => totals[n].pairs))).padStart(6)}` +
    `${String(totalItemsAll).padStart(7)}${String(sum(targets.map(([n]) => totals[n].afaghCoursesNeeded))).padStart(9)}` +
    `${String(allRows.length).padStart(9)}${String(allRows.filter((r) => r.ambiguous === 'YES').length).padStart(7)}` +
    `${String(sum(targets.map(([n]) => totals[n].afCoursesUnmatched))).padStart(11)}` +
    `${String(sum(targets.map(([n]) => totals[n].pairsWithoutNeededFilter))).padStart(12)}`);


  // ── نوشتن در جدول ──
  if (!hasTable) {
    log('\n⛔ نوشتن در جدول انجام نشد: course_equivalences وجود ندارد (ساختنش با من نیست).');
    return 2;
  }
  if (readOnly) {
    log('\nℹ️  اتصال prod فقط‌خواندنی است ⇒ فقط برنامه نمایش داده شد.');
    return 0;
  }
  if (!apply) {
    log('\nℹ️  --apply نیامده ⇒ فقط برنامه (dry-run). برای ثبتِ پیشنهادها --apply بزنید.');
    return 0;
  }
  if (args['relax-major'] || args['relax-level']) {
    log('\n⛔ به‌دلیلِ حالتِ تشخیصی، نوشتن انجام نشد.');
    return 2;
  }
  const written = await upsertProposals(pool, allRows);
  log(`\n✓ در course_equivalences نوشته شد: ${written.inserted} تازه، ${written.updated} به‌روزرسانی.`);
  return 0;
}

/**
 * upsert روی کلیدِ یکتای ۴ستونی.
 * نکتهٔ مهم: decidedBy/decidedAt عمداً در ستونِ UPDATE نیستند تا اجرای دوبارهٔ propose
 * تصمیمِ انسان را پاک نکند. فقط بازوی «هنوز بی‌تصمیم» به‌روزرسانی می‌شود.
 */
async function upsertProposals(pool, rows) {
  let inserted = 0;
  let updated = 0;
  const sql = `INSERT INTO course_equivalences
      ("universityIdA","courseIdA","universityIdB","courseIdB",
       "matchMethod","matchScore",confidence,"decidedBy","decidedAt",rejected,"decidedReason")
     VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,0,NULL)
     ON CONFLICT ("universityIdA","courseIdA","universityIdB","courseIdB") DO UPDATE
       SET "matchMethod" = EXCLUDED."matchMethod",
           "matchScore"  = EXCLUDED."matchScore",
           confidence     = EXCLUDED.confidence
       WHERE course_equivalences."decidedAt" IS NULL
     RETURNING (xmax = 0) AS was_insert`;
  for (const r of rows) {
    const res = await pool.query(sql, [
      r.university_id_a,
      r.course_id_a,
      r.university_id_b,
      r.course_id_b,
      r.match_method,
      r.match_score,
      r.confidence,
    ]);
    if (res.rows[0]?.was_insert) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

// ───────────────────────────────────────────────────────────────────────────
//  فرمان ۲: export
// ───────────────────────────────────────────────────────────────────────────

async function cmdExport(args, conn) {
  const { pool, label } = conn;
  h1(`export — ${label}`);
  const hasTable = await tableExists(pool, 'course_equivalences');
  if (!hasTable) {
    log('');
    log('⚠️  جدولِ public.course_equivalences روی این پایگاه‌داده وجود ندارد ⇒ چیزی برای برون‌بری نیست.');
    log('    ساختنش با من نیست (مالکیتِ مهاجرت با دیگری است). پس از اعمالِ مهاجرت،');
    log('    `propose --apply` و بعد `export` را اجرا کنید.');
    return 2;
  }
  const { rows } = await pool.query(
    `SELECT e.id, e."universityIdA", e."courseIdA", e."universityIdB", e."courseIdB",
            e."matchMethod", e."matchScore", e.confidence, e."decidedBy", e."decidedAt",
            e.rejected, e."decidedReason", e."createdAt",
            ca.code AS code_a, ca.title AS title_a, cb.code AS code_b, cb.title AS title_b
       FROM course_equivalences e
       JOIN courses ca ON ca.id = e."courseIdA"
       JOIN courses cb ON cb.id = e."courseIdB"
      ORDER BY e."universityIdB", e."decidedAt" NULLS FIRST, e.id`,
  );
  const unis = await loadUniversities(pool);
  const out = rows.map((r) => ({
    university_id_a: r.universityIdA,
    course_id_a: r.courseIdA,
    course_code_a: r.code_a,
    course_title_a: r.title_a,
    university_b: (unis.get(r.universityIdB)?.code || '').trim(),
    university_id_b: r.universityIdB,
    course_id_b: r.courseIdB,
    course_code_b: r.code_b,
    course_title_b: r.title_b,
    match_method: r.matchMethod,
    match_score: r.matchScore,
    confidence: r.confidence,
    ambiguous: '',
    ambiguity_reasons: '',
    candidate_count: '',
    competing_candidates: '',
    competing_course_ids_a: '',
    affected_students: '',
    affected_items: '',
    state: stateOf(r),
    decided_by: r.decidedBy ?? '',
    decided_at: r.decidedAt ? new Date(r.decidedAt).toISOString() : '',
    rejected: r.rejected,
    decided_reason: r.decidedReason ?? '',
    rank: '',
    review_decision: stateOf(r) === 'PROPOSED' ? 'PENDING' : stateOf(r) === 'APPROVED' ? 'APPROVE' : 'REJECT',
    review_match_method: r.matchMethod,
    review_course_id_b: r.courseIdB,
    review_confidence: r.confidence ?? '',
    review_reason: r.decidedReason ?? '',
  }));
  const file = outPath(String(args.out || `${OUT_DIR}/review.csv`));
  fs.writeFileSync(file, toCsv(out), 'utf8');
  log(`سطرهای جدول: ${rows.length}`);
  log(`CSV: ${file}`);
  log('\nستون‌های قابل‌ویرایش: review_decision (APPROVE/REJECT/PENDING)، review_match_method،');
  log('review_course_id_b (برای MANUAL)، review_confidence، review_reason.');
  return 0;
}

// ───────────────────────────────────────────────────────────────────────────
//  فرمان ۳: import
// ───────────────────────────────────────────────────────────────────────────

async function cmdImport(args, conn) {
  const { pool, readOnly, label } = conn;
  h1(`import — ${label}`);
  if (!args.file) throw new Error('--file <csv> لازم است');
  const file = path.isAbsolute(String(args.file)) ? String(args.file) : path.join(process.cwd(), String(args.file));
  const csv = fs.readFileSync(file, 'utf8');
  const rows = parseCsv(csv);
  log(`فایل: ${file}`);
  log(`سطرهای خوانده‌شده: ${rows.length}`);

  if (readOnly) {
    log('\n⛔ اتصال prod فقط‌خواندنی است؛ import مجاز نیست (تصمیمِ انسانی باید روی dev ثبت شود).');
    return 3;
  }
  const hasTable = await tableExists(pool, 'course_equivalences');
  if (!hasTable) {
    log('\n⚠️  جدولِ course_equivalences وجود ندارد؛ چیزی نوشته نشد (ساختنش با من نیست).');
    return 2;
  }

  const decidedBy = args['decided-by'] !== undefined ? Number(args['decided-by']) : null;
  let userExists = null;
  if (decidedBy) {
    const u = await pool.query(`SELECT id FROM users WHERE id = $1`, [decidedBy]);
    userExists = u.rows.length > 0;
    if (!userExists) {
      log(`\n⛔ users.id=${decidedBy} وجود ندارد ⇒ هیچ تصمیمی ثبت نشد.`);
      return 4;
    }
    log(`decidedBy = ${decidedBy} (${u.rows[0].id})`);
  }

  const { rows: existing } = await pool.query(
    `SELECT id, "universityIdA", "courseIdA", "universityIdB", "courseIdB", "matchMethod",
            "matchScore", confidence, "decidedBy", "decidedAt", rejected, "decidedReason"
       FROM course_equivalences`,
  );
  const existingByKey = new Map();
  for (const r of existing) {
    existingByKey.set(
      `${r.universityIdA}:${r.courseIdA}:${r.universityIdB}:${r.courseIdB}`,
      r,
    );
  }

  // مرجع‌های درس، برای راستی‌آزماییِ کلیدِ خارجی و مالکیتِ دانشگاه
  const { rows: courseRefs } = await pool.query(`SELECT id, "universityId" FROM courses`);
  const courseUni = new Map(courseRefs.map((c) => [c.id, c.universityId]));

  const plan = planImport(rows, existingByKey, { decidedBy, userExists });
  const counts = {};
  for (const p of plan) counts[p.action] = (counts[p.action] || 0) + 1;

  h2('برنامهٔ اعمال');
  for (const a of Object.keys(IMPORT_ACTIONS)) {
    if (counts[a]) log(`  ${a.padEnd(7)} ${counts[a]}`);
  }
  const errs = plan.filter((p) => p.action === IMPORT_ACTIONS.ERROR);
  if (errs.length) {
    h2('سطرهای نامعتبر (نوشته نمی‌شوند)');
    for (const e of errs.slice(0, 40)) log(`  سطر ${e.line}: ${e.errors.join(' · ')}`);
    if (errs.length > 40) log(`  … و ${errs.length - 40} سطر دیگر`);
  }
  const flips = plan.filter((p) => p.action === IMPORT_ACTIONS.FLIP);
  if (flips.length) {
    h2('⚠️  تغییرِ تصمیمِ قبلی (اعمال نمی‌شود مگر با --allow-flip)');
    for (const f of flips.slice(0, 40)) {
      log(
        `  سطر ${f.line}: ${f.existing.matchMethod}/rejected=${f.existing.rejected} ⇒ ` +
          `${f.normalized.matchMethod}/rejected=${f.normalized.rejected}`,
      );
    }
    if (flips.length > 40) log(`  … و ${flips.length - 40} سطر دیگر`);
  }

  const apply = Boolean(args.apply);
  if (!apply) {
    log('\nℹ️  --apply نیامده ⇒ فقط برنامه (dry-run).');
    return errs.length ? 5 : 0;
  }

  let done = 0;
  for (const p of plan) {
    if (p.action === IMPORT_ACTIONS.ERROR || p.action === IMPORT_ACTIONS.SKIP) continue;
    if (p.action === IMPORT_ACTIONS.FLIP && !args['allow-flip']) continue;
    if (p.action === IMPORT_ACTIONS.NOOP) continue;

    const n = p.normalized;
    if (n.courseIdB == null) continue;
    if (!courseUni.has(n.courseIdA)) {
      log(`  ⛔ سطر ${p.line}: courses.id=${n.courseIdA} وجود ندارد — رد شد.`);
      continue;
    }
    if (!courseUni.has(n.courseIdB)) {
      log(`  ⛔ سطر ${p.line}: courses.id=${n.courseIdB} وجود ندارد — رد شد.`);
      continue;
    }
    if (courseUni.get(n.courseIdB) !== n.universityIdB) {
      log(
        `  ⛔ سطر ${p.line}: درس ${n.courseIdB} متعلق به دانشگاه ${courseUni.get(n.courseIdB)} است، ` +
          `نه ${n.universityIdB} — رد شد.`,
      );
      continue;
    }
    if (n.universityIdA === n.universityIdB) {
      log(`  ⛔ سطر ${p.line}: معادل باید بین دو دانشگاهِ متفاوت باشد — رد شد.`);
      continue;
    }

    if (p.action === IMPORT_ACTIONS.INSERT) {
      await pool.query(
        `INSERT INTO course_equivalences
           ("universityIdA","courseIdA","universityIdB","courseIdB",
            "matchMethod","matchScore",confidence,"decidedBy","decidedAt",rejected,"decidedReason")
         VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,now(),$8,$9)
         ON CONFLICT ("universityIdA","courseIdA","universityIdB","courseIdB") DO UPDATE
           SET "matchMethod" = EXCLUDED."matchMethod",
               "matchScore"  = NULL,
               confidence     = EXCLUDED.confidence,
               "decidedBy"   = EXCLUDED."decidedBy",
               "decidedAt"   = now(),
               rejected      = EXCLUDED.rejected,
               "decidedReason" = EXCLUDED."decidedReason"`,
        [
          n.universityIdA,
          n.courseIdA,
          n.universityIdB,
          n.courseIdB,
          n.matchMethod,
          n.confidence,
          decidedBy,
          n.rejected,
          n.decidedReason,
        ],
      );
    } else {
      await pool.query(
        `UPDATE course_equivalences
            SET "matchMethod" = $5,
                "matchScore"  = NULL,
                confidence     = $6,
                "decidedBy"   = $7,
                "decidedAt"   = now(),
                rejected      = $8,
                "decidedReason" = $9
          WHERE id = $1 AND "universityIdB" = $2 AND "courseIdB" = $3 AND "courseIdA" = $4`,
        [
          p.existing.id,
          n.universityIdB,
          n.courseIdB,
          n.courseIdA,
          n.matchMethod,
          n.confidence,
          decidedBy,
          n.rejected,
          n.decidedReason,
        ],
      );
    }
    done++;
  }
  log(`\n✓ اعمال شد: ${done} سطر.`);
  return errs.length ? 5 : 0;
}

// ───────────────────────────────────────────────────────────────────────────
//  فرمان ۴: report
// ───────────────────────────────────────────────────────────────────────────

async function cmdReport(args, conn) {
  const { pool, label } = conn;
  h1(`report — ${label}`);
  const hasTable = await tableExists(pool, 'course_equivalences');
  const { pairsByUni, levelSources, dropped } = await loadPopulation(
    pool,
    String(args['pair-by'] || 'userId'),
    { major: Boolean(args['relax-major']), level: Boolean(args['relax-level']) },
  );
  const unis = await loadUniversities(pool);
  const coursesByUni = await loadCourses(pool, [
    AFAGH_UNIVERSITY_ID,
    ...Object.values(LOCAL_UNIVERSITIES),
  ]);

  const population = {};
  for (const [name, uniId] of Object.entries(LOCAL_UNIVERSITIES)) {
    const pairs = pairsByUni.get(uniId) || [];
    population[name] = {
      universityId: uniId,
      pairs: pairs.length,
      distinctLocalStudents: new Set(pairs.map((p) => p.local.id)).size,
      distinctAfaghStudents: new Set(pairs.map((p) => p.af.id)).size,
      levelKeySource: levelSources.get(uniId) || {},
      dropped: dropped.get(uniId) || {},
    };
  }

  if (!hasTable) {
    log('\n⚠️  جدولِ course_equivalences وجود ندارد ⇒ شمارشِ تصمیم‌ها صفر است.');
    const out = { population, equivalences: null, unblockable: null };
    if (args.json) log(JSON.stringify(out, null, 2));
    else {
      h2('جمعیت');
      for (const [n, p] of Object.entries(population)) {
        log(
          `${n.padEnd(8)} pairs=${String(p.pairs).padStart(5)}  دانشجو محلی=${String(p.distinctLocalStudents).padStart(5)}` +
            `  منبع مقطع=${JSON.stringify(p.levelKeySource)}`,
        );
      }
    }
    return 2;
  }

  const { rows } = await pool.query(
    `SELECT "universityIdB" ub, "matchMethod" mm, rejected, "decidedAt",
            count(*)::int n,
            count(*) FILTER (WHERE "decidedAt" IS NULL)::int proposed,
            count(*) FILTER (WHERE "decidedAt" IS NOT NULL AND rejected = 0)::int approved,
            count(*) FILTER (WHERE rejected = 1)::int rejected_n
       FROM course_equivalences
      GROUP BY 1,2,3,4`,
  );

  const agg = {
    byUniversity: {},
    byMethod: {},
    byState: { PROPOSED: 0, APPROVED: 0, REJECTED: 0 },
    total: 0,
  };
  for (const r of rows) {
    const code = (unis.get(r.ub)?.code || String(r.ub)).trim();
    agg.byUniversity[code] ??= { total: 0, PROPOSED: 0, APPROVED: 0, REJECTED: 0 };
    const st = r.rejected === 1 ? 'REJECTED' : r.decidedAt ? 'APPROVED' : 'PROPOSED';
    agg.byUniversity[code][st] += r.n;
    agg.byUniversity[code].total += r.n;
    agg.byMethod[r.mm] = (agg.byMethod[r.mm] || 0) + r.n;
    agg.byState[st] += r.n;
    agg.total += r.n;
  }

  // ── چند آیتمِ رکوردنشدهٔ دانشجو را هر معادلِ تأییدشده باز می‌کند؟ ──
  const { rows: approved } = await pool.query(
    `SELECT "universityIdB" ub, "courseIdA" ca, count(*)::int n
       FROM course_equivalences
      WHERE rejected = 0 AND "decidedAt" IS NOT NULL
      GROUP BY 1,2`,
  );
  const unblock = await computeUnblockable(pool, approved, pairsByUni, coursesByUni);

  h2('جمعیتِ آماده‌سازی');
  for (const [n, p] of Object.entries(population)) {
    log(
      `${n.padEnd(8)} pairs=${String(p.pairs).padStart(5)}  دانشجو محلی=${String(p.distinctLocalStudents).padStart(5)}` +
        `  دانشجوی آفاق=${String(p.distinctAfaghStudents).padStart(5)}`,
    );
    log(`         منبعِ کلیدِ مقطع: ${JSON.stringify(p.levelKeySource)}`);
    log(`         حذف‌شده: ${JSON.stringify(p.dropped)}`);
  }

  h2('تصمیم‌ها');
  const methods = [...MATCH_METHODS, METHOD_MANUAL];
  log(`  ${'دانشگاه'.padEnd(10)}${'کل'.padStart(6)}${'پیشنهاد'.padStart(9)}${'تأیید'.padStart(8)}${'رد'.padStart(6)}`);
  for (const code of Object.keys(agg.byUniversity).sort()) {
    const a = agg.byUniversity[code];
    log(
      `  ${code.padEnd(10)}${String(a.total).padStart(6)}${String(a.PROPOSED).padStart(9)}` +
        `${String(a.APPROVED).padStart(8)}${String(a.REJECTED).padStart(6)}`,
    );
  }
  log(
    `  ${'همه'.padEnd(10)}${String(agg.total).padStart(6)}${String(agg.byState.PROPOSED).padStart(9)}` +
      `${String(agg.byState.APPROVED).padStart(8)}${String(agg.byState.REJECTED).padStart(6)}`,
  );

  h2('بر اساسِ روشِ تطبیق');
  for (const m of methods) {
    const n = agg.byMethod[m] || 0;
    if (!n) continue;
    log(`  ${m.padEnd(24)} (${METHOD_LABELS_FA[m] || ''}) ${String(n).padStart(6)}`);
  }
  const unknown = Object.keys(agg.byMethod).filter((m) => !methods.includes(m));
  if (unknown.length) log(`  ⚠️  روش‌های ناشناخته در جدول: ${unknown.join(', ')}`);

  h2('آیتمِ رکوردنشدهٔ که با معادلِ تأییدشده باز می‌شود');
  if (!approved.length) {
    log('  هنوز هیچ معادلی تأیید نشده ⇒ ۰ آیتم باز می‌شود.');
  } else {
    log(`  ${'دانشگاه'.padEnd(10)}${'معادل'.padStart(8)}${'دانشجو'.padStart(9)}${'آیتم'.padStart(8)}`);
    for (const u of unblock.byUni) {
      log(`  ${u.code.padEnd(10)}${String(u.pairs).padStart(8)}${String(u.students).padStart(9)}${String(u.items).padStart(8)}`);
    }
    log(
      `  ${'همه'.padEnd(10)}${String(unblock.pairs).padStart(8)}${String(unblock.students).padStart(9)}${String(unblock.items).padStart(8)}`,
    );
    log(`\n  باقی‌ماندهٔ حل‌نشده: ${unblock.unresolvedItems} آیتم روی ${unblock.unresolvedCourses} درسِ آفاق.`);
  }

  if (args.json) log(JSON.stringify({ population, ...agg, unblockable: unblock }, null, 2));
  return 0;
}

/** با معادلِ تأییدشده، چند (دانشجو، درس) رکوردنشده باز می‌شود؟ */
async function computeUnblockable(pool, approved, pairsByUni, coursesByUni) {
  const out = {
    byUni: [],
    pairs: 0,
    students: 0,
    items: 0,
    unresolvedItems: 0,
    unresolvedCourses: 0,
  };
  if (!approved.length) return out;
  const byUni = new Map();
  for (const a of approved) {
    if (!byUni.has(a.ub)) byUni.set(a.ub, new Map());
    const m = byUni.get(a.ub);
    if (!m.has(a.ca)) m.set(a.ca, 0);
    m.set(a.ca, m.get(a.ca) + 1);
  }
  const unresolvedCourses = new Set();
  let unresolvedItems = 0;

  for (const [uniId, courseMap] of byUni) {
    const pairs = pairsByUni.get(uniId) || [];
    if (!pairs.length) continue;
    const localIds = [...new Set(pairs.map((p) => p.local.id))];
    const afIds = [...new Set(pairs.map((p) => p.af.id))];
    const [passedLocal, passedAfagh] = await Promise.all([
      loadPassed(pool, localIds),
      loadPassed(pool, afIds),
    ]);
    const localCourseById = new Map((coursesByUni.get(uniId) || []).map((c) => [c.id, c]));
    const afCourseById = new Map(
      (coursesByUni.get(AFAGH_UNIVERSITY_ID) || []).map((c) => [c.id, c]),
    );
    let items = 0;
    let pairsHit = 0;
    const studentsHit = new Set();
    for (const p of pairs) {
      const pa = passedAfagh.get(p.af.id) || new Set();
      const pl = passedLocal.get(p.local.id) || new Set();
      const localKeys = new Set(
        [...pl].map((cid) => localCourseById.get(cid)).filter(Boolean).map((c) => titleKey(c.title)),
      );
      let hit = 0;
      for (const cid of pa) {
        const c = afCourseById.get(cid);
        if (!c) continue;
        if (localKeys.has(titleKey(c.title))) continue; // از قبل پاس شده
        if (courseMap.has(cid)) hit++;
        else {
          unresolvedItems++;
          unresolvedCourses.add(`${uniId}:${cid}`);
        }
      }
      if (hit) {
        items += hit;
        pairsHit++;
        studentsHit.add(p.local.id);
      }
    }
    out.byUni.push({
      code: String(uniId),
      pairs: pairsHit,
      students: studentsHit.size,
      items,
    });
    out.pairs += pairsHit;
    out.students += studentsHit.size;
    out.items += items;
  }
  out.unresolvedItems = unresolvedItems;
  out.unresolvedCourses = unresolvedCourses.size;
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
//  راه‌اندازی
// ───────────────────────────────────────────────────────────────────────────

const USAGE = `
کاربرد:
  node scripts/course-equivalence.mjs propose [--university ZARINE|ALLAME|SHAMS|NAZHAND|all]
        [--target dev|prod] [--out FILE] [--pair-by userId|nationalCode]
        [--min-fuzzy 0.85] [--min-containment 0.6] [--apply]
  node scripts/course-equivalence.mjs export  [--target dev|prod] [--out FILE]
  node scripts/course-equivalence.mjs import  --file FILE --decided-by <userId> [--apply] [--allow-flip]
  node scripts/course-equivalence.mjs report [--target dev|prod] [--pair-by userId|nationalCode] [--json]

نکته: بدون --apply هیچ نوشتنی انجام نمی‌شود (حالت برنامه). روی prod فقط خواندن.
`;

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));
  if (!command || command === 'help' || args.help) {
    log(USAGE);
    return 0;
  }
  const target = String(args.target || 'dev').toLowerCase();
  const conn = await connect(target);
  if (conn.readOnly && WRITE_COMMANDS.has(command)) {
    log('ℹ️  حالتِ فقط‌خواندنی: propose به برنامه محدود است و import کلاً رد می‌شود.');
  }
  try {
    let code = 0;
    switch (command) {
      case 'propose':
        code = await cmdPropose(args, conn);
        break;
      case 'export':
        code = await cmdExport(args, conn);
        break;
      case 'import':
        code = await cmdImport(args, conn);
        break;
      case 'report':
        code = await cmdReport(args, conn);
        break;
      default:
        log(`فرمانِ ناشناخته: ${command}`);
        log(USAGE);
        code = 64;
    }
    return code;
  } finally {
    await conn.pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((c) => {
      process.exitCode = c;
    })
    .catch((e) => {
      console.error(`\n✗ خطا: ${e.stack || e.message}`);
      process.exitCode = 1;
    });
}

export {
  cmdPropose,
  cmdExport,
  cmdImport,
  cmdReport,
  candidatesFor,
  prepCourse,
  loadPopulation,
  loadPassed,
  computeUnblockable,
  parseArgs,
};