import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionTransport, UNKNOWN_CLIENT_IP } from '@/lib/proxy-trust';
import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { ensureBaseReferenceData } from '@/lib/base-data';
import { clearPermissionCache } from '@/lib/permissions-enforcer';
import { getRateLimitCount, progressiveDelay, rateLimit, releaseRateLimit } from '@/lib/rateLimit';
import { requestClientIp } from '@/lib/request-context';
import {
  degree_level_configs,
  educational_regulations,
  majors,
  roles,
  sessions,
  staff,
  departments,
  students,
  universities,
  user_roles,
  users,
} from '@/db/schema';

const scrypt = promisify(_scrypt) as (p: string, s: string, k: number, o: object) => Promise<Buffer>;
/** کف امنیتی N=16384 — کمتر از آن در production خطای fail-closed می‌دهد (هش ضعیف = کرک سریع). */
const SCRYPT_N_RAW = Number(process.env.AFAGH_SCRYPT_N || 16384);
if (!Number.isInteger(SCRYPT_N_RAW) || SCRYPT_N_RAW < 16384) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[auth] AFAGH_SCRYPT_N زیر کف مجاز 16384 در production است — سامانه بالا نمی‌آید (fail-closed).');
  }
  console.error(`⚠ [auth] AFAGH_SCRYPT_N نامعتبر (${process.env.AFAGH_SCRYPT_N}) — از کف 16384 استفاده می‌شود.`);
}
const SCRYPT_OPTS = { N: Number.isInteger(SCRYPT_N_RAW) && SCRYPT_N_RAW >= 16384 ? SCRYPT_N_RAW : 16384, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

/** هش ساختگی با فرمت معتبر — فقط برای پدینگ زمان‌ثابت در مسیر «کاربر یافت نشد». */
const DUMMY_PASSWORD_HASH = `${'0'.repeat(32)}:${'0'.repeat(64)}`;

/** فرمت هش فاز صفر: salt:hash (scrypt) — همان الگو، مهاجرت‌پذیر */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const calc = await scrypt(password, salt, 32, SCRYPT_OPTS);
  const known = Buffer.from(hash, 'hex');
  return calc.length === known.length && timingSafeEqual(calc, known);
}

export type SessionUser = { id: number; name: string; roles: string[]; mustChangePassword: boolean; universityId: number | null };

export const SESSION_COOKIE = 'token';
/**
 * سقف مطلق نشست (۴ ساعت) — بدون تمدید لغزان.
 * انقضای کوکی و sessions.expiresAt هر دو همین سقف‌اند؛ هیچ ستون createdAt
 * وجود ندارد و افزودن آن تغییر schema است، پس تمدید بر اساس «زمان ساخت»
 * ممکن/مجاز نیست. ورود دوباره تنها راه شروع نشست تازه است.
 * (پیشتر ۱۲ ساعت بود؛ به‌دلیل امنیت کاهش یافت — در صورت نیاز env AFAGH_SESSION_MAX_AGE.)
 */
const SESSION_MAX_HOURS_RAW = Number(process.env.AFAGH_SESSION_MAX_HOURS || 4);
const SESSION_MAX_HOURS = Number.isFinite(SESSION_MAX_HOURS_RAW) && SESSION_MAX_HOURS_RAW >= 1 && SESSION_MAX_HOURS_RAW <= 24
  ? Math.floor(SESSION_MAX_HOURS_RAW)
  : 4;
const SESSION_MAX_AGE = SESSION_MAX_HOURS * 3600;

/**
 * ── ویژگی‌های کوکی نشست ──────────────────────────────────────────────
 *  • httpOnly: همیشه true؛ جاوااسکریپت صفحه (و XSS) به توکن دسترسی ندارد.
 *  • path: '/'؛ نشست در همهٔ مسیرهای برنامه لازم است (کوکی باریک‌تر یعنی
 *    قطع شدن گاردها در بخش‌های دیگر). مسیر باریک‌تر فقط برای کوکی‌های
 *    ترجیحی/فیلتر (مثل afagh_students_nc_filter) مناسب است.
 *  • domain: عمداً ست نمی‌شود (host-only) تا کوکی به زیردامنه‌ها سرایت نکند.
 *  • maxAge: ۱۲ ساعت مطلق (بالا) — بدون sliding renewal.
 *  • secure / sameSite: فقط از sessionTransport در proxy-trust.ts؛ ماتریس
 *    کامل تصمیم و قاعدهٔ «SameSite=None بدون Secure ممنوع» همان‌جاست.
 *
 * ── چرا از پیشوند __Host- استفاده نشد؟ ─────────────────────────────
 *  پیشوند __Host- امن‌تر است (Secure + Path=/ + بدون Domain را الزام می‌کند
 *  و جلوی cookie tossing از زیردامنه را می‌گیرد)، اما در چیدمان فعلی
 *  «امن» نیست:
 *    ۱) توسعهٔ محلی روی HTTP پشتیبانی می‌شود و در آن Secure=false است؛
 *       مرورگر کوکی __Host- بدون Secure را رد می‌کند. بنابراین نام کوکی
 *       باید بین محیط‌ها متفاوت می‌شد (نام پویا) که خودش پیچیدگی و ریسک
 *       خواندن اشتباه را اضافه می‌کند.
 *    ۲) تغییر نام، همهٔ نشست‌های زندهٔ فعلی (تا ۱۲ ساعت) را بی‌اعتبار
 *       می‌کند؛ مگر این‌که یک دورهٔ مهاجرت «خواندن هر دو نام + نوشتن نام
 *       جدید + حذف نام قدیمی» پیاده شود. این فاز فقط اجازهٔ تغییر در
 *       تنظیم/پاک‌سازی کوکی را دارد و افزودن مسیر مهاجرتِ تست‌نشده
 *       (بدون build/test در این محیط) ریسک قفل‌شدن کاربران را دارد.
 *  در نتیجه نام فعلی حفظ شد. مسیر پیشنهادی برای فاز بعد (با تست):
 *    الف) خواندن توکن از هر دو نام token و __Host-afagh_session؛
 *    ب) نوشتن فقط __Host-afagh_session در محیط Secure؛
 *    ج) حذف token هنگام ورود/خروج؛
 *    د) پس از یک دورهٔ ۱۲ ساعته (انقضای کامل نشست‌های قدیمی) حذف نام قدیمی.
 * ────────────────────────────────────────────────────────────────────
 *
 * فلگ‌های ENV: AFAGH_COOKIE_SECURE=auto|true|false ،
 *              AFAGH_COOKIE_SAMESITE=auto|lax|none|strict
 */
