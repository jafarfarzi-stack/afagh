// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — کالبد Drizzle/PostgreSQL — نگاشت مستقیم ۱:۱ از schema.sql فاز صفر
//  تولیدشده خودکار (۷۳ جدول)؛ نام ستون‌ها عیناً حفظ شده تا مهاجرت دادهٔ
//  SQLite→PG مستقیم باشد. لایهٔ سخت‌سازی (ایندکس/پارتیشن/RLS — سند §۲۰۹۳–۲۲۴۰)
//  → src/db/pg-hardening.sql
// ══════════════════════════════════════════════════════════════════════
import { pgTable, serial, integer, varchar, text, timestamp, date, time, numeric, jsonb, unique, primaryKey, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  isSystem: integer('isSystem').default(0)
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  category: varchar('category', { length: 50 }).default('عمومی'),
  description: varchar('description', { length: 255 })
});

export const role_permissions = pgTable('role_permissions', {
  roleId: integer('roleId').notNull().references(() => roles.id),
  permissionId: integer('permissionId').notNull().references(() => permissions.id)
}, (t) => ({ pk: primaryKey({ columns: [t.roleId, t.permissionId] }) }));

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  nationalCode: varchar('nationalCode', { length: 10 }).notNull().unique(),
  firstName: varchar('firstName', { length: 100 }).notNull(),
  lastName: varchar('lastName', { length: 100 }).notNull(),
  mobile: varchar('mobile', { length: 11 }),
  email: varchar('email', { length: 150 }),
  // ── اطلاعات شناسنامه‌ای (هویت ثبت‌احوال) — برای مهاجرت از سیستم قدیم و صدور اسناد رسمی ──
  birthCertNo: varchar('birthCertNo', { length: 20 }),        // شماره شناسنامه
  birthCertSeries: varchar('birthCertSeries', { length: 30 }), // سریال شناسنامه (سری/سریال)
  placeOfBirth: varchar('placeOfBirth', { length: 150 }),      // محل تولد
  placeOfIssue: varchar('placeOfIssue', { length: 150 }),      // محل صدور شناسنامه
  birthDate: timestamp('birthDate'),                           // تاریخ تولد
  fatherName: varchar('fatherName', { length: 100 }),          // نام پدر
  gender: varchar('gender', { length: 10 }),                   // جنسیت: MALE / FEMALE
  address: varchar('address', { length: 300 }),                // نشانی پستی
  passwordHash: varchar('passwordHash', { length: 255 }).notNull(),
  isActive: integer('isActive').default(1),
  createdAt: timestamp('createdAt').defaultNow()
});

export const user_roles = pgTable('user_roles', {
  userId: integer('userId').notNull().references(() => users.id),
  roleId: integer('roleId').notNull().references(() => roles.id),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.roleId] }) }));

export const sessions = pgTable('sessions', {
  token: varchar('token', { length: 64 }).primaryKey(),
  userId: integer('userId').notNull().references(() => users.id),
  expiresAt: timestamp('expiresAt').notNull()
});

export const degree_level_configs = pgTable('degree_level_configs', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 100 }).notNull(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  defaultPassingGrade: numeric('defaultPassingGrade', { precision: 4, scale: 2 }).notNull().default('10.00'),
  conditionalGpaThreshold: numeric('conditionalGpaThreshold', { precision: 4, scale: 2 }).notNull().default('12.00'),
  maxUnitsPerTerm: integer('maxUnitsPerTerm').default(20)
});

export const faculties = pgTable('faculties', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 150 }).notNull()
});

export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 150 }).notNull(),
  facultyId: integer('facultyId').notNull().references(() => faculties.id)
});

export const majors = pgTable('majors', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 150 }).notNull(),
  degreeLevelId: integer('degreeLevelId').notNull().references(() => degree_level_configs.id),
  departmentId: integer('departmentId').references(() => departments.id),
  majorCode: varchar('majorCode', { length: 10 })
});

export const sanjesh_mappings = pgTable('sanjesh_mappings', {
  id: serial('id').primaryKey(),
  sanjeshCode: varchar('sanjeshCode', { length: 50 }).notNull(),
  internalMajorId: integer('internalMajorId').references(() => majors.id),
  sanjeshQuota: varchar('sanjeshQuota', { length: 50 }),
  internalQuotaCode: integer('internalQuotaCode')
});

export const admissions_staging = pgTable('admissions_staging', {
  id: serial('id').primaryKey(),
  nationalCode: varchar('nationalCode', { length: 10 }).notNull(),
  rawSanjeshData: text('rawSanjeshData'),
  mappedMajorId: integer('mappedMajorId').references(() => majors.id),
  status: varchar('status', { length: 20 }).default('pending'),
  userId: integer('userId').references(() => users.id),
  fullName: varchar('fullName', { length: 150 }),
  mobile: varchar('mobile', { length: 11 }),
  entryYear: integer('entryYear'),
  degreeLevelId: integer('degreeLevelId').references(() => degree_level_configs.id),
  quotaType: varchar('quotaType', { length: 50 }).default('NORMAL'),
  profileJson: text('profileJson'),
  paidAdvance: integer('paidAdvance').default(0),
  paidAmount: integer('paidAmount').default(0),
  onboardingStatus: varchar('onboardingStatus', { length: 30 }).default('IMPORTED'),
  studentId: integer('studentId'),
  decisionNote: text('decisionNote')
});

export const student_id_formulas = pgTable('student_id_formulas', {
  id: serial('id').primaryKey(),
  degreeLevelId: integer('degreeLevelId').references(() => degree_level_configs.id),
  entryYear: integer('entryYear'),
  formula: varchar('formula', { length: 255 }).notNull(),
  currentSequence: integer('currentSequence').default(0)
});

export const educational_regulations = pgTable('educational_regulations', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 150 }).notNull(),
  degreeLevelId: integer('degreeLevelId').notNull().references(() => degree_level_configs.id),
  effectiveFromYear: integer('effectiveFromYear').notNull(),
  effectiveToYear: integer('effectiveToYear'),
  rulesConfig: text('rulesConfig').notNull(),
  createdAt: timestamp('createdAt').defaultNow()
});

export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  userId: integer('userId').notNull().unique().references(() => users.id),
  studentCode: varchar('studentCode', { length: 14 }).notNull().unique(),
  majorId: integer('majorId').references(() => majors.id),
  degreeLevelId: integer('degreeLevelId').notNull().references(() => degree_level_configs.id),
  regulationId: integer('regulationId').notNull().references(() => educational_regulations.id),
  entryYear: integer('entryYear').notNull(),
  entryTerm: integer('entryTerm').default(1),
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  quotaType: varchar('quotaType', { length: 50 }).notNull().default('NORMAL'),
  extraAllowedSemesters: integer('extraAllowedSemesters').notNull().default(0),
  extraAllowedProbations: integer('extraAllowedProbations').notNull().default(0),
  currentTermNo: integer('currentTermNo').default(1)
});

export const staff = pgTable('staff', {
  id: serial('id').primaryKey(),
  userId: integer('userId').notNull().unique().references(() => users.id),
  staffCode: varchar('staffCode', { length: 20 }).notNull().unique(),
  departmentId: integer('departmentId').references(() => departments.id),
  staffType: varchar('staffType', { length: 50 }),
  academicRank: varchar('academicRank', { length: 50 }),
  degree: varchar('degree', { length: 50 })
});

export const courses = pgTable('courses', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  title: varchar('title', { length: 150 }).notNull(),
  theoreticalUnits: numeric('theoreticalUnits', { precision: 3, scale: 1 }).default('0'),
  practicalUnits: numeric('practicalUnits', { precision: 3, scale: 1 }).default('0'),
  units: numeric('units', { precision: 3, scale: 1 }).notNull(),
  courseType: varchar('courseType', { length: 50 }),
  departmentId: integer('departmentId').references(() => departments.id),
  gradingType: varchar('gradingType', { length: 20 }).default('NUMERIC'),
  affectsGpa: integer('affectsGpa').default(1)
});

export const syllabuses = pgTable('syllabuses', {
  id: serial('id').primaryKey(),
  majorId: integer('majorId').references(() => majors.id),
  entryYearStart: integer('entryYearStart').notNull(),
  entryYearEnd: integer('entryYearEnd'),
  minTotalUnitsToGraduate: integer('minTotalUnitsToGraduate')
});

export const syllabus_courses = pgTable('syllabus_courses', {
  id: serial('id').primaryKey(),
  syllabusId: integer('syllabusId').notNull().references(() => syllabuses.id),
  courseId: integer('courseId').notNull().references(() => courses.id),
  semesterNo: integer('semesterNo')
});

export const course_rules = pgTable('course_rules', {
  id: serial('id').primaryKey(),
  courseId: integer('courseId').notNull().references(() => courses.id),
  syllabusId: integer('syllabusId').references(() => syllabuses.id),
  ruleType: varchar('ruleType', { length: 20 }).notNull(),
  logicTree: text('logicTree').notNull(),
  customPassingGrade: numeric('customPassingGrade', { precision: 4, scale: 2 })
});

export const academic_terms = pgTable('academic_terms', {
  id: serial('id').primaryKey(),
  termCode: varchar('termCode', { length: 10 }).notNull().unique(),
  title: varchar('title', { length: 100 }).notNull(),
  termType: varchar('termType', { length: 20 }).notNull().default('NORMAL'), // NORMAL | SUMMER | EQUIVALENCE
  isCurrent: integer('isCurrent').default(0),
  isSummer: integer('isSummer').default(0),
  isEnrollmentOpen: integer('isEnrollmentOpen').default(0),
  enrollmentStartDate: timestamp('enrollmentStartDate'),
  enrollmentEndDate: timestamp('enrollmentEndDate'),
  startDate: timestamp('startDate'),
  endDate: timestamp('endDate'),
  gradeEntryDeadline: timestamp('gradeEntryDeadline'),
  appealWindowDays: integer('appealWindowDays').default(3),
  professorAppealSlaDays: integer('professorAppealSlaDays').default(5)
});

export const classrooms = pgTable('classrooms', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  capacity: integer('capacity').notNull(),
  roomType: varchar('roomType', { length: 30 }),
  buildingName: varchar('buildingName', { length: 100 }),
  rowsCount: integer('rowsCount'),
  colsCount: integer('colsCount')
});

export const course_offerings = pgTable('course_offerings', {
  id: serial('id').primaryKey(),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  courseId: integer('courseId').notNull().references(() => courses.id),
  professorId: integer('professorId').references(() => staff.id),
  groupNumber: integer('groupNumber').notNull().default(1),
  capacity: integer('capacity').notNull(),
  waitlistCapacity: integer('waitlistCapacity').default(0),
  enrolledCount: integer('enrolledCount').notNull().default(0),
  genderRestriction: varchar('genderRestriction', { length: 10 }),
  sharedScheduleGroupKey: varchar('sharedScheduleGroupKey', { length: 50 }),
  offeringType: varchar('offeringType', { length: 30 }).notNull().default('NORMAL'),
  customGradeDeadline: timestamp('customGradeDeadline'),
  isActive: integer('isActive').notNull().default(1),
  gradesHash: text('gradesHash'),
  gradesTemporaryAt: timestamp('gradesTemporaryAt'),
  gradesFinalizedAt: timestamp('gradesFinalizedAt'),
  targetDegreeLevelId: integer('targetDegreeLevelId'),   // مقطع هدف (NULL = همهٔ مقاطع)
  targetMajorId: integer('targetMajorId'),               // رشتهٔ هدف (NULL = همهٔ رشته‌ها)
  entryYearStart: integer('entryYearStart'),             // بازهٔ ورودی (NULL = بدون محدودیت)
  entryYearEnd: integer('entryYearEnd')
});

