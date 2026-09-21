import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  try {
    const uniId = 1; // Afagh

    console.log('Testing majors query...');
    const majorsRes = await pool.query(`
      SELECT m.id, m."majorCode" as code, m.name, m."degreeLevelId",
             d.title as "degreeTitle", d.code as "degreeCode",
             d."termCount" as "degreeTermCount", d."isGraduate" as "degreeIsGraduate"
      FROM majors m
      LEFT JOIN degree_level_configs d ON d.id = m."degreeLevelId"
      WHERE m."universityId" = $1
      ORDER BY m.name ASC
    `, [uniId]);
    console.log('Majors ok, count:', majorsRes.rows.length);

    console.log('Testing curriculum_versions query...');
    const versionsRes = await pool.query(`
      SELECT cv.id, cv."majorId", cv."degreeLevelId", cv."trackId",
             cv."versionCode", cv.title, cv.status, cv."entryYearFrom",
             cv."entryYearTo", cv."totalRequiredUnits",
             (SELECT count(*) FROM curriculum_courses cc WHERE cc."curriculumVersionId" = cv.id) as "courseCount"
      FROM curriculum_versions cv
      WHERE cv."universityId" = $1
      ORDER BY cv.id DESC
    `, [uniId]);
    console.log('Versions ok, count:', versionsRes.rows.length);

    console.log('Testing tracks query...');
    const tracksRes = await pool.query(`
      SELECT * FROM curriculum_tracks
      WHERE "universityId" = $1
      ORDER BY title ASC
    `, [uniId]);
    console.log('Tracks ok, count:', tracksRes.rows.length);

  } catch (err) {
    console.error('FAILED with error:', err);
  } finally {
    await pool.end();
  }
}

main();
