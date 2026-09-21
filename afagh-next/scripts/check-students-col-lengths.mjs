import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const cols = await pool.query(`
    SELECT column_name, character_maximum_length, data_type
    FROM information_schema.columns
    WHERE table_name = 'students'
      AND column_name IN ('militaryStatus', 'studyingMode', 'trainingMethod', 'acceptanceType', 'militaryExemptionNo', 'archiveNo', 'parvandehNo')
  `);
  console.log(cols.rows);
}

main().catch(console.error).finally(() => pool.end());
