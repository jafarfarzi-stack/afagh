-- Remove unique constraint on students.userId to allow multiple student records per person
-- (e.g. kardani + karshenasi + karshenasi arshad for the same user)
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_userId_unique";