export const offering_professors = pgTable('offering_professors', {
  id: serial('id').primaryKey(),
  offeringId: integer('offeringId').notNull().references(() => course_offerings.id),
  staffId: integer('staffId').notNull().references(() => staff.id),
  role: varchar('role', { length: 50 }).notNull().default('MAIN_LECTURER'),
  sharePercentage: numeric('sharePercentage', { precision: 5, scale: 2 }).default('100.00')
});

export const schedules = pgTable('schedules', {
  id: serial('id').primaryKey(),
  offeringId: integer('offeringId').notNull().references(() => course_offerings.id),
  scheduleType: varchar('scheduleType', { length: 20 }).notNull(),
  dayOfWeek: integer('dayOfWeek'),
  examDate: date('examDate'),
  startTime: time('startTime').notNull(),
  endTime: time('endTime').notNull(),
  roomId: integer('roomId').references(() => classrooms.id)
});

export const professor_availabilities = pgTable('professor_availabilities', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  termId: integer('termId').references(() => academic_terms.id),
  dayOfWeek: integer('dayOfWeek'),
  startTime: time('startTime'),
  endTime: time('endTime')
});

export const cart_items = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  offeringId: integer('offeringId').notNull().references(() => course_offerings.id),
  createdAt: timestamp('createdAt').defaultNow(),
  UNIQUE: text('UNIQUE')
});

export const enrollments = pgTable('enrollments', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  offeringId: integer('offeringId').notNull().references(() => course_offerings.id),
  status: varchar('status', { length: 30 }).notNull().default('REGISTERED'),
  waitlistPosition: integer('waitlistPosition'),
  workflowRequestId: integer('workflowRequestId'),
  hasEvaluated: integer('hasEvaluated').notNull().default(0),
  gradeValue: numeric('gradeValue', { precision: 4, scale: 2 }),
  gradeStatus: varchar('gradeStatus', { length: 20 }).notNull().default('PENDING'),
  isDirectedReading: integer('isDirectedReading').default(0),
  registeredAt: timestamp('registeredAt').defaultNow(),
  absenceMarkedAt: timestamp('absenceMarkedAt')
}, (t) => ({ uq: unique('uq_enrollments').on(t.studentId, t.offeringId) }));

export const grade_appeals = pgTable('grade_appeals', {
  id: serial('id').primaryKey(),
  enrollmentId: integer('enrollmentId').notNull().references(() => enrollments.id),
  studentMessage: text('studentMessage').notNull(),
  professorReply: text('professorReply'),
  oldGrade: numeric('oldGrade', { precision: 4, scale: 2 }),
  newGrade: numeric('newGrade', { precision: 4, scale: 2 }),
  status: varchar('status', { length: 20 }).default('OPEN'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const grade_submission_otps = pgTable('grade_submission_otps', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  offeringId: integer('offeringId').notNull().references(() => course_offerings.id),
  otpHash: text('otpHash').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  isUsed: integer('isUsed').default(0),
  attempts: integer('attempts').default(0),
  lockedAt: timestamp('lockedAt'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const transcript_snapshots = pgTable('transcript_snapshots', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  snapshotJson: text('snapshotJson').notNull(),
  snapshotHash: text('snapshotHash').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  UNIQUE: text('UNIQUE')
}, (t) => ({ uq: unique('uq_transcript_snapshots').on(t.studentId, t.termId) }));

export const evaluation_periods = pgTable('evaluation_periods', {
  id: serial('id').primaryKey(),
  termId: integer('termId').references(() => academic_terms.id),
  title: varchar('title', { length: 150 }).notNull(),
  startDate: timestamp('startDate').notNull(),
  endDate: timestamp('endDate').notNull(),
  isActive: integer('isActive').default(0)
});

export const evaluation_forms = pgTable('evaluation_forms', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 150 }).notNull(),
  targetType: varchar('targetType', { length: 50 })
});

export const evaluation_questions = pgTable('evaluation_questions', {
  id: serial('id').primaryKey(),
  formId: integer('formId').references(() => evaluation_forms.id),
  questionText: text('questionText').notNull(),
  questionType: varchar('questionType', { length: 20 }),
  weight: numeric('weight', { precision: 3, scale: 2 }).default('1.0'),
  orderIndex: integer('orderIndex'),
  axisLabel: varchar('axisLabel', { length: 60 })
});

export const question_options = pgTable('question_options', {
  id: serial('id').primaryKey(),
  questionId: integer('questionId').references(() => evaluation_questions.id),
  optionLabel: varchar('optionLabel', { length: 100 }).notNull(),
  scoreValue: numeric('scoreValue', { precision: 4, scale: 2 })
});

export const form_assignments = pgTable('form_assignments', {
  id: serial('id').primaryKey(),
  formId: integer('formId').notNull().references(() => evaluation_forms.id),
  departmentId: integer('departmentId').references(() => departments.id),
  courseType: varchar('courseType', { length: 50 }),
  practicalOnly: integer('practicalOnly')
});

export const evaluation_responses = pgTable('evaluation_responses', {
  id: serial('id').primaryKey(),
  periodId: integer('periodId').references(() => evaluation_periods.id),
  offeringId: integer('offeringId').references(() => course_offerings.id),
  questionId: integer('questionId').references(() => evaluation_questions.id),
  selectedOptionId: integer('selectedOptionId').references(() => question_options.id),
  textAnswer: text('textAnswer')
});

export const integrations_config = pgTable('integrations_config', {
  id: serial('id').primaryKey(),
  serviceName: varchar('serviceName', { length: 100 }).notNull().unique(),
  baseUrl: varchar('baseUrl', { length: 255 }),
  authType: varchar('authType', { length: 30 }),
  authCredentials: text('authCredentials'),
  timeoutSeconds: integer('timeoutSeconds').default(10),
  isActive: integer('isActive').default(1)
});

export const step_api_actions = pgTable('step_api_actions', {
  id: serial('id').primaryKey(),
  stepId: integer('stepId').notNull().references(() => process_steps.id),
  integrationId: integer('integrationId').notNull().references(() => integrations_config.id),
  endpointPath: varchar('endpointPath', { length: 255 }).notNull(),
  httpMethod: varchar('httpMethod', { length: 10 }).notNull().default('POST'),
  payloadMapping: text('payloadMapping'),
  successCondition: text('successCondition'),
  fallbackAction: varchar('fallbackAction', { length: 50 }).default('MANUAL_REVIEW'),
  circuitBreakerThreshold: integer('circuitBreakerThreshold').default(3)
});

export const api_audit_logs = pgTable('api_audit_logs', {
  id: serial('id').primaryKey(),
  serviceName: varchar('serviceName', { length: 100 }).notNull(),
  requestId: integer('requestId').references(() => student_requests.id),
  stepId: integer('stepId').references(() => process_steps.id),
  requestUrl: varchar('requestUrl', { length: 500 }).notNull(),
  requestPayload: text('requestPayload'),
  responseStatus: integer('responseStatus'),
  responseBody: text('responseBody'),
  durationMs: integer('durationMs'),
  isSuccess: integer('isSuccess').default(1),
  executedAt: timestamp('executedAt').defaultNow()
});

export const process_definitions = pgTable('process_definitions', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 150 }).notNull(),
  category: varchar('category', { length: 50 }).notNull().default('عمومی'),
  description: text('description'),
  formSchema: text('formSchema'), // Dynamic JSON schema of fields
  outputTemplate: varchar('outputTemplate', { length: 50 }),
  feeAmount: integer('feeAmount').default(0),
  isActive: integer('isActive').default(1),
  createdAt: timestamp('createdAt').defaultNow()
});

export const process_steps = pgTable('process_steps', {
  id: serial('id').primaryKey(),
  processId: integer('processId').notNull().references(() => process_definitions.id),
  stepOrder: integer('stepOrder').notNull(),
  title: varchar('title', { length: 150 }).notNull(),
  stepType: varchar('stepType', { length: 30 }).notNull().default('USER'), // USER, AUTO_INTEGRATION, PARALLEL_GATEWAY
  roleCode: varchar('roleCode', { length: 50 }),
  assigneeStaffId: integer('assigneeStaffId').references(() => staff.id),
  slaHours: integer('slaHours').default(48), // Max duration allowed in hours
  timeoutAction: varchar('timeoutAction', { length: 30 }).default('ESCALATE'), // ESCALATE, AUTO_APPROVE, AUTO_REJECT, NOTIFY
  timeoutEscalateToRole: varchar('timeoutEscalateToRole', { length: 50 }),
  integrationId: integer('integrationId').references(() => integrations_config.id),
  apiConfig: text('apiConfig')
});

export const process_transitions = pgTable('process_transitions', {
  id: serial('id').primaryKey(),
  stepId: integer('stepId').notNull().references(() => process_steps.id),
  action: varchar('action', { length: 30 }).notNull(), // APPROVE, REJECT, RETURN_FOR_REVISION, ESCALATE
  toStepId: integer('toStepId').references(() => process_steps.id),
  isFinal: integer('isFinal').default(0)
});

