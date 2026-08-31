// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — کالبد Drizzle/PostgreSQL — نگاشت مستقیم ۱:۱ از schema.sql فاز صفر
//  تولیدشده خودکار (۷۳ جدول)؛ نام ستون‌ها عیناً حفظ شده تا مهاجرت دادهٔ
//  SQLite→PG مستقیم باشد. لایهٔ سخت‌سازی (ایندکس/پارتیشن/RLS — سند §۲۰۹۳–۲۲۴۰)
//  → src/db/pg-hardening.sql
// ══════════════════════════════════════════════════════════════════════
import { pgTable, serial, integer, varchar, text, timestamp, date, time, numeric, unique, primaryKey, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  isSystem: integer('isSystem').default(0)
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull()
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
  gradesFinalizedAt: timestamp('gradesFinalizedAt')
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

export const process_definitions = pgTable('process_definitions', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 150 }).notNull(),
  formSchema: text('formSchema'),
  isActive: integer('isActive').default(1)
});

export const process_steps = pgTable('process_steps', {
  id: serial('id').primaryKey(),
  processId: integer('processId').notNull().references(() => process_definitions.id),
  stepOrder: integer('stepOrder').notNull(),
  title: varchar('title', { length: 150 }).notNull(),
  stepType: varchar('stepType', { length: 20 }).notNull().default('USER'),
  roleCode: varchar('roleCode', { length: 50 }),
  assigneeStaffId: integer('assigneeStaffId').references(() => staff.id),
  slaHours: integer('slaHours'),
  timeoutAction: varchar('timeoutAction', { length: 30 }),
  integrationId: integer('integrationId').references(() => integrations_config.id),
  apiConfig: text('apiConfig')
});

export const process_transitions = pgTable('process_transitions', {
  id: serial('id').primaryKey(),
  stepId: integer('stepId').notNull().references(() => process_steps.id),
  action: varchar('action', { length: 20 }).notNull(),
  toStepId: integer('toStepId').references(() => process_steps.id),
  isFinal: integer('isFinal').default(0)
});

export const student_requests = pgTable('student_requests', {
  id: serial('id').primaryKey(),
  trackingCode: varchar('trackingCode', { length: 20 }).notNull().unique(),
  studentId: integer('studentId').notNull().references(() => students.id),
  processId: integer('processId').notNull().references(() => process_definitions.id),
  currentStepId: integer('currentStepId').references(() => process_steps.id),
  formData: text('formData'),
  status: varchar('status', { length: 30 }).notNull().default('SUBMITTED'),
  autoCreated: integer('autoCreated').default(0),
  relatedEnrollmentId: integer('relatedEnrollmentId').references(() => enrollments.id),
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
  action: varchar('action', { length: 20 }),
  note: text('note'),
  durationMinutes: integer('durationMinutes'),
  slaStatus: varchar('slaStatus', { length: 20 })
});

export const term_financial_rules = pgTable('term_financial_rules', {
  id: serial('id').primaryKey(),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  degreeLevelId: integer('degreeLevelId').notNull().references(() => degree_level_configs.id),
  fixedTuition: numeric('fixedTuition', { precision: 12, scale: 0 }).notNull(),
  perUnitTuition: numeric('perUnitTuition', { precision: 12, scale: 0 }).default('0'),
  advancePaymentRequired: numeric('advancePaymentRequired', { precision: 12, scale: 0 }).notNull()
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
