import 'server-only';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { universities } from '@/db/schema';
import { getSetting } from '@/lib/settings';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'lms-api' });

function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function timingEq(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, 'hex');
    const b = Buffer.from(bHex, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * ── مدل چندمؤسسه‌ای (Tenant) در API کششی مودل ─────────────────────────────
 *
 * هر «دانشگاه» یک tenant مستقل است و با `universities.id` (و `universities.code`)
 * شناسایی می‌شود. جدول‌های دادهٔ آموزشی (`academic_terms`, `course_offerings`,
 * `students`, `staff`, `enrollments`, `schedules`, …) ستون `universityId` دارند
 * و همین ستون مرز امنیتی است. یک توکن LMS هرگز نباید بیش از یک دانشگاه ببیند.
 *
 * احراز هویت (فقط هدر — پارامتر `?token=` عمداً حذف شده تا در access log/URL
 * ذخیره نشود):
 *   ۱) `Authorization: Bearer <token>` (توصیه‌شده)
 *   ۲) `x-lms-token: <token>` (سازگاری با پلاگین فعلی مودل)
 *
 * نگاشت توکن → دانشگاه، بدون هیچ تغییر در schema:
 *   • `MOODLE_PULL_TOKENS` در ENV — فهرست جداشده با ویرگول/خط جدید:
 *       MOODLE_PULL_TOKENS="tokA:AFAGH,tokB:ZARINE"
 *     هر ورودی «توکن:کد دانشگاه» یا «توکن:شناسهٔ عددی دانشگاه» است.
 *   • توکن تکیِ قدیمی `MOODLE_PULL_TOKEN` (تنظیمات/ENV) + `MOODLE_PULL_UNIVERSITY`
 *     در ENV برای تعیین دانشگاه همان توکن.
 *   • اگر هیچ‌کدام تعیین نشده باشد و فقط **یک** دانشگاه فعال وجود داشته باشد،
 *     همان دانشگاه به‌صورت خودکار انتخاب می‌شود (نصب تک‌دانشگاهی).
 *   • در چنددانشگاهیِ بدون نگاشت، API با `tenant_scope_required` بسته می‌ماند
 *     (fail-closed)؛ هرگز به «همهٔ دانشگاه‌ها» برنمی‌گردد.
 */

export type LmsScope = {
  /** شناسهٔ عددی دانشگاهی که این توکن به آن قفل شده است (همیشه > 0). */
  universityId: number;
  /** کد دانشگاه برای نمایش در پاسخ. */
  universityCode: string;
};

export type LmsAuthResult =
  | { ok: true; scope: LmsScope }
  | { ok: false; response: NextResponse };

function deny(status: number, error: string, hint?: string): LmsAuthResult {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error, ...(hint ? { hint } : {}) }, { status }),
  };
}

/**
 * توکن را فقط از هدر می‌خواند.
 * اگر هدر Authorization وجود داشته باشد، حتماً باید قالب `Bearer` داشته باشد؛
 * در غیر این صورت توکن خالی برگردانده می‌شود (نه fallback به query/هدر دیگر).
 */
function providedToken(req: NextRequest): string {
  const auth = (req.headers.get('authorization') ?? '').trim();
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    return m ? m[1].trim() : '';
  }
  return (req.headers.get('x-lms-token') ?? '').trim();
}

/** نگاشت چندمؤسسه‌ای از ENV: «توکن:کد یا شناسهٔ دانشگاه» */
function tokenBindings(): { token: string; ref: string }[] {
  const raw = (process.env.MOODLE_PULL_TOKENS ?? '').trim();
  if (!raw) return [];
  const out: { token: string; ref: string }[] = [];
  for (const part of raw.split(/[\n,;]+/)) {
    const line = part.trim();
    if (!line || line.startsWith('#')) continue;
    // آخرین «:» جداکننده است تا خود توکن (در صورت داشتن «:») سالم بماند.
    const i = line.lastIndexOf(':');
    if (i <= 0) continue;
    const token = line.slice(0, i).trim();
    const ref = line.slice(i + 1).trim();
    if (token && ref) out.push({ token, ref });
  }
  return out;
}

