import pg from 'pg';
import fs from 'fs';
import readline from 'readline';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    console.log('1) Updating rulesConfig for regulations with failed_sama_status_code...');
    const regs = await client.query(`SELECT id, "rulesConfig" FROM educational_regulations WHERE id IN (12, 13, 14, 15, 16, 17);`);
    for (const r of regs.rows) {
      const cfg = JSON.parse(r.rulesConfig);
      if (!cfg.grading_and_gpa) cfg.grading_and_gpa = {};
      if (r.id === 12 || r.id === 15) {
        cfg.grading_and_gpa.failed_sama_status_code = '931';
      } else if (r.id === 14) {
        cfg.grading_and_gpa.failed_sama_status_code = '-91';
      } else if (r.id === 16 || r.id === 17) {
        cfg.grading_and_gpa.failed_sama_status_code = '941';
      } else if (r.id === 13) {
        cfg.grading_and_gpa.failed_sama_status_code = '2';
      }
      await client.query(`UPDATE educational_regulations SET "rulesConfig" = $1 WHERE id = $2`, [JSON.stringify(cfg), r.id]);
    }
    console.log('Regulations updated with failed_sama_status_code.');

    console.log('2) Reading studentraw data.txt and updating students.regulationId...');
    // Create temp table
    await client.query(`
      CREATE TEMP TABLE tmp_stu_reg (
        student_code varchar(20) PRIMARY KEY,
        reg_id int NOT NULL
      );
    `);

    // Stream lines and collect batches
    const fileStream = fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt', 'latin1');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let batch = [];
    let count = 0;

    async function flush() {
      if (batch.length === 0) return;
      const values = [];
      const params = [];
      for (let i = 0; i < batch.length; i++) {
        const p1 = `$${i * 2 + 1}`;
        const p2 = `$${i * 2 + 2}`;
        values.push(`(${p1}, ${p2})`);
        params.push(batch[i].code, batch[i].regId);
      }
      await client.query(`
        INSERT INTO tmp_stu_reg (student_code, reg_id)
        VALUES ${values.join(', ')}
        ON CONFLICT (student_code) DO UPDATE SET reg_id = EXCLUDED.reg_id;
      `, params);
      batch = [];
    }

    for await (const line of rl) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      const code = parts[0]?.trim();
      const rKind = parts[88]?.trim();
      if (!code || code === 'StNo' || !rKind || rKind === 'RegulationKind') continue;

      let regId = 13; // default pre1391
      if (rKind === '93' || rKind === '931') regId = 12;
      else if (rKind === '912' || rKind === '914' || rKind === '915' || rKind === '951') regId = 14;
      else if (rKind === '94' || rKind === '941') regId = 16;
      else if (rKind === '0') regId = 13;

      batch.push({ code, regId });
      count++;
      if (batch.length >= 1000) {
        await flush();
      }
    }
    await flush();
    console.log(`Populated tmp_stu_reg with ${count} records.`);

    console.log('3) Updating students table from tmp_stu_reg...');
    const u = await client.query(`
      UPDATE students s
      SET "regulationId" = t.reg_id
      FROM tmp_stu_reg t
      WHERE s."studentCode" = t.student_code
        AND s."regulationId" IS DISTINCT FROM t.reg_id;
    `);
    console.log(`Updated ${u.rowCount} students.`);

    // Verify student 31993
    const check = await client.query(`
      SELECT s.id, s."studentCode", s."regulationId", er.title
      FROM students s
      JOIN educational_regulations er ON er.id = s."regulationId"
      WHERE s.id = 31993;
    `);
    console.log('Student 31993 now:', check.rows[0]);
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(console.error);
