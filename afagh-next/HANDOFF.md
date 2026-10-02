# HANDOFF — afagh-next · 4 features from SAMA + Registration guides

**Date:** 2026-10-02
**Project:** `C:\Users\z\Documents\afagh\afagh-next` (Next.js 14 + PostgreSQL + Drizzle)
**Purpose:** pick this up in a fresh session, or deploy it to a server.

---

## 0. READ THIS FIRST — two hard blockers

### 0.1 Nothing here has been compiled or executed

`node`, `npm` and `node_modules` are **not installed** on the machine where this work was done.
Consequently `npm run typecheck`, `npm run build`, `drizzle-kit` and every SQL query were **impossible**.

All fixes were made by careful source reading and cross-checking against
`drizzle/0000_natural_m-android.sql`, `src/db/schema.ts`, `src/db/patches.sql` and `src/lib/workflow-engine.ts`.
**Treat the whole changeset as unverified until you run the build.**

### 0.2 This directory is not a git repo

`git` **is** available (2.55.0) but there is no `.git`. Nothing is committed. Nothing is backed up.
Run `git init` before you start, or you have no undo.

---

## 1. What the previous session claimed vs what was true

The previous session wrote a summary file and memory notes asserting all four features were complete.
**Those claims were largely false.** Verified by a full read of the code:

| Feature | Claimed | Actual state found |
|---|---|---|
| Emergency drop | done | **real** — worked |
| 3rd attempt report | done | **partly broken** — faculty filter was a no-op, major filter absent |
| Major change | done | **migration could not execute** — referenced columns that don't exist |
| Proposal / thesis | "fully automated" | **3 compile errors, zero UI, zero callers** |

The prior notes were written from intent, not from reading the diff. If you are extending that work,
do not trust `IMPROVEMENTS_SUMMARY.txt` — it is inaccurate.

---

## 2. The 6 critical bugs found, and their fixes

### 2.1 `0040` created lowercased columns — broke every query and policy

**File:** `drizzle/0040_thesis_progress_tracking.sql`

Every camelCase identifier was unquoted. PostgreSQL folds unquoted identifiers to lowercase, so
`studentId integer NOT NULL` created a column literally named `studentid`.
Every Drizzle query and every RLS policy (which uses quoted `"studentId"`) would have failed with
`column "studentId" does not exist`.

The rest of this repo always quotes camelCase — e.g. `drizzle/0000_natural_mandroid.sql`
(`"termCode" varchar(10)`) and `drizzle/0037_...sql` (`"emergencyWithdrawal"`).

**Fix:** all identifiers double-quoted (94 of them). Also added what `schema.ts` declared but the SQL
never created:
- `uq_thesis_progress_audit` UNIQUE (`"auditId"`)
- `uq_thesis_report_period` UNIQUE (`"thesisProgressId"`,`"reportPeriodStart"`,`"reportPeriodEnd"`)
- `uq_defense_session_progress` UNIQUE (`"thesisProgressId"`)
- `idx_irandoc_logs_student_type`

### 2.2 `0038` + `0039` could not execute, and blocked `0040`

**Files:** `drizzle/0038_major_change_process.sql`, `drizzle/0039_proposal_tracking_process.sql`

They referenced 5 columns that exist nowhere:

| Referenced | Reality |
|---|---|
| `process_steps.code` | does not exist |
| `process_steps.assignedRole` | real column is `roleCode` |
| `process_transitions.processId` | does not exist |
| `process_transitions.condition` | does not exist |
| `process_definitions.startStepId` | does not exist |

Because both were registered in `drizzle/meta/_journal.json`, `npm run db:migrate` would abort at
`0038` — which also prevents `0039` and `0040` from ever running.

**Fix:** both rewritten against the real DDL.
- `roleCode` instead of `assignedRole`; no `code` column on `process_steps`.
- Idempotent `DO $$ ... IF NOT EXISTS (SELECT 1 FROM process_steps WHERE "processId"=... AND "stepOrder"=N) $$`.
  Needed because there is no unique index on `(processId, stepOrder)` to hang `ON CONFLICT` on.