/** تبدیل «کد دانشگاه» یا «شناسهٔ عددی» به دامنهٔ واقعی — در خطا null (fail-closed). */
async function resolveUniversity(ref: string): Promise<LmsScope | null> {
  const v = ref.trim();
  if (!v) return null;
  try {
    if (/^\d+$/.test(v)) {
      const [u] = await db
        .select({ id: universities.id, code: universities.code })
        .from(universities)
        .where(eq(universities.id, Number(v)))
        .limit(1);
      return u ? { universityId: u.id, universityCode: u.code } : null;
    }
    const [u] = await db
      .select({ id: universities.id, code: universities.code })
      .from(universities)
      .where(sql`UPPER(${universities.code}) = ${v.toUpperCase()}`)
      .limit(1);
    return u ? { universityId: u.id, universityCode: u.code } : null;
  } catch {
    return null;
  }
}

/**
 * تنها دانشگاه فعال — فقط وقتی یک مورد وجود دارد.
 * دو مورد یا بیشتر ⇒ null تا API به‌جای لو دادن همه، بسته بماند.
 */
async function onlyActiveUniversity(): Promise<LmsScope | null> {
  try {
    const rows = await db
      .select({ id: universities.id, code: universities.code })
      .from(universities)
      .where(and(eq(universities.isActive, 1), eq(universities.status, 'ACTIVE')))
      .limit(2);
    return rows.length === 1 ? { universityId: rows[0].id, universityCode: rows[0].code } : null;
  } catch {
    return null;
  }
}

async function legacyToken(): Promise<string> {
  try {
    return (await getSetting('MOODLE_PULL_TOKEN')).trim();
  } catch {
    return '';
  }
}

/**
 * احراز هویت + تعیین دامنهٔ مؤسسه‌ای (tenant scope).
 *
 * خروجی موفق همیشه `scope` دارد؛ مسیرها موظف‌اند `universityId = scope.universityId`
 * را به همهٔ کوئری‌های اصلی اضافه کنند. `null` یا «همهٔ دانشگاه‌ها» وجود ندارد.
 */
export async function authenticateLms(req: NextRequest): Promise<LmsAuthResult> {
  const rl = await rateLimit(`lms:${await clientIp()}`, 600, 60);
  if (!rl.ok) return deny(429, 'rate_limited');

  const provided = providedToken(req);
  if (!provided) {
    return deny(
      401,
      'unauthorized',
      'هدر Authorization: Bearer <token> یا x-lms-token لازم است. پارامتر ?token= پذیرفته نمی‌شود.',
    );
  }

  const bindings = tokenBindings();
  const legacy = await legacyToken();
  if (!bindings.length && !legacy) {
    return deny(503, 'disabled', 'MOODLE_PULL_TOKEN یا MOODLE_PULL_TOKENS تنظیم نشده است.');
  }

  // ۱) توکن‌های چندمؤسسه‌ای ENV
  let ref: string | null = null;
  for (const b of bindings) {
    if (timingEq(sha256hex(provided), sha256hex(b.token))) {
      ref = b.ref;
      break;
    }
  }

  // ۲) توکن تکیِ قدیمی
  if (!ref) {
    if (!legacy || !timingEq(sha256hex(provided), sha256hex(legacy))) {
      log.warn('lms_unauthorized', {});
      return deny(401, 'unauthorized');
    }
    ref = (process.env.MOODLE_PULL_UNIVERSITY ?? '').trim() || null;
  }

  // توکن به دانشگاه مشخصی نگاشت شده است ⇒ همان، و فقط همان.
  if (ref) {
    const scope = await resolveUniversity(ref);
    if (!scope) {
      return deny(
        503,
        'tenant_scope_invalid',
        'دانشگاهی که در MOODLE_PULL_TOKENS / MOODLE_PULL_UNIVERSITY تعیین شده پیدا نشد.',
      );
    }
    return { ok: true, scope };
  }

  // توکن قدیمی بدون نگاشت: تنها در نصب تک‌دانشگاهی مجاز است.
  const only = await onlyActiveUniversity();
  if (!only) {
    return deny(
      503,
      'tenant_scope_required',
      'چند دانشگاه فعال وجود دارد؛ برای هر توکن یک دانشگاه تعیین کنید: MOODLE_PULL_TOKENS="token:UNI_CODE,..." یا MOODLE_PULL_UNIVERSITY=UNI_CODE',
    );
  }
  return { ok: true, scope: only };
}

export function lmsOk<T>(data: T, paging?: { limit: number; offset: number; count: number }) {
  return NextResponse.json({ ok: true, data, ...(paging ? { paging } : {}) });
}

export function lmsPaging(url: URL): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 500), 1), 500);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  return { limit, offset };
}
