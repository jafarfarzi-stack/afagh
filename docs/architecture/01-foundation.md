# بخش ۱ — بنیان، احراز هویت و لایه داده (Foundation, Auth, Data)

> دامنه: استک، چیدمان ریپو، دیتابیس، احراز هویت/نشست، چنددانشگاهی و اسکوپ ترم، سیستم تنظیمات و قراردادهای کدنویسی. هر گزاره به کدی که واقعاً خوانده شده ارجاع دارد (`فایل:خط`). مواردی که تأیید نشدند با «تأییدنشده» مشخص‌اند.

## ۱. استک و چیدمان ریپو

| مؤلفه | مقدار (منبع) |
|---|---|
| فریم‌ورک | Next.js `16.3.4`، React `19.2.8` (`package.json:39,42-43`) |
| ORM / دیتابیس | `drizzle-orm@0.45.2` + درایور `pg@8.13.1` روی PostgreSQL 16 (`package.json:34,40`، `docker-compose.yml:11`) |
| کش/صف | `ioredis@6.0.0` (`package.json:37`)؛ سرویس `redis:7-alpine` در کامپوز توسعه (`docker-compose.yml:25-35`) |
| آبجکت‌استور | `minio@8.0.7` (`package.json:38`)؛ سرویس `minio/minio` در کامپوز توسعه (`docker-compose.yml:36-45`) |
| اعتبارسنجی | `zod@3.23.8` (`package.json:38`) |
| مرز سرور/کلاینت | `server-only` (`package.json:44`؛ استفاده در `src/lib/settings.ts:1` و `src/lib/security.ts:1`) |
| اجرای تست | `tsx` (`package.json:57`)؛ اسکریپت `test` زنجیره‌ای از `tsx tests/*.test.ts` است (`package.json:9`) |
| پورت | `8080` در `dev`، `start`، `Dockerfile:92` و `APP_PORT` در `settings.ts:207` |
| نام کامپوز توسعه | `afagh-dev` — فقط توسعه محلی، «هرگز پروداکشن» (`docker-compose.yml:8` و هشدار `docker-compose.yml:4-6`) |

### درخت `src/`

```text
src/
├── app/            # App Router: layout ریشه، login/، change-password/،
│                   # student/، professor/، admin/‎*(~۴۰ زیرشاخه)*، group-manager/،
│                   # proctor/، alumni/، messenger/، api/، verify*/، exam-ticket/، id/
├── lib/            # ‎~۱۲۰ ماژول منطق: auth، term-scope، settings، calendar، …
├── components/     # کامپوننت‌های مشترک: TermSwitcher، AccountSwitcher، DataTable، …
├── db/             # index.ts، schema.ts (۳۲۵۲ خط)، patches.sql، pg-hardening.sql، pool-errors.ts
├── proxy.ts        # گارد لبه (جانشین middleware در Next 16)
└── instrumentation.ts
```

- `src/app/` شامل `layout.tsx` ریشه، `page.tsx`، `globals.css`، `error.tsx` و `global-error.tsx` است (`src/app` خوانده شد).
- `src/app/api/` فقط این مسیرها را دارد: `admin`، `archive`، `bale`، `cron`، `eitaa`، `enroll`، `igap`، `lms`، `photo`، `soroush`، `telegram`، `waiting-room` (فهرست دایرکتوری).
- `src/app/admin/` حدود ۴۰ زیرشاخه دارد از جمله `settings`، `universities`، `terms`، `samin`، `saham`، `payroll`، `tuition`، `finance`، `scheduling`، `migration`، `permissions` (فهرست دایرکتوری).

### مهاجرت‌ها: `drizzle/` و `meta/_journal.json`

- `drizzle/` شامل فایل‌های `0000_natural_mandroid.sql` تا `0075_tuition_adjust.sql` (حدود ۷۶ فایل) + `meta/` است (فهرست دایرکتوری).
- `drizzle.config.ts:1-8`: لهجه `postgresql`، اسکیما `./src/db/schema.ts`، خروجی `./drizzle`.
- `meta/_journal.json:1-11`: `version: 7`، `dialect: postgresql`، آرایه `entries` با `{idx, version, when, tag, breakpoints}` — دفتر رسمی ترتیب مهاجرت‌ها که `migrate-db.mjs` از روی آن می‌خواند (`scripts/migrate-db.mjs:51-60`).
- `meta/` فقط سه اسنپ‌شات دارد: `0000_snapshot.json`، `0001_snapshot.json`، `0005_snapshot.json` + `_journal.json` (فهرست دایرکتوری).

### اسکریپت‌های مهم `scripts/` (‎~۳۱۹ فایل؛ انتخاب گزیده)

