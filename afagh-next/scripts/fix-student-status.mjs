// بازنگاشت وضعیت دانشجویان آفاق با مپ صحیح سما + ذخیره کد خام
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db', max: 5 });
const MAP = {
  '1': 'ACTIVE', '5': 'ACTIVE', '10': 'ACTIVE', '23': 'ACTIVE', '26': 'ACTIVE',
  '2': 'GRADUATED', '9': 'GRADUATED', '25': 'GRADUATED', '41': 'GRADUATED', '42': 'GRADUATED',
  '43': 'GRADUATED', '44': 'GRADUATED', '45': 'GRADUATED', '46': 'GRADUATED',
  '16': 'EXPELLED', '34': 'EXPELLED',
  '17': 'WITHDRAWN', '18': 'WITHDRAWN', '35': 'WITHDRAWN', '12': 'WITHDRAWN',
  '22': 'SUSPENDED',
  '3': 'TRANSFERRED', '4': 'TRANSFERRED', '14': 'TRANSFERRED', '15': 'TRANSFERRED', '24': 'TRANSFERRED', '37': 'TRANSFERRED',
  '0': 'UNKNOWN', '11': 'UNKNOWN', '8': 'UNKNOWN',
  '21': 'NO_SHOW', '29': 'NO_SHOW', '7': 'NO_SHOW',
  '20': 'DECEASED', '6': 'DECEASED',
};
const dec = new TextDecoder('windows-1256');
const rows = [];
{
  const rl = readline.createInterface({ input: createReadStream('E:\\git\\information afagh\\studentraw data.txt') });
  let hdr = null;
  for await (const raw of rl) {
    const line = dec.decode(Buffer.from(raw, 'binary')).replace(/\r/g, '');
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (!hdr) { hdr = cols.map(c => c.trim()); continue; }
    const stno = (cols[0] || '').trim(), st = (cols[4] || '').trim();
    if (!stno) continue;
    rows.push([stno, MAP[st] || 'UNKNOWN', st || null]);
  }
}
console.log(`parsed ${rows.length}`);
// batch update
let upd = 0;
const dist = {};
for (let i = 0; i < rows.length; i += 1000) {
  const chunk = rows.slice(i, i + 1000);
  const vals = [];
  const params = [];
  chunk.forEach(([code, status, raw], j) => {
    params.push(`($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`);
    vals.push(code, status, raw);
  });
  const res = await pool.query(
    `UPDATE students s SET status = v.st, "samaStatusCode" = v.raw FROM (VALUES ${params.join(',')}) AS v(code, st, raw) WHERE s."studentCode" = v.code`,
    vals);
  upd += res.rowCount;
  const r2 = await pool.query(`SELECT 1`);
  void r2;
  if (i % 10000 === 0) console.log(`... ${i} upd=${upd}`);
}
for (const [, s] of rows) dist[s] = (dist[s] || 0) + 1;
console.log('mapped file dist:', JSON.stringify(dist));
console.log(`updated ${upd} students`);
const dbDist = await pool.query(`SELECT status, COUNT(*) c FROM students GROUP BY status ORDER BY 2 DESC`);
console.log('DB now:', JSON.stringify(dbDist.rows));
await pool.end();
