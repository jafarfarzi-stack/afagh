import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const cols = await pool.query(`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name IN ('students', 'persons', 'student_source_identities', 'person_source_identities')
    ORDER BY table_name, ordinal_position
  `);
  console.table(cols.rows);

  // Check sample student record
  const s = await pool.query(`
    SELECT * FROM students WHERE "studentCode" = '9992243001'
  `);
  console.log('Sample student 9992243001:', s.rows[0]);

  // Check person record
  if (s.rows[0]?.personId) {
    const p = await pool.query(`
      SELECT * FROM persons WHERE id = $1
    `, [s.rows[0].personId]);
    console.log('Sample person:', p.rows[0]);
  }

  await pool.end();
}

main().catch(console.error);