export const student_requests = pgTable('student_requests', {
  id: serial('id').primaryKey(),
  trackingCode: varchar('trackingCode', { length: 30 }).notNull().unique(),
  studentId: integer('studentId').notNull().references(() => students.id),
  processId: integer('processId').notNull().references(() => process_definitions.id),
  currentStepId: integer('currentStepId').references(() => process_steps.id),
  formData: text('formData'),
  status: varchar('status', { length: 30 }).notNull().default('SUBMITTED'), // DRAFT, SUBMITTED, IN_REVIEW, APPROVED, REJECTED, READY_TO_PRINT, CANCELLED
  autoCreated: integer('autoCreated').default(0),
  relatedEnrollmentId: integer('relatedEnrollmentId').references(() => enrollments.id),
  satisfactionScore: integer('satisfactionScore'), // 1 to 5 CSAT stars
  feedbackText: text('feedbackText'),
  digitalStampHash: varchar('digitalStampHash', { length: 64 }),
  certificateNumber: varchar('certificateNumber', { length: 50 }),
  issuedAt: timestamp('issuedAt'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow()
});

export const request_step_logs = pgTable('request_step_logs', {
  id: serial('id').primaryKey(),
  requestId: integer('requestId').notNull().references(() => student_requests.id),
  stepId: integer('stepId').notNull().references(() => process_steps.id),
  assignedAt: timestamp('assignedAt').defaultNow(),
  firstViewedAt: timestamp('firstViewedAt'),
  completedAt: timestamp('completedAt'),
  actorStaffId: integer('actorStaffId').references(() => staff.id),
  actorRole: varchar('actorRole', { length: 50 }),
  action: varchar('action', { length: 30 }), // APPROVE, REJECT, RETURN_FOR_REVISION, ESCALATE, AUTO_TIMEOUT
  note: text('note'),
  durationMinutes: integer('durationMinutes'),
  slaStatus: varchar('slaStatus', { length: 30 }), // ON_TIME, WARNING, SLA_BREACHED, ESCALATED
  satisfactionScore: integer('satisfactionScore')
});

export const request_parallel_checkpoints = pgTable('request_parallel_checkpoints', {
  id: serial('id').primaryKey(),
  requestId: integer('requestId').notNull().references(() => student_requests.id),
  departmentCode: varchar('departmentCode', { length: 50 }).notNull(), // FINANCE, LIBRARY, WELFARE_FUND, LABORATORY, DORMITORY
  departmentTitle: varchar('departmentTitle', { length: 100 }).notNull(),
  isCleared: integer('isCleared').default(0),
  clearedByStaffId: integer('clearedByStaffId').references(() => staff.id),
  clearedAt: timestamp('clearedAt'),
  notes: text('notes')
});

export const term_financial_rules = pgTable('term_financial_rules', {
  id: serial('id').primaryKey(),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  degreeLevelId: integer('degreeLevelId').notNull().references(() => degree_level_configs.id),
  fixedTuition: numeric('fixedTuition', { precision: 12, scale: 0 }).notNull(),
  perUnitTuition: numeric('perUnitTuition', { precision: 12, scale: 0 }).default('0'),
  advancePaymentRequired: numeric('advancePaymentRequired', { precision: 12, scale: 0 }).notNull()
});

/**
 * قواعد شهریهٔ قابل تنظیم (بدون مقدار سخت‌کد) — موتور شهریه از اینجا می‌خواند.
 *
 * هر قاعده می‌تواند بر اساس سه کلید محدود شود:
 *   - مقطع (degreeLevelId): NULL = همهٔ مقاطع
 *   - نوع ترم (termType):   NORMAL / SUMMER / EQUIVALENCE — NULL = همه
 *   - نوع گذراندن درس (offeringType): NORMAL / TRANSFER / … — NULL = همه
 *
 * شهریهٔ ثابت (fixedTuition) یک‌بار به ازای «نوع ترم» و شهریهٔ متغیر
 * (perUnitTuition) به ازای هر واحد و بر اساس «نوع گذراندن درس» اعمال می‌شود؛
 * بنابراین معادل‌سازی می‌تواند نرخ ثابت و نرخ هر واحد کاملاً جداگانه داشته باشد.
 * هنگام انتخاب، خاص‌ترین قاعدهٔ منطبق (بر اساس تعداد کلیدهای غیرخالی) برنده است.
 */
export const tuition_fee_rules = pgTable('tuition_fee_rules', {
  id: serial('id').primaryKey(),
  degreeLevelId: integer('degreeLevelId').references(() => degree_level_configs.id), // NULL = همهٔ مقاطع
  termType: varchar('termType', { length: 20 }),        // NORMAL | SUMMER | EQUIVALENCE — NULL = همه
  offeringType: varchar('offeringType', { length: 30 }),// NORMAL | TRANSFER | … — NULL = همه
  fixedTuition: numeric('fixedTuition', { precision: 12, scale: 0 }).notNull().default('0'),
  perUnitTuition: numeric('perUnitTuition', { precision: 12, scale: 0 }).notNull().default('0'),
  effectiveFromYear: integer('effectiveFromYear'),      // NULL = بدون محدودیت ورودی
  isActive: integer('isActive').notNull().default(1),
  note: text('note'),
  updatedAt: timestamp('updatedAt').defaultNow()
});

export const student_ledger = pgTable('student_ledger', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  termId: integer('termId').references(() => academic_terms.id),
  transactionType: varchar('transactionType', { length: 20 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 0 }).notNull(),
  description: text('description'),
  referenceId: integer('referenceId'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const financial_clearances = pgTable('financial_clearances', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  isCleared: integer('isCleared').default(0),
  clearedAt: timestamp('clearedAt'),
  UNIQUE: text('UNIQUE')
}, (t) => ({ uq: unique('uq_financial_clearances').on(t.studentId, t.termId) }));

export const exam_halls = pgTable('exam_halls', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  totalCapacity: integer('totalCapacity').notNull(),
  rowsCount: integer('rowsCount'),
  colsCount: integer('colsCount'),
  buildingName: varchar('buildingName', { length: 100 })
});

export const exam_sessions = pgTable('exam_sessions', {
  id: serial('id').primaryKey(),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  examDate: varchar('examDate', { length: 10 }).notNull(),
  startTime: varchar('startTime', { length: 5 }).notNull(),
  endTime: varchar('endTime', { length: 5 }).notNull(),
  UNIQUE: text('UNIQUE')
}, (t) => ({ uq: unique('uq_exam_sessions').on(t.termId, t.examDate, t.startTime) }));

export const seat_allocations = pgTable('seat_allocations', {
  id: serial('id').primaryKey(),
  enrollmentId: integer('enrollmentId').notNull().references(() => enrollments.id),
  sessionId: integer('sessionId').notNull().references(() => exam_sessions.id),
  hallId: integer('hallId').notNull().references(() => exam_halls.id),
  seatNumber: integer('seatNumber').notNull(),
  blockKey: varchar('blockKey', { length: 120 }),
  UNIQUE: text('UNIQUE')
}, (t) => ({ uq: unique('uq_seat_allocations').on(t.sessionId, t.hallId, t.seatNumber) }));

export const invigilators = pgTable('invigilators', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  sessionId: integer('sessionId').notNull().references(() => exam_sessions.id),
  hallId: integer('hallId').notNull().references(() => exam_halls.id),
  role: varchar('role', { length: 50 }).default('PROCTOR'),
  attendanceStatus: varchar('attendanceStatus', { length: 20 }).default('PENDING'),
  hoursWorked: numeric('hoursWorked', { precision: 4, scale: 2 }).default('2.0'),
  calculatedPayment: numeric('calculatedPayment', { precision: 12, scale: 0 }).default('0'),
  paymentStatus: varchar('paymentStatus', { length: 20 }).default('UNPAID'),
  paidAt: timestamp('paidAt')
});

export const exam_remuneration_rates = pgTable('exam_remuneration_rates', {
  id: serial('id').primaryKey(),
  role: varchar('role', { length: 50 }).notNull(),
  roleTitle: varchar('roleTitle', { length: 100 }).notNull(),
  ratePerHour: numeric('ratePerHour', { precision: 12, scale: 0 }).notNull(),
  effectiveYear: integer('effectiveYear').default(1405)
});

export const professor_exam_attendance = pgTable('professor_exam_attendance', {
  id: serial('id').primaryKey(),
  offeringId: integer('offeringId').references(() => course_offerings.id),
  sessionId: integer('sessionId').references(() => exam_sessions.id),
  staffId: integer('staffId').references(() => staff.id),
  attendanceStatus: varchar('attendanceStatus', { length: 30 }).default('PENDING'),
  penaltyApplied: integer('penaltyApplied').default(0),
  penaltyAmount: numeric('penaltyAmount', { precision: 12, scale: 0 }).default('0'),
  notes: text('notes'),
  recordedAt: timestamp('recordedAt').defaultNow()
});

export const exam_minutes = pgTable('exam_minutes', {
  id: serial('id').primaryKey(),
  sessionId: integer('sessionId').notNull().references(() => exam_sessions.id),
  hallId: integer('hallId').notNull().references(() => exam_halls.id),
  totalStudentsExpected: integer('totalStudentsExpected').default(0),
  totalStudentsPresent: integer('totalStudentsPresent').default(0),
  totalStudentsAbsent: integer('totalStudentsAbsent').default(0),
  cheatingIncidentsCount: integer('cheatingIncidentsCount').default(0),
  supervisorStaffId: integer('supervisorStaffId').references(() => staff.id),
  isSignedAndFinalized: integer('isSignedAndFinalized').default(0),
  signedAt: timestamp('signedAt'),
  notes: text('notes'),
  summaryHash: varchar('summaryHash', { length: 255 })
});

export const teaching_rates = pgTable('teaching_rates', {
  id: serial('id').primaryKey(),
  academicRank: varchar('academicRank', { length: 50 }),
  degree: varchar('degree', { length: 50 }),
  baseRatePerUnit: numeric('baseRatePerUnit', { precision: 12, scale: 0 }).notNull(),
  effectiveYear: integer('effectiveYear')
});

export const teaching_coefficients = pgTable('teaching_coefficients', {
  id: serial('id').primaryKey(),
  ruleName: varchar('ruleName', { length: 100 }).notNull(),
  multiplier: numeric('multiplier', { precision: 3, scale: 2 }).notNull()
});

export const payroll_calculation_rules = pgTable('payroll_calculation_rules', {
  id: serial('id').primaryKey(),
  offeringType: varchar('offeringType', { length: 50 }),
  professorRole: varchar('professorRole', { length: 50 }),
  academicRank: varchar('academicRank', { length: 50 }),
  multiplierUnit: numeric('multiplierUnit', { precision: 4, scale: 2 }).default('1.00'),
  multiplierPerStudent: numeric('multiplierPerStudent', { precision: 4, scale: 2 }),
  flatFee: numeric('flatFee', { precision: 12, scale: 0 }),
  title: varchar('title', { length: 150 }),
  isActive: integer('isActive').default(1),
  updatedAt: timestamp('updatedAt').defaultNow()
});

export const professor_term_contracts = pgTable('professor_term_contracts', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  contractType: varchar('contractType', { length: 50 }),
  baseDutyUnits: numeric('baseDutyUnits', { precision: 4, scale: 2 }).default('0'),
  taxRate: numeric('taxRate', { precision: 4, scale: 2 })
});

export const payroll_statements = pgTable('payroll_statements', {
  id: serial('id').primaryKey(),
  contractId: integer('contractId').notNull().references(() => professor_term_contracts.id),
  totalEquivalentUnits: numeric('totalEquivalentUnits', { precision: 6, scale: 2 }),
  payableUnits: numeric('payableUnits', { precision: 6, scale: 2 }),
  grossAmount: numeric('grossAmount', { precision: 12, scale: 0 }),
  deductions: numeric('deductions', { precision: 12, scale: 0 }),
  netAmount: numeric('netAmount', { precision: 12, scale: 0 }),
  status: varchar('status', { length: 20 }).default('DRAFT'),
  detailJson: text('detailJson'),
  midtermPaidAmount: numeric('midtermPaidAmount', { precision: 12, scale: 0 }).default('0'),
  midtermPaidAt: timestamp('midtermPaidAt'),
  finalPaidAmount: numeric('finalPaidAmount', { precision: 12, scale: 0 }).default('0'),
  finalPaidAt: timestamp('finalPaidAt'),
  computedAt: timestamp('computedAt').defaultNow()
});

