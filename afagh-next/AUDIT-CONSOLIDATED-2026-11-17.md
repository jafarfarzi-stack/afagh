# جمع‌بندی ممیزی چند‌ایجنه‌ای — ۱۴۰۵/۰۸/۲۷

> حاصل ~۴۰ ایجنت تخصصی روی: گزارش‌ها (UI/UX، فیلتر، چاپ، CSV)، کارایی کارتابل مالی،
> ایزنتنسی، مدیر گروه، انتخاب واحد، ثبت نمرات، تحصیلات تکمیلی، برنامه‌ریزی درسی،
> MinIO/بایگانی، و برچسب‌های انگلیسی. اعداد کارایی با EXPLAIN ANALYZE روی تولید.

---

## ۰) وضعیت پیاده‌سازی (این سشن)

| کامیت | موضوع | وضعیت |
|---|---|---|
| `24ea1727` | سقف تخفیف در سطح (دانشجو × ترم) | ✅ verified |
| `60cd29e8` | پیش‌فرض «در حال تحصیل» + فیلتر فعال اساتید | ✅ verified |
| `b1575d97` | بازطراحی قفسهٔ کارت‌ها (۱۳ مورد) | ✅ verified |
| `997bde76` | بستن نشت‌های IDOR (۹ مسیر) | ✅ verified |
| `1c5c8663` | رفع دو خطای بیلد | ✅ verified |
| `5c55b9b3` | درستی چاپ/CSV (ریست چاپ، برچسب ناقص، pageSize، CSV عددی) | ✅ verified |

**اندازه‌گیری تولید:** تجمیع دفتر مالی برای ۲۰۰۰ دانشجو = **۳۶۹ms**، count = ۱۵ms،
dropdown ورودی = ۵۲ms، base students = ۴۴ms. چهار جدول جانبی (چک/وام/تخفیف/پوشش)
روی تولید ایندکس دارند و **خالی‌اند** (۰ ردیف).

---

## ۱) اولویت صفر — باید قبل از هر چیز دیگری بسته شوند

### امنیت / ایزنتنسی
| # | مورد | محل | وضعیت |
|---|---|---|---|
| S1 | پروندهٔ فراغت: خواندن/تغییر با `auditId` دلخواه | `graduation-engine.ts` | ✅ بسته شد |
| S2 | API تأیید ثبت‌نام: `studentId`/`offeringId` بیگانه + PATCH/DELETE | `enrollment-approvals/route.ts` | ✅ |
| S3 | اکشن امتحان: سانس/ارائهٔ دانشگاه دیگر | `exams/actions.ts` | ✅ |
| S4 | override شهریه با id/studentId دلخواه | `student-formula/route.ts` | ✅ |
| S5 | تسویهٔ تمبر/دانش‌آموختگی در دفتر مالی دانشگاه دیگر | `graduation-engine.ts`, `alumni.ts` | ✅ |
| S6 | `studentWhere` با شاخهٔ `OR universityId IS NULL` | `report-helpers.ts` | ✅ |
| S7 | ایمپورت سنجش بدون `universityId` | `admissions-engine.ts` | ✅ |
| S8 | fail-open ها (graduation list/stats، staff-data، terms) | چند فایل | ✅ |
| S9 | **باقی‌مانده:** grants `?student`/`?major` بدون scope | `group-manager/grants/page.tsx:56,76` | ⬜ |
| S10 | **باقی‌مانده:** inbox معادلسازی کل دانشگاه | `group-manager/equivalence/page.tsx:35` | ⬜ |
| S11 | **باقی‌مانده:** action معادلسازی با requestId/step دلخواه | `equivalence/actions.ts:83` | ⬜ |
| S12 | **باقی‌مانده:** `DEP_HEAD` بدون `headStaffId` = اختیار کامل | `group-manager.ts:54-63` | ⬜ |
| S13 | **باقی‌مانده:** `getSchedulingHealth/RoomGrants` بدون deptScope | `admin/scheduling/actions.ts:1439,1578` | ⬜ |
| S14 | **باقی‌مانده:** MinIO با کاربر root + بکاپ در همان bucket | `objectStore.ts:24`, `backup-actions.ts:316` | ⬜ |

