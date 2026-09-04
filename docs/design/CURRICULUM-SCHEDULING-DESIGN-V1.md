# طراحی قطعی Domain برنامه‌ریزی درسی (Curriculum) و زمان‌بندی (Scheduling)

**نسخه:** V1 — **شاخه:** `arena/01a05c13-afagh-next16` — **تاریخ:** ۱۴۰۵/۰۶/۱۳
**محدودهٔ این سند:** فقط طراحی. هیچ Migration و هیچ UI جدیدی در این سند وجود ندارد.
**قاعدهٔ طلایی:** «هیچ جدول موجودی را به‌دلیل بی‌دقتی طراحی، دوباره نمی‌سازیم.»

---

## ۰. خلاصهٔ مدیریتی — نتیجهٔ بازبینی دستهٔ دوم (مهم‌تر از بازبینی قبلی)

بازبینی روی **این شاخه** (نه نسخهٔ قبلی) انجام شد و تصویر با چیزی که در گزارش قبلی آمده بود **تفاوت معنادار** دارد. بخش مهمی از «مدل پیشنهادی» شما **از قبل در کد موجود است و توسط سه موتور مصرف می‌شود**؛ مشکل اصلی جایی است که شما هم گفتید:

> **پوستهٔ دیتابیس و موتورها جلوترند؛ دو Client صفحهٔ مدیر هنوز از موتورها تغذیه نمی‌شوند و Domain Curriculum فاقد چرخهٔ حیات (نسخه/تأیید/نشر) است.**

| کلید | واقعیت شاخهٔ next16 |
|---|---|
| تعداد جداول `schema.ts` | **۱۳۱ جدول** با ۱۸۴ ارجاع خارجی |
| جدول‌های Scheduling | ❗ **۱۰ جدول از ۱۰ جدولِ پیشنهادی شما از قبل موجودند** (`academic_terms`, `course_offerings`, `offering_professors`, `schedules`, `professor_availabilities`, `classrooms`, `term_scheduling_states`, `scheduling_room_grants`, `scheduling_allocations`, `class_sessions`) |
| موتور Scheduling | ❗ **واقعی و تست‌شده است**: `scheduling-core.ts` (خالص، با تست CI) + `scheduling-engine.ts` (۱۱ تابع: تأمین ← تخصیص ← بازبینی ← نشر، پیش‌بینی تقاضا، پیشنهاد هوشمند، سهمیهٔ سالن) |
| Rule Engine پیش‌نیاز | ❗ **از قبل موجود است**: `course_rules.logicTree` (JSON درختی AND/OR با `course` + `minGrade`) + ارزیاب `evaluateLogicTree` + «قاعدهٔ سراسری / قاعدهٔ مقیّد به سیلابس» در `enroll-engine.ts` |
| مدل نسخهٔ برنامه | 🟠 **نیمه‌کاره**: `syllabuses` → `syllabus_courses` (با `semesterNo`) هست و توسط `graduation-engine` و `regulations-engine` و `enroll-engine` مصرف می‌شود؛ ولی **بدون** چرخهٔ حیات، تأیید، گرایش، و پرچم‌های فارغ‌التحصیلی |
| `CurriculumManagerClient.tsx` | 🔴 ۱۵۸KB — عمدتاً Mock (تأیید شد؛ `page.tsx` فقط `majors` را از DB می‌خواند و `minUnits`/`tracks` را Hard-code می‌کند) |
| `DepartmentPlanningClient.tsx` | 🔴 ۱۴۹KB — از DB هیچ نمی‌خواند (`page.tsx` بدون هیچ fetch)؛ در حالی که موتور واقعی زیرش خوابیده |
| `copyPrereqs` / `copyGrades` / «همگام‌سازی» / «اعتبارسنجی ✓» | 🔴 تأیید شد: همه Toast/متن ثابت‌اند |
| خروجی `16 × تعداد کلاس` | 🔴 تأیید شد: فقط عدد است؛ `class_sessions` (جدول واقعی جلسات) اصلاً پر نمی‌شود |

### نتیجه‌گیری استراتژیک (تغییر نسبت به گزارش قبلی)

ما **دو سیستم از صفر نمی‌سازیم**؛ فقط باید:

1. «سیلابس» را به **نسخهٔ برنامهٔ درسی با چرخهٔ حیات** ارتقا دهیم (نه جدول موازی!) و یک لایهٔ نسخه/تأیید/نشر اضافه کنیم.
2. Rule Engine موجود را **تکمیل** کنیم (COREQ + قواعد واحد/نمره) نه بازنویسی.
3. `CurriculumManagerClient` را به **Thin Client** متصل به Server Actions + Validation Engine تبدیل کنیم.
4. `DepartmentPlanningClient` را به **Scheduling Engine موجود** وصل کنیم (تنها ۱۰٪ کار: سیم‌کشی).
5. Solver را **فقط بعد از اتصال** به Curriculum واقعی سخت‌گیرانه‌تر کنیم (افزودن قیود، نه بازنویسی).

---

## ۱. استخراج کامل موجودیت‌های آموزشی موجود (از `src/db/schema.ts`)

### ۱.۱ قلمرو سازمانی (هستهٔ پایه)

