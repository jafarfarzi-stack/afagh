import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const decoder = new TextDecoder('windows-1256');
  const content = decoder.decode(fs.readFileSync('E:\\git\\information afagh\\tatbigh dars.txt'));
  const lines = content.split(/\r?\n/).filter(x => x.trim());
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const code = cols[0]?.trim();
    const name = cols[1]?.trim();
    if (!code || !name) continue;
    const p = parseFloat(cols[2]?.trim()) || 0;
    const t = parseFloat(cols[3]?.trim()) || 0;
    const tot = parseFloat(cols[4]?.trim()) || (p + t);
    map.set(code, { code, name, p, t, tot });
  }
  console.log('tatbigh unique:', map.size);
  // check overlap with legacy distinct
  const client = await pool.connect();
  try {
    const legacyCodes = await client.query(`SELECT DISTINCT "courseCode" FROM legacy_grades WHERE "sourceCode"='AFAGH'`);
    const legacySet = new Set(legacyCodes.rows.map(r => r.courseCode));
    console.log('legacy distinct:', legacySet.size);
    let overlap = 0;
    for (const k of map.keys()) if (legacySet.has(k)) overlap++;
    console.log('overlap tatbigh∩legacy:', overlap);
    // sample tatbigh codes
    console.log('tatbigh sample:', Array.from(map.entries()).slice(0,5));
    // check if tatbigh has 43110?
    console.log('has 43110?', map.has('43110'), map.get('43110'));
    console.log('has 99042?', map.has('99042'), map.get('99042'));
  } finally { client.release(); await pool.end(); }
}
main().catch(console.error);
