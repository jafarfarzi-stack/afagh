import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT lg."termCode", count(*)
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode"
    WHERE s."universityId" = 1 AND lg."termCode" ~ '^[0-9]{3}$'
    GROUP BY 1
    ORDER BY 2 DESC
  `);
  console.log('3-digit terms for AFAGH:', r.rows);
}

main().catch(console.error).finally(() => pool.end());
