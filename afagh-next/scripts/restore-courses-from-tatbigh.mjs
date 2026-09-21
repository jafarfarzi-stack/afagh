import fs from 'fs';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

function cleanPersian(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim();
}

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log(`Starting Course Catalog Restoration from tatbigh dars.txt (mode: ${isApply ? 'APPLY' : 'DRY RUN'})...\n`);

  const filePath = 'E:\\git\\information afagh\\tatbigh dars.txt';
  const buf = fs.readFileSync(filePath);
  const text = new TextDecoder('windows-1256').decode(buf);
  const lines = text.split('\n');

  const catalog = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const code = cleanPersian(cols[0]);
    const title = cleanPersian(cols[1]);
    if (!code || !title) continue;

    const units = parseFloat(cleanPersian(cols[4])) || 0;
    const theoretical = parseFloat(cleanPersian(cols[5])) || 0;
    const practical = parseFloat(cleanPersian(cols[6])) || 0;
    const courseType = cleanPersian(cols[7]) || null;
    const englishName = cleanPersian(cols[14]) || null;

    if (!catalog.has(code)) {
      catalog.set(code, {
        code,
        title,
        units,
        theoretical,
        practical,
        courseType,
        englishName,
      });
    }
  }

  if (isApply) {
    console.log('Applying updates to courses and legacy_grades...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let coursesUpdated = 0;
      let gradesUpdated = 0;

      for (const [code, cat] of catalog.entries()) {
        const resCourse = await client.query(`
          UPDATE courses
          SET title = $1,
              units = $2,
              "theoreticalUnits" = $3,
              "practicalUnits" = $4,
              "courseType" = COALESCE($5, "courseType"),
              "englishName" = COALESCE($6, "englishName")
          WHERE code = $7 AND (title LIKE '%مهاجرتی%' OR units = '0' OR units = '0.0' OR title != $1)
        `, [cat.title, String(cat.units), String(cat.theoretical), String(cat.practical), cat.courseType, cat.englishName, code]);
        coursesUpdated += resCourse.rowCount;

        const resGrades = await client.query(`
          UPDATE legacy_grades
          SET "courseTitle" = $1,
              units = $2
          WHERE "courseCode" = $3 AND ("courseTitle" IS NULL OR "courseTitle" LIKE '%مهاجرتی%' OR units IS NULL)
        `, [cat.title, String(cat.units), code]);
        gradesUpdated += resGrades.rowCount;
      }

      await client.query('COMMIT');
      console.log(`Successfully updated ${coursesUpdated} courses and ${gradesUpdated} legacy_grades rows!`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error applying updates:', err);
    } finally {
      client.release();
    }
  } else {
    console.log('Dry run complete. Use --apply to execute.');
  }

  await pool.end();
}

main().catch(console.error);
