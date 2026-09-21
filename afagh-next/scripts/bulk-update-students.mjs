import fs from 'fs';
import readline from 'readline';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

const militaryMap = {
  '1': 'خانم (فاقد نظام وظیفه)',
  '2': 'مشمول دارای دفترچه',
  '3': 'مشمول بدون دفترچه',
  '4': 'معافیت پزشکی یا کفالت',
  '5': 'کارت پایان خدمت',
  '6': 'سرباز ترخیصی',
  '7': 'معافیت تحصیلی فعال',
  '8': 'معافیت دائم',
  '9': 'کارکنان پایور',
  '10': 'طلاب',
  '11': 'دانشجوی انصرافی',
  '12': 'دانشجوی سال آخر',
  '13': 'فارغ‌التحصیل',
  '14': 'متولد ماقبل ۵۲',
  '15': 'متعهد خدمت',
  '16': 'مشمول نیست',
  '17': 'فاقد معافیت',
  '0': 'نامشخص',
};

const periodMap = {
  '1': 'روزانه',
  '2': 'شبانه',
  '3': 'نیمه حضوری',
  '4': 'غیرانتفاعی',
  '5': 'دانشجویان خارجی',
  '6': 'روزانه-خاص',
  '7': 'پیام نور',
  '8': 'آموزش عالی آزاد',
  '10': 'مجازی',
  '202': 'مهمانی',
};

const trainingMap = {
  '1': 'آموزشی',
  '2': 'آموزشی-تغییر رشته',
  '3': 'آموزشی و پژوهشی',
  '4': 'آموزشی پژوهشی',
  '8': 'آموزشی-تغییر رشته',
  '11': 'پژوهش محور',
};

const cleanStr = (s, maxLen) => {
  if (!s) return null;
  const t = String(s).trim();
  if (!t || t === '0' || t === 'EMPTY' || t === 'null') return null;
  return t.slice(0, maxLen);
};

async function main() {
  console.log('Reading studentraw data.txt...');
  const studentData = new Map();

  const rl1 = readline.createInterface({
    input: fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt'),
    crlfDelay: Infinity,
  });

  let l1 = 0;
  for await (const line of rl1) {
    l1++;
    if (l1 <= 2) continue;
    const c = line.split('\t');
    const stno = c[0]?.trim();
    if (!stno || !/^\d{5,20}$/.test(stno)) continue;

    const nezam = c[33]?.trim();
    const milStatus = militaryMap[nezam] || null;
    const ct = c[6]?.trim();
    const sm = periodMap[ct] || (ct ? `دوره ${ct}` : null);
    const tm = c[78]?.trim();
    const training = trainingMap[tm] || (tm ? `شیوه ${tm}` : null);
    const moafiatNo = c[52];

    studentData.set(stno, {
      militaryStatus: cleanStr(milStatus, 50),
      studyingMode: cleanStr(sm, 20),
      trainingMethod: cleanStr(training, 20),
      militaryExemptionNo: cleanStr(moafiatNo, 50),
      archiveNo: null,
      parvandehNo: null,
      acceptanceType: 'سنجش و آزمون سراسری',
    });
  }
  console.log(`Loaded ${studentData.size} valid students from studentraw data.txt`);

  console.log('Reading student2.txt for archiveNo, parvandehNo, acceptType...');
  const rl2 = readline.createInterface({
    input: fs.createReadStream('E:\\git\\information afagh\\student2.txt'),
    crlfDelay: Infinity,
  });

  let l2 = 0;
  for await (const line of rl2) {
    l2++;
    if (l2 <= 2) continue;
    const c = line.split('\t');
    const stno = c[0]?.trim();
    if (!stno || !/^\d{5,20}$/.test(stno)) continue;

    const ex = studentData.get(stno) || {
      militaryStatus: null,
      studyingMode: null,
      trainingMethod: null,
      militaryExemptionNo: null,
      archiveNo: null,
      parvandehNo: null,
      acceptanceType: 'سنجش و آزمون سراسری',
    };

    const arch = cleanStr(c[19], 50);
    const parv = cleanStr(c[71], 100);
    const moafNo = cleanStr(c[17], 50);
    const acc = c[14]?.trim();

    if (arch) ex.archiveNo = arch;
    if (parv) ex.parvandehNo = parv;
    if (moafNo && !ex.militaryExemptionNo) ex.militaryExemptionNo = moafNo;
    if (acc === '1') ex.acceptanceType = 'قبولی کنکور سراسری';

    studentData.set(stno, ex);
  }
  console.log(`Merged student2.txt, total valid students ready: ${studentData.size}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Creating UNLOGGED TABLE temp_student_profile_updates...');
    await client.query(`
      CREATE TEMP TABLE temp_student_profile_updates (
        "studentCode" varchar(50) PRIMARY KEY,
        "militaryStatus" varchar(50),
        "studyingMode" varchar(20),
        "trainingMethod" varchar(20),
        "acceptanceType" varchar(30),
        "militaryExemptionNo" varchar(50),
        "archiveNo" varchar(50),
        "parvandehNo" varchar(100)
      ) ON COMMIT DROP;
    `);

    console.log('Inserting updates into temp table in batches of 1000...');
    const entries = Array.from(studentData.entries());
    const batchSize = 1000;

    for (let i = 0; i < entries.length; i += batchSize) {
      const slice = entries.slice(i, i + batchSize);
      const values = [];
      const placeholders = [];

      slice.forEach(([stno, d], idx) => {
        const offset = idx * 8;
        values.push(
          stno,
          d.militaryStatus,
          d.studyingMode,
          d.trainingMethod,
          d.acceptanceType,
          d.militaryExemptionNo,
          d.archiveNo,
          d.parvandehNo
        );
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`);
      });

      await client.query(`
        INSERT INTO temp_student_profile_updates
        ("studentCode", "militaryStatus", "studyingMode", "trainingMethod", "acceptanceType", "militaryExemptionNo", "archiveNo", "parvandehNo")
        VALUES ${placeholders.join(', ')}
      `, values);
    }
    console.log('Temp table loaded successfully.');

    console.log('Running single bulk UPDATE on students table...');
    const updateRes = await client.query(`
      UPDATE students s
      SET "militaryStatus" = COALESCE(t."militaryStatus", s."militaryStatus"),
          "studyingMode" = COALESCE(t."studyingMode", s."studyingMode"),
          "trainingMethod" = COALESCE(t."trainingMethod", s."trainingMethod"),
          "acceptanceType" = COALESCE(t."acceptanceType", s."acceptanceType"),
          "militaryExemptionNo" = COALESCE(t."militaryExemptionNo", s."militaryExemptionNo"),
          "archiveNo" = COALESCE(t."archiveNo", s."archiveNo"),
          "parvandehNo" = COALESCE(t."parvandehNo", s."parvandehNo")
      FROM temp_student_profile_updates t
      WHERE s."studentCode" = t."studentCode" AND s."universityId" = 1
    `);
    console.log(`Updated ${updateRes.rowCount} students in PostgreSQL!`);

    await client.query('COMMIT');
    console.log('All student profile fields updated successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during bulk update:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
