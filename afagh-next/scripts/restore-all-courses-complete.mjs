import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
const decoder = new TextDecoder('windows-1256');

function norm(s) {
  if (!s) return '';
  return s.trim()
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[ة]/g, 'ه')
    .replace(/\s+/g, ' ');
}

async function main() {
  const DRY = process.argv.includes('--dry');
  console.log(`=== Complete Courses Data Migration (DRY: ${DRY}) ===\n`);

  // 1. Ensure Departments for AFAGH
  console.log('--- 1. Departments for AFAGH ---');
  const facRows = (await pool.query(`SELECT id, "facultyCode" FROM faculties WHERE "universityId" = 1`)).rows;
  const facByCode = new Map(facRows.filter(r => r.facultyCode).map(r => [r.facultyCode, r.id]));
  const defaultFacId = facRows[0]?.id || 1;

  const deptBuf = fs.readFileSync('E:\\git\\backup\\information-afagh\\گروههاي اموزشي.txt');
  const deptLines = decoder.decode(deptBuf).split(/\r?\n/).filter(x => x.trim());

  let deptsCreated = 0;
  for (let i = 1; i < deptLines.length; i++) {
    const p = deptLines[i].split('\t');
    const code = p[0]?.trim();
    const name = p[1]?.trim();
    const placeCode = p[3]?.trim();
    if (!code || !name || code === '0' || name === 'نامشخص') continue;

    const facId = facByCode.get(placeCode) || defaultFacId;

    if (!DRY) {
      const ins = await pool.query(`
        INSERT INTO departments (name, "departmentCode", "facultyId", "universityId")
        VALUES ($1, $2, $3, 1)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [name, code, facId]);
      if (ins.rowCount > 0) deptsCreated++;
    }
  }
  console.log(`Departments created/ensured: ${deptsCreated}`);

  // Fetch all departments for AFAGH
  const afaghDepts = (await pool.query(`SELECT id, name, "departmentCode" FROM departments WHERE "universityId" = 1`)).rows;
  const deptByName = new Map();
  for (const d of afaghDepts) {
    deptByName.set(norm(d.name), d.id);
  }

  // Fetch degree levels for AFAGH
  const afaghDegrees = (await pool.query(`SELECT id, title, code FROM degree_level_configs WHERE "universityId" = 1`)).rows;
  const degreeByTitle = new Map();
  for (const deg of afaghDegrees) {
    degreeByTitle.set(norm(deg.title), deg.id);
  }

  // 2. Read DOROS.txt for AFAGH
  console.log('--- 2. Reading DOROS.txt for AFAGH ---');
  const dorosBuf = fs.readFileSync('E:\\git\\information afagh\\DOROS.txt');
  const dorosLines = decoder.decode(dorosBuf).split(/\r?\n/).filter(x => x.trim());
  const dorosMap = new Map(); // code -> { accept, reject }

  for (let i = 1; i < dorosLines.length; i++) {
    const p = dorosLines[i].split('\t');
    const code = p[2]?.trim();
    const accept = p[7]?.trim() || null;
    const reject = p[8]?.trim() || null;
    if (!code || (!accept && !reject)) continue;

    const existing = dorosMap.get(code);
    if (!existing) {
      dorosMap.set(code, { accept, reject });
    } else {
      // Prioritize specific codes over 1/2
      if (accept && accept !== '1') existing.accept = accept;
      if (reject && reject !== '2') existing.reject = reject;
    }
  }
  console.log(`Loaded ${dorosMap.size} codes from DOROS.txt`);

  // 3. Read tatbigh dars.txt for AFAGH
  console.log('--- 3. Processing AFAGH Courses ---');
  const tatbighBuf = fs.readFileSync('E:\\git\\information afagh\\tatbigh dars.txt');
  const tatbighLines = decoder.decode(tatbighBuf).split(/\r?\n/).filter(x => x.trim());

  let afaghUpdated = 0;
  for (let i = 1; i < tatbighLines.length; i++) {
    const p = tatbighLines[i].split('\t');
    const code = p[0]?.trim();
    const title = p[1]?.trim();
    if (!code || !title) continue;

    const degreeName = norm(p[2]);
    const groupName = norm(p[3]);
    const units = parseFloat(p[4]?.trim()) || 0;
    const theory = parseFloat(p[5]?.trim()) || 0;
    const prac = parseFloat(p[6]?.trim()) || 0;
    const courseType = p[7]?.trim() || null;
    const isActive = p[12]?.trim() === 'غير فعال' ? 0 : 1;
    const englishName = p[13]?.trim() || null;
    const equiv = p[14]?.trim() || null;

    let nature = 'نظری';
    if (theory > 0 && prac > 0) nature = 'نظری-عملی';
    else if (prac > 0 && theory === 0) nature = 'عملی';

    const deptId = deptByName.get(groupName) || null;
    const degreeId = degreeByTitle.get(degreeName) || null;

    let acceptCode = dorosMap.get(code)?.accept || null;
    let rejectCode = dorosMap.get(code)?.reject || null;

    if (!acceptCode) {
      if (courseType?.includes('جبران') || title.includes('جبرانی')) {
        acceptCode = '12';
        rejectCode = '22';
      } else {
        acceptCode = '1';
        rejectCode = '2';
      }
    }
    if (!rejectCode) rejectCode = '2';

    if (!DRY) {
      await pool.query(`
        UPDATE courses
        SET title = $1,
            units = $2,
            "theoreticalUnits" = $3,
            "practicalUnits" = $4,
            "courseNature" = $5,
            "courseType" = $6,
            "departmentId" = COALESCE($7, "departmentId"),
            "degreeLevelId" = COALESCE($8, "degreeLevelId"),
            "defaultAcceptMarkState" = $9,
            "defaultRejectMarkState" = $10,
            "englishName" = COALESCE($11, "englishName"),
            "equivalentCourseCodes" = COALESCE($12, "equivalentCourseCodes"),
            "courseIsActive" = $13
        WHERE code = $14 AND "universityId" = 1
      `, [title, units, theory, prac, nature, courseType, deptId, degreeId, acceptCode, rejectCode, englishName, equiv, isActive, code]);
    }
    afaghUpdated++;
  }
  console.log(`AFAGH courses updated: ${afaghUpdated}`);

  // 4. Processing SHAMS Courses
  console.log('--- 4. Processing SHAMS Courses ---');
  const shamsBuf = fs.readFileSync('E:\\git\\backup\\information-shams\\tatbigh dars.txt');
  const shamsLines = decoder.decode(shamsBuf).split(/\r?\n/).filter(x => x.trim());

  let shamsUpdated = 0;
  for (let i = 1; i < shamsLines.length; i++) {
    const p = shamsLines[i].split('\t');
    const code = p[0]?.trim();
    const title = p[1]?.trim();
    if (!code || !title) continue;

    const units = parseFloat(p[4]?.trim()) || 0;
    const theory = parseFloat(p[5]?.trim()) || 0;
    const prac = parseFloat(p[6]?.trim()) || 0;
    const courseType = p[7]?.trim() || null;

    let nature = 'نظری';
    if (theory > 0 && prac > 0) nature = 'نظری-عملی';
    else if (prac > 0 && theory === 0) nature = 'عملی';

    let acceptCode = '1';
    let rejectCode = '2';
    if (courseType?.includes('جبران') || title.includes('جبرانی')) {
      acceptCode = '12';
      rejectCode = '22';
    }

    if (!DRY) {
      await pool.query(`
        UPDATE courses
        SET title = $1,
            units = $2,
            "theoreticalUnits" = $3,
            "practicalUnits" = $4,
            "courseNature" = $5,
            "courseType" = $6,
            "defaultAcceptMarkState" = $7,
            "defaultRejectMarkState" = $8
        WHERE code = $9 AND "universityId" = 4
      `, [title, units, theory, prac, nature, courseType, acceptCode, rejectCode, code]);
    }
    shamsUpdated++;
  }
  console.log(`SHAMS courses updated: ${shamsUpdated}`);

  // Check course 99064 specifically
  const c99064 = await pool.query(`SELECT * FROM courses WHERE code = '99064'`);
  console.log('\n--- Status of course 99064 after update: ---');
  console.log(c99064.rows);

  await pool.end();
}

main().catch(console.error);
