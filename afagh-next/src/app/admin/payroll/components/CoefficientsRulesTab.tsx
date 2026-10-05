'use client';

/**
 * CoefficientsRulesTab — مدیریت ضرایب تدریس و قوانین محاسبه حق‌التدریس
 *
 * این تب به مدیران مالی امکان ویرایش ضرایب (teaching_coefficients) و
 * قوانین فرمول‌ساز (payroll_calculation_rules) را می‌دهد.
 */
import React, { useEffect, useState } from 'react';
import { faNum } from '../payrollData';
import type { PayrollState, PayrollApi } from '../payrollReducer';

interface Props {
  state: PayrollState;
  api: PayrollApi;
}

interface CoefficientItem {
  id: number;
  ruleName: string;
  multiplier: string;
}

interface CalculationRuleItem {
  id: number;
  offeringType: string | null;
  professorRole: string | null;
  academicRank: string | null;
  multiplierUnit: string | null;
  multiplierPerStudent: string | null;
  flatFee: string | null;
  title: string | null;
  isActive: number;
  updatedAt: string | null;
}

const COEF_LABELS: Record<string, string> = {
  'PAYROLL_COEF_PRACTICAL': 'ضریب درس عملی',
  'PAYROLL_COEF_MS_LEVEL': 'ضریب مقطع کارشناسی ارشد',
  'PAYROLL_COEF_CROWDED': 'ضریب کلاس جمعی (بیش از آستانه)',
};

const OFFERING_TYPES = ['', 'THEORY', 'THESIS', 'DIRECTED_READING', 'INTERNSHIP', 'NORMAL', 'TRANSFER'];
const PROFESSOR_ROLES = ['', 'MAIN_LECTURER', 'SUPERVISOR', 'ADVISOR', 'REVIEWER', 'EXAMINER'];
const ACADEMIC_RANKS = ['', 'مربی', 'استادیار', 'دانشیار', 'استاد تمام'];

