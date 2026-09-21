import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const tables = ['faculty', 'department', 'major', 'degree', 'course', 'term'];
  for (const t of tables) {
    console.log(`Checking table ${t}...`);
    if (t === 'degree') {
      const r = await pool.query(`
        SELECT id, code, title, "termCount", "isGraduate"
        FROM degree_level_configs
        ORDER BY title ASC
      `);
      console.log(`  degree ok: ${r.rows.length} rows`);
    } else if (t === 'major') {
      const r = await pool.query(`
        SELECT m.id, m."majorCode" as code, m.name as title,
               d.title as deg, dep.name as dept, dep."departmentCode" as "deptCode"
        FROM majors m
        LEFT JOIN degree_level_configs d ON d.id = m."degreeLevelId"
        LEFT JOIN departments dep ON dep.id = m."departmentId"
        ORDER BY m.name ASC
        LIMIT 5
      `);
      console.log(`  major ok: ${r.rows.length} sample rows`);
    } else if (t === 'department') {
      const r = await pool.query(`
        SELECT d.id, d."departmentCode" as code, d.name as title,
               f.name as "facName", f."facultyCode" as "facCode"
        FROM departments d
        LEFT JOIN faculties f ON f.id = d."facultyId"
        ORDER BY f.name ASC, d.name ASC
        LIMIT 5
      `);
      console.log(`  department ok: ${r.rows.length} sample rows`);
    } else if (t === 'faculty') {
      const r = await pool.query(`
        SELECT id, "facultyCode" as code, name as title
        FROM faculties
        ORDER BY name ASC
        LIMIT 5
      `);
      console.log(`  faculty ok: ${r.rows.length} sample rows`);
    } else if (t === 'course') {
      const r = await pool.query(`
        SELECT c.id, c.code, c.title, dep.name as dept, d.title as deg
        FROM courses c
        LEFT JOIN departments dep ON dep.id = c."departmentId"
        LEFT JOIN degree_level_configs d ON d.id = c."degreeLevelId"
        ORDER BY c.code ASC
        LIMIT 5
      `);
      console.log(`  course ok: ${r.rows.length} sample rows`);
    } else if (t === 'term') {
      const r = await pool.query(`
        SELECT id, "termCode" as code, title
        FROM academic_terms
        ORDER BY "termCode" ASC
        LIMIT 5
      `);
      console.log(`  term ok: ${r.rows.length} sample rows`);
    }
  }

  // Also check form options
  const degs = await pool.query(`SELECT id, title, code FROM degree_level_configs ORDER BY title ASC`);
  console.log(`Form options degrees count: ${degs.rows.length}`);
  const deps = await pool.query(`
    SELECT d.id, d.name, d."departmentCode" as code, f.name as fac
    FROM departments d
    LEFT JOIN faculties f ON f.id = d."facultyId"
    ORDER BY f.name ASC, d.name ASC
  `);
  console.log(`Form options departments count: ${deps.rows.length}`);

  console.log('\nALL CODES PAGE QUERIES ARE WORKING 100%!');
  await pool.end();
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
