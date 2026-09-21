import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT s."universityId", u.code as univ_code, count(*)
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode"
    JOIN universities u ON u.id = s."universityId"
    WHERE lg."termCode" ~ '^[0-9]{3}$'
    GROUP BY 1, 2
  `);
  console.log('3-digit terms by university:', r.rows);
}

main().catch(console.error).finally(() => pool.end());