| اسکریپت | کار (منبع) |
|---|---|
| `migrate-db.mjs` | زنجیره: پشتیبان fail-closed ← خواندن ژورنال و هش sha256 هر فایل ← جدول `drizzle.__drizzle_migrations` ← baseline خودکار برای DB قدیمی ← `migrate()` ← راستی‌آزمایی شمار (`scripts/migrate-db.mjs:37-127`) |
| `backup-db.mjs` | `pg_dump` فرمت custom به `/backups` یا `./backups` یا `AFAGH_BACKUP_DIR`؛ اولین گام migrator (`scripts/backup-db.mjs:1-30` خلاصه‌شده، `scripts/migrate-db.mjs:38`) |
| `apply-patches.mjs` | اجرای پچ‌های اسکیما (گام ۲ migrator در `Dockerfile:60`) |
| `hardening.mjs` | اعمال `src/db/pg-hardening.sql` + ساخت نقش `afagh_app`؛ در production بدون `AFAGH_APP_DB_PASSWORD` با exit 1 می‌میرد (`scripts/hardening.mjs:13-22`) |
| `seed-base.mjs` | داده مرجع idempotent (نقش‌ها، مقاطع، آیین‌نامه‌ها) + `seed-permissions`؛ گام ۳ migrator (`scripts/seed-base.mjs:1-30`، `Dockerfile:61`) |
| `verify-backup.mjs` | راستی‌آزمایی پشتیبان؛ گام ۵ غیربحرانی migrator (`Dockerfile:63`) |
| `generate-staff-nc-map.mjs` | تولید `src/lib/staff-nc-map.generated.ts` (نگاشت کدپرسنلی→کدملی) از فایل‌های `/root/information-afagh/` (سربرگ فایل) |
| `generate-status-code-array.mjs` / `gen-permissions-sql.mjs` | تولید آرتیفکت‌های کمکی کدهای وضعیت و SQL مجوزها (نام فایل) |
| `import-university.mjs` | ETL یازده‌مرحله‌ای TSV (ساختار آموزشی ← ثبت‌نام ← شهریه ← users/students/staff ← legacy_code_maps) (سربرگ فایل) |
| `import-sama-afagh.mjs` / `import-professors2.mjs` / `import-legacy-data.mjs` / `import-term-schedule.mjs` | ایمپورت‌های داده legacy و برنامه ترم (نام فایل + `package.json:19-21`) |
| `fix-unknown-names.mjs` / `fix-student-nc*.mjs` / `merge-duplicate-users.mjs` / `merge-duplicate-staff.mjs` | ترمیم داده و ادغام تکراری‌ها (نام فایل + `package.json:22`) |
| `rls-test.mjs` / `concurrency-test.mjs` / `verify-audit.ts` | تست RLS، تست همزمانی، راستی‌آزمایی زنجیره audit (`package.json:23-25`) |
| `seed-pos.mjs` / `compute-tuition-growth-rates.mjs` / `migrate-legacy-tuition.mjs` | بذر پایانه‌ها، نرخ رشد شهریه، مهاجرت شهریه legacy (`package.json:26-28`) |

### `public/` و فایل‌های پیکربندی

- `public/`: `fonts/` (وزیرمتن woff2)، `help/`، و `Afagh_ERP_Comprehensive_User_Manual.pdf` (فهرست دایرکتوری).
- `next.config.mjs:17-21`: فقط `reactStrictMode`؛ `output: standalone` فقط وقتی `AFAGH_STANDALONE=1` (داکر آن را ست می‌کند، `Dockerfile:83`)؛ نادیده‌گرفتن خطای تایپ فقط با `NEXT_SKIP_TYPE_CHECK=1`.
- `tailwind.config.ts:4-10`: `darkMode: 'class'`، محتوا از `src/app|components|lib`، فونت `Vazirmatn, Tahoma, sans-serif`.
- `tsconfig.json:25-29`: نگاشت `@/* → ./src/*`؛ `strict: true` (`tsconfig.json:10`)، هدف `ES2020` (`tsconfig.json:30`).
- `.env.example:1-16`: قرارداد «پنل مدیر ← ENV ← پیش‌فرض»؛ بخش زیرساخت فقط ENV (`DATABASE_URL`، `REDIS_URL`، `S3_*`، `PORT`).

### داکر و استقرار

- `Dockerfile` چهار مرحله‌ای است: `deps` ← `migrator` ← `builder` ← `runner` (`Dockerfile:18,25,70,90`).
- `CMD` مرحله migrator پنج گام است: `migrate-db` ← `apply-patches` ← `seed-base` ← `hardening` ← `verify-backup`؛ شکست هر گام، استارت اپ را متوقف می‌کند (`Dockerfile:58-64`).
- قفل دمو در بیلد: `AFAGH_DEMO_LOCK=1` به‌صورت پیش‌فرض به `NEXT_PUBLIC_AFAGH_DEMO_LOCK` تزریق می‌شود (`Dockerfile:75-80`).
- `runner`: کاربر غیرریشه `nextjs`، `EXPOSE 8080`، هلث‌چک روی `/login` (`Dockerfile:94-105`).
- «کامپوز پروداکشن ریشه، `Makefile` و هر چیز زیر `/root/afagh`»: **تأییدنشده** — در ریپوی محلی `Makefile` وجود ندارد (`Test-Path Makefile = False`) و کامپوز محلی فقط سه‌سرویسه توسعه است؛ بخش سرور‐اختصاصی از روی ریپو قابل استناد نیست.

## ۲. دیتابیس (`src/db/schema.ts` — ۳۲۵۲ خط، حدود ۲۰۰ جدول)

سربرگ فایل می‌گوید نگاشت ۱:۱ از `schema.sql` فاز صفر است و لایه سخت‌سازی (ایندکس/RLS) در `pg-hardening.sql` زندگی می‌کند (`schema.ts:1-6`).

### گروه‌بندی جدول‌ها

