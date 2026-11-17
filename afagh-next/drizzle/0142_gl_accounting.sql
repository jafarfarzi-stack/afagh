-- ══════════════════════════════════════════════════════════════════
-- 0142 — بنیانِ حسابداریِ دوبل (دفتر کل / General Ledger)
--
-- چرا؟
--   «ترازنامه»ی فعلی نمی‌تواند واقعی باشد، چون هیچ دفترِ کلِ دوبلی در
--   سیستم نیست: student_ledger فقط یک ستونِ «مانده» به‌ازای هر دانشجو
--   نگه می‌دارد و هیچ سندِ متوازن (بدهکار = بستانکار) وجود ندارد.
--   این مهاجرت اسکلتِ دفتر کل را می‌سازد:
--     gl_accounts       → کدینگ حساب‌ها (درختِ حساب)
--     gl_periods        → دوره‌های مالی (ماهانه) و وضعیتِ باز/بسته
--     gl_vouchers       → سندِ حسابداری (سرسند)
--     gl_voucher_lines  → ردیف‌های سند (بدهکار/بستانکار)
--     gl_posting_rules  → نگاشتِ رویداد → حسابِ بدهکار/بستانکار
--
--   پرکردنِ داده (backfill از student_ledger، ۶۹۲ هزار ردیف) و ثبتِ
--   زندهٔ اسناد، وظیفهٔ ماژول‌های بعدی است؛ این فایل فقط اسکیما،
--   کدینگِ پیش‌فرض و قواعدِ ثبتِ پیش‌فرض را می‌سازد.
--
-- اصول:
--   • idempotent و غیرمخرب: CREATE … IF NOT EXISTS + ON CONFLICT DO NOTHING
--     و CHECKها داخل DO block و با NOT VALID (بدون قفلِ طولانی/بازنویسی).
--   • هیچ جدولِ موجودی تغییر نمی‌کند.
--   • پول همیشه numeric(18,0) (ریال، بدون اعشار).
--   • همهٔ جدول‌ها دانشگاه‌محور (universityId) هستند.
-- ══════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS gl_accounts (
  id serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES universities(id),
  code varchar(20) NOT NULL,
  name varchar(120) NOT NULL,
  "parentId" integer REFERENCES gl_accounts(id),
  type varchar(12) NOT NULL,          -- ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE
  "normalSide" varchar(6) NOT NULL,   -- DEBIT|CREDIT  (طرفِ طبیعیِ حساب)
  level smallint NOT NULL DEFAULT 1,
  "isActive" integer NOT NULL DEFAULT 1,
  "isPostable" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_accounts_uni_code ON gl_accounts ("universityId", code);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gl_accounts_uni_type ON gl_accounts ("universityId", type);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS gl_periods (
  id serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES universities(id),
  title varchar(60) NOT NULL,
  "startDate" date NOT NULL,
  "endDate" date NOT NULL,
  status varchar(8) NOT NULL DEFAULT 'OPEN',
  "closedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_periods_uni_title ON gl_periods ("universityId", title);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS gl_vouchers (
  id serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES universities(id),
  "voucherNo" bigint NOT NULL,
  "voucherDate" date NOT NULL,
  "periodId" integer REFERENCES gl_periods(id),
  source varchar(20) NOT NULL,
  "sourceRef" varchar(80) NOT NULL,
  description varchar(300),
  status varchar(10) NOT NULL DEFAULT 'POSTED',
  "totalDebit" numeric(18,0) NOT NULL DEFAULT 0,
  "totalCredit" numeric(18,0) NOT NULL DEFAULT 0,
  "createdByUserId" integer REFERENCES users(id),
  "postedAt" timestamptz,
  "reversedByVoucherId" integer REFERENCES gl_vouchers(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_gl_voucher_balanced CHECK ("totalDebit" >= 0 AND "totalCredit" >= 0)
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_vouchers_uni_no ON gl_vouchers ("universityId", "voucherNo");

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_vouchers_source_ref ON gl_vouchers ("universityId", source, "sourceRef");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gl_vouchers_uni_date ON gl_vouchers ("universityId", "voucherDate" DESC);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gl_vouchers_period ON gl_vouchers ("periodId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS gl_voucher_lines (
  id serial PRIMARY KEY,
  "voucherId" integer NOT NULL REFERENCES gl_vouchers(id) ON DELETE CASCADE,
  "accountId" integer NOT NULL REFERENCES gl_accounts(id),
  debit numeric(18,0) NOT NULL DEFAULT 0,
  credit numeric(18,0) NOT NULL DEFAULT 0,
  description varchar(200),
  "studentId" integer REFERENCES students(id),
  "termId" integer REFERENCES academic_terms(id),
  CONSTRAINT ck_gl_line_one_side CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0) AND (debit + credit) > 0)
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gl_lines_voucher ON gl_voucher_lines ("voucherId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gl_lines_account ON gl_voucher_lines ("accountId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gl_lines_student ON gl_voucher_lines ("studentId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS gl_posting_rules (
  id serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES universities(id),
  "eventKey" varchar(40) NOT NULL,
  "debitAccountCode" varchar(20) NOT NULL,
  "creditAccountCode" varchar(20) NOT NULL,
  "isActive" integer NOT NULL DEFAULT 1,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_rules_uni_event ON gl_posting_rules ("universityId", "eventKey");

-- ──────────────────────────────────────────────────────────────────
-- CHECKهای واژگانی — داخل DO block تا فایل بارها قابل اجرا باشد.
-- NOT VALID ⇒ روی ردیف‌های موجود (که هیچ‌اند) بازبینی نمی‌شود و
-- جدول قفل نمی‌شود؛ برای درج/به‌روزرسانیِ بعدی کاملاً اعمال می‌شود.
-- ──────────────────────────────────────────────────────────────────

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_gl_accounts_type' AND conrelid = 'gl_accounts'::regclass
  ) THEN
    ALTER TABLE gl_accounts ADD CONSTRAINT ck_gl_accounts_type
      CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')) NOT VALID;
  END IF;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_gl_accounts_normal_side' AND conrelid = 'gl_accounts'::regclass
  ) THEN
    ALTER TABLE gl_accounts ADD CONSTRAINT ck_gl_accounts_normal_side
      CHECK ("normalSide" IN ('DEBIT','CREDIT')) NOT VALID;
  END IF;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_gl_periods_status' AND conrelid = 'gl_periods'::regclass
  ) THEN
    ALTER TABLE gl_periods ADD CONSTRAINT ck_gl_periods_status
      CHECK (status IN ('OPEN','CLOSED')) NOT VALID;
  END IF;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_gl_vouchers_status' AND conrelid = 'gl_vouchers'::regclass
  ) THEN
    ALTER TABLE gl_vouchers ADD CONSTRAINT ck_gl_vouchers_status
      CHECK (status IN ('DRAFT','POSTED','REVERSED')) NOT VALID;
  END IF;
