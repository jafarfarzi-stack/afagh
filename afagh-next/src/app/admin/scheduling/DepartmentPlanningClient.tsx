'use client';

/**
 * کارتابل یکپارچهٔ برنامه‌ریزی درسی و چیدمان متمرکز مدیر گروه — نقطهٔ ورود.
 *
 * ساختار پس از جراحی این دور (فایل قبلی ۲۳۵۸ خط بود):
 *   types.ts              قرارداد داده (بدون React)
 *   planning-core.ts      منطق خالص: نگاشت‌ها، بار واحد، فیلترها، KPI — قابل Unit Test
 *   PlanningProvider.tsx  تنها جای وضعیت: ۴۰ useState + Server Actionها + مشتقات
 *   components/*          ۷ تب + بنر/نوار تب/توست/مودال — هر فایل فقط رندر خودش
 *
 * چرا Context و نه props؟ state بین تب‌ها مشترک است (تغییر نیمسال روی همه تب‌ها
 * اثر می‌گذارد، «برنامه ⬅️» از تب ۲ تب ۵ را هدف می‌گیرد و…). تب‌ها state خودی ندارند،
 * پس جابه‌جایی‌شان بین فایل‌ها هیچ همگام‌سازی را نمی‌شکند.
 *
 * پیوندپذیری: `?tab=SCENARIOS` تب آغازین را انتخاب می‌کند (مقادیر نامعتبر با
 * resolveTab به تب ۱ برمی‌گردند) — هم برای کاربر مفید است، هم هر تب را مستقل
 * قابل رندر/تست می‌کند.
 */
import type { SchedulingWorkspace } from './types';
import { PlanningProvider } from './PlanningProvider';
import PlanningShell from './components/PlanningShell';

export default function DepartmentPlanningClient({
  initial, tab,
}: { initial: SchedulingWorkspace; tab?: string | null }) {
  return (
    <PlanningProvider initial={initial} tab={tab}>
      <PlanningShell />
    </PlanningProvider>
  );
}
