// ════════════════════════════════════════════════════════════════════════
//  قواعد مؤثرِ یک نسخه = قواعد ثبت‌شده در نسخه  +  fallback به «جدول دروس»
//
//  چرا: `course_rules` مقیّد به نسخه است، ولی منبعِ اصلی پیش‌نیاز/هم‌نیاز
//  در سیستم قدیمی «جدول دروس» سراسری بود (`courses.prereqText` /
//  `courses.coRequisites`). اگر فقط به قواعد نسخه تکیه کنیم، هر درسی که
//  تازه به چارت اضافه شود تا اجرای دستیِ همگام‌سازی هیچ هشداری نمی‌دهد —
//  همان ایرادی که کاربر دید («چیزی نمایش داده نشد»).
//
//  قاعده: قاعدهٔ ثبت‌شده در نسخه همیشه بر جدول دروس مقدم است (override دستی)؛
//  اگر نبود، متن جدول دروس در همان لحظه تفسیر می‌شود.
//
//  این ماژول **خالص** است (بدون DB) تا تست واحد داشته باشد.
// ════════════════════════════════════════════════════════════════════════

import { normalizeLogicNode, type LogicNode } from './curriculum-types';
import { parseRequisiteText } from './prereq-text';

export type EffectiveRule = { courseId: number; ruleType: string; logicTree: LogicNode };

/** ردیفی از بانک دروس که ممکن است متن قاعده داشته باشد */
export type CatalogRuleSource = {
  courseId: number;
  prereqText?: string | null;
  coRequisites?: string | null;
};

/** ردیف خام course_rules (logicTree = JSON متنی) */
export type StoredRuleRow = { courseId: number; ruleType: string; logicTree: string };

export function buildRulesWithCatalogFallback(
  rows: CatalogRuleSource[],
  rulesRows: StoredRuleRow[],
): EffectiveRule[] {
  const explicit: EffectiveRule[] = rulesRows.map((r) => {
    let tree: LogicNode;
    try { tree = normalizeLogicNode(JSON.parse(r.logicTree)); }
    catch { tree = { operator: 'AND', conditions: [] }; }
    return { courseId: r.courseId, ruleType: r.ruleType, logicTree: tree };
  });

  const has = new Set(explicit.map((r) => `${r.courseId}|${r.ruleType}`));
  const derived: EffectiveRule[] = [];
  for (const r of rows) {
    if (r.prereqText && !has.has(`${r.courseId}|PREREQ`)) {
      const tree = parseRequisiteText(r.prereqText);
      if (tree) derived.push({ courseId: r.courseId, ruleType: 'PREREQ', logicTree: tree as LogicNode });
    }
    if (r.coRequisites && !has.has(`${r.courseId}|COREQ`)) {
      const tree = parseRequisiteText(r.coRequisites);
      if (tree) derived.push({ courseId: r.courseId, ruleType: 'COREQ', logicTree: tree as LogicNode });
    }
  }
  return [...explicit, ...derived];
}
