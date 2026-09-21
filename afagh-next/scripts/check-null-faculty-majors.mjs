import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT id, name, "majorCode", "facultyId"
    FROM majors
    WHERE "universityId" = 1 AND "facultyId" IS NULL
  `);
  console.log('Majors with NULL facultyId:', r.rows);
}

main().catch(console.error).finally(() => pool.end());
