import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  // Check legacy_import_batches / legacy_import_rows
  const batches = await pool.query(`SELECT id, "sourceCode", "entityType", "totalRows", "createdAt" FROM legacy_import_batches ORDER BY id DESC LIMIT 10`);
  console.log('Recent import batches:');
  console.table(batches.rows);

  // Check if student '4001156750' exists in legacy_import_rows
  const rowCheck = await pool.query(`
    SELECT "batchId", "entityType", "sourceCode", "rawData"
    FROM legacy_import_rows
    WHERE "rawData"::text LIKE '%4001156750%'
    LIMIT 1
  `);
  if (rowCheck.rows.length > 0) {
    console.log('Found student in legacy_import_rows:', rowCheck.rows[0]);
  } else {
    console.log('Not in legacy_import_rows. Checking files in the workspace or parent directory...');
  }

  // Check where students table records were populated from
  const stuSample = await pool.query(`
    SELECT id, "studentCode", "nationalCode", "firstName", "lastName", "entryTermId", "universityId", "createdAt"
    FROM students
    WHERE "universityId" = 1
    ORDER BY id DESC
    LIMIT 5
  `);
  console.log('Sample students in university 1:');
  console.table(stuSample.rows);

  await pool.end();
}

main().catch(console.error);
