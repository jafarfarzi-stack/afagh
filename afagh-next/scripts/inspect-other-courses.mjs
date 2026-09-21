import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT "universityId", code, title, "defaultAcceptMarkState", "defaultRejectMarkState",
           "theoreticalUnits", "practicalUnits", units, "courseType"
    FROM courses
    WHERE "universityId" IN (2, 3, 5)
    LIMIT 10
  `);
  console.table(r.rows);
  await pool.end();
}

main().catch(console.error);
