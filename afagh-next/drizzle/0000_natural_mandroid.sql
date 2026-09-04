CREATE TABLE "academic_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"termCode" varchar(10) NOT NULL,
	"title" varchar(100) NOT NULL,
	"termType" varchar(20) DEFAULT 'NORMAL' NOT NULL,
	"isCurrent" integer DEFAULT 0,
	"isSummer" integer DEFAULT 0,
	"isEnrollmentOpen" integer DEFAULT 0,
	"enrollmentStartDate" timestamp,
	"enrollmentEndDate" timestamp,
	"startDate" timestamp,
	"endDate" timestamp,
	"gradeEntryDeadline" timestamp,
	"appealWindowDays" integer DEFAULT 3,
	"professorAppealSlaDays" integer DEFAULT 5,
	CONSTRAINT "academic_terms_termCode_unique" UNIQUE("termCode")
);
--> statement-breakpoint
CREATE TABLE "admissions_staging" (
	"id" serial PRIMARY KEY NOT NULL,
	"nationalCode" varchar(10) NOT NULL,
	"rawSanjeshData" text,
	"mappedMajorId" integer,
	"status" varchar(20) DEFAULT 'pending',
	"userId" integer,
	"fullName" varchar(150),
	"mobile" varchar(11),
	"entryYear" integer,
	"degreeLevelId" integer,
	"quotaType" varchar(50) DEFAULT 'NORMAL',
	"profileJson" text,
	"paidAdvance" integer DEFAULT 0,
	"paidAmount" integer DEFAULT 0,
	"onboardingStatus" varchar(30) DEFAULT 'IMPORTED',
	"studentId" integer,
	"decisionNote" text
);
--> statement-breakpoint
CREATE TABLE "alumni_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"employmentStatus" varchar(40),
	"organization" varchar(150),
	"jobTitle" varchar(150),
	"contactEmail" varchar(150),
	"contactMobile" varchar(11),
	"linkedinUrl" varchar(300),
	"allowContact" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "uq_alumni_profiles_student" UNIQUE("studentId")
);
--> statement-breakpoint
CREATE TABLE "alumni_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"requestType" varchar(40) NOT NULL,
	"trackingCode" varchar(30) NOT NULL,
	"status" varchar(30) DEFAULT 'AWAITING_PAYMENT' NOT NULL,
	"fee" numeric(12, 0) DEFAULT '0',
	"paidAt" timestamp,
	"ledgerId" integer,
	"destination" varchar(200),
	"description" text,
	"resultFileUrl" varchar(500),
	"handledBy" integer,
	"adminNote" text,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "alumni_requests_trackingCode_unique" UNIQUE("trackingCode")
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"cacheKey" varchar(160) NOT NULL,
	"reportType" varchar(60) NOT NULL,
	"payload" text NOT NULL,
	"rowCount" integer,
	"durationMs" integer,
	"computedAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp,
	CONSTRAINT "analytics_snapshots_cacheKey_unique" UNIQUE("cacheKey")
);
--> statement-breakpoint
CREATE TABLE "api_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"serviceName" varchar(100) NOT NULL,
	"requestId" integer,
	"stepId" integer,
	"requestUrl" varchar(500) NOT NULL,
	"requestPayload" text,
	"responseStatus" integer,
	"responseBody" text,
	"durationMs" integer,
	"isSuccess" integer DEFAULT 1,
	"executedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorUserId" integer,
	"action" varchar(100) NOT NULL,
	"entityType" varchar(50),
	"entityId" integer,
	"details" text,
	"prevHash" varchar(64),
	"hash" varchar(64) NOT NULL,
	"ipAddress" varchar(50),
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"offeringId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"UNIQUE" text
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"offeringId" integer NOT NULL,
	"sessionDate" varchar(10) NOT NULL,
	"startTime" varchar(5) NOT NULL,
	"endTime" varchar(5) NOT NULL,
	"status" varchar(20) DEFAULT 'SCHEDULED' NOT NULL,
	"isMakeUpSession" integer DEFAULT 0,
	"replacedSessionId" integer,
	"sessionNo" integer
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"capacity" integer NOT NULL,
	"roomType" varchar(30),
	"buildingName" varchar(100),
	"rowsCount" integer,
	"colsCount" integer
);
--> statement-breakpoint
CREATE TABLE "clearance_checklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"auditId" integer,
	"department" varchar(40) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"amountDue" numeric(14, 0) DEFAULT '0',
	"detail" text,
	"autoChecked" integer DEFAULT 0 NOT NULL,
	"resolvedBy" integer,
	"resolvedAt" timestamp,
	"notifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "uq_clearance_checklist" UNIQUE("studentId","department")
);
--> statement-breakpoint
CREATE TABLE "clearance_departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"title" varchar(120) NOT NULL,
	"autoCheck" varchar(30) DEFAULT 'NONE' NOT NULL,
	"apiUrl" varchar(500),
	"responsibleRoleCode" varchar(40),
	"sortOrder" integer DEFAULT 100 NOT NULL,
	"isActive" integer DEFAULT 1 NOT NULL,
	"hint" text,
	CONSTRAINT "clearance_departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "course_exam_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseOfferingId" integer NOT NULL,
	"totalHallsCount" integer DEFAULT 1 NOT NULL,
	"receivedHallsCount" integer DEFAULT 0 NOT NULL,
	"totalExpectedSheets" integer DEFAULT 0 NOT NULL,
	"totalDeliveredSheets" integer DEFAULT 0 NOT NULL,
	"isFullyCollected" integer DEFAULT 0,
	"notificationSentAt" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "course_offerings" (
	"id" serial PRIMARY KEY NOT NULL,
	"termId" integer NOT NULL,
	"courseId" integer NOT NULL,
	"professorId" integer,
	"groupNumber" integer DEFAULT 1 NOT NULL,
	"capacity" integer NOT NULL,
	"waitlistCapacity" integer DEFAULT 0,
	"enrolledCount" integer DEFAULT 0 NOT NULL,
	"genderRestriction" varchar(10),
	"sharedScheduleGroupKey" varchar(50),
	"offeringType" varchar(30) DEFAULT 'NORMAL' NOT NULL,
	"customGradeDeadline" timestamp,
	"isActive" integer DEFAULT 1 NOT NULL,
	"gradesHash" text,
	"gradesTemporaryAt" timestamp,
	"gradesFinalizedAt" timestamp,
	"targetDegreeLevelId" integer,
	"targetMajorId" integer,
	"entryYearStart" integer,
	"entryYearEnd" integer
);
--> statement-breakpoint
CREATE TABLE "course_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" integer NOT NULL,
	"syllabusId" integer,
	"ruleType" varchar(20) NOT NULL,
	"logicTree" text NOT NULL,
	"customPassingGrade" numeric(4, 2)
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"title" varchar(150) NOT NULL,
	"theoreticalUnits" numeric(3, 1) DEFAULT '0',
	"practicalUnits" numeric(3, 1) DEFAULT '0',
	"units" numeric(3, 1) NOT NULL,
	"courseType" varchar(50),
	"departmentId" integer,
	"gradingType" varchar(20) DEFAULT 'NUMERIC',
	"affectsGpa" integer DEFAULT 1,
	CONSTRAINT "courses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "degree_level_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(100) NOT NULL,
	"code" varchar(30) NOT NULL,
	"defaultPassingGrade" numeric(4, 2) DEFAULT '10.00' NOT NULL,
	"conditionalGpaThreshold" numeric(4, 2) DEFAULT '12.00' NOT NULL,
	"maxUnitsPerTerm" integer DEFAULT 20,
	CONSTRAINT "degree_level_configs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"facultyId" integer NOT NULL,
	"departmentCode" varchar(10)
);
--> statement-breakpoint
CREATE TABLE "doc_sign_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffId" integer NOT NULL,
	"documentId" integer NOT NULL,
	"otpHash" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"isUsed" integer DEFAULT 0,
	"attempts" integer DEFAULT 0,
	"lockedAt" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(100) NOT NULL,
	"scope" varchar(20) DEFAULT 'STUDENT',
	"accessRoles" text
);
--> statement-breakpoint
CREATE TABLE "document_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"documentId" integer NOT NULL,
	"staffId" integer NOT NULL,
	"signedAt" timestamp NOT NULL,
	"ipAddress" varchar(50),
	"userAgent" text,
	"otpUsed" varchar(10)
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"title" varchar(150) NOT NULL,
	"templateText" text NOT NULL,
	CONSTRAINT "document_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"categoryId" integer NOT NULL,
	"code" varchar(40) NOT NULL,
	"title" varchar(100) NOT NULL,
	"targetAudience" varchar(10) DEFAULT 'BOTH',
	"isRequired" integer DEFAULT 1,
	"needsVerification" integer DEFAULT 1,
	CONSTRAINT "document_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "educational_regulations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(150) NOT NULL,
	"degreeLevelId" integer NOT NULL,
	"effectiveFromYear" integer NOT NULL,
	"effectiveToYear" integer,
	"rulesConfig" text NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "electronic_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractId" integer,
	"staffId" integer NOT NULL,
	"termId" integer NOT NULL,
	"docType" varchar(50),
	"title" varchar(200),
	"documentSnapshot" text NOT NULL,
	"documentHash" varchar(255) NOT NULL,
	"signatureStatus" varchar(20) DEFAULT 'PENDING',
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"offeringId" integer NOT NULL,
	"status" varchar(30) DEFAULT 'REGISTERED' NOT NULL,
	"waitlistPosition" integer,
	"workflowRequestId" integer,
	"hasEvaluated" integer DEFAULT 0 NOT NULL,
	"gradeValue" numeric(4, 2),
	"gradeStatus" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"isDirectedReading" integer DEFAULT 0,
	"registeredAt" timestamp DEFAULT now(),
	"absenceMarkedAt" timestamp,
	CONSTRAINT "uq_enrollments" UNIQUE("studentId","offeringId")
);
--> statement-breakpoint
CREATE TABLE "evaluation_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(150) NOT NULL,
	"targetType" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "evaluation_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"termId" integer,
	"title" varchar(150) NOT NULL,
	"startDate" timestamp NOT NULL,
	"endDate" timestamp NOT NULL,
	"isActive" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "evaluation_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"formId" integer,
	"questionText" text NOT NULL,
	"questionType" varchar(20),
	"weight" numeric(3, 2) DEFAULT '1.0',
	"orderIndex" integer,
	"axisLabel" varchar(60)
);
--> statement-breakpoint
CREATE TABLE "evaluation_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"periodId" integer,
	"offeringId" integer,
	"questionId" integer,
	"selectedOptionId" integer,
	"textAnswer" text
);
--> statement-breakpoint
CREATE TABLE "exam_attendances" (
	"id" serial PRIMARY KEY NOT NULL,
	"examId" integer NOT NULL,
	"studentId" integer NOT NULL,
	"isPresent" integer DEFAULT 0,
	"checkInMethod" varchar(30) DEFAULT 'QR_SCAN',
	"verifiedByStaffId" integer,
	"hasTemporaryPermit" integer DEFAULT 0,
	"checkInTime" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exam_course_packets" (
	"id" serial PRIMARY KEY NOT NULL,
	"examId" integer NOT NULL,
	"courseId" integer NOT NULL,
	"invigilatorStaffId" integer,
	"expectedSheetCount" integer DEFAULT 0 NOT NULL,
	"actualDeliveredCount" integer,
	"handoverStatus" varchar(30) DEFAULT 'NOT_STARTED',
	"receivedByVaultManagerId" integer,
	"handoverCompletedAt" timestamp,
	"discrepancyNote" text,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exam_halls" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"totalCapacity" integer NOT NULL,
	"rowsCount" integer,
	"colsCount" integer,
	"buildingName" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "exam_invigilators" (
	"id" serial PRIMARY KEY NOT NULL,
	"examId" integer NOT NULL,
	"staffId" integer NOT NULL,
	"role" varchar(50) DEFAULT 'INVIGILATOR' NOT NULL,
	"clockInTime" timestamp,
	"clockOutTime" timestamp,
	"isBilledToPayroll" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exam_minutes" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" integer NOT NULL,
	"hallId" integer NOT NULL,
	"totalStudentsExpected" integer DEFAULT 0,
	"totalStudentsPresent" integer DEFAULT 0,
	"totalStudentsAbsent" integer DEFAULT 0,
	"cheatingIncidentsCount" integer DEFAULT 0,
	"supervisorStaffId" integer,
	"isSignedAndFinalized" integer DEFAULT 0,
	"signedAt" timestamp,
	"notes" text,
	"summaryHash" varchar(255),
	"vaultReceivedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "exam_remuneration_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" varchar(50) NOT NULL,
	"roleTitle" varchar(100) NOT NULL,
	"ratePerHour" numeric(12, 0) NOT NULL,
	"effectiveYear" integer DEFAULT 1405
);
--> statement-breakpoint
CREATE TABLE "exam_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"termId" integer NOT NULL,
	"examDate" varchar(10) NOT NULL,
	"startTime" varchar(5) NOT NULL,
	"endTime" varchar(5) NOT NULL,
	"UNIQUE" text,
	CONSTRAINT "uq_exam_sessions" UNIQUE("termId","examDate","startTime")
);
--> statement-breakpoint
CREATE TABLE "faculties" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"facultyCode" varchar(10)
);
--> statement-breakpoint
CREATE TABLE "financial_clearances" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"termId" integer NOT NULL,
	"isCleared" integer DEFAULT 0,
	"clearedAt" timestamp,
	"UNIQUE" text,
	CONSTRAINT "uq_financial_clearances" UNIQUE("studentId","termId")
);
--> statement-breakpoint
CREATE TABLE "form_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"formId" integer NOT NULL,
	"departmentId" integer,
	"courseType" varchar(50),
	"practicalOnly" integer
);
--> statement-breakpoint
CREATE TABLE "grade_appeals" (
	"id" serial PRIMARY KEY NOT NULL,
	"enrollmentId" integer NOT NULL,
	"studentMessage" text NOT NULL,
	"professorReply" text,
	"oldGrade" numeric(4, 2),
	"newGrade" numeric(4, 2),
	"status" varchar(20) DEFAULT 'OPEN',
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "grade_submission_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffId" integer NOT NULL,
	"offeringId" integer NOT NULL,
	"otpHash" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"isUsed" integer DEFAULT 0,
	"attempts" integer DEFAULT 0,
	"lockedAt" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "graduation_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"workflowStatus" varchar(40) DEFAULT 'CATALOG_REVIEW' NOT NULL,
	"requiredUnits" numeric(6, 2) DEFAULT '0',
	"passedUnits" numeric(6, 2) DEFAULT '0',
	"gpa" numeric(4, 2),
	"missingCourses" jsonb,
	"catalogOk" integer DEFAULT 0 NOT NULL,
	"headApprovalStatus" integer DEFAULT 0 NOT NULL,
	"headApprovedBy" integer,
	"headApprovedAt" timestamp,
	"headNote" text,
	"thesisRequired" integer DEFAULT 0 NOT NULL,
	"thesisTitle" varchar(300),
	"irandocTrackingCode" varchar(60),
	"irandocSimilarityScore" numeric(5, 2),
	"irandocStatus" varchar(30) DEFAULT 'PENDING',
	"irandocCheckedAt" timestamp,
	"sajjadStatus" varchar(30) DEFAULT 'PENDING',
	"sajjadRequestCode" varchar(60),
	"sajjadRequestedAt" timestamp,
	"sajjadConfirmedAt" timestamp,
	"photoDocumentId" integer,
	"stampFeePaid" integer DEFAULT 0 NOT NULL,
	"stampFeeAmount" numeric(12, 0) DEFAULT '0',
	"finalDocsAt" timestamp,
	"graduationTermId" integer,
	"note" text,
	"startedAt" timestamp DEFAULT now(),
	"lastEventAt" timestamp DEFAULT now(),
	"completedAt" timestamp,
	CONSTRAINT "uq_graduation_audits_student" UNIQUE("studentId")
);
--> statement-breakpoint
CREATE TABLE "instructor_advances" (
	"id" serial PRIMARY KEY NOT NULL,
	"instructorId" integer NOT NULL,
	"courseOfferingId" integer NOT NULL,
	"requestedAmount" integer NOT NULL,
	"approvedAmount" integer,
	"status" varchar(30) DEFAULT 'PENDING_APPROVAL',
	"approvedByFinanceId" integer,
	"paidAt" timestamp,
	"isDeductedFromFinalPayroll" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "instructor_attendance_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"instructorId" integer NOT NULL,
	"attendanceDate" varchar(20) NOT NULL,
	"sessionsHeldCount" integer DEFAULT 1,
	"insuranceCalculated" integer DEFAULT 1,
	"syncedWithTamin" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "instructor_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseOfferingId" integer NOT NULL,
	"instructorId" integer NOT NULL,
	"sheetCount" integer NOT NULL,
	"pickupToken" varchar(64) NOT NULL,
	"deliveredAt" timestamp DEFAULT now(),
	"vaultManagerId" integer,
	"gradeDeadline" timestamp NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING_GRADING',
	"papersReturnedToArchive" integer DEFAULT 0,
	"archiveManagerId" integer,
	"returnedAt" timestamp,
	CONSTRAINT "instructor_deliveries_pickupToken_unique" UNIQUE("pickupToken")
);
--> statement-breakpoint
CREATE TABLE "instructor_financial_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"instructorId" integer NOT NULL,
	"canRequestAdvance" integer DEFAULT 0,
	"isInsuranceEnabled" integer DEFAULT 1,
	"isTaxExempt" integer DEFAULT 0,
	"taxRatePercent" integer DEFAULT 10,
	"insuranceType" varchar(50) DEFAULT 'TAMIN_DAILY',
	"taminBranchCode" varchar(50),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "instructor_financial_profiles_instructorId_unique" UNIQUE("instructorId")
);
--> statement-breakpoint
CREATE TABLE "integrations_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"serviceName" varchar(100) NOT NULL,
	"baseUrl" varchar(255),
	"authType" varchar(30),
	"authCredentials" text,
	"timeoutSeconds" integer DEFAULT 10,
	"isActive" integer DEFAULT 1,
	CONSTRAINT "integrations_config_serviceName_unique" UNIQUE("serviceName")
);
--> statement-breakpoint
CREATE TABLE "invigilators" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffId" integer NOT NULL,
	"sessionId" integer NOT NULL,
	"hallId" integer NOT NULL,
	"role" varchar(50) DEFAULT 'PROCTOR',
	"attendanceStatus" varchar(20) DEFAULT 'PENDING',
	"hoursWorked" numeric(4, 2) DEFAULT '2.0',
	"calculatedPayment" numeric(12, 0) DEFAULT '0',
	"paymentStatus" varchar(20) DEFAULT 'UNPAID',
	"paidAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "issued_degrees" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"degreeType" varchar(30) NOT NULL,
	"serialNo" varchar(60) NOT NULL,
	"verifyCode" varchar(40) NOT NULL,
	"ministryVerificationCode" varchar(60),
	"documentHash" varchar(255) NOT NULL,
	"snapshot" jsonb,
	"issuedByUserId" integer,
	"issuedAt" timestamp DEFAULT now() NOT NULL,
	"isDelivered" integer DEFAULT 0 NOT NULL,
	"deliveredAt" timestamp,
	"deliveredTo" varchar(150),
	"revokedAt" timestamp,
	"revokeReason" text,
	CONSTRAINT "issued_degrees_serialNo_unique" UNIQUE("serialNo"),
	CONSTRAINT "issued_degrees_verifyCode_unique" UNIQUE("verifyCode")
);
--> statement-breakpoint
CREATE TABLE "kyc_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"civilRegistryStatus" varchar(30) DEFAULT 'PENDING',
	"shahkarStatus" varchar(30) DEFAULT 'PENDING',
	"fetchedCivilData" text,
	"livenessVideoUrl" varchar(500),
	"livenessChallenge" varchar(150),
	"faceMatchScore" numeric(5, 2),
	"aiVerificationStatus" varchar(30) DEFAULT 'PENDING',
	"expertDecision" varchar(20),
	"reviewedBy" integer,
	"ipAddress" varchar(50),
	"deviceInfo" text,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "legacy_code_maps" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceCode" varchar(50) DEFAULT 'LEGACY' NOT NULL,
	"domain" varchar(30) NOT NULL,
	"legacyCode" varchar(100) NOT NULL,
	"legacyTitle" varchar(250),
	"targetId" integer,
	"targetCode" varchar(100),
	"targetTitle" varchar(250),
	"confidence" numeric(5, 2) DEFAULT '0',
	"status" varchar(20) DEFAULT 'UNMAPPED' NOT NULL,
	"note" text,
	"updatedByUserId" integer,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "uq_legacy_code_maps" UNIQUE("sourceCode","domain","legacyCode")
);
--> statement-breakpoint
CREATE TABLE "legacy_financial_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceCode" varchar(50) DEFAULT 'LEGACY' NOT NULL,
	"studentCode" varchar(20) NOT NULL,
	"studentName" varchar(150),
	"termCode" varchar(10) NOT NULL,
	"formulaCode" varchar(60),
	"degreeCode" varchar(60),
	"majorCode" varchar(60),
	"entryYear" integer,
	"totalUnits" numeric(6, 2) DEFAULT '0',
	"theoryUnits" numeric(6, 2) DEFAULT '0',
	"practicalUnits" numeric(6, 2) DEFAULT '0',
	"generalUnits" numeric(6, 2) DEFAULT '0',
	"legacyTuition" numeric(14, 0) DEFAULT '0' NOT NULL,
	"legacyDiscount" numeric(14, 0) DEFAULT '0' NOT NULL,
	"legacyPaid" numeric(14, 0) DEFAULT '0' NOT NULL,
	"batchId" integer,
	"raw" text,
	"importedAt" timestamp DEFAULT now(),
	CONSTRAINT "uq_legacy_financial_records" UNIQUE("sourceCode","studentCode","termCode")
);
--> statement-breakpoint
CREATE TABLE "legacy_grades" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceCode" varchar(50) DEFAULT 'LEGACY' NOT NULL,
	"studentCode" varchar(20) NOT NULL,
	"studentName" varchar(150),
	"termCode" varchar(10) NOT NULL,
	"courseCode" varchar(40) NOT NULL,
	"courseTitle" varchar(200),
	"units" numeric(5, 2),
	"gradeRaw" varchar(40),
	"gradeValue" numeric(5, 2),
	"gradeStatus" varchar(20) DEFAULT 'FINALIZED' NOT NULL,
	"professorName" varchar(150),
	"batchId" integer,
	"compareStatus" varchar(20) DEFAULT 'PENDING',
	"compareNote" text,
	"appliedAt" timestamp,
	"raw" text,
	"importedAt" timestamp DEFAULT now(),
	CONSTRAINT "uq_legacy_grades" UNIQUE("sourceCode","studentCode","termCode","courseCode")
);
--> statement-breakpoint
CREATE TABLE "legacy_import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceCode" varchar(50) DEFAULT 'LEGACY' NOT NULL,
	"importType" varchar(40) NOT NULL,
	"fileName" varchar(255),
	"sheetName" varchar(120),
	"headers" text,
	"columnMap" text,
	"totalRows" integer DEFAULT 0 NOT NULL,
	"okRows" integer DEFAULT 0 NOT NULL,
	"errorRows" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'PARSED' NOT NULL,
	"note" text,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now(),
	"processedAt" timestamp,
	"rolledBackAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "legacy_import_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"batchId" integer NOT NULL,
	"rowNumber" integer NOT NULL,
	"rawData" jsonb NOT NULL,
	"validationStatus" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"errorMessage" text,
	"processedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "legacy_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"title" varchar(150) NOT NULL,
	"kind" varchar(30) DEFAULT 'OTHER',
	"note" text,
	"isActive" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "legacy_sources_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "legacy_tuition_formulas" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceCode" varchar(50) DEFAULT 'LEGACY' NOT NULL,
	"formulaCode" varchar(60) NOT NULL,
	"title" varchar(200),
	"termCode" varchar(10),
	"degreeCode" varchar(60),
	"majorCode" varchar(60),
	"entryYearFrom" integer,
	"entryYearTo" integer,
	"fixedAmount" numeric(14, 0) DEFAULT '0' NOT NULL,
	"perUnitTheory" numeric(14, 0) DEFAULT '0' NOT NULL,
	"perUnitPractical" numeric(14, 0) DEFAULT '0' NOT NULL,
	"perUnitGeneral" numeric(14, 0) DEFAULT '0' NOT NULL,
	"expression" text,
	"variables" text,
	"isActive" integer DEFAULT 1 NOT NULL,
	"note" text,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "uq_legacy_tuition_formulas" UNIQUE("sourceCode","formulaCode","termCode")
);
--> statement-breakpoint
CREATE TABLE "loan_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"title" varchar(150) NOT NULL,
	"lender" varchar(150) NOT NULL,
	"maxAmount" numeric(12, 0),
	"defaultAmount" numeric(12, 0) DEFAULT '0' NOT NULL,
	"defaultInstallments" integer DEFAULT 1 NOT NULL,
	"isInterestFree" integer DEFAULT 1 NOT NULL,
	"requiresApproval" integer DEFAULT 1 NOT NULL,
	"isActive" integer DEFAULT 1 NOT NULL,
	"note" text,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "loan_products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "majors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"degreeLevelId" integer NOT NULL,
	"departmentId" integer,
	"majorCode" varchar(10),
	"facultyId" integer,
	"minUnits" integer,
	"standardCode" varchar(20),
	"establishedDate" varchar(10),
	"terminatedDate" varchar(10),
	"isActive" integer DEFAULT 1,
	"headStaffCode" varchar(20),
	"expertName" varchar(150),
	"lastCouncilDate" varchar(10),
	CONSTRAINT "majors_majorCode_unique" UNIQUE("majorCode")
);
--> statement-breakpoint
CREATE TABLE "migration_audit_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"batchId" integer,
	"opGroup" varchar(40) NOT NULL,
	"sourceCode" varchar(50) DEFAULT 'LEGACY' NOT NULL,
	"tableName" varchar(60) NOT NULL,
	"rowId" integer NOT NULL,
	"op" varchar(10) NOT NULL,
	"beforeData" jsonb,
	"afterData" jsonb,
	"revertedAt" timestamp,
	"revertNote" text,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "migration_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" varchar(30) NOT NULL,
	"fileName" varchar(255),
	"mode" varchar(10) NOT NULL,
	"totalRows" integer DEFAULT 0,
	"inserted" integer DEFAULT 0,
	"skippedExisting" integer DEFAULT 0,
	"invalid" integer DEFAULT 0,
	"report" text,
	"status" varchar(20) NOT NULL,
	"triggeredByUserId" integer,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "military_service_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"status" varchar(50),
	"exemptionExpiry" date,
	"sakhaStatus" varchar(50),
	"exemptionStartDate" date,
	"sakhaTrackingCode" varchar(50),
	"pendingExtraSemesters" integer,
	"lastSyncAt" timestamp,
	CONSTRAINT "military_service_records_studentId_unique" UNIQUE("studentId")
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"channel" varchar(20) NOT NULL,
	"address" varchar(120) NOT NULL,
	"isActive" integer DEFAULT 1 NOT NULL,
	"verifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "uq_notification_channels" UNIQUE("userId","channel")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"notificationId" integer,
	"eventCode" varchar(60),
	"channel" varchar(20) NOT NULL,
	"target" varchar(120),
	"status" varchar(20) NOT NULL,
	"providerRef" varchar(120),
	"error" text,
	"body" text,
	"durationMs" integer,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"channel" varchar(20) NOT NULL,
	"eventType" varchar(50) NOT NULL,
	"messageBody" text NOT NULL,
	"deliveryStatus" varchar(20) DEFAULT 'PENDING',
	"providerResponse" text,
	"sentAt" timestamp DEFAULT now(),
	"deliveredAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventCode" varchar(50) NOT NULL,
	"channel" varchar(20),
	"templateText" text NOT NULL,
	"isActive" integer DEFAULT 1,
	CONSTRAINT "notification_templates_eventCode_unique" UNIQUE("eventCode")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"eventCode" varchar(50),
	"payload" text,
	"isRead" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offering_professors" (
	"id" serial PRIMARY KEY NOT NULL,
	"offeringId" integer NOT NULL,
	"staffId" integer NOT NULL,
	"role" varchar(50) DEFAULT 'MAIN_LECTURER' NOT NULL,
	"sharePercentage" numeric(5, 2) DEFAULT '100.00'
);
--> statement-breakpoint
CREATE TABLE "payment_cheques" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"termId" integer,
	"chequeNo" varchar(40) NOT NULL,
	"bankName" varchar(100),
	"branchCode" varchar(40),
	"amount" numeric(12, 0) NOT NULL,
	"dueDate" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"ledgerTxnId" integer,
	"remindedAt" timestamp,
	"clearedAt" timestamp,
	"note" text,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_calculation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"offeringType" varchar(50),
	"professorRole" varchar(50),
	"academicRank" varchar(50),
	"multiplierUnit" numeric(4, 2) DEFAULT '1.00',
	"multiplierPerStudent" numeric(4, 2),
	"flatFee" numeric(12, 0),
	"title" varchar(150),
	"isActive" integer DEFAULT 1,
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_statements" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractId" integer NOT NULL,
	"totalEquivalentUnits" numeric(6, 2),
	"payableUnits" numeric(6, 2),
	"grossAmount" numeric(12, 0),
	"deductions" numeric(12, 0),
	"netAmount" numeric(12, 0),
	"status" varchar(20) DEFAULT 'DRAFT',
	"detailJson" text,
	"midtermPaidAmount" numeric(12, 0) DEFAULT '0',
	"midtermPaidAt" timestamp,
	"finalPaidAmount" numeric(12, 0) DEFAULT '0',
	"finalPaidAt" timestamp,
	"computedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"category" varchar(50) DEFAULT 'عمومی',
	"description" varchar(255),
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "physical_access_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffId" integer NOT NULL,
	"punchTime" timestamp NOT NULL,
	"deviceLocation" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "process_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"title" varchar(150) NOT NULL,
	"category" varchar(50) DEFAULT 'عمومی' NOT NULL,
	"description" text,
	"formSchema" text,
	"outputTemplate" varchar(50),
	"feeAmount" integer DEFAULT 0,
	"isActive" integer DEFAULT 1,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "process_definitions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "process_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"processId" integer NOT NULL,
	"stepOrder" integer NOT NULL,
	"title" varchar(150) NOT NULL,
	"stepType" varchar(30) DEFAULT 'USER' NOT NULL,
	"roleCode" varchar(50),
	"assigneeStaffId" integer,
	"slaHours" integer DEFAULT 48,
	"timeoutAction" varchar(30) DEFAULT 'ESCALATE',
	"timeoutEscalateToRole" varchar(50),
	"integrationId" integer,
	"apiConfig" text
);
--> statement-breakpoint
CREATE TABLE "process_transitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"stepId" integer NOT NULL,
	"action" varchar(30) NOT NULL,
	"toStepId" integer,
	"isFinal" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "professor_availabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffId" integer NOT NULL,
	"termId" integer,
	"dayOfWeek" integer,
	"startTime" time,
	"endTime" time
);
--> statement-breakpoint
CREATE TABLE "professor_class_attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" integer NOT NULL,
	"staffId" integer NOT NULL,
	"verificationMethod" varchar(30) NOT NULL,
	"recordedIpAddress" varchar(50),
	"deviceUserAgent" text,
	"status" varchar(20) DEFAULT 'VALID' NOT NULL,
	"recordedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "professor_exam_attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"offeringId" integer,
	"sessionId" integer,
	"staffId" integer,
	"attendanceStatus" varchar(30) DEFAULT 'PENDING',
	"penaltyApplied" integer DEFAULT 0,
	"penaltyAmount" numeric(12, 0) DEFAULT '0',
	"notes" text,
	"recordedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "professor_term_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffId" integer NOT NULL,
	"termId" integer NOT NULL,
	"contractType" varchar(50),
	"baseDutyUnits" numeric(4, 2) DEFAULT '0',
	"taxRate" numeric(4, 2)
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"questionId" integer,
	"optionLabel" varchar(100) NOT NULL,
	"scoreValue" numeric(4, 2)
);
--> statement-breakpoint
CREATE TABLE "request_parallel_checkpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"requestId" integer NOT NULL,
	"departmentCode" varchar(50) NOT NULL,
	"departmentTitle" varchar(100) NOT NULL,
	"isCleared" integer DEFAULT 0,
	"clearedByStaffId" integer,
	"clearedAt" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "request_step_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"requestId" integer NOT NULL,
	"stepId" integer NOT NULL,
	"assignedAt" timestamp DEFAULT now(),
	"firstViewedAt" timestamp,
	"completedAt" timestamp,
	"actorStaffId" integer,
	"actorRole" varchar(50),
	"action" varchar(30),
	"note" text,
	"durationMinutes" integer,
	"slaStatus" varchar(30),
	"satisfactionScore" integer
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"roleId" integer NOT NULL,
	"permissionId" integer NOT NULL,
	CONSTRAINT "role_permissions_roleId_permissionId_pk" PRIMARY KEY("roleId","permissionId")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"isSystem" integer DEFAULT 0,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sanjesh_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"sanjeshCode" varchar(50) NOT NULL,
	"internalMajorId" integer,
	"sanjeshQuota" varchar(50),
	"internalQuotaCode" integer
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"offeringId" integer NOT NULL,
	"scheduleType" varchar(20) NOT NULL,
	"dayOfWeek" integer,
	"examDate" date,
	"startTime" time NOT NULL,
	"endTime" time NOT NULL,
	"roomId" integer
);
--> statement-breakpoint
CREATE TABLE "seat_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"enrollmentId" integer NOT NULL,
	"sessionId" integer NOT NULL,
	"hallId" integer NOT NULL,
	"seatNumber" integer NOT NULL,
	"blockKey" varchar(120),
	"UNIQUE" text,
	CONSTRAINT "uq_seat_allocations" UNIQUE("sessionId","hallId","seatNumber")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"expiresAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "short_term_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"certificateNumber" varchar(50) NOT NULL,
	"verificationHash" varchar(64) NOT NULL,
	"learnerId" integer NOT NULL,
	"courseId" integer NOT NULL,
	"registrationId" integer NOT NULL,
	"fullNameFa" varchar(150) NOT NULL,
	"fullNameEn" varchar(150),
	"courseTitleFa" varchar(255) NOT NULL,
	"courseTitleEn" varchar(255),
	"grade" numeric(4, 2) NOT NULL,
	"totalHours" integer NOT NULL,
	"issueDate" varchar(20) NOT NULL,
	"isRevoked" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "short_term_certificates_certificateNumber_unique" UNIQUE("certificateNumber")
);
--> statement-breakpoint
CREATE TABLE "short_term_courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"titleEn" varchar(255),
	"category" varchar(100) DEFAULT 'مهندسی و فناوری' NOT NULL,
	"description" text,
	"hours" integer DEFAULT 40 NOT NULL,
	"tuitionPrice" integer DEFAULT 0 NOT NULL,
	"capacity" integer DEFAULT 30 NOT NULL,
	"enrolledCount" integer DEFAULT 0 NOT NULL,
	"instructorName" varchar(150) NOT NULL,
	"instructorBio" text,
	"syllabusJson" text,
	"startDate" varchar(20),
	"endDate" varchar(20),
	"scheduleText" varchar(200),
	"passingGrade" numeric(4, 2) DEFAULT '12.00',
	"maxAbsences" integer DEFAULT 3,
	"status" varchar(20) DEFAULT 'OPEN',
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "short_term_courses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "short_term_discounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"courseId" integer,
	"discountPercent" integer DEFAULT 10 NOT NULL,
	"maxDiscountAmount" integer,
	"maxUsage" integer DEFAULT 100,
	"usedCount" integer DEFAULT 0,
	"isActive" integer DEFAULT 1,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "short_term_discounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "short_term_learners" (
	"id" serial PRIMARY KEY NOT NULL,
	"mobile" varchar(20) NOT NULL,
	"nationalId" varchar(10),
	"fullName" varchar(150) NOT NULL,
	"fullNameEn" varchar(150),
	"email" varchar(150),
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "short_term_learners_mobile_unique" UNIQUE("mobile")
);
--> statement-breakpoint
CREATE TABLE "short_term_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"learnerId" integer NOT NULL,
	"courseId" integer NOT NULL,
	"trackingCode" varchar(50) NOT NULL,
	"amountPaid" integer DEFAULT 0 NOT NULL,
	"discountAmount" integer DEFAULT 0,
	"discountCode" varchar(50),
	"paymentStatus" varchar(20) DEFAULT 'PAID' NOT NULL,
	"paymentRefId" varchar(100),
	"attendanceCount" integer DEFAULT 0,
	"totalSessions" integer DEFAULT 10,
	"finalGrade" numeric(4, 2),
	"isPassed" integer DEFAULT 0,
	"certificateIssued" integer DEFAULT 0,
	"certificateId" integer,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "short_term_registrations_trackingCode_unique" UNIQUE("trackingCode")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"staffCode" varchar(20) NOT NULL,
	"departmentId" integer,
	"staffType" varchar(50),
	"academicRank" varchar(50),
	"degree" varchar(50),
	"title" varchar(50),
	"facultyId" integer,
	"isActive" integer DEFAULT 1,
	"cooperationType" varchar(50),
	"personnelNo" varchar(50),
	"employmentType" varchar(50),
	"hireDate" varchar(10),
	"lastDegreeYear" integer,
	"fieldOfStudy" varchar(200),
	"maritalStatusCode" integer,
	"maritalStatus" varchar(20),
	"lastDegreeCountryCode" varchar(10),
	"lastDegreeUniversity" varchar(200),
	"academicBase" varchar(20),
	"birthProvince" varchar(100),
	"birthCity" varchar(100),
	"bankAccountNo" varchar(50),
	"phone" varchar(20),
	CONSTRAINT "staff_userId_unique" UNIQUE("userId"),
	CONSTRAINT "staff_staffCode_unique" UNIQUE("staffCode")
);
--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffId" integer NOT NULL,
	"roleId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_api_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"stepId" integer NOT NULL,
	"integrationId" integer NOT NULL,
	"endpointPath" varchar(255) NOT NULL,
	"httpMethod" varchar(10) DEFAULT 'POST' NOT NULL,
	"payloadMapping" text,
	"successCondition" text,
	"fallbackAction" varchar(50) DEFAULT 'MANUAL_REVIEW',
	"circuitBreakerThreshold" integer DEFAULT 3
);
--> statement-breakpoint
CREATE TABLE "student_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"secureToken" varchar(64) NOT NULL,
	"printStatus" varchar(20) DEFAULT 'PENDING',
	"rfidSerialNumber" varchar(100),
	"issuedAt" timestamp,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "student_cards_secureToken_unique" UNIQUE("secureToken")
);
--> statement-breakpoint
CREATE TABLE "student_class_attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" integer NOT NULL,
	"enrollmentId" integer NOT NULL,
	"status" varchar(10) NOT NULL,
	"UNIQUE" text
);
--> statement-breakpoint
CREATE TABLE "student_discounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"termId" integer,
	"discountTypeId" integer NOT NULL,
	"kind" varchar(20) DEFAULT 'PERCENT' NOT NULL,
	"percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(12, 0) DEFAULT '0' NOT NULL,
	"appliesTo" varchar(20) DEFAULT 'BOTH' NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"reason" text,
	"documentUrl" text,
	"approvedBy" integer,
	"approvedAt" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"personUserId" integer NOT NULL,
	"categoryId" integer NOT NULL,
	"typeId" integer,
	"fileName" varchar(255) NOT NULL,
	"fileUrl" varchar(500) NOT NULL,
	"mimeType" varchar(100),
	"contentHash" varchar(64),
	"verificationStatus" varchar(20) DEFAULT 'PENDING',
	"verifiedBy" integer,
	"rejectionReason" text,
	"uploadedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_id_formulas" (
	"id" serial PRIMARY KEY NOT NULL,
	"degreeLevelId" integer,
	"entryYear" integer,
	"formula" varchar(255) NOT NULL,
	"currentSequence" integer DEFAULT 0,
	CONSTRAINT "student_id_formulas_degreeLevelId_unique" UNIQUE("degreeLevelId")
);
--> statement-breakpoint
CREATE TABLE "student_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"termId" integer,
	"transactionType" varchar(20) NOT NULL,
	"amount" numeric(12, 0) NOT NULL,
	"description" text,
	"referenceId" integer,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"termId" integer,
	"loanProductId" integer,
	"lender" varchar(150) NOT NULL,
	"loanCode" varchar(40),
	"amount" numeric(12, 0) NOT NULL,
	"installments" integer DEFAULT 1 NOT NULL,
	"firstDueDate" timestamp,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"ledgerTxnId" integer,
	"note" text,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"trackingCode" varchar(30) NOT NULL,
	"studentId" integer NOT NULL,
	"processId" integer NOT NULL,
	"currentStepId" integer,
	"formData" text,
	"status" varchar(30) DEFAULT 'SUBMITTED' NOT NULL,
	"autoCreated" integer DEFAULT 0,
	"relatedEnrollmentId" integer,
	"satisfactionScore" integer,
	"feedbackText" text,
	"digitalStampHash" varchar(64),
	"certificateNumber" varchar(50),
	"issuedAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "student_requests_trackingCode_unique" UNIQUE("trackingCode")
);
--> statement-breakpoint
CREATE TABLE "student_sponsorships" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"termId" integer,
	"sponsorId" integer NOT NULL,
	"coverageKind" varchar(20) DEFAULT 'PERCENT' NOT NULL,
	"percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(12, 0) DEFAULT '0' NOT NULL,
	"appliesTo" varchar(20) DEFAULT 'BOTH' NOT NULL,
	"referenceNo" varchar(80),
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"studentCode" varchar(14) NOT NULL,
	"majorId" integer,
	"degreeLevelId" integer NOT NULL,
	"regulationId" integer NOT NULL,
	"entryYear" integer NOT NULL,
	"entryTerm" integer DEFAULT 1,
	"status" varchar(30) DEFAULT 'ACTIVE' NOT NULL,
	"quotaType" varchar(50) DEFAULT 'NORMAL' NOT NULL,
	"extraAllowedSemesters" integer DEFAULT 0 NOT NULL,
	"extraAllowedProbations" integer DEFAULT 0 NOT NULL,
	"currentTermNo" integer DEFAULT 1,
	CONSTRAINT "students_userId_unique" UNIQUE("userId"),
	CONSTRAINT "students_studentCode_unique" UNIQUE("studentCode")
);
--> statement-breakpoint
CREATE TABLE "syllabus_courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"syllabusId" integer NOT NULL,
	"courseId" integer NOT NULL,
	"semesterNo" integer
);
--> statement-breakpoint
CREATE TABLE "syllabuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"majorId" integer,
	"entryYearStart" integer NOT NULL,
	"entryYearEnd" integer,
	"minTotalUnitsToGraduate" integer
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_coefficients" (
	"id" serial PRIMARY KEY NOT NULL,
	"ruleName" varchar(100) NOT NULL,
	"multiplier" numeric(3, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"academicRank" varchar(50),
	"degree" varchar(50),
	"baseRatePerUnit" numeric(12, 0) NOT NULL,
	"effectiveYear" integer
);
--> statement-breakpoint
CREATE TABLE "term_financial_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"termId" integer NOT NULL,
	"degreeLevelId" integer NOT NULL,
	"fixedTuition" numeric(12, 0) NOT NULL,
	"perUnitTuition" numeric(12, 0) DEFAULT '0',
	"advancePaymentRequired" numeric(12, 0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"termId" integer NOT NULL,
	"snapshotJson" text NOT NULL,
	"snapshotHash" text NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"UNIQUE" text,
	CONSTRAINT "uq_transcript_snapshots" UNIQUE("studentId","termId")
);
--> statement-breakpoint
CREATE TABLE "tuition_compare_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"runId" integer NOT NULL,
	"studentCode" varchar(20) NOT NULL,
	"studentName" varchar(150),
	"termCode" varchar(10),
	"formulaCode" varchar(60),
	"totalUnits" numeric(6, 2) DEFAULT '0',
	"legacyAmount" numeric(14, 0) DEFAULT '0',
	"computedAmount" numeric(14, 0) DEFAULT '0',
	"diff" numeric(14, 0) DEFAULT '0',
	"status" varchar(20) NOT NULL,
	"resolutionStatus" varchar(20) DEFAULT 'UNRESOLVED' NOT NULL,
	"resolvedAt" timestamp,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "tuition_compare_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceCode" varchar(50) DEFAULT 'LEGACY' NOT NULL,
	"termCode" varchar(10),
	"tolerance" numeric(14, 0) DEFAULT '0' NOT NULL,
	"totalRows" integer DEFAULT 0,
	"matched" integer DEFAULT 0,
	"mismatched" integer DEFAULT 0,
	"unresolved" integer DEFAULT 0,
	"sumLegacy" numeric(16, 0) DEFAULT '0',
	"sumComputed" numeric(16, 0) DEFAULT '0',
	"sumDiff" numeric(16, 0) DEFAULT '0',
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tuition_discount_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"title" varchar(150) NOT NULL,
	"kind" varchar(20) DEFAULT 'PERCENT' NOT NULL,
	"defaultPercent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"defaultAmount" numeric(12, 0) DEFAULT '0' NOT NULL,
	"maxPercent" numeric(5, 2),
	"requiresApproval" integer DEFAULT 1 NOT NULL,
	"requiresDocument" integer DEFAULT 0 NOT NULL,
	"isActive" integer DEFAULT 1 NOT NULL,
	"note" text,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "tuition_discount_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tuition_fee_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"degreeLevelId" integer,
	"termType" varchar(20),
	"offeringType" varchar(30),
	"fixedTuition" numeric(12, 0) DEFAULT '0' NOT NULL,
	"perUnitTuition" numeric(12, 0) DEFAULT '0' NOT NULL,
	"effectiveFromYear" integer,
	"isActive" integer DEFAULT 1 NOT NULL,
	"note" text,
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tuition_formulas" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"title" varchar(150) NOT NULL,
	"degreeLevelId" integer,
	"majorId" integer,
	"entryYearFrom" integer,
	"entryYearTo" integer,
	"fixedAmount" numeric(12, 0) DEFAULT '0' NOT NULL,
	"perUnitTheory" numeric(12, 0) DEFAULT '0' NOT NULL,
	"perUnitPractical" numeric(12, 0) DEFAULT '0' NOT NULL,
	"perUnitGeneral" numeric(12, 0) DEFAULT '0' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"isActive" integer DEFAULT 1 NOT NULL,
	"note" text,
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "tuition_formulas_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tuition_sponsors" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"title" varchar(150) NOT NULL,
	"contactInfo" text,
	"settlementMethod" varchar(30) DEFAULT 'DIRECT' NOT NULL,
	"isActive" integer DEFAULT 1 NOT NULL,
	"note" text,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "tuition_sponsors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"userId" integer NOT NULL,
	"roleId" integer NOT NULL,
	CONSTRAINT "user_roles_userId_roleId_pk" PRIMARY KEY("userId","roleId")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"nationalCode" varchar(10) NOT NULL,
	"firstName" varchar(100) NOT NULL,
	"lastName" varchar(100) NOT NULL,
	"mobile" varchar(11),
	"email" varchar(150),
	"birthCertNo" varchar(20),
	"birthCertSeries" varchar(30),
	"placeOfBirth" varchar(150),
	"placeOfIssue" varchar(150),
	"birthDate" timestamp,
	"fatherName" varchar(100),
	"gender" varchar(10),
	"address" varchar(300),
	"passwordHash" varchar(255) NOT NULL,
	"isActive" integer DEFAULT 1,
	"mustChangePassword" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "users_nationalCode_unique" UNIQUE("nationalCode")
);
--> statement-breakpoint
CREATE TABLE "verification_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"targetId" integer NOT NULL,
	"targetType" varchar(50) NOT NULL,
	"otpCode" varchar(10) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"isUsed" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "virtual_class_recordings" (
	"id" serial PRIMARY KEY NOT NULL,
	"classroomId" integer NOT NULL,
	"sessionTitle" varchar(255) NOT NULL,
	"recordingUrl" varchar(500) NOT NULL,
	"durationMinutes" integer DEFAULT 90 NOT NULL,
	"recordedAt" timestamp DEFAULT now(),
	"viewsCount" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "virtual_classrooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseOfferingId" integer NOT NULL,
	"bbbMeetingId" varchar(100) NOT NULL,
	"meetingName" varchar(255) NOT NULL,
	"moderatorPw" varchar(50) NOT NULL,
	"attendeePw" varchar(50) NOT NULL,
	"isRunning" integer DEFAULT 0,
	"currentAttendanceCount" integer DEFAULT 0,
	"moodleCourseId" integer,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "virtual_classrooms_bbbMeetingId_unique" UNIQUE("bbbMeetingId")
);
--> statement-breakpoint
CREATE TABLE "workflow_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"requestId" integer NOT NULL,
	"processCode" varchar(50) NOT NULL,
	"eventCode" varchar(60) NOT NULL,
	"payload" text,
	"handler" varchar(60) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"firedAt" timestamp DEFAULT now(),
	"processedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "admissions_staging" ADD CONSTRAINT "admissions_staging_mappedMajorId_majors_id_fk" FOREIGN KEY ("mappedMajorId") REFERENCES "public"."majors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions_staging" ADD CONSTRAINT "admissions_staging_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions_staging" ADD CONSTRAINT "admissions_staging_degreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("degreeLevelId") REFERENCES "public"."degree_level_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD CONSTRAINT "alumni_profiles_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alumni_requests" ADD CONSTRAINT "alumni_requests_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_audit_logs" ADD CONSTRAINT "api_audit_logs_requestId_student_requests_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."student_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_audit_logs" ADD CONSTRAINT "api_audit_logs_stepId_process_steps_id_fk" FOREIGN KEY ("stepId") REFERENCES "public"."process_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_offeringId_course_offerings_id_fk" FOREIGN KEY ("offeringId") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_offeringId_course_offerings_id_fk" FOREIGN KEY ("offeringId") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_replacedSessionId_class_sessions_id_fk" FOREIGN KEY ("replacedSessionId") REFERENCES "public"."class_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_checklist" ADD CONSTRAINT "clearance_checklist_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_checklist" ADD CONSTRAINT "clearance_checklist_auditId_graduation_audits_id_fk" FOREIGN KEY ("auditId") REFERENCES "public"."graduation_audits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_professorId_staff_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_rules" ADD CONSTRAINT "course_rules_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_rules" ADD CONSTRAINT "course_rules_syllabusId_syllabuses_id_fk" FOREIGN KEY ("syllabusId") REFERENCES "public"."syllabuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_departmentId_departments_id_fk" FOREIGN KEY ("departmentId") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_facultyId_faculties_id_fk" FOREIGN KEY ("facultyId") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_sign_otps" ADD CONSTRAINT "doc_sign_otps_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_sign_otps" ADD CONSTRAINT "doc_sign_otps_documentId_electronic_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."electronic_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_documentId_electronic_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."electronic_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_categoryId_document_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."document_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "educational_regulations" ADD CONSTRAINT "educational_regulations_degreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("degreeLevelId") REFERENCES "public"."degree_level_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_contractId_professor_term_contracts_id_fk" FOREIGN KEY ("contractId") REFERENCES "public"."professor_term_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_offeringId_course_offerings_id_fk" FOREIGN KEY ("offeringId") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_questions" ADD CONSTRAINT "evaluation_questions_formId_evaluation_forms_id_fk" FOREIGN KEY ("formId") REFERENCES "public"."evaluation_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_responses" ADD CONSTRAINT "evaluation_responses_periodId_evaluation_periods_id_fk" FOREIGN KEY ("periodId") REFERENCES "public"."evaluation_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_responses" ADD CONSTRAINT "evaluation_responses_offeringId_course_offerings_id_fk" FOREIGN KEY ("offeringId") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_responses" ADD CONSTRAINT "evaluation_responses_questionId_evaluation_questions_id_fk" FOREIGN KEY ("questionId") REFERENCES "public"."evaluation_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_responses" ADD CONSTRAINT "evaluation_responses_selectedOptionId_question_options_id_fk" FOREIGN KEY ("selectedOptionId") REFERENCES "public"."question_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attendances" ADD CONSTRAINT "exam_attendances_examId_exam_sessions_id_fk" FOREIGN KEY ("examId") REFERENCES "public"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attendances" ADD CONSTRAINT "exam_attendances_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attendances" ADD CONSTRAINT "exam_attendances_verifiedByStaffId_staff_id_fk" FOREIGN KEY ("verifiedByStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_course_packets" ADD CONSTRAINT "exam_course_packets_examId_exam_sessions_id_fk" FOREIGN KEY ("examId") REFERENCES "public"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_course_packets" ADD CONSTRAINT "exam_course_packets_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_course_packets" ADD CONSTRAINT "exam_course_packets_invigilatorStaffId_staff_id_fk" FOREIGN KEY ("invigilatorStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_course_packets" ADD CONSTRAINT "exam_course_packets_receivedByVaultManagerId_staff_id_fk" FOREIGN KEY ("receivedByVaultManagerId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_invigilators" ADD CONSTRAINT "exam_invigilators_examId_exam_sessions_id_fk" FOREIGN KEY ("examId") REFERENCES "public"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_invigilators" ADD CONSTRAINT "exam_invigilators_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_minutes" ADD CONSTRAINT "exam_minutes_sessionId_exam_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_minutes" ADD CONSTRAINT "exam_minutes_hallId_exam_halls_id_fk" FOREIGN KEY ("hallId") REFERENCES "public"."exam_halls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_minutes" ADD CONSTRAINT "exam_minutes_supervisorStaffId_staff_id_fk" FOREIGN KEY ("supervisorStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_clearances" ADD CONSTRAINT "financial_clearances_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_clearances" ADD CONSTRAINT "financial_clearances_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_assignments" ADD CONSTRAINT "form_assignments_formId_evaluation_forms_id_fk" FOREIGN KEY ("formId") REFERENCES "public"."evaluation_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_assignments" ADD CONSTRAINT "form_assignments_departmentId_departments_id_fk" FOREIGN KEY ("departmentId") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_appeals" ADD CONSTRAINT "grade_appeals_enrollmentId_enrollments_id_fk" FOREIGN KEY ("enrollmentId") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_submission_otps" ADD CONSTRAINT "grade_submission_otps_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_submission_otps" ADD CONSTRAINT "grade_submission_otps_offeringId_course_offerings_id_fk" FOREIGN KEY ("offeringId") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_audits" ADD CONSTRAINT "graduation_audits_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_audits" ADD CONSTRAINT "graduation_audits_graduationTermId_academic_terms_id_fk" FOREIGN KEY ("graduationTermId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_advances" ADD CONSTRAINT "instructor_advances_instructorId_staff_id_fk" FOREIGN KEY ("instructorId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_advances" ADD CONSTRAINT "instructor_advances_approvedByFinanceId_staff_id_fk" FOREIGN KEY ("approvedByFinanceId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_attendance_days" ADD CONSTRAINT "instructor_attendance_days_instructorId_staff_id_fk" FOREIGN KEY ("instructorId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_deliveries" ADD CONSTRAINT "instructor_deliveries_instructorId_staff_id_fk" FOREIGN KEY ("instructorId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_deliveries" ADD CONSTRAINT "instructor_deliveries_vaultManagerId_staff_id_fk" FOREIGN KEY ("vaultManagerId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_deliveries" ADD CONSTRAINT "instructor_deliveries_archiveManagerId_staff_id_fk" FOREIGN KEY ("archiveManagerId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_financial_profiles" ADD CONSTRAINT "instructor_financial_profiles_instructorId_staff_id_fk" FOREIGN KEY ("instructorId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invigilators" ADD CONSTRAINT "invigilators_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invigilators" ADD CONSTRAINT "invigilators_sessionId_exam_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invigilators" ADD CONSTRAINT "invigilators_hallId_exam_halls_id_fk" FOREIGN KEY ("hallId") REFERENCES "public"."exam_halls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_degrees" ADD CONSTRAINT "issued_degrees_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_import_rows" ADD CONSTRAINT "legacy_import_rows_batchId_legacy_import_batches_id_fk" FOREIGN KEY ("batchId") REFERENCES "public"."legacy_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "majors" ADD CONSTRAINT "majors_degreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("degreeLevelId") REFERENCES "public"."degree_level_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "majors" ADD CONSTRAINT "majors_departmentId_departments_id_fk" FOREIGN KEY ("departmentId") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "majors" ADD CONSTRAINT "majors_facultyId_faculties_id_fk" FOREIGN KEY ("facultyId") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "military_service_records" ADD CONSTRAINT "military_service_records_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_professors" ADD CONSTRAINT "offering_professors_offeringId_course_offerings_id_fk" FOREIGN KEY ("offeringId") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_professors" ADD CONSTRAINT "offering_professors_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_cheques" ADD CONSTRAINT "payment_cheques_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_cheques" ADD CONSTRAINT "payment_cheques_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD CONSTRAINT "payroll_statements_contractId_professor_term_contracts_id_fk" FOREIGN KEY ("contractId") REFERENCES "public"."professor_term_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_access_logs" ADD CONSTRAINT "physical_access_logs_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_processId_process_definitions_id_fk" FOREIGN KEY ("processId") REFERENCES "public"."process_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_assigneeStaffId_staff_id_fk" FOREIGN KEY ("assigneeStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_integrationId_integrations_config_id_fk" FOREIGN KEY ("integrationId") REFERENCES "public"."integrations_config"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_transitions" ADD CONSTRAINT "process_transitions_stepId_process_steps_id_fk" FOREIGN KEY ("stepId") REFERENCES "public"."process_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_transitions" ADD CONSTRAINT "process_transitions_toStepId_process_steps_id_fk" FOREIGN KEY ("toStepId") REFERENCES "public"."process_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_availabilities" ADD CONSTRAINT "professor_availabilities_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_availabilities" ADD CONSTRAINT "professor_availabilities_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_class_attendance" ADD CONSTRAINT "professor_class_attendance_sessionId_class_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."class_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_class_attendance" ADD CONSTRAINT "professor_class_attendance_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_exam_attendance" ADD CONSTRAINT "professor_exam_attendance_offeringId_course_offerings_id_fk" FOREIGN KEY ("offeringId") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_exam_attendance" ADD CONSTRAINT "professor_exam_attendance_sessionId_exam_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_exam_attendance" ADD CONSTRAINT "professor_exam_attendance_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_term_contracts" ADD CONSTRAINT "professor_term_contracts_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_term_contracts" ADD CONSTRAINT "professor_term_contracts_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_questionId_evaluation_questions_id_fk" FOREIGN KEY ("questionId") REFERENCES "public"."evaluation_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_parallel_checkpoints" ADD CONSTRAINT "request_parallel_checkpoints_requestId_student_requests_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."student_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_parallel_checkpoints" ADD CONSTRAINT "request_parallel_checkpoints_clearedByStaffId_staff_id_fk" FOREIGN KEY ("clearedByStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_step_logs" ADD CONSTRAINT "request_step_logs_requestId_student_requests_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."student_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_step_logs" ADD CONSTRAINT "request_step_logs_stepId_process_steps_id_fk" FOREIGN KEY ("stepId") REFERENCES "public"."process_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_step_logs" ADD CONSTRAINT "request_step_logs_actorStaffId_staff_id_fk" FOREIGN KEY ("actorStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_permissions_id_fk" FOREIGN KEY ("permissionId") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanjesh_mappings" ADD CONSTRAINT "sanjesh_mappings_internalMajorId_majors_id_fk" FOREIGN KEY ("internalMajorId") REFERENCES "public"."majors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_offeringId_course_offerings_id_fk" FOREIGN KEY ("offeringId") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_roomId_classrooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_enrollmentId_enrollments_id_fk" FOREIGN KEY ("enrollmentId") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_sessionId_exam_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_hallId_exam_halls_id_fk" FOREIGN KEY ("hallId") REFERENCES "public"."exam_halls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_term_certificates" ADD CONSTRAINT "short_term_certificates_learnerId_short_term_learners_id_fk" FOREIGN KEY ("learnerId") REFERENCES "public"."short_term_learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_term_certificates" ADD CONSTRAINT "short_term_certificates_courseId_short_term_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."short_term_courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_term_certificates" ADD CONSTRAINT "short_term_certificates_registrationId_short_term_registrations_id_fk" FOREIGN KEY ("registrationId") REFERENCES "public"."short_term_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_term_discounts" ADD CONSTRAINT "short_term_discounts_courseId_short_term_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."short_term_courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_term_registrations" ADD CONSTRAINT "short_term_registrations_learnerId_short_term_learners_id_fk" FOREIGN KEY ("learnerId") REFERENCES "public"."short_term_learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_term_registrations" ADD CONSTRAINT "short_term_registrations_courseId_short_term_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."short_term_courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_departmentId_departments_id_fk" FOREIGN KEY ("departmentId") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_facultyId_faculties_id_fk" FOREIGN KEY ("facultyId") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_roleId_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_api_actions" ADD CONSTRAINT "step_api_actions_stepId_process_steps_id_fk" FOREIGN KEY ("stepId") REFERENCES "public"."process_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_api_actions" ADD CONSTRAINT "step_api_actions_integrationId_integrations_config_id_fk" FOREIGN KEY ("integrationId") REFERENCES "public"."integrations_config"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_cards" ADD CONSTRAINT "student_cards_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_class_attendance" ADD CONSTRAINT "student_class_attendance_sessionId_class_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."class_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_class_attendance" ADD CONSTRAINT "student_class_attendance_enrollmentId_enrollments_id_fk" FOREIGN KEY ("enrollmentId") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_discountTypeId_tuition_discount_types_id_fk" FOREIGN KEY ("discountTypeId") REFERENCES "public"."tuition_discount_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_approvedBy_users_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_personUserId_users_id_fk" FOREIGN KEY ("personUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_categoryId_document_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."document_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_typeId_document_types_id_fk" FOREIGN KEY ("typeId") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_id_formulas" ADD CONSTRAINT "student_id_formulas_degreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("degreeLevelId") REFERENCES "public"."degree_level_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_ledger" ADD CONSTRAINT "student_ledger_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_ledger" ADD CONSTRAINT "student_ledger_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_loans" ADD CONSTRAINT "student_loans_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_loans" ADD CONSTRAINT "student_loans_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_loans" ADD CONSTRAINT "student_loans_loanProductId_loan_products_id_fk" FOREIGN KEY ("loanProductId") REFERENCES "public"."loan_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_processId_process_definitions_id_fk" FOREIGN KEY ("processId") REFERENCES "public"."process_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_currentStepId_process_steps_id_fk" FOREIGN KEY ("currentStepId") REFERENCES "public"."process_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_relatedEnrollmentId_enrollments_id_fk" FOREIGN KEY ("relatedEnrollmentId") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sponsorships" ADD CONSTRAINT "student_sponsorships_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sponsorships" ADD CONSTRAINT "student_sponsorships_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sponsorships" ADD CONSTRAINT "student_sponsorships_sponsorId_tuition_sponsors_id_fk" FOREIGN KEY ("sponsorId") REFERENCES "public"."tuition_sponsors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_majorId_majors_id_fk" FOREIGN KEY ("majorId") REFERENCES "public"."majors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_degreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("degreeLevelId") REFERENCES "public"."degree_level_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_regulationId_educational_regulations_id_fk" FOREIGN KEY ("regulationId") REFERENCES "public"."educational_regulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_courses" ADD CONSTRAINT "syllabus_courses_syllabusId_syllabuses_id_fk" FOREIGN KEY ("syllabusId") REFERENCES "public"."syllabuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_courses" ADD CONSTRAINT "syllabus_courses_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabuses" ADD CONSTRAINT "syllabuses_majorId_majors_id_fk" FOREIGN KEY ("majorId") REFERENCES "public"."majors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_financial_rules" ADD CONSTRAINT "term_financial_rules_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_financial_rules" ADD CONSTRAINT "term_financial_rules_degreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("degreeLevelId") REFERENCES "public"."degree_level_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_snapshots" ADD CONSTRAINT "transcript_snapshots_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_snapshots" ADD CONSTRAINT "transcript_snapshots_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_compare_items" ADD CONSTRAINT "tuition_compare_items_runId_tuition_compare_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."tuition_compare_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_fee_rules" ADD CONSTRAINT "tuition_fee_rules_degreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("degreeLevelId") REFERENCES "public"."degree_level_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_formulas" ADD CONSTRAINT "tuition_formulas_degreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("degreeLevelId") REFERENCES "public"."degree_level_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_formulas" ADD CONSTRAINT "tuition_formulas_majorId_majors_id_fk" FOREIGN KEY ("majorId") REFERENCES "public"."majors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_class_recordings" ADD CONSTRAINT "virtual_class_recordings_classroomId_virtual_classrooms_id_fk" FOREIGN KEY ("classroomId") REFERENCES "public"."virtual_classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_requestId_student_requests_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."student_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "sessions_expiresAt_idx" ON "sessions" USING btree ("expiresAt");