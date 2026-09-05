# ممیزی خط‌به‌خط زنجیرهٔ Curriculum → Scheduling
### «موجود / ناقص / اشتباه / نیازمند Migration» — وضعیت واقعی کد (نه از روی حافظه)

> تاریخ بررسی: ۱۴۰۵/۰۶/۱۴ · شاخه: `arena/01a05c13-afagh-next16` · HEAD: `bcc40db`
> روش: خواندن مستقیم `schema.ts` (همهٔ ۱۰۰۰+ خط)، `scheduling-engine.ts`، `scheduling-core.ts`،
> `scheduling-health.ts`، `actions.ts` صفحهٔ برنامه‌ریزی، `DepartmentPlanningClient.tsx` (۲۶۱۹ خط)،
> اکشن‌های `group-manager`، `curriculum-validator.ts` و پروفایل فراخوانی‌ها (grep در کل `src`).
> هر ادعا دارای شواهد `فایل:خط` است. نتیجهٔ قبلیِ «Scheduling نقطهٔ ضعف است» تأیید می‌شود — با دلایل دقیق.

---

## ۱) جمع‌بندی در یک نگاه: «قلعهٔ آماده، راه‌های ورود بسته»

Subsistem Scheduling دارای **Backend و Solver واقعی، قابلیت تست، و حدود ۶۰۰+ خط موتور آماده است** —
اما **حلقه‌های اتصال (Wiring) آن به UI/Actions در فازهای قبلی عمداً ساخته نشده و نیمه‌کاره رها شده**:
موتورهای اصلی `scheduling-engine.ts` (تأمین، تخصیص، پیشنهادهوشمند، پیش‌بینی تقاضا، سهمیهٔ سالن)
**صفر فراخوانی در کل پروژه دارند** (فقط در `scripts/scheduling-load-run.mts` تست بارگذاری می‌شوند).
در مقابل، بخشی از «Solver» به‌صورت **کپی Client-Side با دادهٔ ساختهٔ دستی** در
`DepartmentPlanningClient.tsx` زندگی می‌کند که خروجی‌اش فقط «پیش‌نمایش» است و هرگز ذخیره نمی‌شود.

پس مشکل «Mock» نیست؛ مشکل **Solver واقعیِ سیم‌کشی‌نشده + پیش‌نمایش Client-Side با دادهٔ خنثی** است.

---

## ۲) جدول اصلی — ۱۶ ردیف «موجود / ناقص / اشتباه / نیازمند Migration»