export const class_sessions = pgTable('class_sessions', {
  id: serial('id').primaryKey(),
  offeringId: integer('offeringId').notNull().references(() => course_offerings.id),
  sessionDate: varchar('sessionDate', { length: 10 }).notNull(),
  startTime: varchar('startTime', { length: 5 }).notNull(),
  endTime: varchar('endTime', { length: 5 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('SCHEDULED'),
  isMakeUpSession: integer('isMakeUpSession').default(0),
  replacedSessionId: integer('replacedSessionId').references((): AnyPgColumn => class_sessions.id),
  sessionNo: integer('sessionNo')
});

export const student_class_attendance = pgTable('student_class_attendance', {
  id: serial('id').primaryKey(),
  sessionId: integer('sessionId').notNull().references(() => class_sessions.id),
  enrollmentId: integer('enrollmentId').notNull().references(() => enrollments.id),
  status: varchar('status', { length: 10 }).notNull(),
  UNIQUE: text('UNIQUE')
});

export const professor_class_attendance = pgTable('professor_class_attendance', {
  id: serial('id').primaryKey(),
  sessionId: integer('sessionId').notNull().references(() => class_sessions.id),
  staffId: integer('staffId').notNull().references(() => staff.id),
  verificationMethod: varchar('verificationMethod', { length: 30 }).notNull(),
  recordedIpAddress: varchar('recordedIpAddress', { length: 50 }),
  deviceUserAgent: text('deviceUserAgent'),
  status: varchar('status', { length: 20 }).notNull().default('VALID'),
  recordedAt: timestamp('recordedAt').defaultNow()
});

export const physical_access_logs = pgTable('physical_access_logs', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  punchTime: timestamp('punchTime').notNull(),
  deviceLocation: varchar('deviceLocation', { length: 100 })
});

export const electronic_documents = pgTable('electronic_documents', {
  id: serial('id').primaryKey(),
  contractId: integer('contractId').references(() => professor_term_contracts.id),
  staffId: integer('staffId').notNull().references(() => staff.id),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  docType: varchar('docType', { length: 50 }),
  title: varchar('title', { length: 200 }),
  documentSnapshot: text('documentSnapshot').notNull(),
  documentHash: varchar('documentHash', { length: 255 }).notNull(),
  signatureStatus: varchar('signatureStatus', { length: 20 }).default('PENDING'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const document_signatures = pgTable('document_signatures', {
  id: serial('id').primaryKey(),
  documentId: integer('documentId').notNull().references(() => electronic_documents.id),
  staffId: integer('staffId').notNull().references(() => staff.id),
  signedAt: timestamp('signedAt').notNull(),
  ipAddress: varchar('ipAddress', { length: 50 }),
  userAgent: text('userAgent'),
  otpUsed: varchar('otpUsed', { length: 10 })
});

export const verification_otps = pgTable('verification_otps', {
  id: serial('id').primaryKey(),
  targetId: integer('targetId').notNull(),
  targetType: varchar('targetType', { length: 50 }).notNull(),
  otpCode: varchar('otpCode', { length: 10 }).notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  isUsed: integer('isUsed').default(0)
});

export const military_service_records = pgTable('military_service_records', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().unique().references(() => students.id),
  status: varchar('status', { length: 50 }),
  exemptionExpiry: date('exemptionExpiry'),
  sakhaStatus: varchar('sakhaStatus', { length: 50 }),
  exemptionStartDate: date('exemptionStartDate'),
  sakhaTrackingCode: varchar('sakhaTrackingCode', { length: 50 }),
  pendingExtraSemesters: integer('pendingExtraSemesters'),
  lastSyncAt: timestamp('lastSyncAt')
});

export const document_categories = pgTable('document_categories', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 100 }).notNull(),
  scope: varchar('scope', { length: 20 }).default('STUDENT'),
  accessRoles: text('accessRoles')
});

export const document_types = pgTable('document_types', {
  id: serial('id').primaryKey(),
  categoryId: integer('categoryId').notNull().references(() => document_categories.id),
  code: varchar('code', { length: 40 }).notNull().unique(),
  title: varchar('title', { length: 100 }).notNull(),
  targetAudience: varchar('targetAudience', { length: 10 }).default('BOTH'),
  isRequired: integer('isRequired').default(1),
  needsVerification: integer('needsVerification').default(1)
});

export const student_documents = pgTable('student_documents', {
  id: serial('id').primaryKey(),
  personUserId: integer('personUserId').notNull().references(() => users.id),
  categoryId: integer('categoryId').notNull().references(() => document_categories.id),
  typeId: integer('typeId').references(() => document_types.id),
  fileName: varchar('fileName', { length: 255 }).notNull(),
  fileUrl: varchar('fileUrl', { length: 500 }).notNull(),
  mimeType: varchar('mimeType', { length: 100 }),
  contentHash: varchar('contentHash', { length: 64 }),   // SHA-256 محتوای سند — مبنای استعلام اصالت فرم‌های ممهور
  verificationStatus: varchar('verificationStatus', { length: 20 }).default('PENDING'),
  verifiedBy: integer('verifiedBy'),
  rejectionReason: text('rejectionReason'),
  uploadedAt: timestamp('uploadedAt').defaultNow()
});

export const kyc_verifications = pgTable('kyc_verifications', {
  id: serial('id').primaryKey(),
  userId: integer('userId').notNull().references(() => users.id),
  civilRegistryStatus: varchar('civilRegistryStatus', { length: 30 }).default('PENDING'),
  shahkarStatus: varchar('shahkarStatus', { length: 30 }).default('PENDING'),
  fetchedCivilData: text('fetchedCivilData'),
  livenessVideoUrl: varchar('livenessVideoUrl', { length: 500 }),
  livenessChallenge: varchar('livenessChallenge', { length: 150 }),
  faceMatchScore: numeric('faceMatchScore', { precision: 5, scale: 2 }),
  aiVerificationStatus: varchar('aiVerificationStatus', { length: 30 }).default('PENDING'),
  expertDecision: varchar('expertDecision', { length: 20 }),
  reviewedBy: integer('reviewedBy'),
  ipAddress: varchar('ipAddress', { length: 50 }),
  deviceInfo: text('deviceInfo'),
  completedAt: timestamp('completedAt'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const notification_templates = pgTable('notification_templates', {
  id: serial('id').primaryKey(),
  eventCode: varchar('eventCode', { length: 50 }).notNull().unique(),
  channel: varchar('channel', { length: 20 }),
  templateText: text('templateText').notNull(),
  isActive: integer('isActive').default(1)
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('userId').notNull().references(() => users.id),
  eventCode: varchar('eventCode', { length: 50 }),
  payload: text('payload'),
  isRead: integer('isRead').default(0),
  createdAt: timestamp('createdAt').defaultNow()
});

export const audit_logs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUserId: integer('actorUserId'),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entityType', { length: 50 }),
  entityId: integer('entityId'),
  details: text('details'),
  prevHash: varchar('prevHash', { length: 64 }),
  hash: varchar('hash', { length: 64 }).notNull(),
  ipAddress: varchar('ipAddress', { length: 50 }),
  createdAt: timestamp('createdAt').defaultNow()
});

export const system_settings = pgTable('system_settings', {
  key: varchar('key', { length: 60 }).primaryKey(),
  value: text('value').notNull()
});

export const document_templates = pgTable('document_templates', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 150 }).notNull(),
  templateText: text('templateText').notNull()
});

export const doc_sign_otps = pgTable('doc_sign_otps', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  documentId: integer('documentId').notNull().references(() => electronic_documents.id),
  otpHash: text('otpHash').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  isUsed: integer('isUsed').default(0),
  attempts: integer('attempts').default(0),
  lockedAt: timestamp('lockedAt'),
  createdAt: timestamp('createdAt').defaultNow()
});

// ============================================================================
// ماژول آموزش‌های آزاد، بوت‌کمپ‌ها و دوره‌های کوتاه‌مدت (Continuing Education)
// ============================================================================

export const short_term_courses = pgTable('short_term_courses', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  titleEn: varchar('titleEn', { length: 255 }),
  category: varchar('category', { length: 100 }).notNull().default('مهندسی و فناوری'),
  description: text('description'),
  hours: integer('hours').notNull().default(40),
  tuitionPrice: integer('tuitionPrice').notNull().default(0), // مبلغ شهریه به تومان
  capacity: integer('capacity').notNull().default(30),
  enrolledCount: integer('enrolledCount').notNull().default(0),
  instructorName: varchar('instructorName', { length: 150 }).notNull(),
  instructorBio: text('instructorBio'),
  syllabusJson: text('syllabusJson'), // سرفصل‌های دوره به‌صورت آرایه JSON
  startDate: varchar('startDate', { length: 20 }),
  endDate: varchar('endDate', { length: 20 }),
  scheduleText: varchar('scheduleText', { length: 200 }),
  passingGrade: numeric('passingGrade', { precision: 4, scale: 2 }).default('12.00'),
  maxAbsences: integer('maxAbsences').default(3),
  status: varchar('status', { length: 20 }).default('OPEN'), // OPEN, IN_PROGRESS, COMPLETED, ARCHIVED
  createdAt: timestamp('createdAt').defaultNow()
});

export const short_term_learners = pgTable('short_term_learners', {
  id: serial('id').primaryKey(),
  mobile: varchar('mobile', { length: 20 }).notNull().unique(),
  nationalId: varchar('nationalId', { length: 10 }),
  fullName: varchar('fullName', { length: 150 }).notNull(),
  fullNameEn: varchar('fullNameEn', { length: 150 }),
  email: varchar('email', { length: 150 }),
  createdAt: timestamp('createdAt').defaultNow()
});

export const short_term_discounts = pgTable('short_term_discounts', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  courseId: integer('courseId').references(() => short_term_courses.id),
  discountPercent: integer('discountPercent').notNull().default(10),
  maxDiscountAmount: integer('maxDiscountAmount'),
  maxUsage: integer('maxUsage').default(100),
  usedCount: integer('usedCount').default(0),
  isActive: integer('isActive').default(1),
  createdAt: timestamp('createdAt').defaultNow()
});

