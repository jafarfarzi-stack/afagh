'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  داشبورد BI ارزشیابی اساتید — سند §۱۳۴۰–۱۳۶۵
 *
 *  الف) پنل اختصاصی استاد (Professor Feedback Panel):
 *    • نمودار رادار: عملکرد استاد در شاخص‌ها نسبت به میانگین کل گروه آموزشی
 *    • روند ترمیک (Trend Line): نمرهٔ ارزشیابی در ترم‌های گذشته (صعودی/نزولی)
 *    • ابر کلمات (Word Cloud): تحلیل متن نظرات تشریحی دانشجویان
 *
 *  ب) داشبورد مدیریتی (مدیر گروه / معاونت آموزشی):
 *    • گلوگاه کیفی: اساتید زیر آستانهٔ بحرانی (پیش‌فرض ۳.۵ از ۵ — system_settings)
 *    • تحلیل امکانات: کلاس‌های نیازمند تعمیر → واحد فنی/تدارکات
 *
 *  گمنامی مطلق: تحلیل فقط روی evaluation_responses (بدون هیچ ارجاع به دانشجو)
 * ══════════════════════════════════════════════════════════════════════
 */
const { db } = require('../db');

/* ─── ابزارها ─── */
// مالکیت ارزشیابی: مدرس اصلی کلاس (راهنما/داورِ مشترک ارزشیابی کلاسِ دیگران را نمی‌بیند)
const PROF_SQL = `(o.professorId = @sid OR EXISTS (SELECT 1 FROM offering_professors op WHERE op.offeringId = o.id AND op.staffId = @sid AND op.role = 'MAIN_LECTURER'))`;

function currentTerm() {
  return db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
}

function flagThreshold() {
  const r = db.prepare(`SELECT value FROM system_settings WHERE key='EVAL_FLAG_THRESHOLD'`).get();
  return Number(r ? r.value : 3.5) || 3.5;
}

/** میانگین وزنی نمرهٔ ارزشیابی برای یک استاد در یک دوره (فرم‌های PROFESSOR) */
function periodScore(staffId, periodId) {
  const r = db.prepare(`
    SELECT SUM(av.s * q.weight) / SUM(q.weight) AS score
    FROM (
      SELECT r.questionId AS qid, AVG(qo.scoreValue) AS s
      FROM evaluation_responses r
      JOIN course_offerings o ON o.id = r.offeringId
      JOIN question_options qo ON qo.id = r.selectedOptionId
      WHERE r.periodId = @pid AND ${PROF_SQL}
      GROUP BY r.questionId
    ) av
    JOIN evaluation_questions q ON q.id = av.qid
    JOIN evaluation_forms f ON f.id = q.formId
    WHERE f.targetType = 'PROFESSOR'`).get({ sid: staffId, pid: periodId });
  return r && r.score != null ? Number(r.score) : null;
}

/** روند ترمیک: نمرهٔ ارزشیابی استاد در ترم‌های دارای داده (حداکثر ۳ ترم اخیر) */
function getTrend(staffId) {
  const periods = db.prepare(`
    SELECT p.id, p.title, t.title AS term, t.startDate FROM evaluation_periods p
    JOIN academic_terms t ON t.id = p.termId ORDER BY t.startDate`).all();
  const out = [];
  for (const p of periods) {
    const score = periodScore(staffId, p.id);
    if (score != null) out.push({ period: p.title, term: p.term, score: Math.round(score * 100) / 100 });
  }
  return out.slice(-3); // ۳ ترم اخیر (سند §۱۳۴۷)
}

