-- ══════════════════════════════════════════════════════════════════════
-- 0025 — کد ترم در سطح دانشگاه (نه سراسری): شمس و نژند کدهای مشترک دارند
-- ────────────────────────────────────────────────────────────────────────
--  مثال: ترم 891 هم در شمس هست هم در نژند (معانی آکادمیک متفاوت).
--  یونیک سراسری باعث می‌شد ترم‌های نژند به ترم شمس لینک شوند!
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "academic_terms" DROP CONSTRAINT IF EXISTS "academic_terms_termCode_unique";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "academic_terms" ADD CONSTRAINT "uq_terms_uni_code" UNIQUE ("universityId","termCode");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
