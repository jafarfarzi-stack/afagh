import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT
      s.id, s."studentCode", s."majorId", s."saminLocalFieldCode",
      s."militaryStatus", s."acceptanceType", s."studyingMode", s."trainingMethod",
      u."firstName", u."lastName", u."nationalCode", u.gender
    FROM students s
    JOIN users u ON u.id = s."userId"
    WHERE s."studentCode" = '9992243001'
  `);
  console.log('Rasool DB record:', r.rows[0]);
}

main().catch(console.error).finally(() => pool.end());