export const short_term_registrations = pgTable('short_term_registrations', {
  id: serial('id').primaryKey(),
  learnerId: integer('learnerId').notNull().references(() => short_term_learners.id),
  courseId: integer('courseId').notNull().references(() => short_term_courses.id),
  trackingCode: varchar('trackingCode', { length: 50 }).notNull().unique(),
  amountPaid: integer('amountPaid').notNull().default(0),
  discountAmount: integer('discountAmount').default(0),
  discountCode: varchar('discountCode', { length: 50 }),
  paymentStatus: varchar('paymentStatus', { length: 20 }).notNull().default('PAID'), // PAID, PENDING, REFUNDED
  paymentRefId: varchar('paymentRefId', { length: 100 }),
  attendanceCount: integer('attendanceCount').default(0),
  totalSessions: integer('totalSessions').default(10),
  finalGrade: numeric('finalGrade', { precision: 4, scale: 2 }),
  isPassed: integer('isPassed').default(0),
  certificateIssued: integer('certificateIssued').default(0),
  certificateId: integer('certificateId'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const short_term_certificates = pgTable('short_term_certificates', {
  id: serial('id').primaryKey(),
  certificateNumber: varchar('certificateNumber', { length: 50 }).notNull().unique(),
  verificationHash: varchar('verificationHash', { length: 64 }).notNull(), // SHA-256
  learnerId: integer('learnerId').notNull().references(() => short_term_learners.id),
  courseId: integer('courseId').notNull().references(() => short_term_courses.id),
  registrationId: integer('registrationId').notNull().references(() => short_term_registrations.id),
  fullNameFa: varchar('fullNameFa', { length: 150 }).notNull(),
  fullNameEn: varchar('fullNameEn', { length: 150 }),
  courseTitleFa: varchar('courseTitleFa', { length: 255 }).notNull(),
  courseTitleEn: varchar('courseTitleEn', { length: 255 }),
  grade: numeric('grade', { precision: 4, scale: 2 }).notNull(),
  totalHours: integer('totalHours').notNull(),
  issueDate: varchar('issueDate', { length: 20 }).notNull(),
  isRevoked: integer('isRevoked').default(0),
  createdAt: timestamp('createdAt').defaultNow()
});

// ============================================================================
// کارت دانشجویی هوشمند و ره‌گیری فیزیکی (Student ID Cards)
// ============================================================================

export const student_cards = pgTable('student_cards', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  secureToken: varchar('secureToken', { length: 64 }).notNull().unique(),
  printStatus: varchar('printStatus', { length: 20 }).default('PENDING'), // PENDING, PRINTED, LOST, REVOKED
  rfidSerialNumber: varchar('rfidSerialNumber', { length: 100 }),
  issuedAt: timestamp('issuedAt'),
  expiresAt: timestamp('expiresAt'),
  createdAt: timestamp('createdAt').defaultNow()
});

// ============================================================================
// حضور و غیاب آزمون، مراقبین و بسته‌های تحویل مخزن (Invigilators & Chain of Custody)
// ============================================================================

export const exam_attendances = pgTable('exam_attendances', {
  id: serial('id').primaryKey(),
  examId: integer('examId').notNull().references(() => exam_sessions.id),
  studentId: integer('studentId').notNull().references(() => students.id),
  isPresent: integer('isPresent').default(0),
  checkInMethod: varchar('checkInMethod', { length: 30 }).default('QR_SCAN'), // QR_SCAN, MANUAL_BY_INVIGILATOR, SYSTEM_EXCUSE
  verifiedByStaffId: integer('verifiedByStaffId').references(() => staff.id),
  hasTemporaryPermit: integer('hasTemporaryPermit').default(0), // دارای مجوز موقت / تعهد کتبی
  checkInTime: timestamp('checkInTime'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const exam_invigilators = pgTable('exam_invigilators', {
  id: serial('id').primaryKey(),
  examId: integer('examId').notNull().references(() => exam_sessions.id),
  staffId: integer('staffId').notNull().references(() => staff.id),
  role: varchar('role', { length: 50 }).notNull().default('INVIGILATOR'), // HEAD_INVIGILATOR, INVIGILATOR, TECHNICAL_SUPPORT
  clockInTime: timestamp('clockInTime'),
  clockOutTime: timestamp('clockOutTime'),
  isBilledToPayroll: integer('isBilledToPayroll').default(0),
  createdAt: timestamp('createdAt').defaultNow()
});

export const exam_course_packets = pgTable('exam_course_packets', {
  id: serial('id').primaryKey(),
  examId: integer('examId').notNull().references(() => exam_sessions.id),
  courseId: integer('courseId').notNull().references(() => courses.id),
  invigilatorStaffId: integer('invigilatorStaffId').references(() => staff.id),
  expectedSheetCount: integer('expectedSheetCount').notNull().default(0),
  actualDeliveredCount: integer('actualDeliveredCount'),
  handoverStatus: varchar('handoverStatus', { length: 30 }).default('NOT_STARTED'), // NOT_STARTED, AWAITING_HANDOVER, DISCREPANCY, RECEIVED_BY_VAULT
  receivedByVaultManagerId: integer('receivedByVaultManagerId').references(() => staff.id),
  handoverCompletedAt: timestamp('handoverCompletedAt'),
  discrepancyNote: text('discrepancyNote'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const notification_logs = pgTable('notification_logs', {
  id: serial('id').primaryKey(),
  userId: integer('userId').notNull().references(() => users.id),
  channel: varchar('channel', { length: 20 }).notNull(), // SMS, EMAIL, PUSH
  eventType: varchar('eventType', { length: 50 }).notNull(),
  messageBody: text('messageBody').notNull(),
  deliveryStatus: varchar('deliveryStatus', { length: 20 }).default('PENDING'), // DELIVERED, FAILED, SEEN, PENDING
  providerResponse: text('providerResponse'),
  sentAt: timestamp('sentAt').defaultNow(),
  deliveredAt: timestamp('deliveredAt')
});

// ============================================================================
// تجمیع سالن‌های امتحان، تحویل اوراق به استاد و چرخه بایگانی (Exam Handover & Chain)
// ============================================================================

export const course_exam_sessions = pgTable('course_exam_sessions', {
  id: serial('id').primaryKey(),
  courseOfferingId: integer('courseOfferingId').notNull(),
  totalHallsCount: integer('totalHallsCount').notNull().default(1),
  receivedHallsCount: integer('receivedHallsCount').notNull().default(0),
  totalExpectedSheets: integer('totalExpectedSheets').notNull().default(0),
  totalDeliveredSheets: integer('totalDeliveredSheets').notNull().default(0),
  isFullyCollected: integer('isFullyCollected').default(0),
  notificationSentAt: timestamp('notificationSentAt'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const instructor_deliveries = pgTable('instructor_deliveries', {
  id: serial('id').primaryKey(),
  courseOfferingId: integer('courseOfferingId').notNull(),
  instructorId: integer('instructorId').notNull().references(() => staff.id),
  sheetCount: integer('sheetCount').notNull(),
  pickupToken: varchar('pickupToken', { length: 64 }).notNull().unique(),
  deliveredAt: timestamp('deliveredAt').defaultNow(),
  vaultManagerId: integer('vaultManagerId').references(() => staff.id),
  gradeDeadline: timestamp('gradeDeadline').notNull(),
  status: varchar('status', { length: 30 }).default('PENDING_GRADING'), // PENDING_GRADING, GRADES_SUBMITTED, ARCHIVED
  papersReturnedToArchive: integer('papersReturnedToArchive').default(0),
  archiveManagerId: integer('archiveManagerId').references(() => staff.id),
  returnedAt: timestamp('returnedAt')
});

// ============================================================================
// ماژول مساعده، مالیات و بیمه روزانه تامین اجتماعی اساتید (Advances & Social Security)
// ============================================================================

export const instructor_advances = pgTable('instructor_advances', {
  id: serial('id').primaryKey(),
  instructorId: integer('instructorId').notNull().references(() => staff.id),
  courseOfferingId: integer('courseOfferingId').notNull(),
  requestedAmount: integer('requestedAmount').notNull(),
  approvedAmount: integer('approvedAmount'),
  status: varchar('status', { length: 30 }).default('PENDING_APPROVAL'), // PENDING_APPROVAL, APPROVED, PAID, REJECTED
  approvedByFinanceId: integer('approvedByFinanceId').references(() => staff.id),
  paidAt: timestamp('paidAt'),
  isDeductedFromFinalPayroll: integer('isDeductedFromFinalPayroll').default(0),
  createdAt: timestamp('createdAt').defaultNow()
});

export const instructor_financial_profiles = pgTable('instructor_financial_profiles', {
  id: serial('id').primaryKey(),
  instructorId: integer('instructorId').notNull().references(() => staff.id).unique(),
  canRequestAdvance: integer('canRequestAdvance').default(0), // کلید کنترلی پنهان مساعده (پیش‌فرض ۰)
  isInsuranceEnabled: integer('isInsuranceEnabled').default(1), // بیمه روزانه تامین اجتماعی
  isTaxExempt: integer('isTaxExempt').default(0),
  taxRatePercent: integer('taxRatePercent').default(10), // ۱۰٪ مالیات تکلیفی
  insuranceType: varchar('insuranceType', { length: 50 }).default('TAMIN_DAILY'),
  taminBranchCode: varchar('taminBranchCode', { length: 50 }),
  updatedAt: timestamp('updatedAt').defaultNow()
});

export const instructor_attendance_days = pgTable('instructor_attendance_days', {
  id: serial('id').primaryKey(),
  instructorId: integer('instructorId').notNull().references(() => staff.id),
  attendanceDate: varchar('attendanceDate', { length: 20 }).notNull(), // تاریخ روز تدریس (مثال: ۱۴۰۵/۰۸/۱۲)
  sessionsHeldCount: integer('sessionsHeldCount').default(1),
  insuranceCalculated: integer('insuranceCalculated').default(1),
  syncedWithTamin: integer('syncedWithTamin').default(0),
  createdAt: timestamp('createdAt').defaultNow()
});

// ============================================================================
// مدیریت سطوح دسترسی پویا و مجوزهای ریزدانه (Dynamic RBAC Matrix)
// ============================================================================

export const staff_roles = pgTable('staff_roles', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  roleId: integer('roleId').notNull().references(() => roles.id)
});

// ============================================================================
// سامانه آموزش مجازی و اتصال به مودل و بیگ‌بلوباتن (Moodle & BigBlueButton)
// ============================================================================

export const virtual_classrooms = pgTable('virtual_classrooms', {
  id: serial('id').primaryKey(),
  courseOfferingId: integer('courseOfferingId').notNull(),
  bbbMeetingId: varchar('bbbMeetingId', { length: 100 }).notNull().unique(),
  meetingName: varchar('meetingName', { length: 255 }).notNull(),
  moderatorPw: varchar('moderatorPw', { length: 50 }).notNull(),
  attendeePw: varchar('attendeePw', { length: 50 }).notNull(),
  isRunning: integer('isRunning').default(0),
  currentAttendanceCount: integer('currentAttendanceCount').default(0),
  moodleCourseId: integer('moodleCourseId'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const virtual_class_recordings = pgTable('virtual_class_recordings', {
  id: serial('id').primaryKey(),
  classroomId: integer('classroomId').notNull().references(() => virtual_classrooms.id),
  sessionTitle: varchar('sessionTitle', { length: 255 }).notNull(),
  recordingUrl: varchar('recordingUrl', { length: 500 }).notNull(),
  durationMinutes: integer('durationMinutes').notNull().default(90),
  recordedAt: timestamp('recordedAt').defaultNow(),
  viewsCount: integer('viewsCount').default(0)
});

// ═══ سامانهٔ مهاجرت داده از سیستم قدیمی (ETL) ═══
export const migration_runs = pgTable('migration_runs', {
  id: serial('id').primaryKey(),
  entity: varchar('entity', { length: 30 }).notNull(),       // student/course/term/enrollment/ledger/clearance
  fileName: varchar('fileName', { length: 255 }),
  mode: varchar('mode', { length: 10 }).notNull(),           // DRY | COMMIT
  totalRows: integer('totalRows').default(0),
  inserted: integer('inserted').default(0),
  skippedExisting: integer('skippedExisting').default(0),
  invalid: integer('invalid').default(0),
  report: text('report'),                                    // JSON کامل گزارش
  status: varchar('status', { length: 20 }).notNull(),       // OK | FAILED
  triggeredByUserId: integer('triggeredByUserId'),
  createdAt: timestamp('createdAt').defaultNow()
});

// ══════════════════════════════════════════════════════════════════════
//  مهاجرت از سرورهای قدیمی — میز کار تطبیق کد، شهریه و نمرات
//  (سند «انتقال داده‌های قدیمی»: staging جدا از دادهٔ عملیاتی تا مقایسه و
//   بازبینی ممکن باشد و هیچ‌چیز کورکورانه روی سامانهٔ جدید نوشته نشود)
// ══════════════════════════════════════════════════════════════════════

/** سرور/سامانهٔ مبدأ (گلستان، سما، اکسل واحد مالی و…) */
export const legacy_sources = pgTable('legacy_sources', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),   // LEGACY, GOLESTAN, SAMA…
  title: varchar('title', { length: 150 }).notNull(),
  kind: varchar('kind', { length: 30 }).default('OTHER'),     // GOLESTAN | SAMA | EXCEL | OTHER
  note: text('note'),
  isActive: integer('isActive').notNull().default(1),
  createdAt: timestamp('createdAt').defaultNow()
});

/** جدول تطبیق کدها: کد سیستم قدیمی → موجودیت سامانهٔ جدید */
export const legacy_code_maps = pgTable('legacy_code_maps', {
  id: serial('id').primaryKey(),
  sourceCode: varchar('sourceCode', { length: 50 }).notNull().default('LEGACY'),
  domain: varchar('domain', { length: 30 }).notNull(),        // MAJOR|DEGREE|TERM|COURSE|DEPARTMENT|STUDENT_STATUS|GRADE_STATUS|TX_TYPE|FEE_ITEM|COURSE_TYPE|QUOTA
  legacyCode: varchar('legacyCode', { length: 100 }).notNull(),
  legacyTitle: varchar('legacyTitle', { length: 250 }),
  targetId: integer('targetId'),                              // شناسهٔ رکورد متناظر در سامانهٔ جدید
  targetCode: varchar('targetCode', { length: 100 }),         // کد/مقدار متناظر (برای فهرست‌های ثابت)
  targetTitle: varchar('targetTitle', { length: 250 }),
  confidence: numeric('confidence', { precision: 5, scale: 2 }).default('0'),
  status: varchar('status', { length: 20 }).notNull().default('UNMAPPED'), // UNMAPPED|SUGGESTED|CONFIRMED|IGNORED
  note: text('note'),
  updatedByUserId: integer('updatedByUserId'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow()
}, (t) => ({ uq: unique('uq_legacy_code_maps').on(t.sourceCode, t.domain, t.legacyCode) }));

/** فرمول شهریهٔ سیستم قدیمی (قابل ارزیابی و مقایسه با دادهٔ مالی قدیمی) */
export const legacy_tuition_formulas = pgTable('legacy_tuition_formulas', {
  id: serial('id').primaryKey(),
  sourceCode: varchar('sourceCode', { length: 50 }).notNull().default('LEGACY'),
  formulaCode: varchar('formulaCode', { length: 60 }).notNull(),
  title: varchar('title', { length: 200 }),
  termCode: varchar('termCode', { length: 10 }),              // خام از سیستم قدیمی (خالی = همهٔ ترم‌ها)
  degreeCode: varchar('degreeCode', { length: 60 }),          // کد مقطع قدیمی
  majorCode: varchar('majorCode', { length: 60 }),            // کد رشتهٔ قدیمی
  entryYearFrom: integer('entryYearFrom'),
  entryYearTo: integer('entryYearTo'),
  fixedAmount: numeric('fixedAmount', { precision: 14, scale: 0 }).notNull().default('0'),
  perUnitTheory: numeric('perUnitTheory', { precision: 14, scale: 0 }).notNull().default('0'),
  perUnitPractical: numeric('perUnitPractical', { precision: 14, scale: 0 }).notNull().default('0'),
  perUnitGeneral: numeric('perUnitGeneral', { precision: 14, scale: 0 }).notNull().default('0'),
  expression: text('expression'),                             // فرمول متنی اختیاری (اولویت با آن)
  variables: text('variables'),                               // JSON متغیرهای کمکی {"ضریب":1.2}
  isActive: integer('isActive').notNull().default(1),
  note: text('note'),
  createdByUserId: integer('createdByUserId'),
  createdAt: timestamp('createdAt').defaultNow()
}, (t) => ({ uq: unique('uq_legacy_tuition_formulas').on(t.sourceCode, t.formulaCode, t.termCode) }));

/** صورت‌حساب/شهریهٔ واقعیِ ثبت‌شده در سیستم قدیمی — مبنای مقایسه */
export const legacy_financial_records = pgTable('legacy_financial_records', {
  id: serial('id').primaryKey(),
  sourceCode: varchar('sourceCode', { length: 50 }).notNull().default('LEGACY'),
  studentCode: varchar('studentCode', { length: 20 }).notNull(),
  studentName: varchar('studentName', { length: 150 }),
  termCode: varchar('termCode', { length: 10 }).notNull(),
  formulaCode: varchar('formulaCode', { length: 60 }),
  degreeCode: varchar('degreeCode', { length: 60 }),
  majorCode: varchar('majorCode', { length: 60 }),
  entryYear: integer('entryYear'),
  totalUnits: numeric('totalUnits', { precision: 6, scale: 2 }).default('0'),
  theoryUnits: numeric('theoryUnits', { precision: 6, scale: 2 }).default('0'),
  practicalUnits: numeric('practicalUnits', { precision: 6, scale: 2 }).default('0'),
  generalUnits: numeric('generalUnits', { precision: 6, scale: 2 }).default('0'),
  legacyTuition: numeric('legacyTuition', { precision: 14, scale: 0 }).notNull().default('0'),
  legacyDiscount: numeric('legacyDiscount', { precision: 14, scale: 0 }).notNull().default('0'),
  legacyPaid: numeric('legacyPaid', { precision: 14, scale: 0 }).notNull().default('0'),
  batchId: integer('batchId'),                                 // دستهٔ واردسازی (برای واگرد)
  raw: text('raw'),                                            // JSON ردیف خام برای رهگیری
  importedAt: timestamp('importedAt').defaultNow()
}, (t) => ({ uq: unique('uq_legacy_financial_records').on(t.sourceCode, t.studentCode, t.termCode) }));

/** اجرای مقایسهٔ شهریه: فرمول‌های منتقل‌شده در برابر دادهٔ مالی قدیمی */
export const tuition_compare_runs = pgTable('tuition_compare_runs', {
  id: serial('id').primaryKey(),
  sourceCode: varchar('sourceCode', { length: 50 }).notNull().default('LEGACY'),
  termCode: varchar('termCode', { length: 10 }),
  tolerance: numeric('tolerance', { precision: 14, scale: 0 }).notNull().default('0'),
  totalRows: integer('totalRows').default(0),
  matched: integer('matched').default(0),
  mismatched: integer('mismatched').default(0),
  unresolved: integer('unresolved').default(0),
  sumLegacy: numeric('sumLegacy', { precision: 16, scale: 0 }).default('0'),
  sumComputed: numeric('sumComputed', { precision: 16, scale: 0 }).default('0'),
  sumDiff: numeric('sumDiff', { precision: 16, scale: 0 }).default('0'),
  createdByUserId: integer('createdByUserId'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const tuition_compare_items = pgTable('tuition_compare_items', {
  id: serial('id').primaryKey(),
  runId: integer('runId').notNull().references(() => tuition_compare_runs.id),
  studentCode: varchar('studentCode', { length: 20 }).notNull(),
  studentName: varchar('studentName', { length: 150 }),
  termCode: varchar('termCode', { length: 10 }),
  formulaCode: varchar('formulaCode', { length: 60 }),
  totalUnits: numeric('totalUnits', { precision: 6, scale: 2 }).default('0'),
  legacyAmount: numeric('legacyAmount', { precision: 14, scale: 0 }).default('0'),
  computedAmount: numeric('computedAmount', { precision: 14, scale: 0 }).default('0'),
  diff: numeric('diff', { precision: 14, scale: 0 }).default('0'),
  status: varchar('status', { length: 20 }).notNull(),        // MATCH | DIFF | NO_FORMULA | ERROR
  resolutionStatus: varchar('resolutionStatus', { length: 20 }).notNull().default('UNRESOLVED'), // UNRESOLVED|MATCHED|DISCREPANCY|FORCED_LEGACY
  resolvedAt: timestamp('resolvedAt'),
  detail: text('detail')
});

/** نمرات سیستم قدیمی (staging) — قبل از اعمال، با سامانهٔ جدید مقایسه می‌شود */
export const legacy_grades = pgTable('legacy_grades', {
  id: serial('id').primaryKey(),
  sourceCode: varchar('sourceCode', { length: 50 }).notNull().default('LEGACY'),
  studentCode: varchar('studentCode', { length: 20 }).notNull(),
  studentName: varchar('studentName', { length: 150 }),
  termCode: varchar('termCode', { length: 10 }).notNull(),
  courseCode: varchar('courseCode', { length: 40 }).notNull(),
  courseTitle: varchar('courseTitle', { length: 200 }),
  units: numeric('units', { precision: 5, scale: 2 }),
  gradeRaw: varchar('gradeRaw', { length: 40 }),              // مقدار خام («۱۷.۵»، «قبول»، «الف»)
  gradeValue: numeric('gradeValue', { precision: 5, scale: 2 }),
  gradeStatus: varchar('gradeStatus', { length: 20 }).notNull().default('FINALIZED'),
  professorName: varchar('professorName', { length: 150 }),
  batchId: integer('batchId'),                                 // دستهٔ واردسازی (برای واگرد)
  compareStatus: varchar('compareStatus', { length: 20 }).default('PENDING'), // PENDING|SAME|DIFF|MISSING_IN_NEW|NO_STUDENT|NO_TERM
  compareNote: text('compareNote'),
  appliedAt: timestamp('appliedAt'),
  raw: text('raw'),
  importedAt: timestamp('importedAt').defaultNow()
}, (t) => ({ uq: unique('uq_legacy_grades').on(t.sourceCode, t.studentCode, t.termCode, t.courseCode) }));

// ── دسته‌های واردسازی: هر فایل اکسل = یک batch با سطرهای خام JSON ──
// چرا خام نگه می‌داریم: اگر بعداً نگاشت کدی اصلاح شد، بدون آپلود دوبارهٔ فایل
// می‌توان فقط ردیف‌های خطادار را دوباره پردازش کرد؛ و برای «واگرد» سند داریم.
export const legacy_import_batches = pgTable('legacy_import_batches', {
  id: serial('id').primaryKey(),
  sourceCode: varchar('sourceCode', { length: 50 }).notNull().default('LEGACY'),
  importType: varchar('importType', { length: 40 }).notNull(),
  fileName: varchar('fileName', { length: 255 }),
  sheetName: varchar('sheetName', { length: 120 }),
  headers: text('headers'),                                   // JSON: سرستون‌های فایل
  columnMap: text('columnMap'),                               // JSON: نگاشت دستی ستون‌ها {فیلد: شمارهٔ ستون}
  totalRows: integer('totalRows').notNull().default(0),
  okRows: integer('okRows').notNull().default(0),
  errorRows: integer('errorRows').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('PARSED'), // PARSED|PROCESSED|PARTIAL|ROLLED_BACK
  note: text('note'),
  createdByUserId: integer('createdByUserId'),
  createdAt: timestamp('createdAt').defaultNow(),
  processedAt: timestamp('processedAt'),
  rolledBackAt: timestamp('rolledBackAt')
});

export const legacy_import_rows = pgTable('legacy_import_rows', {
  id: serial('id').primaryKey(),
  batchId: integer('batchId').notNull().references(() => legacy_import_batches.id, { onDelete: 'cascade' }),
  rowNumber: integer('rowNumber').notNull(),                  // شمارهٔ خط در فایل (۱ = سرستون)
  rawData: jsonb('rawData').notNull(),                        // کل سطر اکسل، خام
  validationStatus: varchar('validationStatus', { length: 20 }).notNull().default('PENDING'), // PENDING|IMPORTED|ERROR|SKIPPED
  errorMessage: text('errorMessage'),
  processedAt: timestamp('processedAt')
});

// ── دفتر واگرد: هر نوشتن روی جدول‌های عملیاتی اینجا سند می‌خورد ──
export const migration_audit_entries = pgTable('migration_audit_entries', {
  id: serial('id').primaryKey(),
  batchId: integer('batchId'),                                // ممکن است عملیات بدون فایل باشد (اعمال نمره/تراز)
  opGroup: varchar('opGroup', { length: 40 }).notNull(),      // apply-grades | apply-formulas | opening-balance | commit-student…
  sourceCode: varchar('sourceCode', { length: 50 }).notNull().default('LEGACY'),
  tableName: varchar('tableName', { length: 60 }).notNull(),
  rowId: integer('rowId').notNull(),
  op: varchar('op', { length: 10 }).notNull(),                // INSERT | UPDATE
  beforeData: jsonb('beforeData'),                            // مقدار پیشین برای UPDATE
  afterData: jsonb('afterData'),                              // مقداری که مهاجرت نوشت (برای تشخیص تغییرِ بعدی)
  revertedAt: timestamp('revertedAt'),
  revertNote: text('revertNote'),
  createdByUserId: integer('createdByUserId'),
  createdAt: timestamp('createdAt').defaultNow()
});

// ═══════════════════════════════════════════════════════════════════
//  ماژول ۱۲: فارغ‌التحصیلی، صدور مدارک و پورتال دانش‌آموختگان
//  الگو: «رویدادمحور» — دانشجو هیچ درخواستی باز نمی‌کند؛ با قطعی‌شدن
//  آخرین نمره، سیستم خودش پرونده را باز و مراحل را جلو می‌برد.
// ═══════════════════════════════════════════════════════════════════

/** دپارتمان‌های تسویه‌حساب — قابل تعریف از پنل مدیر (هیچ فهرست ثابتی در کد نیست) */
export const clearance_departments = pgTable('clearance_departments', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),   // LIBRARY / FINANCE / DORMITORY / …
  title: varchar('title', { length: 120 }).notNull(),
  /** منبع بررسی خودکار: NONE (کارشناس) | FINANCE_LEDGER (دفتر مالی) | HTTP_API (سرویس بیرونی) */
  autoCheck: varchar('autoCheck', { length: 30 }).notNull().default('NONE'),
  apiUrl: varchar('apiUrl', { length: 500 }),                 // برای HTTP_API
  responsibleRoleCode: varchar('responsibleRoleCode', { length: 40 }),
  sortOrder: integer('sortOrder').notNull().default(100),
  isActive: integer('isActive').notNull().default(1),
  hint: text('hint')
});

/** پروندهٔ فارغ‌التحصیلی هر دانشجو (یک ردیف به‌ازای هر دانشجو) */
export const graduation_audits = pgTable('graduation_audits', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  // CATALOG_REVIEW → HEAD_APPROVAL → IRANDOC_VERIFICATION → CLEARANCE → FINAL_DOCS → READY_TO_ISSUE → ISSUED
  workflowStatus: varchar('workflowStatus', { length: 40 }).notNull().default('CATALOG_REVIEW'),
  // ── نتیجهٔ تطبیق خودکار با سرفصل ──
  requiredUnits: numeric('requiredUnits', { precision: 6, scale: 2 }).default('0'),
  passedUnits: numeric('passedUnits', { precision: 6, scale: 2 }).default('0'),
  gpa: numeric('gpa', { precision: 4, scale: 2 }),
  missingCourses: jsonb('missingCourses'),                    // [{code,title,units}]
  catalogOk: integer('catalogOk').notNull().default(0),
  // ── تأیید مدیر گروه ──
  headApprovalStatus: integer('headApprovalStatus').notNull().default(0),
  headApprovedBy: integer('headApprovedBy'),
  headApprovedAt: timestamp('headApprovedAt'),
  headNote: text('headNote'),
  // ── ایرانداک (ارشد/دکتری) ──
  thesisRequired: integer('thesisRequired').notNull().default(0),
  thesisTitle: varchar('thesisTitle', { length: 300 }),
  irandocTrackingCode: varchar('irandocTrackingCode', { length: 60 }),
  irandocSimilarityScore: numeric('irandocSimilarityScore', { precision: 5, scale: 2 }),
  irandocStatus: varchar('irandocStatus', { length: 30 }).default('PENDING'), // PENDING|PASSED|REJECTED|SKIPPED
  irandocCheckedAt: timestamp('irandocCheckedAt'),
  // ── درخواست کد صحت در سامانهٔ سجاد (اقدام خودِ دانشجو، پیش از کارشناس صدور) ──
  sajjadStatus: varchar('sajjadStatus', { length: 30 }).default('PENDING'),   // PENDING|SUBMITTED|CONFIRMED|SKIPPED
  sajjadRequestCode: varchar('sajjadRequestCode', { length: 60 }),            // کد رهگیری درخواست دانشجو در سجاد
  sajjadRequestedAt: timestamp('sajjadRequestedAt'),
  sajjadConfirmedAt: timestamp('sajjadConfirmedAt'),
  // ── مدارک پایانی که فقط اینجا از دانشجو خواسته می‌شود ──
  photoDocumentId: integer('photoDocumentId'),
  stampFeePaid: integer('stampFeePaid').notNull().default(0),
  stampFeeAmount: numeric('stampFeeAmount', { precision: 12, scale: 0 }).default('0'),
  finalDocsAt: timestamp('finalDocsAt'),
  // ── عمومی ──
  graduationTermId: integer('graduationTermId').references(() => academic_terms.id),
  note: text('note'),
  startedAt: timestamp('startedAt').defaultNow(),
  lastEventAt: timestamp('lastEventAt').defaultNow(),
  completedAt: timestamp('completedAt')
}, (t) => ({ uq: unique('uq_graduation_audits_student').on(t.studentId) }));

/** چک‌لیست تسویه‌حساب موازی (یک ردیف به‌ازای هر دپارتمان برای هر دانشجو) */
export const clearance_checklist = pgTable('clearance_checklist', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  auditId: integer('auditId').references(() => graduation_audits.id),
  department: varchar('department', { length: 40 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING|CLEARED|HAS_DEBT|WAIVED
  amountDue: numeric('amountDue', { precision: 14, scale: 0 }).default('0'),
  detail: text('detail'),
  autoChecked: integer('autoChecked').notNull().default(0),
  resolvedBy: integer('resolvedBy'),
  resolvedAt: timestamp('resolvedAt'),
  notifiedAt: timestamp('notifiedAt'),
  createdAt: timestamp('createdAt').defaultNow()
}, (t) => ({ uq: unique('uq_clearance_checklist').on(t.studentId, t.department) }));

/** مدارک صادرشده: گواهینامهٔ موقت، دانشنامه، ریزنمرات رسمی */
export const issued_degrees = pgTable('issued_degrees', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  degreeType: varchar('degreeType', { length: 30 }).notNull(), // TEMPORARY|PERMANENT|TRANSCRIPT
  serialNo: varchar('serialNo', { length: 60 }).notNull().unique(),
  verifyCode: varchar('verifyCode', { length: 40 }).notNull().unique(), // مبنای QR استعلام عمومی
  ministryVerificationCode: varchar('ministryVerificationCode', { length: 60 }), // کد صحت وزارت علوم
  documentHash: varchar('documentHash', { length: 255 }).notNull(),
  snapshot: jsonb('snapshot'),                                 // نام، رشته، معدل، تاریخ — لحظهٔ صدور
  issuedByUserId: integer('issuedByUserId'),
  issuedAt: timestamp('issuedAt').defaultNow().notNull(),
  isDelivered: integer('isDelivered').notNull().default(0),
  deliveredAt: timestamp('deliveredAt'),
  deliveredTo: varchar('deliveredTo', { length: 150 }),
  revokedAt: timestamp('revokedAt'),
  revokeReason: text('revokeReason')
});

/** پروفایل دانش‌آموخته (پورتال آلومنای) */
export const alumni_profiles = pgTable('alumni_profiles', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  employmentStatus: varchar('employmentStatus', { length: 40 }), // EMPLOYED|SEEKING|STUDYING|SELF_EMPLOYED
  organization: varchar('organization', { length: 150 }),
  jobTitle: varchar('jobTitle', { length: 150 }),
  contactEmail: varchar('contactEmail', { length: 150 }),
  contactMobile: varchar('contactMobile', { length: 11 }),
  linkedinUrl: varchar('linkedinUrl', { length: 300 }),
  allowContact: integer('allowContact').notNull().default(1),
  updatedAt: timestamp('updatedAt').defaultNow()
}, (t) => ({ uq: unique('uq_alumni_profiles_student').on(t.studentId) }));

/** درخواست‌های خدمات دانش‌آموختگان (ریزنمرات رسمی، آزادسازی مدرک، تأییدیه ترجمه) */
export const alumni_requests = pgTable('alumni_requests', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  requestType: varchar('requestType', { length: 40 }).notNull(), // OFFICIAL_TRANSCRIPT|DEGREE_RELEASE|TRANSLATION_CONFIRM|DUPLICATE_DEGREE
  trackingCode: varchar('trackingCode', { length: 30 }).notNull().unique(),
  status: varchar('status', { length: 30 }).notNull().default('AWAITING_PAYMENT'), // AWAITING_PAYMENT|PAID|IN_REVIEW|DONE|REJECTED
  fee: numeric('fee', { precision: 12, scale: 0 }).default('0'),
  paidAt: timestamp('paidAt'),
  ledgerId: integer('ledgerId'),
  destination: varchar('destination', { length: 200 }),        // دارالترجمه / سازمان مقصد
  description: text('description'),
  resultFileUrl: varchar('resultFileUrl', { length: 500 }),
  handledBy: integer('handledBy'),
  adminNote: text('adminNote'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow()
});

// ═══ کانال‌های اعلان بیرونی (پیامک و پیام‌رسان‌ها) ═══

/** نشانی هر کاربر در هر پیام‌رسان (شناسهٔ چت ربات) — کاربر خودش ثبت می‌کند */
export const notification_channels = pgTable('notification_channels', {
  id: serial('id').primaryKey(),
  userId: integer('userId').notNull().references(() => users.id),
  channel: varchar('channel', { length: 20 }).notNull(),      // SMS|TELEGRAM|BALE|EITAA
  address: varchar('address', { length: 120 }).notNull(),     // شمارهٔ موبایل یا chat id
  isActive: integer('isActive').notNull().default(1),
  verifiedAt: timestamp('verifiedAt'),
  createdAt: timestamp('createdAt').defaultNow()
}, (t) => ({ uq: unique('uq_notification_channels').on(t.userId, t.channel) }));

// ═══ رویدادهای موتور گردش کار (Workflow Event Bus) ═══
// موتور BPM فقط وضعیت‌ها را جابه‌جا می‌کند؛ اثر تجاری هر فرایند (مثلاً ثبت درس
// تطبیق‌داده‌شده در کارنامه) در «هندلر» همان ماژول اجرا می‌شود. رویداد پیش از
// commitِ تراکنشِ گردش کار به‌صورت PENDING ثبت می‌شود تا اگر سرویس وسط کار
// خاموش شد، رد آن در دیتابیس باشد و بتوان دوباره اجرا/واگرد کرد.

/** رویدادهای شلیک‌شده توسط موتور گردش کار و نتیجهٔ پردازش هر هندلر */
export const workflow_events = pgTable('workflow_events', {
  id: serial('id').primaryKey(),
  requestId: integer('requestId').notNull().references(() => student_requests.id),
  processCode: varchar('processCode', { length: 50 }).notNull(),
  eventCode: varchar('eventCode', { length: 60 }).notNull(),   // WORKFLOW_FINAL_APPROVED | WORKFLOW_REJECTED | ...
  payload: text('payload'),                                   // JSON — دادهٔ مورد نیاز هندلرها
  handler: varchar('handler', { length: 60 }).notNull(),      // نام هندلر (مثلاً COURSE_TRANSFER)
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING|PROCESSED|FAILED|SKIPPED
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  firedAt: timestamp('firedAt').defaultNow(),
  processedAt: timestamp('processedAt')
});

// ═══ گزارش تحویل پیام‌های بیرونی ═══

/** گزارش تحویل هر پیام بیرونی — برای پیگیری و ممیزی */
export const notification_deliveries = pgTable('notification_deliveries', {
  id: serial('id').primaryKey(),
  userId: integer('userId').notNull().references(() => users.id),
  notificationId: integer('notificationId'),
  eventCode: varchar('eventCode', { length: 60 }),
  channel: varchar('channel', { length: 20 }).notNull(),
  target: varchar('target', { length: 120 }),
  status: varchar('status', { length: 20 }).notNull(),        // SENT|FAILED|SKIPPED
  providerRef: varchar('providerRef', { length: 120 }),
  error: text('error'),
  body: text('body'),
  durationMs: integer('durationMs'),
  createdAt: timestamp('createdAt').defaultNow()
});

// ═══ حافظهٔ گزارش‌های تحلیلی (BI Snapshot Cache) ═══
// گزارش‌های هوش تجاری (داشبورد مدیریتی، تحلیل امکانات، ابر کلمات) روی کل
// پاسخ‌های ارزشیابی محاسبه می‌شوند. در پایان ترم این حجم زیاد است، پس نتیجه
// اینجا کش می‌شود: خواندن داشبورد = یک SELECT، و محاسبهٔ سنگین فقط توسط
// job زمان‌بندی‌شده (/api/cron/bi-refresh) یا اولین درخواستِ منقضی‌شده انجام
// می‌شود. هرگز در حلقهٔ رویداد سرور وب پردازش متن اجرا نمی‌شود.

/** نتیجهٔ کش‌شدهٔ یک گزارش تحلیلی */
export const analytics_snapshots = pgTable('analytics_snapshots', {
  id: serial('id').primaryKey(),
  cacheKey: varchar('cacheKey', { length: 160 }).notNull().unique(),
  reportType: varchar('reportType', { length: 60 }).notNull(),   // MANAGEMENT_OVERVIEW | FACILITIES | WORDCLOUD | ...
  payload: text('payload').notNull(),                            // JSON نتیجه
  rowCount: integer('rowCount'),                                 // برای پایش حجم گزارش
  durationMs: integer('durationMs'),                             // هزینهٔ محاسبهٔ آخرین بار
  computedAt: timestamp('computedAt').notNull().defaultNow(),
  expiresAt: timestamp('expiresAt')
});

// ══════════════════════════════════════════════════════════════════════
//  موتور مالی دانشجویان — تخفیف، حامی (بنیاد)، چک، وام و فرمول تخصیص
//
//  هیچ عنوان، درصد یا مبلغی در کد سخت‌کد نیست: انواع تخفیف، بنیادها و
//  فرمول‌ها همه ردیف دیتابیسی‌اند و از پنل کارشناس مالی مدیریت می‌شوند.
// ══════════════════════════════════════════════════════════════════════

/**
 * انواع تخفیف شهریه — فهرست قابل تنظیم توسط کارشناس مالی.
 * نمونه: رتبهٔ برتر، قهرمان ورزشی، فعال فرهنگی، خانوادهٔ چنددانشجویی.
 */
export const tuition_discount_types = pgTable('tuition_discount_types', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  title: varchar('title', { length: 150 }).notNull(),
  /** PERCENT = درصدی از شهریه | FIXED = مبلغ ثابت ریالی */
  kind: varchar('kind', { length: 20 }).notNull().default('PERCENT'),
  defaultPercent: numeric('defaultPercent', { precision: 5, scale: 2 }).notNull().default('0'),
  defaultAmount: numeric('defaultAmount', { precision: 12, scale: 0 }).notNull().default('0'),
  /** سقف درصد مجاز؛ NULL = بدون سقف */
  maxPercent: numeric('maxPercent', { precision: 5, scale: 2 }),
  requiresApproval: integer('requiresApproval').notNull().default(1),
  requiresDocument: integer('requiresDocument').notNull().default(0),
  isActive: integer('isActive').notNull().default(1),
  note: text('note'),
  createdAt: timestamp('createdAt').defaultNow()
});

/** تخفیف تخصیص‌یافته به یک دانشجو (برای یک ترم، یا NULL = همهٔ ترم‌ها) */
export const student_discounts = pgTable('student_discounts', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  termId: integer('termId').references(() => academic_terms.id),
  discountTypeId: integer('discountTypeId').notNull().references(() => tuition_discount_types.id),
  kind: varchar('kind', { length: 20 }).notNull().default('PERCENT'),
  percent: numeric('percent', { precision: 5, scale: 2 }).notNull().default('0'),
  amount: numeric('amount', { precision: 12, scale: 0 }).notNull().default('0'),
  /** روی کدام بخش شهریه اثر بگذارد: FIXED | VARIABLE | BOTH */
  appliesTo: varchar('appliesTo', { length: 20 }).notNull().default('BOTH'),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING | APPROVED | REJECTED
  reason: text('reason'),
  documentUrl: text('documentUrl'),
  approvedBy: integer('approvedBy').references(() => users.id),
  approvedAt: timestamp('approvedAt'),
  createdAt: timestamp('createdAt').defaultNow()
});

/** بنیادها و نهادهای حامی — کمیتهٔ امداد، بنیاد شهید، خیرین و … */
export const tuition_sponsors = pgTable('tuition_sponsors', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  title: varchar('title', { length: 150 }).notNull(),
  contactInfo: text('contactInfo'),
  /** DIRECT = پرداخت مستقیم به دانشگاه | REIMBURSE = دانشجو پرداخت و بنیاد بازپرداخت می‌کند */
  settlementMethod: varchar('settlementMethod', { length: 30 }).notNull().default('DIRECT'),
  isActive: integer('isActive').notNull().default(1),
  note: text('note'),
  createdAt: timestamp('createdAt').defaultNow()
});

/** تعهد پرداخت یک بنیاد بابت شهریهٔ یک دانشجو */
export const student_sponsorships = pgTable('student_sponsorships', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  termId: integer('termId').references(() => academic_terms.id),
  sponsorId: integer('sponsorId').notNull().references(() => tuition_sponsors.id),
  coverageKind: varchar('coverageKind', { length: 20 }).notNull().default('PERCENT'),
  percent: numeric('percent', { precision: 5, scale: 2 }).notNull().default('0'),
  amount: numeric('amount', { precision: 12, scale: 0 }).notNull().default('0'),
  appliesTo: varchar('appliesTo', { length: 20 }).notNull().default('BOTH'),
  referenceNo: varchar('referenceNo', { length: 80 }),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING | CONFIRMED | REJECTED | PAID
  note: text('note'),
  createdAt: timestamp('createdAt').defaultNow()
});

/** چک‌های دریافتی از دانشجو — مبنای یادآوری پیش از سررسید */
export const payment_cheques = pgTable('payment_cheques', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  termId: integer('termId').references(() => academic_terms.id),
  chequeNo: varchar('chequeNo', { length: 40 }).notNull(),
  bankName: varchar('bankName', { length: 100 }),
  branchCode: varchar('branchCode', { length: 40 }),
  amount: numeric('amount', { precision: 12, scale: 0 }).notNull(),
  dueDate: timestamp('dueDate').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING | CLEARED | BOUNCED | CANCELLED
  /** شناسهٔ تراکنش دفتر مالی پس از وصول */
  ledgerTxnId: integer('ledgerTxnId'),
  remindedAt: timestamp('remindedAt'),
  clearedAt: timestamp('clearedAt'),
  note: text('note'),
  createdAt: timestamp('createdAt').defaultNow()
});

/** وام‌های دانشجویی */
/**
 * کاتالوگ وام‌های قابل ارائه — نمونه: وام صندوق رفاه، وام ضروری،
 * ودیعهٔ مسکن. بدون این جدول، نام وام متن آزاد بود و هر کارشناس می‌توانست
 * یک جور بنویسد؛ اکنون مانند انواع تخفیف و بنیادها قابل تعریف است.
 */
export const loan_products = pgTable('loan_products', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  title: varchar('title', { length: 150 }).notNull(),
  /** نام نهاد پرداخت‌کننده که هنگام تخصیص پیش‌فرض می‌شود */
  lender: varchar('lender', { length: 150 }).notNull(),
  /** سقف مبلغ مجاز؛ NULL = بدون سقف */
  maxAmount: numeric('maxAmount', { precision: 12, scale: 0 }),
  defaultAmount: numeric('defaultAmount', { precision: 12, scale: 0 }).notNull().default('0'),
  defaultInstallments: integer('defaultInstallments').notNull().default(1),
  /** ۱ = کارمزد ندارد */
  isInterestFree: integer('isInterestFree').notNull().default(1),
  requiresApproval: integer('requiresApproval').notNull().default(1),
  isActive: integer('isActive').notNull().default(1),
  note: text('note'),
  createdAt: timestamp('createdAt').defaultNow()
});

export const student_loans = pgTable('student_loans', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  termId: integer('termId').references(() => academic_terms.id),
  loanProductId: integer('loanProductId').references(() => loan_products.id),
  lender: varchar('lender', { length: 150 }).notNull(),
  loanCode: varchar('loanCode', { length: 40 }),
  amount: numeric('amount', { precision: 12, scale: 0 }).notNull(),
  installments: integer('installments').notNull().default(1),
  firstDueDate: timestamp('firstDueDate'),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'), // ACTIVE | SETTLED | CANCELLED
  ledgerTxnId: integer('ledgerTxnId'),
  note: text('note'),
  createdAt: timestamp('createdAt').defaultNow()
});

/**
 * فرمول تخصیص شهریه — قابل تعریف توسط کارشناس مالی.
 * تفکیک نرخ هر واحد بر اساس نوع درس (نظری/عملی/عمومی) و بازهٔ ورودی.
 */
export const tuition_formulas = pgTable('tuition_formulas', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  title: varchar('title', { length: 150 }).notNull(),
  degreeLevelId: integer('degreeLevelId').references(() => degree_level_configs.id),
  majorId: integer('majorId').references(() => majors.id),
  entryYearFrom: integer('entryYearFrom'),
  entryYearTo: integer('entryYearTo'),
  fixedAmount: numeric('fixedAmount', { precision: 12, scale: 0 }).notNull().default('0'),
  perUnitTheory: numeric('perUnitTheory', { precision: 12, scale: 0 }).notNull().default('0'),
  perUnitPractical: numeric('perUnitPractical', { precision: 12, scale: 0 }).notNull().default('0'),
  perUnitGeneral: numeric('perUnitGeneral', { precision: 12, scale: 0 }).notNull().default('0'),
  /** عدد کوچک‌تر = اولویت بالاتر در انتخاب فرمول */
  priority: integer('priority').notNull().default(100),
  isActive: integer('isActive').notNull().default(1),
  note: text('note'),
  updatedAt: timestamp('updatedAt').defaultNow()
});
