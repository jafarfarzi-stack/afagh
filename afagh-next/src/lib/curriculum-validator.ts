// ════════════════════════════════════════════════════════════════════════
// فاز ۳ — هستهٔ اعتبارسنجی برنامهٔ درسی (Pure — بدون DB، قابل تست در CI)
// ────────────────────────────────────────────────────────────────────────
// این ماژول «گیت واقعی» تأیید است (پاسخ به بند ۶ بازبینی: هیچ ✓ ثابتی در UI؛
// خروجی، نتیجهٔ محاسبه از داده‌هاست). چک‌های زیر از همان ابتدا در
// submitForApproval اجرا می‌شوند؛ چک‌های تکمیلی فاز ۴ (SEMESTER_LOAD،
// COURSE_TYPES_COMPLETE، TRACK_INTEGRITY، EQUIVALENCY_DISJOINT) به همین
// ساختار اضافه خواهند شد — قرارداد CheckResult همین است.
// ════════════════════════════════════════════════════════════════════════

import type { CheckResult, LogicNode } from './curriculum-types';

/** ورودی خالص ارزیابی — Actions داده را از DB بارگیری و پاس می‌دهند */
export interface CurriculumCheckInput {
  totalRequiredUnits: number;
  /** سقف واحد هر ترم (override نسخه یا مقطع) — null/تعریف‌نشده = بدون سقف (چک SEMESTER_LOAD رد می‌شود) */
  maxUnitsPerTerm?: number | null;
  /** گرایشِ نسخه — برای چک یکپارچگی گرایش (null = گرایش آزاد) */
  trackId?: number | null;
  /** کد نسخه — فقط برای پیام‌های خوانا */
  versionCode?: string;
  /** حداقل تعداد مقرر از هر نقش (خالی = چک ترکیب نقش‌ها اجرا نمی‌شود) */
  minRoleCounts?: Partial<Record<string, number>>;
  /** دروسِ نسخه به‌همراه مشخصات بانک (units: واحد مؤثر — override نسخه یا درس) */
  courses: {
    courseId: number;
    code: string;
    title: string;
    units: number;
    roleType: string;
    isRequired: number;
    isElective: number;
    isGraduationRequired: number;
    recommendedSemester: number | null;
    autoCorequisiteAllowed: number;
    clusterId: number | null; // خوشهٔ هم‌ارزی (NULL = درس مستقل)
  }[];
  /** قواعدِ مقیّد به همین نسخه (course_rules.syllabusId = نسخه) */
  rules: {
    courseId: number;
    ruleType: string;
    logicTree: LogicNode;
  }[];
  /** کدهای موجود در بانک دروس (courses.code) */
  existingCodes: Set<string>;
}

const err = (check: string, message: string, affected: (string | number)[] = []): CheckResult => ({
  check, severity: 'ERROR', message, affected,
});
const warn = (check: string, message: string, affected: (string | number)[] = []): CheckResult => ({
  check, severity: 'WARN', message, affected,
});

/** برگ‌های درخت (course و unitsPassed) — پیمایش عمق‌نخست */
function leafCourseCodes(node: LogicNode | null | undefined, out: string[] = []): string[] {
  if (!node) return out;
  for (const c of node.conditions ?? []) {
    if (c.operator) leafCourseCodes(c as LogicNode, out);
    else if (c.course) out.push(c.course);
  }
  return out;
}

/** لبه‌های گراف پیش‌نیاز: پیش‌نیاز → درسِ وابسته (بر اساس کد درس) */
function prereqEdges(input: CurriculumCheckInput): { prereq: string; dependent: string }[] {
  const byCourseId = new Map(input.courses.map((c) => [c.courseId, c.code]));
  const edges: { prereq: string; dependent: string }[] = [];
  for (const r of input.rules) {
    if (r.ruleType !== 'PREREQ') continue;
    const dependent = byCourseId.get(r.courseId);
    if (!dependent) continue; // قاعدهٔ درسِ خارج از نسخه — توسط چک ۲ رصد می‌شود
    for (const prereq of leafCourseCodes(r.logicTree)) edges.push({ prereq, dependent });
  }
  return edges;
}

/** تشخیص دور در گراف جهت‌دار (DFS با سه‌رنگ) — خالص و امن برای درخت‌های عمیق */
function hasCycle(nodes: Set<string>, edges: { prereq: string; dependent: string }[]): string | null {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.prereq)) adj.set(e.prereq, []);
    adj.get(e.prereq)!.push(e.dependent);
  }
  const color = new Map<string, 0 | 1 | 2>();
  const cycle: string[] = [];
  const dfs = (u: string): boolean => {
    color.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      if (!nodes.has(v)) continue;
      const c = color.get(v) ?? 0;
      if (c === 1) { cycle.push(u, v); return true; }
      if (c === 0 && dfs(v)) { cycle.push(u); return true; }
    }
    color.set(u, 2);
    return false;
  };
  for (const n of nodes) {
    if ((color.get(n) ?? 0) === 0 && dfs(n)) return [...new Set(cycle)].join(' ← ');
  }
  return null;
}

