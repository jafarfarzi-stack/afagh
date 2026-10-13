/**
 * ساخت/تکمیل حساب‌های دمو در یک دیتابیس محلی + صدور توکن نشست.
 *
 * چرا لازم است؟
 *  • `ensureDemoUser` در `src/lib/auth.ts` فقط هنگام **ورود از فرم** اجرا می‌شود؛
 *    اگر فرم ورود در محیط توسعه hydrate نشود (یا برای آزمون خودکار/اسکرین‌شات
 *    بخواهیم بدون UI وارد شویم) راهی برای ساختن رکوردهای دمو و گرفتن نشست نیست.
 *  • این اسکریپت همان کار را می‌کند، با **توابع خود اپ**: رمز با `hashPassword`
 *    و نشست با همان شِمای `sessions` (ذخیرهٔ sha256 توکن).
 *  • فهرست حساب‌ها از خود `DEMO_ACCOUNTS` در `src/lib/auth.ts` خوانده می‌شود تا
 *    نسخهٔ دومی از آن فهرست در مخزن نماند.
 *
 * امنیت: روی دیتابیس محلی/دمو اجرا می‌شود. `AFAGH_DEMO_PASSWORD` باید صریح ست
 * شود (بدون پیش‌فرض) و در production هیچ‌وقت اجرا نشود.
 *
 * استفاده:
 *   DATABASE_URL=… AFAGH_DEMO_PASSWORD=… npx tsx scripts/seed-demo-session.ts [nationalCode…]
 * خروجی: آخرین خط `SHOT_TOKENS={...}` — توکن خام برای کوکی `token`.
 */
import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  users, students, staff, sessions, user_roles, roles,
  degree_level_configs, educational_regulations, majors, departments,
} from '@/db/schema';
import { hashPassword, DEMO_ACCOUNTS } from '@/lib/auth';

const DEMO_PASSWORD = process.env.AFAGH_DEMO_PASSWORD;
if (!DEMO_PASSWORD) {
  console.error('❌ AFAGH_DEMO_PASSWORD الزامی است (رمز حساب‌های دمو).');
  process.exit(2);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function ensureUser(nc: string): Promise<string> {
  const a = DEMO_ACCOUNTS[nc];
  if (!a) throw new Error(`حساب دمو ${nc} در DEMO_ACCOUNTS نیست`);

  let [u] = await db.select().from(users).where(eq(users.nationalCode, nc)).limit(1);
  if (!u) {
    const passwordHash = await hashPassword(DEMO_PASSWORD!);
    [u] = await db.insert(users).values({
      nationalCode: nc,
      firstName: a.firstName,
      lastName: a.lastName,
      passwordHash,
      mustChangePassword: 0,
      isActive: 1,
    }).returning();
    console.log(`  + کاربر ساخته شد: ${a.firstName} ${a.lastName} (${nc}) id=${u.id}`);
  } else {
    console.log(`  = کاربر موجود: ${a.firstName} ${a.lastName} (${nc}) id=${u.id}`);
  }

  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, a.role)).limit(1);
  if (role) await db.insert(user_roles).values({ userId: u.id, roleId: role.id }).onConflictDoNothing();
  else console.warn(`  ⚠ نقش ${a.role} در جدول roles نیست`);

  if (a.isStudent) {
    const [ex] = await db.select({ id: students.id }).from(students).where(eq(students.userId, u.id)).limit(1);
    if (!ex) {
      const [deg] = await db.select({ id: degree_level_configs.id }).from(degree_level_configs).limit(1);
      const [reg] = await db.select({ id: educational_regulations.id }).from(educational_regulations).limit(1);
      const [maj] = await db.select({ id: majors.id }).from(majors).where(eq(majors.majorCode, '412')).limit(1);
      await db.insert(students).values({
        userId: u.id,
        studentCode: nc,
        degreeLevelId: deg?.id ?? null,
        regulationId: reg?.id ?? null,
        majorId: maj?.id ?? null,
        status: 'ACTIVE',
        entryYear: 1403,
        currentTermNo: 3,
      }).onConflictDoNothing();
      console.log(`    + رکورد students (degree=${deg?.id}, reg=${reg?.id}, major=${maj?.id})`);
    }
  }

  if (a.staffCode) {
    const [ex] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, u.id)).limit(1);
    if (!ex) {
      let deptId: number | null = null;
      if (a.departmentCode) {
        const [d] = await db.select({ id: departments.id }).from(departments)
          .where(eq(departments.departmentCode, a.departmentCode)).limit(1);
        deptId = d?.id ?? null;
      }
      await db.insert(staff).values({ userId: u.id, staffCode: a.staffCode, departmentId: deptId, isActive: 1 });
      console.log(`    + رکورد staff (code=${a.staffCode}, dept=${deptId})`);
    }
  }

  const token = randomBytes(32).toString('hex');
  await db.delete(sessions).where(eq(sessions.userId, u.id));
  await db.insert(sessions).values({ token: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + 4 * 3600 * 1000) });
  return token;
}

async function main() {
  // students.regulationId اجباری است و هیچ مهاجرت/سیدی این جدول را پر نمی‌کند.
  let [reg] = await db.select({ id: educational_regulations.id }).from(educational_regulations).limit(1);
  if (!reg) {
    const [deg] = await db.select({ id: degree_level_configs.id }).from(degree_level_configs).limit(1);
    if (!deg) throw new Error('degree_level_configs خالی است — اول `npm run db:base` را اجرا کنید');
    [reg] = await db.insert(educational_regulations).values({
      title: 'آیین‌نامهٔ آموزشی (محیط دمو)',
      degreeLevelId: deg.id,
      effectiveFromYear: 1400,
      rulesConfig: '{}',
    }).returning({ id: educational_regulations.id });
    console.log(`  + آیین‌نامهٔ دمو ساخته شد id=${reg.id}`);
  }

  const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(DEMO_ACCOUNTS);
  const out: Record<string, string> = {};
  for (const nc of targets) out[nc] = await ensureUser(nc);
  console.log('\n--- توکن‌های نشست (برای کوکی `token`) ---');
  console.log('SHOT_TOKENS=' + JSON.stringify(out));
}

main().then(() => process.exit(0)).catch(e => { console.error('FAIL', e); process.exit(1); });
