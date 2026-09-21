import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'students'
      ORDER BY ordinal_position;
    `);
    console.log('students table columns:');
    for (const c of colsRes.rows) {
      console.log(` - ${c.column_name}: ${c.data_type}`);
    }

    // Also sample a student to see what placeOfBirth, placeOfIssue look like
    const sample = await client.query(`
      SELECT "studentCode", "placeOfBirth", "placeOfIssue", "birthDate"
      FROM students
      WHERE "placeOfBirth" IS NOT NULL OR "placeOfIssue" IS NOT NULL
      LIMIT 10;
    `);
    console.log('\nSample students with placeOfBirth/Issue:');
    console.log(sample.rows);

    // Check how many students have numeric codes vs text names in placeOfBirth/Issue
    const counts = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT("placeOfBirth") as has_pob,
        COUNT("placeOfIssue") as has_poi
      FROM students;
    `);
    console.log('\nCounts:', counts.rows[0]);

    const samples2 = await client.query(`
      SELECT DISTINCT "placeOfBirth", "placeOfIssue"
      FROM students
      LIMIT 25;
    `);
    console.log('\nDistinct samples:', samples2.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