### چاپ و خروجی
| # | مورد | محل | وضعیت |
|---|---|---|---|
| P1 | چاپ گزارش دوم با دادهٔ اول | `ReportPrint.tsx` | ✅ |
| P2 | چاپ ناقص بدون برچسب | `ReportPrint.tsx` | ✅ |
| P3 | سقف ۳۰۰۰ ردیف/ترم بی‌صدا | `actions.ts:243` | ✅ |
| P4 | `runPaged` با PER=50 → سقف ۱۰۰۰ | `r-finance-statements.ts:921` | ✅ |
| P5 | مبالغ CSV به‌صورت متن | `actions.ts:815` | ✅ |
| P6 | **باقی‌مانده:** سه ماژول دیگر `pageSize` را نادیده می‌گیرند | `r-collect-external.ts:26`, `r-edu-schedule.ts:282`, `r-edu-roster.ts:172` | ⬜ |
| P7 | **باقی‌مانده:** چاپ/CSV با فیلتر فعلی، جدول با نتیجهٔ قبلی | `ReportsClient.tsx` | ⬜ |
| P8 | **باقی‌مانده:** مبلغ منفی «۱٬۰۰۰-» و واحد ریال در هر سلول | `report-format.ts:40` | ⬜ |
| P9 | **باقی‌مانده:** شناسه‌ها با ارقام فارسی چاپ می‌شوند | `ReportPrint.tsx:226` | ⬜ |
| P10 | **باقی‌مانده:** چاپ چنده‌ترمی برای هر صفحه کل ادغام را از نو اجرا می‌کند | `actions.ts:764` | ⬜ |

### درستی عددی گزارش‌های مالی
| # | مورد |
|---|---|
| N1 | جریان نقدی: `otherPayments=0` (هزینه/پیمانکار دیده نمی‌شود) + حقیقت‌التدریس بدون فیلتر ترم |
| N2 | ترازنامه: وام = `GREATEST(ln−pay,0)` نه ماندهٔ واقعی؛ تراز با plug بسته می‌شود |
| N3 | سود و زیان: ترم بدون ردیف دفتری → هزینه ۰؛ «سایر درآمد» همیشه ۰ |
| N4 | سند حسابداری: بدهکار≠بستانکار؛ همهٔ اسنادِ بدون شماره در یک ردیف «—» |
| N5 | دفتر کل/روزنامه: بدون تاریخ/شماره سند/شرح/ماندهٔ جاری |
| N6 | نرخ وصول کارتابل مالی: چک وصول‌شده دو بار (payments + chequesCleared) |
| N7 | KPI کارتابل: `SPONSORSHIP/LOAN/CREDIT` به «جمع تخفیف» می‌روند |
| N8 | سقف خلاصه ۲۰۰۰ نفر (آفاق ۳۹٬۹۵۴ → ۵٪) و `onlyDebtors` بعد از LIMIT |

---

## ۲) کارایی کارتابل مالی (اندازه‌گیری‌شده)

| اقدام | اثر |
|---|---|
| **ایندکس `student_ledger (studentId, termId, transactionType) INCLUDE (amount)`** | **۳۶۹ms → ~۲۰ms** |
| ادغام `listFinanceStudents` + `summarizeFinanceStudents` + count در یک CTE | ۱۶ کوئری → ۲ |
| کش ۶۰ ثانیه‌ای خلاصه (کلید = دانشگاه/ترم/فیلترها) | ~۸۰٪ زمان DB |
| `idx_students_uni_entryyear` | dropdown ۵۲ms → ~۱ms |
| Suspense + استریم (الگوی `admin/page.tsx`) | TTFB/FCP محسوس |
| حذف رندر دوبارهٔ جدول (دسکتاپ + MobileCardList) | ~۵۰٪ HTML |
| یکسان‌سازی session JOIN (دو بار در هر درخواست) | ۱ کوئری |
| `getSiblingAccounts` ۴ کوئری در هر صفحهٔ ادمین | −۳ کوئری |
| باگ RBAC: بعد از invalidate، مجوزها تا ۵ دقیقه خالی می‌شوند | باگ دسترسی |
| **باگ:** چاپ کارتابل صفر ردیف (`hidden md:block` + `@media screen`) | عملکرد |

---

## ۳) UI/UX گزارش‌ها