export async function sessionCookieOptions(): Promise<{
  httpOnly: true; path: string; maxAge: number; secure: boolean; sameSite: 'lax' | 'none' | 'strict';
}> {
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    AFAGH_PUBLIC_BASE_URL: process.env.AFAGH_PUBLIC_BASE_URL,
    AFAGH_COOKIE_SECURE: process.env.AFAGH_COOKIE_SECURE,
    AFAGH_COOKIE_SAMESITE: process.env.AFAGH_COOKIE_SAMESITE,
  };
  const { secure, sameSite } = sessionTransport(env);
  return { httpOnly: true, path: '/', maxAge: SESSION_MAX_AGE, secure, sameSite };
}

/**
 * نشستِ کاربری که باید رمزش را عوض کند فقط برای جریان تغییر رمز (و خروج) معتبر است؛
 * بقیهٔ گاردها (APIها، اکشن‌ها، layout ها) آن را «بدون نشست» می‌بینند.
 */
export async function getSessionUser(opts?: { allowPendingPasswordChange?: boolean }): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id, firstName: users.firstName, lastName: users.lastName, role: roles.code,
      mustChangePassword: users.mustChangePassword, isActive: users.isActive, universityId: users.universityId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(user_roles, eq(user_roles.userId, users.id))
    .leftJoin(roles, eq(roles.id, user_roles.roleId))
    .where(and(eq(sessions.token, sha256(token)), gt(sessions.expiresAt, new Date())));
  if (!rows.length) return null;
  // ⛔ غیرفعال‌سازیِ «کامل» کاربر: نشستِ باز هم بی‌اعتبار است، نه فقط ورودِ بعدی.
  //    اینجا همهٔ کانال‌های مبتنی بر کوکی (وب، کارتابل، اکشن‌ها و APIها) قطع می‌شوند.
  if (rows[0].isActive !== 1) {
    await db.delete(sessions).where(eq(sessions.token, sha256(token)));
    return null;
  }
  // 🔒 تغییر اجباری رمز: تا تغییر رمز، هیچ گارد عمومی نشست معتبر نمی‌بیند.
  if (rows[0].mustChangePassword === 1 && !opts?.allowPendingPasswordChange) return null;
  return {
    id: rows[0].id,
    name: rows[0].firstName + ' ' + rows[0].lastName,
    // یک نقش ممکن است چند سطر user_roles داشته باشد — تکراری‌ها را حذف می‌کنیم
    // تا نشان‌های نقش در هدر دو بار نمایش داده نشوند.
    roles: [...new Set(rows.map(r => r.role).filter(Boolean))] as string[],
    mustChangePassword: rows[0].mustChangePassword === 1,
    universityId: rows[0].universityId ?? null,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = await scrypt(password, salt, 32, SCRYPT_OPTS);
  return `${salt}:${buf.toString('hex')}`;
}

/**
 * 🔒 حالت دمو (DEMO_MODE) — پیش‌فرض خاموش (opt-in) + fail-closed در production:
 *   • فقط با `AFAGH_DEMO_MODE=1` صریح فعال می‌شود؛ در غیر این صورت false.
 *   • در production همیشه false — هیچ ENVای آن را فعال نمی‌کند.
 */
let demoGateWarned = false;
export function isDemoMode(): boolean {
  // 🔒 قفل build-time (بازبینی — بند ۵): در ایمیج تولید، NEXT_PUBLIC_AFAGH_DEMO_LOCK=1
  // هنگام build در Dockerfile ست می‌شود و Next آن را در باندل جای‌گذاری می‌کند؛
  // یعنی «کد دمو در build تولید اساساً غیرفعال است» — نه فقط با ENV قابل خاموش‌کردن.
  if (process.env.NEXT_PUBLIC_AFAGH_DEMO_LOCK === '1') return false;
  const env = (process.env.AFAGH_DEMO_MODE ?? process.env.DEMO_MODE ?? '').trim().toLowerCase();
  if (!env) return false; // 🔒 پیش‌فرض خاموش — فعال‌سازی فقط با ENV صریح (opt-in)
  const enabled = env === '1' || env === 'true';
  if (!enabled) return false;
  if (process.env.NODE_ENV === 'production') {
    // 🔒 fail-closed: دمو در production هرگز فعال نمی‌شود — حتی با ENV صریح.
    if (enabled && !demoGateWarned) {
      demoGateWarned = true;
      console.error('⛔ CRITICAL [demo] درخواست حالت دمو در production رد شد — دمو در محیط تولید همیشه غیرفعال است (fail-closed).');
    }
    return false;
  }
  return true;
}