| # | حوزه | وضعیت | شواهد (فایل:خط) | تصمیم |
|---|---|---|---|---|
| ۱ | **Curriculum Version** (نسخهٔ برنامه) | ✅ موجود و کامل | `schema.ts:255` (حالت + CHECK) | **حفظ** |
| ۲ | **Curriculum Course** (درسانتساب با roleType) | ✅ موجود | `schema.ts:280` + CHECK نقش‌ها | **حفظ** |
| ۳ | **Track / گرایش** | ✅ موجود | `schema.ts:232` (جایگزین Mock قدیم) | **حفظ** |
| ۴ | **Lifecycle** (DRAFT→…→ARCHIVED) | ✅ موتور + Actions | `curriculum-types.ts` + `admin/curriculum/actions.ts` (۲۱ اکشن) | **تکمیل** |
| ۵ | **Approval/Audit** (append-only + امضا) | ✅ موجود | `schema.ts:304` + `curriculum_approvals` + `signature_otps` | **تکمیل** |
| ۶ | **Prerequisite/Corequisite** | ✅ Rule Engine | `course_rules.logicTree` + `curriculum-validator.ts:126-196` (دور/ارجاع/ترتیب) | **سخت‌سازی** |
| ۷ | **Category Units** (کنترل واحد به‌تفکیک نقش) | ⚠️ **ناقص** | فقط `UNITS_COVER_MIN` (`curriculum-validator.ts:117`) که **فقط جمع CORE+MAJOR** را با `totalRequiredUnits` می‌سنجد؛ **هیچ چک مینیمم GENERAL / ELECTIVE / THESIS / INTERNSHIP / WORKSHOP وجود ندارد**؛ `COURSE_TYPES_COMPLETE` (خط ۲۳۸) فقط **WARN** است | **اصلاح — نیازمه Migration ندارد** (فقط منطق) |
| ۸ | **Published Curriculum → مبنای Offering** (زنجیرهٔ اصلی Curriculum→Scheduling) | ❌ **شکاف بزرگ** | هیچ اکشن/موتوری «پیشنهاد ارائه از برنامهٔ منتشرشده» تولید نمی‌کند؛ `createOfferingAction` (`group-manager/offerings/actions.ts:19`) یک فرم دستی است (courseId را کاربر از بانک دروس انتخاب می‌کند، نه از CURRICULUM) | **تکمیل (موتور موجود است: `forecastCourseDemand` — فقط سیم‌کشی)** |
| ۹ | **Course Offering** (ارائه + هدف‌گیری) | ✅ واقعی | `course_offerings` (`schema.ts:357`) + `offering-targeting.ts` + فرم‌های واقعی | **بررسی/تکمیل** |
| ۱۰ | **Professor Assignment** (استاد اصلی + دوم) | ✅ واقعی | `offering_professors` (`schema.ts:384`) + Co-Teaching در `listRealDemands` (`actions.ts:120-127`) | **حفظ** |
| ۱۱ | **Professor Availability** (درٔ دسترس‌بودن) | ⚠️ **ناقص در مصرف** | ذخیره: پنل استاد (`professor/availability/actions.ts:31-84` — واقعی، ترمی). خواندن: فقط `scheduling-engine.ts:476` (داخل `getSmartSuggestions` **که هیچ‌کس صدا نمی‌زند**). **کلاینت برنامه‌ریزی از آن استفاده نمی‌کند** — `createNeutralAvailabilities` (`DepartmentPlanningClient.tsx:373`) برای همهٔ استادان همهٔ اسلات‌ها را `AVAIL` می‌سازد | **اتصال + اصلاح** |
| ۱۲ | **Room Allocation** (سالن/شیفت/سهمیه) | ⚠️ **نصفه سیم‌کشی** | `scheduling_room_grants` (`schema.ts:434`) + `allocateRoomQuotas` (`scheduling-engine.ts:279`) **orphan**؛ فقط خواندنِ `listAllocatedRoomIds` در کارتابل وصل است (`actions.ts:152، 326`). CRUD سالن واقعی (`group-manager/classrooms`) | **اتصال** |
| ۱۳ | **Schedule Persistence** (برنامهٔ هفتگی + جلسات) | ✅ **واقعی و کامل** | `schedules` + `addScheduleAction/deleteScheduleAction` (`group-manager/offerings/actions.ts:77-105`) + `generateClassSessionsForTerm` (`class-session-generator.ts` — تراکنشی، advisory lock، گیت قیود سخت، idempotent، dryRun، audit، تاریخ شمسی، زوج/فرد، تعطیلات) | **حفظ** |
| ۱۴ | **Solver** (پیشنهاد/تخصیص خودکار) | ⚠️ **دو نسخه: موتور واقعی orphan + نسخهٔ Client-Side** | موتور: `supplyGroupDrafts:95`، `allocateSections:201`، `getSmartSuggestions:467`، `expertOverrideGrant:549` در `scheduling-engine.ts` — **۰ فراخوانی خارج از فایل خودشان** (grep سراسری). نسخهٔ کلاینت: `solveDynamicScenarios` (`DepartmentPlanningClient.tsx:389`) با شناسه‌های ساختگی `id: 10000+…` (خط ~۴۵۵) و پیغام صریح «ثبت رسمی از جدول برنامهٔ مصوب است» (خط ۹۴۱) → **پیش‌نمایش صرف** | **اتصال موتور واقعی + حذف Solver کلاینت** |
| ۱۵ | **Curriculum → Scheduling** (اتصال کامل) | ❌ **مهم‌ترین شکاف** | `supplyGroupDrafts` (که پیش‌بینی تقاضا → ساخت گروه → تداخل‌سنجی → درج offering+schedules+offering_professors را یکجا دارد) **به هیچ اکشنی وصل نیست**؛ فازها (`term_scheduling_states`) فقط **نمایش داده می‌شوند** و `transitionSchedulingPhaseAction` (`actions.ts:407`) **export شده ولی هیچ‌کس صدا نمی‌زند** | **تکمیل — قلب فاز ۱۲** |
| ۱۶ | **Scheduling → Enrollment** | ✅ واقعی | `enroll-engine.ts:216-255` — فیلتر ۵: تداخل کلاسی از `schedules` واقعی + تداخل امتحان HARD/SOFT (فاز ۱۰) | **حفظ** |
| ۱۷ | **Scheduling → Graduation** | ✅ واقعی | `graduation-engine.ts:16` + `curriculum_courses` (منطق چارت) + `resolveStudentCurriculum` | **حفظ** |

