import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

function norm(s) {
  return String(s || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200b]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isFamilyParticle = (w) =>
  /^(زاده|پور|نژاد|فر|وند|لو|لی|اصل|پناه|نیا|طلب|خواه|پرور|منش|یار|فرد|آباد|کندی|باشی|اوغلی|بالو|سابق)$/.test(norm(w));

// A compound first name's leading word (e.g. "محمد رضا", "امیر حسین", "سید علی", "میر هاشم", "نجم الدین")
const VALID_COMPOUND_FN_PREFIXES = ['سید', 'میر', 'محمد', 'امیر', 'علی', 'عبد', 'غلام', 'فاطمه', 'نازنین', 'نجم', 'جمال', 'ضیاء', 'نور'];

const EXTRA_FIRST_NAMES = [
  'علی', 'محمد', 'مهدی', 'حسین', 'رضا', 'حسن', 'امیر', 'زهرا', 'فاطمه', 'مریم',
  'سارا', 'الناز', 'مینا', 'فرناز', 'رویا', 'سحر', 'آرزو', 'پریسا', 'امید', 'بهزاد',
  'امین', 'سالار', 'سعید', 'مسعود', 'بابک', 'دانیال', 'جابر', 'شایان', 'پیمان',
  'سینا', 'سهیل', 'نیما', 'سپیده', 'مهسا', 'نسترن', 'صبا', 'هادی', 'وحید', 'یاسر',
  'حمید', 'جواد', 'نوید', 'مصطفی', 'مرتضی', 'میلاد', 'میثم', 'فرزاد', 'بهنام',
  'سمیه', 'حبیبه', 'شیرین', 'معصومه', 'نسیبه', 'یعقوب', 'منیره', 'سیما', 'شبنم',
  'سعیده', 'سوسن', 'افسانه', 'حجت', 'سمیرا', 'دیاکو', 'آمانج', 'ایلیا', 'سبا',
  'رقیه', 'نجم الدین', 'آیدا', 'محسن', 'پرستو', 'حافظ', 'نعمت', 'عزیز', 'مظفر',
  'طاهر', 'هوشنگ', 'جمشید', 'بهرنگ', 'میرهاشم', 'میر هاشم', 'جعفر', 'بهمن', 'هیمن',
  'جمال الدین', 'اصغر', 'صاحبعلی', 'سکینه', 'فروغ', 'امیررضا', 'میرحسن', 'محمدباقر',
  'محمدرضا', 'امیرمحمد', 'امیرعلی', 'علیرضا', 'غلامرضا', 'مجید', 'شیوا', 'شیما',
  'مجتبی', 'پیام', 'یونس', 'هاجر', 'فرزانه', 'الهام', 'لیلا', 'اکرم', 'پروانه',
  'آفاق', 'فاطمه زهرا', 'نازنین', 'مونا', 'سید علی', 'سید محمد', 'سید مهدی',
  'پویا', 'میلاد', 'سینا', 'احسان', 'تورج', 'کامیار', 'افشین', 'سامان', 'نوید',
  'سهراب', 'کوروش', 'داریوش', 'فرامرز', 'اشکان', 'شهاب', 'شاهرخ', 'آرش', 'کیان',
  'آیدین', 'ائلدار', 'یاشار', 'افشار', 'بابک', 'سولماز', 'ساناز', 'آیناز', 'مهناز',
  'سیامک', 'ساسان', 'فرشاد', 'فرهاد', 'پیمان', 'شیدا', 'ندا', 'مژگان', 'شایسته',
  'پرویز', 'جمشید', 'کامران', 'شهروز', 'کیوان', 'فرید', 'فریدون', 'سیروس', 'صادق'
];

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log(`Starting unknown student names resolver (mode: ${isApply ? 'APPLY' : 'DRY RUN'})...\n`);

  const fnRes = await pool.query(`
    SELECT "firstName", count(*) as cnt
    FROM users 
    WHERE "firstName" != 'نامشخص' AND length("firstName") > 1
    GROUP BY "firstName"
    HAVING count(*) >= 2
  `);
  const firstNamesSet = new Set(fnRes.rows.map(r => norm(r.firstName)));
  for (const n of EXTRA_FIRST_NAMES) firstNamesSet.add(norm(n));

  const rows = await pool.query(`
    SELECT DISTINCT u.id, u."lastName", u."personId", s.id as "studentId", s."universityId", s."studentCode"
    FROM users u
    JOIN students s ON s."userId" = u.id
    WHERE u."firstName" = 'نامشخص'
    ORDER BY s."universityId", s."studentCode"
  `);

  console.log(`Found ${rows.rows.length} student user records with firstName = 'نامشخص'.\n`);

  let resolvedCount = 0;
  let skippedCount = 0;
  const updates = [];
  const skippedList = [];

  const hasFamilySuffix = (w) =>
    /(زاده|پور|لو|لی|وند|نژاد|فر|یان|پناه|نیا|طلب|خواه|پرور|منش|یار|فرد|آباد|کندی|باشی|اوغلی|بالو|اصل|سابق|مقدم|دوست|جو|انزابی|کیانی|احمدی|قمری|مولودی|علولی|مرادی|رحمانی|جمشیدی|جلالی|حبیبی|سرکاری|خرازی)$/.test(norm(w));

  for (const r of rows.rows) {
    let raw = (r.lastName || '').trim();
    if (!raw || raw === 'نامشخص') {
      skippedCount++;
      skippedList.push({ id: r.id, raw, reason: 'empty_or_namoshakhkhas' });
      continue;
    }

    if (raw.includes('_')) {
      const parts = raw.split('_').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const fn = parts[parts.length - 1];
        const ln = parts.slice(0, -1).join(' ');
        updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn, ln, raw, uni: r.universityId, code: r.studentCode });
        resolvedCount++;
        continue;
      }
    }

    if (raw.startsWith('-')) {
      const clean = raw.replace(/^-+/, '').trim();
      if (clean) {
        updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: clean, ln: 'نامشخص', raw, uni: r.universityId, code: r.studentCode });
        resolvedCount++;
        continue;
      }
    }

    if (raw === 'نقي‌لواميد') {
      updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: 'امید', ln: 'نقی لو', raw, uni: r.universityId, code: r.studentCode });
      resolvedCount++;
      continue;
    }
    if (raw === 'سعيدرضائي') {
      updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: 'سعید', ln: 'رضائی', raw, uni: r.universityId, code: r.studentCode });
      resolvedCount++;
      continue;
    }
    if (raw === 'سعيدميرزائي') {
      updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: 'سعید', ln: 'میرزائی', raw, uni: r.universityId, code: r.studentCode });
      resolvedCount++;
      continue;
    }
    if (raw === 'سعيدخسروي') {
      updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: 'سعید', ln: 'خسروی', raw, uni: r.universityId, code: r.studentCode });
      resolvedCount++;
      continue;
    }

    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      if (firstNamesSet.has(norm(parts[0]))) {
        updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: parts[0], ln: 'نامشخص', raw, uni: r.universityId, code: r.studentCode });
      } else {
        updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn: 'نامشخص', ln: parts[0], raw, uni: r.universityId, code: r.studentCode });
      }
      resolvedCount++;
      continue;
    }

    const lastOne = parts[parts.length - 1];
    const lastTwo = parts.slice(-2).join(' ');
    const firstOne = parts[0];
    const firstTwo = parts.slice(0, 2).join(' ');

    let fn = '', ln = '';

    if (r.universityId === 2 || r.universityId === 3) {
      // Uni 2 & 3: strictly [Family Name] [First Name]
      const isCompoundLast = parts.length > 2 && VALID_COMPOUND_FN_PREFIXES.includes(norm(parts[parts.length - 2])) && !isFamilyParticle(parts[parts.length - 1]);
      if (isCompoundLast) {
        fn = lastTwo;
        ln = parts.slice(0, -2).join(' ');
      } else {
        fn = lastOne;
        ln = parts.slice(0, -1).join(' ');
      }
    } else if (r.universityId === 1) {
      // Uni 1: strictly [First Name] [Family Name]
      const isCompoundFirst = parts.length > 2 && VALID_COMPOUND_FN_PREFIXES.includes(norm(parts[0])) && !isFamilyParticle(parts[1]);
      if (isCompoundFirst) {
        fn = firstTwo;
        ln = parts.slice(2).join(' ');
      } else {
        fn = firstOne;
        ln = parts.slice(1).join(' ');
      }
    } else {
      // Uni 4 & 5
      const isCompoundLast = parts.length > 2 && VALID_COMPOUND_FN_PREFIXES.includes(norm(parts[parts.length - 2])) && !isFamilyParticle(parts[parts.length - 1]);
      const isCompoundFirst = parts.length > 2 && VALID_COMPOUND_FN_PREFIXES.includes(norm(parts[0])) && !isFamilyParticle(parts[1]);

      if (isCompoundLast) {
        fn = lastTwo;
        ln = parts.slice(0, -2).join(' ');
      } else if (isCompoundFirst && hasFamilySuffix(parts[parts.length - 1])) {
        fn = firstTwo;
        ln = parts.slice(2).join(' ');
      } else if (firstNamesSet.has(norm(lastOne))) {
        fn = lastOne;
        ln = parts.slice(0, -1).join(' ');
      } else if (firstNamesSet.has(norm(firstOne))) {
        fn = firstOne;
        ln = parts.slice(1).join(' ');
      } else if (hasFamilySuffix(parts[0])) {
        fn = lastOne;
        ln = parts.slice(0, -1).join(' ');
      } else {
        fn = lastOne;
        ln = parts.slice(0, -1).join(' ');
      }
    }

    if (fn && ln) {
      updates.push({ id: r.id, personId: r.personId, studentId: r.studentId, fn, ln, raw, uni: r.universityId, code: r.studentCode });
      resolvedCount++;
    } else {
      skippedCount++;
      skippedList.push({ id: r.id, raw });
    }
  }

  console.log(`Resolved: ${resolvedCount} records. Skipped: ${skippedCount} records.`);
  if (skippedList.length) {
    console.log('Skipped samples:', skippedList);
  }

  // Check sample Uni 2 & Uni 3 resolutions
  const uni2Samples = updates.filter(u => u.uni === 2).slice(0, 5);
  const uni3Samples = updates.filter(u => u.uni === 3).slice(0, 5);
  console.log('\nUni 2 samples:');
  for (const u of uni2Samples) console.log(`  STNO: ${u.code} | "${u.raw}" => First: "${u.fn}", Last: "${u.ln}"`);
  console.log('\nUni 3 samples:');
  for (const u of uni3Samples) console.log(`  STNO: ${u.code} | "${u.raw}" => First: "${u.fn}", Last: "${u.ln}"`);

  if (isApply) {
    console.log('\nApplying updates to database (users, persons, person_source_identities)...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let uCount = 0;
      for (const u of updates) {
        await client.query(`UPDATE users SET "firstName" = $1, "lastName" = $2 WHERE id = $3`, [u.fn, u.ln, u.id]);
        if (u.personId) {
          await client.query(`
            UPDATE persons 
            SET "canonicalFirstName" = CASE WHEN "canonicalFirstName" = 'نامشخص' OR "canonicalFirstName" IS NULL THEN $1 ELSE "canonicalFirstName" END,
                "canonicalLastName" = CASE WHEN "canonicalLastName" = $3 OR "canonicalLastName" = 'نامشخص' OR "canonicalLastName" IS NULL THEN $2 ELSE "canonicalLastName" END
            WHERE id = $4
          `, [u.fn, u.ln, u.raw, u.personId]);
        }
        if (u.studentId) {
          await client.query(`
            UPDATE person_source_identities
            SET "sourceFirstName" = $1, "sourceLastName" = $2,
                "normalizedFirstName" = $1, "normalizedLastName" = $2
            WHERE "studentId" = $3
          `, [u.fn, u.ln, u.studentId]);
        }
        uCount++;
      }
      await client.query('COMMIT');
      console.log(`Successfully updated ${uCount} records in the database!`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error applying updates, transaction rolled back:', err);
    } finally {
      client.release();
    }
  } else {
    console.log('\nRun with --apply to write these changes to the database.');
  }

  await pool.end();
}

main().catch(console.error);
