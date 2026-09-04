CREATE TABLE "equivalence_clusters" (
	"id" serial PRIMARY KEY NOT NULL,
	"clusterTitle" varchar(100) NOT NULL,
	"isGeneralService" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "scheduling_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"termId" integer NOT NULL,
	"offeringId" integer NOT NULL,
	"departmentId" integer NOT NULL,
	"allocatedByStaffId" integer,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "uq_scheduling_allocation" UNIQUE("offeringId","departmentId")
);
--> statement-breakpoint
CREATE TABLE "scheduling_room_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"termId" integer NOT NULL,
	"classroomId" integer NOT NULL,
	"shift" varchar(10) NOT NULL,
	"ownerDepartmentId" integer NOT NULL,
	"status" varchar(10) DEFAULT 'ALLOCATED' NOT NULL,
	"releasedAt" timestamp,
	"releasedByStaffId" integer,
	CONSTRAINT "uq_scheduling_room_shift" UNIQUE("termId","classroomId","shift")
);
--> statement-breakpoint
CREATE TABLE "term_scheduling_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"termId" integer NOT NULL,
	"phase" varchar(20) DEFAULT 'SUPPLY' NOT NULL,
	"supplyEndsAt" timestamp,
	"allocationEndsAt" timestamp,
	"reviewEndsAt" timestamp,
	"publishedAt" timestamp,
	"publishedByStaffId" integer,
	CONSTRAINT "term_scheduling_states_termId_unique" UNIQUE("termId")
);
--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "facultyId" integer;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD COLUMN "ownerDepartmentId" integer;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD COLUMN "isSharedService" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD COLUMN "equivalenceClusterId" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "clusterId" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "offeringScope" varchar(20) DEFAULT 'DEPARTMENTAL';--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "locationType" varchar(20) DEFAULT 'IN_CAMPUS';--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "canManageServicePool" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scheduling_allocations" ADD CONSTRAINT "scheduling_allocations_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_allocations" ADD CONSTRAINT "scheduling_allocations_offeringId_course_offerings_id_fk" FOREIGN KEY ("offeringId") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_allocations" ADD CONSTRAINT "scheduling_allocations_departmentId_departments_id_fk" FOREIGN KEY ("departmentId") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_allocations" ADD CONSTRAINT "scheduling_allocations_allocatedByStaffId_staff_id_fk" FOREIGN KEY ("allocatedByStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_room_grants" ADD CONSTRAINT "scheduling_room_grants_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_room_grants" ADD CONSTRAINT "scheduling_room_grants_classroomId_classrooms_id_fk" FOREIGN KEY ("classroomId") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_room_grants" ADD CONSTRAINT "scheduling_room_grants_ownerDepartmentId_departments_id_fk" FOREIGN KEY ("ownerDepartmentId") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_room_grants" ADD CONSTRAINT "scheduling_room_grants_releasedByStaffId_staff_id_fk" FOREIGN KEY ("releasedByStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_scheduling_states" ADD CONSTRAINT "term_scheduling_states_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_scheduling_states" ADD CONSTRAINT "term_scheduling_states_publishedByStaffId_staff_id_fk" FOREIGN KEY ("publishedByStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_allocations_dept_idx" ON "scheduling_allocations" USING btree ("termId","departmentId");--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_facultyId_faculties_id_fk" FOREIGN KEY ("facultyId") REFERENCES "public"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_ownerDepartmentId_departments_id_fk" FOREIGN KEY ("ownerDepartmentId") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_equivalenceClusterId_equivalence_clusters_id_fk" FOREIGN KEY ("equivalenceClusterId") REFERENCES "public"."equivalence_clusters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_clusterId_equivalence_clusters_id_fk" FOREIGN KEY ("clusterId") REFERENCES "public"."equivalence_clusters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offerings_term_course_group_idx" ON "course_offerings" USING btree ("termId","courseId","groupNumber");