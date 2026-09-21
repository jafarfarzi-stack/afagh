import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

function norm(s) {
  return String(s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').trim();
}

async function main() {
  const fnRes = await pool.query(`
    SELECT "firstName", count(*) as cnt
    FROM users 
    WHERE "firstName" != 'نامشخص' AND length("firstName") > 1
    GROUP BY "firstName"
    HAVING count(*) >= 2
  `);
  console.log('Known frequent first names count:', fnRes.rows.length);
  const firstNamesSet = new Set(fnRes.rows.map(r => norm(r.firstName)));

  // Add common Iranian first names just in case
  const extra = [
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
    'آفاق', 'فاطمه زهرا', 'نازنین', 'مونا', 'سید علی', 'سید محمد', 'سید مهدی'
  ];
  for (const n of extra) firstNamesSet.add(norm(n));

  // Now test how many unknown firstNames can be split
  const unknowns = await pool.query(`
    SELECT DISTINCT u.id, u."lastName", s."universityId"
    FROM users u
    JOIN students s ON s."userId" = u.id
    WHERE u."firstName" = 'نامشخص'
  `);
  console.log('Total unknown student user rows:', unknowns.rows.length);

  let solved = 0;
  let unresolved = [];

  for (const row of unknowns.rows) {
    const raw = row.lastName.trim();
    if (raw === 'نامشخص' || !raw) continue;
    const parts = raw.split(/\s+/);
    if (parts.length === 1) {
      unresolved.push({ id: row.id, uni: row.universityId, raw, reason: 'single_word' });
      continue;
    }

    let fn = '', ln = '';

    // Check compound first names of 2 words
    // 1) Is the LAST two words a compound first name? (e.g. "جمال الدین", "امیر رضا", "میر هاشم")
    const lastTwo = parts.slice(-2).join(' ');
    const firstTwo = parts.slice(0, 2).join(' ');
    const lastOne = parts[parts.length - 1];
    const firstOne = parts[0];

    // Suffixes typical of LAST name
    const hasLastSuffix = (w) => /(زاده|پور|لو|لی|وند|نژاد|فر|یان|پناه|نیا|طلب|خواه|پرور|منش|یار|فرد|آباد|کندی|باشی|اوغلی|بالو|اصل|سابق|مقدم|دوست|جو|انزابی|کیانی|احمدی|قمری|مولودی|علولی|مرادی|رحمانی|جمشیدی|جلالی|حبیبی|سرکاری|خرازی)$/.test(norm(w));

    if (row.universityId === 2 || row.universityId === 3) {
      // Zarine and Allame are ALWAYS [Family] [First]
      if (firstNamesSet.has(norm(lastTwo))) {
        fn = parts.slice(-2).join(' ');
        ln = parts.slice(0, -2).join(' ');
      } else {
        fn = lastOne;
        ln = parts.slice(0, -1).join(' ');
      }
    } else if (row.universityId === 1) {
      // Afagh is ALWAYS [First] [Family]
      if (firstNamesSet.has(norm(firstTwo))) {
        fn = firstTwo;
        ln = parts.slice(2).join(' ');
      } else {
        fn = firstOne;
        ln = parts.slice(1).join(' ');
      }
    } else {
      // Uni 4 and 5: use heuristics
      if (firstNamesSet.has(norm(lastTwo))) {
        fn = lastTwo; ln = parts.slice(0, -2).join(' ');
      } else if (firstNamesSet.has(norm(firstTwo)) && hasLastSuffix(parts[parts.length - 1])) {
        fn = firstTwo; ln = parts.slice(2).join(' ');
      } else if (firstNamesSet.has(norm(firstOne)) && !firstNamesSet.has(norm(lastOne))) {
        fn = firstOne; ln = parts.slice(1).join(' ');
      } else if (firstNamesSet.has(norm(lastOne))) {
        fn = lastOne; ln = parts.slice(0, -1).join(' ');
      } else if (hasLastSuffix(parts[0])) {
        // First part looks like family name -> [Family] [First]
        fn = lastOne; ln = parts.slice(0, -1).join(' ');
      } else {
        // Default for Uni 5 (Sama) -> [Family] [First]
        fn = lastOne; ln = parts.slice(0, -1).join(' ');
      }
    }

    if (fn && ln) {
      solved++;
    } else {
      unresolved.push({ id: row.id, uni: row.universityId, raw });
    }
  }

  console.log(`Solved: ${solved} / ${unknowns.rows.length} (${(solved/unknowns.rows.length*100).toFixed(1)}%)`);
  if (unresolved.length) {
    console.log('Unresolved count:', unresolved.length);
    console.log('Unresolved samples:', unresolved.slice(0, 10));
  }

  await pool.end();
}

main().catch(console.error);
