-- =====================================================================
-- سامانه جامع آموزشی دانشگاه آفاق — فاز صفر (هسته قابل اجرا)
-- Schema مطابق طرح معماری (Drizzle Design → SQLite)
-- تمام فیلدهای JSONB در طرح، اینجا از نوع TEXT با محتوای JSON ذخیره
-- می‌شوند و با json_extract خوانده می‌شوند (مهاجرت آسان به PostgreSQL)
-- =====================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- لایه ۰: RBAC پویا (نقش‌ها و دسترسی‌ها داده‌محور هستند، نه هاردکد)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,               -- STUDENT, PROFESSOR, DEP_HEAD, EDU_EXPERT, VICE_EDU, FINANCE_EXPERT, ADMIN
  title TEXT NOT NULL,
  isSystem INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,               -- enroll.submit, workflow.act, admin.regulations ...
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  roleId INTEGER NOT NULL REFERENCES roles(id),
  permissionId INTEGER NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (roleId, permissionId)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nationalCode VARCHAR(10) UNIQUE NOT NULL,
  firstName VARCHAR(100) NOT NULL,
  lastName VARCHAR(100) NOT NULL,
  mobile VARCHAR(11),
  email VARCHAR(150),
  passwordHash VARCHAR(255) NOT NULL,
  isActive INTEGER DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
  userId INTEGER NOT NULL REFERENCES users(id),
  roleId INTEGER NOT NULL REFERENCES roles(id),
  PRIMARY KEY (userId, roleId)
);

CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(64) PRIMARY KEY,
  userId INTEGER NOT NULL REFERENCES users(id),
  expiresAt TIMESTAMP NOT NULL
);

-- ---------------------------------------------------------------------
-- لایه ۱: ساختار سازمانی و هسته هویتی
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS degree_level_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title VARCHAR(100) NOT NULL,             -- کارشناسی پیوسته / کارشناسی ارشد
  code VARCHAR(30) UNIQUE NOT NULL,        -- BS / MS / PHD
  defaultPassingGrade DECIMAL(4,2) NOT NULL DEFAULT 10.00,
  conditionalGpaThreshold DECIMAL(4,2) NOT NULL DEFAULT 12.00,
  maxUnitsPerTerm INTEGER DEFAULT 20
);

CREATE TABLE IF NOT EXISTS faculties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(150) NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(150) NOT NULL,
  facultyId INTEGER NOT NULL REFERENCES faculties(id)
);

CREATE TABLE IF NOT EXISTS majors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(150) NOT NULL,
  degreeLevelId INTEGER NOT NULL REFERENCES degree_level_configs(id),
  departmentId INTEGER REFERENCES departments(id),
  majorCode VARCHAR(10)                    -- کد رشته برای فرمول شماره دانشجویی
);

-- پذیرش سازمان سنجش: نگاشت کد سنجش ↔ کد داخلی + جدول واسط Staging
CREATE TABLE IF NOT EXISTS sanjesh_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sanjeshCode VARCHAR(50) NOT NULL,
  internalMajorId INTEGER REFERENCES majors(id),
  sanjeshQuota VARCHAR(50),
  internalQuotaCode INTEGER
);

CREATE TABLE IF NOT EXISTS admissions_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nationalCode VARCHAR(10) NOT NULL,
  rawSanjeshData TEXT,                     -- کل خط فایل سنجش به صورت JSON
  mappedMajorId INTEGER REFERENCES majors(id),
  status VARCHAR(20) DEFAULT 'pending',    -- pending / resolved / imported
  -- ثبت‌نام غیرحضوری Zero-Touch (سند §۲۴۲۷): IMPORTED→DOSSIER_SUBMITTED→KYC_RUN→READY→APPROVED/REJECTED
  userId INTEGER REFERENCES users(id),
  fullName VARCHAR(150),
  mobile VARCHAR(11),
  entryYear INTEGER,
  degreeLevelId INTEGER REFERENCES degree_level_configs(id),
  quotaType VARCHAR(50) DEFAULT 'NORMAL',
  profileJson TEXT,                        -- اطلاعات فردی/آدرس ویزارد
  paidAdvance INTEGER DEFAULT 0,           -- پرداخت علی‌الحساب (شرط صدور شماره دانشجویی)
  paidAmount INTEGER DEFAULT 0,
  onboardingStatus VARCHAR(30) DEFAULT 'IMPORTED',
  studentId INTEGER,                       -- پس از تبدیل به پروندهٔ قطعی
  decisionNote TEXT
);

-- موتور فرمول‌ساز شماره دانشجویی: {Year:2}{DegreeCode:1}{MajorCode:3}{Seq:3}
CREATE TABLE IF NOT EXISTS student_id_formulas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  degreeLevelId INTEGER REFERENCES degree_level_configs(id),
  entryYear INTEGER,
  formula VARCHAR(255) NOT NULL,
  currentSequence INTEGER DEFAULT 0
);