```
faculties        (id, name, facultyCode)
departments      (id, name, facultyId,FK, departmentCode)
majors           (id, name, degreeLevelId,FK, departmentId,FK, majorCode UNIQUE, facultyId,FK,
                  minUnits, standardCode, establishedDate, terminatedDate, isActive,
                  headStaffCode, expertName, lastCouncilDate)
degree_level_configs (id, title, code UNIQUE, defaultPassingGrade, conditionalGpaThreshold, maxUnitsPerTerm)
educational_regulations (id, title, degreeLevelId,FK, effectiveFromYear, effectiveToYear, rulesConfig JSON)
staff            (id, userId UNIQUE,FK, staffCode UNIQUE, departmentId,FK, staffType, academicRank,
                  degree, title, facultyId,FK, isActive, cooperationType, personnelNo,
                  employmentType, hireDate, lastDegreeYear, fieldOfStudy, maritalStatus,
                  lastDegreeUniversity, academicBase, bankAccountNo, canManageServicePool)
students         (id, userId UNIQUE,FK, studentCode UNIQUE, majorId,FK, degreeLevelId,FK,
                  regulationId,FK, entryYear, entryTerm, status, quotaType,
                  extraAllowedSemesters, extraAllowedProbations, currentTermNo)
```

### ۱.۲ قلمرو درس و هم‌ارزی

```
courses        (id, code UNIQUE, title, theoreticalUnits, practicalUnits, units NOT NULL,
                courseType, departmentId,FK, gradingType, affectsGpa,
                clusterId,FK→equivalence_clusters, offeringScope, locationType)
equivalence_clusters (id, clusterTitle, isGeneralService)
syllabuses     (id, majorId,FK, entryYearStart NOT NULL, entryYearEnd, minTotalUnitsToGraduate)
syllabus_courses (id, syllabusId,FK NOT NULL, courseId,FK NOT NULL, semesterNo)
course_rules   (id, courseId,FK NOT NULL, syllabusId,FK, ruleType NOT NULL,
                logicTree JSON NOT NULL, customPassingGrade)
```

> **نکتهٔ حیاتی:** درخت پیش‌نیاز به‌صورت `{"operator":"AND","conditions":[{"course":"XXX","minGrade":12}, …]}` است — یعنی **دقیقاً همان Rule Engine «A AND (B OR C)، حداقل نمرهٔ ۱۲» که در طراحی شما خواسته شده بود، از قبل پیاده‌سازی شده** (فایل `enroll-engine.ts` خطوط ۵۲–۱۳۶، با منطق «قاعدهٔ مقیّد به سیلابس، قاعدهٔ سراسری را بازنویسی می‌کند»).

### ۱.۳ قلمرو ترم و ارائهٔ درس (Scheduling)

```
academic_terms (id, termCode UNIQUE, title, termType, isCurrent, isSummer, isEnrollmentOpen,
                enrollmentStartDate, enrollmentEndDate, startDate, endDate,
                gradeEntryDeadline, appealWindowDays, professorAppealSlaDays)
classrooms     (id, name, capacity NOT NULL, roomType, buildingName, rowsCount, colsCount, facultyId,FK)
course_offerings (id, termId,FK NOT NULL, courseId,FK NOT NULL, professorId,FK, groupNumber,
                  capacity NOT NULL, waitlistCapacity, enrolledCount, genderRestriction,
                  sharedScheduleGroupKey, offeringType, customGradeDeadline, isActive,
                  gradesHash, gradesTemporaryAt, gradesFinalizedAt,
                  targetDegreeLevelId, targetMajorId, entryYearStart, entryYearEnd,
                  ownerDepartmentId,FK, isSharedService, equivalenceClusterId,FK)
                  ── + index(termId, courseId, groupNumber)
offering_professors (id, offeringId,FK, staffId,FK, role DEFAULT 'MAIN_LECTURER', sharePercentage)
schedules      (id, offeringId,FK NOT NULL, scheduleType NOT NULL, dayOfWeek, examDate,
                startTime NOT NULL, endTime NOT NULL, roomId,FK)
professor_availabilities (id, staffId,FK NOT NULL, termId,FK, dayOfWeek, startTime, endTime)
term_scheduling_states (id, termId UNIQUE,FK, phase DEFAULT 'SUPPLY', supplyEndsAt,
                allocationEndsAt, reviewEndsAt, publishedAt, publishedByStaffId,FK)
scheduling_room_grants (id, termId,FK, classroomId,FK, shift MORNING|EVENING,
                ownerDepartmentId,FK, status ALLOCATED|RELEASED, releasedAt, releasedByStaffId,FK)
                ── + UNIQUE(termId, classroomId, shift)
scheduling_allocations (id, termId,FK, offeringId,FK, departmentId,FK, allocatedByStaffId,FK, createdAt)
                ── + UNIQUE(offeringId, departmentId) + index(termId, departmentId)
class_sessions (id, offeringId,FK NOT NULL, sessionDate, startTime, endTime,
                status DEFAULT 'SCHEDULED', isMakeUpSession, replacedSessionId,FK, sessionNo)
```

### ۱.۴ قلمرو پایین‌دست (مصرف‌کنندهٔ برنامهٔ درسی)

```
cart_items / enrollments (studentId, offeringId, status, waitlistPosition, gradeValue, …,
                isDirectedReading) + UNIQUE(studentId, offeringId)
graduation_audits (studentId UNIQUE, workflowStatus, requiredUnits, passedUnits, gpa,
                missingCourses JSON, catalogOk, headApprovalStatus, thesisRequired,
                irandocStatus, sajjadStatus, …)
```

---

## ۲. آنچه در موتورها **واقعاً** وجود دارد (و باید حفظ/مصرف شود)

