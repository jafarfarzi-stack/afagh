import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  console.log('=== Checking 4581 missing students in students table ===\n');

  // Check if they exist in students table with ANY universityId
  const inOtherUni = await pool.query(`
    SELECT s."universityId", COUNT(DISTINCT lg."studentCode") as n
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode"
    WHERE lg."sourceCode" = 'AFAGH' AND s."universityId" != 1
    GROUP BY s."universityId"
  `);
  console.log('AFAGH legacy students found in students table under other universities:');
  console.table(inOtherUni.rows);

  // Check legacy_students table (if exists)
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%student%' OR table_name LIKE '%legacy%'
  `);
  console.log('Related tables:', tables.rows.map(r => r.table_name));

  // Sample some of these 4581 studentCodes
  const samples = await pool.query(`
    SELECT DISTINCT lg."studentCode"
    FROM legacy_grades lg
    LEFT JOIN students s ON s."studentCode" = lg."studentCode"
    WHERE lg."sourceCode" = 'AFAGH' AND s.id IS NULL
    LIMIT 10
  `);
  console.log('Sample missing studentCodes:', samples.rows.map(r => r.studentCode));

  // Check where students come from (raw data or legacy tables)
  const legacyStudentsCount = await pool.query(`
    SELECT "sourceCode", COUNT(*) as n FROM legacy_students GROUP BY "sourceCode"
  `).catch(() => null);
  if (legacyStudentsCount) {
    console.log('legacy_students counts:');
    console.table(legacyStudentsCount.rows);
  }

  await pool.end();
}

main().catch(console.error);
