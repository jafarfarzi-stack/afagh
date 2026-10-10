'use server';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { staff, students, universities, users } from '@/db/schema';
import { getSessionUser, issueSessionFor, verifyPassword } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { assertServerActionOrigin } from '@/lib/security';
import { STAFF_NC_MAP } from '@/lib/staff-nc-map.generated';

export type SiblingAccount = {
  kind: 'staff' | 'student';
  code: string;
  name: string;
  universityTitle: string | null;
};

const NC_TO_CODES = new Map<string, string[]>();
for (const [code, nc] of Object.entries(STAFF_NC_MAP)) {
  const arr = NC_TO_CODES.get(nc);
  if (arr) arr.push(code);
  else NC_TO_CODES.set(nc, [code]);
}

/** همهٔ کدملی‌های منتسب به یک کاربر: کدملی خودش + کدملیِ فایل برای کدهای پرسنلی‌اش */
async function personNCs(userId: number): Promise<Set<string>> {
  const out = new Set<string>();
  const [u] = await db
    .select({ nationalCode: users.nationalCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (u?.nationalCode) out.add(u.nationalCode.trim());
  const sts = await db.select({ staffCode: staff.staffCode }).from(staff).where(eq(staff.userId, userId));
  for (const s of sts) {
    const nc = STAFF_NC_MAP[s.staffCode.trim()];
    if (nc) out.add(nc);
  }
  return out;
}

async function describeUser(id: number): Promise<SiblingAccount | null> {
  const [u] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      universityId: users.universityId,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!u) return null;
  const sts = await db.select({ staffCode: staff.staffCode }).from(staff).where(eq(staff.userId, id));
  const stds =
    sts.length === 0
      ? await db.select({ studentCode: students.studentCode }).from(students).where(eq(students.userId, id))
        .orderBy(sql`CASE WHEN ${students.status} = 'ACTIVE' THEN 0 ELSE 1 END`, desc(students.id)).limit(1)
      : [];
  const code = sts[0]?.staffCode ?? stds[0]?.studentCode ?? null;
  if (!code) return null;
  let uniTitle: string | null = null;
  if (u.universityId) {
    const [t] = await db
      .select({ title: universities.title })
      .from(universities)
      .where(eq(universities.id, u.universityId))
      .limit(1);
    uniTitle = t?.title ?? null;
  }
  return {
    kind: sts.length ? 'staff' : 'student',
    code,
    name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || '—',
    universityTitle: uniTitle,
  };
}

/**
 * حساب‌های هم‌شخصِ کاربر جاری (کدهای پرسنلی/دانشجویی دیگرِ همان کدملی).
 * فقط برای نمایش در بنر «مشاهده با کد دیگر» — ورود به هر حساب رمز خودش را می‌خواهد.
 */
export async function getSiblingAccounts(): Promise<SiblingAccount[]> {
  const me = await getSessionUser();
  if (!me) return [];
  const ncs = await personNCs(me.id);
  if (!ncs.size) return [];
  const ncList = [...ncs];

  const byNc = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.nationalCode, ncList), eq(users.isActive, 1)));

  const codes = new Set<string>();
  for (const nc of ncList) for (const c of NC_TO_CODES.get(nc) ?? []) codes.add(c);
  const byStaff =
    codes.size > 0
      ? await db
          .select({ id: users.id })
          .from(staff)
          .innerJoin(users, eq(users.id, staff.userId))
          .where(and(inArray(staff.staffCode, [...codes]), eq(users.isActive, 1)))
      : [];

  const seen = new Set<number>();
  const ids: number[] = [];
  for (const r of [...byNc, ...byStaff]) {
    if (r.id !== me.id && !seen.has(r.id)) {
      seen.add(r.id);
      ids.push(r.id);
    }
  }
  const out: SiblingAccount[] = [];
  for (const id of ids.slice(0, 10)) {
    const d = await describeUser(id).catch(() => null);
    if (d) out.push(d);
  }
  return out;
}

/** جابه‌جایی به حساب هم‌شخص با رمزِ همان حساب */
export async function switchAccountAction(
  kind: 'staff' | 'student',
  code: string,
  password: string,
): Promise<{ ok: boolean; error?: string; mustChange?: boolean }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const rl = await rateLimit(`switch:${await clientIp()}`, 10, 10 * 60);
  if (!rl.ok) {
    return { ok: false, error: 'تلاش بیش از حد مجاز. چند دقیقه دیگر دوباره تلاش کنید.' };
  }
  const me = await getSessionUser();
  if (!me) return { ok: false, error: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
  const clean = String(code || '').trim();
  if (!clean || !password) return { ok: false, error: 'کد و رمز را وارد کنید.' };

  const myNCs = await personNCs(me.id);
  if (!myNCs.size) return { ok: false, error: 'حساب دیگری برای شما ثبت نشده است.' };

  // کاربر مقصد را فقط از روی کد پیدا می‌کنیم (userId از کلاینت نمی‌پذیریم)
  const target =
    kind === 'staff'
      ? (
          await db
            .select({ user: users })
            .from(staff)
            .innerJoin(users, eq(users.id, staff.userId))
            .where(eq(staff.staffCode, clean))
            .limit(1)
        )[0]?.user ?? null
      : (
          await db
            .select({ user: users })
            .from(students)
            .innerJoin(users, eq(users.id, students.userId))
            .where(eq(students.studentCode, clean))
            .orderBy(asc(users.id))
            .limit(1)
        )[0]?.user ?? null;
  if (!target || !target.isActive) return { ok: false, error: 'حساب مقصد یافت نشد یا غیرفعال است.' };
  if (target.id === me.id) return { ok: false, error: 'همین حساب فعال است.' };

  // پیوند هم‌شخصی باید برقرار باشد (کدملی مشترک) — وگرنه جابه‌جایی ممنوع
  const targetNCs = await personNCs(target.id);
  let linked = false;
  for (const nc of targetNCs) {
    if (myNCs.has(nc)) {
      linked = true;
      break;
    }
  }
  if (!linked) return { ok: false, error: 'این حساب به شما پیوند ندارد.' };

  if (!(await verifyPassword(password, target.passwordHash))) {
    return { ok: false, error: 'رمز این حساب نادرست است.' };
  }
  const { mustChange } = await issueSessionFor(target.id);
  // نقش مقصد ممکن است متفاوت باشد (مثلاً دانشجو) — مسیر پس از جابه‌جایی را ریشه (/) تعیین می‌کند
  return { ok: true, mustChange };
}
