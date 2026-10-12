-- ══════════════════════════════════════════════════════════════════
-- 0075 — انواع TUITION_ADJUST_DEC و TUITION_ADJUST_INC در CHECK دفتر مالی
--
-- ستون‌های تعدیل legacy (TSUMMab_Subject) که در فرمول
-- TermAcc = TermPays − (fix+units) + bates + TSUMMab_Subject وارد می‌شوند:
--   • TUITION_ADJUST_DEC (کاهشی/تخفیف: TSUMMab_Subject < 0) — در CREDIT_LEDGER_TYPES
--   • TUITION_ADJUST_INC (افزایشی/بدهی: TSUMMab_Subject > 0) — در DEBT_LEDGER_TYPES
-- مبلغ در هر دو حالت به صورت قدر مطلق (مثبت) ذخیره می‌شود.
-- ══════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "student_ledger" DROP CONSTRAINT IF EXISTS "ck_student_ledger_txn_type";
--> statement-breakpoint
ALTER TABLE "student_ledger" ADD CONSTRAINT "ck_student_ledger_txn_type" CHECK ("transactionType" IN ('TUITION_FIXED','TUITION_VARIABLE','PAYMENT','POS_PAYMENT','DISCOUNT_FIXED','DISCOUNT_VARIABLE','SUBJECT_ADDITIVE','SUBJECT_DEDUCTIVE','SPONSORSHIP','LOAN','TUITION_CHARGE','CHARGE','CREDIT','POS_REFUND','TUITION_BATES','TUITION_ADJUST_DEC','TUITION_ADJUST_INC'));