- **Deleted** the entire `process_transitions` block — it is dead code. `src/lib/workflow-engine.ts`
  advances purely by `stepOrder` and never reads `process_transitions`.
- **Deleted** the `startStepId` UPDATE.
- Kept `ON CONFLICT (code) DO NOTHING` on `process_definitions` — verified
  `process_definitions_code_unique` exists at `0000_natural_mandroid.sql:984`.
- `MAJOR_CHANGE` = 3 steps (SUBMIT/DEPT_HEAD_REVIEW/EDU_EXPERT_APPROVE).
- `PROPOSAL_TRACKING` = 4 steps (SUBMIT/SUPERVISOR_APPROVE/PROPOSAL_COMMITTEE/FINAL_APPROVE).
  The SUBMIT step must stay as step 1 — `submitStudentRequest` sets `currentStepId = steps[0]`.

### 2.3 Three compile errors in the graduation engine

**File:** `src/lib/graduation-engine.ts`

- `classrooms.isActive` — **no such column**. Real `classrooms` columns are
  `id, name, capacity, roomType, buildingName, rowsCount, colsCount, facultyId, universityId`.
  `expertScheduleDefense` used it to auto-pick a room. Rewritten to resolve the room from
  `defense_jury_pools.roomId` first, then fall back to a capacity-ordered classroom in the student's
  faculty, then any classroom, then `null` + a warning log. No schema change needed.
- `await db.insert({ thesis_progress: thesis_progress })` — Drizzle `insert()` takes a table, not an
  object literal. Now `db.insert(thesis_progress)`.
- `await db.insert({ defense_sessions: defense_sessions })` — same. Now `db.insert(defense_sessions)`.
- A stray no-op statement (`defense_jury_pools, classrooms` as a comma expression) was left behind by
  an earlier botched dynamic-import removal. Deleted.

### 2.4 Duplicate-row bug in `submitThesisTitleAndSupervisor`

It INSERTed a whole new `thesis_progress` row just to write the Irandoc prior-check fields, relying
on `.onConflictDoNothing()`. Since `0040` never created `uq_thesis_progress_audit`, the conflict
never fired → duplicate rows → `getOrCreateThesisProgress`'s `.limit(1)` became non-deterministic.

**Fix:** the fields were merged into the single existing UPDATE; the redundant INSERT deleted.

### 2.5 Five RLS policies were permanently false

**File:** `src/db/pg-hardening.sql`

```sql
USING (current_setting('app.user_role', true) IN ('ADMIN','EDU_EXPERT','GRADUATION_EXPERT'));
```

`app.user_role` is **never set anywhere in the app**. Only `app.user_id` (`src/db/index.ts:102,131`,
inside `withUserRls`) and `app.university_id` (`src/app/admin/exams/actions.ts:26`) exist.
`current_setting(...,true)` returns NULL when unset → `NULL IN (...)` → NULL → policy always false.
Admins and experts read **zero rows** from all five thesis tables.

**Fix:** replaced with a role lookup driven by `app.user_id`, matching the app's own chain
(`users → user_roles.userId → roles.code`, see `src/lib/auth.ts:78-88`):

```sql
USING (EXISTS (SELECT 1 FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."roleId"
        WHERE ur."userId" = nullif(current_setting('app.user_id', true), '')::int
          AND r."code" IN ('ADMIN', 'EDU_EXPERT', 'GRADUATION_EXPERT')));
```

Safe: `user_roles`' own policy is exactly `"userId" = app.user_id`, so the subquery can only ever see
the caller's own role rows — no infinite recursion. Unset `app.user_id` → fail-closed.

### 2.6 `optionsEndpoint` was declared but implemented nowhere

**Files:** `src/app/student/requests/StudentRequestsClient.tsx` + 3 API routes

`0038`/`0039` declared select fields with `"optionsEndpoint": "/api/admin/majors/active"` and
`/api/admin/terms/current`. Grep found **zero** implementations in `src/`. `FormFieldSchema`
(`src/lib/workflow-engine.ts:418-427`) has no such property, and the renderer only reads
`field.options`.

Net effect: both selects were `required: true` with zero options → browser constraint validation
blocked submit → **the MAJOR_CHANGE form could never be submitted** → `MAJOR_CHANGE_APPLY` could
never fire → `students.majorId` was never actually updated.