| فایل | اندازه | مسئولیت | وضعیت |
|---|---|---|---|
| `lib/enroll-engine.ts` | ۵۹۸ | `evaluateLogicTree` + `buildPrereqContext` (ساخت map قاعدهٔ مؤثر، سیلابس-مقیّد) + فیلترهای انتخاب واحد | 🟢 مصرف‌شده در Production |
| `lib/graduation-engine.ts` | ۹۵۷ | تطبیق با سرفصل: پیدا کردن سیلابسِ منطبق با `entryYear`، شمارش واحدها، `missingCourses` | 🟢 |
| `lib/regulations-engine.ts` | ۵۶۸ | `minTotalUnitsToGraduate` از سیلابس + آیین‌نامهٔ `rulesConfig` | 🟢 |
| `lib/scheduling-core.ts` | ۲۹۸ | **هستهٔ خالص و بدون DB** (تست‌شده در CI): `validateGroupDrafts`, `overlaps`, `calculateSlotScore`, `shiftOf`, ماشین فازها، `forecastCourseDemand`, ثابت‌ها (شیفت، جنسیت، سقف گروه) | 🟢 + `tests/scheduling-core.test.ts` |
| `lib/scheduling-engine.ts` | ۵۷۷ | ۱۱ تابع DB: `getSchedulingState`, `transitionSchedulingPhase`, `supplyGroupDrafts`, `allocateSections`, `allocateRoomQuotas`, `releaseRoomShift`, `borrowReleasedShift`, `listPoolShifts`, `forecastCourseDemand`, `getSmartSuggestions`, `getDepartmentProfessors`, `expertOverrideGrant` | 🟢 |
| `lib/scheduling-health.ts` | ۱۴۱ | سلامت برنامهٔ هفتگی | 🟢 |
| `lib/offering-targeting.ts` | ۳۲ | هدف‌گیری ارائه (مقطع/رشته/ورودی) | 🟢 |
| `lib/equivalence-form.ts` | ۳۱۲ | فرم هم‌ارزی (استخر مشترک) | 🟢 |

---

## ۳. تحلیل شکاف (Gap Matrix)

> ➖ = موجود و کافی · 🔶 = نیاز به ارتقا/گسترش · ➕ = باید ساخته شود

| # | خواسته در طراحی قبلی | وضعیت واقعی | تصمیم |
|---|---|---|---|
| ۱ | `curriculum_versions` | 🔶 `syllabuses` موجود است؛ فاقد `version_code`, `title`, `status`, `track`, `approval`, `effective/entry` بازه‌ها | **ارتقای `syllabuses`** (با یا بدون rename — تصمیم D1) |
| ۲ | `curriculum_tracks` | ➖ گرایش‌ها وجود ندارند (در UI با `tracks: string[]` Mock می‌شوند) | ➕ جدول جدید کوچک |
| ۳ | `curriculum_courses` | 🔶 `syllabus_courses` موجود است (`courseId`, `semesterNo`)؛ فاقد نوع نقش درس، واحدهای ویژهٔ نسخه، `min_grade`، پرچم فارغ‌التحصیلی | **ارتقای `syllabus_courses`** |
| ۴ | `curriculum_course_prerequisites` | ➖ **موجود** به‌صورت `course_rules.logicTree` (AND/OR + minGrade) | استفاده، با افزودن `ruleType=COREQ` |
| ۵ | `curriculum_course_corequisites` | ➖ در همان `course_rules` جا می‌شود | همین ۱ ستون `ruleType` |
| ۶ | `curriculum_course_equivalencies` | ➖ `equivalence_clusters` + `courses.clusterId` + `offering.equivalenceClusterId` موجود | استفاده؛ بدون جدول جدید |
| ۷ | `curriculum_rules` | ➖ `educational_regulations.rulesConfig` (آیین‌نامه) + `course_rules` (قواعد درس) | بدون جدول جدید |
| ۸ | `curriculum_approvals` | ➕ هیچ چرخهٔ تأیید وجود ندارد | ➕ جدول جدید + ستون `status` |
| ۹ | `academic_terms` | ➖ کامل | — |
| ۱۰ | `course_offerings` + `offering_professors` | ➖ کامل (گروه، ظرفیت، استاد دوم با `role`) | — |
| ۱۱ | `professor_assignments` | ➖ `offering_professors` | — |
| ۱۲ | `professor_availability` | ➖ `professor_availabilities` | — |
| ۱۳ | `rooms` | ➖ `classrooms` (فقط `roomType` متنی — تجهیزات ندارد) | 🔶 ستون `facilities JSONB` در گام بعد |
| ۱۴ | `room_allocations` | ➖ `scheduling_room_grants` (سهمیهٔ شیفتی) | — |
| ۱۵ | `schedule_slots` | ➖ `schedules` (روز/ساعت/اتاق) | — |
| ۱۶ | `class_schedules` | ➖ `schedules` + `sharedScheduleGroupKey` برای کلاس‌های زوج | — |
| ۱۷ | `schedule_approvals` | 🔶 `term_scheduling_states.phase` + `publishedAt/publishedBy` موجود | 🔶 + ستون `approvedBy/approvedAt` اختیاری |
| ۱۸ | تولید ۱۶ جلسهٔ واقعی | ➖ `class_sessions` موجود — فقط تولیدکننده ندارد | ➕ تابع `generateClassSessionsFromSchedule` |
| ۱۹ | Validation Engine | ➕ هیچ‌کدام؛ چک‌های UI Hard-code | ➕ `curriculum-validator.ts` |
| ۲۰ | Server Actions درسنامه | ➕ هیچ‌کدام | ➕ `curriculum-actions.ts` |
| ۲۱ | اتصال معتبر Enroll | 🔶 هست ولی بر پایهٔ سیلابس بدون وضعیت | ارتقای `resolveApplicableSyllabus` به نسخهٔ `PUBLISHED` |
| ۲۲ | Solver سخت‌گیر | 🔶 `calculateSlotScore` + `overlaps` موجود؛ قیود ناقص | ➕ قیود سخت جدید در `scheduling-core` (بعد از اتصال) |