---

## ۳) یافته‌های کلیدی به تفکیک (با شواهد دقیق)

### 🔴 P0-۱: موتور زمان‌بندی واقعی — «مرده» در کل پروژه
`src/lib/scheduling-engine.ts` (۶۰۰+ خط، با قفل advisory، auditChain، تست‌شده در
`scripts/scheduling-load-run.mts` و `tests/scheduling-core.test.ts` — ۱۱۰ تست سبز) شامل:

| تابع | خط | وظیفه | فراخوانی خارجی |
|---|---|---|---|
| `supplyGroupDrafts` | ۹۵ | ساخت گروه‌ها + درج offering/schedules/professors | **۰** |
| `allocateSections` | ۲۰۱ | تخصیص کلاس‌های مشترک به گروه‌ها (`scheduling_allocations`) | **۰** |
| `allocateRoomQuotas` | ۲۷۹ | سهمیهٔ (سالن، شیفت) به تفکیک گروه | **۰** |
| `releaseRoomShift` / `borrowReleasedShift` | ۳۲۵/۳۵۰ | استخر شناور | **۰** |
| `listPoolShifts` | ۳۷۵ | لیست استخر | **۰** |
| `forecastCourseDemand` | ۳۹۴ | پیش‌بینی تقاضا از **چارت منتشرشده + دانشجویان واقعی** | فقط در `scheduling-health.ts` (خودش هم orphan) |
| `getSmartSuggestions` | ۴۶۷ | پیشنهاد هوشمند (امتیازدهی + خواندن `professor_availabilities:476` + زونینگ) | **۰** |
| `expertOverrideGrant` | ۵۴۹ | Override کارشناس | **۰** |

**نتیجه:** زنجیرهٔ «تقاضا ← گروه ← سالن ← استاد ← پیشنهاد» در موتور کامل است؛ فقط دکمه/اکشن ندارد.

### 🔴 P0-۲: Solver در کلاینت با دادهٔ «خنثی» — پیش‌نمایشِ هرگز ذخیره‌نشده
- `createNeutralAvailabilities` (`DepartmentPlanningClient.tsx:373-384`): برای هر استاد، هر ۶ روز × ۱۲ اسلات = `AVAIL`. یعنی **واقعیتِ «درٔ دسترس‌بودن استاد» در پیشنهاددهی کلاینت نادیده گرفته می‌شود**.
- `solveDynamicScenarios` (خط ۳۸۹-۶۰۰+): ۴ سناریو با شناسهٔ ساختگی (`10000+…`)، بدون هیچ کوئری سرور.
- `handleApplyScenario` (خط ۹۴۷): فقط `setPreviewScenario` — **هیچ ذخیره‌ای**. توست صادقانه است اما معماری غلط است: «Solver» نباید پیش‌نمایش باشد؛ باید به اکشن واقعی `supplyGroupDraftsAction`/`applyScenarioAction` وصل شود.

### 🟠 P1-۳: فازهای برنامه‌ریزی (SUPPLY→ALLOCATION→REVIEW→PUBLISHED) — بدون دکمهٔ گذار
`transitionSchedulingPhaseAction` (`actions.ts:407`) و `getSchedulingDashboardAction` (۴۱۹) و
`checkScheduleConflictsAction` (۴۸۸) **هر سه export شده‌اند ولی هیچ‌کس آن‌ها را صدا نمی‌زند**
(grep سراسری). صفحه فقط `currentPhase` را از `w.phases[selectedTermId]` نشان می‌دهد (خط ۹۰۷).
یعنی «انتشار برنامهٔ درسی» (PUBLISHED) در UI **غیرممکن** است — و هیچ گیتی هم
«PUBLISHED فقط بدون تداخل سخت» را الزام نمی‌کند (`transitionSchedulingPhase` فقط پله‌ای بودن را چک می‌کند).

### 🟠 P1-۴: سیم‌کشی Health Check (عارضه‌یابی خودکار)
`scheduling-health.ts` — تولید گزارش «عرضه در برابر تقاضا / تداخل‌های پنهان / کلاس‌های یتیم /
بهره‌وری سالن‌ها» — **به هیچ اکسنی وصل نیست** (۰ ارجاع خارجی). این دقیقاً همان «اعتبارسنجی واقعی Solver» است
که کاربر خواسته؛ فقط باید `getSchedulingHealthAction` بسازیم و در تب برنامه‌ریزی نمایش دهیم.

