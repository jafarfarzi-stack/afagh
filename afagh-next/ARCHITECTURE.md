# معماری مالی آفاق (afagh-next) — خلاصه پیاده‌سازی FINAL

**برنچ:** `FINAL` | **کامیت:** `de4f2b5` | **تاریخ:** ۱۴۰۳/۰۷/۱۱

---

## ۱. جداول جدید / گسترش‌یافته در `src/db/schema.ts`

| جدول | توضیح | فیلدهای کلیدی اضافه‌شده |
|-------|-------|------------------------|
| `financial_terms` | نیمسال مالی مجزا (کد ۵ رقمی) | `termCode`, `startDate`, `endDate`, `academicTermId`, `isCurrent`, `sortOrder` |
| `tuition_rules` (گسترش) | قواعد شهریه یکپارچه | `minSummerUnits`, `percentUnderMin`, `entryTermId`, `currentTermId`, `facultyId`, `clinicalPhase` |
| `tuition_growth_rates` | نرخ رشد تجمعی شهریه | `entryTermId`, `currentTermId`, `variableGrowthRate`, `fixedGrowthRate` |
| `student_ledger` (گسترش) | دفتر مالی ۱۰ نوعه | `transactionType` با CHECK: `TUITION_FIXED`, `TUITION_VARIABLE`, `PAYMENT`, `POS_PAYMENT`, `DISCOUNT_FIXED`, `DISCOUNT_VARIABLE`, `SUBJECT_ADDITIVE`, `SUBJECT_DEDUCTIVE`, `SPONSORSHIP`, `LOAN` |
| `student_sponsorships` (گسترش) | مساعده بازه‌ای | `startTermId`, `endTermId`, `fixedPercent`, `variablePercent` |
| `payment_gateways` | درگاه‌های پرداخت آنلاین | `code`, `config` (JSON), `isSandbox` |
| `payment_transactions` | تراکنش‌های آنلاین | `authority`, `gatewayId`, `status`, `bankRefId`, `ledgerTxnId` |
| `pos_terminals` | ترمینال‌های POS حضوری | `terminalId`, `merchantId`, `gatewayId`, `config` |
| `pos_transactions` | تراکنش‌های POS | `stan`, `rrn`, `entryMode`, `cardPan`, `operatorId` |

---

## ۲. موتور شهریه (`src/lib/tuition-resolver.ts`)

**اولویت‌بندی جدید (از پرآهنگ‌ترین به کم‌آهنگ‌ترین):**
1. مقطع (`degreeLevelId`)
2. رشته (`majorId`)
3. دانشکده (`facultyId`)
4. نوع ترم (`termType`)
5. نوع گذراندن درس (`offeringType`)
6. فاز بالینی (`clinicalPhase`: NORMAL | CLINICAL | INTERNSHIP)
7. بازهٔ ورودی (`entryYearFrom/To`)
8. نیمسال ورود (`entryTermId`)
9. نیمسال جاری (`currentTermId`)

**گره‌شکن‌ها:** `priority` (کوچک‌تر) → `entryYearFrom` (جدیدتر) → `id` (کوچک‌تر)

**خروجی `ratesOf()` شامل:**
```ts
{ fixed, theory, practical, general, minSummerUnits, percentUnderMin }
```

---

## ۳. گیت‌های مالی

### انتخاب واحد (`src/lib/enroll-engine.ts`)
- بررسی `financial_clearances` روی `financial_term` جاری
- آستانه بدهی قابل تنظیم: `ENROLLMENT_DEBT_THRESHOLD` (پیش‌فرض ۰)
- اگر بدهی > آستانه → قفل انتخاب واحد

### دفتر مالی (`student_ledger`)
۱۰ نوع تراکنش دقیق برای گزارش‌گیری ۹ مشخصه سما

---

## ۴. پرداخت‌ها

### آنلاین
- `payment_gateways`: زرین‌پال، ملت، سامان، پارسیان، پاسارگاد، صاد
- `payment_transactions`: ردیابی کامل از `INITIATED` تا `VERIFIED`/`FAILED`

### POS حضوری (کارت‌خوان فیزیکی)
- `pos_terminals`: TID/MID، کانفیگ IP/پورت، heartbeat
- `pos_transactions`: STAN/RRN، entryMode (CHIP/CONTACTLESS/MAGSTRIPE)، void پشتیبانی

---

