import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

function parseCsv(path) {
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
  return lines.slice(1).map(l => {
    // fields are individually double-quoted, no embedded commas
    const c = l.split(',').map(s => s.replace(/^"|"$/g, ''));
    return { id: Number(c[0]), oldCode: c[6] === '' ? null : c[6], newCode: c[7] };
  });
}

async function main() {
  const all = [...parseCsv('grade-engine-changes-AFAGH.csv'), ...parseCsv('grade-engine-changes-SHAMS.csv')];
  console.log('rows to revert:', all.length);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = all.map(r => r.id);
    const codes = all.map(r => r.oldCode);
    await client.query(`
      UPDATE enrollments e SET "samaGradeStatusCode" = u.old_code
      FROM (SELECT UNNEST($1::int[]) AS id, UNNEST($2::text[]) AS old_code) u
      WHERE e.id = u.id
    `, [ids, codes]);
    // verify: count rows that now differ from CSV newCode (should be all reverted)
    const chk = await client.query(`
      SELECT COUNT(*) AS n FROM enrollments e
      JOIN (SELECT UNNEST($1::int[]) AS id, UNNEST($2::text[]) AS new_code) u ON u.id = e.id
      WHERE e."samaGradeStatusCode" IS DISTINCT FROM u.new_code
    `, [ids, all.map(r => r.newCode)]);
    console.log('rows now different from post-batch code (expect all):', chk.rows[0].n);
    await client.query('COMMIT');
    console.log('REVERT COMMITTED');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
