-- ═══════════════════════════════════════════════════════════════
-- فاز ۱: ضریب افزایشی نیمسال (سیستم مالی مشابه سما)
--
-- جدول tuition_coefficients ضرایب افزایشی ثابت و متغیر را
-- به ازای هر نیمسال نگهداری می‌کند. فرمول:
--   شهریه_نهایی_ثابت = شهریه_خام_ثابت × ضریب_ثابت
--   شهریه_نهایی_متغیر = شهریه_خام_متغیر × ضریب_متغیر
-- ═══════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tuition_coefficients (
  id serial PRIMARY KEY,
  "termId" integer REFERENCES academic_terms(id) UNIQUE,
  "term_id" integer REFERENCES academic_terms(id),
  variable_coefficient numeric(4,2) NOT NULL DEFAULT 1.00,
  fixed_coefficient numeric(4,2) NOT NULL DEFAULT 1.00,
  note text,
  updated_at timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  COMMENT ON TABLE tuition_coefficients IS 'ضرایب افزایشی شهریه به ازای هر نیمسال (مشابه سما)';
EXCEPTION WHEN others THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  COMMENT ON COLUMN tuition_coefficients.variable_coefficient IS 'ضریب افزایش شهریه متغیر (پیش‌فرض ۱.۰۰ = بدون تغییر)';
EXCEPTION WHEN others THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  COMMENT ON COLUMN tuition_coefficients.fixed_coefficient IS 'ضریب افزایش شهریه ثابت (پیش‌فرض ۱.۰۰ = بدون تغییر)';
EXCEPTION WHEN others THEN null;
END $$;