---

## ۴. معماری هدف (به‌روزشده با امکانات موجود)

```
                 ┌──────────────────────────────┐
                 │   Curriculum Engine (NEW)    │  curriculum-actions.ts + validator
                 └──────────────┬───────────────┘
                                │  curriculum_versions(status: DRAFT→…→PUBLISHED)
                                ▼
                 ┌──────────────────────────────┐
                 │        Course Offering       │  (از قبل موجود)
                 └──────────────┬───────────────┘
                ┌───────────────┼────────────────┐
                ▼               ▼                ▼
        Professor          Room/Shift        Demand/Cohort
      (موجود: staff،     (موجود: classroom،   (موجود: forecast،
      availability،      room_grants)         allocations)
      offering_prof)
                └───────────────┼────────────────┘
                                ▼
                 ┌──────────────────────────────┐
                 │  Scheduling Engine (موجود)   │  SUPPLY→ALLOCATION→REVIEW→PUBLISHED
                 └──────────────┬───────────────┘
                                ▼
                 ┌──────────────────────────────┐
                 │  Approved Timetable + بازنشر │  schedules + class_sessions (تولید جلسه)
                 └──────────────┬───────────────┘
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
      Enrollment           Exams (موجود)      Attendance (موجود)
   (enroll-engine،       (exam-engine)        (student_class_attendance)
   buildPrereqContext)
```

---

## ۵. طراحی نهایی Schema — Domain برنامهٔ درسی

### ۵.۰ تصمیم کلیدی نام‌گذاری (D1)

دو گزینه:

- **گزینهٔ A (پیشنهادی):** `syllabuses` → `curriculum_versions` با Migration نسخه‌دار. اثر: **۲۷ ارجاع در ۶ فایل** (`graduation-engine` ×۱۰، `regulations-engine` ×۸، `schema.ts` ×۴، `scheduling-engine` ×۲، `enroll-engine` ×۲، `chart/page.tsx` ×۱) — کاملاً مکانیکی؛ در چرخهٔ CI فعلی (مهاجرت نسخه‌دار + بکاپ `RUNNER_TEMP`) امن است.
- **گزینهٔ B (محتاطانه‌تر):** حفظ نام `syllabuses` و افزودن ستون‌ها. ریسک صفر، ولی نام جدول با Domain واقعی نمی‌خواند و بعداً rename دردسر دارد.

> **پیشنهاد:** گزینهٔ A در فاز ۲ (زیرا هنوز Production نیستیم و ۲۷ رفرنس قابل مدیریت است).

### ۵.۱ `curriculum_versions` (ارتقای `syllabuses`)

```text
curriculum_versions
──────────────────────────────────────────────
id                          serial PK
major_id                    FK→majors NOT NULL
degree_level_id             FK→degree_level_configs NOT NULL   ← جدید (فعلاً از major استنباط می‌شود)
track_id                    FK→curriculum_tracks (NULL = گرایش آزاد)   ← جدید
version_code                varchar(20) NOT NULL              ← «1404» یا «1404-R1»  ← جدید
title                       varchar(150) NOT NULL             ← «برنامهٔ مهندسی نرم‌افزار ۱۴۰۴»  ← جدید
status                      varchar(20) NOT NULL DEFAULT 'DRAFT'
                            CHECK: DRAFT|REVIEW|APPROVED|PUBLISHED|ARCHIVED   ← جدید
entry_year_from            integer NOT NULL                  ← از entryYearStart
entry_year_to              integer                           ← از entryYearEnd
effective_from             date (شمسی varchar(10))           ← تاریخ اجرای مصوبه  ← جدید
effective_to               date                              ← جدید
total_required_units       numeric(5,1) NOT NULL             ← از minTotalUnitsToGraduate
max_units_per_term         integer                           ← جدید (override برای این نسخه)
approval_id                FK→curriculum_approvals (NULL تا زمان تأیید)  ← جدید
created_by_staff_id        FK→staff                          ← جدید (audit)
created_at / updated_at    timestamp
─── ایندکس‌ها ───
UNIQUE(major_id, degree_level_id, track_id, version_code)   ← جلوگیری از نسخهٔ تکراری
UNIQUE(major_id, degree_level_id, track_id, status='PUBLISHED')  ← فقط یک نسخهٔ Published فعال
index(major_id, entry_year_from, entry_year_to)             ← resolution نسخهٔ دانشجو
```

### ۵.۲ `curriculum_tracks` (جدید)

```text
curriculum_tracks
──────────────────────────────────────────────
id            serial PK
major_id      FK→majors NOT NULL
title         varchar(100) NOT NULL        ← «هوش مصنوعی و رباتیک»
code          varchar(20)                  ← کد گرایش سازمانی
is_active     integer DEFAULT 1
UNIQUE(major_id, title)
```

### ۵.۳ `curriculum_courses` (ارتقای `syllabus_courses`)