-- ---------------------------------------------------------------------
-- لایه ۲: موتور آیین‌نامه‌ها (Regulation Engine) — قوانین = داده
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS educational_regulations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title VARCHAR(150) NOT NULL,
  degreeLevelId INTEGER NOT NULL REFERENCES degree_level_configs(id),
  effectiveFromYear INTEGER NOT NULL,
  effectiveToYear INTEGER,                 -- NULL = هنوز معتبر
  rulesConfig TEXT NOT NULL,               -- JSON (سقف واحد، تابستان، ترم آخر، سهمیه‌ها، سیاست نمره ردی ...)
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id) UNIQUE,
  studentCode VARCHAR(14) UNIQUE NOT NULL,
  majorId INTEGER REFERENCES majors(id),
  degreeLevelId INTEGER NOT NULL REFERENCES degree_level_configs(id),
  regulationId INTEGER NOT NULL REFERENCES educational_regulations(id),
  entryYear INTEGER NOT NULL,
  entryTerm INTEGER DEFAULT 1,
  status VARCHAR(30) DEFAULT 'ACTIVE' NOT NULL,  -- ACTIVE / BLOCKED_COMMISSION / EXPELLED / GRADUATED
  quotaType VARCHAR(50) DEFAULT 'NORMAL' NOT NULL,
  extraAllowedSemesters INTEGER DEFAULT 0 NOT NULL,   -- ارفاق کمیسیون موارد خاص
  extraAllowedProbations INTEGER DEFAULT 0 NOT NULL,
  currentTermNo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id) UNIQUE,
  staffCode VARCHAR(20) UNIQUE NOT NULL,
  departmentId INTEGER REFERENCES departments(id),
  staffType VARCHAR(50),                   -- هیئت علمی / مدعو / کارشناس آموزش
  academicRank VARCHAR(50),                -- مربی / استادیار / دانشیار / استاد
  degree VARCHAR(50)
);

-- ---------------------------------------------------------------------
-- لایه ۳: دروس، چارت نسخه‌بندی‌شده و قوانین پیش‌نیاز (درخت منطقی)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code VARCHAR(20) UNIQUE NOT NULL,
  title VARCHAR(150) NOT NULL,
  theoreticalUnits DECIMAL(3,1) DEFAULT 0,
  practicalUnits DECIMAL(3,1) DEFAULT 0,
  units DECIMAL(3,1) NOT NULL,
  courseType VARCHAR(50),                  -- پایه / اصلی / تخصصی / عمومی / اختیاری
  departmentId INTEGER REFERENCES departments(id),
  gradingType VARCHAR(20) DEFAULT 'NUMERIC',   -- NUMERIC / DESCRIPTIVE (قبول-رد)
  affectsGpa INTEGER DEFAULT 1                 -- اثر در معدل
);

CREATE TABLE IF NOT EXISTS syllabuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  majorId INTEGER REFERENCES majors(id),
  entryYearStart INTEGER NOT NULL,
  entryYearEnd INTEGER,
  minTotalUnitsToGraduate INTEGER
);

CREATE TABLE IF NOT EXISTS syllabus_courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  syllabusId INTEGER NOT NULL REFERENCES syllabuses(id),
  courseId INTEGER NOT NULL REFERENCES courses(id),
  semesterNo INTEGER
);

-- قوانین درس: پیش‌نیاز/هم‌نیاز به صورت درخت منطقی JSON
-- نمونه: {"operator":"AND","conditions":[{"course":"1112","minGrade":10},{"course":"1113"}]}
CREATE TABLE IF NOT EXISTS course_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  courseId INTEGER NOT NULL REFERENCES courses(id),
  syllabusId INTEGER REFERENCES syllabuses(id),
  ruleType VARCHAR(20) NOT NULL,           -- PREREQ / COREQ / MIN_UNITS
  logicTree TEXT NOT NULL,
  customPassingGrade DECIMAL(4,2)          -- اورراید نمره قبولی این درس
);

-- ---------------------------------------------------------------------
-- لایه ۴: ترم‌ها، ارائه‌ها، زمان‌بندی و کلاس‌ها
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  termCode VARCHAR(10) UNIQUE NOT NULL,    -- 1051 = مهر ۱۴۰۵
  title VARCHAR(100) NOT NULL,
  isCurrent INTEGER DEFAULT 0,
  isSummer INTEGER DEFAULT 0,
  isEnrollmentOpen INTEGER DEFAULT 0,
  enrollmentStartDate TIMESTAMP,
  enrollmentEndDate TIMESTAMP,
  startDate TIMESTAMP,
  endDate TIMESTAMP,
  -- موتور کنترل زمان‌بندی نمرات (SLA Engine — قابل تنظیم توسط مدیر آموزش)
  gradeEntryDeadline TIMESTAMP,           -- مهلت ثبت/نهایی‌سازی نمرات اساتید
  appealWindowDays INTEGER DEFAULT 3,     -- بازه قانونی اعتراض دانشجو پس از ثبت موقت
  professorAppealSlaDays INTEGER DEFAULT 5 -- مهلت پاسخ استاد به اعتراض (تایم‌اوت اتوماتیک)
);