END $$;

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_gl_vouchers_source' AND conrelid = 'gl_vouchers'::regclass
  ) THEN
    ALTER TABLE gl_vouchers ADD CONSTRAINT ck_gl_vouchers_source
      CHECK (source IN ('LEDGER','MANUAL','OPENING','PAYROLL','EXPENSE','CONTRACTOR','BACKFILL')) NOT VALID;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- کدینگِ پیش‌فرض (دانشگاه ۱) — ۱۷ حسابِ Persian، همه level 1
--   دارایی‌ها (ASSET/DEBIT):
--     1001 صندوق، 1002 بانک و حسابهای نقدی، 1101 حسابهای دریافتنی
--     دانشجویان، 1201 وامهای پرداختی به دانشجویان، 1301 اموال و تجهیزات
--   بدهی‌ها (LIABILITY/CREDIT):
--     2001 حسابهای پرداختنی، 2101 پیشدریافتها، 2201 وامهای دریافتی
--   سرمایه (EQUITY/CREDIT):
--     3001 سرمایه و مانده انتظامی
--   درآمد (REVENUE/CREDIT):
--     4001 درآمد شهریه، 4002 درآمد خدمات آموزشی، 4003 کمکهای خیرین
--   حسابِ کاهندهٔ درآمد (REVENUE ولی DEBIT ⇒ ماندهٔ بدهکار):
--     4101 تخفیفات و بخشودگی
--   هزینه‌ها (EXPENSE/DEBIT):
--     5001 هزینهٔ حقوق و دستمزد، 5002 هزینه‌های عملیاتی،
--     5003 هزینهٔ پیمانکاران، 5004 برگشت وجه و اصلاحات
--
-- اگر دانشگاه ۱ هنوز وجود نداشته باشد (دیتابیسِ خالی)، هیچ ردیفی درج
-- نمی‌شود و اسکریپت نمی‌شکند؛ ماژول ensureDefaultChart در زمان اجرا
-- به‌ازای هر دانشگاه این کار را انجام می‌دهد.
-- ──────────────────────────────────────────────────────────────────