**انجام شد (`b1575d97`):** تب «همه» + شمارنده، جست‌وجوی سراسری، شکستن دستهٔ پژوهش،
زیرگروه‌ها، توضیح کارت، نشان «نیازمند ترم»، aria تب/کارت، فوکوس و اعلام نتیجه،
رفع باگ انتخاب تب، پاک‌شدن فیلتر سفارشی.

**باقی‌مانده:**
- مانیفست فیلتر per-kind به‌جای `COURSE_LEVEL_KINDS` (منبع واحد UI+سرور).
- فیلترهای کلاس/استاد: استاد، روز، سالن، درس (اکنون فقط term + q).
- `attendance-list` هنوز کل بلوک دانشجویی را نشان می‌دهد.
- «همهٔ ترم‌ها» در چند گزارش بی‌صدا = آخرین ترم.
- صفحه‌بندی از مسیر `run()` رد نمی‌شود (بدون loading/error).
- `mcurrات` نگهبان: ۳۳ کنترل بدون نام، تب بدون role، کنتراست ۲٫۴:۱ روی «به‌زودی».
- ترتیب فیلتر بر موبایل: ~۷۰۰px پایین‌تر از شروع صفحه.

---

## ۴) مدیر گروه

- صفحهٔ اصلی فقط فرم تعریف درس است (بدون داشبورد/صف کار).
- معادلسازی و grants بدون محدودهٔ گروه/دانشگاه (S9–S11).
- هیچ تأییدیه‌ای برای حذف درس/ارائه/جلسه/بورس/اعمال گروهی وجود ندارد (ConfirmProvider آماده است).
- bypass: تأیید یک‌کلیکی، بدون دلیل، بدون جلوگیری از تأیید درخواست خود.
- ۳۴ کنترل بدون accessible name؛ جدول‌های grants/classrooms بدون نسخهٔ موبایل.
- `back()` پارامترهای جست‌وجو را از دست می‌دهد ⇒ بعد از هر ذخیره باید مسیر را دوباره طی کرد.
- بدون Suspense؛ ۱۰ await سریالی در offerings.

---

## ۵) انتخاب واحد

- **دکمهٔ حذف وجود ندارد** (UI حذف نشده؛ DropButton یتیم است) — دانشجو نمی‌تواند درس اشتباه را بردارد.
- سقف واحد در UI **هاردکد ۲۰** است؛ دانشجوی ممتاز (۲۴) بلاک می‌شود، مشروط (۱۴) بی‌اخطار رد می‌شود.
- `enrollOpen` محاسبه می‌شود ولی به کلاینت داده نمی‌شود ⇒ UI باز، سرور بسته.
- `referCouncilAction` ثبت‌نام کامل بدون هیچ قاعده‌ای (ظرفیت/پیش‌نیاز/سقف).
- پیش‌نیازهای متنی و هم‌نیاز (COREQ) اصلاً اعمال نمی‌شوند؛ واحدهای معادلسازی پیش‌نیاز را برنمی‌آورند.
- ظرفیت: مسیرهای manual/bulk/transfer بدون claim اتمیک ⇒ overbooking و drift شمارنده.
- جست‌وجو/فیلتر استاد و روز در کاتالوگ نیست؛ هر افزودن = refresh کل صفحه.

---

## ۶) ثبت نمرات

- **نمرات جزئی (میان‌ترم/پایان‌ترم/…) ذخیره نمی‌شوند**؛ `gradeValue` با آخرین جزء بازنویسی می‌شود.
- پذیرش اعتراض، نمرهٔ دانشجو را **۰** می‌کند (چون اجزا خالی‌اند).
- finalize بدون هیچ اعتبارسنجی (نمرهٔ NULL هم نهایی می‌شود).
- هم‌تدریسی: اولین امضا قفل می‌کند و استاد دوم نمی‌تواند وارد کند.
- autosave هر کلید = یک action + audit؛ بدون debounce/ترتیب؛ `TEMPORARY` را به `DRAFT` برمی‌گرداند.
- «ذخیره پیش‌نویس» و «ثبت موقت» موفقیتِ جعلی نشان می‌دهند.
- وضعیت‌ها/کدهای سما در گزارش‌ها به‌صورت متن آزاد؛ DB بدون CHECK.
- اصلاح نمره: audit غیراتمیک، approval مصرف نمی‌شود، بدون تفکیک وظایف.

---

## ۷) تحصیلات تکمیلی و دفاع