CREATE TABLE IF NOT EXISTS classrooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(100) NOT NULL,
  capacity INTEGER NOT NULL,
  roomType VARCHAR(30),                    -- THEORY / LAB / HALL / EXAM
  buildingName VARCHAR(100),               -- نام ساختمان جهت درج در کارت ورود
  rowsCount INTEGER,                       -- هندسه چیدمان (نقشه سالن)
  colsCount INTEGER
);

CREATE TABLE IF NOT EXISTS course_offerings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  termId INTEGER NOT NULL REFERENCES academic_terms(id),
  courseId INTEGER NOT NULL REFERENCES courses(id),
  professorId INTEGER REFERENCES staff(id),
  groupNumber INTEGER DEFAULT 1 NOT NULL,
  capacity INTEGER NOT NULL,
  waitlistCapacity INTEGER DEFAULT 0,
  enrolledCount INTEGER DEFAULT 0 NOT NULL,
  genderRestriction VARCHAR(10),
  sharedScheduleGroupKey VARCHAR(50),      -- دروس ادغامی: یک کلاس فیزیکی، چند کد درس
  offeringType VARCHAR(30) DEFAULT 'NORMAL' NOT NULL,  -- NORMAL / DIRECTED_READING
  customGradeDeadline TIMESTAMP,
  isActive INTEGER DEFAULT 1 NOT NULL,
  gradesHash TEXT,                        -- امضای SHA-256 لیست نمرات قطعی (کشف دستکاری)
  gradesTemporaryAt TIMESTAMP,            -- شروع بازه قانونی اعتراض دانشجو
  gradesFinalizedAt TIMESTAMP
);

-- چند-استادی و نقش‌ها (مدرس/راهنما/مشاور/داور/ممتحن)
CREATE TABLE IF NOT EXISTS offering_professors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offeringId INTEGER NOT NULL REFERENCES course_offerings(id),
  staffId INTEGER NOT NULL REFERENCES staff(id),
  role VARCHAR(50) NOT NULL DEFAULT 'MAIN_LECTURER',
  sharePercentage DECIMAL(5,2) DEFAULT '100.00'
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offeringId INTEGER NOT NULL REFERENCES course_offerings(id),
  scheduleType VARCHAR(20) NOT NULL,       -- CLASS / EXAM
  dayOfWeek INTEGER,                       -- 0=شنبه ... 6=جمعه
  examDate DATE,
  startTime TIME NOT NULL,
  endTime TIME NOT NULL,
  roomId INTEGER REFERENCES classrooms(id)
);

CREATE TABLE IF NOT EXISTS professor_availabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staffId INTEGER NOT NULL REFERENCES staff(id),
  termId INTEGER REFERENCES academic_terms(id),
  dayOfWeek INTEGER,
  startTime TIME,
  endTime TIME
);

-- ---------------------------------------------------------------------
-- لایه ۵: انتخاب واحد (سبد + ثبت‌نام + لیست انتظار)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id),
  offeringId INTEGER NOT NULL REFERENCES course_offerings(id),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (studentId, offeringId)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id),
  offeringId INTEGER NOT NULL REFERENCES course_offerings(id),
  status VARCHAR(30) DEFAULT 'REGISTERED' NOT NULL,
  -- REGISTERED / WAITLISTED / PENDING_COUNCIL / DROPPED / EMERGENCY_DROPPED / ABSENT / REJECTED
  waitlistPosition INTEGER,
  workflowRequestId INTEGER,               -- اتصال به پرونده گردش کار (خطاهای نرم)
  hasEvaluated INTEGER DEFAULT 0 NOT NULL, -- گیت ارزشیابی
  gradeValue DECIMAL(4,2),
  gradeStatus VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- DRAFT/TEMPORARY/APPEALED/FINALIZED
  isDirectedReading INTEGER DEFAULT 0,
  registeredAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  absenceMarkedAt TIMESTAMP               -- زمان ثبت غیبت سیستمی (مهلت ۴۸ ساعته گواهی)
);
CREATE INDEX IF NOT EXISTS idx_enr_student ON enrollments(studentId);

CREATE TABLE IF NOT EXISTS grade_appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollmentId INTEGER NOT NULL REFERENCES enrollments(id),
  studentMessage TEXT NOT NULL,
  professorReply TEXT,
  oldGrade DECIMAL(4,2),
  newGrade DECIMAL(4,2),
  status VARCHAR(20) DEFAULT 'OPEN',       -- OPEN / ACCEPTED / REJECTED
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grade_submission_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staffId INTEGER NOT NULL REFERENCES staff(id),
  offeringId INTEGER NOT NULL REFERENCES course_offerings(id),
  otpHash TEXT NOT NULL,                  -- فقط هش کد ۵ رقمی ذخیره می‌شود
  expiresAt TIMESTAMP NOT NULL,           -- اعتبار ۲ دقیقه
  isUsed INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,             -- حداکثر ۳ تلاش؛ تایم سوم = هشدار امنیتی
  lockedAt TIMESTAMP,                     -- قفل پس از ۳ تلاش ناموفق
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- اسنپ‌شات کارنامه قطعی (نسخه فریز شده ترم — مصون از تغییر آیین‌نامه‌های آینده)
CREATE TABLE IF NOT EXISTS transcript_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id),
  termId INTEGER NOT NULL REFERENCES academic_terms(id),
  snapshotJson TEXT NOT NULL,
  snapshotHash TEXT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (studentId, termId)
);

