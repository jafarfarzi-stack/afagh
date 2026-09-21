-- ═══════════════════════════════════════════════════════════════
-- فاز ۲: مبالغ موضوعی (سیستم مالی مشابه سما)
--
-- subject_fee_types: کاتالوگ انواع مبالغ موضوعی
--   (هزینه بیمه، حق نظارت، هزینه کارگاه، و غیره)
-- student_subject_fees: تخصیص مبلغ موضوعی به دانشجو
-- ═══════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS subject_fee_types (
  id serial PRIMARY KEY,
  code varchar(40) NOT NULL UNIQUE,
  title varchar(150) NOT NULL,
  -- ADDITIVE = افزایشی (مبلغ اضافه می‌شود), DEDUCTIVE = کاهشی (مبلغ کم می‌شود)
  kind varchar(20) NOT NULL DEFAULT 'ADDITIVE',
  fixed_amount numeric(12,0) NOT NULL DEFAULT 0,
  variable_percent numeric(5,2) NOT NULL DEFAULT 0,
  -- FIXED = فقط روی شهریه ثابت, VARIABLE = فقط روی متغیر, BOTH = هر دو
  applies_to varchar(20) NOT NULL DEFAULT 'BOTH',
  is_active integer NOT NULL DEFAULT 1,
  note text,
  created_at timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS student_subject_fees (
  id serial PRIMARY KEY,
  student_id integer NOT NULL REFERENCES students(id),
  term_id integer NOT NULL REFERENCES academic_terms(id),
  subject_fee_type_id integer NOT NULL REFERENCES subject_fee_types(id),
  amount numeric(12,0) NOT NULL DEFAULT 0,
  is_active integer NOT NULL DEFAULT 1,
  note text,
  created_at timestamp DEFAULT now(),
  UNIQUE(student_id, term_id, subject_fee_type_id)
);
--> statement-breakpoint
DO $$ BEGIN
  COMMENT ON TABLE subject_fee_types IS 'کاتالوگ انواع مبالغ موضوعی شهریه (بیمه، کارگاه، نظارت و غیره)';
EXCEPTION WHEN others THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  COMMENT ON TABLE student_subject_fees IS 'تخصیص مبالغ موضوعی به دانشجویان';
EXCEPTION WHEN others THEN null;
END $$;