/* ─── ابر کلمات (Text Analytics — سند §۱۳۴۸) ─── */
const STOPWORDS = new Set([
  'و','به','از','که','در','این','آن','با','را','برای','است','بود','شد','هم','نیز','تا','یا','اما',
  'خیلی','بسیار','بر','دارد','می','های','یک','دو','سه','من','او','ما','شما','کنند','می‌شود','بودن',
  'باید','نمی','کنم','کرد','کردم','کنند','مورد','همه','چون','اگر','روی','بی','هر','چه','را'
]);
function tokenize(text) {
  return String(text || '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .split(/[^\u0600-\u06FF\u200c]+/)
    .map(w => w.replace(/^\u200c+|\u200c+$/g, ''))
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}
function wordCloud(staffId) {
  const rows = db.prepare(`
    SELECT r.textAnswer AS t FROM evaluation_responses r
    JOIN course_offerings o ON o.id = r.offeringId
    JOIN evaluation_questions q ON q.id = r.questionId
    JOIN evaluation_forms f ON f.id = q.formId
    WHERE r.textAnswer IS NOT NULL AND q.questionType = 'TEXT' AND f.targetType = 'PROFESSOR' AND ${PROF_SQL}`)
    .all({ sid: staffId });
  const freq = new Map();
  for (const row of rows) for (const w of tokenize(row.t)) freq.set(w, (freq.get(w) || 0) + 1);
  return [...freq.entries()].map(([w, c]) => ({ w, c })).sort((a, b) => b.c - a.c).slice(0, 18);
}

/* ─── الف) پنل اختصاصی استاد (سند §۱۳۵۰) ─── */
function professorPanel(staffId) {
  const term = currentTerm();
  const st = db.prepare(`
    SELECT u.firstName || ' ' || u.lastName AS name, s.academicRank AS rank, s.departmentId AS dep
    FROM staff s JOIN users u ON u.id = s.userId WHERE s.id = ?`).get(staffId);
  if (!st) throw new Error('استاد یافت نشد.');
  const period = db.prepare(`SELECT * FROM evaluation_periods WHERE isActive = 1 AND datetime('now') BETWEEN startDate AND endDate`).get()
    || db.prepare(`SELECT * FROM evaluation_periods WHERE termId = ? ORDER BY id DESC LIMIT 1`).get(term.id);

  // محورهای رادار: سوالات تستی فرم‌های PROFESSOR که برای کلاس‌های جاری این استاد پاسخ دارند
  const axesRows = db.prepare(`
    SELECT q.id, q.axisLabel, q.weight,
           AVG(CASE WHEN ${PROF_SQL} THEN qo.scoreValue END) AS mine,
           AVG(CASE WHEN o.professorId IN (SELECT s2.id FROM staff s2 WHERE s2.departmentId = @dep) THEN qo.scoreValue END) AS dept
    FROM evaluation_responses r
    JOIN course_offerings o ON o.id = r.offeringId
    JOIN evaluation_questions q ON q.id = r.questionId
    JOIN evaluation_forms f ON f.id = q.formId
    JOIN question_options qo ON qo.id = r.selectedOptionId
    WHERE r.periodId = @pid AND f.targetType = 'PROFESSOR' AND q.questionType = 'SINGLE_CHOICE'
      AND o.termId = @term AND q.axisLabel IS NOT NULL
    GROUP BY q.id, q.axisLabel ORDER BY q.id`).all({ sid: staffId, pid: period.id, term: term.id, dep: st.dep });

  // ادغام محورهای هم‌نام از فرم‌های نظری/عملی (میانگین وزنی به‌تناسب تعداد پاسخ)
  const merged = new Map();
  for (const r of axesRows) {
    if (r.mine == null) continue;
    const n = db.prepare(`SELECT COUNT(*) AS c FROM evaluation_responses r2
      JOIN course_offerings o ON o.id = r2.offeringId AND o.termId = @term
      WHERE r2.periodId = @pid AND r2.questionId = @qid AND ${PROF_SQL}`)
      .get({ sid: staffId, pid: period.id, term: term.id, qid: r.id }).c;
    const cur = merged.get(r.axisLabel) || { label: r.axisLabel, wm: 0, wd: 0, n: 0 };
    cur.wm += Number(r.mine) * n; cur.wd += Number(r.dept) * n; cur.n += n;
    merged.set(r.axisLabel, cur);
  }
  const axes = [...merged.values()].map(a => ({
    label: a.label, weight: a.n,
    mine: Math.round(a.wm / a.n * 100) / 100,
    dept: Math.round(a.wd / a.n * 100) / 100
  }));

  const trend = getTrend(staffId);
  const score = trend.length ? trend[trend.length - 1].score : null;
  const words = wordCloud(staffId);
  const respondents = db.prepare(`
    SELECT COUNT(*) AS c FROM evaluation_responses r
    JOIN course_offerings o ON o.id = r.offeringId
    JOIN evaluation_questions q ON q.id = r.questionId
    WHERE r.periodId = @pid AND q.questionType = 'SINGLE_CHOICE' AND o.termId = @term AND ${PROF_SQL}`)
    .get({ sid: staffId, pid: period.id, term: term.id }).c;

  return {
    professor: st, term: term.title, period: period.title,
    axes, trend, words, score, respondents,
    deptAvg: axes.length ? Math.round(axes.reduce((a, x) => a + x.dept, 0) / axes.length * 100) / 100 : null,
    threshold: flagThreshold(), flagged: score != null ? score < flagThreshold() : false
  };
}

/* ─── ب) داشبورد مدیریتی: گلوگاه کیفی (سند §۱۳۵۵) ─── */
function managementOverview() {
  const term = currentTerm();
  const threshold = flagThreshold();
  const period = db.prepare(`SELECT * FROM evaluation_periods WHERE termId = ? ORDER BY isActive DESC, id DESC LIMIT 1`).get(term.id);
  const staffList = db.prepare(`
    SELECT DISTINCT s.id, u.firstName || ' ' || u.lastName AS name, s.academicRank AS rank
    FROM staff s JOIN users u ON u.id = s.userId
    JOIN course_offerings o ON o.professorId = s.id
    WHERE o.termId = ? ORDER BY s.id`).all(term.id);

  const list = [];
  for (const st of staffList) {
    const trend = getTrend(st.id);
    if (!trend.length) continue;
    const score = trend[trend.length - 1].score;
    const prev = trend.length > 1 ? trend[trend.length - 2].score : null;
    const respondents = db.prepare(`
      SELECT COUNT(*) AS c FROM evaluation_responses r
      JOIN course_offerings o ON o.id = r.offeringId
      JOIN evaluation_questions q ON q.id = r.questionId
      WHERE r.periodId = ? AND q.questionType = 'SINGLE_CHOICE' AND o.termId = ? AND o.professorId = ?`)
      .get(period.id, term.id, st.id).c;
    list.push({
      staffId: st.id, name: st.name, rank: st.rank, score, prevScore: prev,
      delta: prev != null ? Math.round((score - prev) * 100) / 100 : null,
      trend, respondents, flagged: score < threshold
    });
  }
  list.sort((a, b) => a.score - b.score); // بدترین رکورد اول
  return { term: term.title, period: period.title, threshold, flaggedCount: list.filter(x => x.flagged).length, list };
}

/* ─── ب‌۲) تحلیل امکانات: کلاس‌های نیازمند تعمیر (سند §۱۳۵۷) ─── */
function facilitiesReport() {
  const term = currentTerm();
  const period = db.prepare(`SELECT * FROM evaluation_periods WHERE termId = ? ORDER BY isActive DESC, id DESC LIMIT 1`).get(term.id);
  const rooms = db.prepare(`
    SELECT DISTINCT cr.id, cr.name, cr.buildingName, cr.roomType FROM classrooms cr
    JOIN schedules sc ON sc.roomId = cr.id AND sc.scheduleType = 'CLASS'
    JOIN course_offerings o ON o.id = sc.offeringId AND o.termId = ?`).all(term.id);

  const out = [];
  for (const room of rooms) {
    const axes = db.prepare(`
      SELECT q.axisLabel AS label, AVG(qo.scoreValue) AS score, COUNT(*) AS n
      FROM evaluation_responses r
      JOIN schedules sc ON sc.offeringId = r.offeringId AND sc.roomId = @room
      JOIN evaluation_questions q ON q.id = r.questionId
      JOIN evaluation_forms f ON f.id = q.formId
      JOIN question_options qo ON qo.id = r.selectedOptionId
      WHERE r.periodId = @pid AND f.targetType = 'FACILITY'
      GROUP BY q.id, q.axisLabel ORDER BY q.id`).all({ room: room.id, pid: period.id });
    if (!axes.length) continue;
    for (const a of axes) a.score = Math.round(Number(a.score) * 100) / 100;
    const worst = axes.reduce((m, a) => (a.score < m.score ? a : m), axes[0]);
    out.push({
      roomId: room.id, room: room.name, building: room.buildingName, type: room.roomType,
      axes, worstAxis: worst.label, worstScore: worst.score,
      needsRepair: axes.some(a => a.score < 3),
      offerings: db.prepare(`
        SELECT DISTINCT c.code FROM schedules sc
        JOIN course_offerings o ON o.id = sc.offeringId
        JOIN courses c ON c.id = o.courseId
        WHERE sc.roomId = ? AND sc.scheduleType = 'CLASS' AND o.termId = ?`).all(room.id, term.id).map(r => r.code)
    });
  }
  out.sort((a, b) => a.worstScore - b.worstScore);
  return { term: term.title, rooms: out, needsRepairCount: out.filter(r => r.needsRepair).length };
}

module.exports = { professorPanel, managementOverview, facilitiesReport };