-- ---------------------------------------------------------------------
-- لایه ۶: ارزشیابی اساتید (فرم‌ساز پویا + گمنامی مطلق)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  termId INTEGER REFERENCES academic_terms(id),
  title VARCHAR(150) NOT NULL,
  startDate TIMESTAMP NOT NULL,
  endDate TIMESTAMP NOT NULL,
  isActive INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evaluation_forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title VARCHAR(150) NOT NULL,
  targetType VARCHAR(50)                    -- PROFESSOR / LAB / SYLLABUS
);

CREATE TABLE IF NOT EXISTS evaluation_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  formId INTEGER REFERENCES evaluation_forms(id),
  questionText TEXT NOT NULL,
  questionType VARCHAR(20),                -- SINGLE_CHOICE / MULTI_CHOICE / TEXT
  weight DECIMAL(3,2) DEFAULT '1.0',
  orderIndex INTEGER,
  axisLabel VARCHAR(60)                    -- برچسب کوتاه محور نمودار رادار (BI)
);

CREATE TABLE IF NOT EXISTS question_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  questionId INTEGER REFERENCES evaluation_questions(id),
  optionLabel VARCHAR(100) NOT NULL,
  scoreValue DECIMAL(4,2)
);

-- نگاشت پویای فرم به کلاس (سند §۱۳۲۵): فرم عملی برای دروس عملی، نظری برای بقیه
CREATE TABLE IF NOT EXISTS form_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  formId INTEGER NOT NULL REFERENCES evaluation_forms(id),
  departmentId INTEGER REFERENCES departments(id),  -- NULL = همه دانشکده‌ها
  courseType VARCHAR(50),                           -- NULL = همه انواع درس
  practicalOnly INTEGER                             -- NULL = هر، 1 = فقط عملی، 0 = فقط نظری
);

-- بدون هیچ ارجاعی به شناسه دانشجو (گمنامی)
CREATE TABLE IF NOT EXISTS evaluation_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodId INTEGER REFERENCES evaluation_periods(id),
  offeringId INTEGER REFERENCES course_offerings(id),
  questionId INTEGER REFERENCES evaluation_questions(id),
  selectedOptionId INTEGER REFERENCES question_options(id),
  textAnswer TEXT
);

-- ---------------------------------------------------------------------
-- لایه ۷: موتور گردش کار (BPM) با SLA و Timeout Action
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serviceName VARCHAR(100) UNIQUE NOT NULL,  -- IRANDOC_SIMILARITY / SAKHA / ...
  baseUrl VARCHAR(255),
  authType VARCHAR(30),                      -- BEARER / API_KEY / OAUTH2
  authCredentials TEXT,                      -- رمزنگاری‌شده
  timeoutSeconds INTEGER DEFAULT 10,
  isActive INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS process_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code VARCHAR(50) UNIQUE NOT NULL,          -- PREREQ_WAIVER / COMMISSION_PERMIT / ...
  title VARCHAR(150) NOT NULL,
  formSchema TEXT,                           -- JSON فرم‌ساز پویا
  isActive INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS process_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processId INTEGER NOT NULL REFERENCES process_definitions(id),
  stepOrder INTEGER NOT NULL,
  title VARCHAR(150) NOT NULL,
  stepType VARCHAR(20) DEFAULT 'USER' NOT NULL,  -- USER / SERVICE(API)
  roleCode VARCHAR(50),                     -- نقشی که این مرحله در کارتابل اوست
  assigneeStaffId INTEGER REFERENCES staff(id),  -- یا شخص مشخص
  slaHours INTEGER,                         -- زمان مجاز (SLA)
  timeoutAction VARCHAR(30),                -- ESCALATE / AUTO_APPROVE / AUTO_REJECT / NOTIFY
  integrationId INTEGER REFERENCES integrations_config(id),
  apiConfig TEXT                            -- JSON: endpoint, successCondition, fallback
);