| دامنه | جدول‌های کلیدی (ارجاع تعریف) |
|---|---|
| هویت/کاربر | `roles` (`:10`)، `permissions` (`:17`)، `role_permissions` (`:25`، کلید مرکب `:28`)، `persons` (`:34`)، `person_source_identities` (`:47`)، `identity_resolution_reviews` (`:74`)، `users` (`:100`)، `user_roles` (`:147`، کلید مرکب `:150`)، `sessions` (`:152`) |
| ساختار آموزشی | `degree_level_configs` (`:162`)، `faculties`، `departments`، `majors`، `sanjesh_mappings`، `admissions_staging`، `student_id_formulas`، `educational_regulations`، `students` (`:≈309`)، `student_term_states` (`:≈432`)، `staff` (`:≈469`) |
| برنامه درسی | `equivalence_clusters`، `courses` (`:≈522`)، `curriculum_tracks`، `curriculum_versions`، `curriculum_courses`، `curriculum_approvals`، `course_rules` |
| ترم و تقویم | `academic_terms` (`:≈677`)، `financial_terms` (`:≈699`) |
| ارائه/انتخاب واحد/زمان‌بندی | `classrooms`، `course_offerings`، `course_equivalences`، `offering_professors`، `schedules`، `professor_availabilities`، `term_scheduling_states`، `scheduling_room_grants`، `scheduling_allocations`، `cart_items`، `enrollments` (`:≈919`) |
| نمره/کارنامه | `grade_appeals`، `grade_change_log`، `grade_submission_otps`، `grade_unfinalize_requests`، `transcript_snapshots` (`:≈979`) |
| حضور/جلسات | `class_sessions`، `student_class_attendance`، `professor_class_attendance`، `physical_access_logs` |
| امتحانات | `exam_halls`، `exam_sessions` (`:≈1249`)، `exam_calendar_configs`، `seat_allocations`، `invigilators`، `exam_remuneration_rates`، `professor_exam_attendance`، `exam_minutes`، `exam_attendances`، `exam_invigilators`، `exam_course_packets`، `course_exam_sessions` |
| مالی دانشجویی | `term_financial_rules`، `tuition_fee_rules`، `tuition_formulas`، `tuition_rules`، `tuition_coefficients`، `tuition_growth_rates`، `tuition_discount_types`، `subject_fee_types`، `student_subject_fees`، `student_ledger` (`:≈1226`)، `financial_clearances`، `student_discounts`، `tuition_sponsors`، `student_sponsorships`، `payment_cheques`، `payment_gateways`، `payment_transactions`، `pos_terminals`، `pos_transactions`، `loan_products`، `student_loans`، `instructor_*` (deliveries/advances/profiles/attendance_days)، `staff_roles` |
| ثمین (چندمبدأیی) | `universities`، `samin_connections`، `samin_staging`، `samin_sync_logs` |
| قرارداد/حق‌التدریس | `teaching_rates`، `teaching_coefficients`، `payroll_calculation_rules`، `professor_term_contracts`، `payroll_statements`، `payroll_duty_roles`، `staff_term_roles`، `lesson_plans*` (plans/weights/sessions/settings) |
| پیام‌رسانی | `notification_templates`، `notification_channels`، `notifications`، `notification_logs`، `notification_deliveries`، `messenger_link_tokens`، `messenger_poll_offsets` |
| تنظیمات/گردش‌کار | `system_settings`، `login_notices`، `login_slides`، `process_definitions`، `process_steps`، `process_transitions`، `student_requests`، `request_step_logs`، `request_parallel_checkpoints`، `workflow_events`، `expert_scopes`، `integrations_config`، `step_api_actions`، `api_audit_logs`، `audit_logs`، `analytics_snapshots` |
| جغرافیا/سهم/مشترک | `geo_countries/provinces/cities/districts`، `ministry_shared_codes`، `saham_institute_codes`، `saham_value_maps` |
| مهاجرت legacy | `migration_runs`، `legacy_sources`، `legacy_code_maps`، `legacy_tuition_formulas`، `legacy_financial_records`، `legacy_grades`، `legacy_import_batches/rows`، `migration_audit_entries`، `tuition_compare_runs/items` |
| فارغ‌التحصیلی | `clearance_departments/checklist`، `graduation_audits`، `thesis_progress/reports`، `defense_jury_pools/sessions`، `irandoc_logs`، `issued_degrees`، `alumni_profiles/requests`، `kyc_verifications`، `military_service_records`، اسناد (`document_*`، `student_documents`، `electronic_documents`) |

### قیود یکتایی مهم (اسکوپ دانشگاهی)

- `users`: کد ملی **یکتا نیست** — هویت حساب `(nationalCode, universityId)` است (`schema.ts:103,142-144`، قید `uq_users_nc_uni`).
- `students`: `uq_students_uni_code (universityId, studentCode)` (`:397`)؛ `staff`: `uq_staff_uni_code` (`:469`)؛ `courses`: `uq_courses_uni_code` (`:522`)؛ `academic_terms`: `uq_terms_uni_code` (`:677`).
- `enrollments`: `uq_enrollments (studentId, offeringId)` (`:919`)؛ `student_ledger`: ایندکس یکتای جزئی فقط برای `TUITION_CHARGE` در هر `(studentId, termId)` (`:1226`)؛ `transcript_snapshots`: `(studentId, termId)` (`:979`)؛ `financial_clearances`: `(studentId, termId)` (`:1237`)؛ `exam_sessions`: `(termId, examDate, startTime)` (`:1257`).
- عکس پرسنلی در DB ذخیره نمی‌شود — فقط `photoKey` (کلید آبجکت‌استور) + متا (`schema.ts:117-122`).

### RLS و دو نقش اتصال

- استخر مالک: `DATABASE_URL` (پیش‌فرض توسعه `postgres://afagh:afagh@localhost:5432/afagh_db`)، `max: 20`؛ در production بدون ENV صریح، fail-fast (`src/db/index.ts:13-32`).
- استخر محدود: `DATABASE_URL_APP` با نقش `afagh_app` (فقط-خواندنی، بدون سوپریوزر)، `max: 10` (`src/db/index.ts:78-85`).
- `withUserRls(userId, fn)` تراکنشی روی `appDb` باز می‌کند و `set_config('app.user_id', …)` را فقط در همان تراکنش ست می‌کند (`src/db/index.ts:99-104`).
- سیاست fail-closed: اگر زیرساخت RLS خراب باشد (کدهای `28P01/42501/42P01/3D000/28000/25006` یا پیام `afagh_app`)، در production خطای امنیتی پرتاب می‌شود و **هیچ fallback به اتصال مالک نیست**؛ فقط در توسعه fallback با هشدار مجاز است (`src/db/index.ts:105-134`).
- `pg-hardening.sql:58-96` روی حدود ۳۰ جدول `ENABLE ROW LEVEL SECURITY` می‌کند: `users`، `students`، `staff`، `sessions`، `enrollments`، `cart_items`، `notifications`، `student_requests`، `transcript_snapshots`، `student_ledger`، `financial_clearances`، `seat_allocations`، حضورها، قراردادها، `system_settings` و … — (متن دقیق پالیسی‌ها خوانده نشد: **تأییدنشده**).
- `ensureDbSchemaPatches()`: خودترمیمی runtime فقط در توسعه؛ در production فقط هشدار و عدم اجرا (`src/db/index.ts:45-51`).
- خطاهای استخر (`src/db/pool-errors.ts:11-16`): فقط `{code}` لاگ می‌شود، هرگز پارامتر SQL یا اعتبارنامه.

```mermaid
flowchart TD
    A[backup-db: pg_dump custom] -->|fail-closed| B[migrate-db: drizzle/*.sql به ترتیب _journal.json]
    B --> C[ثبت هش در drizzle.__drizzle_migrations]
    C --> D[apply-patches]
    D --> E[seed-base: داده مرجع idempotent]
    E --> F[hardening: نقش afagh_app + RLS]
    F --> G[verify-backup]
    G -->|exit != 0| H[توقف استقرار: اپ بالا نمی‌آید]
```

