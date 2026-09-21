import pg from 'pg';
import { resolveSamaGradeStatusCode } from '../src/lib/resolve-sama-code';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const res = await pool.query(`
    SELECT s.id, s."studentCode", s."regulationId", er.title
    FROM students s
    JOIN educational_regulations er ON er.id = s."regulationId"
    WHERE s."regulationId" = 14
    LIMIT 1;
  `);
  console.log('Student with Reg 14:', res.rows[0]);

  const stuId = res.rows[0].id;
  const offeringId = 17065;

  const fail91 = await resolveSamaGradeStatusCode(stuId, offeringId, '7.5');
  console.log('Student under Reg 1391 with fail grade 7.5 -> Expected -91, Got:', fail91);

  // Pre-1391 student (reg 13)
  const resPre = await pool.query(`
    SELECT s.id, s."studentCode", s."regulationId", er.title
    FROM students s
    JOIN educational_regulations er ON er.id = s."regulationId"
    WHERE s."regulationId" = 13
    LIMIT 1;
  `);
  const stuPreId = resPre.rows[0].id;
  const failPre = await resolveSamaGradeStatusCode(stuPreId, offeringId, '7.5');
  console.log('Student under Pre-1391 with fail grade 7.5 -> Expected 2, Got:', failPre);
}

main().finally(() => pool.end());