/**
 * رمز حساب‌های دمو — فقط از AFAGH_DEMO_PASSWORD صریح خوانده می‌شود؛
 * هرگز تولید تصادفی و هرگز چاپ در stdout/لاگ.
 * اگر حالت دمو فعال باشد ولی متغیر ست نشده باشد، با خطای صریح fail می‌کند.
 */
const __demoPwGlobal = globalThis as unknown as { __afaghDemoPw?: string };
function resolveDemoPassword(): string {
  if (__demoPwGlobal.__afaghDemoPw) return __demoPwGlobal.__afaghDemoPw;
  const fromEnv = (process.env.AFAGH_DEMO_PASSWORD || '').trim();
  if (fromEnv) {
    __demoPwGlobal.__afaghDemoPw = fromEnv;
    return fromEnv;
  }
  // 🔒 بدون رمز صریح، حساب دمو ساخته نمی‌شود — هیچ رمزی تولید/چاپ نمی‌شود.
  // ensureDemoUser قبل از مصرف این مقدار isDemoMode را چک می‌کند، پس این خطا
  // فقط وقتی رخ می‌دهد که دمو واقعاً نیاز به رمز داشته باشد.
  throw new Error('[demo] حالت دمو فعال است ولی AFAGH_DEMO_PASSWORD ست نشده است — برای ساخت حساب‌های دمو باید رمز صریح در ENV بدهید.');
}
/** رمز دمو — lazy: فقط وقتی خوانده می‌شود که دمو واقعاً نیازش داشته باشد. */
export function getDemoPassword(): string {
  return resolveDemoPassword();
}

export const DEMO_ACCOUNTS: Record<string, { firstName: string; lastName: string; role: string; staffCode?: string; departmentCode?: string; isStudent?: boolean }> = {
  '0000000001': { firstName: 'مدیر', lastName: 'سامانه', role: 'ADMIN' },
  '0011111111': { firstName: 'محمد', lastName: 'رضایی', role: 'PROFESSOR', staffCode: 'F-101' },
  '0022222222': { firstName: 'زهرا', lastName: 'احمدی', role: 'PROFESSOR', staffCode: 'F-102' },
  '0033333333': { firstName: 'حسین', lastName: 'کاظمی', role: 'PROFESSOR', staffCode: 'F-103' },
  '0044444444': { firstName: 'سیدامیر', lastName: 'موسوی', role: 'DEP_HEAD', staffCode: 'F-201', departmentCode: '3' }, // گروه علوم کامپیوتر
  // ── دو کاربر دموی «مدیر گروه» (فاز ۱۱): هرکدام به یک گروهٔ واقعی متصل می‌شوند ──
  '0041111111': { firstName: 'احمدرضا', lastName: 'توکلی', role: 'DEP_HEAD', staffCode: 'F-202', departmentCode: '1' }, // گروه مهندسی کامپیوتر
  '0042222222': { firstName: 'لیلا', lastName: 'فرهادی', role: 'DEP_HEAD', staffCode: 'F-203', departmentCode: '2' }, // گروه مهندسی برق
  '0055555555': { firstName: 'فاطمه', lastName: 'محمدی', role: 'EDU_EXPERT', staffCode: 'S-301' },
  '0066666666': { firstName: 'علی', lastName: 'نیک‌پور', role: 'VICE_EDU', staffCode: 'S-401' },
  '0077777777': { firstName: 'مریم', lastName: 'صادقی', role: 'FINANCE_EXPERT', staffCode: 'S-501' },
  '0088888888': { firstName: 'ناصر', lastName: 'کریمی', role: 'MILITARY_OFFICER', staffCode: 'S-601' },
  '0099999999': { firstName: 'لیلا', lastName: 'آقایی', role: 'ARCHIVE_EXPERT', staffCode: 'S-701' },
  '0012121212': { firstName: 'علیرضا', lastName: 'مراقب‌زاده', role: 'PROCTOR', staffCode: 'P-801' },
  '0034343434': { firstName: 'سعید', lastName: 'مخزنی', role: 'VAULT_MANAGER', staffCode: 'V-901' },
  '1010101010': { firstName: 'علی', lastName: 'رضایی اصل', role: 'STUDENT', isStudent: true },
  '31412001': { firstName: 'علی', lastName: 'رضایی اصل', role: 'STUDENT', isStudent: true },
  '0012345678': { firstName: 'علی', lastName: 'رضایی اصل', role: 'STUDENT', isStudent: true },
};

/**
 * ساخت/تکمیل رکورد «دانشجوی دمو» — حتی اگر کاربر از قبل موجود باشد.
 *
 * 🔴 دلیل وجود این تابع (رفع باگ «پروندهٔ دانشجویی یافت نشد.»):
 * استقرار Docker سرویس migrator را اجرا می‌کند که فقط جدول‌ها را می‌سازد
 * (drizzle-kit push) و هیچ دادهٔ پایه‌ای seed نمی‌کند؛ در نتیجه روی نصب تازه
 * جدول‌های degree_level_configs و educational_regulations خالی‌اند و
 * ensureDemoUser قدیمی شرط «degree && regulation» را رد می‌کرد و ردیف
 * students ساخته نمی‌شد — دانشجوی دمو وارد می‌شد ولی پورتالش «پروندهٔ
 * دانشجویی یافت نشد.» می‌داد. این تابع ابتدا دادهٔ پایه را تضمین می‌کند
 * (ensureBaseReferenceData — idempotent) و سپس رکورد دانشجو را می‌سازد.
 */
