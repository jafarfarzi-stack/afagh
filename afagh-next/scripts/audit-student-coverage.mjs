import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

// same normTxt approximation: strip + require non-empty after trim
function normTxt(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

async function* tsvRows(p) {
  const buf = fs.readFileSync(p, 'latin1');
  const lines = buf.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    yield { cols: l.split('\t') };
  }
}

async function main() {
  const main = new Map();
  let badCode = 0, noName = 0, total = 0;
  for await (const { cols } of tsvRows('E:\\git\\information afagh\\students1.txt')) {
    const stno = (cols[0] || '').trim();
    if (!/^\d{7,14}$/.test(stno)) { badCode++; continue; }
    if (!normTxt(cols[2])) { noName++; continue; }
    total++;
    if (!main.has(stno)) main.set(stno, 1);
  }
  console.log(`students1: valid rows=${total} unique=${main.size} badCode=${badCode} noName=${noName}`);
  let n2 = 0, added2 = 0;
  for await (const { cols } of tsvRows('E:\\git\\information afagh\\student2.txt')) {
    const stno = (cols[0] || '').trim();
    if (!/^\d{7,14}$/.test(stno)) continue;
    if (!normTxt(cols[2])) continue;
    n2++;
    if (!main.has(stno)) { main.set(stno, 1); added2++; }
  }
  console.log(`student2: valid rows=${n2} new unique added=${added2} total unique=${main.size}`);

  const db = await pool.query(`SELECT "studentCode" FROM students WHERE "universityId" = 1`);
  const dbSet = new Set(db.rows.map(r => r.studentCode));
  console.log(`DB AFAGH students: ${dbSet.size}`);
  let missing = 0;
  const missSample = [];
  for (const stno of main.keys()) {
    if (!dbSet.has(stno)) { missing++; if (missSample.length < 10) missSample.push(stno); }
  }
  console.log(`File students NOT in DB: ${missing}`);
  console.log('sample:', missSample);
  await pool.end();
}
main().catch(console.error);
