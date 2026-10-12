'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { expert_scopes, universities } from '@/db/schema';
import { UNIVERSITY_COOKIE } from '@/lib/university-scope';
import { getSessionUser, requireRole } from '@/lib/auth';

const AREA_ROLES = [
  'ADMIN',
  'EDU_EXPERT',
  'ARCHIVE_EXPERT',
  'FINANCE_EXPERT',
  'FINANCE',
  'MILITARY_OFFICER',
  'VAULT_MANAGER',
  'DEP_HEAD',
  'VICE_EDU',
] as never[];

/** تنظیم کوکی دانشگاه فعال — فقط کدهای موجود در DB پذیرفته می‌شود */
export async function setUniversityCookie(code: string) {
  await requireRole(AREA_ROLES);
  const c = String(code || '').trim().slice(0, 20);
  if (!c) return;
  try {
    const hit = (await db.select({ id: universities.id, code: universities.code })
      .from(universities).where(eq(universities.code, c)).limit(1))[0];
    if (!hit) return;
    // تقاطع با دامنهٔ کارشناس: مقصد باید در دانشگاه‌های مجازش باشد (ADMIN مستثنا)
    const me = await getSessionUser().catch(() => null);
    if (me && !me.roles.includes('ADMIN')) {
      const rows = await db.select({
        scopeType: expert_scopes.scopeType, scopeId: expert_scopes.scopeId, universityId: expert_scopes.universityId,
      }).from(expert_scopes).where(eq(expert_scopes.userId, me.id)).catch(() => []);
      if (rows.length) {
        const allowed = new Set<number>();
        for (const r of rows) {
          if (r.scopeType === 'UNIVERSITY') {
            const id = r.scopeId ?? r.universityId;
            if (typeof id === 'number') allowed.add(id);
          } else if (typeof r.universityId === 'number') {
            allowed.add(r.universityId);
          }
        }
        if (allowed.size && !allowed.has(hit.id)) throw new Error('این دانشگاه در محدودهٔ دسترسی شما نیست.');
      }
    }
    const secureMode = (process.env.AFAGH_COOKIE_SECURE ?? 'auto').toLowerCase();
    const secure = secureMode === 'true' ? true : secureMode === 'false' ? false : true; // production default: secure
    (await cookies()).set(UNIVERSITY_COOKIE, hit.code, {
      path: '/', maxAge: 365 * 24 * 3600, httpOnly: true, secure, sameSite: 'lax',
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'این دانشگاه در محدودهٔ دسترسی شما نیست.') throw e;
    /* DB در دسترس نیست — نادیده */
  }
}
