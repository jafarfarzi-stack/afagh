import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

const facultyNameMap = {
  '1': 'دانشکده کشاورزی و منابع طبیعی',
  '2': 'دانشکده فنی و مهندسی',
  '3': 'دانشکده اقتصاد و علوم انسانی',
  '6': 'دانشکده شمس تبریزی خوی',
  '11': 'مرکز مهارت آموزی',
  '12': 'دانشکده زرینه خوی',
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update faculty names for universityId = 1
    console.log('1. Updating faculties names for universityId = 1...');
    for (const [code, name] of Object.entries(facultyNameMap)) {
      const res = await client.query(`
        UPDATE faculties
        SET name = $1
        WHERE "universityId" = 1 AND "facultyCode" = $2
      `, [name, code]);
      console.log(`Faculty code ${code} -> ${name} (${res.rowCount} updated)`);
    }

    // Also get all faculties for university 1
    const facRes = await client.query(`
      SELECT id, "facultyCode"
      FROM faculties
      WHERE "universityId" = 1 AND "facultyCode" IS NOT NULL
    `);
    const codeToFacId = new Map();
    facRes.rows.forEach(r => codeToFacId.set(r.facultyCode, r.id));

    // 2. Read رشته ها.txt with windows-1256 to map major -> faculty
    console.log('\n2. Reading رشته ها.txt to link majors to faculties...');
    const decoder = new TextDecoder('windows-1256');
    const lines = decoder.decode(fs.readFileSync('E:\\git\\information afagh\\رشته ها.txt'))
      .split(/\r?\n/)
      .filter(x => x.trim());

    let majorsUpdated = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const majorCode = cols[0]?.trim();
      const daneshkadehCode = cols[3]?.trim();
      if (!majorCode || !daneshkadehCode) continue;

      const targetFacId = codeToFacId.get(daneshkadehCode);
      if (targetFacId) {
        const uRes = await client.query(`
          UPDATE majors
          SET "facultyId" = $1
          WHERE "universityId" = 1 AND "majorCode" = $2 AND "facultyId" IS NULL
        `, [targetFacId, majorCode]);
        majorsUpdated += uRes.rowCount;
      }
    }
    console.log(`Linked ${majorsUpdated} majors to their respective faculties.`);

    // 3. Link students.majorId where saminLocalFieldCode matches majors.majorCode
    console.log('\n3. Linking students.majorId...');
    const sRes = await client.query(`
      UPDATE students s
      SET "majorId" = m.id
      FROM majors m
      WHERE m."universityId" = s."universityId"
        AND m."majorCode" = s."saminLocalFieldCode"
        AND s."universityId" = 1
        AND s."majorId" IS NULL
    `);
    console.log(`Updated majorId for ${sRes.rowCount} students!`);

    await client.query('COMMIT');
    console.log('\nStep 1-3 completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during execution:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