```text
curriculum_courses
──────────────────────────────────────────────
id                        serial PK
curriculum_version_id     FK→curriculum_versions NOT NULL   ← از syllabus_id
course_id                 FK→courses NOT NULL
role_type                 varchar(20) NOT NULL DEFAULT 'CORE'
                          CHECK: CORE|MAJOR|ELECTIVE|GENERAL|THESIS|INTERNSHIP|WORKSHOP
units                     numeric(3,1)          ← واحدِ ویژهٔ این نسخه (NULL = units درس)
theory_units / practical_units  numeric(3,1)   ← override اختیاری
is_required               integer DEFAULT 1
is_elective               integer DEFAULT 0
is_graduation_required    integer DEFAULT 0     ← شرط الزامی فارغ‌التحصیلی
recommended_semester      integer               ← از semesterNo (جایگزین: ۱..۸، ۰=نامشخص)
min_grade                 numeric(4,2)          ← کف قبولیِ خاص این درس در این نسخه
auto_corequisite_allowed  integer DEFAULT 0     ← «هم‌نیاز خودکار در ترم آخر» (از آیین‌نامه)
UNIQUE(curriculum_version_id, course_id)
index(curriculum_version_id, recommended_semester)
```

### ۵.۴ Rule Engine — از `course_rules` موجود (بدون جدول جدید)

**وضعیت موجود:** `course_rules(courseId, syllabusId, ruleType, logicTree, customPassingGrade)`
**گسترش (فاز ۳):** فقط مقادیر مجاز `ruleType` و ساختار `logicTree` را رسمی می‌کنیم:

```text
ruleType: PREREQ | COREQ | UNIT_BOUNDARY | EQUIV_OVERRIDE
logicTree عمق‌دار (نامحدود):
{ "operator": "AND"|"OR", "conditions": [
    {"course": "RS30", "minGrade": 12},                        ← قبولی درس با حداقل نمره
    {"unitsPassed": 60} ,                                       ← حداقل واحد گذرانده (جدید)
    {"operator": "OR", "conditions": [{"course":"A"},{"course":"B"}]}
]}
```

> **چرا جدول جدید `curriculum_course_prerequisites` نمی‌سازیم؟**
> چون (۱) ارزیاب `evaluateLogicTree` در `enroll-engine` همین ساختار را می‌فهمد و در انتخاب واحد Production اجرا می‌شود؛
> (۲) ساخت جدول موازی یعنی دو منبع حقیقت برای یک مفهوم — دقیقاً همان باگ‌های ناهمگامی که در گزارش قبلی شما (copyPrereqs) شناسایی شد؛
> (۳) `syllabusId` در `course_rules` همان مقیّدسازی به نسخه است — یعنی «قاعدهٔ مخصوصِ نسخهٔ ۱۴۰۴» را از قبل دارد.
> تنها کار: وقتی روی `curriculum_courses` درس اضافه/حذف شد، رکورد قواعد همان درس باید به `curriculum_version_id` جدید مقصد دوباره متصل شود (در `copyCurriculumVersion`).

### ۵.۵ `curriculum_approvals` (جدید — چرخهٔ حیات و Audit)

```text
curriculum_approvals
──────────────────────────────────────────────
id                       serial PK
curriculum_version_id    FK→curriculum_versions NOT NULL
approval_type            varchar(20) NOT NULL   ← DRAFT_SUBMIT | HEAD_APPROVE | COUNCIL_APPROVE | PUBLISH | ARCHIVE
from_status              varchar(20)            ← «REVIEW» 
to_status                varchar(20)            ← «APPROVED»
approved_by_staff_id     FK→staff NOT NULL
approved_by_user_id      FK→users NOT NULL
decision_note            text
approved_at              timestamp DEFAULT now()
signature_document_id    FK→electronic_documents   ← امضای الکترونیک (مکانیزم موجود پروژه)
index(curriculum_version_id, approved_at DESC)
```

### ۵.۶ ماشین حالت (State Machine) — پاسخ به «نسخه نباید Mutable باشد»

```
DRAFT ──submit──▶ REVIEW ──head-approve──▶ APPROVED ──publish──▶ PUBLISHED ──archive──▶ ARCHIVED
  ▲                  │                         │                    │
  │                  └──reject──▶ DRAFT        └──revision──▶ DRAFT (نسخهٔ جدید 1404-R1، رکورد ۱۴۰۴ دست‌نخورده می‌ماند)
  └──edit (آزاد)─────┘
```

**قواعد سخت:**
1. **ویرایش فقط در `DRAFT`** مجاز است. در `REVIEW` به بعد: فقط خواندن. (در سطح DB: `status` چک می‌شود؛ در سطح Action: `assertVersionEditable()`)
2. هر «تغییر لازم» ⇒ `createRevision(versionId)` ⇒ رکورد جدید `1404-R1` (کپی ساختار) — **هرگز UPDATE روی نسخهٔ تأییدشده نیست**. (این همان کامیت تاریخچه است؛ برای دانشگاه Audit الزامی است)
3. انتشار فقط از `APPROVED`؛ حذف فقط `DRAFT`.
4. `curriculum_approvals` برای هر انتقال ردیف آپند می‌شود؛ هیچ UPDATEای در این جدول نیست (append-only).
5. فقط یک `PUBLISHED` فعال به ازای `(major, degreeLevel, track)` — توسط UNIQUE جزئی.

---

## ۶. Validation Engine (`lib/curriculum-validator.ts` — خالص و تست‌پذیر)

**اصل:** خروجی هر چک یک رکورد است، نه متن UI:

```ts
type CheckResult = {
  check: string;                    // «PREREQ_CYCLE_FREE»
  severity: 'ERROR' | 'WARN';      // ERROR = مانع تأیید، WARN = قابل تأیید با یادداشت
  message: string;                  // متن فارسیِ ساخته‌شده از داده‌ها (نه ثابت)
  affected: (string | number)[];    // کد دروس/شماره ترم‌های مرتبط
};
```