- چرخهٔ پایان‌نامه فقط بعد از باز شدن پروندهٔ فارغ‌التحصیلی فعال می‌شود (یعنی سال آخر) — P0 طراحی.
- MSc به‌خاطر `MSC` vs `MS` «بدون پایان‌نامه» دیده می‌شود.
- دو کانال موازی پروپوزال (thesis_progress و BPM) که همگام نیستند.
- ایرانداک: سه چک، فایل هرگز بررسی نمی‌شود؛ `MANUAL_REVIEW` = رد دائمی بدون override.
- تأیید پروپوزال بدون دیدن فایل؛ `REJECTED` هرگز نوشته نمی‌شود.
- زمان‌بندی دفاع: بدون تداخل سالن/داور، بدون جابه‌جایی/لغو، بدون اعلان.
- `CONDITIONAL` = FAILED دائمی؛ `READY_TO_ISSUE` پرش از تسویه.

---

## ۸) برنامه‌ریزی درسی

- Clone/R+1 فیلدهای چارت (`minRoleUnits`, `catalogKind`, کدهای قبولی/ردی) را از دست می‌دهد.
- ویرایشگر پیش‌نیاز، `{AND:[{OR:[A,B]}]}` را به AND ساده تبدیل می‌کند.
- ترم ۱۰–۱۲ قابل استفاده نیست؛ تابستان (۹) با ترم واقعی تصادم دارد.
- هر ویرایش سلول = reload کامل + اسکن کل جدول دروس + اعتبارسنجی.
- `bulkAssignSemestersAction` نوشته شده ولی وصل نیست.
- حذف درس، ارجاع‌های پیش‌نیاز در دروس دیگر را dangling می‌گذارد.

---

## ۹) MinIO / بایگانی

- اپ با **root** به MinIO وصل می‌شود؛ بکاپ DB داخل همان bucket و بدون رمزنگاری.
- بدون versioning/SSE/object-lock/حذف؛ view بدون audit؛ bucket listing برای هر ADMIN.
- `ensureBucket` در هر upload؛ خطای S3 با یک SVG «سند معتبر» پوشانده می‌شود.
- **توصیهٔ قطعی:** جدا نکردن به نرم‌افزار بیرونی (Nextcloud/Alfresco)؛ سخت‌سازی + مرز ماژولی `lib/archive`.

---

## ۱۰) برچسب‌های انگلیسی

اکثر ماژول‌ها فارسی‌اند. باقی‌ماندهٔ واقعی:
- enumهای خام در UI: `ON_HOLD`, `IRANDOC_VERIFICATION`, `SCHEDULED`, `PENDING_MAPPING`, `THEORY/LAB`, `NUMERIC/PASS_FAIL`, `MORNING/EVENING`, `DRAFT/FINALIZED` در لاگ‌ها.
- اصطلاحات داخل پرانتز: `(BI)`, `(CSV)`, `(POS)`, `(KYC)`, `(SLA)`, `(BPM)`, `(Audit Trail)`, `(Chain Matching)`, `(No Sheet, No Pay)`.
- `Excel` vs `اکسل` ناهمگون؛ ارجاع‌های `§۶۹۰۶` در UI ادمین.
- ۴ مورد `per` در توضیح کارت‌های گزارش.

---

## ۱۱) تصمیم‌های لازم (نیاز به تأیید شما)

1. **تفکیک ایزنتنسی سخت‌گیرانه:** حذف کامل شاخهٔ `OR universityId IS NULL` از همهٔ کوئری‌ها (اکنون صفر ردیف NULL داریم) — تأیید؟
2. **سقف خلاصهٔ کارتابل:** حذف سقف ۲۰۰۰ (کندتر) یا نمایش برچسب «ناقص» (سریع‌تر)؟
3. **نمرات جزئی:** افزودن جدول `grade_components` (migration) — تأیید؟
4. **چاپ:** حذف کامل «چاپ ناقص» و اجبار به واکشی کامل، یا حفظ با برچسب؟
5. **MinIO:** مهاجرت به service account + bucket جدا برای بکاپ — پنجرهٔ زمانی؟

---

## ۱۲) تکمیل ممیزی — یافته‌های تازه و وضعیت تولید

### ۱۲/۱) یکپارچگی دادهٔ انتخاب واحد (ممیزی نهایی)

