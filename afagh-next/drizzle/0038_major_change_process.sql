-- Add MAJOR_CHANGE process definition and steps (تغییر رشته)
-- ۳ مرحله: ۱) ثبت درخواست توسط دانشجو ۲) تأیید مدیر گروه ۳) تأیید نهایی کارشناس آموزش
-- موتور گردش‌کار مرحلهٔ بعد را فقط با ترتیب "stepOrder" پیدا می‌کند
-- (src/lib/workflow-engine.ts:898 — allSteps.find(s => s.stepOrder > currentOrder))
-- و جدول process_transitions اصلاً خوانده نمی‌شود؛ بنابراین اینجا ترنزیشن درج نمی‌شود
-- و مرحلهٔ شروع هم ستونی روی process_definitions ندارد (startStepId وجود ندارد).
-- ستون‌های مرجع: process_definitions.id / code و process_steps."processId" / "stepOrder"
-- (تنها یکتایی موجود روی code است: process_definitions_code_unique در 0000_natural_mandroid.sql)

INSERT INTO process_definitions (code, title, description, category, "isActive", "formSchema")
VALUES (
  'MAJOR_CHANGE',
  'تغییر رشته',
  'درخواست تغییر رشته تحصیلی توسط دانشجو',
  'آموزش',
  1,
  '[
    {"key":"targetMajorId","label":"رشته مقصد","type":"select","required":true,"optionsEndpoint":"/api/admin/majors/active"},
    {"key":"reason","label":"دلیل تغییر رشته","type":"textarea","required":true,"placeholder":"دلیل درخواست تغییر رشته را توضیح دهید..."},
    {"key":"termId","label":"ترم اعمال تغییر","type":"select","required":true,"optionsEndpoint":"/api/admin/terms/current"},
    {"key":"attachment","label":"پیوست‌ها (حواله، فرم توصیه، ...)","type":"file","required":false,"multiple":true}
  ]'
)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
DO $$
DECLARE
  proc_id integer;
BEGIN
  SELECT id INTO proc_id FROM process_definitions WHERE code = 'MAJOR_CHANGE';
  IF proc_id IS NULL THEN
    RETURN;
  END IF;

  -- مرحلهٔ ۱ (SUBMIT): ثبت درخواست توسط دانشجو
  IF NOT EXISTS (SELECT 1 FROM process_steps WHERE "processId" = proc_id AND "stepOrder" = 1) THEN
    INSERT INTO process_steps ("processId", "stepOrder", "title", "stepType", "roleCode", "slaHours")
    VALUES (proc_id, 1, 'ثبت درخواست توسط دانشجو', 'USER_TASK', 'STUDENT', 0);
  END IF;

  -- مرحلهٔ ۲ (DEPT_HEAD_REVIEW): بررسی و تأیید معاونت/مدیر گروه
  IF NOT EXISTS (SELECT 1 FROM process_steps WHERE "processId" = proc_id AND "stepOrder" = 2) THEN
    INSERT INTO process_steps ("processId", "stepOrder", "title", "stepType", "roleCode", "slaHours")
    VALUES (proc_id, 2, 'بررسی و تأیید معاونت/مدیر گروه', 'APPROVAL', 'DEP_HEAD', 72);
  END IF;

  -- مرحلهٔ ۳ (EDU_EXPERT_APPROVE): تأیید نهایی کارشناس آموزش
  IF NOT EXISTS (SELECT 1 FROM process_steps WHERE "processId" = proc_id AND "stepOrder" = 3) THEN
    INSERT INTO process_steps ("processId", "stepOrder", "title", "stepType", "roleCode", "slaHours")
    VALUES (proc_id, 3, 'تأیید نهایی کارشناس آموزش', 'APPROVAL', 'EDU_EXPERT', 72);
  END IF;
END $$;