| # | چک | ورودی | شدت |
|---|---|---|---|
| ۱ | `UNITS_COVER_MIN` | مجموع واحدهای CORE/MAJOR ≥ `total_required_units` | ERROR |
| ۲ | `UNITS_PER_SEMESTER_BALANCED` | بار هر ترم ≤ `max_units_per_term` (فعلاً از `degree_level_configs`، قابل override نسخه) | WARN |
| ۳ | `COURSE_TYPES_COMPLETE` | وجود حداقل مقرر از هر نقش (طبق تنظیمات نسخه) | WARN |
| ۴ | `PREREQ_REFERENCES_VALID` | تمام `course` درون درخت‌های PREREQ، در `courses.code` موجودند | ERROR |
| ۵ | `PREREQ_CYCLE_FREE` | گراف جهت‌دار پیش‌نیازها بدون دور (DFS خاکستری) | ERROR |
| ۶ | `PREREQ_SEMESTER_ORDER` | پیش‌نیاز در ترمِ قبل‌تر یا مساوی (هشدار برای پیش‌نیازهای آینده) | WARN |
| ۷ | `COREQ_PRESENT` | هر درسِ با COREQ، هم‌ترم‌بندی‌شده دارد (یا `auto_corequisite_allowed`) | WARN |
| ۸ | `GRADUATION_COVERAGE` | وجود حداقل N درس با `is_graduation_required=1` در هشت ترم | ERROR |
| ۹ | `TRACK_INTEGRITY` | هر درس انتخابیِ گرایش، در درختِ همان گرایش تعریف شده | WARN |
| ۱۰ | `EQUIVALENCY_DISJOINT` | هم‌ارزها (یک cluster) در یک نسخه، با هم «تکرار» شمرده نشوند | WARN |

**اتصال به UI:** Tab «بررسی و خاتمه» فقط `CheckResult[]` را رندر می‌کند؛ هیچ ✓/✗ ثابتی در Client نمی‌ماند. (پاسخ قطعی به بند ۶ گزارش قبلی شما)

---

## ۷. Server Actions (`lib/curriculum-actions.ts`)

| اقدام | فاز مجاز | نکته |
|---|---|---|
| `createCurriculumVersion` | همیشه | کپی‌ساز از نسخهٔ مرجع با `deepCopy: boolean` |
| `cloneCurriculumVersion(sourceId)` | همیشه | همان `copyCurriculum` واقعی (courses + rules + semester mappings + **prereqs** + **grade policies**) |
| `updateCurriculumMeta` | DRAFT | |
| `setTrack` | DRAFT | |
| `addCourseToCurriculum` | DRAFT | + پیوست قواعد اختیاری |
| `removeCourseFromCurriculum` | DRAFT | خطا اگر `enrollments` به آن درس در نسخه‌های PUBLISHED وابسته باشد |
| `updateCourseRoleUnits` | DRAFT | |
| `setPrerequisite(courseId, logicTree)` | DRAFT | upsert در `course_rules(ruleType=PREREQ, syllabusId=نسخه)` |
| `setCorequisite(courseId, logicTree)` | DRAFT | همان با `COREQ` |
| `assignToSemester(courseId, semesterNo)` | DRAFT | `curriculum_courses.recommended_semester` |
| `bulkAssignSemesters` | DRAFT | |
| `setPassingGrade(courseId, minGrade)` | DRAFT | |
| `validateCurriculum(versionId)` | همیشه | **خروجی: `CheckResult[]`** |
| `submitForApproval(versionId)` | DRAFT→REVIEW | عدم وجود ERROR شرط است |
| `approveCurriculum(versionId)` | REVIEW→APPROVED | نقش `EDU_EXPERT`/`ADMIN` + نوشتن `curriculum_approvals` |
| `publishCurriculum(versionId)` | APPROVED→PUBLISHED | بستن UNIQUE جزئی (قتل یک نسخهٔ رقیب) |
| `archiveCurriculum(versionId)` | PUBLISHED→ARCHIVED | |
| `createRevision(versionId)` | APPROVED/PUBLISHED | ساخت `1404-R1` به‌صورت DRAFT |

**الگوی اجرایی (پیروی از قرارداد موجود پروژه):** تراکنش اتمی + `audit_logs` + چک نقش با `requireRole` + بررسی `status` در همان تراکنش (جلوگیری از TOCTOU).

---

## ۸. طراحی Scheduling — شکاف واقعی و Solver V2

### ۸.۱ چه چیزی از قبل داریم (نباید ساخت)

فازبندی `SUPPLY→ALLOCATION→REVIEW→PUBLISHED`، سهمیهٔ شیفتی سالن، استخر شناور خدمات عمومی، پیش‌بینی تقاضا و پیشنهاد هوشمند (`getSmartSuggestions`)، `offering_professors` برای استاد دوم (Co-Teaching)، `sharedScheduleGroupKey` برای زوج‌کلاس‌ها، `calculateSlotScore` (نزدیکی دانشکده + ترجیح استاد + تناسب ظرفیت)، `scheduleType` (زوج/فرد/همه)، `class_sessions` برای جلسات واقعی.

### ۸.۲ شکاف‌ها و اولویت

