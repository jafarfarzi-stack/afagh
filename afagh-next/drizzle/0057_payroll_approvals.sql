-- ════════════════════════════════════════════════════════════════════════
-- 0057 — زنجیرهٔ تأیید فیش حق‌التدریس (payroll_approvals)
-- ────────────────────────────────────────────────────────────────────────
--  جدول append-only تاریخچهٔ تأیید (هر گذارِ وضعیت = یک ردیف):
--    payroll_approvals(statementId → payroll_statements.id cascade,
--      stage: DEPT_HEAD|DEAN|FINANCE, actorUserId, actorRole,
--      action: APPROVE|REJECT|RETURN, note, createdAt)
--  ▸ وضعیت‌های جدید زنجیره (DRAFT → DEPT_HEAD_APPROVED → DEAN_APPROVED →
--    FINAL_SETTLED + REJECTED) فقط «مقدار» در ستون varchar بدون قیدِ
--    payroll_statements.status هستند؛ پس ALTER روی آن جدول لازم نیست.
--    (فرایند ابلاغ/ابلاغیه عمداً بیرون مانده — به تعویق افتاده است.)
--  ▸ idempotent: IF NOT EXISTS همه‌جا (جدول + ایندکس).
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_approvals" (
  "id" serial PRIMARY KEY NOT NULL,
  "statementId" integer NOT NULL,
  "stage" varchar(20) NOT NULL,
  "actorUserId" integer,
  "actorRole" varchar(30) NOT NULL,
  "action" varchar(20) NOT NULL,
  "note" text,
  "createdAt" timestamp DEFAULT now(),
  CONSTRAINT "payroll_approvals_statementId_payroll_statements_id_fk" FOREIGN KEY ("statementId") REFERENCES "public"."payroll_statements"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "payroll_approvals_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payroll_approvals_statement" ON "payroll_approvals" ("statementId");
