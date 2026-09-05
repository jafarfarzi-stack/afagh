-- ══════════════════════════════════════════════════════════════════
--  Seed کاتالوگ مجوزها + نگاشت پیش‌فرض نقش→مجوز — SQL خالص
--
--  چرا SQL؟ تا برای فعال‌کردن صفحهٔ «ماتریس دسترسی‌ها» مجبور نباشید
--  ایمیج migrator را دوباره بیلد کنید. مستقیم روی کانتینر postgres:
--
--    docker compose exec -T postgres psql -U afagh -d afagh_db \
--      < afagh-next/scripts/seed-permissions.sql
--
--  ⚠ این فایل تولیدشده از src/lib/permissions-catalog.json است.
--    دستی ویرایشش نکنید؛ منبع را عوض کنید و دوباره بسازید:
--      node scripts/gen-permissions-sql.mjs
--
--  idempotent است: هر چند بار اجرا شود بی‌خطر است و تخصیص‌های سفارشی
--  مدیر را پاک نمی‌کند (نقشی که از قبل مجوز دارد اصلاً دست نمی‌خورد).
-- ══════════════════════════════════════════════════════════════════
BEGIN;

-- ۱) کاتالوگ 32 مجوزه
INSERT INTO permissions (code, title, category, description) VALUES
  ('students:verify_kyc', 'تأیید احراز هویت', 'ثبت‌نام و پذیرش (e-KYC)', 'تأیید مدارک هویتی و ثبت‌نام آنلاین دانشجو'),
  ('students:issue_card', 'صدور کارت دانشجویی', 'ثبت‌نام و پذیرش (e-KYC)', 'صدور و چاپ کارت دانشجویی هوشمند با QR'),
  ('students:view_dossier', 'مشاهدهٔ پروندهٔ دانشجو', 'ثبت‌نام و پذیرش (e-KYC)', 'مشاهدهٔ پروندهٔ تحصیلی و هویتی دانشجو'),
  ('admissions:import_sanjesh', 'ورود دادهٔ سنجش', 'ثبت‌نام و پذیرش (e-KYC)', 'بارگذاری و نگاشت فایل پذیرش سازمان سنجش'),
  ('finance:view_ledger', 'مشاهدهٔ دفتر مالی', 'امور مالی و شهریه', 'مشاهدهٔ تراز مالی، دفتر کل و بدهکاری دانشجویان'),
  ('finance:manage_tuition_rules', 'مدیریت قواعد شهریه', 'امور مالی و شهریه', 'تعریف فرمول شهریه، تخفیف‌ها و بنیادها'),
  ('finance:approve_advances', 'تأیید مساعده', 'امور مالی و شهریه', 'فعال‌سازی و تأیید مساعده و علی‌الحساب اساتید'),
  ('finance:settle_payroll', 'تسویهٔ حق‌التدریس', 'امور مالی و شهریه', 'تسویهٔ نهایی حق‌التدریس و صدور دیسکت بانکی'),
  ('finance:tamin_insurance', 'بیمه و مالیات', 'امور مالی و شهریه', 'مدیریت لیست بیمهٔ تأمین اجتماعی و کسور مالیاتی'),
  ('exams:plan_calendar', 'تقویم امتحانات', 'امتحانات و مخزن اوراق', 'زون‌بندی و تدوین تقویم امتحانات پایان نیمسال'),
  ('exams:manage_halls', 'سالن و صندلی', 'امتحانات و مخزن اوراق', 'برنامه‌ریزی سالن‌ها، شمارهٔ صندلی و مراقبین'),
  ('exams:vault_handover', 'تحویل مخزن', 'امتحانات و مخزن اوراق', 'شمارش و تأیید بسته‌های درسی مخزن قرنطینه'),
  ('exams:proctor_attendance', 'حضوروغیاب حوزه', 'امتحانات و مخزن اوراق', 'حضور و غیاب داوطلبان با اسکنر QR در سالن'),
  ('exams:temp_permit', 'مجوز ورود موقت', 'امتحانات و مخزن اوراق', 'صدور مجوز ورود موقت (تعهد) بدون کارت'),
  ('grades:enter_temporary', 'ثبت نمرهٔ موقت', 'آموزش و نمرات', 'ورود نمرات میان‌ترم و ثبت موقت'),
  ('grades:finalize_otp', 'نهایی‌سازی با OTP', 'آموزش و نمرات', 'قفل و نهایی‌سازی قطعی کارنامه با امضای OTP'),
  ('grades:resolve_appeals', 'رسیدگی به اعتراض', 'آموزش و نمرات', 'رسیدگی به فرجام‌خواهی و اعتراضات نمره'),
  ('edu:manage_enrollment', 'مدیریت انتخاب واحد', 'آموزش و نمرات', 'بازکردن/بستن انتخاب واحد، حذف‌واضافه و ترمیم ثبت‌نام'),
  ('curriculum:manage_versions', 'نسخه‌بندی سرفصل', 'برنامه‌ریزی درسی و سرفصل', 'تدوین و نسخه‌بندی چارت درسی و خوشه‌های هم‌ارز'),
  ('scheduling:manage_chart', 'چیدمان دروس', 'برنامه‌ریزی درسی و سرفصل', 'تعریف گروه‌های درسی و ماتریس زمان‌بندی نیمسال'),
  ('scheduling:assign_professors', 'انتساب اساتید', 'برنامه‌ریزی درسی و سرفصل', 'تخصیص استاد به گروه درسی و بررسی تعارض‌ها'),
  ('scheduling:approve_plan', 'تصویب برنامهٔ نیمسال', 'برنامه‌ریزی درسی و سرفصل', 'تأیید نهایی سناریوی چیدمان و انتشار برنامه'),
  ('archive:verify_papers', 'تأیید اوراق فیزیکی', 'بایگانی دیجیتال', 'تأیید دریافت فیزیکی اوراق امتحانی و آزادسازی مالی'),
  ('archive:view_documents', 'مشاهدهٔ اسناد محرمانه', 'بایگانی دیجیتال', 'مشاهدهٔ اسناد محرمانه و پرونده‌های بایگانی'),
  ('graduation:review_dossier', 'بررسی پروندهٔ فراغت', 'فارغ‌التحصیلی و مدارک', 'کنترل واحدهای گذرانده و تأیید شرایط فراغت از تحصیل'),
  ('graduation:issue_certificate', 'صدور مدرک', 'فارغ‌التحصیلی و مدارک', 'صدور دانشنامه/گواهی موقت با کد رهگیری استعلام'),
  ('system:manage_users', 'مدیریت کاربران', 'مدیریت سامانه', 'ایجاد کاربر، تخصیص نقش و غیرفعال‌سازی حساب'),
  ('system:manage_roles', 'مدیریت نقش و دسترسی', 'مدیریت سامانه', 'تعریف نقش سازمانی و ویرایش ماتریس دسترسی‌ها'),
  ('system:manage_settings', 'پیکربندی سامانه', 'مدیریت سامانه', 'تنظیمات عمومی، سرویس‌های بیرونی و قالب پیامک'),
  ('system:view_audit', 'مشاهدهٔ دفتر ممیزی', 'مدیریت سامانه', 'مطالعهٔ زنجیرهٔ ممیزی و گزارش‌های امنیتی'),
  ('portal:student_self', 'پورتال دانشجو', 'پنل شخصی', 'دسترسی به پورتال شخصی دانشجو (کارنامه، مالی، انتخاب واحد)'),
  ('portal:professor_self', 'پورتال استاد', 'پنل شخصی', 'دسترسی به پورتال شخصی استاد (کلاس‌ها، حضوروغیاب، قرارداد)')
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title, category = EXCLUDED.category, description = EXCLUDED.description;