--> statement-breakpoint
INSERT INTO gl_accounts ("universityId", code, name, type, "normalSide", level)
SELECT u.id, v.code, v.name, v.type, v."normalSide", 1
FROM universities u
CROSS JOIN (VALUES
  ('1001', 'صندوق',                          'ASSET',     'DEBIT'),
  ('1002', 'بانک و حسابهای نقدی',            'ASSET',     'DEBIT'),
  ('1101', 'حسابهای دریافتنی دانشجویان',      'ASSET',     'DEBIT'),
  ('1201', 'وامهای پرداختی به دانشجویان',     'ASSET',     'DEBIT'),
  ('1301', 'اموال و تجهیزات',                 'ASSET',     'DEBIT'),
  ('2001', 'حسابهای پرداختنی',               'LIABILITY', 'CREDIT'),
  ('2101', 'پیشدریافتها',                   'LIABILITY', 'CREDIT'),
  ('2201', 'وامهای دریافتی',                 'LIABILITY', 'CREDIT'),
  ('3001', 'سرمایه و مانده انتظامی',          'EQUITY',    'CREDIT'),
  ('4001', 'درآمد شهریه',                     'REVENUE',   'CREDIT'),
  ('4002', 'درآمد خدمات آموزشی',              'REVENUE',   'CREDIT'),
  ('4003', 'کمکهای خیرین و حامیان',           'REVENUE',   'CREDIT'),
  ('4101', 'تخفیفات و بخشودگی',               'REVENUE',   'DEBIT'),
  ('5001', 'هزینهٔ حقوق و دستمزد',            'EXPENSE',   'DEBIT'),
  ('5002', 'هزینه‌های عملیاتی',                'EXPENSE',   'DEBIT'),
  ('5003', 'هزینهٔ پیمانکاران',               'EXPENSE',   'DEBIT'),
  ('5004', 'برگشت وجه و اصلاحات',             'EXPENSE',   'DEBIT')
) AS v(code, name, type, "normalSide")
WHERE u.id = 1
ON CONFLICT ("universityId", code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- قواعدِ ثبتِ پیش‌فرض — پوششِ کاملِ واژگانِ student_ledger
-- (منبع حقیقت: src/lib/ledger-balance.ts + CHECKهای 0075/0137/0139)
--
-- منطقِ حسابداری (علامتِ قراردادِ student_ledger: مثبت = بدهیِ دانشجو):
--   • بدهکارشدنِ دانشجو (شهریه/شارژ) ⇒ Dr 1101 دریافتنی / Cr 4001 درآمد
--       TUITION_FIXED · TUITION_VARIABLE · TUITION_CHARGE · CHARGE ·
--       SUBJECT_ADDITIVE
--   • تخفیف/بیتس (کاهشِ بدهی) ⇒ Dr 4101 تخفیفات / Cr 1101 دریافتنی
--       DISCOUNT_FIXED · DISCOUNT_VARIABLE · SUBJECT_DEDUCTIVE ·
--       TUITION_BATES · TUITION_BATES_FIXED · TUITION_BATES_VARIABLE ·
--       TUITION_BATES_AMOUNT · TUITION_ADJUST_INC
--   • وصولِ نقدی ⇒ Dr 1002 بانک / Cr 1101 دریافتنی
--       PAYMENT · POS_PAYMENT · CREDIT
--   • کمکِ خیرین (وجهِ نقدی از حامی) ⇒ Dr 1002 بانک / Cr 4003 کمکها
--       SPONSORSHIP
--   • وامِ پرداختی به دانشجو ⇒ Dr 1201 وامها / Cr 1002 بانک
--       LOAN
--   • برگشتِ وجهِ کارت‌خوان (خنثی‌کردنِ POS_PAYMENT) ⇒ Dr 1101 / Cr 1002
--       POS_REFUND
--   • تعدیلِ کاهشیِ شهریه (کاهشِ درآمد + کاهشِ دریافتنی) ⇒ Dr 4001 / Cr 1101
--       TUITION_ADJUST_DEC
--
-- هر دو ستونِ debit/credit با کدِ حساب پر می‌شوند تا هر رویداد همیشه
-- یک سندِ متوازن بسازد. eventKey عیناً همان transactionType است.
-- ──────────────────────────────────────────────────────────────────

--> statement-breakpoint
INSERT INTO gl_posting_rules ("universityId", "eventKey", "debitAccountCode", "creditAccountCode")
SELECT u.id, v."eventKey", v."debitAccountCode", v."creditAccountCode"
FROM universities u
CROSS JOIN (VALUES
  -- شهریه/شارژ (افزایشِ بدهیِ دانشجو)
  ('TUITION_FIXED',        '1101', '4001'),
  ('TUITION_VARIABLE',     '1101', '4001'),
  ('TUITION_CHARGE',       '1101', '4001'),
  ('CHARGE',               '1101', '4001'),
  ('SUBJECT_ADDITIVE',     '1101', '4001'),
  -- تخفیف/بیتس/اعتبار (کاهشِ بدهیِ دانشجو)
  ('DISCOUNT_FIXED',       '4101', '1101'),
  ('DISCOUNT_VARIABLE',    '4101', '1101'),
  ('SUBJECT_DEDUCTIVE',    '4101', '1101'),
  ('TUITION_BATES',        '4101', '1101'),
  ('TUITION_BATES_FIXED',  '4101', '1101'),
  ('TUITION_BATES_VARIABLE','4101','1101'),
  ('TUITION_BATES_AMOUNT', '4101', '1101'),
  ('TUITION_ADJUST_INC',   '4101', '1101'),
  -- وصولِ نقدی
  ('PAYMENT',              '1002', '1101'),
  ('POS_PAYMENT',          '1002', '1101'),
  ('CREDIT',               '1002', '1101'),
  -- کمکِ خیرین
  ('SPONSORSHIP',          '1002', '4003'),
  -- وامِ پرداختی به دانشجو
  ('LOAN',                 '1201', '1002'),
  -- برگشتِ وجهِ کارت‌خوان
  ('POS_REFUND',           '1101', '1002'),
  -- تعدیلِ کاهشیِ شهریه
  ('TUITION_ADJUST_DEC',   '4001', '1101')
) AS v("eventKey", "debitAccountCode", "creditAccountCode")
WHERE u.id = 1
ON CONFLICT ("universityId", "eventKey") DO NOTHING;
