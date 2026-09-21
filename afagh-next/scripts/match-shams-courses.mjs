import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
const decoder = new TextDecoder('windows-1256');

async function main() {
  const dbCourses = await pool.query(`SELECT id, code, title FROM courses WHERE "universityId" = 4`);
  console.log('SHAMS db courses:', dbCourses.rows.length);

  const shamsBuf = fs.readFileSync('E:\\git\\backup\\information-shams\\tatbigh dars.txt');
  const shamsLines = decoder.decode(shamsBuf).split(/\r?\n/).filter(x => x.trim());
  console.log('SHAMS tatbigh lines:', shamsLines.length);

  await pool.end();
}

main().catch(console.error);