-- ۲) نگاشت پیش‌فرض — فقط برای نقش‌هایی که هنوز هیچ مجوزی ندارند
WITH defaults(role_code, perm_code) AS (VALUES
  ('ADMIN', 'students:verify_kyc'),
  ('ADMIN', 'students:issue_card'),
  ('ADMIN', 'students:view_dossier'),
  ('ADMIN', 'admissions:import_sanjesh'),
  ('ADMIN', 'finance:view_ledger'),
  ('ADMIN', 'finance:manage_tuition_rules'),
  ('ADMIN', 'finance:approve_advances'),
  ('ADMIN', 'finance:settle_payroll'),
  ('ADMIN', 'finance:tamin_insurance'),
  ('ADMIN', 'exams:plan_calendar'),
  ('ADMIN', 'exams:manage_halls'),
  ('ADMIN', 'exams:vault_handover'),
  ('ADMIN', 'exams:proctor_attendance'),
  ('ADMIN', 'exams:temp_permit'),
  ('ADMIN', 'grades:enter_temporary'),
  ('ADMIN', 'grades:finalize_otp'),
  ('ADMIN', 'grades:resolve_appeals'),
  ('ADMIN', 'edu:manage_enrollment'),
  ('ADMIN', 'curriculum:manage_versions'),
  ('ADMIN', 'scheduling:manage_chart'),
  ('ADMIN', 'scheduling:assign_professors'),
  ('ADMIN', 'scheduling:approve_plan'),
  ('ADMIN', 'archive:verify_papers'),
  ('ADMIN', 'archive:view_documents'),
  ('ADMIN', 'graduation:review_dossier'),
  ('ADMIN', 'graduation:issue_certificate'),
  ('ADMIN', 'system:manage_users'),
  ('ADMIN', 'system:manage_roles'),
  ('ADMIN', 'system:manage_settings'),
  ('ADMIN', 'system:view_audit'),
  ('ADMIN', 'portal:student_self'),
  ('ADMIN', 'portal:professor_self'),
  ('STUDENT', 'portal:student_self'),
  ('PROFESSOR', 'portal:professor_self'),
  ('PROFESSOR', 'grades:enter_temporary'),
  ('PROFESSOR', 'grades:finalize_otp'),
  ('PROFESSOR', 'grades:resolve_appeals'),
  ('DEP_HEAD', 'students:view_dossier'),
  ('DEP_HEAD', 'curriculum:manage_versions'),
  ('DEP_HEAD', 'scheduling:manage_chart'),
  ('DEP_HEAD', 'scheduling:assign_professors'),
  ('DEP_HEAD', 'edu:manage_enrollment'),
  ('EDU_EXPERT', 'students:view_dossier'),
  ('EDU_EXPERT', 'admissions:import_sanjesh'),
  ('EDU_EXPERT', 'edu:manage_enrollment'),
  ('EDU_EXPERT', 'curriculum:manage_versions'),
  ('EDU_EXPERT', 'scheduling:manage_chart'),
  ('EDU_EXPERT', 'scheduling:assign_professors'),
  ('EDU_EXPERT', 'exams:plan_calendar'),
  ('EDU_EXPERT', 'exams:manage_halls'),
  ('EDU_EXPERT', 'grades:resolve_appeals'),
  ('VICE_EDU', 'students:view_dossier'),
  ('VICE_EDU', 'curriculum:manage_versions'),
  ('VICE_EDU', 'scheduling:approve_plan'),
  ('VICE_EDU', 'grades:resolve_appeals'),
  ('VICE_EDU', 'graduation:review_dossier'),
  ('FINANCE_EXPERT', 'finance:view_ledger'),
  ('FINANCE_EXPERT', 'finance:manage_tuition_rules'),
  ('FINANCE_EXPERT', 'finance:approve_advances'),
  ('FINANCE_EXPERT', 'finance:settle_payroll'),
  ('FINANCE_EXPERT', 'finance:tamin_insurance'),
  ('ARCHIVE_EXPERT', 'archive:verify_papers'),
  ('ARCHIVE_EXPERT', 'archive:view_documents'),
  ('MILITARY_OFFICER', 'students:view_dossier'),
  ('MILITARY_OFFICER', 'students:verify_kyc'),
  ('PROCTOR', 'exams:proctor_attendance'),
  ('PROCTOR', 'exams:temp_permit'),
  ('VAULT_MANAGER', 'exams:vault_handover'),
  ('VAULT_MANAGER', 'exams:manage_halls')
)
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
  FROM defaults d
  JOIN roles r ON r.code = d.role_code
  JOIN permissions p ON p.code = d.perm_code
 WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp."roleId" = r.id)
ON CONFLICT DO NOTHING;

COMMIT;

-- بررسی نتیجه
\echo '— مجوزها / تخصیص‌ها —'
SELECT (SELECT count(*) FROM permissions) AS permissions,
       (SELECT count(*) FROM role_permissions) AS grants,
       (SELECT count(*) FROM roles) AS roles;
