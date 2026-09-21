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
  console.log('loaded', map.size);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE temp_tatbigh_courses ("courseCode" varchar(100) PRIMARY KEY, "courseTitle" varchar(255), "practicalUnits" numeric(4,2), "theoreticalUnits" numeric(4,2), "units" numeric(4,2)) ON COMMIT DROP`);
    const list = Array.from(map.values());
    for (let i = 0; i < list.length; i += 1000) {
      const chunk = list.slice(i, i+1000);
      const vals = []; const ph = [];
      chunk.forEach((c, idx) => {
        const o = idx*5;
        vals.push(c.code, c.name, c.p, c.t, c.tot);
        ph.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5})`);
      });
      await client.query(`INSERT INTO temp_tatbigh_courses ("courseCode","courseTitle","practicalUnits","theoreticalUnits","units") VALUES ${ph.join(',')}`, vals);
    }
    console.log('temp loaded');
    const u = await client.query(`UPDATE courses c SET title=t."courseTitle","practicalUnits"=t."practicalUnits","theoreticalUnits"=t."theoreticalUnits",units=t.units FROM temp_tatbigh_courses t WHERE c.code=t."courseCode" AND c."universityId"=1`);
    console.log('courses updated:', u.rowCount);
    const ins = await client.query(`INSERT INTO courses ("universityId",code,title,"practicalUnits","theoreticalUnits",units) SELECT 1,t."courseCode",t."courseTitle",t."practicalUnits",t."theoreticalUnits",t.units FROM temp_tatbigh_courses t WHERE NOT EXISTS (SELECT 1 FROM courses c WHERE c."universityId"=1 AND c.code=t."courseCode")`);
    console.log('courses inserted:', ins.rowCount);
    await client.query('COMMIT');
    console.log('courses fix committed');
  } catch(e){ await client.query('ROLLBACK'); console.error(e); }
  finally { client.release(); await pool.end(); }
}
main().catch(console.error);