**Fix:**
- `StudentRequestsClient.tsx` now fetches remote options in a `useEffect`, with `AbortController`,
  an `alive` guard against post-unmount writes, a stable string dependency (`endpointsKey`) so it
  cannot loop, grouping of fields sharing one endpoint, loading/error/retry states, and a submit
  guard that blocks while a required remote select is not ready. The static-`options` path is
  unchanged. Local type `DynField = FormFieldSchema & { optionsEndpoint?: string; multiple?: boolean }`
  avoids touching `workflow-engine.ts`.
- `majors/active` and `terms/current` now return `{ id, value, label, ... }` and are university-scoped
  via `getCurrentUniversity()` from **`@/lib/university-scope`** (not `@/lib/auth`).
- `staff/supervisors` returned **all active staff, not professors**. Now filters to real faculty
  (OR of `academicRank IS NOT NULL`, `staffType IN (...)`, and an `EXISTS` on the `PROFESSOR` role),
  and joins `departments` for a readable label.

---

## 3. The 6 new UI files

The 11 thesis functions in `graduation-engine.ts` had **zero callers anywhere** in the project —
they were unreachable. These are their first callers.

| File | Purpose |
|---|---|
| `src/app/student/thesis-proposal/page.tsx` | Loads the student's own audit, shows phase + timeline |
| `src/app/student/thesis-proposal/actions.ts` | 7 server actions |
| `src/app/student/thesis-proposal/ThesisProposalClient.tsx` | Phase 1/2/3 forms + 9-step timeline |
| `src/app/admin/defense-scheduling/page.tsx` | Defense workbench |
| `src/app/admin/defense-scheduling/actions.ts` | approve / schedule / record-result / jury-pool CRUD |
| `src/app/admin/defense-scheduling/DefenseSchedulingClient.tsx` | Board + jury-pool manager |

Routes: `/student/thesis-proposal` and `/admin/defense-scheduling`.

**Ownership scoping:** no action accepts an `auditId` at all. `ownAudit()` resolves it via
`requireRole(['STUDENT'])` → `getStudentByUser()` → filtered by `graduation_audits.studentId = me.id`,
independently enforced by the RLS policy. `fileId` is re-validated against
`student_documents.personUserId`.

**Upload:** reuses the existing `POST /api/admin/archive/upload` route (same pattern as the photo
flow). `docId` becomes the engine's `fileId`, exactly as `setFinalPhoto` does.

### Known gaps in the new UI — deliberately left, decide before shipping
- **No nav links.** `StudentNav.tsx` / `lib/admin-modules.ts` were out of scope. Both pages are
  URL-only right now.
- **`supervisorApproveDefense` is unreachable for a pure PROFESSOR.** `src/app/admin/layout.tsx:9`
  does not list `PROFESSOR` or `GRADUATION_EXPERT` in `requireRole`, so a professor-only account is
  redirected away from `/admin/*`. Needs an edit to `layout.tsx`.
- **No university scoping** on the defense board, because `expertScheduleDefense` itself ignores
  `universityId` — filtering the UI would make the pool preview disagree with real behaviour.
- **Scheduling has no room/jury inputs** — `expertScheduleDefense({ auditId, expertId, scheduledAt })`
  auto-picks from `defense_jury_pools`. The UI shows a read-only preview instead of faking inputs.
- **`proposalStatus = 'REJECTED'` is terminal** — the engine exposes no reject/resubmit function.
- **`getThesisProgress` creates the row on first read**, so merely loading the page inserts a
  `thesis_progress` row.

---

## 4. Third-attempt report rewrite

**Files:** `src/app/admin/reports/actions.ts`, `ReportsClient.tsx`

Two real bugs, both making the report return nothing:

1. **Wrong column in HAVING.** `e."gradeStatus" IN ('REGISTERED','PENDING_COUNCIL','WAITLISTED')`
   compared a *grade* status against *enrollment* status literals. Those three are values of
   `enrollments.status`; `gradeStatus` only ever holds
   `PENDING/DRAFT/TEMPORARY/FINALIZED/EXEMPT/PASSED_NO_GRADE/FAILED_NO_GRADE/DROPPED`.
   The condition could never be true. Now `ce."status" IN (...)`.
