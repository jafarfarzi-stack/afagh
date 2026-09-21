import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const counts = await pool.query(`
    SELECT "regulationId", COUNT(*) as cnt
    FROM students
    GROUP BY "regulationId"
    ORDER BY cnt DESC;
  `);
  console.table(counts.rows);
}

main().finally(() => pool.end());
