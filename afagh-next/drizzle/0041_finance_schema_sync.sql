-- 0041_finance_schema_sync.sql
-- همگام‌سازی اسکیما با src/db/schema.ts برای بخش مالی (سیستم سما) + جدول‌های پرداخت/POS
-- کاملاً افزایشی و idempotent (قابل اجرای مجدد). هیچ ستون/قیدی حذف نمی‌شود.
-- نکته: همهٔ شناسه‌های camelCase داخل کوتیشن دوتایی نوشته شده‌اند (PostgreSQL
-- شناسه‌های بدون کوتیشن را به حروف کوچک تبدیل می‌کند و drizzle با کوتیشن 查询 می‌زند).

-- ═══════════════════════════════════════════════════════════════════════
--  ۱) جدول‌های جدید
-- ═══════════════════════════════════════════════════════════════════════

-- نیمسال مالی مستقل (کد ۵ رقمی)
CREATE TABLE IF NOT EXISTS "financial_terms" (
  "id" serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES "universities"("id"),
  "termCode" varchar(10) NOT NULL,
  "title" varchar(100) NOT NULL,
  "academicTermId" integer REFERENCES "academic_terms"("id"),
  "startDate" timestamp NOT NULL,
  "endDate" timestamp NOT NULL,
  "isActive" integer NOT NULL DEFAULT 1,
  "isCurrent" integer DEFAULT 0,
  "sortOrder" integer,
  "note" text,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_fin_terms_uni_code') THEN
    ALTER TABLE "financial_terms" ADD CONSTRAINT "uq_fin_terms_uni_code" UNIQUE ("universityId", "termCode");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_fin_terms_academic" ON "financial_terms" ("academicTermId");

-- نرخ رشد تجمعی شهریه (متغیر/ثابت)
CREATE TABLE IF NOT EXISTS "tuition_growth_rates" (
  "id" serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES "universities"("id"),
  "entryTermId" integer NOT NULL REFERENCES "financial_terms"("id"),
  "currentTermId" integer NOT NULL REFERENCES "financial_terms"("id"),
  "variable_growth_rate" numeric(6,4) NOT NULL,
  "fixed_growth_rate" numeric(6,4) NOT NULL,
  "computed_at" timestamp DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_growth_rates_uni_entry_current') THEN
    ALTER TABLE "tuition_growth_rates" ADD CONSTRAINT "uq_growth_rates_uni_entry_current" UNIQUE ("universityId", "entryTermId", "currentTermId");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_growth_rates_entry" ON "tuition_growth_rates" ("entryTermId");
CREATE INDEX IF NOT EXISTS "idx_growth_rates_current" ON "tuition_growth_rates" ("currentTermId");

-- درگاه‌های پرداخت آنلاین
CREATE TABLE IF NOT EXISTS "payment_gateways" (
  "id" serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES "universities"("id"),
  "code" varchar(40) NOT NULL,
  "title" varchar(100) NOT NULL,
  "isActive" integer NOT NULL DEFAULT 1,
  "isSandbox" integer NOT NULL DEFAULT 1,
  "config" jsonb NOT NULL DEFAULT '{}',
  "sortOrder" integer DEFAULT 0,
  "note" text,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_payment_gateway_uni_code') THEN
    ALTER TABLE "payment_gateways" ADD CONSTRAINT "uq_payment_gateway_uni_code" UNIQUE ("universityId", "code");
  END IF;
END $$;

-- تراکنش‌های پرداخت آنلاین
CREATE TABLE IF NOT EXISTS "payment_transactions" (
  "id" serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES "universities"("id"),
  "studentId" integer NOT NULL REFERENCES "students"("id"),
  "termId" integer REFERENCES "academic_terms"("id"),
  "financialTermId" integer REFERENCES "financial_terms"("id"),
  "gatewayId" integer NOT NULL REFERENCES "payment_gateways"("id"),
  "authority" varchar(100) NOT NULL,
  "amount" numeric(12,0) NOT NULL,
  "description" text,
  "status" varchar(20) NOT NULL DEFAULT 'INITIATED',
  "gateway_status" varchar(50),
  "bank_ref_id" varchar(50),
  "card_pan" varchar(20),
  "payer_name" varchar(100),
  "payer_mobile" varchar(15),
  "payer_email" varchar(100),
  "client_ip" varchar(45),
  "user_agent" text,
  "expires_at" timestamp,
  "verified_at" timestamp,
  "ledgerTxnId" integer,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_payment_txn_authority') THEN
    ALTER TABLE "payment_transactions" ADD CONSTRAINT "uq_payment_txn_authority" UNIQUE ("authority");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_payment_txn_student" ON "payment_transactions" ("studentId");
CREATE INDEX IF NOT EXISTS "idx_payment_txn_term" ON "payment_transactions" ("termId");
CREATE INDEX IF NOT EXISTS "idx_payment_txn_fin_term" ON "payment_transactions" ("financialTermId");
CREATE INDEX IF NOT EXISTS "idx_payment_txn_status" ON "payment_transactions" ("status");
CREATE INDEX IF NOT EXISTS "idx_payment_txn_gateway" ON "payment_transactions" ("gatewayId");

-- ترمینال‌های POS حضوری
CREATE TABLE IF NOT EXISTS "pos_terminals" (
  "id" serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES "universities"("id"),
  "code" varchar(40) NOT NULL,
  "title" varchar(100) NOT NULL,
  "location" varchar(200),
  "gatewayId" integer NOT NULL REFERENCES "payment_gateways"("id"),
  "terminal_id" varchar(50) NOT NULL,
  "merchant_id" varchar(50) NOT NULL,
  "config" jsonb NOT NULL DEFAULT '{}',
  "isActive" integer NOT NULL DEFAULT 1,
  "lastHeartbeatAt" timestamp,
  "firmware_version" varchar(50),
  "sortOrder" integer DEFAULT 0,
  "note" text,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_pos_terminal_uni_code') THEN
    ALTER TABLE "pos_terminals" ADD CONSTRAINT "uq_pos_terminal_uni_code" UNIQUE ("universityId", "code");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_pos_terminal_tid') THEN
    ALTER TABLE "pos_terminals" ADD CONSTRAINT "uq_pos_terminal_tid" UNIQUE ("terminal_id");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_pos_terminal_gateway" ON "pos_terminals" ("gatewayId");

-- تراکنش‌های POS
CREATE TABLE IF NOT EXISTS "pos_transactions" (
  "id" serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES "universities"("id"),
  "studentId" integer NOT NULL REFERENCES "students"("id"),
  "termId" integer REFERENCES "academic_terms"("id"),
  "financialTermId" integer REFERENCES "financial_terms"("id"),
  "terminalId" integer NOT NULL REFERENCES "pos_terminals"("id"),
  "stan" varchar(20) NOT NULL,
  "rrn" varchar(20),
  "amount" numeric(12,0) NOT NULL,
  "txn_type" varchar(20) NOT NULL DEFAULT 'SALE',
  "entry_mode" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'APPROVED',
  "response_code" varchar(10),
  "response_message" varchar(200),
  "card_pan" varchar(20),
  "cardholder_name" varchar(200),
  "operator_id" integer REFERENCES "users"("id"),
  "ledgerTxnId" integer,
  "note" text,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_pos_txn_student" ON "pos_transactions" ("studentId");
CREATE INDEX IF NOT EXISTS "idx_pos_txn_terminal" ON "pos_transactions" ("terminalId");
CREATE INDEX IF NOT EXISTS "idx_pos_txn_status" ON "pos_transactions" ("status");
CREATE INDEX IF NOT EXISTS "idx_pos_txn_fin_term" ON "pos_transactions" ("financialTermId");

-- ═══════════════════════════════════════════════════════════════════════
--  ۲) ستون‌های جاافتاده روی جدول‌های موجود
-- ═══════════════════════════════════════════════════════════════════════

-- دفتر مالی: ارجاع به نیمسال مالی + قالب ۱۰ نوع تراکنش سما
-- NOTE: مقادیر legacy ('CHARGE','TUITION_CHARGE','PAYMENT','CREDIT') هم پذیرفته می‌شوند
-- چون کد موجود (finance-rules) هنوز آن‌ها را می‌نویسد.
ALTER TABLE "student_ledger" ADD COLUMN IF NOT EXISTS "financialTermId" integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_ledger_financialTermId_financial_terms_id_fk') THEN
    ALTER TABLE "student_ledger" ADD CONSTRAINT "student_ledger_financialTermId_financial_terms_id_fk"
      FOREIGN KEY ("financialTermId") REFERENCES "financial_terms"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_student_ledger_txn_type') THEN
    ALTER TABLE "student_ledger" ADD CONSTRAINT "ck_student_ledger_txn_type" CHECK (
      "transactionType" IN (
        'TUITION_FIXED','TUITION_VARIABLE','PAYMENT','POS_PAYMENT',
        'DISCOUNT_FIXED','DISCOUNT_VARIABLE','SUBJECT_ADDITIVE','SUBJECT_DEDUCTIVE',
        'SPONSORSHIP','LOAN',
        'CHARGE','TUITION_CHARGE','CREDIT'
      )
    ) NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_student_ledger_fin_term" ON "student_ledger" ("financialTermId");

-- مساعده بازه‌ای: بازهٔ نیمسال + تفکیک درصد شهریهٔ ثابت/متغیر
ALTER TABLE "student_sponsorships" ADD COLUMN IF NOT EXISTS "financialTermId" integer;
ALTER TABLE "student_sponsorships" ADD COLUMN IF NOT EXISTS "startTermId" integer;
ALTER TABLE "student_sponsorships" ADD COLUMN IF NOT EXISTS "endTermId" integer;
ALTER TABLE "student_sponsorships" ADD COLUMN IF NOT EXISTS "fixed_percent" numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "student_sponsorships" ADD COLUMN IF NOT EXISTS "variable_percent" numeric(5,2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_sponsorships_financialTermId_financial_terms_id_fk') THEN
    ALTER TABLE "student_sponsorships" ADD CONSTRAINT "student_sponsorships_financialTermId_financial_terms_id_fk"
      FOREIGN KEY ("financialTermId") REFERENCES "financial_terms"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_sponsorships_startTermId_financial_terms_id_fk') THEN
    ALTER TABLE "student_sponsorships" ADD CONSTRAINT "student_sponsorships_startTermId_financial_terms_id_fk"
      FOREIGN KEY ("startTermId") REFERENCES "financial_terms"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_sponsorships_endTermId_financial_terms_id_fk') THEN
    ALTER TABLE "student_sponsorships" ADD CONSTRAINT "student_sponsorships_endTermId_financial_terms_id_fk"
      FOREIGN KEY ("endTermId") REFERENCES "financial_terms"("id");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_student_sponsorships_fin_term" ON "student_sponsorships" ("financialTermId");
CREATE INDEX IF NOT EXISTS "idx_student_sponsorships_start_end" ON "student_sponsorships" ("startTermId", "endTermId");

-- قواعد شهریه: دانشکده، نیمسال ورود/جاری، فاز بالینی، حداقل واحد تابستان، درصد زیر حد
ALTER TABLE "tuition_rules" ADD COLUMN IF NOT EXISTS "facultyId" integer;
ALTER TABLE "tuition_rules" ADD COLUMN IF NOT EXISTS "entryTermId" integer;
ALTER TABLE "tuition_rules" ADD COLUMN IF NOT EXISTS "currentTermId" integer;
ALTER TABLE "tuition_rules" ADD COLUMN IF NOT EXISTS "clinicalPhase" varchar(20) DEFAULT 'NORMAL';
ALTER TABLE "tuition_rules" ADD COLUMN IF NOT EXISTS "minSummerUnits" integer;
ALTER TABLE "tuition_rules" ADD COLUMN IF NOT EXISTS "percentUnderMin" numeric(5,2);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_rules_facultyId_faculties_id_fk') THEN
    ALTER TABLE "tuition_rules" ADD CONSTRAINT "tuition_rules_facultyId_faculties_id_fk"
      FOREIGN KEY ("facultyId") REFERENCES "faculties"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_rules_entryTermId_financial_terms_id_fk') THEN
    ALTER TABLE "tuition_rules" ADD CONSTRAINT "tuition_rules_entryTermId_financial_terms_id_fk"
      FOREIGN KEY ("entryTermId") REFERENCES "financial_terms"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_rules_currentTermId_financial_terms_id_fk') THEN
    ALTER TABLE "tuition_rules" ADD CONSTRAINT "tuition_rules_currentTermId_financial_terms_id_fk"
      FOREIGN KEY ("currentTermId") REFERENCES "financial_terms"("id");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_tuition_rules_entry_term" ON "tuition_rules" ("entryTermId");
CREATE INDEX IF NOT EXISTS "idx_tuition_rules_current_term" ON "tuition_rules" ("currentTermId");
CREATE INDEX IF NOT EXISTS "idx_tuition_rules_faculty" ON "tuition_rules" ("facultyId");
CREATE INDEX IF NOT EXISTS "idx_tuition_rules_clinical" ON "tuition_rules" ("clinicalPhase");

-- ضرایب افزایشی نیمسال: ارجاع به نیمسال مالی
ALTER TABLE "tuition_coefficients" ADD COLUMN IF NOT EXISTS "financialTermId" integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_coefficients_financialTermId_financial_terms_id_fk') THEN
    ALTER TABLE "tuition_coefficients" ADD CONSTRAINT "tuition_coefficients_financialTermId_financial_terms_id_fk"
      FOREIGN KEY ("financialTermId") REFERENCES "financial_terms"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tuition_coeff_fin_term') THEN
    ALTER TABLE "tuition_coefficients" ADD CONSTRAINT "uq_tuition_coeff_fin_term" UNIQUE ("financialTermId");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_tuition_coeff_fin_term" ON "tuition_coefficients" ("financialTermId");

-- مبالغ موضوعی: ارجاع به نیمسال مالی
ALTER TABLE "student_subject_fees" ADD COLUMN IF NOT EXISTS "financial_term_id" integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_subject_fees_financial_term_id_financial_terms_id_fk') THEN
    ALTER TABLE "student_subject_fees" ADD CONSTRAINT "student_subject_fees_financial_term_id_financial_terms_id_fk"
      FOREIGN KEY ("financial_term_id") REFERENCES "financial_terms"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_student_subject_fees_fin') THEN
    ALTER TABLE "student_subject_fees" ADD CONSTRAINT "uq_student_subject_fees_fin"
      UNIQUE ("student_id", "financial_term_id", "subject_fee_type_id");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_student_subject_fees_fin_term" ON "student_subject_fees" ("financial_term_id");