2. **Term clipped the history.** The `>= 2` failed-attempt count was scoped to a single term, but
   `enrollments` is unique on `(studentId, offeringId)` and `course_offerings` has no unique
   constraint on `(courseId, termId)` — so 2 failures within one term is near-impossible. Since the
   UI defaults to the latest term, the report returned 0 rows out of the box.

**Approach:** a `JOIN LATERAL` per-`(student, course)` aggregate. A CTE was rejected because
`paged()` builds its count as `SELECT COUNT(*)::int FROM (SELECT 1 ${baseFrom} ...) t`, which cannot
hold a leading `WITH`. `last_grade` switched from `MAX(...)` (which becomes best-ever grade over
history) to `ARRAY_AGG(... ORDER BY sortOrder DESC, termCode DESC, offeringId DESC)[1]`.

Also: real `facultyId`/`majorId` filters via the existing `studentWhere(f)` helper (which now also
brings `degreeId`, `entryYear` and `q` into effect for free), `third-attempt` added to the major-select
render condition, and real pagination instead of hardcoded `totalPages: 1`.

---

## 5. Journal and hardening

- **`drizzle/meta/_journal.json`** — registered `0037`–`0040` as idx 34–37. Was ending at
  `0036_reference_ministry_codes`, so the four files were orphans that `drizzle-kit migrate` would
  never have executed. Now 38 entries, `when` values strictly increasing, idx contiguous 0..37.
- **`scripts/hardening.mjs`** — added the 5 thesis tables to `RLS_TABLES`, and `chairId` to the
  coverage-column list. Without this, `defense_jury_pools` was validated by **neither** hardening
  gate (no `studentId`; `chairId`/`internalIds`/`externalIds` were not in the coverage list), so an
  RLS regression would have shipped green.

---

## 6. Deploy checklist

```bash
# 0. BACK UP FIRST. There is no git history here.
git init && git add -A && git commit -m "wip: 4 guide features, pre-verification"

# 1. Toolchain
node -v && npm -v

# 2. Dependencies
npm ci          # or npm install

# 3. THE IMPORTANT ONE — nothing below has ever been run
npm run typecheck
npm run build

# 4. Database
npm run db:migrate      # applies 0037-0040 (was previously impossible)
npm run db:permissions  # re-seed role permissions
npm run db:hardening    # applies the new RLS policies

# 5. Smoke-test by URL (no nav links were added)
#    /student/thesis-proposal
#    /admin/defense-scheduling
```

`npm run db:migrate` is the step that will surface anything still wrong — it is the first time
`0038`/`0039`/`0040` have ever actually executed.

---

## 7. Open items — decide before shipping

### 7.1 Three orphan migrations (NOT touched, on purpose)

`drizzle/0028_enroll_original_sama_code.sql`, `drizzle/0033_entry_date_students.sql`,
`drizzle/0034_graduate_degree_level.sql` exist but are absent from the journal.

They were left alone because `when` is load-bearing, not cosmetic:
`scripts/migrate-db.mjs:118-125` hard-fails with exit 5 unless
`count(*) == journal.length`. Inserting them at their chronological position with historical
timestamps makes drizzle silently skip them on any already-migrated DB → count mismatch → deploy
stops. Appending at idx 38-40 with fresh timestamps runs them but fabricates the chronology.

First, in **every** environment (dev + prod):

```sql
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_name IN ('students','enrollments')
   AND column_name IN ('entryDate','graduateDegreeLevelId','originalSamaCode');
SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 3;
```

`0028` (`originalSamaCode`) looks already applied by hand —
`scripts/migrate-original-code.mjs:8-14` does the same DDL plus a backfill, and live code reads the
column. `0033` (`entryDate`) and `0034` (`graduateDegreeLevelId`) status is **unknown** — both are
declared in `schema.ts` and `0034`'s field is rendered at `OfficialTranscriptView.tsx:250`, but
neither is ever SELECTed from the DB.