## ۳. احراز هویت و نشست‌ها (`src/lib/auth.ts`)

```mermaid
flowchart TD
    L[login: staffCode یا studentCode + رمز] --> RL[rate-limit: IP و حساب]
    RL --> C[یافتن کاندیداها + گسترش هم‌شخصی STAFF_NC_MAP]
    C --> V[verifyPassword scrypt + نرمال‌سازی ارقام فارسی]
    V -->|تک‌حساب| I[issueSessionFor: ابطال نشست‌های قبلی + کوکی token]
    V -->|چندحساب هم‌رمز| T[توکن امضاشده ۵دقیقه‌ای + صفحه انتخاب حساب]
    V -->|ناموفق| E[پیام یکتا + پدینگ زمان‌ثابت]
    I --> M{mustChangePassword?}
    M -->|بله| P[/change-password]
    M -->|خیر| H[homeFor بر اساس نقش]
```

- هش رمز: `scrypt` با قالب `salt:hash`؛ کف `N=16384` — کمتر از آن در production باعث throw و نیامدن سامانه می‌شود (fail-closed) (`auth.ts:27-35`)؛ مقایسه با `timingSafeEqual` (`:41-47`)؛ هش ساختگی `DUMMY_PASSWORD_HASH` برای پدینگ مسیر «کاربر یافت نشد» (`:38,475`).
- نشست: جدول `sessions` با کلید `token varchar(64)` (هش sha256 توکن)، `userId`، `expiresAt` + ایندکس‌های `userId` و `expiresAt` (`schema.ts:152-160`)؛ ثابت `SESSION_COOKIE='token'` (`auth.ts:51`) و TTL مطلق ۴ ساعت (`:52`)؛ در DB فقط هش `sha256(token)` می‌نشیند (`:351`)، نه خود توکن.
- کوکی تطبیقی با پروتکل: HTTPS ← `SameSite=None + Secure`، HTTP ← `Lax` بدون Secure (وگرنه حلقه ورود)؛ قابل override با `AFAGH_COOKIE_SECURE/SAMESITE` (`auth.ts:54-72`، منطق در `proxy-trust.ts`).
- `getSessionUser` (`:74-115`): جوین `sessions ← users ← user_roles ← roles` با شرط `token = sha256(cookie)` و `expiresAt > now`؛ اگر `isActive != 1` نشست حذف و null برمی‌گردد (قطع کامل کانال‌های کوکی‌محور)؛ تمدید لغزشی (sliding) وقتی کمتر از نصف عمر مانده (`:97-105`).
- تنها محل ساخت نشست `issueSessionFor` است (`:341-356`): حذف نشست‌های منقضی + **حذف همه نشست‌های قبلی کاربر** (ضد session-fixation) و سپس insert + ست کوکی.
- `login(identifier, password)` (`:385-500`): نرمال‌سازی ارقام فارسی شناسه (`toEnDigits` از `persian-search.ts:68`)؛ دومرحله rate-limit — حساب `۵/۱۰دقیقه` (سخت) و IP `۱۰۰/۱۰دقیقه` (تأخیر تصاعدی، نه قفل — برای NAT)؛ فقط خطاها می‌شمارند (`:389-407`). شناسه فقط **کدپرسنلی/شماره‌دانشجویی** است — ورود با کدملی حذف شده چون روی حساب‌های چندگانه تکراری بود (`:409-413`). گسترش هم‌شخصی از دو سو (`STAFF_NC_MAP` مستقیم و معکوس `NC_TO_CODES`) (`:326-334,438-456`). واریانت رمز با ارقام فارسی هم پذیرفته می‌شود (`:460-462`). پیام خطا همیشه یکتا («شناسه یا رمز نادرست است») تا شمارش حساب ممکن نشود (`:469-478`). چندحساب هم‌رمز ← توکن امضاشده ۵دقیقه‌ای (`signToken`) + `candidateSummaries` (`:485-499`)؛ انتخاب نهایی در `chooseLoginAccount` با راستی‌آزمایی امضا (`:503-519`).
- قوانین رمز در `changePassword` (`:522-548`): طول ۱۰ تا ۱۲۸، حداقل یک حرف و یک رقم، متفاوت از فعلی؛ پس از تغییر، همه نشست‌های دیگر باطل و نشست جاری حفظ می‌شود (`:546`). `invalidateUserSessions` برای رویدادهای حساس (غیرفعال‌سازی/تغییر نقش) (`:551-553`)؛ `logout` همه‌جا + fallback حذف با توکن (`:555-563`).
- `requireRole(allowed)` (`:566-573`): بدون نشست ← `/login`؛ `mustChangePassword` ← `/change-password`؛ نقش `ADMIN` همه‌جا مجاز؛ وگرنه ریدایرکت به `homeFor`. نگاشت `homeFor` (`:575-595`): `STUDENT→/student`، `PROCTOR→/proctor`، `PROFESSOR→/professor`، فقط-`DEP_HEAD→/group-manager`، `FINANCE*→/admin/payroll`، `VAULT_MANAGER→/admin/exams`، `MILITARY_OFFICER→/admin/students`، `ARCHIVE_EXPERT→/admin/archive`، فقط-`GRADUATION_EXPERT→/admin/defense-scheduling`، پیش‌فرض `/admin`، بی‌نقش ← `/login?e=norole`.
- `getStudentByUser` (`:597-618`): مرتب‌سازی `ACTIVE` اول بعد جدیدترین (چون یک کاربر می‌تواند چند پرونده داشته باشد) + **خودترمیم دمو** (ساخت رکورد دانشجو در لحظه اگر حساب دموی بدون پرونده بود، `:604-617`). `getStaffByUser` تک‌ردیفه ساده است (`:619-622`).
- دمو (`:128-191`): `DEMO_ACCOUNTS` با ۱۸ حساب (مدیر، ۳ استاد، ۳ مدیرگروه، کارشناس‌ها، مراقب، خزانه‌دار، ۳ دانشجو). `isDemoMode` پیش‌فرض خاموش (opt-in با `AFAGH_DEMO_MODE=1`)، در production همیشه false، و قفل build-time با `NEXT_PUBLIC_AFAGH_DEMO_LOCK=1` که در ایمیج داکر تزریق می‌شود (`Dockerfile:67-80`). رمز دمو فقط از `AFAGH_DEMO_PASSWORD` صریح؛ بدون آن throw واضح و بدون تولید/چاپ رمز (`:155-170`). `ensureDemoUser` فقط-provision است: حساب غیرفعال دستی بدون `AFAGH_DEMO_REACTIVATE=1` فعال نمی‌شود (`:260-268`)؛ دانشجوی دمو پس از `ensureBaseReferenceData` ساخته می‌شود (`:205-228`).
- حساب‌های خویشاوند (`src/lib/account-switch.ts`): `getSiblingAccounts` حساب‌های هم‌کدملی (از `users.nationalCode` + کدهای `STAFF_NC_MAP`) را فقط برای نمایش بنر برمی‌گرداند (`:83-120`)؛ `switchAccountAction` با گارد CSRF اکشن، rate-limit، اثبات پیوند کدملی مشترک و **رمز همان حساب مقصد** جابه‌جا می‌شود و `userId` از کلاینت پذیرفته نمی‌شود (`:123-182`). کامپوننت بنر `AccountSwitcher.tsx` کلاینتی است.