| # | خواسته | وضعیت | اقدام (بعد از اتصال — فاز ۶) |
|---|---|---|---|
| ۱ | تداخل دانشجویی بین دو درس | ➖ `overlaps()` + فیلترهای enroll موجود | افزودن `checkStudentGroupConflicts()` به هستهٔ خالص |
| ۲ | تداخل استاد دوم | 🔶 `offering_professors` موجود، چک‌کننده ندارد | تابع `professorConflicts(schedule, staffIds[])` |
| ۳ | ظرفیت واقعی اتاق | ➖ `classrooms.capacity` | در `allocateSections` موجود؛ افزودن چک `capacity >= groupSize` |
| ۴ | نیازمندی تجهیزات | ➖ `roomType` متنی است | ستون `facilities jsonb` روی `classrooms` (Migration کوچک) |
| ۵ | سقف روزانه/هفتگی استاد | 🔶 فیلدها در UI Client هستند، در DB نیستند | `maxWeeklyUnits/maxDailyHours` → `staff` یا جدول `staff_teaching_limits` (ترجیح: ستون روی `staff` برای فاز ۱) |
| ۶ | زمان استراحت استاد | ➕ هیچ | `SCHEDULING_CONSTRAINTS` در `system_settings` (گرید نیم‌ساعته از قبل هست) |
| ۷ | فاصلهٔ ساختمان‌ها | ➕ هیچ | جدول `campus_buildings(id, name, distanceMinutes jsonb)` یا matris در تنظیمات — گام ۸ |
| ۸ | زوج/فرد هم‌زمان | 🔶 `weekRecurrence` + `sharedScheduleGroupKey` | «زوج کلاس‌ها با هم چیده شوند» به‌صورت قید سخت در Solver |
| ۹ | محدودیت دانشجویان شاغل | ➕ هیچ | نیازمند `cohort.shiftPreference` — فاز ۸ |
| ۱۰ | تولید ۱۶ جلسهٔ واقعی | ➕ هیچ | `generateClassSessions(schedule, academicCalendar)` — فاز ۶ (پاسخ بند ۱۱) |

### ۸.۳ Solver V2 — «سخت افزوده، نرم امتیاز»

استراتژی: **دست نزنیم به ساختار؛ فقط لایهٔ قیود را اضافه کنیم** (همان الگوی `scheduling-core` خالص):

1. **قیود سخت (CSP قبل از امتیازدهی):** ظرفیت اتاق، تداخل استاد (اصلی+دوم)، تداخل گروه‌های هم‌کوهورت، سقف روزانه استاد، یک درس یک اتاق در یک slot، زوج‌کلاس.
2. **قیود نرم (وزن‌دار در `calculateSlotScore`):** ترجیح شیفت، فاصلهٔ ساختمان، استراحت استاد، فاصلهٔ از کلاس قبلی، ترجیح روز.
3. **KPI واقعی در `scheduling-health`:** درصد تداخل‌های باقی‌مانده + تعداد قیود نقض‌شده — **نه «۰٪ تضمین‌شده» تا وقتی ثابت نشده** (پاسخ به بند ۹).

---

## ۹. اتصال به Enrollment و Graduation (فاز ۵ — عمدتاً موجود است)

```ts
// جایگزینِ منطق سیلابس در ۳ موتور:
resolveApplicableCurriculum(student, term):
  1) نسخه‌های PUBLISHED/ARCHIVED با major_id = student.majorId
  2) filter: entry_year_from ≤ student.entryYear ≤ (entry_year_to ?? ∞)
  3) اگر بیش از یک نسخه → قانون «مقصد نهایی»: newer revision wins (مثل 1404-R1 جایگزین 1404 شود)
  4) no-match → خطای صریح + ردیف در تنظیمات «نگاشت دستی نسخه» (جدول کوچک student_curriculum_overrides در فاز بعد)
```

- `enroll-engine.buildPrereqContext` → فقط `syllabusId` را از `curriculum_version_id` می‌گیرد (امضای تابع عوض نمی‌شود).
- `graduation-engine` → همان query با `status IN ('PUBLISHED','ARCHIVED')` و `is_graduation_required` به‌جای شمارش کل.
- `regulations-engine` → `total_required_units` از نسخهٔ حل‌شده.

---

## ۱۰. نقشهٔ راه اجرایی (بدون UI جدید تا فاز ۷)