## ۵. گزارش‌ها

### صورت حساب ۹ مشخصه (`/admin/finance/reports/student-statement`)
| مشخصه | فیلد ledger |
|---------|-------------|
| شهریه ثابت | TUITION_FIXED |
| شهریه متغیر | TUITION_VARIABLE |
| تخفیف ثابت | DISCOUNT_FIXED |
| تخفیف متغیر | DISCOUNT_VARIABLE |
| مبالغ موضوعی افزایشی | SUBJECT_ADDITIVE |
| مبالغ موضوعی کاهشی | SUBJECT_DEDUCTIVE |
| پوشش بنیاد/بورسیه | SPONSORSHIP |
| پرداختی آنلاین | PAYMENT |
| پرداختی POS | POS_PAYMENT |
| وام | LOAN |

**امکانات:** جدول/نمودار Chart.js/CSV export/Text export/Print-to-PDF

---

## ۶. RBAC Runtime Enforcement (`src/lib/permissions-enforcer.ts`)

- `requirePermissionApi/Page` — گارد API/Page
- `canAccessField(userId, resource, field, 'read'|'write')` — سطح فیلد
- `withPermissionCheck(handler, perm)` — HOF برای اکشن‌ها
- کش ۵ دقیقه‌ای، انقضای خودکار

---

## ۷. انتخاب واحد دانشجو — نمایش شهریه

`src/app/student/enroll/page.tsx` + `EnrollClient.tsx`:
- بارگذاری تمام `tuition_rules` فعال
- resolver با کانتکست دانشجو (مقطع، رشته، دانشکده، financial_term جاری)
- نمایش در کارت درس: `tuitionFixed`, `tuitionVariable`, `tuitionPerUnit`, `tuitionTotal`

---

## ۸. اسکریپت‌های جدید (`package.json`)

```json
"db:growth-rates": "node scripts/compute-tuition-growth-rates.mjs",
"db:seed:pos": "node scripts/seed-pos.mjs",
"db:migrate:legacy-tuition": "node scripts/migrate-legacy-tuition.mjs"
```

---

## ۹. منوی ادمین (`src/lib/admin-modules.ts`)

| مسیر | آیکون | نقش |
|------|-------|------|
| `/admin/finance/pos` | 🏧 | ترمینال‌های POS (فروش/ویدی/گزارش) |
| `/admin/finance/reports/student-statement` | 📄 | صورت حساب ۹ مشخصه |

---

## ۱۰. اسکریپت‌ها

| فایل | کارکرد |
|------|--------|
| `scripts/compute-tuition-growth-rates.mjs` | محاسبه نرخ رشد تجمعی از `tuition_coefficients` |
| `scripts/seed-pos.mjs` | بذر درگاه‌ها (۶ گیت) + ۲ ترمینال POS پیش‌فرض |
| `scripts/migrate-legacy-tuition.mjs` | مهاجرت `tuition_formulas` + `tuition_fee_rules` → `tuition_rules` |

---

## ۱۱. Deploy روی سرور (`lx.afagh.ac.ir`)

```bash
cd /opt/afagh-next
git fetch origin && git checkout FINAL && git pull origin FINAL
npm ci
npm run db:push
npm run db:seed:pos
npm run db:growth-rates
npm run build
systemctl restart afagh-next   # یا pm2/docker
```

---

## ۱۲. فایل‌های کلیدی تغییر یافته

```
src/db/schema.ts                    (+7 tables, +3 extended)
src/lib/tuition-resolver.ts         (rewrite کامل)
src/lib/enroll-engine.ts            (financial gate)
src/app/student/enroll/page.tsx     (tuition resolver integration)
src/app/student/enroll/EnrollClient.tsx (tuition display)
src/lib/admin-modules.ts            (+2 menu items)
src/app/admin/finance/pos/          (POS UI)
src/app/admin/finance/reports/      (9-field statement)
src/app/api/payment/pos/            (POS API)
src/lib/permissions-enforcer.ts     (RBAC runtime)
src/lib/export-utils.ts             (CSV/Text export)
scripts/*.mjs                       (3 scripts)
```

---

## ۱۳. دستورالعمل جلسه بعد

```bash
# در opencode (همین پوشه):
> خلاصه FINAL رو بده
> یا: ARCHITECTURE.md رو باز کن
```

یا مستقیماً فایل `ARCHITECTURE.md` رو بخون.