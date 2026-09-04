import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

/**
 * ══════════════════════════════════════════════════════════════
 *  دفاع CSRF برای Route Handlerها (نه Server Actions)
 *
 *  Server Actions در Next.js محافظ داخلی دارند؛ اما Route Handlerهای
 *  POST/PUT/DELETE که با کوکی نشست کار می‌کنند تا قبل از این هیچ
 *  محافظ مبدأ نداشتند — با کوکی SameSite=None (HTTPS) یک حملهٔ
 *  CSRF قابل اجرا بود (C-2).
 *
 *  قواعد (مطابق الگوی رایج Django/OWASP):
 *   ۱) اگر هدر Origin موجود باشد → باید با Host درخواست هم‌مبدأ باشد
 *      (یا در لیست سفید ALLOWED_EXTRA_ORIGINS قرار گیرد).
 *   ۲) اگر Origin نبود ولی Referer بود → Referer باید هم‌مبدأ باشد.
 *   ۳) نه Origin نه Referer → کلاینت غیرمرورگری (curl/cron/server)؛
 *      CSRF واقعی نمی‌تواند بدون Origin/Referer در مرورگر رخ دهد → مجاز.
 *
 *  فقط host مقایسه می‌شود (نه scheme) تا پشت پروکسی Caddy کار کند.
 * ══════════════════════════════════════════════════════════════
 */

const EXTRA_ORIGINS = (process.env.ALLOWED_EXTRA_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function hostOf(urlOrHost: string): string {
  try {
    return new URL(urlOrHost).host;
  } catch {
    return urlOrHost;
  }
}

/** اگر پاسخ برگرداند → باید فوراً همان پاسخ برگردانده شود؛ وگرنه null یعنی مجاز. */
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const host = req.headers.get('host') ?? hostOf(req.url);

  const origin = req.headers.get('origin');
  if (origin) {
    const originHost = hostOf(origin);
    const ok = originHost === host || EXTRA_ORIGINS.includes(origin);
    if (!ok) {
      return NextResponse.json(
        { error: 'منشأ درخواست با سامانه هم‌خوان نیست (CSRF blocked).' },
        { status: 403 },
      );
    }
    return null;
  }

  const referer = req.headers.get('referer');
  if (referer) {
    const refHost = hostOf(referer);
    if (refHost !== host && !EXTRA_ORIGINS.some((o) => hostOf(o) === refHost)) {
      return NextResponse.json(
        { error: 'منشأ درخواست با سامانه هم‌خوان نیست (CSRF blocked).' },
        { status: 403 },
      );
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════
//  ب) دفاع CSRF در Server Actions (بازبینی — بند ۱۰)
//
//  Next.js Server Actions به‌طور داخلی Origin را بررسی می‌کند، اما این گارد
//  صریح برای عملیات حساس (تغییر رمز، مالی، تأیید درخواست، چک/وام/تخفیف)
//  لایهٔ دوم می‌سازد — مطابق اصل «به SameSite اکتفا نکن».
//  درخواست‌های غیرمرورگری (بدون Origin: cron، تست‌ها) مجازند.
// ════════════════════════════════════════════════════════════════════════

export async function assertServerActionOrigin(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const h = await headers();
    const host = h.get('host') ?? '';
    const origin = h.get('origin') ?? '';
    if (!origin) return { ok: true }; // curl/cron/test — CSRF مرورگری بدون Origin رخ نمی‌دهد
    const originHost = hostOf(origin);
    if (originHost === host || EXTRA_ORIGINS.includes(origin) || EXTRA_ORIGINS.some((o) => hostOf(o) === originHost)) {
      return { ok: true };
    }
    return { ok: false, error: 'منشأ درخواست با سامانه هم‌خوان نیست (CSRF blocked).' };
  } catch {
    return { ok: true };
  }
}

// ════════════════════════════════════════════════════════════════════════
//  ج) مجوز سطح-شیء (Object-Level Authorization — بازبینی بند ۳)
//
//  «Role Authorization» (ادمین/مالی) کافی نیست؛ باید مشخص باشد کارشناس مالی
//  روی *کدام* دانشجو مجاز است. سیاست پیش‌فرض: همهٔ دانشجویان (مطابق گردش
//  کار فعلی دانشگاه). با AFAGH_OBJECT_SCOPE=department قابل فعال‌سازی است:
//  کارشناس فقط دانشجوی گروه/دانشکدهٔ خودش را می‌بیند/تغییر می‌دهد.
// ════════════════════════════════════════════════════════════════════════

export async function requireStudentScope(studentId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const mode = (process.env.AFAGH_OBJECT_SCOPE || 'all').toLowerCase();
  if (mode !== 'department' && mode !== 'faculty') return { ok: true };

  try {
    const { getSessionUser } = await import('@/lib/auth');
    const { db } = await import('@/db');
    const { staff, students, majors } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const me = await getSessionUser();
    if (!me) return { ok: false, error: 'unauthorized' };

    // 🔴 استثناء صریح (نه fail-open): مدیر سامانه در سطح کلان است و مشمول حوزهٔ
    // سازمانی نمی‌شود — بقیهٔ نقش‌ها کاملاً مشمول fail-closed می‌شوند.
    if (me.roles.includes('ADMIN')) return { ok: true };

    const [s] = await db
      .select({ id: staff.id, departmentId: staff.departmentId, facultyId: staff.facultyId })
      .from(staff)
      .where(eq(staff.userId, me.id))
      .limit(1);
    const [stu] = await db
      .select({ departmentId: majors.departmentId, facultyId: majors.facultyId })
      .from(students)
      .leftJoin(majors, eq(majors.id, students.majorId))
      .where(eq(students.id, studentId))
      .limit(1);

    // 🔒 FAIL-CLOSED (بازبینی — High): دادهٔ ناقص یا نبود پرونده → DENY.
    //   «بدون دادهٔ کافی → اجازه» قبلاً مسیر fail-open بود — لغو شد.
    if (!s) {
      return { ok: false, error: 'پروندهٔ سازمانی شما (staff) یافت نشد — دسترسی رد شد (fail-closed).' };
    }
    if (!stu) {
      return { ok: false, error: 'پروندهٔ دانشجو یافت نشد — دسترسی رد شد (fail-closed).' };
    }

    if (mode === 'department') {
      if (s.departmentId == null || stu.departmentId == null) {
        return { ok: false, error: 'نبودِ گروه سازمانی برای مقایسه — دسترسی رد شد (fail-closed).' };
      }
      if (stu.departmentId !== s.departmentId) {
        return { ok: false, error: 'دسترسی به پروندهٔ این دانشجو در حوزهٔ سازمانی شما نیست (Object-Level Authorization).' };
      }
    } else {
      if (s.facultyId == null || stu.facultyId == null) {
        return { ok: false, error: 'نبودِ دانشکدهٔ سازمانی برای مقایسه — دسترسی رد شد (fail-closed).' };
      }
      if (stu.facultyId !== s.facultyId) {
        return { ok: false, error: 'دسترسی به پروندهٔ این دانشجو در حوزهٔ سازمانی شما نیست (Object-Level Authorization).' };
      }
    }
    return { ok: true };
  } catch (err: any) {
    // 🔒 هر خطای غیرمنتظره → DENY + لاگ (هرگز fail-open)
    console.error('[scope] ⛔ خطا در بررسی حوزهٔ سازمانی — دسترسی رد شد (fail-closed):', err?.message);
    return { ok: false, error: 'خطا در بررسی سطح دسترسی؛ دوباره تلاش کنید.' };
  }
}