CREATE TABLE IF NOT EXISTS process_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stepId INTEGER NOT NULL REFERENCES process_steps(id),
  action VARCHAR(20) NOT NULL,              -- APPROVE / REJECT / RETURN
  toStepId INTEGER REFERENCES process_steps(id),
  isFinal INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS student_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trackingCode VARCHAR(20) UNIQUE NOT NULL,
  studentId INTEGER NOT NULL REFERENCES students(id),
  processId INTEGER NOT NULL REFERENCES process_definitions(id),
  currentStepId INTEGER REFERENCES process_steps(id),
  formData TEXT,                            -- JSON داده‌های فرم
  status VARCHAR(30) DEFAULT 'SUBMITTED' NOT NULL, -- SUBMITTED/IN_REVIEW/APPROVED/REJECTED/RETURNED
  autoCreated INTEGER DEFAULT 0,            -- سیستم‌ساخته (مثل مسدودی کمیسیون)
  relatedEnrollmentId INTEGER REFERENCES enrollments(id),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- لاگ دقیق برای شناسایی گلوگاه و KPI کارمندان
CREATE TABLE IF NOT EXISTS request_step_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requestId INTEGER NOT NULL REFERENCES student_requests(id),
  stepId INTEGER NOT NULL REFERENCES process_steps(id),
  assignedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  firstViewedAt TIMESTAMP,
  completedAt TIMESTAMP,
  actorStaffId INTEGER REFERENCES staff(id),
  action VARCHAR(20),                       -- APPROVE / REJECT / RETURN / TIMEOUT_*
  note TEXT,
  durationMinutes INTEGER,                  -- مدت توقف خالص
  slaStatus VARCHAR(20)                     -- ON_TIME / WARNING / BREACHED
);

-- ---------------------------------------------------------------------
-- لایه ۸: مالی (گیت علی‌الحساب + Silent Billing + دفتر کل)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS term_financial_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  termId INTEGER NOT NULL REFERENCES academic_terms(id),
  degreeLevelId INTEGER NOT NULL REFERENCES degree_level_configs(id),
  fixedTuition DECIMAL(12,0) NOT NULL,       -- شهریه ثابت
  perUnitTuition DECIMAL(12,0) DEFAULT 0,    -- شهریه متغیر هر واحد
  advancePaymentRequired DECIMAL(12,0) NOT NULL  -- کف علی‌الحساب برای باز شدن سبد
);

CREATE TABLE IF NOT EXISTS student_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id),
  termId INTEGER REFERENCES academic_terms(id),
  transactionType VARCHAR(20) NOT NULL,      -- DEBIT (بدهی) / CREDIT (پرداخت)
  amount DECIMAL(12,0) NOT NULL,
  description TEXT,
  referenceId INTEGER,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS financial_clearances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL REFERENCES students(id),
  termId INTEGER NOT NULL REFERENCES academic_terms(id),
  isCleared INTEGER DEFAULT 0,
  clearedAt TIMESTAMP,
  UNIQUE (studentId, termId)
);

-- ---------------------------------------------------------------------
-- لایه ۹: امتحانات، سالن‌ها و تخصیص صندلی ضدتقلب
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_halls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(100) NOT NULL,
  totalCapacity INTEGER NOT NULL,
  rowsCount INTEGER,
  colsCount INTEGER,
  buildingName VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  termId INTEGER NOT NULL REFERENCES academic_terms(id),
  examDate VARCHAR(10) NOT NULL,
  startTime VARCHAR(5) NOT NULL,
  endTime VARCHAR(5) NOT NULL,
  UNIQUE (termId, examDate, startTime)
);

CREATE TABLE IF NOT EXISTS seat_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollmentId INTEGER NOT NULL REFERENCES enrollments(id),
  sessionId INTEGER NOT NULL REFERENCES exam_sessions(id),
  hallId INTEGER NOT NULL REFERENCES exam_halls(id),
  seatNumber INTEGER NOT NULL,
  blockKey VARCHAR(120),                     -- بلوک استاد/درس/گروه (فاز ۱ چیدمان)
  UNIQUE (sessionId, hallId, seatNumber)
);

CREATE TABLE IF NOT EXISTS invigilators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staffId INTEGER NOT NULL REFERENCES staff(id),
  sessionId INTEGER NOT NULL REFERENCES exam_sessions(id),
  hallId INTEGER NOT NULL REFERENCES exam_halls(id),
  role VARCHAR(50) DEFAULT 'PROCTOR'         -- HEAD (سرپرست سالن) / PROCTOR (مراقب)
);

-- ---------------------------------------------------------------------
-- لایه ۱۰: حق‌التدریس، قراردادها، حضور و غیاب و امضای الکترونیک
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teaching_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academicRank VARCHAR(50),
  degree VARCHAR(50),
  baseRatePerUnit DECIMAL(12,0) NOT NULL,
  effectiveYear INTEGER
);

CREATE TABLE IF NOT EXISTS teaching_coefficients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruleName VARCHAR(100) NOT NULL,
  multiplier DECIMAL(3,2) NOT NULL
);

