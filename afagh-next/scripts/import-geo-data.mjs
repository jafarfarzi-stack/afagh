import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

// Decodes windows-1256 buffer to string
function decodeWin1256(buf) {
  // Simple windows-1256 decoder for Persian / Arabic
  const decoder = new TextDecoder('windows-1256');
  return decoder.decode(buf);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Creating geo tables in database...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_countries (
        code VARCHAR(20) PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        "standardCode" VARCHAR(50),
        "ministryCode" VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS geo_provinces (
        code VARCHAR(20) PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        "standardCode" VARCHAR(50),
        "sanjeshCode" VARCHAR(50),
        "ministryCode" VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS geo_cities (
        id SERIAL PRIMARY KEY,
        "provinceCode" VARCHAR(20) NOT NULL REFERENCES geo_provinces(code),
        code VARCHAR(20) NOT NULL,
        title VARCHAR(150) NOT NULL,
        "standardCode" VARCHAR(50),
        "ministryCode" VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_geo_cities_province_code UNIQUE ("provinceCode", code)
      );

      CREATE TABLE IF NOT EXISTS geo_districts (
        id SERIAL PRIMARY KEY,
        "provinceCode" VARCHAR(20) NOT NULL,
        "cityCode" VARCHAR(20) NOT NULL,
        code VARCHAR(20) NOT NULL,
        title VARCHAR(150) NOT NULL,
        "ministryCode" VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_geo_districts_hierarchy UNIQUE ("provinceCode", "cityCode", code)
      );

      CREATE INDEX IF NOT EXISTS idx_geo_cities_code ON geo_cities(code);
      CREATE INDEX IF NOT EXISTS idx_geo_cities_province ON geo_cities("provinceCode");
      CREATE INDEX IF NOT EXISTS idx_geo_districts_code ON geo_districts(code);
    `);
    console.log('Tables created or verified.');

    // 1) Import Provinces
    const provBuf = fs.readFileSync('E:\\git\\information afagh\\استان3.txt');
    const provText = decodeWin1256(provBuf);
    const provLines = provText.split(/\r?\n/).filter(l => l.trim().length > 0);
    let provCount = 0;
    for (let i = 1; i < provLines.length; i++) {
      const cols = provLines[i].split('\t').map(c => c.trim());
      if (cols.length >= 2 && cols[0]) {
        await client.query(`
          INSERT INTO geo_provinces (code, title, "standardCode", "sanjeshCode", "ministryCode")
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (code) DO UPDATE 
          SET title = EXCLUDED.title, "standardCode" = EXCLUDED."standardCode", 
              "sanjeshCode" = EXCLUDED."sanjeshCode", "ministryCode" = EXCLUDED."ministryCode";
        `, [cols[0], cols[1], cols[2] || null, cols[3] || null, cols[4] || null]);
        provCount++;
      }
    }
    console.log(`Imported ${provCount} provinces.`);

    // 2) Import Countries
    const cBuf = fs.readFileSync('E:\\git\\information afagh\\کشور.txt');
    const cText = decodeWin1256(cBuf);
    const cLines = cText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const countryRecords = [];
    let curCode = null;
    let curTitleParts = [];

    for (let i = 1; i < cLines.length; i++) {
      const cols = cLines[i].split('\t');
      if (cols.length >= 3 && /^\d+$/.test(cols[cols.length - 2].trim()) && curCode !== null) {
        if (cols[0].trim()) curTitleParts.push(cols[0].trim());
        const fullTitle = curTitleParts.join(' ').trim();
        const stdCode = cols[cols.length - 2].trim();
        const minCode = cols[cols.length - 1].trim();
        countryRecords.push({ code: curCode, title: fullTitle, stdCode, minCode });
        curCode = null;
        curTitleParts = [];
      } else if (cols.length === 4 && /^\d+$/.test(cols[0].trim())) {
        countryRecords.push({ code: cols[0].trim(), title: cols[1].trim(), stdCode: cols[2].trim(), minCode: cols[3].trim() });
      } else if (/^\d+$/.test(cols[0].trim()) && cols.length >= 2) {
        curCode = cols[0].trim();
        if (cols[1].trim()) curTitleParts.push(cols[1].trim());
      } else {
        curTitleParts.push(cLines[i].trim());
      }
    }

    let countryCount = 0;
    for (const c of countryRecords) {
      await client.query(`
        INSERT INTO geo_countries (code, title, "standardCode", "ministryCode")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code) DO UPDATE
        SET title = EXCLUDED.title, "standardCode" = EXCLUDED."standardCode", "ministryCode" = EXCLUDED."ministryCode";
      `, [c.code, c.title, c.stdCode || null, c.minCode || null]);
      countryCount++;
    }
    console.log(`Imported ${countryCount} countries.`);

    // 3) Import Cities
    const cityBuf = fs.readFileSync('E:\\git\\information afagh\\شهر.txt');
    const cityText = decodeWin1256(cityBuf);
    const cityLines = cityText.split(/\r?\n/).filter(l => l.trim().length > 0);
    let cityCount = 0;
    for (let i = 1; i < cityLines.length; i++) {
      const cols = cityLines[i].split('\t').map(c => c.trim());
      if (cols.length >= 3 && cols[0] && cols[1]) {
        // Ensure parent province exists
        await client.query(`
          INSERT INTO geo_cities ("provinceCode", code, title, "standardCode", "ministryCode")
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT ("provinceCode", code) DO UPDATE
          SET title = EXCLUDED.title, "standardCode" = EXCLUDED."standardCode", "ministryCode" = EXCLUDED."ministryCode";
        `, [cols[0], cols[1], cols[2], cols[3] || null, cols[4] || null]);
        cityCount++;
      }
    }
    console.log(`Imported ${cityCount} cities.`);

    // 4) Import Districts
    const distBuf = fs.readFileSync('E:\\git\\information afagh\\بخش.txt');
    const distText = decodeWin1256(distBuf);
    const distLines = distText.split(/\r?\n/).filter(l => l.trim().length > 0);
    let distCount = 0;
    for (let i = 1; i < distLines.length; i++) {
      const cols = distLines[i].split('\t').map(c => c.trim());
      if (cols.length >= 4 && cols[0] && cols[1] && cols[2]) {
        await client.query(`
          INSERT INTO geo_districts ("provinceCode", "cityCode", code, title, "ministryCode")
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT ("provinceCode", "cityCode", code) DO UPDATE
          SET title = EXCLUDED.title, "ministryCode" = EXCLUDED."ministryCode";
        `, [cols[0], cols[1], cols[2], cols[3], cols[4] || null]);
        distCount++;
      }
    }
    console.log(`Imported ${distCount} districts.`);

    console.log('All geo data successfully imported into PostgreSQL!');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
