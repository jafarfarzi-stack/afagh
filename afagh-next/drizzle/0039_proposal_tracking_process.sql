-- Add PROPOSAL_TRACKING process definition and steps (پیگیری پروپزال/پایان‌نامه)
-- ۴ مرحله: ۱) ثبت پروپزال توسط دانشجو ۲) تأیید استاد راهنما ۳) تأیید مدیر گروه/معاونت ۴) تأیید نهایی کارشناس آموزش
-- موتور گردش‌کار مرحلهٔ بعد را فقط با ترتیب "stepOrder" پیدا می‌کند
-- (src/lib/workflow-engine.ts:898 — allSteps.find(s => s.stepOrder > currentOrder))
-- و جدول process_transitions اصلاً خوانده نمی‌شود؛ بنابراین اینجا ترنزیشن درج نمی‌شود
-- و مرحلهٔ شروع هم ستونی روی process_definitions ندارد (startStepId وجود ندارد).
-- ستون‌های مرجع: process_definitions.id / code و process_steps."processId" / "stepOrder"
-- (تنها یکتایی موجود روی code است: process_definitions_code_unique در 0000_natural_mandroid.sql)

INSERT INTO process_definitions (code, title, description, category, "isActive", "formSchema")
VALUES (
  'PROPOSAL_TRACKING',
  'پیگیری پروپزال/پایان‌نامه',
  'ثبت و پیگیری وضعیت پروپزال و پایان‌نامه برای دانشجویان ارشد و دکتری',
  'آموزش',
  1,
  '[
    {"key":"proposalTitle","label":"عنوان پروپزال/پایان‌نامه (فارسی)","type":"text","required":true,"placeholder":"عنوان پیشنهادی..."},
    {"key":"proposalTitleEn","label":"عنوان انگلیسی","type":"text","required":false,"placeholder":"English title..."},
    {"key":"supervisorId","label":"استاد راهنما","type":"select","required":true,"optionsEndpoint":"/api/admin/staff/supervisors"},
    {"key":"advisorId","label":"استاد مشاور (اختیاری)","type":"select","required":false,"optionsEndpoint":"/api/admin/staff/supervisors"},
    {"key":"keywords","label":"کلیدواژه‌ها (جدا شده با کاما)","type":"text","required":false,"placeholder":"کلیدواژه ۱، کلیدواژه ۲، ..."},
    {"key":"abstract","label":"چکیده","type":"textarea","required":false,"placeholder":"چکیده مقاله/پایان‌نامه..."},
    {"key":"attachment","label":"فایل پروپزال/پایان‌نامه (PDF)","type":"file","required":false,"multiple":false}
  ]'
)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
DO $$
DECLARE
  proc_id integer;
BEGIN
  SELECT id INTO proc_id FROM process_definitions WHERE code = 'PROPOSAL_TRACKING';
  IF proc_id IS NULL THEN
    RETURN;
  END IF;

  -- مرحلهٔ ۱ (SUBMIT): ثبت پروپزال توسط دانشجو
  IF NOT EXISTS (SELECT 1 FROM process_steps WHERE "processId" = proc_id AND "stepOrder" = 1) THEN
    INSERT INTO process_steps ("processId", "stepOrder", "title", "stepType", "roleCode", "slaHours")
    VALUES (proc_id, 1, 'ثبت پروپزال توسط دانشجو', 'USER_TASK', 'STUDENT', 0);
  END IF;

  -- مرحلهٔ ۲ (SUPERVISOR_APPROVE): بررسی و تأیید استاد راهنما
  IF NOT EXISTS (SELECT 1 FROM process_steps WHERE "processId" = proc_id AND "stepOrder" = 2) THEN
    INSERT INTO process_steps ("processId", "stepOrder", "title", "stepType", "roleCode", "slaHours")
    VALUES (proc_id, 2, 'بررسی و تأیید استاد راهنما', 'APPROVAL', 'SUPERVISOR', 168);
  END IF;

  -- مرحلهٔ ۳ (PROPOSAL_COMMITTEE): تأیید مدیر گروه/معاونت آموزشی
  IF NOT EXISTS (SELECT 1 FROM process_steps WHERE "processId" = proc_id AND "stepOrder" = 3) THEN
    INSERT INTO process_steps ("processId", "stepOrder", "title", "stepType", "roleCode", "slaHours")
    VALUES (proc_id, 3, 'تأیید مدیر گروه/معاونت آموزشی', 'APPROVAL', 'DEP_HEAD', 72);
  END IF;

  -- مرحلهٔ ۴ (FINAL_APPROVE): تأیید نهایی کارشناس آموزش
  IF NOT EXISTS (SELECT 1 FROM process_steps WHERE "processId" = proc_id AND "stepOrder" = 4) THEN
    INSERT INTO process_steps ("processId", "stepOrder", "title", "stepType", "roleCode", "slaHours")
    VALUES (proc_id, 4, 'تأیید نهایی کارشناس آموزش', 'APPROVAL', 'EDU_EXPERT', 72);
  END IF;
END $$;