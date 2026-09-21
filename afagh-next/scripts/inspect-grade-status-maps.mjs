import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const res = await pool.query(`SELECT "legacyCode", "legacyTitle" FROM legacy_code_maps WHERE domain='GRADE_STATUS' ORDER BY "legacyCode"`);
  console.log('legacy_code_maps GRADE_STATUS:', res.rows);
}
check().finally(() => pool.end());
