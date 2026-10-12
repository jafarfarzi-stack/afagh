-- ══════════════════════════════════════════════════════════════════
-- 0075 — نوع TUITION_ADJUST در CHECK دفتر مالی
--
-- ستون‌های تعدیل legacy (TMabIncDec + TSUMMab_Subject) که در فرمول
-- TermAcc = TermPays − (fix+units+bates) + adjust وارد می‌شوند.
-- علامت: مثبت = بدهی، منفی = بستانکاری (مبلغ همیشه |adjust| ذخیره می‌شود).
-- ══════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "student_ledger" DROP CONSTRAINT IF EXISTS "ck_student_ledger_txn_type";
--> statement-breakpoint
ALTER TABLE "student_ledger" ADD CONSTRAINT "ck_student_ledger_txn_type" CHECK ("transactionType" IN ('TUITION_FIXED','TUITION_VARIABLE','PAYMENT','POS_PAYMENT','DISCOUNT_FIXED','DISCOUNT_VARIABLE','SUBJECT_ADDITIVE','SUBJECT_DEDUCTIVE','SPONSORSHIP','LOAN','TUITION_CHARGE','CHARGE','CREDIT','POS_REFUND','TUITION_BATES','TUITION_ADJUST'));