-- قوانین جبران خدمات (موتور فرمول‌ساز مالی — سند §۲۸۴۷): هیچ ضریبی هاردکد نیست
CREATE TABLE IF NOT EXISTS payroll_calculation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offeringType VARCHAR(50),                -- THEORY / THESIS / DIRECTED_READING / INTERNSHIP (NULL = همه)
  professorRole VARCHAR(50),               -- MAIN_LECTURER / SUPERVISOR / ADVISOR / REVIEWER / EXAMINER (NULL = همه)
  academicRank VARCHAR(50),                -- مربی / استادیار / دانشیار / استاد (NULL = همه)
  multiplierUnit DECIMAL(4,2) DEFAULT '1.00',      -- ضریب واحد: نرخ‌پایه × واحد × ضریب
  multiplierPerStudent DECIMAL(4,2),              -- ضریب به‌ازای هر دانشجو: نرخ × واحد × دانشجو × ضریب
  flatFee DECIMAL(12,0),                           -- پرداختی مقطوع (مثلاً هر جلسه دفاع × تعداد دانشجو)
  title VARCHAR(150),
  isActive INTEGER DEFAULT 1,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS professor_term_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staffId INTEGER NOT NULL REFERENCES staff(id),
  termId INTEGER NOT NULL REFERENCES academic_terms(id),
  contractType VARCHAR(50),                 -- FULL_TIME / ADJUNCT
  baseDutyUnits DECIMAL(4,2) DEFAULT 0,     -- موظفی ترمیک
  taxRate DECIMAL(4,2)
);

CREATE TABLE IF NOT EXISTS payroll_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contractId INTEGER NOT NULL REFERENCES professor_term_contracts(id),
  totalEquivalentUnits DECIMAL(6,2),
  payableUnits DECIMAL(6,2),
  grossAmount DECIMAL(12,0),
  deductions DECIMAL(12,0),                 -- مالیات + کسورات عدم برگزاری
  netAmount DECIMAL(12,0),
  status VARCHAR(20) DEFAULT 'DRAFT',       -- DRAFT / MID_TERM_PAID / FINAL_SETTLED
  detailJson TEXT,                          -- ریز محاسبه شفاف برای داشبورد استاد
  midtermPaidAmount DECIMAL(12,0) DEFAULT 0,
  midtermPaidAt TIMESTAMP,
  finalPaidAmount DECIMAL(12,0) DEFAULT 0,
  finalPaidAt TIMESTAMP,
  computedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payroll_contract ON payroll_statements(contractId);

CREATE TABLE IF NOT EXISTS class_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offeringId INTEGER NOT NULL REFERENCES course_offerings(id),
  sessionDate VARCHAR(10) NOT NULL,
  startTime VARCHAR(5) NOT NULL,
  endTime VARCHAR(5) NOT NULL,
  status VARCHAR(20) DEFAULT 'SCHEDULED' NOT NULL,   -- SCHEDULED / HELD / ABSENT / CANCELED
  isMakeUpSession INTEGER DEFAULT 0,          -- جلسه جبرانی
  replacedSessionId INTEGER REFERENCES class_sessions(id),
  sessionNo INTEGER                            -- شماره جلسه (۱ تا ۱۶)
);

-- حضور و غیاب دانشجویان در هر جلسه (فیش کلاسی استاد)
CREATE TABLE IF NOT EXISTS student_class_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL REFERENCES class_sessions(id),
  enrollmentId INTEGER NOT NULL REFERENCES enrollments(id),
  status VARCHAR(10) NOT NULL,                -- PRESENT / ABSENT / LATE
  UNIQUE (sessionId, enrollmentId)
);

-- لاگ حضور استاد (تایید غیرمستقیم — روش‌های اثبات)
CREATE TABLE IF NOT EXISTS professor_class_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL REFERENCES class_sessions(id),
  staffId INTEGER NOT NULL REFERENCES staff(id),
  verificationMethod VARCHAR(30) NOT NULL,    -- ROLL_CALL / CHAIN_CONTINUITY / GATE_FINGERPRINT / MANUAL_ADMIN
  recordedIpAddress VARCHAR(50),
  deviceUserAgent TEXT,
  status VARCHAR(20) DEFAULT 'VALID' NOT NULL, -- VALID / FLAGGED_SUSPICIOUS
  recordedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- تردد فیزیکی پرسنل (میان‌افزار دستگاه اثر انگشت گیت)
CREATE TABLE IF NOT EXISTS physical_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staffId INTEGER NOT NULL REFERENCES staff(id),
  punchTime TIMESTAMP NOT NULL,
  deviceLocation VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS electronic_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contractId INTEGER REFERENCES professor_term_contracts(id),
  staffId INTEGER NOT NULL REFERENCES staff(id),
  termId INTEGER NOT NULL REFERENCES academic_terms(id),
  docType VARCHAR(50),                      -- CONTRACT / APPOINTMENT
  title VARCHAR(200),
  documentSnapshot TEXT NOT NULL,
  documentHash VARCHAR(255) NOT NULL,
  signatureStatus VARCHAR(20) DEFAULT 'PENDING',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documentId INTEGER NOT NULL REFERENCES electronic_documents(id),
  staffId INTEGER NOT NULL REFERENCES staff(id),
  signedAt TIMESTAMP NOT NULL,
  ipAddress VARCHAR(50),
  userAgent TEXT,
  otpUsed VARCHAR(10)
);

