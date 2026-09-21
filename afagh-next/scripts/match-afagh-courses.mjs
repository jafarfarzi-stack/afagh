import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
const decoder = new TextDecoder('windows-1256');

async function main() {
  const dbCourses = await pool.query(`SELECT id, code, title FROM courses WHERE "universityId" = 1`);
  const dbCourseMap = new Map(dbCourses.rows.map(r => [r.code, r]));

  const tatbighBuf = fs.readFileSync('E:\\git\\information afagh\\tatbigh dars.txt');
  const tatbighLines = decoder.decode(tatbighBuf).split(/\r?\n/).filter(x => x.trim());

  const dorosBuf = fs.readFileSync('E:\\git\\information afagh\\DOROS.txt');
  const dorosLines = decoder.decode(dorosBuf).split(/\r?\n/).filter(x => x.trim());

  const tatbighCodes = new Set();
  for (let i = 1; i < tatbighLines.length; i++) {
    const code = tatbighLines[i].split('\t')[0]?.trim();
    if (code) tatbighCodes.add(code);
  }

  const dorosCodes = new Set();
  for (let i = 1; i < dorosLines.length; i++) {
    const code = dorosLines[i].split('\t')[2]?.trim();
    if (code) dorosCodes.add(code);
  }

  let inTatbigh = 0;
  let inDoros = 0;
  let inBoth = 0;
  let inNeither = 0;

  for (const code of dbCourseMap.keys()) {
    const hasT = tatbighCodes.has(code);
    const hasD = dorosCodes.has(code);
    if (hasT) inTatbigh++;
    if (hasD) inDoros++;
    if (hasT && hasD) inBoth++;
    if (!hasT && !hasD) inNeither++;
  }

  console.log({
    totalDbCoursesAfagh: dbCourses.rows.length,
    tatbighUniqueCodes: tatbighCodes.size,
    dorosUniqueCodes: dorosCodes.size,
    dbMatchedInTatbigh: inTatbigh,
    dbMatchedInDoros: inDoros,
    dbMatchedInBoth: inBoth,
    dbInNeither: inNeither,
  });

  await pool.end();
}

main().catch(console.error);
