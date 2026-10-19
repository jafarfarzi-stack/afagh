import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const db = drizzle(pool, { schema });

// every table the enrollment + exam engines touch
const tables = [
  'users', 'students', 'staff', 'academic_terms', 'financial_terms', 'financial_clearances',
  'cart_items', 'course_offerings', 'courses', 'enrollments', 'schedules', 'student_ledger',
  'student_term_states', 'notifications', 'exam_sessions', 'exam_halls', 'exam_minutes',
  'invigilators', 'exam_invigilators', 'course_exam_sessions', 'exam_course_packets',
  'exam_attendances', 'seat_allocations', 'instructor_deliveries',
];

async function main() {
  const bad: string[] = [];
  for (const t of tables) {
    try {
      await (db as any).select().from((schema as any)[t]).limit(1);
    } catch (e: any) {
      bad.push(`${t}: ${String(e?.message).slice(0, 200)}`);
    }
  }
  console.log('PROBE_ERRORS=' + JSON.stringify(bad, null, 2));
  await pool.end();
}
main().then(() => process.exit(0)).catch((e) => { console.error('PROBE_FATAL', e); process.exit(1); });
