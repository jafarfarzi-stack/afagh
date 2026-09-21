import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const stu = (await client.query(`SELECT * FROM students WHERE "studentCode" = '9922344004'`)).rows[0];
    console.log('Student:', stu);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