| فاز | تحویلی | اندازهٔ تقریبی |
|---|---|---|
| **۱ — Domain Model** | ✅ **انجام شد**: `src/lib/curriculum-types.ts` + `src/lib/curriculum-resolution.ts` + `tests/curriculum-domain.test.ts` (۵۱ تست سبز — ماشین حالت، کدگذاری نسخه، نرمال‌سازی درخت، Resolution) | ~۴۰۰ خط |
| **۲ — DB** | ✅ **انجام شد**: `drizzle/0002_curriculum_versions.sql` (۵۴ statement — rename + بازپرشدن داده + ۴ جدول/۲ جدول جدید + قیدهای جزئی/CHECK/FK) + دفترچهٔ `_journal.json` + ۱۷ رفرنس کد + `pg-hardening.sql` (RLS روی approvals) + `scheduling-seed.mjs` — **تأییدشده روی PostgreSQL واقعی (۲۳ آزمون PGlite)** | ~۵۵۰ خط |
| **۳ — Server Actions** | ✅ **انجام شد**: `src/app/admin/curriculum/actions.ts` با ۲۱ اکشن گارددار (۲ متدویه: الگوی D3) + `src/lib/curriculum-validator.ts` (هستهٔ واقعی ۶ چک — گیت تأیید بدون استاب) + `tests/curriculum-validator.test.ts` (۱۹ تست) | ~۹۵۰ خط |
| **۴ — Validation Engine** | ✅ **انجام شد**: ۱۱ چک واقعی (۶ هسته + ۵ تکمیلی: SEMESTER_LOAD، COURSE_TYPES_COMPLETE، TRACK_INTEGRITY، EQUIVALENCY_DISJOINT، SEMESTER_UNASSIGNED) + سقف ترم سه‌لایه (نسخه←مقطع←۲۰) + مینیمم نقش‌ها (پایان‌نامه برای ارشد/دکتری) + ۳۶ تست | ~۶۵۰ + تست |
| **۵ — اتصال Enroll/Graduation** | ✅ **انجام شد**: `src/lib/curriculum-apply.ts` (resolution DB-backed + پیام‌های صریح دلیل) + سیم‌کشی ۳ موتور (enroll/graduation/regulations) + فیلتر وضعیت در کوئری پیش‌بینی scheduling + `selectEffectiveRules` با رفع باگ null===null + ۱۰ تست فاز ۵ (۶۱ تست domain) | ~۲۵۰ خط |
| **۶ — اتصال Scheduling** | ✅ **انجام شد**: `src/app/admin/scheduling/actions.ts` (۴ اکشن گارددار: داشبورد، چک قیود، چرخهٔ فاز، تولید جلسات) + `src/lib/class-session-generator.ts` (تولید واقعی class_sessions — idempotent، هفتگی/زوج/فرد، تاریخ شمسی) + قیود سخت `detectScheduleConflicts` و `sessionDatesFor` در `scheduling-core` (۲۴ تست جدید) + سیم‌کشی `page.tsx` → `initial` به Client | ~۸۰۰ خط |
| **۷ — Thin Client** | بازنویسی `CurriculumManagerClient` (خواندن از server actions + رندر `CheckResult[]`) — حفظ ظاهر | ~۴۰۰ خط |

---

## ۱۱. Decision Log — تصمیم‌هایی که باید پیش از فاز ۲ گرفته شود

| # | تصمیم | گزینه‌ها | پیشنهاد | اثر |
|---|---|---|---|---|
| **D1** | نام جدول: `syllabuses` یا `curriculum_versions`؟ | حفظ / rename | ✅ **تصمیم گرفته شد (rename)** — مهاجرت ۰۰۰۲ با بازپرشدن کامل داده | اعمال‌شده |
| **D2** | پیش‌نیازها در `course_rules.logicTree` بمانند یا جدول جدید؟ | موجود / جدید | **موجود** + افزودن `COREQ` و `unitsPassed` | جلوگیری از دو منبع حقیقت |
| **D3** | واحدها با `numeric(3,1)` بمانند؟ | عدد صحیح / numeric | **numeric** (تغییر نوع = شکستن ۳ موتور؛ عملیات‌ها روی ×۱۰ عدد صحیح) | عدم regression |
| **D4** | `curriculum_tracks` فوراً یا با دادهٔ Mock `tracks[]`؟ | فوراً / بعداً | **فوراً** (جدول کوچک؛ ریشهٔ Mock در Client را قطع می‌کند) | − |
| **D5** | آیا نسخهٔ ۱۴۰۴ تازه، از سیلابس‌های فعلی seed شود؟ | بله / نه | **بله**: دموی فعلی را بدون از دست رفتن داده مهاجرت می‌دهیم | دمو زنده می‌ماند |
| **D6** | Solver V2 در همین فاز؟ | قبل از اتصال / بعد | **بعد از فاز ۶** (ابتدا منبع دادهٔ واقعی) | طبق نقشه |
| **D7** | `CheckResult` فوراً در UI؟ | فوراً / فاز ۷ | **فاز ۷** (فعلاً در API + تست) | Scope طبق توافق |
| **D8** | Rejection ریسک‌ها | — | RLS روی ۲۱ جدول موجود + ۲ جدول جدید (الگوی پیادهٔ قبلی) | امنیت |

---

## ۱۲. ریسک‌ها و Rollback

1. **rename** → ریسک اصلی؛ mitigation: Migration نسخه‌دار + بکاپ قبلاز شروع (الگوی `RUNNER_TEMP` موجود در CI) + برگشت با `git revert` و Migration قبل.
2. **دادهٔ دمو** → بعد از rename، `seed-base.mjs` باید سازگار شود (فاز ۲ جزو تحویلی).
3. **دو Client** تا فاز ۷ روی Mock می‌مانند ⇒ **هیچ Feature جدیدی** روی آن‌ها؛ فقط سیم‌کشی. (قانون طلایی: Mock → Mock → API نسازیم.)
4. **تست‌های broken** → `tests/` فعلی (scheduling-core، exam-core…) نباید تغییر کنند؛ خروجی‌های مهاجرت باید قبل از commit سبز باشند.

---

## پیوست — نگاشت نام‌ها (قدیم → جدید)

| قدیم | جدید | نوع تغییر |
|---|---|---|
| `syllabuses` | `curriculum_versions` | rename + ۱۲ ستون جدید |
| `syllabus_courses` | `curriculum_courses` | rename + ۸ ستون جدید |
| `syllabuses.minTotalUnitsToGraduate` | `curriculum_versions.total_required_units` | rename |
| `syllabuses.entryYearStart/End` | `curriculum_versions.entry_year_from/to` | rename |
| `syllabus_courses.semesterNo` | `curriculum_courses.recommended_semester` | rename |
| `course_rules` | `course_rules` (بدون تغییر جدول) | گسترش مقادیر `ruleType` |
| — | `curriculum_tracks` | جدول جدید |
| — | `curriculum_approvals` | جدول جدید (append-only) |
| `classrooms.roomType` | + `facilities jsonb` | فاز ۶ |
| `staff` | + `max_weekly_units/max_daily_hours` | فاز ۶ |