async function ensureDemoStudentRecord(userId: number, nationalCode: string): Promise<void> {
  const [existing] = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId)).limit(1);
  if (existing) return; // پرونده موجود است — کاری نیست

  await ensureBaseReferenceData();

  const [degree] = await db.select({ id: degree_level_configs.id }).from(degree_level_configs).limit(1);
  const [regulation] = await db.select({ id: educational_regulations.id }).from(educational_regulations).limit(1);
  if (!degree || !regulation) return; // غیرممکن پس از ensureBaseReferenceData — فقط محافظت

  // رشتهٔ پیش‌فرض دمو: مهندسی نرم‌افزار (کد 412)؛ اگر موجود نبود، اولین رشته
  const [major] = await db.select({ id: majors.id }).from(majors).where(eq(majors.majorCode, '412')).limit(1);

  await db.insert(students).values({
    userId,
    studentCode: nationalCode === '0012345678' ? '31412001' : nationalCode,
    degreeLevelId: degree.id,
    regulationId: regulation.id,
    majorId: major?.id ?? null,
    status: 'ACTIVE',
    entryYear: 1403,
    currentTermNo: 3,
  }).onConflictDoNothing({ target: students.userId });
}

/** یافتن شناسهٔ گروه بر اساس کد گروه seed-base ('1'=کامپیوتر، '2'=برق، …) */
async function resolveDepartmentId(departmentCode: string): Promise<number | null> {
  const [dep] = await db.select({ id: departments.id }).from(departments).where(eq(departments.departmentCode, departmentCode)).limit(1);
  return dep?.id ?? null;
}

/** idempotent: اگر استافِ دمو گروه نداشت، به گروهٔ واقعی متصل می‌شود */
async function linkDemoDepHead(staffId: number, departmentCode: string): Promise<void> {
  const [row] = await db.select({ departmentId: staff.departmentId }).from(staff).where(eq(staff.id, staffId)).limit(1);
  if (row?.departmentId) return;
  const depId = await resolveDepartmentId(departmentCode);
  if (depId) await db.update(staff).set({ departmentId: depId }).where(eq(staff.id, staffId));
}

async function ensureDemoUser(nc: string) {
  const demo = DEMO_ACCOUNTS[nc];
  if (!demo || !isDemoMode()) return null; // 🔒 در production هرگز پروویژن خودکار دمو

  let [u] = await db.select().from(users).where(eq(users.nationalCode, nc)).limit(1);
  if (!u && demo.isStudent) {
    const [st] = await db
      .select({ user: users })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(eq(students.studentCode, nc))
      .limit(1);
    if (st) u = st.user;
  }

  if (u) {
    // 🔒 حسابِ دستیِ غیرفعال‌شده هرگز خودکار فعال نمی‌شود (provision-only):
    //    فعال‌سازی مجدد فقط با فلگ صریح AFAGH_DEMO_REACTIVATE=1 (پیش‌فرض خاموش).
    //    در غیر این صورت null برمی‌گردد تا ورود ناموفق بماند.
    if (!u.isActive) {
      const allowRe = (process.env.AFAGH_DEMO_REACTIVATE || '').trim().toLowerCase();
      if (allowRe !== '1' && allowRe !== 'true') return null;
      await db.update(users).set({ isActive: 1 }).where(eq(users.id, u.id));
      u.isActive = 1;
    }
    // 🔴 قبلاً اینجا بدون هیچ ترمیمی برمی‌گشتیم — ردیف students هرگز ساخته نمی‌شد
    if (demo.isStudent) await ensureDemoStudentRecord(u.id, nc);
    // 🔗 فاز ۱۱: اتصال گروه در ورودهای بعدی هم idempotent اعمال می‌شود
    if (demo.staffCode && demo.departmentCode) {
      const [stRow] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, u.id)).limit(1);
      if (stRow) await linkDemoDepHead(stRow.id, demo.departmentCode);
    }
    return u;
  }

  // Provision missing demo user — رمز فقط از ENV صریح؛ اگر نباشد خطای واضح می‌دهد
  const passwordHash = await hashPassword(getDemoPassword());
  const [created] = await db
    .insert(users)
    .values({
      nationalCode: nc,
      firstName: demo.firstName,
      lastName: demo.lastName,
      passwordHash,
      isActive: 1,
    })
    .returning();

  if (created) {
    let [roleRow] = await db.select().from(roles).where(eq(roles.code, demo.role)).limit(1);
    if (!roleRow) {
      const [newRole] = await db.insert(roles).values({ code: demo.role, title: demo.role }).returning();
      roleRow = newRole;
    }
    if (roleRow) {
      await db.insert(user_roles).values({ userId: created.id, roleId: roleRow.id }).catch(() => {});
      clearPermissionCache();
    }

    if (demo.staffCode) {
      const [staffRow] = await db.insert(staff).values({
        userId: created.id,
        staffCode: demo.staffCode,
        staffType: demo.role === 'PROFESSOR' ? 'هیئت علمی' : 'اداری',
        // فاز ۱۱: مدیر گروه دمو مستقیم به گروهٔ واقعی متصل می‌شود (پنل مدیر گروه بدون no-dept)
        departmentId: demo.departmentCode ? (await resolveDepartmentId(demo.departmentCode)) : null,
      }).returning({ id: staff.id });
      if (demo.departmentCode && staffRow?.id) {
        await linkDemoDepHead(staffRow.id, demo.departmentCode);
      }
    } else if (demo.isStudent) {
      await ensureDemoStudentRecord(created.id, nc);
    }
  }

  return created ?? null;
}