CREATE TABLE IF NOT EXISTS verification_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  targetId INTEGER NOT NULL,
  targetType VARCHAR(50) NOT NULL,
  otpCode VARCHAR(10) NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  isUsed INTEGER DEFAULT 0
);

-- ---------------------------------------------------------------------
-- لایه ۱۱: نظام وظیفه (سخا) و بایگانی الکترونیک
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS military_service_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL UNIQUE REFERENCES students(id),
  status VARCHAR(50),                       -- PENDING_UNIVERSITY_APPROVAL / EDUCATIONAL_EXEMPTION / REVOKED_DROPOUT (سند §۲۶۷۰)
  exemptionExpiry DATE,
  sakhaStatus VARCHAR(50),                  -- PENDING_EXTENSION_REVIEW / EXTENSION_SENT_TO_SAKHA / EXTENSION_GRANTED (سند §۲۷۲۵)
  exemptionStartDate DATE,                  -- تاریخ شروع معافیت تحصیلی (سند §۲۶۰۱)
  sakhaTrackingCode VARCHAR(50),            -- کد پیگیری سامانه سخا
  pendingExtraSemesters INTEGER,            -- سنوات ارفاقی مصوب کمیسیون (منتظر ارسال به ناجا)
  lastSyncAt TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title VARCHAR(100) NOT NULL,
  scope VARCHAR(20) DEFAULT 'STUDENT',      -- STUDENT / STAFF
  accessRoles TEXT                          -- JSON: نقش‌های مجاز به مشاهدهٔ پوشه (RBAC پوشه‌ای سند §۲۴۸۳)
);

-- انواع مدارک: هر مدرک چه ویژگی‌هایی دارد (سند §۲۴۶۵)
CREATE TABLE IF NOT EXISTS document_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoryId INTEGER NOT NULL REFERENCES document_categories(id),
  code VARCHAR(40) UNIQUE NOT NULL,
  title VARCHAR(100) NOT NULL,              -- کارت ملی، دیپلم، سفته...
  targetAudience VARCHAR(10) DEFAULT 'BOTH',-- STUDENT / STAFF / BOTH
  isRequired INTEGER DEFAULT 1,             -- برای تکمیل ثبت‌نام اجباری است؟
  needsVerification INTEGER DEFAULT 1       -- نیاز به تایید کارشناس/API دارد؟
);

CREATE TABLE IF NOT EXISTS student_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personUserId INTEGER NOT NULL REFERENCES users(id),   -- مالک (دانشجو یا استاد)
  categoryId INTEGER NOT NULL REFERENCES document_categories(id),
  typeId INTEGER REFERENCES document_types(id),
  fileName VARCHAR(255) NOT NULL,
  fileUrl VARCHAR(500) NOT NULL,            -- لینک Object Storage (S3/MinIO) — فایل واقعی در DB ذخیره نمی‌شود
  mimeType VARCHAR(100),
  verificationStatus VARCHAR(20) DEFAULT 'PENDING',  -- PENDING / VERIFIED / REJECTED (سند §۲۴۷۰)
  verifiedBy INTEGER,                       -- کارشناس تاییدکننده
  rejectionReason TEXT,                     -- مثلاً «عکس تار است»
  uploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- سوابق احراز هویت دیجیتال e-KYC (سند §۲۵۲۸)
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  civilRegistryStatus VARCHAR(30) DEFAULT 'PENDING',  -- VERIFIED / MISMATCH (ثبت احوال)
  shahkarStatus VARCHAR(30) DEFAULT 'PENDING',        -- VERIFIED: موبایل به نام کاربر است
  fetchedCivilData TEXT,                              -- JSON مشخصات دریافتی از ثبت احوال
  livenessVideoUrl VARCHAR(500),                      -- ویدیوی سلفی در Object Storage
  livenessChallenge VARCHAR(150),                     -- چالش تصادفی (مثلاً «سر به راست»)
  faceMatchScore DECIMAL(5,2),                        -- درصد شباهت چهره
  aiVerificationStatus VARCHAR(30) DEFAULT 'PENDING', -- AUTO_APPROVED / MANUAL_REVIEW / REJECTED
  expertDecision VARCHAR(20),                         -- APPROVED / REJECTED (بررسی چشمی ۷۰–۹۰٪)
  reviewedBy INTEGER,
  ipAddress VARCHAR(50),
  deviceInfo TEXT,
  completedAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- لایه ۱۲: قالب پیام‌ها + اعلان‌ها + ردگیری امنیتی (Immutable Audit)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventCode VARCHAR(50) UNIQUE NOT NULL,    -- EXAM_ABSENCE / ENROLLMENT_SUCCESS / ...
  channel VARCHAR(20),                      -- SMS / EMAIL / PUSH
  templateText TEXT NOT NULL,               -- با متغیرهای {firstName} {courseName} ...
  isActive INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  eventCode VARCHAR(50),
  payload TEXT,                             -- JSON
  isRead INTEGER DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actorUserId INTEGER,
  action VARCHAR(100) NOT NULL,
  entityType VARCHAR(50),
  entityId INTEGER,
  details TEXT,
  prevHash VARCHAR(64),
  hash VARCHAR(64) NOT NULL,               -- زنجیره هش — غیرقابل تغییر
  ipAddress VARCHAR(50),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- نماها (Views) — کارنامه و وضعیت مالی