- **`cart_items` قید یکتایی نداشت** ولی کد `ON CONFLICT ("studentId","offeringId")` می‌زد ⇒ افزودن به سبد با `42P10` شکست می‌خورد. **اصلاح شد روی تولید** (`uq_cart_items_student_offering`) + `drizzle/0140_cart_items_unique.sql`.
- `enrolledCount` پنج نویسنده با سه تعریف متفاوت دارد (`REGISTERED` / `<> DROPPED` / `REGISTERED+PENDING_COUNCIL`) ⇒ باید یک تابع/تریگر واحد شود.
- یک درس می‌تواند در دو گروه هم‌زمان ثبت شود: تنها قید `uq_enrollments(studentId, offeringId)` است و بررسی «تکراری بودن درس» بیرون از تراکنش انجام می‌شود. **در تولید ۴۱۹ گروه (دانشجو×ترم×درس) تکراری وجود دارد** — پاک‌سازی لازم است قبل از افزودن قید `(studentId, termId, courseId)`.
- شهریه در «افزودن» شارژ و در «حذف» اصلاح نمی‌شود؛ `chargeTermTuition` فقط از مسیر معادل‌سازی صدا زده می‌شود ⇒ بدهی با واقعیت هم‌گام نیست.
- `dropCourseAction` هیچ گیتی ندارد (نه مهلت، نه ترم جاری) و رزرو صندلی/لیست انتظار را در چند استیتمنت غیراتمیک انجام می‌دهد.
- `PENDING_COUNCIL` هیچ صندلی‌ای رزرو نمی‌کند ولی در سقف واحد و صورت‌جلسات شمرده می‌شود ⇒ فروش بیش از ظرفیت.
- دانشجوی حذف‌شده صندلی آزمون و ردیف حضور خود را نگه می‌دارد (`seat_allocations` پاک نمی‌شود؛ `issueExamAttendance` فیلتر وضعیت ندارد).
- `r-class` در «ادغام گروه» و «حذف گروهی» ردیف‌های ثبت‌نام را **hard delete** می‌کند (نمره/حضور/اعتراض بی‌تاریخ می‌شود).

### ۱۲/۲) برچسب‌های خام باقی‌مانده (اولویت اصلاح)

1. `ON_HOLD` در کارتابل فارغ‌التحصیلی خام چاپ می‌شود (در `WORKFLOW_STEPS` نیست) — `GraduationClient.tsx:221,425`.
2. سه ستون POS: `txnType` / `entryMode` / `status` — `finance/pos/page.tsx:81-89` و `PosTerminalClient.tsx:252-259`.
3. وضعیت تحویل اوراق: `PENDING_GRADING` / `GRADES_SUBMITTED` / `ARCHIVED` — `exams/handover/HandoverClient.tsx:197`.
4. پذیرش/سنجش: `admissionSource`, `sanjesh/[id]/enrolled` (`status`, `onboardingStatus`), `SaminClient`, `printStatus` کارت دانشجویی.
5. حقوق: `offeringType` / `professorRole` / `courseType` / `category` خام در فرمول‌ها و selectها (`LivePayrollClient`, `CoefficientsRulesTab`, `MultipliersTab`).
6. چیپ خام `{g.status}` کنار عنوان فارسی در `DefenseSchedulingClient.tsx:162` و `sessionStatus` در `:316`.

### ۱۲/۳) باگ‌های زندهٔ اصلاح‌شده روی تولید (بدون دیپلوی)

- ایندکس یکتای سبد انتخاب واحد (بالا).

### ۱۲/۴) ایندکس‌های تأییدشده برای تولید (فاز بعد)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clearance_checklist_audit ON clearance_checklist ("auditId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_defense_sessions_student   ON defense_sessions ("studentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_graduation_audits_uni_status_event
  ON graduation_audits ("universityId","workflowStatus","lastEventAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_thesis_progress_uni_updated
  ON thesis_progress ("universityId","updatedAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_course_rules_syllabus ON course_rules ("syllabusId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_curriculum_courses_course
  ON curriculum_courses ("courseId") INCLUDE ("curriculumVersionId","recommendedSemester");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_documents_person
  ON student_documents ("personUserId","id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_status_active
  ON students ("status") WHERE "status" IN ('ACTIVE','PENDING_GRADUATION');
```