## ۴. چنددانشگاهی و اسکوپ ترم

- کوکی دانشگاه `afagh_uni` (`university-scope.ts:9`). `getCurrentUniversity` (`:17-30`): خواندن همه دانشگاه‌ها از DB ← کوکی ← تطبیق با `code` ← fallback به اولین ردیف؛ کوکی دست‌کاری‌شده بی‌صدا نادیده گرفته می‌شود؛ اگر جدول خالی/نساخته باشد، پیش‌فرض `{id:1, code:'AFAGH'}`. `listUniversities` برای سوییچر (`:33-43`). تم هر دانشگاه از `university-theme.ts` (re-export در `:4-6`).
- کوکی ترم `afagh_term` (`term-scope.ts:6`). تفکیک ترم آموزشی (`NORMAL`/`SUMMER`) از پنهان (`EQUIVALENCE`/`SPECIAL`) (`:8-9`) با سقف نمایش ۳۰ (`:10`).
- زنجیره `pickEffectiveTerm` (`term-scope.ts:131-143`): ① ترمی که امروز در `[startDate, endDate]` است (در هم‌پوشانی دیرترین شروع) ② پرچم `isCurrent` (پشتیبان — چون در پروداکشن کهنه مانده بود) ③ آخرین شروع‌شده ④ نزدیک‌ترین آینده. ابزارهای کمکی: `termContainsToday` (`:114-123`)، `sortTermsChronologically` (`:100-112`)، `termOrdinalForEntry` برای شماره ترم تحصیلی از روی سال/ترم ورودی (`:248-268`).
- بارگذاری ترم همیشه **به‌ازای دانشگاه** است: `loadOrderedTerms(universityId)` فیلتر `where universityId` + حذف ترم‌های پنهان + مرتب‌سازی زمانی + علامت `isEffectiveCurrent` (`:166-206`)؛ `listTermsForUniversity` با سقف، `getTermScope` ترکیب کوکی+effective، `getSelectedTerm` انتخاب نهایی (`:208-240`).
- `currentTermFor(universityId)` در `terms.ts:30-46`: بدون `universityId` همیشه null (نشت ترم دانشگاه دیگر بدتر از نداشتن ترم است)؛ ردیف نهایی دوباره با شرط دانشگاه خوانده می‌شود (`loadTermRowScoped` در `:48-55`).
- `setTermCookie` (سروراکشن در `term-scope-actions.ts:11-…`): ترم باید در DB موجود و متعلق به دانشگاه جاری باشد، وگرنه نادیده گرفته می‌شود.
- UI: `TermSwitcher.tsx` کامپوننت کلاینتی (`'use client'` در `:1`) است که `setTermCookie` را صدا می‌زند و سپس `window.location.reload()` می‌کند (چون `router.refresh()` برای بخش‌های کلاینتی کافی نیست) (`:44-57`)؛ `UniversitySwitcher` در `src/app/admin/UniversitySwitcher.tsx` قرار دارد (ایمپورت در `admin/layout.tsx`) — (جزئیات پیاده‌سازی آن خوانده نشد: **تأییدنشده**).

## ۵. سیستم تنظیمات (`src/lib/settings.ts`)

- فایل با `import 'server-only'` فقط سمت سرور است (`settings.ts:1`).
- رکورد تعریف: `{key, env, group, label, type, default, help?, envOnly?}` (`:21-31`)؛ ۱۰ گروه از «عمومی» تا «زیرساخت (فقط ENV)» (`:33-44`)؛ حدود ۱۰۰ کلید از نام دانشگاه و پنجره انتخاب واحد تا نرخ‌های حق‌التدریس و آستانه‌های BI (`:46-208`).
- زنجیره حل مقدار: **DB (`system_settings`) ← ENV ← پیش‌فرض** (`:7-16`، پیاده‌سازی `getSetting` در `:241-249`)؛ کلید ناشناخته throw می‌کند (`:243`)؛ مقادیر زیرساختی فقط ENV (`:15-16,202-207` با `envOnly: true`).
- کش درون‌پردازه‌ای ۱۵ ثانیه‌ای (`:215-229`) با `invalidateSettingsCache` (`:231-233`)؛ `getNumber`/`getBool` (`:258-266`)؛ `resolveAllSettings` مقدار+منبع (`db|env|default`) را برای پنل مدیر می‌دهد (`:276-285`)؛ `saveSettings` فقط کلیدهای شناخته‌شده غیر-`envOnly` را upsert می‌کند (`:288-302`)؛ `resetSettings` با حذف ردیف DB به ENV/پیش‌فرض برمی‌گردد (`:305-310`).
- ترکیب‌های آماده: `getPublicBaseUrl` (`:314-316`)، `getBbbConfig` (`:318-333`)، `getPaymentCallbackUrl` (`:335-339`)، `getFiscalYear` (اولویت `FA_YEAR` وگرنه سال جلالی امروز) (`:348-352`).
- UI مدیریت: `src/app/admin/settings/page.tsx` + `SettingsClient.tsx` (+ `backup-actions.ts`) و برای دانشگاه‌ها `src/app/admin/universities/page.tsx` + `UniversitiesClient.tsx` (فهرست دایرکتوری) — (جزئیات فیلدبه‌فیلد UI خوانده نشد: **تأییدنشده**).