-- ---------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS v_student_balance AS
SELECT studentId,
       SUM(CASE WHEN transactionType='CREDIT' THEN amount ELSE -amount END) AS balance
FROM student_ledger GROUP BY studentId;

-- ═══════════════════════════════════════════════════════════
--  ایندکس‌های عملکردی (بار بالا: انتخاب واحد همزمان)
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_enr_offering    ON enrollments(offeringId);
CREATE INDEX IF NOT EXISTS idx_enr_student_st  ON enrollments(studentId, status);
CREATE INDEX IF NOT EXISTS idx_sched_offering  ON schedules(offeringId);
CREATE INDEX IF NOT EXISTS idx_fc_student_term ON financial_clearances(studentId, termId);
CREATE INDEX IF NOT EXISTS idx_rules_course    ON course_rules(courseId);
CREATE INDEX IF NOT EXISTS idx_courses_code    ON courses(code);
CREATE INDEX IF NOT EXISTS idx_off_term        ON course_offerings(termId, isActive);
CREATE INDEX IF NOT EXISTS idx_req_student     ON student_requests(studentId);
CREATE INDEX IF NOT EXISTS idx_req_step_open   ON student_requests(currentStepId, status);
CREATE INDEX IF NOT EXISTS idx_logs_request    ON request_step_logs(requestId);
CREATE INDEX IF NOT EXISTS idx_logs_open       ON request_step_logs(stepId, completedAt);
CREATE INDEX IF NOT EXISTS idx_notif_user      ON notifications(userId);
CREATE INDEX IF NOT EXISTS idx_ledger_student  ON student_ledger(studentId);
CREATE INDEX IF NOT EXISTS idx_cart_student    ON cart_items(studentId);
CREATE INDEX IF NOT EXISTS idx_sessions_exp    ON sessions(expiresAt);

CREATE INDEX IF NOT EXISTS idx_gotp_staff_off    ON grade_submission_otps(staffId, offeringId);
CREATE INDEX IF NOT EXISTS idx_appeals_open      ON grade_appeals(status, createdAt);
CREATE INDEX IF NOT EXISTS idx_snap_student_term ON transcript_snapshots(studentId, termId);


CREATE INDEX IF NOT EXISTS idx_seat_session   ON seat_allocations(sessionId);
CREATE INDEX IF NOT EXISTS idx_seat_enr       ON seat_allocations(enrollmentId);
CREATE INDEX IF NOT EXISTS idx_inv_session   ON invigilators(sessionId, hallId);


-- ---------------------------------------------------------------------
-- ماژول ۱۰ (بخش حضور و غیاب + قرارداد الکترونیکی) — سند §۱۸۰۶–۲۰۴۰
-- ---------------------------------------------------------------------

-- تنظیمات سیستمی داده‌محور (مثلاً رنج IP شبکه داخلی دانشگاه)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(60) PRIMARY KEY,
  value TEXT NOT NULL
);

-- قالب اسناد اداری (موتور قالب‌ساز — متن قرارداد/ابلاغیه بدون کد)
CREATE TABLE IF NOT EXISTS document_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code VARCHAR(50) UNIQUE NOT NULL,          -- CONTRACT / APPOINTMENT
  title VARCHAR(150) NOT NULL,
  templateText TEXT NOT NULL                  -- {firstName} {courses} {amount} ...
);

-- جلسات کلاسی (۱۶ جلسه — ایجاد خودکار در ابتدای ترم)

-- OTP امضای اسناد (الگوی امنیتی مشابه OTP نمرات)
CREATE TABLE IF NOT EXISTS doc_sign_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staffId INTEGER NOT NULL REFERENCES staff(id),
  documentId INTEGER NOT NULL REFERENCES electronic_documents(id),
  otpHash TEXT NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  isUsed INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  lockedAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cs_offering      ON class_sessions(offeringId, sessionDate);
CREATE INDEX IF NOT EXISTS idx_cs_status       ON class_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sca_session     ON student_class_attendance(sessionId);
CREATE INDEX IF NOT EXISTS idx_pca_session     ON professor_class_attendance(sessionId);
CREATE INDEX IF NOT EXISTS idx_pal_staff_time  ON physical_access_logs(staffId, punchTime);
CREATE INDEX IF NOT EXISTS idx_edoc_staff_term ON electronic_documents(staffId, termId, docType);