Recommended path: apply any missing column by hand (both scripts are idempotent), insert the three
journal entries at their chronological positions, then `node scripts/migrate-db.mjs --baseline` in
each existing DB.

Also found: `drizzle/0010_curriculum_grade_status_codes.sql` is a **fourth** orphan, applied by hand
via `scripts/apply-0010-fix34038.mjs`.

### 7.2 `drizzle/meta/` snapshot chain is broken

Only `0000_snapshot.json`, `0001_snapshot.json`, `0005_snapshot.json` exist for 38 journal entries.
`npm run db:generate` has no continuity past 0005 and will produce a bogus full-schema diff. Only
`migrate` is trustworthy right now.

### 7.3 ~26 tables still missing from `RLS_TABLES`

`pg-hardening.sql` enables RLS on 74 tables; `RLS_TABLES` now has 48. Most of the remaining 26 are
still indirectly validated because they own a coverage column. Validated by **neither** gate:
`curriculum_approvals`, `exam_remuneration_rates`, `exam_halls`, `exam_calendar_configs`.

### 7.4 Pre-existing broken import, untouched

`src/app/api/admin/finance/reports/student-statement/route.ts:6` imports `getCurrentUniversity`
from `@/lib/auth`, where it **does not exist**. The real export is in `@/lib/university-scope`.
This will be a build error once you run `npm run typecheck`.

### 7.5 The RLS policies still grant nothing in production today

All thesis/defense access goes through the owner pool `db` in `graduation-engine.ts` and
`workflow-handlers.ts`, which **bypasses RLS**. The 2.5 fix makes the policies *correct* for when
that path moves to `withUserRls`; it does not change runtime behaviour by itself.

### 7.6 Emergency-drop status string is dead code

`emergencyDropAction` writes `status: 'DROPPED'` + `emergencyWithdrawal: 1`, but `transcript/page.tsx:16`
and `student/page.tsx:31` map an `EMERGENCY_DROPPED` status that nothing ever writes. The transcript
is correct because it keys off the boolean flag. Either drop those two `statusFa` entries or start
writing the string. Also, `0037` declares the column nullable while `schema.ts:815` says `notNull()`.

---

## 8. File manifest

**Created (6)**
```
src/app/student/thesis-proposal/page.tsx
src/app/student/thesis-proposal/actions.ts
src/app/student/thesis-proposal/ThesisProposalClient.tsx
src/app/admin/defense-scheduling/page.tsx
src/app/admin/defense-scheduling/actions.ts
src/app/admin/defense-scheduling/DefenseSchedulingClient.tsx
```

**Modified (13)**
```
drizzle/0040_thesis_progress_tracking.sql   quoting + 3 unique constraints + 1 index
drizzle/0038_major_change_process.sql       rewritten against real DDL
drizzle/0039_proposal_tracking_process.sql  rewritten against real DDL
drizzle/meta/_journal.json                  0037-0040 registered as idx 34-37
src/lib/graduation-engine.ts                3 compile errors, duplicate-row bug, stray stmt
src/db/pg-hardening.sql                     5 dead admin policies
src/app/student/requests/StudentRequestsClient.tsx   optionsEndpoint support
src/app/api/admin/majors/active/route.ts    {value,label} + uni scope
src/app/api/admin/terms/current/route.ts    {value,label} + uni scope
src/app/api/admin/staff/supervisors/route.ts  professor filter + {value,label}
src/app/admin/reports/actions.ts            third-attempt rewrite
src/app/admin/reports/ReportsClient.tsx     major filter for third-attempt
scripts/hardening.mjs                       RLS_TABLES + chairId coverage
```

**Also on disk (from the earlier session, verified real)**
```
drizzle/0037_enrollment_emergency_withdrawal.sql
src/app/student/actions.ts                  emergencyDropAction + waitlist promotion
src/app/student/page.tsx                    emergency-drop button
src/app/student/transcript/page.tsx         emergency-drop display
src/lib/workflow-handlers.ts                MAJOR_CHANGE_APPLY, PROPOSAL_TRACKING_LOG
src/db/schema.ts                            5 new thesis tables (column-for-column correct)
```

**Inaccurate — delete or rewrite**
```
IMPROVEMENTS_SUMMARY.txt
```