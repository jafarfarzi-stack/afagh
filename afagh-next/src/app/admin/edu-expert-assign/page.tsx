import { getEduExpertAssignInit } from './actions';
import EduExpertAssignClient from './EduExpertAssignClient';

export const dynamic = 'force-dynamic';

/**
 * تخصیص کارشناس آموزش به کلاس‌ها — جدول انبوه برای یک ترم.
 *
 * چرا این صفحه: تخصیص تک‌تک کلاس‌ها از داخل «تعریف کلاس» ممکن است، ولی وقتی
 * مثلاً ۲۰ کلاس به یک کارشناس سپرده می‌شود، رفتن به ۲۰ صفحه درد است. اینجا
 * همهٔ کلاس‌های ترم را می‌بینید و یک‌جا تخصیص می‌دهید.
 *
 * منبعِ حقیقت: جدولِ واسطِ `course_offering_edu_experts` (چند کارشناس برای یک
 * کلاس، مهاجرت ۰۱۱۱)؛ ستونِ `course_offerings.eduExpertUserId` فقط «کارشناسِ
 * اصلی» را نگه می‌دارد. اگر هیچ تخصیص صریحی نباشد از `expert_scopes`
 * (تخصیص نقش‌ها) پایین می‌آید.
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
