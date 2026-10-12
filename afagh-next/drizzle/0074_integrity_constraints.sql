-- ══════════════════════════════════════════════════════════════════
-- 0074 — قیدهای یکپارچگی مالی/حقوقی (هم‌تراز با schema.ts پس از موج امنیتی)
--
-- پیش‌شروط روی سرور پیش از نوشتن این فایل سنجیده شد (همه صفر):
--   • ردیف تکراری TUITION_CHARGE per (studentId, termId): 0
--   • status نامعتبر payroll_statements: 0
--   • ledgerTxnId یتیم در payment_cheques / pos_transactions: 0
-- بنابراین ADD CONSTRAINT/INDEX مستقیم و بدون NOT VALID امن است.
-- ══════════════════════════════════════════════════════════════════

--> statement-breakpoint
-- 🔒 شارژ شهریهٔ هر ترم یکتاست (بک‌استاپِ chargeTermTuition اتمیک)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_ledger_tuition_charge"
  ON "student_ledger" ("studentId", "termId", "transactionType")
  WHERE "transactionType" = 'TUITION_CHARGE';
--> statement-breakpoint
-- 🔒 وضعیت فیش فقط از ماشین حالت زنجیرهٔ تأیید (NULL قدیمی مجاز)
ALTER TABLE "payroll_statements" DROP CONSTRAINT IF EXISTS "ck_payroll_statements_status";
--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD CONSTRAINT "ck_payroll_statements_status"
  CHECK ("status" IN ('DRAFT','MID_TERM_PAID','DEPT_HEAD_APPROVED','DEAN_APPROVED','FINAL_SETTLED','REJECTED'));
--> statement-breakpoint
-- 🔒 ارجاع دفتر مالی باید به تراکنش واقعی باشد
ALTER TABLE "payment_cheques" DROP CONSTRAINT IF EXISTS "payment_cheques_ledgerTxnId_student_ledger_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_cheques" ADD CONSTRAINT "payment_cheques_ledgerTxnId_student_ledger_id_fk"
  FOREIGN KEY ("ledgerTxnId") REFERENCES "student_ledger"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "pos_transactions" DROP CONSTRAINT IF EXISTS "pos_transactions_ledgerTxnId_student_ledger_id_fk";
--> statement-breakpoint
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_ledgerTxnId_student_ledger_id_fk"
  FOREIGN KEY ("ledgerTxnId") REFERENCES "student_ledger"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