## ۶. قراردادهای کدنویسی

| قرارداد | قاعده (منبع) |
|---|---|
| مرز سرور/کلاینت | منطق دیتابیسی (`pg`، `drizzle`) و `server-only` هرگز در باندل کلاینت نمی‌آید؛ `settings.ts:1` و `security.ts:1` با `server-only`؛ `TermSwitcher.tsx:1` و `AccountSwitcher.tsx` با `'use client'` جدا شده‌اند. آنچه بیلد را می‌شکند: ایمپورت `pg`/`server-only`/توابع `db` در کامپوننت کلاینتی (الگو، نه خطای مستندشده واحد). |
| سروراکشن‌ها | `'use server'` در اول فایل (`account-switch.ts:1`، `term-scope-actions.ts:1`، `login/actions.ts:1`)؛ اکشن‌های حساس با `assertServerActionOrigin()` شروع می‌شوند (`login/actions.ts:9-11`، `account-switch.ts:128-129`)؛ `userId` مقصد از کلاینت پذیرفته نمی‌شود (`account-switch.ts:143`). |
| لبه (`proxy.ts`) | در Next 16 جایگزین `middleware`؛ فقط **شکل** توکن (۶۴ hex) چک می‌شود، اعتبارسنجی واقعی در layoutها با `getSessionUser/requireRole`؛ مچر: `student/professor/admin/group-manager/proctor/messenger/alumni` (`proxy.ts:1-25`). |
| گارد layout | `admin/layout.tsx` با `requireRole([...AREA_ROLES, ...LIMITED_ROLES])` کل ناحیه را می‌بندد و `TermSwitcher`/`UniversitySwitcher` را با اسکوپ جاری تغذیه می‌کند (`admin/layout.tsx:14-…`). |
| فارسی/راست‌به‌چپ | `layout.tsx:8` (`lang="fa" dir="rtl"`)؛ فونت وزیرمتن محلی با preload وزن‌های ۴۰۰/۷۰۰ (`layout.tsx:13-16`) و `@font-face` با `unicode-range` عربی/لاتین در `globals.css`؛ نرمال‌سازی ارقام با `toEnDigits` (`persian-search.ts:68`) در ورود (`auth.ts:394,461`) و `toShamsi` در `shamsi.ts`. |
| تاریخ جلالی | `calendar.ts:1-11`: پیاده‌سازی مستقل از ICU (الگوریتم jalaali-js بدون وابستگی) چون ICU ایمیج slim قابل اعتماد نیست؛ `toJalaliFromDate` در `getFiscalYear` استفاده می‌شود (`settings.ts:351`). |
| بهداشت خطا/لاگ | پیام‌های کاربری یکتا و فارسی (ضد enumeration در `auth.ts:478`)؛ سمت سرور فقط کد خطا لاگ می‌شود، نه پارامتر/اعتبار (`pool-errors.ts:11-16`)؛ CSRF دو لایه: `assertSameOrigin` برای Route Handlerها و `assertServerActionOrigin` برای اکشن‌ها (`security.ts:5-100`). |
| تست | اسکریپت `test` در `package.json:9` حدود ۴۵ فایل `tests/*.test.ts(x)` را با `tsx` پشت سر هم اجرا می‌کند (قوانین شهریه/مالی، هسته نمره/امتحان/زمان‌بندی، اعتبارسنج مهاجرت، دامنه برنامه درسی، …)؛ دایرکتوری `tests/` خوانده شد. |

```mermaid
flowchart LR
    R[درخواست] --> P[proxy.ts: شکل توکن]
    P -->|نامعتبر| LG[/login/]
    P -->|معتبر| LY[layout: requireRole/getSessionUser]
    LY -->|نقش/ترم/دانشگاه| SC[سرورکامپوننت + Server Action]
    SC -->|خواندن کاربرمحور| RLS[withUserRls: app.user_id در تراکنش]
    SC -->|عملیات مدیریتی| OWN[(استخر مالک DATABASE_URL)]
    RLS --> APP[(نقش محدود afagh_app + RLS)]
```

### مختصات خطی جدول‌های محوری (برای ناوبری سریع)

| جدول | خط تعریف در `src/db/schema.ts` |
|---|---|
| `users` / `user_roles` / `sessions` | `:100` / `:147` / `:152` |
| `students` / `staff` / `courses` | `:305` / `:434` / `:480` |
| `academic_terms` / `enrollments` / `transcript_snapshots` | `:639` / `:884` / `:970` |
| `student_requests` / `student_ledger` / `exam_sessions` | `:1107` / `:1208` / `:1249` |
| `professor_term_contracts` / `class_sessions` / `notifications` | `:1369` / `:1409` / `:1594` |
| `system_settings` / `legacy_grades` / `universities` | `:1617` / `:2056` / `:2135` |
| `samin_staging` / `alumni_profiles` / `messenger_link_tokens` | `:2166` / `:2429` / `:2483` |
| `workflow_events` / `tuition_rules` / `geo_provinces` | `:2511` / `:2935` / `:3053` |
| `saham_value_maps` / `lesson_plans` / `payroll_duty_roles` | `:3139` / `:3158` / `:3212` |
| `staff_term_roles` / `expert_scopes` | `:3226` / `:3239` |

### نقشه فایل‌به‌مسئولیت (کلیدی‌ترین ماژول‌های `src/lib/`)