/** سقف نشست همزمان — منسوخ: issueSessionFor اکنون همهٔ نشست‌های قبلی کاربر را باطل می‌کند (ضد fixation). نگه‌داشته برای سازگاری. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MAX_SESSIONS_PER_USER = 8;

/** نگاشت فایل مبدأ: کد استاد → کد ملی (فقط سرور). معکوسش برای گسترش کاندیداهای ورود. */
import { STAFF_NC_MAP } from '@/lib/staff-nc-map.generated';
import { toEnDigits } from '@/lib/persian-search';
const NC_TO_CODES = new Map<string, string[]>();
for (const [code, nc] of Object.entries(STAFF_NC_MAP)) {
  const arr = NC_TO_CODES.get(nc);
  if (arr) arr.push(code);
  else NC_TO_CODES.set(nc, [code]);
}

export type LoginCandidate = {
  id: number; name: string; staffCodes: string[]; universityTitle: string | null; roles: string[];
};

/** صدور نشست برای کاربرِ مشخص (پس از احراز هویت) — تنها محل ساخت sessions */
export async function issueSessionFor(userId: number): Promise<{ mustChange: boolean }> {
  const [u] = await db.select({ mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new Error('کاربر یافت نشد.');
  const token = randomBytes(32).toString('hex');

  // ── ضد تثبیت نشست (session fixation): همهٔ نشست‌های قبلی کاربر باطل می‌شود ──
  //    تا کوکیِ مهاجم‌نشانی‌شده پس از ورود قربانی قابل سوءاستفاده نباشد.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.delete(sessions).where(eq(sessions.userId, userId));

  await db.insert(sessions).values({ token: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000) });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, await sessionCookieOptions());
  // 🔓 ورودِ موفق یعنی احراز هویت تازه: هر قفل بیکاریِ باقی‌مانده از نشست/دستگاه
  // قبلی باید پاک شود، وگرنه کاربر بلافاصله بعد از لاگین همان «صفحه قفل» را
  // می‌بیند و مجبور است رمز را دوباره بزند (قفل per-user بود، نه per-session).
  // import پویا: auth نباید وابستگیِ ثابت به ماژول server-onlyِ قفل داشته باشد.
  const { clearSessionLock } = await import('@/lib/session-lock');
  await clearSessionLock(userId).catch(() => {});
  // حساب تازه‌پذیرش‌شده با رمز پیش‌فرض → اجبار به تغییر رمز در اولین ورود
  return { mustChange: u.mustChangePassword === 1 };
}

/** خلاصهٔ نمایشی حساب‌ها برای صفحهٔ «انتخاب حساب» (فقط حساب‌هایی که رمز درست بوده) */
async function candidateSummaries(userIds: number[]): Promise<LoginCandidate[]> {
  const out: LoginCandidate[] = [];
  for (const id of userIds) {
    const [u] = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, universityId: users.universityId })
      .from(users).where(eq(users.id, id)).limit(1);
    if (!u) continue;
    const sts = await db.select({ staffCode: staff.staffCode }).from(staff).where(eq(staff.userId, id));
    const rls = await db.select({ code: roles.code }).from(user_roles)
      .innerJoin(roles, eq(roles.id, user_roles.roleId)).where(eq(user_roles.userId, id));
    let uniTitle: string | null = null;
    if (u.universityId) {
      const [t] = await db.select({ title: universities.title }).from(universities).where(eq(universities.id, u.universityId)).limit(1);
      uniTitle = t?.title ?? null;
    }
    out.push({
      id: u.id,
      name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || '—',
      staffCodes: sts.map((s) => s.staffCode),
      universityTitle: uniTitle,
      roles: rls.map((r) => r.code).filter(Boolean) as string[],
    });
  }
  return out;
}

const LOGIN_FAILED_MSG = 'شناسه یا رمز نادرست است.';

/** سقف ورود از یک IP تمام شده — login.actions آن را به پیام عمومی تبدیل می‌کند. */
export class LoginRateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super('LOGIN_RATE_LIMITED');
  }
}

