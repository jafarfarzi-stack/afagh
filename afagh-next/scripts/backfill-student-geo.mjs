import pg from 'pg';
import fs from 'fs';
import readline from 'readline';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

function normalizePersian(str) {
  if (!str) return '';
  return str
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const client = await pool.connect();
  try {
    // 1) Load provinces and cities into memory maps
    const provRes = await client.query('SELECT code, title FROM geo_provinces');
    const provMap = new Map();
    for (const r of provRes.rows) provMap.set(r.code, r.title);

    const cityRes = await client.query('SELECT "provinceCode", code, title FROM geo_cities');
    const cityMap = new Map(); // key: `${provCode}:${cityCode}`
    const cityByCodeOnly = new Map(); // key: cityCode -> title
    for (const r of cityRes.rows) {
      cityMap.set(`${r.provinceCode}:${r.code}`, r.title);
      if (!cityByCodeOnly.has(r.code)) cityByCodeOnly.set(r.code, r.title);
    }

    console.log(`Loaded ${provMap.size} provinces and ${cityMap.size} cities into memory.`);

    // 2) Parse studentraw data.txt
    const fileStream = fs.createReadStream('E:\\git\\information afagh\\studentraw data.txt', { encoding: 'latin1' }); // latin1 passes bytes 1:1
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let headerRead = false;
    let stno_i = -1, otvl_i = -1, stvl_i = -1, btvl_i = -1, ms_i = -1;

    // Buffer updates: studentCode -> { birthPlace, issuePlace, birthPlaceCode, issuePlaceCode }
    const studentGeoMap = new Map();

    // Windows-1256 decoder
    const decoder = new TextDecoder('windows-1256');

    for await (const rawLine of rl) {
      // Decode bytes
      const buf = Buffer.from(rawLine, 'latin1');
      const line = decoder.decode(buf);

      if (!headerRead) {
        if (line.includes('STNO') && line.includes('NAME')) {
          const headers = line.split('\t').map(h => h.trim());
          stno_i = headers.indexOf('STNO');
          otvl_i = headers.indexOf('OTVL');
          stvl_i = headers.indexOf('STVL');
          btvl_i = headers.indexOf('BTVL');
          ms_i = headers.indexOf('MS');
          headerRead = true;
          console.log(`Headers found: STNO=${stno_i}, OTVL=${otvl_i}, STVL=${stvl_i}, MS=${ms_i}`);
        }
        continue;
      }

      const cols = line.split('\t').map(c => c.trim());
      if (stno_i >= cols.length) continue;
      const stno = cols[stno_i];
      if (!stno || stno === 'STNO') continue;

      const otvl = otvl_i >= 0 && otvl_i < cols.length ? cols[otvl_i] : '';
      const stvl = stvl_i >= 0 && stvl_i < cols.length ? cols[stvl_i] : '';
      const ms = ms_i >= 0 && ms_i < cols.length ? cols[ms_i] : '';

      // Determine birth place
      let birthPlace = null;
      let provName = provMap.get(otvl) || '';
      let cityName = cityMap.get(`${otvl}:${stvl}`) || (stvl ? cityByCodeOnly.get(stvl) : '') || '';

      if (cityName) {
        birthPlace = normalizePersian(cityName);
      } else if (provName) {
        birthPlace = normalizePersian(provName);
      } else if (ms) {
        birthPlace = normalizePersian(ms);
      }

      const issuePlace = ms ? normalizePersian(ms) : null;
      const birthCode = stvl ? (otvl ? `${otvl}-${stvl}` : stvl) : null;

      if (birthPlace || issuePlace || birthCode) {
        studentGeoMap.set(stno, {
          birthPlace,
          issuePlace,
          birthPlaceCode: birthCode,
          issuePlaceCode: null,
        });
      }
    }

    console.log(`Extracted geo info for ${studentGeoMap.size} students.`);

    // 3) Update users and students in the database
    // We update users joined via students.userId
    let updatedCount = 0;

    // Process in batches
    const studentCodes = Array.from(studentGeoMap.keys());
    const batchSize = 1000;

    for (let i = 0; i < studentCodes.length; i += batchSize) {
      const batchCodes = studentCodes.slice(i, i + batchSize);

      // Build values list for update
      const values = [];
      for (const sc of batchCodes) {
        const info = studentGeoMap.get(sc);
        values.push(`('${sc}', ${info.birthPlace ? `'${info.birthPlace.replace(/'/g, "''")}'` : 'NULL'}, ${info.issuePlace ? `'${info.issuePlace.replace(/'/g, "''")}'` : 'NULL'}, ${info.birthPlaceCode ? `'${info.birthPlaceCode}'` : 'NULL'})`);
      }

      const query = `
        UPDATE users u
        SET 
          "placeOfBirth" = COALESCE(v.bplace, u."placeOfBirth"),
          "placeOfIssue" = COALESCE(v.iplace, u."placeOfIssue"),
          "birthPlaceCode" = COALESCE(v.bcode, u."birthPlaceCode")
        FROM (VALUES ${values.join(',')}) AS v(scode, bplace, iplace, bcode)
        JOIN students s ON s."studentCode" = v.scode
        WHERE u.id = s."userId";
      `;

      const res = await client.query(query);
      updatedCount += res.rowCount;
      if ((i + batchSize) % 5000 === 0 || i + batchSize >= studentCodes.length) {
        console.log(`Processed ${Math.min(i + batchSize, studentCodes.length)} / ${studentCodes.length} student records... (updated ${updatedCount} users so far)`);
      }
    }

    console.log(`Completed backfill! Total users updated: ${updatedCount}`);

    // Verify Babak and Ramin
    const testRes = await client.query(`
      SELECT s."studentCode", u."name", u."placeOfBirth", u."placeOfIssue", u."birthPlaceCode"
      FROM students s
      JOIN users u ON u.id = s."userId"
      WHERE s."studentCode" IN ('9921312004', '9922344004');
    `);
    console.log('Verification check:');
    console.log(testRes.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Backfill error:', err);
  process.exit(1);
});