### 🟡 P2-۵: Category Units — کنترل ناقص (بدون Migration)
مطابق `curriculum-validator.ts`:
- `UNITS_COVER_MIN` (خط ۱۱۷): مجموع `CORE+MAJOR` و `isRequired=1` ≥ `totalRequiredUnits`.
- **ندارد:** مینیمم/ماکسیمم واحد `GENERAL` (مثلاً ≥ ۲۰)، `ELECTIVE` (≥ ۱۵)، الزام
  `THESIS`/`INTERNSHIP`/`WORKSHOP` برای مقاطع خاص، حداکثر واحد در هر نقش، تطبیق
  `curriculum_courses.units` با `courses.units`.
- `COURSE_TYPES_COMPLETE` (خط ۲۳۸): فقط **WARN** («گروهی بدون حداقل ۲ درس عمومی»).
- منبع این سقف‌ها باید `educational_regulations.rulesConfig` + `degree_level_configs` باشد
  (هر دو در DB هستند؛ فقط خوانده نمی‌شوند — `regulations-engine.ts:128` فقط rulesConfig را می‌خواند).

### 🟡 P2-۶: سقف روزانه/هفتگی استاد — فقط در UI (`شکاف مستند ۸.۲ #۵`)
در سند طراحی `CURRICULUM-SCHEDULING-DESIGN-V1.md` بخش ۸.۲ ردیف ۵:
«فیلدها در UI Client هستند، در DB نیستند → `maxWeeklyUnits/maxDailyHours` روی `staff`».
**هنوز انجام نشده** → تنها ردیف واقعاً نیازمند **Migration** در این ممیزی (ستون‌های کوچک + گیت در Solver).
توجه: `schedule` در DB هیچ فیلدی برای استراحت استاد ندارد (همان سند ردیف ۶) — P2.

### 🟢 آن‌چه تأیید شد (نباید دست خورد)
- `class-session-generator.ts` کامل و واقعی است (تنها حلقهٔ محکم متصل به UI).
- `getSchedulingWorkspaceAction` (خط ۲۸۶) همهٔ داده‌ها را واقعی می‌خواند؛ هیچ آرایهٔ Mock در کارتابل نیست
  (نصفه: `createNeutralAvailabilities` تنها نقطهٔ جعلی است).
- زنجیرهٔ پایین‌دست: Enrollment (تداخل کلاس/امتحان واقعی)، Graduation (چارت واقعی)،
  Payroll (ساعت‌های واقعی از `class_sessions`)، حضور و غیاب (فاز ۱۱) — همگی واقعی‌اند.

---

## ۴) نقشهٔ پیشنهادی فاز ۱۲ — «اتصال، نه بازسازی» (به‌ترتیب اثر)

| گام | تحویل | حجم | وابسته به Migration؟ |
|---|---|---|---|
| ۱ | اکشن‌های واقعی روی موتور موجود: `supplyGroupDraftsAction`، `allocateSectionsAction`، `getSmartSuggestionsAction`، `getSchedulingHealthAction`، `transitionSchedulingPhaseAction` (وصل به UI با دکمهٔ گذار + گیت «PUBLISHED فقط بدون قید سخت») | ~۳۰۰ خط | خیر |
| ۲ | افزودن `availabilities` واقعی به `SchedulingWorkspaceResult` + حذف `createNeutralAvailabilities` و `solveDynamicScenarios` از کلاینت | ~۱۵۰ خط | خیر |
| ۳ | اکشن «تولید پیشنهاد ارائه از برنامهٔ منتشرشده»: `forecastCourseDemand` بر اساس `curriculum_versions(PUBLISHED)` + cohortهای واقعی → پیش‌نویس Supply برای تأیید گروه | ~۲۰۰ خط | خیر |
| ۴ | تقویت `curriculum-validator` با چک‌های Category Units (GENERAL/ELECTIVE/THESIS/…) از `rulesConfig` — ERROR نه WARN | ~۱۵۰ خط + ۲۰ تست | خیر |
| ۵ | `maxWeeklyUnits`/`maxDailyHours` روی `staff` + گیت در `supplyGroupDrafts` (پیاده‌سازی ردیف ۵ سند ۸.۲) | Migration کوچک + ~۸۰ خط | **بله (۰۰۰۵)** |

---

## ۵) پیگیری — گام ۱ و ۲ (فاز ۱۲) ✅ انجام شد

> تاریخ: ۱۴۰۵/۰۶/۱۴ · کامیت: `5e1033a` (فاز ۱۲ — گام ۱ و ۲)