| فایل | مسئولیت (منبع) |
|---|---|
| `auth.ts` (۶۲۲ خط) | نشست، ورود، نقش‌ها، دمو، خودترمیم |
| `db/index.ts` (۱۳۵ خط) | دو استخر + `withUserRls` + گارد production |
| `university-scope.ts` (۴۳ خط) | کوکی `afagh_uni` + fallback |
| `term-scope.ts` (۲۶۸ خط) | کوکی `afagh_term` + زنجیره ترم مؤثر + مرتب‌سازی زمانی |
| `terms.ts` (۷۰ خط) | `currentTermFor` دانشگاه‌محور + `pickEffectiveTermId` |
| `term-scope-actions.ts` | سروراکشن `setTermCookie` با اعتبارسنجی تعلق ترم |
| `settings.ts` (۳۵۲ خط) | رجیستری ~۱۰۰ کلید + زنجیره DB←ENV←پیش‌فرض |
| `settings-actions.ts` / `settings-shared.ts` | اکشن‌های ذخیره/بازنشانی + مشترکات کلاینت/سرور تنظیمات (نام فایل) |
| `account-switch.ts` (۱۸۲ خط) | حساب‌های خویشاوند + جابه‌جایی با رمز مقصد |
| `staff-nc-map.generated.ts` + `generate-staff-nc-map.mjs` | نگاشت کدپرسنلی→کدملی (تولیدی، سرور-فقط) |
| `persian-search.ts:68` | `toEnDigits` — نرمال‌سازی ارقام فارسی در ورود |
| `calendar.ts` / `shamsi.ts` | جلالی مستقل از ICU / قالب‌بندی شمسی نمایشی |
| `security.ts` (۱۸۳ خط) | CSRF دو لایه (Route Handler + Server Action) |
| `proxy-trust.ts` | تشخیص HTTPS/پروکسی برای فلگ‌های کوکی نشست (ایمپورت در `auth.ts:5`) |
| `rateLimit.ts` | `peekRateLimit`/`hitRateLimit`/`progressiveDelay` (مصرف در `auth.ts:10,399-407`) |
| `secret-guard.ts` | `assertProdSecrets` پیش از ساخت استخر (`db/index.ts:24`) |
| `base-data.ts` | `ensureBaseReferenceData` برای بذر idempotent (مصرف در `auth.ts:209`) |
| `permissions-enforcer.ts` + `permissions-catalog.ts/json` | اجرای مجوزهای细粒度 و ابطال کش پس از اعطای نقش (`auth.ts:300`) |
| `verification.ts` | `signToken`/`verifyTokenSignature` برای انتخاب حساب (`auth.ts:485,511`) |
| `logger.ts` | لاگر ماژولار (`createLogger({mod:'auth'})` در `auth.ts:493`) |
| `demo-accounts.ts` / `demo-*-data.ts` | داده نمایشی جدا از `DEMO_ACCOUNTS` اصلی (نام فایل) |
| `university-theme.ts` | تم هر دانشگاه (re-export در `university-scope.ts:4-6`) |

### جزئیات تکمیلی اسکریپت‌ها و دروازه‌های کیفیت

- `db:generate/push/migrate` در `package.json:11-13` به ترتیب `drizzle-kit generate`، `drizzle-kit push` (فقط توسعه) و `node scripts/migrate-db.mjs` (مسیر رسمی) هستند؛ کامنت `Dockerfile:52-56` توضیح می‌دهد چرا `push --force` در پروداکشن ممنوع است (غیرتعیینی، غیرقابل audit، خطر حذف ستون).
- `update.ps1` / `update.cmd` در ریشه ریپو وجود دارند (فهرست ریشه) — مسیر به‌روزرسانی ویندوزی؛ محتوای آن‌ها خوانده نشد.
- `ARCHITECTURE.md` و `HANDOFF.md` در ریشه ریپو هستند (فهرست ریشه) — اسناد فرادست این مدرک؛ این بخش فقط از روی کد نوشته شده است.
- نمونه‌ها و فیکسچرها: `samples/` در ریشه (فهرست ریشه) و تست‌های `migration-*.test.ts` (هدر واقعی، کدها، عکس‌ها، مرجع) در `tests/` — پوشش ETL مهاجرت.
- تست‌های پایداری انتشار: `release-hardening.test.ts`، `injection-hygiene.test.ts`، `term-scope-current.test.ts` در `tests/` (فهرست دایرکتوری).
- بار/همزمانی: `scripts/exam-concurrency-test.mts`، `load-test-*.mts`، `scheduling-load-run.mts`، `waiting-room-zset.test.mts` (فهرست `scripts/`) — جدا از `test` اصلی `package.json:9`.
- `drizzle/meta` سه اسنپ‌شات غیرمتوالی (`0000/0001/0005`) دارد — یعنی اسنپ‌شات‌های میانی در ریپو نگه داشته نشده‌اند؛ مرجع ترتیب، `_journal.json` است.

### یادداشت‌های مرزی احراز هویت (ظریف اما مهم)

- `login` شناسه را `trim` می‌کند و سپس `toEnDigits` — پس «۱۲۳ با فاصله» و «کد فارسی» هر دو کار می‌کنند (`auth.ts:394`)؛ رمز نیز دو واریانت (اصلی + نرمال‌شده) دارد (`:460-462`).
- کلیدهای rate-limit با `sha256` هش می‌شوند تا IP/شناسه خام در Redis ننشیند (`auth.ts:397-398`).
- `MAX_SESSIONS_PER_USER = 8` منسوخ است و استفاده نمی‌شود — `issueSessionFor` همه نشست‌های قبلی را باطل می‌کند (`auth.ts:322-349`).
- `homeFor` ترتیب اولویت دارد: STUDENT پیش از PROFESSOR/DEP_HEAD بررسی می‌شود (`auth.ts:578-585`) — کاربر دودو‌نقشی همیشه به یک خانه قطعی می‌رود.
- تغییر رمز، `mustChangePassword` را صفر می‌کند (`auth.ts:540`) — همان فلگی که `requireRole` (`:570`) و `issueSessionFor` (`:355`) حمل می‌کنند.
- `getStudentByUser`/`getStaffByUser` در `auth.ts:597-622` نقطه واحد تطبیق کاربر→پرونده‌اند و در سراسر پنل‌ها استفاده می‌شوند.

### گروه‌های ده‌گانه تنظیمات (`settings.ts:33-44`)