export async function login(
  identifier: string, password: string,
): Promise<{ ok: boolean; error?: string; mustChange?: boolean; needChoice?: boolean; token?: string; candidates?: LoginCandidate[] }> {
  // ── M-1: محدودیت تلاش ورود — دو لایه تا قفل یک حساب به حساب دیگر سرایت نکند:
  //   ۱) per-IP (۱۰۰/۱۰دقیقه؛ بالای سقف، رد سخت با LoginRateLimitError)
  //   ۲) per-account (۵/۱۰دقیقه + تأخیر تصاعدی؛ قفل همان پیام عمومی رمز نادرست را می‌دهد)
  // هر تلاش «پیش از scrypt» رزرو می‌شود (INCR) و فقط در صورت موفقیت آزاد می‌شود —
  // بدین ترتیب درخواست‌های همزمان نمی‌توانند از سقف عبور کنند.
  // شناسه ممکن است با کیبورد فارسی تایپ شده باشد (ارقام ۰-۹)؛ همهٔ کدهای
  // سیستمی انگلیسی‌اند پس اول نرمال می‌کنیم تا ورود اول شکست نخورد.
  const clean = toEnDigits(identifier.trim());
  // IP فقط از مسیر HMAC-احراز‌شدهٔ پروکسی خوانده می‌شود؛ هدر جعل‌پذیر هرگز.
  const ip = (await requestClientIp()) ?? UNKNOWN_CLIENT_IP;
  // کلید IP هش می‌شود چون IP از هدر پروکسی می‌آید و نباید خام در Redis بنشیند.
  const ipKey = `login:ip:${sha256(ip).slice(0, 24)}`;
  const accKey = `login:acc:${sha256(clean).slice(0, 24)}`;
  const releaseReservation = async () => {
    await releaseRateLimit(ipKey);
    await releaseRateLimit(accKey);
  };

  const ipRl = await rateLimit(ipKey, 100, 10 * 60);
  if (!ipRl.ok) throw new LoginRateLimitError(ipRl.retryAfterSec);

  const priorFails = await getRateLimitCount(accKey).catch(() => 0);
  if (priorFails > 0) await progressiveDelay(priorFails).catch(() => {});
  const accRl = await rateLimit(accKey, 5, 10 * 60);
  if (!accRl.ok) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH).catch(() => false);
    return { ok: false, error: LOGIN_FAILED_MSG };
  }

  // شناسه می‌تواند «کد پرسنلی/کاربری» یا «شماره دانشجویی» باشد.
  // 🔒 ورود با کدملی حذف شد (کدملی روی حساب‌های چندگانهٔ یک نفر تکراری است و
  // تعارض ورود می‌ساخت) — حتی در حالت دمو؛ حساب‌های دمو با کد پرسنلی/دانشجویی
  // وارد می‌شوند. کدپرسنلی در سطح دانشگاه یکتاست؛ یک نفر ممکن
  // است چند حساب داشته باشد — همهٔ کاندیداها را به ترتیب id امتحان می‌کنیم.
  const cands: typeof users.$inferSelect[] = [];
  const seen = new Set<number>();
  const byStaff = await db
    .select({ user: users })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .where(eq(staff.staffCode, clean))
    .orderBy(asc(users.id))
    .then((rows) => rows.map((r) => r.user));
  for (const c of byStaff) if (!seen.has(c.id)) { seen.add(c.id); cands.push(c); }
  if (!cands.length) {
    // جستجو بر اساس شماره دانشجویی
    const stuRows = await db
      .select({ user: users })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(eq(students.studentCode, clean))
      .orderBy(asc(users.id))
      .then((rows) => rows.map((r) => r.user));
    for (const c of stuRows) if (!seen.has(c.id)) { seen.add(c.id); cands.push(c); }
  }
  // ── گسترش هم‌شخصی: اگر شناسه کدملی/کدپرسنلیِ یک نفرِ دوکده باشد،
  // حساب‌های linked او هم کاندیدا می‌شوند؛ ورود به هر حساب فقط با رمزِ همان حساب.
  // (مثلاً با کدملی 2754765824 و رمزِ 901101 وارد کارتابلِ 901101 می‌شوی.)
  const linkedCodes = new Set<string>();
  const ownNc = STAFF_NC_MAP[clean];
  if (ownNc) for (const c of NC_TO_CODES.get(ownNc) ?? []) linkedCodes.add(c);
  for (const c of NC_TO_CODES.get(clean) ?? []) linkedCodes.add(c);
  if (linkedCodes.size) {
    const linked = await db
      .select({ user: users })
      .from(staff)
      .innerJoin(users, eq(users.id, staff.userId))
      .where(inArray(staff.staffCode, [...linkedCodes]))
      .orderBy(asc(users.id))
      .then((rows) => rows.map((r) => r.user));
    for (const c of linked) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        cands.push(c);
      }
    }
  }
  const matched = [];
  // گذرواژه عیناً چک می‌شود؛ اگر با ارقام فارسی تایپ شده بود، فرم نرمال‌شده هم
  // پذیرفته می‌شود (فقط پذیرش بیشتر، بدون تغییر هش‌های موجود).
  const passwordVariants = [password];
  const normPass = toEnDigits(password);
  if (normPass !== password) passwordVariants.push(normPass);
  // پدینگ زمان‌ثابت: وقتی کاندیدای فعالی نیست، یک verify ساختگی می‌زنیم تا
  // زمان پاسخِ «ناموجود» و «نادرست» یکسان شود.
  if (!cands.some((c) => c.isActive)) await verifyPassword(password, DUMMY_PASSWORD_HASH).catch(() => false);
  for (const cand of cands) {
    if (!cand.isActive) continue;
    for (const pw of passwordVariants) {
      if (await verifyPassword(pw, cand.passwordHash)) { matched.push(cand); break; }
    }
  }
  if (!matched.length) {
    // شمارش از پیش رزرو شده است (کاربر ناموجود هم همین کلید را می‌سوزاند تا
    // شمارش حساب‌ها از روی پیام/قفل ممکن نباشد). پیام یکتا برای همه.
    return { ok: false, error: LOGIN_FAILED_MSG };
  }
  await releaseReservation();
  if (matched.length === 1) {
    const { mustChange } = await issueSessionFor(matched[0].id);
    return { ok: true, mustChange };
  }
  // یک شناسه، چند حسابِ هم‌رمز → کاربر خودش انتخاب می‌کند وارد کدام کارتابل شود.
  const { signToken } = await import('@/lib/verification');
  let token: string;
  try {
    token = await signToken({ uids: matched.map((m) => m.id).join(','), ident: clean }, 5 * 60);
  } catch (e) {
    // اگر امضای توکن به هر دلیل (مثلاً نبود کلید) شکست خورد، به‌جای ۵۰۰،
    // خطای قابل‌فهم بده + راه جایگزین (ورود جداگانه با کد هر حساب).
    try {
      const { createLogger } = await import('@/lib/logger');
      createLogger({ mod: 'auth' }).error('login_choice_sign_failed', { error: (e as Error)?.message ?? String(e) });
    } catch { /* لاگ اختیاری است */ }
    return { ok: false, error: 'خطای داخلی در آماده‌سازی انتخاب حساب. لطفاً با کد پرسنلی/دانشجویی هر حساب جداگانه وارد شوید.' };
  }
  const candidates = await candidateSummaries(matched.map((m) => m.id));
  return { ok: false, needChoice: true, token, candidates };
}