| گام | تحویل | وضعیت |
|---|---|---|
| ۱ | **اکشن‌های واقعی روی موتور:** `supplyGroupDraftsAction` (تأمین: درج واقعی offering+schedule+offering_professors با قفل و audit)، `allocateSectionsAction` (تخصیص استخر خدمات)، `allocateRoomQuotasAction` (سهمیهٔ سالن/شیفت)، `getSmartSuggestionsAction` (پیشنهاد موتور با درٔ دسترس بودن واقعی)، `getSchedulingHealthAction` (عارضه‌یابی) + **گیت «انتشار فقط بدون قید سخت»** در `transitionSchedulingPhaseAction` + دکمهٔ گذار فاز در UI | ✅ |
| ۲ | **availabilities واقعی در کارتابل:** `SchedulingWorkspaceResult` اکنون `availabilities` (از `professor_availabilities` همان ترم یا سراسری) + `departments` + `facultyId` رشته‌ها + `courseId/courseDeptId` تقاضاها را می‌دهد؛ **Solver کلاینت حذف شد**: `solveDynamicScenarios`/`createNeutralAvailabilities` (≈۴۵۰ خط) هرگز ساخته نمی‌شوند؛ «سناریوها» = برنامهٔ مصوب واقعی؛ ویرایشگر جعلی فرم حضور (presetهای ALL_PREF/MORNING_ONLY/…) به **مشاهده‌گر فقط‌خواندنی** تبدیل شد (ثبت فقط از پنل استاد)؛ `hasSubmittedAvailability` از ردیف‌های واقعی؛ «⏳ در انتظار تکمیل» دیگر دروغ نیست | ✅ |

**باگ‌های پیدا و رفع‌شده هنگام اتصال (خطبه‌خط):**
- 🔴 `scheduleType: 'WEEKLY'` در `supplyGroupDrafts` — همهٔ خواننده‌ها `'CLASS'` فیلتر می‌کنند؛ گروه‌های عرضه‌شده هرگز در برنامهٔ مصوب/جلسات/برنامهٔ دانشجو ظاهر نمی‌شدند → **اصلاح به `'CLASS'`**.
- 🔴 ۴ موضع `actorUserId` (users.id) در ستون‌های `*ByStaffId` که به `staff.id` FK دارند (`publishedByStaffId`/`allocatedByStaffId`/`releasedByStaffId`) → **helper `resolveStaffId`**.
- 🟠 `getSchedulingDashboardAction`/`checkScheduleConflictsAction` همچنان بدون مصرف‌کننده‌اند (داشبورد قدیمی)؛ «انتساب استاد» تب گام ۱ و سقف واحد استاد (ستون DB) طبق نقشه در گام‌های ۳ و ۵ می‌مانند.
- 🟠 تواتر زوج/فرد (`EVEN`/`ODD`) در سمت عرضه هنوز ورودی UI ندارد (میدان `weekRecurrence` در تقاضای کارتابل خالی است) — گام ۳.

**گیت‌ها پس از اتصال:** tsc ۰ خطا · تست‌ها ۴۴۶/۴۴۶ · ممیزی اکشن‌ها ۲۰۱/۲۰۱ ✅ · `next build` ✅

---

## ۶) پاسخ مستقیم به پرسش کاربر

> «آیا Scheduling واقعاً از همین داده‌های معتبر استفاده می‌کند یا هنوز بخشی از آن در DepartmentPlanningClient و state سمت Client نگهداری می‌شود؟»

**هر دو، به‌طور هم‌زمان:**
- ✅ دادهٔ **نمایشی** کارتابل (نیمسال/رشته/ورودی/سالن/استاد/تقاضا/برنامهٔ مصوب/جلسات/KPI) — **۱۰۰٪ از DB** و از `getSchedulingWorkspaceAction`.
- ⚠️ دادهٔ **پیشنهادی/سناریو** — در **state کلاینت** با `createNeutralAvailabilities` (دست‌ساز) محاسبه می‌شود، هرگز ذخیره نمی‌شود، و موتور واقعیِ همان کار (`getSmartSuggestions`) **بی‌استفاده** است.
- ⚠️ **برنامهٔ هفتگیِ رسمی** (روز/ساعت/سالن/استاد) نه از Solver — بلکه با **فرم دستی** در
  `group-manager/offerings` ثبت می‌شود (`addScheduleAction`)؛ یعنی خروجی Solver هرگز به `schedules` نمی‌رسد.
