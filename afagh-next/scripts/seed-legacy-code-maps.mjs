import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

const periodMaps = [
  { code: '1', title: 'روزانه' },
  { code: '2', title: 'شبانه' },
  { code: '3', title: 'نیمه حضوری' },
  { code: '4', title: 'غیرانتفاعی' },
  { code: '5', title: 'دانشجویان خارجی' },
  { code: '6', title: 'روزانه - موارد خاص' },
  { code: '7', title: 'پیام نور' },
  { code: '8', title: 'دوره‌های آموزش عالی آزاد' },
  { code: '10', title: 'مجازی' },
  { code: '202', title: 'مهمانی' },
];

const militaryMaps = [
  { code: '1', title: 'خانم است و وضعیت نظام وظیفه ندارد' },
  { code: '2', title: 'مشمول است و دفترچه دارد' },
  { code: '3', title: 'مشمول است ولی دفترچه ندارد' },
  { code: '4', title: 'معافیت پزشکی یا کفالت' },
  { code: '5', title: 'دارای کارت پایان خدمت' },
  { code: '6', title: 'سرباز ترخیصی' },
  { code: '7', title: 'دارای معافیت تحصیلی' },
  { code: '8', title: 'معافیت دائم' },
  { code: '9', title: 'کارکنان پایور' },
  { code: '10', title: 'طلاب' },
  { code: '11', title: 'دانشجوی انصرافی' },
  { code: '12', title: 'دانشجوی سال آخر مقطع قبل' },
  { code: '13', title: 'فارغ التحصیل بدون غیبت' },
  { code: '14', title: 'متولد ماقبل ۵۲' },
  { code: '15', title: 'کارکنان متعهد خدمت ارگان‌ها' },
  { code: '16', title: 'مشمول نیست' },
  { code: '17', title: 'فاقد معافیت' },
  { code: '0', title: 'نامشخص' },
];

const acceptMaps = [
  { code: '-1', title: 'سنجش و آزمون سراسری' },
  { code: '0', title: 'سنجش و آزمون سراسری' },
  { code: '1', title: 'قبولی کنکور سراسری' },
  { code: '2', title: 'دانشجوی علامه خویی' },
  { code: '3', title: 'دانشجوی زرینه خوی' },
  { code: '4', title: 'دانشجوی شمس خوی' },
  { code: '5', title: 'پذیرش بر اساس سوابق تحصیلی' },
  { code: '6', title: 'کنکور سراسری' },
  { code: '7', title: 'دانشجوی نژند' },
  { code: '8', title: 'انتقال از خارج' },
  { code: '9', title: 'استعداد درخشان' },
  { code: '10', title: 'ممتاز' },
  { code: '11', title: 'نفر اول دوره قبلی' },
  { code: '12', title: 'مهمان از دانشگاه دیگر' },
  { code: '13', title: 'انتقالی' },
  { code: '14', title: 'کنکور فنی و حرفه‌ای' },
  { code: '15', title: 'کنکور کاردانی به کارشناسی ناپیوسته' },
  { code: '16', title: 'آموزش عالی آزاد' },
  { code: '17', title: 'صرفا بر اساس سوابق تحصیلی (کاردانی به کارشناسی)' },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. PERIOD_TYPE
    for (const p of periodMaps) {
      await client.query(`
        INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "legacyTitle", status, "createdAt", "updatedAt")
        VALUES ('AFAGH', 'PERIOD_TYPE', $1, $2, 'CONFIRMED', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [p.code, p.title]);
    }
    console.log('Inserted PERIOD_TYPE maps');

    // 2. MILITARY
    for (const m of militaryMaps) {
      await client.query(`
        INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "legacyTitle", status, "createdAt", "updatedAt")
        VALUES ('AFAGH', 'MILITARY', $1, $2, 'CONFIRMED', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [m.code, m.title]);
    }
    console.log('Inserted MILITARY maps');

    // 3. ACCEPT_TYPE updates
    for (const a of acceptMaps) {
      const ex = await client.query(`
        SELECT id FROM legacy_code_maps WHERE "sourceCode" = 'AFAGH' AND domain = 'ACCEPT_TYPE' AND "legacyCode" = $1
      `, [a.code]);
      if (ex.rows.length === 0) {
        await client.query(`
          INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "legacyTitle", status, "createdAt", "updatedAt")
          VALUES ('AFAGH', 'ACCEPT_TYPE', $1, $2, 'CONFIRMED', NOW(), NOW())
        `, [a.code, a.title]);
      } else {
        await client.query(`
          UPDATE legacy_code_maps SET "legacyTitle" = $1 WHERE id = $2
        `, [a.title, ex.rows[0].id]);
      }
    }
    console.log('Updated ACCEPT_TYPE maps');

    await client.query('COMMIT');
    console.log('Finished updating legacy_code_maps.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
