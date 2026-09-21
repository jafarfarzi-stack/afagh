import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  await pool.query(`
    UPDATE enrollments
    SET "samaGradeStatusCode" = '12'
    WHERE id = 227371;
  `);
  console.log('Enrollment 227371 updated to 12.');
}

main().finally(() => pool.end());