| گروه | نمونه کلیدها |
|---|---|
| عمومی و نشانی‌ها | `UNIVERSITY_NAME`، `ENROLLMENT_WINDOW_OPEN`، `EMERGENCY_WITHDRAW_OPEN`، `PUBLIC_BASE_URL` (`:48-56`) |
| کلاس مجازی (BBB / Moodle) | `BBB_URL/SECRET`، `MOODLE_URL/TOKEN`، `MOODLE_PULL_TOKEN` (`:59-66`) |
| پیامک و ربات‌های پیام‌رسان | `SMS_PROVIDER/API_KEY`، توکن/کانال بله/ایتا/سروش/آی‌گپ/تلگرام، `NOTIFY_CHANNELS` (`:69-100`) |
| درگاه پرداخت | `PAY_PROVIDER/TERMINAL_ID/MERCHANT_*`، `PAY_SANDBOX` (`:103-109`) |
| شهریه و امور مالی | `EQUIV_FIXED_TUITION_MODE`، `CHEQUE_REMIND_*`، `FINANCE_CRON_SECRET` (`:112-115`) |
| سرویس‌های استعلام دولتی | `IRANDOC_*`، `KYC_*`، `SHAPARAK/SAJJAD_*`، `API_TIMEOUT_SECONDS` (`:118-126`) |
| فارغ‌التحصیلی و صدور مدارک | `GRAD_AUTO_SCAN/MIN_GPA/THESIS_DEGREE_CODES`، هزینه‌های `ALUMNI_FEE_*` (`:129-149`) |
| گردش کار و حق‌التدریس | `CONTRACT_TAX/INSURANCE_PERCENT`، `HOURLY_RATE_TMN`، `PAYROLL_*` (`:152-170`) |
| سردر برنامه هفتگی | `WEEKLY_BOARD_*` — لقب، پیشوند جنسیتی، نام کوچک (`:173-176`) |
| امنیت ورود و نظارت / ارزشیابی و BI / زیرساخت | `SESSION_LOCK_MINUTES`، `GRADE_*_NOTIFY_*` (`:179-182`)؛ `EVAL_*/BI_*/PERF_*`، `TICKET_TOKEN_SECRET` (`:185-199`)؛ `DATABASE_URL/REDIS_URL/S3_*/APP_PORT` فقط-ENV (`:202-207`) |

### چرخه حیات یک درخواست (ترکیب منابع بالا)

1. `proxy.ts:14-25` شکل کوکی `token` را چک می‌کند (۶۴ hex)؛ نامعتبر ← ریدایرکت `/login?next=…`.
2. `layout` ناحیه (`admin/layout.tsx:22` با `requireRole`) نشست را از DB می‌خواند، `mustChangePassword` را اجبار می‌کند و نقش را به خانه درست می‌فرستد (`auth.ts:566-595`).
3. ناحیه ادمین دو فهرست نقش دارد: `AREA_ROLES` (نه نقش: ADMIN، EDU_EXPERT، ARCHIVE_EXPERT، FINANCE_EXPERT/FINANCE، MILITARY_OFFICER، VAULT_MANAGER، DEP_HEAD، VICE_EDU) و `LIMITED_ROLES` (PROFESSOR، GRADUATION_EXPERT) در `admin/layout.tsx:15-35` — خوانده شد.
4. اسکوپ دانشگاه (`afagh_uni`) و ترم (`afagh_term`) از کوکی + DB حل می‌شوند (`university-scope.ts:17-30`، `term-scope.ts:216-234`) و سوییچرها را تغذیه می‌کنند.
5. خواندن‌های کاربرمحور از `withUserRls` با `app.user_id` تراکنشی می‌گذرند (`db/index.ts:99-104`)؛ عملیات مدیریتی/نوشتنی از استخر مالک (`DATABASE_URL`).
6. اکشن‌های تغییردهنده با `assertServerActionOrigin` + rate-limit شروع می‌شوند (`login/actions.ts:9-11`، `account-switch.ts:128-133`)؛ خطای کاربری همیشه فارسی و یکتا، خطای فنی فقط با کد در لاگ (`auth.ts:478`، `pool-errors.ts:11-16`).

### الگوهای فارسی/راست‌به‌چپ (موارد عینی)

- ریشه: `<html lang="fa" dir="rtl">` (`app/layout.tsx:8`)؛ بدنه `min-h-screen` (`:17`).
- فونت: preload چهار فایل `vazirmatn-{arabic,latin}-{400,700}.woff2` (`layout.tsx:13-16`)؛ `@font-face` با `unicode-range` جدا برای عربی (U+0600-06FF…) و لاتین در `globals.css`؛ خانواده پیش‌فرض `Vazirmatn, Tahoma, sans-serif` (`tailwind.config.ts:10`).
- ورودی دوزبانه: `toEnDigits` در شناسه ورود، رمز و انتخاب حساب (`auth.ts:394,461,530`؛ تعریف `persian-search.ts:68`).
- تاریخ: `calendar.ts` (جلالی بدون ICU، `:1-11`) برای منطق (سال مالی در `settings.ts:351`) و `shamsi.ts:toShamsi` برای نمایش.
- سوییچرها و پیام‌ها راست‌چین‌اند (`TermSwitcher.tsx:88-94` با `text-right`) و کدهای ترم با `dir="ltr"` و فونت mono نمایش داده می‌شوند (`TermSwitcher.tsx:110`).

---

### اقلام «تأییدنشده» (خوانده نشد / از ریپو قابل استناد نبود)

1. محتوای `Makefile` و کامپوز پروداکشن ریشه (`/root/afagh`) — فایل‌ها سرور-اختصاصی‌اند و در ریپوی محلی نیستند.
2. متن دقیق پالیسی‌های RLS (فقط خطوط `ENABLE ROW LEVEL SECURITY` در `pg-hardening.sql:58-96` خوانده شد).
3. جزئیات پیاده‌سازی `UniversitySwitcher` و فیلدبه‌فیلد `SettingsClient.tsx`.
4. رفتارهای ادعاشده در کامنت‌ها که اجرا نشدند (مثل سقف حافظه بیلد ۴۱۲MB در `Dockerfile:10` و پوشش ۱۰هزار تاریخ `calendar.ts`).
