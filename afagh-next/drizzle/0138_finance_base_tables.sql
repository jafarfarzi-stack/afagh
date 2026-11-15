-- ══════════════════════════════════════════════════════════════════
-- 0138 — جداول پایهٔ گزارش‌های مالیِ کلان
--
-- دسته‌هایی از گزارش‌های مالی که در آفاق نبودند و داده‌ای هم برایشان
-- وجود نداشت:
--   C) انحراف بودجه          → financial_budgets
--   F) گزارشات پیمانکاری      → financial_contractors + financial_contracts
--                               + financial_contract_invoices
--   G) مالیات بر ارزش افزوده → financial_vat_entries
--   G) گزارش حقوقی           → legal_cases
--   H) هزینه‌های شرکت        → financial_expenses
--   H) موجودی کالا            → inventory_items + inventory_movements
--
-- همهٔ جدول‌ها دانشگاه‌محور (universityId) هستند و RLS آن‌ها در
-- src/db/pg-hardening.sql تعریف می‌شود (fail-closed).
-- ══════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_budgets" (
  "id" serial PRIMARY KEY NOT NULL,
  "termCode" varchar(10),
  "category" varchar(80) NOT NULL,
  "lineItem" varchar(160) NOT NULL,
  "direction" varchar(12) DEFAULT 'EXPENSE' NOT NULL,
  "amount" numeric(14,0) DEFAULT '0' NOT NULL,
  "description" text,
  "universityId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ck_fin_budgets_direction" CHECK ("direction" IN ('REVENUE','EXPENSE'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fin_budgets_uni" ON "financial_budgets" ("universityId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fin_budgets_term" ON "financial_budgets" ("universityId","termCode");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_contractors" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(160) NOT NULL,
  "identifier" varchar(40),
  "category" varchar(60),
  "phone" varchar(40),
  "address" text,
  "email" varchar(120),
  "notes" text,
  "universityId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fin_contractors_uni" ON "financial_contractors" ("universityId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_contracts" (
  "id" serial PRIMARY KEY NOT NULL,
  "contractorId" integer NOT NULL,
  "contractNo" varchar(60),
  "subject" varchar(240),
  "termId" integer,
  "signedAt" date,
  "amount" numeric(14,0) DEFAULT '0' NOT NULL,
  "paidAmount" numeric(14,0) DEFAULT '0' NOT NULL,
  "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
  "notes" text,
  "universityId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ck_fin_contracts_status" CHECK ("status" IN ('DRAFT','ACTIVE','SETTLED','TERMINATED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fin_contracts_uni" ON "financial_contracts" ("universityId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fin_contracts_contractor" ON "financial_contracts" ("contractorId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_contract_invoices" (
  "id" serial PRIMARY KEY NOT NULL,
  "contractId" integer NOT NULL,
  "invoiceNo" varchar(60),
  "invoiceDate" date,
  "description" text,
  "grossAmount" numeric(14,0) DEFAULT '0' NOT NULL,
  "vatAmount" numeric(14,0) DEFAULT '0' NOT NULL,
  "paidAmount" numeric(14,0) DEFAULT '0' NOT NULL,
  "universityId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fin_contract_inv_uni" ON "financial_contract_invoices" ("universityId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fin_contract_inv_contract" ON "financial_contract_invoices" ("contractId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_expenses" (
  "id" serial PRIMARY KEY NOT NULL,
  "category" varchar(80) NOT NULL,
  "title" varchar(240) NOT NULL,
  "termId" integer,
  "expenseDate" date,
  "documentNo" varchar(60),
  "netAmount" numeric(14,0) DEFAULT '0' NOT NULL,
  "vatAmount" numeric(14,0) DEFAULT '0' NOT NULL,
  "paidAmount" numeric(14,0) DEFAULT '0' NOT NULL,
  "description" text,
  "universityId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fin_expenses_uni" ON "financial_expenses" ("universityId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fin_expenses_term" ON "financial_expenses" ("universityId","termId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_vat_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "source" varchar(30) DEFAULT 'INVOICE' NOT NULL,
  "documentNo" varchar(60),
  "entryDate" date,
  "termId" integer,
  "netAmount" numeric(14,0) DEFAULT '0' NOT NULL,
  "rate" numeric(5,2) DEFAULT '0' NOT NULL,
  "vatAmount" numeric(14,0) DEFAULT '0' NOT NULL,
  "universityId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ck_fin_vat_source" CHECK ("source" IN ('INVOICE','CONTRACT','EXPENSE'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fin_vat_uni" ON "financial_vat_entries" ("universityId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" varchar(40),
  "name" varchar(160) NOT NULL,
  "category" varchar(80),
  "unitName" varchar(30) DEFAULT 'عدد',
  "unitPrice" numeric(14,0) DEFAULT '0' NOT NULL,
  "notes" text,
  "universityId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_items_uni" ON "inventory_items" ("universityId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_movements" (
  "id" serial PRIMARY KEY NOT NULL,
  "itemId" integer NOT NULL,
  "direction" varchar(8) DEFAULT 'IN' NOT NULL,
  "quantity" numeric(14,2) DEFAULT '0' NOT NULL,
  "unitPrice" numeric(14,0) DEFAULT '0' NOT NULL,
  "movementDate" date,
  "description" text,
  "documentNo" varchar(60),
  "universityId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ck_inventory_moves_direction" CHECK ("direction" IN ('IN','OUT'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_moves_item" ON "inventory_movements" ("itemId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_moves_uni" ON "inventory_movements" ("universityId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_cases" (
  "id" serial PRIMARY KEY NOT NULL,
  "caseNo" varchar(60),
  "subject" varchar(240) NOT NULL,
  "caseType" varchar(60),
  "partyName" varchar(160),
  "status" varchar(20) DEFAULT 'OPEN' NOT NULL,
  "amount" numeric(14,0) DEFAULT '0' NOT NULL,
  "openedAt" date,
  "closedAt" date,
  "description" text,
  "universityId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ck_legal_cases_status" CHECK ("status" IN ('OPEN','IN_PROGRESS','CLOSED','SUSPENDED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_legal_cases_uni" ON "legal_cases" ("universityId");
