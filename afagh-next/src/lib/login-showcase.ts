import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { login_notices, login_slides, universities } from '@/db/schema';

export type ShowcaseUniversity = { id: number; code: string; title: string; logoUrl: string | null };
export type ShowcaseNotice = { id: number; title: string; body: string; kind: string };
export type ShowcaseSlide = { id: number; title: string; subtitle: string; imageUrl: string; linkUrl: string };

export type LoginShowcase = {
  universities: ShowcaseUniversity[];
  university: ShowcaseUniversity;
  notices: ShowcaseNotice[];
  slides: ShowcaseSlide[];
};

const FALLBACK_UNI: ShowcaseUniversity = { id: 0, code: 'AFAGH', title: 'دانشگاه آفاق', logoUrl: null };

/**
 * ویترین عمومی صفحه ورود (بدون نیاز به نشست):
 * دانشگاه منتخب + اطلاعیه‌ها و اسلایدهای فعال (سراسری + همان دانشگاه).
 * اگر جدول‌ها هنوز میگریت نشده باشند، خالیِ امن برمی‌گرداند تا /login نخوابد.
 */
export async function getLoginShowcase(universityCode?: string | null): Promise<LoginShowcase> {
  const empty: LoginShowcase = { universities: [], university: FALLBACK_UNI, notices: [], slides: [] };
  try {
    const unis = await db
      .select({ id: universities.id, code: universities.code, title: universities.title, logoUrl: universities.logoUrl })
      .from(universities)
      .where(eq(universities.isActive, 1))
      .orderBy(asc(universities.id));
    if (!unis.length) return empty;
    const code = (universityCode || '').trim().toUpperCase();
    const uni =
      unis.find(u => u.code === code) ??
      unis.find(u => u.code === 'AFAGH') ??
      unis[0];

    const scopeNotice = and(
      eq(login_notices.isActive, 1),
      or(isNull(login_notices.universityId), eq(login_notices.universityId, uni.id)),
    );
    const scopeSlide = and(
      eq(login_slides.isActive, 1),
      or(isNull(login_slides.universityId), eq(login_slides.universityId, uni.id)),
    );
    const [notices, slides] = await Promise.all([
      db
        .select({ id: login_notices.id, title: login_notices.title, body: login_notices.body, kind: login_notices.kind })
        .from(login_notices)
        .where(scopeNotice)
        .orderBy(asc(login_notices.sortOrder), asc(login_notices.id)),
      db
        .select({
          id: login_slides.id,
          title: login_slides.title,
          subtitle: login_slides.subtitle,
          imageUrl: login_slides.imageUrl,
          linkUrl: login_slides.linkUrl,
        })
        .from(login_slides)
        .where(scopeSlide)
        .orderBy(asc(login_slides.sortOrder), asc(login_slides.id)),
    ]);
    return {
      universities: unis.map(u => ({ ...u, logoUrl: u.logoUrl ?? null })),
      university: { ...uni, logoUrl: uni.logoUrl ?? null },
      notices: notices.filter(n => n.title).map(n => ({ ...n, kind: n.kind || 'info' })),
      slides: slides.filter(s => s.title),
    };
  } catch {
    return empty;
  }
}