export default function CoefficientsRulesTab({ state, api }: Props) {
  const { showToast } = api;
  const [coefficients, setCoefficients] = useState<CoefficientItem[]>([]);
  const [rules, setRules] = useState<CalculationRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // فرم افزودن قانون جدید
  const [newRule, setNewRule] = useState({
    offeringType: '',
    professorRole: '',
    academicRank: '',
    multiplierUnit: '',
    multiplierPerStudent: '',
    flatFee: '',
    title: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // دریافت ضرایب
      const coefRes = await fetch('/api/admin/payroll/coefficients');
      if (coefRes.ok) {
        const coefData = await coefRes.json();
        if (coefData.ok) setCoefficients(coefData.coefficients);
      }

      // دریافت قوانین محاسبه
      const ruleRes = await fetch('/api/admin/payroll/calculation-rules');
      if (ruleRes.ok) {
        const ruleData = await ruleRes.json();
        if (ruleData.ok) setRules(ruleData.rules);
      }
    } catch (err) {
      showToast('خطا در بارگذاری داده‌ها');
    } finally {
      setLoading(false);
    }
  };

  const handleCoefficientChange = async (ruleName: string, value: string) => {
    const numValue = parseFloat(value) || 1;
    setSaving(ruleName);
    try {
      const res = await fetch('/api/admin/payroll/coefficients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleName, multiplier: numValue }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`ضریب ${COEF_LABELS[ruleName] || ruleName} به‌روزرسانی شد`);
        setCoefficients(c => c.map(c => c.ruleName === ruleName ? { ...c, multiplier: String(numValue) } : c));
      } else {
        showToast(`خطا: ${data.error}`);
      }
    } catch {
      showToast('خطا در ارتباط با سرور');
    } finally {
      setSaving(null);
    }
  };

  const handleRuleUpdate = async (rule: CalculationRuleItem) => {
    setSaving(`rule-${rule.id}`);
    try {
      const res = await fetch(`/api/admin/payroll/calculation-rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offeringType: rule.offeringType,
          professorRole: rule.professorRole,
          academicRank: rule.academicRank,
          multiplierUnit: rule.multiplierUnit ? parseFloat(rule.multiplierUnit) : null,
          multiplierPerStudent: rule.multiplierPerStudent ? parseFloat(rule.multiplierPerStudent) : null,
          flatFee: rule.flatFee ? parseFloat(rule.flatFee) : null,
          title: rule.title,
          isActive: rule.isActive,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('قانون محاسبه به‌روزرسانی شد');
      } else {
        showToast(`خطا: ${data.error}`);
        loadData(); // بازگرداندن به حالت قبلی
      }
    } catch {
      showToast('خطا در ارتباط با سرور');
      loadData();
    } finally {
      setSaving(null);
    }
  };

  const handleRuleDelete = async (id: number) => {
    if (!window.confirm('آیا از حذف این قانون اطمینان دارید؟')) return;
    try {
      const res = await fetch(`/api/admin/payroll/calculation-rules/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        showToast('قانون محاسبه حذف شد');
        setRules(r => r.filter(rule => rule.id !== id));
      } else {
        showToast(`خطا: ${data.error}`);
      }
    } catch {
      showToast('خطا در ارتباط با سرور');
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving('create');
    try {
      const res = await fetch('/api/admin/payroll/calculation-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offeringType: newRule.offeringType || null,
          professorRole: newRule.professorRole || null,
          academicRank: newRule.academicRank || null,
          multiplierUnit: newRule.multiplierUnit ? parseFloat(newRule.multiplierUnit) : null,
          multiplierPerStudent: newRule.multiplierPerStudent ? parseFloat(newRule.multiplierPerStudent) : null,
          flatFee: newRule.flatFee ? parseFloat(newRule.flatFee) : null,
          title: newRule.title,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('قانون جدید ایجاد شد');
        setNewRule({
          offeringType: '',
          professorRole: '',
          academicRank: '',
          multiplierUnit: '',
          multiplierPerStudent: '',
          flatFee: '',
          title: '',
        });
        loadData();
      } else {
        showToast(`خطا: ${data.error}`);
      }
    } catch {
      showToast('خطا در ارتباط با سرور');
    } finally {
      setSaving(null);
    }
  };

  const getRuleDescription = (rule: CalculationRuleItem) => {
    const parts: string[] = [];
    if (rule.offeringType) parts.push(`نوع درس: ${rule.offeringType}`);
    if (rule.professorRole) parts.push(`نقش: ${rule.professorRole}`);
    if (rule.academicRank) parts.push(`مرتبه: ${rule.academicRank}`);
    return parts.join(' · ') || '— (قانون پیش‌فرض)';
  };

  const getRuleFormula = (rule: CalculationRuleItem) => {
    if (rule.flatFee) return `مبلغ مقطوع: ${faNum(Number(rule.flatFee).toLocaleString())} ریال`;
    if (rule.multiplierPerStudent) return `نرخ × واحد × دانشجو × ${rule.multiplierPerStudent}`;
    if (rule.multiplierUnit) return `نرخ × واحد × ${rule.multiplierUnit}`;
    return '—';
  };

  if (loading) {
    return (
      <div className="card p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent mx-auto"></div>
        <p className="mt-2 text-slate-500">در حال بارگذاری ضرایب و قوانین...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* بخش ۱: ضرایب تدریس (teaching_coefficients) */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl">⚙️</div>
          <div>
            <h2 className="font-black text-slate-900 text-base">ضرایب تدریس (Teaching Coefficients)</h2>
            <p className="text-xs text-slate-500">این ضرایب بر روی واحدهای معادل دروس نظری اعمال می‌شوند. مقادیر از جدول teaching_coefficients خوانده می‌شوند.</p>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-2.5">کد قانون</th>
                <th className="p-2.5">عنوان</th>
                <th className="p-2.5 text-center">ضریب جاری</th>
                <th className="p-2.5 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {coefficients.map(coef => (
                <tr key={coef.ruleName} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-2.5 font-mono text-slate-700">{coef.ruleName}</td>
                  <td className="p-2.5 font-medium text-slate-900">{COEF_LABELS[coef.ruleName] || coef.ruleName}</td>
                  <td className="p-2.5 text-center">
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="5"
                      value={coef.multiplier}
                      onChange={e => handleCoefficientChange(coef.ruleName, e.target.value)}
                      disabled={saving === coef.ruleName}
                      className="w-20 text-center border border-slate-300 rounded px-1.5 py-0.5 font-mono font-bold text-slate-800 text-xs"
                    />
                  </td>
                  <td className="p-2.5 text-center">
                    {saving === coef.ruleName && <span className="text-amber-600 text-[10px]">⟳ ذخیره...</span>}
                  </td>
                </tr>
              ))}
              {coefficients.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400">هیچ ضریبی یافت نشد</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
          <strong>نحوه اعمال:</strong> واحد درس × ضریب درس عملی × ضریب مقطع ارشد × ضریب کلاس جمعی = واحد معادل نهایی.
          <br />آستانه کلاس جمعی از تنظیمات (PAYROLL_CROWDED_THRESHOLD) خوانده می‌شود (پیش‌فرض ۴۰ نفر).
        </div>
      </div>

      {/* بخش ۲: قوانین محاسبه حق‌التدریس (payroll_calculation_rules) */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl">📐</div>
          <div>
            <h2 className="font-black text-slate-900 text-base">قوانین محاسبه حق‌التدریس (Calculation Rules)</h2>
            <p className="text-xs text-slate-500">قوانین فرمول‌ساز برای موارد خاص (پایان‌نامه، معرفی به استاد، تدریس ارشد/دکتری). خاص‌ترین قانون (بیشترین فیلدهای پرشده) برنده می‌شود.</p>
          </div>
        </div>

        {/* فرم افزودن قانون جدید */}
        <form onSubmit={handleCreateRule} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <h3 className="font-bold text-slate-800">➕ افزودن قانون جدید</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select
              value={newRule.offeringType}
              onChange={e => setNewRule({ ...newRule, offeringType: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1.5 text-xs"
            >
              <option value="">نوع درس (اختیاری)</option>
              {OFFERING_TYPES.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={newRule.professorRole}
              onChange={e => setNewRule({ ...newRule, professorRole: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1.5 text-xs"
            >
              <option value="">نقش استاد (اختیاری)</option>
              {PROFESSOR_ROLES.filter(Boolean).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={newRule.academicRank}
              onChange={e => setNewRule({ ...newRule, academicRank: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1.5 text-xs"
            >
              <option value="">مرتبه علمی (اختیاری)</option>
              {ACADEMIC_RANKS.filter(Boolean).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input
              type="text"
              placeholder="عنوان قانون"
              value={newRule.title}
              onChange={e => setNewRule({ ...newRule, title: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1.5 text-xs md:col-span-2"
              required
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input
              type="number"
              step="0.05"
              placeholder="ضریب واحد (multiplierUnit)"
              value={newRule.multiplierUnit}
              onChange={e => setNewRule({ ...newRule, multiplierUnit: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1.5 text-xs"
            />
            <input
              type="number"
              step="0.05"
              placeholder="ضریب هر دانشجو"
              value={newRule.multiplierPerStudent}
              onChange={e => setNewRule({ ...newRule, multiplierPerStudent: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1.5 text-xs"
            />
            <input
              type="number"
              step="1000000"
              placeholder="مبلغ مقطوع (ریال)"
              value={newRule.flatFee}
              onChange={e => setNewRule({ ...newRule, flatFee: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1.5 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={saving === 'create' || !newRule.title}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50"
          >
            {saving === 'create' ? '⟳ در حال ایجاد...' : 'ایجاد قانون'}
          </button>
        </form>

        {/* لیست قوانین */}
        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-2.5">شناسه</th>
                <th className="p-2.5">شرایط تطبیق</th>
                <th className="p-2.5">فرمول محاسبه</th>
                <th className="p-2.5">عنوان</th>
                <th className="p-2.5 text-center">فعال</th>
                <th className="p-2.5 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-2.5 font-mono text-slate-700">#{rule.id}</td>
                  <td className="p-2.5 text-slate-600 text-[10px]">{getRuleDescription(rule)}</td>
                  <td className="p-2.5 font-mono text-indigo-900 text-[10px]">{getRuleFormula(rule)}</td>
                  <td className="p-2.5">
                    <input
                      type="text"
                      value={rule.title || ''}
                      onChange={e => {
                        const updated = { ...rule, title: e.target.value };
                        setRules(r => r.map(r => r.id === rule.id ? updated : r));
                      }}
                      className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs"
                    />
                  </td>
                  <td className="p-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={rule.isActive === 1}
                      onChange={e => {
                        const updated = { ...rule, isActive: e.target.checked ? 1 : 0 };
                        setRules(r => r.map(r => r.id === rule.id ? updated : r));
                        handleRuleUpdate(updated);
                      }}
                    />
                  </td>
                  <td className="p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {saving === `rule-${rule.id}` ? (
                        <span className="text-amber-600 text-[10px]">⟳</span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRuleUpdate(rule)}
                            className="px-2 py-1 text-emerald-600 hover:bg-emerald-50 rounded text-[10px] font-bold"
                            title="ذخیره تغییرات"
                          >
                            💾
                          </button>
                          <button
                            onClick={() => handleRuleDelete(rule.id)}
                            className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded text-[10px] font-bold"
                            title="حذف قانون"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400">هیچ قانون محاسبه‌ای یافت نشد</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 text-xs text-indigo-900">
          <strong>اولویت تطبیق:</strong> قانون با بیشترین تعداد فیلدهای مشخص (offeringType + professorRole + academicRank) برنده است.
          <br />• <strong>FlatFee:</strong> مبلغ ثابت برای هر واحد/دانشجو (مثلا پایان‌نامه)
          <br />• <strong>MultiplierPerStudent:</strong> نرخ پایه × واحد × تعداد دانشجویان × ضریب
          <br />• <strong>MultiplierUnit:</strong> نرخ پایه × واحد × ضریب (بدون وابستگی به تعداد دانشجو)
        </div>
      </div>
    </div>
  );
}