/** انتخاب حساب پس از مرحلهٔ «چند حساب با یک شناسه» — توکن امضاشدهٔ ۵دقیقه‌ای */
export async function chooseLoginAccount(
  token: string, userId: number,
): Promise<{ ok: boolean; error?: string; mustChange?: boolean }> {
  const rl = await rateLimit(`choose:${(await requestClientIp()) ?? UNKNOWN_CLIENT_IP}`, 10, 10 * 60);
  if (!rl.ok) {
    return { ok: false, error: 'تلاش بیش از حد مجاز. چند دقیقه دیگر دوباره تلاش کنید.' };
  }
  const { verifyTokenSignature } = await import('@/lib/verification');
  const v = await verifyTokenSignature<{ uids: string; ident: string }>(token);
  if (!v.ok) return { ok: false, error: 'نشست انتخاب حساب منقضی شده است. دوباره وارد شوید.' };
  const allowed = String(v.payload.uids || '').split(',').map(Number).filter(Boolean);
  if (!allowed.includes(userId)) return { ok: false, error: 'حساب معتبر نیست.' };
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !u.isActive) return { ok: false, error: 'حساب غیرفعال است.' };
  const { mustChange } = await issueSessionFor(userId);
  return { ok: true, mustChange };
}

/** تغییر رمز عبور کاربر جاری (با تأیید رمز فعلی) — حلقهٔ «تغییر اجباری رمز» */
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getSessionUser({ allowPendingPasswordChange: true });
  if (!me) return { ok: false, error: 'برای تغییر رمز ابتدا وارد شوید.' };
  const [u] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!u) return { ok: false, error: 'کاربر یافت نشد.' };
  if (!(await verifyPassword(currentPassword, u.passwordHash))) {
    // اغماض حالت کیبورد: رمز فعلی با ارقام فارسی تایپ شده باشد
    const normCur = toEnDigits(currentPassword);
    if (normCur === currentPassword || !(await verifyPassword(normCur, u.passwordHash)))
      return { ok: false, error: 'رمز فعلی نادرست است.' };
  }
  const trimmed = newPassword.trim();
  if (trimmed.length < 10) return { ok: false, error: 'رمز جدید باید حداقل ۱۰ کاراکتر باشد.' };
  if (trimmed.length > 128) return { ok: false, error: 'رمز جدید باید حداکثر ۱۲۸ کاراکتر باشد.' };
  if (!/[A-Za-z]/.test(trimmed) || !/[0-9]/.test(trimmed))
    return { ok: false, error: 'رمز جدید باید حداقل یک حرف و یک رقم داشته باشد.' };
  if (trimmed === currentPassword) return { ok: false, error: 'رمز جدید نباید با رمز فعلی یکسان باشد.' };
  const passwordHash = await hashPassword(trimmed);
  await db.update(users).set({ passwordHash, mustChangePassword: 0 }).where(eq(users.id, u.id));

  // ── M-4/بازبینی: ابطال همهٔ نشست‌های دیگر کاربر (تغییر رمز = سوءظن یا اشتراک دستگاه) ──
  //    نشست جاری حفظ می‌شود تا کاربر وسط کار اخراج نشود.
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(SESSION_COOKIE)?.value ?? '';
  await db.delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.token, sha256(currentToken))));
  return { ok: true };
}

/** ابطال همهٔ نشست‌های یک کاربر — برای رویدادهای حساس (غیرفعال‌سازی، تغییر نقش، ریست رمز توسط ادمین) */
export async function invalidateUserSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function logout() {
  const cookieStore = await cookies();
  const u = await getSessionUser({ allowPendingPasswordChange: true });
  if (u) await db.delete(sessions).where(eq(sessions.userId, u.id)); // logout everywhere
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, sha256(token))); // fallback
  // قفل بیکاری را هم پاک کن: کاربری که خارج شده نباید در ورودِ بعدی قفل ببیند
  if (u) {
    const { clearSessionLock } = await import('@/lib/session-lock');
    await clearSessionLock(u.id).catch(() => {});
  }
  cookieStore.delete(SESSION_COOKIE);
  return { ok: true };
}

/**
 * بستن نشستِ همین دستگاه (نه همهٔ دستگاه‌ها).
 * برای «غیبت طولانی» استفاده می‌شود: نشست همین مرورگر باطل و قفل بیکاری پاک
 * می‌شود تا کاربر به صفحهٔ ورود برود — به‌جای نمایش صفحهٔ قفل روی دادهٔ کهنهٔ
 * چند ساعت پیش.
 *
 * ⚠ کوکی این‌جا حذف نمی‌شود: این تابع از داخل رندر layout (Server Component)
 * صدا زده می‌شود و Next.js فقط در Server Action / Route Handler اجازهٔ تغییر
 * کوکی می‌دهد. کوکیِ کهنه به نشستِ حذف‌شده اشاره می‌کند، پس getSessionUser آن
 * را نامعتبر می‌بیند و صفحهٔ ورود نمایش داده می‌شود؛ ورود بعدی کوکی را
 * بازنویسی می‌کند.
 */
