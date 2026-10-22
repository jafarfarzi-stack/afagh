import { getEduExpertAssignInit } from './actions';
import EduExpertAssignClient from './EduExpertAssignClient';

export const dynamic = 'force-dynamic';

/**
 * تخصیص کارشناس آموزش به کلاس‌ها.
 *
 * **واحدِ اصلیِ تخصیص، «اتاق» است** (مهاجرت ۰۱۱۲): کارشناس آموزش مسئولِ یک
 * فضای فیزیکی است و ساعت‌به‌ساعت همان اتاق را می‌گردد. در ترمِ ۱۱۱، ۱۳۴۵ ارائه
 * در ۴۹ اتاق برگزار می‌شوند — پس تخصیص در سطحِ اتاق ۲۷ برابر کم‌کارتر است و
 * با جابه‌جاییِ برنامه خودکار به‌روز می‌ماند.
 *
 * زنجیرهٔ تصمیم (از دقیق به کلی):
 *   ۱) `course_offering_edu_experts` — استثنای همان درس (تبِ «استثناها»)
 *   ۲) `classroom_edu_experts`       — کارشناسِ اتاقِ همان سانس
 *   ۳) `expert_scopes`               — گروه/دانشکده/دانشگاه
 */
export default async function EduExpertAssignPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const sp = await searchParams;
  const termId = Number(sp.term) || undefined;
  const init = await getEduExpertAssignInit(termId);

  return <EduExpertAssignClient init={init} />;
}
