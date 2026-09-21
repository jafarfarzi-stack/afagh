import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    for (const tbl of ['users', 'persons']) {
      const colsRes = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position;
      `, [tbl]);
      console.log(`\n${tbl} table columns:`);
      for (const c of colsRes.rows) {
        console.log(` - ${c.column_name}: ${c.data_type}`);
      }
    }

    // Check sample from persons or users joined with student
    const sample = await client.query(`
      SELECT s."studentCode", p.*
      FROM students s
      LEFT JOIN persons p ON p.id = s."personId"
      WHERE s."studentCode" IN ('9921312004', '9922344004')
      LIMIT 2;
    `);
    console.log('\nSample Babak and Ramin persons data:');
    console.log(sample.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