export async function endCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? '';
  // کاربر را پیش از حذف نشست بخوان (وگرنه getSessionUser دیگر چیزی پیدا نمی‌کند)
  const u = await getSessionUser({ allowPendingPasswordChange: true }).catch(() => null);
  if (token) {
    try {
      await db.delete(sessions).where(eq(sessions.token, sha256(token)));
    } catch { /* نشست شاید قبلاً حذف شده — بی‌اثر */ }
  }
  if (u) {
    const { clearSessionLock } = await import('@/lib/session-lock');
    await clearSessionLock(u.id).catch(() => {});
  }
}

/** گیت نقش در layout ها — ریدایرکت به پورتال درست (سه داشبورد ایزوله — سند §۲۸۶۵) */
export async function requireRole(allowed: string[]): Promise<SessionUser> {
  const u = await getSessionUser({ allowPendingPasswordChange: true });
  if (!u) redirect('/login');
  // قبل از هر چیزی: رمز پیش‌فرض باید عوض شود (حساب‌های پذیرش‌شده)
  if (u.mustChangePassword) redirect('/change-password');
  if (!u.roles.some(r => allowed.includes(r) || r === 'ADMIN')) redirect(homeFor(u.roles));
  return u;
}

export function homeFor(roles: string[]): string {
  // نقشی ندارد → برگرد به ورود با پیام روشن (جلوگیری از حلقهٔ بی‌پایان ورود)
  if (roles.length === 0) return '/login?e=norole';
  if (roles.includes('STUDENT')) return '/student';
  if (roles.includes('PROCTOR') && !roles.includes('ADMIN') && !roles.includes('EDU_EXPERT')) return '/proctor';
  if (roles.includes('PROFESSOR') && !roles.includes('ADMIN') && !roles.includes('EDU_EXPERT')) return '/professor';
  // مدیر گروهی که استاد هم هست، بالاتر به /professor رفته است؛ پنل مدیر گروه از
  // همان‌جا یک کلیک فاصله دارد (کارتابل‌ها ادغام شده‌اند). این خط برای کسی است
  // که *فقط* مدیر گروه است و قبلاً اشتباهاً به /admin فرستاده می‌شد.
  if (roles.includes('DEP_HEAD') && !roles.includes('ADMIN') && !roles.includes('EDU_EXPERT') && !roles.includes('VICE_EDU'))
    return '/group-manager';
  if (roles.includes('FINANCE_EXPERT') || roles.includes('FINANCE')) return '/admin/payroll';
  if (roles.includes('VAULT_MANAGER')) return '/admin/exams';
  if (roles.includes('MILITARY_OFFICER')) return '/admin/students';
  if (roles.includes('ARCHIVE_EXPERT')) return '/admin/archive';
  // کارشناس فارغ‌التحصیلی فقط «میز دفاع پایان‌نامه» را در شاخهٔ /admin می‌بیند؛
  // فرستادنش به /admin که گاردِ دیگری دارد، حلقهٔ ریدایرکت می‌ساخت.
  if (roles.includes('GRADUATION_EXPERT') && !roles.includes('ADMIN') && !roles.includes('EDU_EXPERT') && !roles.includes('VICE_EDU'))
    return '/admin/defense-scheduling';
  return '/admin';
}

export async function getStudentByUser(userId: number) {
  // یک کاربر می‌تواند چند پروندهٔ دانشجویی داشته باشد (مثلاً یک NO_SHOW قدیمی
  // + یک ACTIVE جدید). بدون ترتیب، limit(1) پروندهٔ اشتباه را برمی‌دارد و پنل
  // در همهٔ ترم‌ها خالی نشان می‌دهد — پس ACTIVE اول، بعد جدیدترین.
  const [s] = await db.select().from(students).where(eq(students.userId, userId))
    .orderBy(sql`CASE WHEN ${students.status} = 'ACTIVE' THEN 0 ELSE 1 END`, desc(students.id)).limit(1);
  if (s) return s;
  // ── خودترمیم: اگر کاربر دمو است ولی رکورد دانشجویی ندارد (مشکل شناخته‌شدهٔ
  //    نصب تازه)، پرونده را همان لحظه می‌سازیم تا صفحه‌ها «پرونده یافت نشد» ندهند.
  try {
    const [u] = await db.select({ nationalCode: users.nationalCode }).from(users).where(eq(users.id, userId)).limit(1);
    if (isDemoMode() && u && DEMO_ACCOUNTS[u.nationalCode]?.isStudent) {
      await ensureDemoStudentRecord(userId, u.nationalCode);
      const [s2] = await db.select().from(students).where(eq(students.userId, userId))
        .orderBy(sql`CASE WHEN ${students.status} = 'ACTIVE' THEN 0 ELSE 1 END`, desc(students.id)).limit(1);
      return s2 ?? null;
    }
  } catch (err: any) {
    console.error('[auth] خودترمیم پروندهٔ دانشجو ناموفق:', err?.message);
  }
  return null;
}
export async function getStaffByUser(userId: number) {
  const [s] = await db.select().from(staff).where(eq(staff.userId, userId)).limit(1);
  return s ?? null;
}
