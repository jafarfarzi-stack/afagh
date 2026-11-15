-- ══════════════════════════════════════════════════════════════════
-- 0137 — زیرنوع‌های تفکیک‌شدهٔ بیتس سما در دفتر مالی
--
-- سما بیتسِ هر نیمسال را در سه ستونِ جدا نگه می‌داشت:
--   • TermAms.Fix_Bates   — بیتسِ شهریهٔ ثابت
--   • TermAms.Units_Bates — بیتسِ شهریهٔ متغیر
--   • TermAms.Mab_Bates   — بیتسِ مبلغی (اعتبارِ موضوعی)
-- مهاجرتِ سال گذشته هر سه را در یک ردیفِ TUITION_BATES جمع می‌کرد؛ در نتیجه
-- کارنامهٔ مالی فقط یک عددِ کلیِ «تخفیف» نشان می‌داد و کارشناس مالی
-- نمی‌توانست تطبیق بدهد که تخفیف بابتِ کدام قلم بوده است.
--
-- این مهاجرت سه نوعِ جدیدِ «اعتبار» را مجاز می‌کند تا ردیف‌های ادغام‌شده
-- به سه زیرنوع بشکنند (اسکریپت scripts/split-tuition-bates.mjs).
-- مقدار و علامت هیچ‌کدام تغییر نمی‌کند ⇒ ماندهٔ هیچ دانشجویی جابه‌جا
-- نمی‌شود؛ فقط گزارشِ کارنامه تفکیک بیشتری نشان می‌دهد.
--
-- منبع حقیقتِ واژگان: src/lib/ledger-balance.ts (CREDIT_LEDGER_TYPES).
-- ══════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "student_ledger" DROP CONSTRAINT IF EXISTS "ck_student_ledger_txn_type";
--> statement-breakpoint
ALTER TABLE "student_ledger" ADD CONSTRAINT "ck_student_ledger_txn_type" CHECK ("transactionType" IN ('TUITION_FIXED','TUITION_VARIABLE','PAYMENT','POS_PAYMENT','DISCOUNT_FIXED','DISCOUNT_VARIABLE','SUBJECT_ADDITIVE','SUBJECT_DEDUCTIVE','SPONSORSHIP','LOAN','TUITION_CHARGE','CHARGE','CREDIT','POS_REFUND','TUITION_BATES','TUITION_ADJUST_DEC','TUITION_ADJUST_INC','TUITION_BATES_FIXED','TUITION_BATES_VARIABLE','TUITION_BATES_AMOUNT'));