/**
 * ارزیابی هستهٔ برنامهٔ درسی — خروجی همیشه آرایه‌است (خالی = بدون یافته).
 * ERROR = مانع تأیید · WARN = قابل تأیید با یادداشت.
 */
export function validateCurriculumCore(input: CurriculumCheckInput): CheckResult[] {
  const results: CheckResult[] = [];

  // ── ۱) پوشش واحد الزامی: مجموع واحدهای اصلی/تخصصی ≥ totalRequiredUnits ──
  const coreSum = input.courses
    .filter((c) => (c.roleType === 'CORE' || c.roleType === 'MAJOR') && c.isRequired === 1)
    .reduce((s, c) => s + c.units, 0);
  if (coreSum < input.totalRequiredUnits) {
    results.push(err(
      'UNITS_COVER_MIN',
      `مجموع واحدهای دروس الزامیِ اصلی/تخصصی (${coreSum}) از کل واحدهای لازم برنامه (${input.totalRequiredUnits}) کمتر است.`,
      input.courses.filter((c) => (c.roleType === 'CORE' || c.roleType === 'MAJOR') && c.isRequired === 1).map((c) => c.code)
    ));
  }

  // ── ۲) اعتبار ارجاع پیش‌نیازها: هر کد داخل درخت باید در بانک دروس تعریف شده باشد ──
  const unknownRefs = new Set<string>();
  for (const r of input.rules) {
    if (r.ruleType !== 'PREREQ' && r.ruleType !== 'COREQ') continue;
    for (const code of leafCourseCodes(r.logicTree)) {
      if (!input.existingCodes.has(code)) unknownRefs.add(code);
    }
  }
  if (unknownRefs.size > 0) {
    results.push(err(
      'PREREQ_REFERENCES_VALID',
      `کدهای درسیِ ناموجود در بانک دروس: ${[...unknownRefs].join('، ')}`,
      [...unknownRefs]
    ));
  }

  // ── ۳) آزادی از دور: گراف پیش‌نیازها نباید حلقهٔ دورانی داشته باشد ──
  const edges = prereqEdges(input);
  const cycle = hasCycle(new Set(input.courses.map((c) => c.code)), edges);
  if (cycle) {
    results.push(err(
      'PREREQ_CYCLE_FREE',
      `حلقهٔ دورانی در گراف پیش‌نیازها یافت شد: ${cycle}`,
      cycle.split(' ← ')
    ));
  }

  // ── ۴) ترتیب ترمی پیش‌نیازها: پیش‌نیاز نباید در ترمِ دیرتر از درس باشد ──
  const semOf = new Map(input.courses.map((c) => [c.code, c.recommendedSemester]));
  const semIssues: string[] = [];
  for (const e of edges) {
    const ps = semOf.get(e.prereq);
    const ds = semOf.get(e.dependent);
    if (ps != null && ds != null && ps > ds) semIssues.push(`${e.prereq}(${ps})→${e.dependent}(${ds})`);
  }
  if (semIssues.length > 0) {
    results.push(warn(
      'PREREQ_SEMESTER_ORDER',
      `پیش‌نیازهایی که در ترمِ دیرتر از درس وابسته چیده شده‌اند: ${semIssues.join('، ')}`,
      semIssues
    ));
  }

  // ── ۵) هم‌نیازها: در همین نسخه تعریف و هم‌ترم باشند (یا هم‌نیاز خودکار مجاز) ──
  const codesInVersion = new Set(input.courses.map((c) => c.code));
  const coreqIssues: string[] = [];
  for (const r of input.rules) {
    if (r.ruleType !== 'COREQ') continue;
    const dep = input.courses.find((c) => c.courseId === r.courseId);
    for (const code of leafCourseCodes(r.logicTree)) {
      if (!codesInVersion.has(code)) {
        coreqIssues.push(`${code} (خارج از نسخه)`);
        continue;
      }
      const coreq = input.courses.find((c) => c.code === code);
      const autoOk = dep?.autoCorequisiteAllowed === 1;
      if (!autoOk && coreq && dep && coreq.recommendedSemester != null && dep.recommendedSemester != null
        && coreq.recommendedSemester !== dep.recommendedSemester) {
        coreqIssues.push(`${code} (ترم ${coreq.recommendedSemester} ≠ ${dep.recommendedSemester})`);
      }
    }
  }
  if (coreqIssues.length > 0) {
    results.push(warn(
      'COREQ_PRESENT',
      `هم‌نیازهایی که باید هم‌ترم شوند یا در نسخه تعریف شوند: ${coreqIssues.join('، ')}`,
      coreqIssues
    ));
  }

  // ── ۶) پوشش فارغ‌التحصیلی: حداقل یک درس الزامیِ فارغ‌التحصیلی علامت‌خورده ──
  const gradRequired = input.courses.filter((c) => c.isGraduationRequired === 1);
  if (gradRequired.length === 0) {
    results.push(err(
      'GRADUATION_COVERAGE',
      'هیچ درسی به‌عنوان «شرط الزامی فارغ‌التحصیلی» علامت‌گذاری نشده است؛ بدون آن تطبیق سرفصل در فارغ‌التحصیلی ممکن نیست.',
      input.courses.filter((c) => c.roleType === 'CORE' || c.roleType === 'MAJOR').slice(0, 10).map((c) => c.code)
    ));
  }

  // ── ۷) بار ترم: مجموع واحد هر ترم نباید از سقف مجاز بگذرد ──
  if (input.maxUnitsPerTerm != null) {
    const bySemester = new Map<number, { units: number; codes: string[] }>();
    for (const c of input.courses) {
      if (c.recommendedSemester == null) continue;
      const cur = bySemester.get(c.recommendedSemester) ?? { units: 0, codes: [] };
      cur.units += c.units;
      cur.codes.push(c.code);
      bySemester.set(c.recommendedSemester, cur);
    }
    for (const [sem, info] of [...bySemester.entries()].sort((a, b) => a[0] - b[0])) {
      if (info.units > input.maxUnitsPerTerm) {
        results.push(warn(
          'SEMESTER_LOAD',
          `بار ترم ${sem} (${info.units} واحد) از سقف مجاز (${input.maxUnitsPerTerm} واحد) بیشتر است.`,
          info.codes
        ));
      }
    }
  }

  // ── ۸) ترکیب نقش‌ها: هر حداقل مقرر، باید در نسخه تأمین شده باشد ──
  if (input.minRoleCounts && Object.keys(input.minRoleCounts).length > 0) {
    const countByRole = new Map<string, number>();
    for (const c of input.courses) {
      countByRole.set(c.roleType, (countByRole.get(c.roleType) ?? 0) + 1);
    }
    const roleFa: Record<string, string> = {
      CORE: 'اصلی', MAJOR: 'تخصصی', ELECTIVE: 'اختیاری', GENERAL: 'عمومی',
      THESIS: 'پایان‌نامه', INTERNSHIP: 'کارآموزی', WORKSHOP: 'کارگاه',
    };
    for (const [role, min] of Object.entries(input.minRoleCounts)) {
      const count = countByRole.get(role) ?? 0;
      if (count < (min ?? 0)) {
        results.push(warn(
          'COURSE_TYPES_COMPLETE',
          `نقش «${roleFa[role] ?? role}» فقط ${count} درس دارد؛ حداقل مقرر ${min} درس است.`,
          input.courses.filter((c) => c.roleType === role).map((c) => c.code)
        ));
      }
    }
  }

  // ── ۹) یکپارچگی گرایش: نسخهٔ گرایش‌دار باید دست‌کم یک درس انتخابیِ متمایز داشته باشد ──
  if (input.trackId != null) {
    const electives = input.courses.filter((c) => c.roleType === 'ELECTIVE');
    if (electives.length === 0) {
      results.push(warn(
        'TRACK_INTEGRITY',
        `نسخهٔ گرایشی (${input.trackId}) هیچ درس انتخابی متمایزی ندارد؛ در عمل با نسخهٔ گرایش آزاد یکسان است.`,
        []
      ));
    }
  }

  // ── ۱۰) تفکیک هم‌ارزها: دو درس هم‌ارز (یک خوشه) نباید هم‌زمان در یک نسخه باشند ──
  const byCluster = new Map<number, { code: string; title: string }[]>();
  for (const c of input.courses) {
    if (c.clusterId == null) continue;
    const cur = byCluster.get(c.clusterId) ?? [];
    cur.push({ code: c.code, title: c.title });
    byCluster.set(c.clusterId, cur);
  }
  for (const [clusterId, members] of byCluster) {
    if (members.length > 1) {
      results.push(warn(
        'EQUIVALENCY_DISJOINT',
        `دروس هم‌ارز «${members.map((m) => m.title).join('» و «')}» (خوشهٔ ${clusterId}) هر دو در این نسخه‌اند؛ گذراندن یکی باید دیگری را پوشش دهد وگرنه واحدها دوبار شمرده می‌شوند.`,
        members.map((m) => m.code)
      ));
    }
  }

  // ── ۱۱) دروس بدون ترم مصوب: تخصیص ترمی برای چیدمان درسی الزامی است ──
  const unassigned = input.courses.filter((c) => c.recommendedSemester == null);
  if (unassigned.length > 0) {
    results.push(warn(
      'SEMESTER_UNASSIGNED',
      `${unassigned.length} درس بدون ترم مصوب‌اند: ${unassigned.map((c) => c.code).join('، ')} — پیش از چیدمان ترمی تعیین شوند.`,
      unassigned.map((c) => c.code)
    ));
  }

  return results;
}

/** آیا مجموعهٔ نتایج، مانعی برای تأیید دارد؟ */
export function hasBlockingErrors(results: CheckResult[]): boolean {
  return results.some((r) => r.severity === 'ERROR');
}
