# Git file tree — arena/01a086f2-afagh

- Commit: `59e548e98ceaa6618a12bb12b6d80ccb9092e09b`
- Files listed: all Git-tracked files at this commit.
- Excluded: `.git/`, untracked files, ignored files, and generated dependency folders not committed to Git.
- Total tracked files: **599**

```text
afagh/
├── .github/
│   └── workflows/
│       └── ci.yml
├── afagh-erp/
│   ├── public/
│   │   └── index.html
│   ├── scripts/
│   │   └── stress.js
│   ├── src/
│   │   ├── db/
│   │   │   ├── index.js
│   │   │   ├── schema.sql
│   │   │   └── seed.js
│   │   ├── engines/
│   │   │   ├── archive.js
│   │   │   ├── attendance.js
│   │   │   ├── bi.js
│   │   │   ├── directedReading.js
│   │   │   ├── enrollment.js
│   │   │   ├── exams.js
│   │   │   ├── gpa.js
│   │   │   ├── grades.js
│   │   │   ├── payroll.js
│   │   │   ├── payRules.js
│   │   │   ├── rbac.js
│   │   │   ├── regulations.js
│   │   │   ├── sakha.js
│   │   │   └── workflow.js
│   │   └── server.js
│   ├── .gitignore
│   ├── package-lock.json
│   ├── package.json
│   └── README.md
├── afagh-next/
│   ├── drizzle/
│   │   ├── meta/
│   │   │   ├── 0000_snapshot.json
│   │   │   ├── 0001_snapshot.json
│   │   │   ├── 0005_snapshot.json
│   │   │   └── _journal.json
│   │   ├── 0000_natural_mandroid.sql
│   │   ├── 0001_classy_gamora.sql
│   │   ├── 0002_curriculum_versions.sql
│   │   ├── 0003_exam_planning.sql
│   │   ├── 0004_realism.sql
│   │   ├── 0005_multitenant_samin.sql
│   │   ├── 0006_align_missing_columns.sql
│   │   ├── 0007_staff_missing_columns.sql
│   │   ├── 0008_student_sama_status.sql
│   │   ├── 0009_degree_term_count.sql
│   │   ├── 0010_role_unit_targets.sql
│   │   ├── 0011_student_term_states.sql
│   │   ├── 0012_curriculum_created_at.sql
│   │   ├── 0013_remove_student_userId_unique.sql
│   │   ├── 0014_curriculum_course_grade_status_codes.sql
│   │   ├── 0015_enroll_grade_status_code_and_change_log.sql
│   │   └── 0016_multitenant_university_id.sql
│   ├── public/
│   │   └── Afagh_ERP_Comprehensive_User_Manual.pdf
│   ├── samples/
│   │   └── legacy/
│   │       ├── 1-students.csv
│   │       ├── 2-courses.csv
│   │       ├── 3-terms.csv
│   │       ├── 4-enrollments.csv
│   │       ├── 5-ledger.csv
│   │       └── 6-clearances.csv
│   ├── scripts/
│   │   ├── lib/
│   │   │   └── secret-policy.mjs
│   │   ├── apply-patches.mjs
│   │   ├── audit-actions.mjs
│   │   ├── backup-db.mjs
│   │   ├── ci-audit.mjs
│   │   ├── cleanup-departments.mjs
│   │   ├── cleanup-regulations.mjs
│   │   ├── concurrency-test.mjs
│   │   ├── create-admin.mjs
│   │   ├── del-test-object.mjs
│   │   ├── exam-concurrency-test.mts
│   │   ├── exam-load-run.mts
│   │   ├── exam-load-seed.mjs
│   │   ├── fix-professor-names.mjs
│   │   ├── fix-student-identity.mjs
│   │   ├── fix-student-profile.mjs
│   │   ├── fix-student-status.mjs
│   │   ├── gen-permissions-sql.mjs
│   │   ├── hardening.mjs
│   │   ├── import-legacy-data.mjs
│   │   ├── import-professors2.mjs
│   │   ├── import-sama-afagh.mjs
│   │   ├── import-university.mjs
│   │   ├── load-test-run.mts
│   │   ├── load-test-seed.mjs
│   │   ├── migrate-db.mjs
│   │   ├── migrate-sqlite-to-pg.mjs
│   │   ├── recompute-grade-status.mjs
│   │   ├── rls-test.mjs
│   │   ├── scheduling-load-run.mts
│   │   ├── scheduling-seed.mjs
│   │   ├── seed-base.mjs
│   │   ├── seed-permissions.mjs
│   │   ├── seed-permissions.sql
│   │   ├── start-minio.sh
│   │   ├── update_profs_rank.mjs
│   │   ├── verify-audit.ts
│   │   ├── verify-backup.mjs
│   │   ├── waiting-room-zset.test.mts
│   │   └── warm-redis.mjs
│   ├── src/
│   │   ├── app/
│   │   │   ├── admin/
│   │   │   │   ├── admissions/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── AdmissionsClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── archive/
│   │   │   │   │   ├── ArchiveClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── bi/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── BiRefreshButtons.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── codes/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── CodesClient.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── tables.ts
│   │   │   │   ├── curriculum/
│   │   │   │   │   ├── actions/
│   │   │   │   │   │   ├── courses.ts
│   │   │   │   │   │   ├── lifecycle.ts
│   │   │   │   │   │   ├── read.ts
│   │   │   │   │   │   ├── rules.ts
│   │   │   │   │   │   ├── shared.ts
│   │   │   │   │   │   └── versions.ts
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── AddCourseModal.tsx
│   │   │   │   │   │   ├── CatalogTab.tsx
│   │   │   │   │   │   ├── CourseRulesModal.tsx
│   │   │   │   │   │   ├── CoursesTab.tsx
│   │   │   │   │   │   ├── CurriculumHeader.tsx
│   │   │   │   │   │   ├── CurriculumShell.tsx
│   │   │   │   │   │   ├── CurriculumTabsBar.tsx
│   │   │   │   │   │   ├── CurriculumToast.tsx
│   │   │   │   │   │   ├── DetailHeaderBar.tsx
│   │   │   │   │   │   ├── NewCourseModal.tsx
│   │   │   │   │   │   ├── NewVersionModal.tsx
│   │   │   │   │   │   ├── RejectModal.tsx
│   │   │   │   │   │   ├── RoleTargetsEditor.tsx
│   │   │   │   │   │   ├── SemestersTab.tsx
│   │   │   │   │   │   ├── TransferTab.tsx
│   │   │   │   │   │   ├── VerifyTab.tsx
│   │   │   │   │   │   └── VersionDetailPanel.tsx
│   │   │   │   │   ├── curriculum-context.ts
│   │   │   │   │   ├── curriculum-core.ts
│   │   │   │   │   ├── CurriculumManagerClient.tsx
│   │   │   │   │   ├── CurriculumProvider.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── types.ts
│   │   │   │   ├── departments/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── DepartmentsClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── exams/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── ExamPlanningClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── finance/
│   │   │   │   │   ├── rules/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   └── RulesClient.tsx
│   │   │   │   │   ├── student/
│   │   │   │   │   │   └── [id]/
│   │   │   │   │   │       ├── FinanceStudentClient.tsx
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── FinanceTable.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── grades/
│   │   │   │   │   └── actions.ts
│   │   │   │   ├── graduation/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── GraduationClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── migration/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── BatchesTab.tsx
│   │   │   │   │   ├── CodeMapTab.tsx
│   │   │   │   │   ├── GradesTab.tsx
│   │   │   │   │   ├── MigrationClient.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── PhotosTab.tsx
│   │   │   │   │   ├── TuitionTab.tsx
│   │   │   │   │   └── ui.tsx
│   │   │   │   ├── offerings/
│   │   │   │   │   ├── OfferingsClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── payroll/
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── BankDisketteTab.tsx
│   │   │   │   │   │   ├── BaseRatesTab.tsx
│   │   │   │   │   │   ├── BiometricChainTab.tsx
│   │   │   │   │   │   ├── ContractsTab.tsx
│   │   │   │   │   │   ├── ElectronicDecreesTab.tsx
│   │   │   │   │   │   ├── ExamAggregationTab.tsx
│   │   │   │   │   │   ├── InsuranceAdvancesTab.tsx
│   │   │   │   │   │   ├── MultipliersTab.tsx
│   │   │   │   │   │   └── StatementsCartableTab.tsx
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── LivePayrollClient.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── payrollData.ts
│   │   │   │   │   ├── PayrollEngineClient.tsx
│   │   │   │   │   └── payrollReducer.ts
│   │   │   │   ├── permissions/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── AdminPermissionsClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── regulations/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── RegulationsClient.tsx
│   │   │   │   ├── reports/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── ReportsClient.tsx
│   │   │   │   ├── samin/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── SaminClient.tsx
│   │   │   │   ├── scheduling/
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── ApprovedTab.tsx
│   │   │   │   │   │   ├── CurriculumAssignTab.tsx
│   │   │   │   │   │   ├── DeptRoomsTab.tsx
│   │   │   │   │   │   ├── PlanningHeader.tsx
│   │   │   │   │   │   ├── PlanningShell.tsx
│   │   │   │   │   │   ├── PlanningTabsBar.tsx
│   │   │   │   │   │   ├── PlanningToast.tsx
│   │   │   │   │   │   ├── ProfAvailabilityModal.tsx
│   │   │   │   │   │   ├── ProfessorQuotasTab.tsx
│   │   │   │   │   │   ├── ProfessorSelect.tsx
│   │   │   │   │   │   ├── SmartAssignTab.tsx
│   │   │   │   │   │   ├── TermCalendarTab.tsx
│   │   │   │   │   │   └── WeeklyMatrixTab.tsx
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── DepartmentPlanningClient.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── planning-core.ts
│   │   │   │   │   ├── PlanningProvider.tsx
│   │   │   │   │   └── types.ts
│   │   │   │   ├── settings/
│   │   │   │   │   ├── backup-actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── SettingsClient.tsx
│   │   │   │   ├── short-courses/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── AdminShortCoursesClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── staff/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── StaffTable.tsx
│   │   │   │   ├── student-cards/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── StudentCardsClient.tsx
│   │   │   │   ├── student-finance/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── students/
│   │   │   │   │   ├── components/
│   │   │   │   │   │   └── OfficialTranscriptView.tsx
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── StudentsManagerClient.tsx
│   │   │   │   │   ├── transcript-utils.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── templates/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── TemplateEngineClient.tsx
│   │   │   │   ├── tuition/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── TuitionRulesClient.tsx
│   │   │   │   ├── universities/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── UniversitiesClient.tsx
│   │   │   │   ├── workflows/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── AdminWorkflowsClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── actions.ts
│   │   │   │   ├── AdminMakeupRequestsCard.tsx
│   │   │   │   ├── AdminNav.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   └── RequestActionButtons.tsx
│   │   │   ├── alumni/
│   │   │   │   ├── actions.ts
│   │   │   │   ├── AlumniClient.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── api/
│   │   │   │   ├── admin/
│   │   │   │   │   ├── archive/
│   │   │   │   │   │   ├── upload/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── verify/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   ├── migration/
│   │   │   │   │   │   ├── codemaps/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── commit/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── dry-run/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── export/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── import/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── inspect/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── photos/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── runs/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── template/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   └── redis-warmup/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── archive/
│   │   │   │   │   └── [docId]/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── bale/
│   │   │   │   │   └── webhook/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── cron/
│   │   │   │   │   ├── bi-refresh/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── cheque-reminders/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── graduation-scan/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── workflow-events/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── eitaa/
│   │   │   │   │   └── webhook/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── enroll/
│   │   │   │   │   └── live-capacity/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── igap/
│   │   │   │   │   └── webhook/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── photo/
│   │   │   │   │   └── [userId]/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── soroush/
│   │   │   │   │   └── webhook/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── telegram/
│   │   │   │   │   └── webhook/
│   │   │   │   │       └── route.ts
│   │   │   │   └── waiting-room/
│   │   │   │       └── status/
│   │   │   │           └── route.ts
│   │   │   ├── change-password/
│   │   │   │   └── page.tsx
│   │   │   ├── exam-ticket/
│   │   │   │   └── [token]/
│   │   │   │       └── page.tsx
│   │   │   ├── group-manager/
│   │   │   │   ├── classrooms/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── courses/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── equivalence/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── EquivalenceMapperClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── no-dept/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── offerings/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── DeptSwitcher.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── id/
│   │   │   │   ├── [token]/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── actions.ts
│   │   │   │   └── page.tsx
│   │   │   ├── login/
│   │   │   │   ├── actions.ts
│   │   │   │   ├── page.tsx
│   │   │   │   └── roles.ts
│   │   │   ├── manual/
│   │   │   │   └── page.tsx
│   │   │   ├── open-courses/
│   │   │   │   ├── actions.ts
│   │   │   │   ├── OpenCoursesClient.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── proctor/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   └── ProctorExamAttendanceClient.tsx
│   │   │   ├── professor/
│   │   │   │   ├── attendance/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── ProfessorAttendanceClient.tsx
│   │   │   │   ├── availability/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── ProfessorAvailabilityClient.tsx
│   │   │   │   ├── contract/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── ProfessorContractClient.tsx
│   │   │   │   ├── documents/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── evaluation/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── grades/
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── AnalyticsTab.tsx
│   │   │   │   │   │   ├── AppealsTab.tsx
│   │   │   │   │   │   ├── CertificateTab.tsx
│   │   │   │   │   │   ├── RosterTab.tsx
│   │   │   │   │   │   └── RubricTab.tsx
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── grades-core.ts
│   │   │   │   │   ├── gradesReducer.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── ProfessorGradesClient.tsx
│   │   │   │   │   └── types.ts
│   │   │   │   ├── performance/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── schedule/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── ProfessorScheduleClient.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── student/
│   │   │   │   ├── chart/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── documents/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── enroll/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── EnrollClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── exam-card/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── ExamCardClient.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── finance/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── graduation/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── TrackerClient.tsx
│   │   │   │   ├── requests/
│   │   │   │   │   ├── actions.ts
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── StudentRequestsClient.tsx
│   │   │   │   ├── schedule/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── ScheduleClient.tsx
│   │   │   │   ├── transcript/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── virtual-classes/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── actions.ts
│   │   │   │   ├── DropButton.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── PrintButton.tsx
│   │   │   │   └── StudentNav.tsx
│   │   │   ├── verify/
│   │   │   │   ├── [code]/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── document/
│   │   │   │   │   └── [hash]/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── search/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── verify-certificate/
│   │   │   │   ├── [code]/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── actions.ts
│   │   │   │   ├── page.tsx
│   │   │   │   └── VerifyCertificateClient.tsx
│   │   │   ├── verify-degree/
│   │   │   │   ├── [code]/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── search/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── error.tsx
│   │   │   ├── global-error.tsx
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   ├── not-found.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── DataTable.tsx
│   │   │   ├── ElectronicSignature.tsx
│   │   │   ├── PrintButton.tsx
│   │   │   └── VirtualClassroomWidget.tsx
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   ├── patches.sql
│   │   │   ├── pg-hardening.sql
│   │   │   ├── pool-errors.ts
│   │   │   └── schema.ts
│   │   ├── lib/
│   │   │   ├── migration/
│   │   │   │   ├── audit.ts
│   │   │   │   ├── batches.ts
│   │   │   │   ├── codemap.ts
│   │   │   │   ├── course-row.ts
│   │   │   │   ├── engine.ts
│   │   │   │   ├── fields.ts
│   │   │   │   ├── grades.ts
│   │   │   │   ├── http.ts
│   │   │   │   ├── normalize.ts
│   │   │   │   ├── photo-match.ts
│   │   │   │   ├── photos.ts
│   │   │   │   ├── reference-rows.ts
│   │   │   │   ├── tabular.ts
│   │   │   │   ├── tuition.ts
│   │   │   │   ├── workbook.ts
│   │   │   │   └── xlsx.ts
│   │   │   ├── samin/
│   │   │   │   ├── client.ts
│   │   │   │   ├── crypto.ts
│   │   │   │   └── samin-mapper.ts
│   │   │   ├── admin-modules.ts
│   │   │   ├── admissions-engine.ts
│   │   │   ├── alumni.ts
│   │   │   ├── api-integrations.ts
│   │   │   ├── audit-chain.ts
│   │   │   ├── audit-core.ts
│   │   │   ├── audit-writer.ts
│   │   │   ├── audit.ts
│   │   │   ├── auth.ts
│   │   │   ├── bank-roles.ts
│   │   │   ├── base-data.ts
│   │   │   ├── bi-engine.ts
│   │   │   ├── calendar.ts
│   │   │   ├── certificate-engine.ts
│   │   │   ├── class-session-generator.ts
│   │   │   ├── contract-engine.ts
│   │   │   ├── curriculum-apply.ts
│   │   │   ├── curriculum-resolution.ts
│   │   │   ├── curriculum-types.ts
│   │   │   ├── curriculum-validator.ts
│   │   │   ├── demo-grades-seed.ts
│   │   │   ├── enroll-engine.ts
│   │   │   ├── enrollment-window.ts
│   │   │   ├── equivalence-form.ts
│   │   │   ├── exam-actions.ts
│   │   │   ├── exam-core.ts
│   │   │   ├── exam-engine.ts
│   │   │   ├── exam-planning.ts
│   │   │   ├── exam-scheduler.ts
│   │   │   ├── executive-analytics.ts
│   │   │   ├── finance-engine.ts
│   │   │   ├── finance-rules.ts
│   │   │   ├── grade-change-log.ts
│   │   │   ├── grade-status-codes.ts
│   │   │   ├── grade-utils.ts
│   │   │   ├── graduation-engine.ts
│   │   │   ├── group-manager.ts
│   │   │   ├── logger.ts
│   │   │   ├── messaging.ts
│   │   │   ├── messenger-bot.ts
│   │   │   ├── money.ts
│   │   │   ├── moodle-bbb-actions.ts
│   │   │   ├── moodle-bbb.ts
│   │   │   ├── objectStore.ts
│   │   │   ├── offering-targeting.ts
│   │   │   ├── payroll-engine.ts
│   │   │   ├── permissions-catalog.json
│   │   │   ├── permissions-catalog.ts
│   │   │   ├── persian-search.ts
│   │   │   ├── professor-performance.ts
│   │   │   ├── proxy-trust.ts
│   │   │   ├── qr.ts
│   │   │   ├── rateLimit.ts
│   │   │   ├── regulations-engine.ts
│   │   │   ├── regulations-types.ts
│   │   │   ├── request-context.ts
│   │   │   ├── resolve-sama-code.ts
│   │   │   ├── scheduling-core.ts
│   │   │   ├── scheduling-engine.ts
│   │   │   ├── scheduling-health.ts
│   │   │   ├── secret-guard.ts
│   │   │   ├── security.ts
│   │   │   ├── settings-actions.ts
│   │   │   ├── settings-shared.ts
│   │   │   ├── settings.ts
│   │   │   ├── shamsi.ts
│   │   │   ├── student-labels.ts
│   │   │   ├── telegram-bot.ts
│   │   │   ├── telegram-notifications.ts
│   │   │   ├── term-plan.ts
│   │   │   ├── tuition-engine.ts
│   │   │   ├── tuition-rules.ts
│   │   │   ├── uploader.ts
│   │   │   ├── verification.ts
│   │   │   ├── waitingRoom.ts
│   │   │   ├── workflow-analytics.ts
│   │   │   ├── workflow-engine.ts
│   │   │   ├── workflow-events.ts
│   │   │   └── workflow-handlers.ts
│   │   └── proxy.ts
│   ├── tests/
│   │   ├── bank-roles.test.ts
│   │   ├── curriculum-core.test.ts
│   │   ├── curriculum-domain.test.ts
│   │   ├── curriculum-ui-render.test.tsx
│   │   ├── curriculum-validator.test.ts
│   │   ├── exam-core.test.ts
│   │   ├── exam-scheduler.test.ts
│   │   ├── finance-rules.test.ts
│   │   ├── grades-reducer.test.ts
│   │   ├── migration-codes.test.ts
│   │   ├── migration-course.test.ts
│   │   ├── migration-photos.test.ts
│   │   ├── migration-real-headers.test.ts
│   │   ├── migration-reference.test.ts
│   │   ├── persian-search.test.ts
│   │   ├── release-hardening.test.ts
│   │   ├── scheduling-core.test.ts
│   │   ├── scheduling-planning-core.test.ts
│   │   ├── term-plan.test.ts
│   │   ├── transcript-summary.test.ts
│   │   └── tuition-rules.test.ts
│   ├── .dockerignore
│   ├── .env.example
│   ├── .gitignore
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── drizzle.config.ts
│   ├── next-env.d.ts
│   ├── next.config.mjs
│   ├── package-lock.json
│   ├── package.json
│   ├── postcss.config.js
│   ├── README.md
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── update.cmd
│   ├── update.ps1
│   ├── بازبینی-کد-کلیدی-دور۵.md
│   ├── گزارش-تست-امتحانات-۱۴۰۵.md
│   ├── گزارش-تست-بار-۱۴۰۵.md
│   └── گزارش-تست-برنامهریزی-درسی-۱۴۰۵.md
├── caddy/
│   └── Caddyfile
├── deploy/
│   ├── ci-release-gate.patch
│   ├── import-sama.sh
│   └── scheduler.sh
├── docs/
│   ├── design/
│   │   ├── CURRICULUM-SCHEDULING-DESIGN-V1.md
│   │   ├── ENGINEERING-REVIEW-ALL-MODULES.md
│   │   ├── ERD-TARGET.png
│   │   ├── ERD-TARGET.svg
│   │   └── SCHEDULING-CHAIN-AUDIT.md
│   ├── images/
│   │   ├── screenshot_10_regulations_control_center.png
│   │   ├── screenshot_1_dashboard_ops.png
│   │   ├── screenshot_2_student_requests.png
│   │   ├── screenshot_3_irandoc_api.png
│   │   ├── screenshot_4_sanjesh_formula.png
│   │   ├── screenshot_5_rbac_matrix.png
│   │   ├── screenshot_6_virtual_classroom.png
│   │   ├── screenshot_7_professor_portal.png
│   │   ├── screenshot_8_curriculum_scheduling.png
│   │   └── screenshot_9_student_enroll_transcript.png
│   ├── Afagh_ERP_Comprehensive_User_Manual.pdf
│   ├── BI.md
│   ├── GRADUATION.md
│   ├── MIGRATION.md
│   ├── PAYROLL.md
│   ├── REGULATIONS.md
│   ├── RELEASE-READINESS.md
│   ├── USER_MANUAL.md
│   ├── VERIFICATION.md
│   └── WORKFLOW.md
├── scripts/
│   ├── ensure-build-memory.sh
│   ├── generate_pdf_manual.py
│   ├── generate_screenshots.py
│   └── update-permissions.sh
├── .env.prod.example
├── .gitattributes
├── .gitignore
├── afagh.cmd
├── afagh.ps1
├── Afagh_ERP_Comprehensive_User_Manual.pdf
├── deploy-debian.sh
├── docker-compose.https.yml
├── docker-compose.yml
├── install-docker.ps1
├── install-docker.sh
├── INSTALL.md
├── install.sh
├── Makefile
├── README.md
├── RUN-WINDOWS.md
├── start.ps1
├── start.sh
├── status.sh
├── stop-docker.ps1
├── stop.sh
├── update.cmd
├── update.ps1
├── USER_MANUAL.md
├── اعمال-تغییرات-روی-سرور.md
├── بازیابی-نهایی-گیت.md
├── بروزرسانی-سرور-ماتریس-دسترسی.md
├── بروزرسانی-سرور-یک-دستور.md
├── جمعبندی-امروز-و-ادامه-طراحی.md
├── معماری-ERP-بررسی-کد.md
├── گزارش-اصلاحات-P0.md
├── گزارش-بازبینی-دور۹-سبزسازی-CI.md
├── گزارش-بازبینی-دوم.md
├── گزارش-بازبینی-سوم.md
├── گزارش-بازبینی-نهایی.md
├── گزارش-بازبینی-چهارم.md
├── گزارش-دور7-اجرا-و-فیکس-پرونده.md
├── گزارش-دور8-رفاکتور-فرانت-حجیم.md
├── گزارش-دور۱۰-شکستن-مگاکامپوننت-برنامه-ریزی.md
├── گزارش-دور۱۱-شکستن-پنل-دانشجویان.md
├── گزارش-دور۱۲-شکستن-پنل-برنامه-درسی.md
├── گزارش-دور۱۳-مرتب‌سازی-اکشن‌های-برنامه-درسی.md
├── گزارش-دور۱۴-ریلیز-هارتنینگ.md
├── گزارش-رفع-ریسک‌های-باز.md
├── گزارش-مقایسه-شاخه-01a05c13.md
└── گزارش-مهندسی-آمادگی-پروداکشن.md
```

Generated with: `git ls-tree -r --name-only 59e548e98ceaa6618a12bb12b6d80ccb9092e09b`
