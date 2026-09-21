import fs from 'fs';
import readline from 'readline';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  console.log('Reading tatbigh dars.txt with windows-1256...');
  const decoder = new TextDecoder('windows-1256');
  const buffer = fs.readFileSync('E:\\git\\information afagh\\tatbigh dars.txt');
  const content = decoder.decode(buffer);
  const lines = content.split(/\r?\n/).filter(x => x.trim());

  const coursesMap = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const courseCode = cols[0]?.trim();
    const courseName = cols[1]?.trim();
    if (!courseCode || !courseName) continue;

    const practicalUnits = parseFloat(cols[2]?.trim()) || 0;
    const theoreticalUnits = parseFloat(cols[3]?.trim()) || 0;
    const totalUnits = parseFloat(cols[4]?.trim()) || (practicalUnits + theoreticalUnits);

    coursesMap.set(courseCode, {
      courseCode,
      courseTitle: courseName,
      practicalUnits,
      theoreticalUnits,
      units: totalUnits,
    });
  }

  console.log(`Loaded ${coursesMap.size} unique courses from tatbigh dars.txt`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Creating index on legacy_grades(courseCode, sourceCode)...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_legacy_grades_course_code
      ON legacy_grades ("courseCode", "sourceCode");
    `);

    console.log('Creating temp table temp_tatbigh_courses...');
    await client.query(`
      CREATE TEMP TABLE temp_tatbigh_courses (
        "courseCode" varchar(100) PRIMARY KEY,
        "courseTitle" varchar(255),
        "practicalUnits" numeric(4,2),
        "theoreticalUnits" numeric(4,2),
        "units" numeric(4,2)
      ) ON COMMIT DROP;
    `);

    const list = Array.from(coursesMap.values());
    const batchSize = 1000;
    for (let i = 0; i < list.length; i += batchSize) {
      const chunk = list.slice(i, i + batchSize);
      const values = [];
      const placeholders = [];

      chunk.forEach((c, idx) => {
        const offset = idx * 5;
        values.push(c.courseCode, c.courseTitle, c.practicalUnits, c.theoreticalUnits, c.units);
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
      });

      await client.query(`
        INSERT INTO temp_tatbigh_courses ("courseCode", "courseTitle", "practicalUnits", "theoreticalUnits", "units")
        VALUES ${placeholders.join(', ')}
      `, values);
    }
    console.log('Temp table loaded.');

    console.log('Updating courses table for universityId = 1...');
    const cUpdate = await client.query(`
      UPDATE courses c
      SET title = t."courseTitle",
          "practicalUnits" = t."practicalUnits",
          "theoreticalUnits" = t."theoreticalUnits",
          units = t.units
      FROM temp_tatbigh_courses t
      WHERE c.code = t."courseCode" AND c."universityId" = 1
    `);
    console.log(`Updated ${cUpdate.rowCount} courses in courses table.`);

    console.log('Inserting missing courses into courses table...');
    const cInsert = await client.query(`
      INSERT INTO courses ("universityId", code, title, "practicalUnits", "theoreticalUnits", units)
      SELECT 1, t."courseCode", t."courseTitle", t."practicalUnits", t."theoreticalUnits", t.units
      FROM temp_tatbigh_courses t
      WHERE NOT EXISTS (
        SELECT 1 FROM courses c WHERE c."universityId" = 1 AND c.code = t."courseCode"
      )
    `);
    console.log(`Inserted ${cInsert.rowCount} new courses into courses table.`);

    console.log('Updating legacy_grades table for sourceCode = AFAGH...');
    const lgUpdate = await client.query(`
      UPDATE legacy_grades lg
      SET "courseTitle" = t."courseTitle",
          units = t.units
      FROM temp_tatbigh_courses t
      WHERE lg."courseCode" = t."courseCode"
        AND lg."sourceCode" = 'AFAGH'
        AND (lg."courseTitle" IS NULL OR lg.units IS NULL OR lg."courseTitle" <> t."courseTitle" OR lg.units <> t.units)
    `);
    console.log(`Updated ${lgUpdate.rowCount} rows in legacy_grades.`);

    await client.query('COMMIT');
    console.log('Course catalog and grades restored successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating courses:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
