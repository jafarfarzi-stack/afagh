-- ══════════════════════════════════════════════════════════════════════
-- 0073 — گسترش CHECK نوع تراکنش دفتر مالی دانشجو
--
-- قید قبلی فقط ۱۰ نوع قدیمی را مجاز می‌دانست و ردیف‌های واقعیِ
-- موتور شهریه (TUITION_CHARGE)، گردش‌کار/شارژ دستی (CHARGE)،
-- بستانکاری (CREDIT)، برگشت POS (POS_REFUND) و شهریهٔ قدیمی بیتس
-- (TUITION_BATES — مهاجرت دادهٔ بعدی با همین نوع درج می‌کند) را در
-- دیتابیس رد می‌کرد؛ درحالی‌که تراز کانونی (ledger-balance.ts) همه را
-- می‌شناسد. این مهاجرت CHECK را با همان ۱۵ نوعِ واژگان کانونی هم‌خط
-- می‌کند تا هیچ نوعِ شناخته‌شده‌ای در درج نریزد.
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "student_ledger" DROP CONSTRAINT IF EXISTS "ck_student_ledger_txn_type";
--> statement-breakpoint
ALTER TABLE "student_ledger" ADD CONSTRAINT "ck_student_ledger_txn_type" CHECK ("transactionType" IN ('TUITION_FIXED','TUITION_VARIABLE','PAYMENT','POS_PAYMENT','DISCOUNT_FIXED','DISCOUNT_VARIABLE','SUBJECT_ADDITIVE','SUBJECT_DEDUCTIVE','SPONSORSHIP','LOAN','TUITION_CHARGE','CHARGE','CREDIT','POS_REFUND','TUITION_BATES'));
