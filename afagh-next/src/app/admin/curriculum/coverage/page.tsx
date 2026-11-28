import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity, isRealUniversityId } from '@/lib/university-scope';
import { faNum } from '@/lib/report-format';

export const dynamic = 'force-dynamic';

/**
 * تابلوی «پوشش چارت رشته‌ها» — فقط‌خواندنی، بدون هیچ نوشتن/اکسپورت.
 *
 * چرا این صفحه؟
 * طبق `ENROLL_REQUIRE_CURRICULUM_CHART` (پیش‌فرض روشن)، `scopeOfferingsByCurriculum`
 * برای دانشجویی که چارت منتشرشده ندارد کاتالوگ **خالی** برمی‌گرداند؛ یعنی انتخاب
 * واحد عملاً بسته است. این تابلو نشان می‌دهد کدام رشته/مقطع‌ها چارت منتشرشده
 * ندارند و از کدام پیش‌نویس باید شروع کرد.
 *
 * امنیت: همهٔ کوئری‌ها به دانشگاه فعال (getCurrentUniversity) قید شده‌اند و اگر
 * شناسهٔ دانشگاه «واقعی» نباشد (DENY_UNI / نامشخص) هیچ ردیفی خوانده نمی‌شود.
 */

// ─────────────────────────── قرارداد ردیف‌های SQL ───────────────────────────
type StudentGroupRow = {
 majorId: number;
 degreeLevelId: number;
 students: number;
 minEntryYear: number | null;
 maxEntryYear: number | null;
};

type VersionGroupRow = {
 majorId: number;
 degreeLevelId: number;
 published: number;
 archived: number;
 draft: number;
 review: number;
 approved: number;
 publishedFrom: number | null;
 publishedTo: number | null;
 newestDraftId: number | null;
};

type MajorLabelRow = {
 id: number;
 code: string | null;
 name: string;
 degreeLevelId: number;
 degreeTitle: string | null;
};

type CoverageGroupRow = {
 majorId: number;
 degreeLevelId: number;
 covered: number;
 uncovered: number;
 uncoveredFrom: number | null;
 uncoveredTo: number | null;
};

const groupKey = (majorId: number, degreeLevelId: number) => `${majorId}:${degreeLevelId}`;

/** بازهٔ سال ورود — «۱۴۰۲–۱۴۰۴» یا «۱۴۰۳» */
function yearRange(from: number | null, to: number | null): string {
 if (from == null && to == null) return '—';
 if (from == null) return `تا ${faNum(to)}`;
 if (to == null || to === from) return faNum(from);
 return `${faNum(from)}–${faNum(to)}`;
}

export default async function CurriculumCoveragePage() {
 await requireRole(['ADMIN', 'EDU_EXPERT']);

 const university = await getCurrentUniversity().catch(() => null);

 // ── fail-closed: بدون دانشگاهِ واقعی هیچ کوئری‌ای اجرا نمی‌شود ──
 if (!university || !isRealUniversityId(university.id)) {
 return (
 <div dir="rtl" className="min-h-[60vh] flex items-center justify-center p-6">
 <div className="bg-white rounded-2xl shadow-sm border border-rose-200 p-6 max-w-md text-center space-y-2">
 <div className="text-2xl">🔒</div>
 <h2 className="font-extrabold text-slate-900">دانشگاه فعال مشخص نیست</h2>
 <p className="text-xs text-slate-600 font-bold leading-relaxed">
 برای دیدن پوشش چارت رشته‌ها باید یک دانشگاه فعالِ مجاز انتخاب شود.
 اگر چند دانشگاه دارید، از سوییچرِ سربرگ دانشگاه را انتخاب کنید.
 </p>
 <Link prefetch={false} href="/admin/curriculum" className="inline-block mt-1 text-2xs font-extrabold text-indigo-800 hover:underline">
 بازگشت به برنامهٔ درسی
 </Link>
 </div>
 </div>
 );
 }

 const universityId = university.id;

 // ── چهار کوئری تجمیعی مستقل (بدون حلقه روی رشته‌ها) ──
 const [studentRes, versionRes, majorRes, coverageRes, noMajorRes] = await Promise.all([
 // ۱) دانشجویان فعال، گروه‌بندی‌شده بر اساس رشته/مقطع
 db.execute(sql`
 select s."majorId"  as "majorId",
 s."degreeLevelId" as "degreeLevelId",
 (count(*))::int as "students",
 (min(s."entryYear"))::int as "minEntryYear",
 (max(s."entryYear"))::int as "maxEntryYear"
 from students s
 where s."universityId" = ${universityId}
 and s.status = 'ACTIVE'
 and s."majorId" is not null
 group by 1, 2
 `),

 // ۲) نسخه‌های چارتِ همین دانشگاه، گروه‌بندی‌شده بر اساس رشته/مقطع
 // + تازه‌ترین پیش‌نویس هر گروه + بازهٔ ورودیِ نسخه‌های منتشرشدهٔ «عادی»
 db.execute(sql`
 select v."majorId"  as "majorId",
 v."degreeLevelId"  as "degreeLevelId",
 (count(*) filter (where v.status = 'PUBLISHED'))::int as "published",
 (count(*) filter (where v.status = 'ARCHIVED'))::int as "archived",
 (count(*) filter (where v.status = 'DRAFT'))::int as "draft",
 (count(*) filter (where v.status = 'REVIEW'))::int as "review",
 (count(*) filter (where v.status = 'APPROVED'))::int as "approved",
 (min(v."entryYearFrom") filter (
 where v.status = 'PUBLISHED' and coalesce(v."catalogKind", 'NORMAL') = 'NORMAL'
 ))::int  as "publishedFrom",
 (max(coalesce(v."entryYearTo", 9999)) filter (
 where v.status = 'PUBLISHED' and coalesce(v."catalogKind", 'NORMAL') = 'NORMAL'
 ))::int  as "publishedTo",
 (array_agg(v.id order by v.id desc) filter (where v.status = 'DRAFT'))[1]
   as "newestDraftId"
 from curriculum_versions v
 where v."universityId" = ${universityId}
 group by 1, 2
 `),

 // ۳) برچسب‌ها: رشته + مقطع (یک join، نه کوئری به‌ازای هر ردیف)
 db.execute(sql`
 select m.id as "id",
 m."majorCode" as "code",
 m.name as "name",
 m."degreeLevelId" as "degreeLevelId",
 d.title as "degreeTitle"
 from majors m
 left join degree_level_configs d on d.id = m."degreeLevelId"
 where m."universityId" = ${universityId}
 order by m.name asc
 `),

 // ۴) پوشش: هر دانشجوی فعال، یک بار با «آیا سال ورودش در پنجرهٔ یک نسخهٔ
 // منتشرشدهٔ عادیِ همان رشته/مقطع است؟» علامت می‌خورد.
 db.execute(sql`
 with s as (
 select st."majorId" as mid,
 st."degreeLevelId" as did,
 st."entryYear" as ey,
 exists (
 select 1
 from curriculum_versions v
 where v."majorId" = st."majorId"
 and v."degreeLevelId" = st."degreeLevelId"
 and v."universityId" = ${universityId}
 and v.status = 'PUBLISHED'
 and coalesce(v."catalogKind", 'NORMAL') = 'NORMAL'
 and v."entryYearFrom" <= st."entryYear"
 and coalesce(v."entryYearTo", 9999) >= st."entryYear"
 ) as covered
 from students st
 where st."universityId" = ${universityId}
 and st.status = 'ACTIVE'
 and st."majorId" is not null
 )
 select mid as "majorId",
 did as "degreeLevelId",
 (count(*) filter (where covered))::int as "covered",
 (count(*) filter (where not covered))::int as "uncovered",
 (min(ey) filter (where not covered))::int as "uncoveredFrom",
 (max(ey) filter (where not covered))::int as "uncoveredTo"
 from s
 group by 1, 2
 `),

 // دانشجویان فعالی که رشته‌شان ثبت نشده — در گروه‌بندی بالا نمی‌گنجند،
 // ولی باید صادقانه در پانویس گزارش شوند.
 db.execute(sql`
 select (count(*))::int as "n"
 from students s
 where s."universityId" = ${universityId}
 and s.status = 'ACTIVE'
 and s."majorId" is null
 `),
 ]);

 const studentRows = (studentRes.rows ?? []) as unknown as StudentGroupRow[];
 const versionRows = (versionRes.rows ?? []) as unknown as VersionGroupRow[];
 const majorRows = (majorRes.rows ?? []) as unknown as MajorLabelRow[];
 const coverageRows = (coverageRes.rows ?? []) as unknown as CoverageGroupRow[];
 const studentsWithoutMajor = Number(
 ((noMajorRes.rows?.[0] ?? null) as unknown as { n?: number } | null)?.n ?? 0,
 );

 const studentByGroup = new Map<string, StudentGroupRow>(
 studentRows.map((r) => [groupKey(r.majorId, r.degreeLevelId), r]),
 );
 const versionByGroup = new Map<string, VersionGroupRow>(
 versionRows.map((r) => [groupKey(r.majorId, r.degreeLevelId), r]),
 );
 const coverageByGroup = new Map<string, CoverageGroupRow>(
 coverageRows.map((r) => [groupKey(r.majorId, r.degreeLevelId), r]),
 );
 const majorById = new Map<number, MajorLabelRow>(majorRows.map((r) => [r.id, r]));

 // ── اجتماعِ گروه‌ها: همهٔ رشته‌های دانشگاه + هر گروهی که نسخه یا دانشجو دارد ──
 type Group = { majorId: number; degreeLevelId: number };
 const groups = new Map<string, Group>();
 const addGroup = (majorId: number, degreeLevelId: number) => {
 const key = groupKey(majorId, degreeLevelId);
 if (!groups.has(key)) groups.set(key, { majorId, degreeLevelId });
 };
 for (const m of majorRows) addGroup(m.id, m.degreeLevelId);
 for (const r of versionRows) addGroup(r.majorId, r.degreeLevelId);
 for (const r of studentRows) addGroup(r.majorId, r.degreeLevelId);

 const rows = [...groups.entries()].map(([key, g]) => {
 const label = majorById.get(g.majorId);
 const st = studentByGroup.get(key);
 const ver = versionByGroup.get(key);
 const cov = coverageByGroup.get(key);

 const students = Number(st?.students ?? 0);
 const covered = Math.min(Number(cov?.covered ?? 0), students);
 const uncovered = Math.max(0, students - covered);

 return {
 key,
 majorId: g.majorId,
 degreeLevelId: g.degreeLevelId,
 majorCode: label?.code ?? null,
 majorName: label?.name ?? `رشتهٔ #${g.majorId}`,
 degreeTitle: label?.degreeTitle ?? '—',
 students,
 covered,
 uncovered,
 uncoveredFrom: cov?.uncoveredFrom ?? null,
 uncoveredTo: cov?.uncoveredTo ?? null,
 published: Number(ver?.published ?? 0),
 draft: Number(ver?.draft ?? 0),
 archived: Number(ver?.archived ?? 0),
 inProgress: Number(ver?.review ?? 0) + Number(ver?.approved ?? 0),
 publishedFrom: ver?.publishedFrom ?? null,
 publishedTo: ver?.publishedTo ?? null,
 newestDraftId: ver?.newestDraftId ?? null,
 };
 });

 // مرتب‌سازی: بیشترین دانشجوی بدون چارت اول؛ سپس کل دانشجو؛ سپس نام رشته (فارسی)
 rows.sort(
 (a, b) =>
 b.uncovered - a.uncovered ||
 b.students - a.students ||
 a.majorName.localeCompare(b.majorName, 'fa') ||
 a.degreeTitle.localeCompare(b.degreeTitle, 'fa') ||
 a.majorId - b.majorId,
 );

 const totalStudents = rows.reduce((s, r) => s + r.students, 0);
 const coveredStudents = rows.reduce((s, r) => s + r.covered, 0);
 const uncoveredStudents = rows.reduce((s, r) => s + r.uncovered, 0);
 const withoutPublished = rows.filter((r) => r.published === 0).length;
 const totalPublished = rows.reduce((s, r) => s + r.published, 0);
 const totalDraft = rows.reduce((s, r) => s + r.draft, 0);
 const coveragePercent = totalStudents > 0 ? (coveredStudents / totalStudents) * 100 : null;
 const coverageLabel =
 coveragePercent == null ? '—' : `${faNum(coveragePercent.toFixed(1)).replace('.', '٫')}٪`;

 return (
 <div dir="rtl" className="space-y-4 sm:space-y-5">
 {/* ═══ سربرگ ═══ */}
 <div className="bg-gradient-to-l from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-indigo-700/50">
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
 <div>
 <div className="flex items-center gap-2 mb-1">
 <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-400 text-slate-950">
 پوشش چارت رشته‌ها
 </span>
 <span className="text-xs text-indigo-200">{university.title}</span>
 </div>
 <h1 className="text-2xl font-extrabold tracking-tight">🧭 از کدام رشته باید انتشار چارت را شروع کنیم؟</h1>
 <p className="mt-1 text-xs text-indigo-200 font-bold leading-relaxed">
 {faNum(rows.length)} رشته/مقطع · {faNum(totalStudents)} دانشجوی فعال ·{' '}
 {faNum(totalPublished)} نسخهٔ منتشرشده
 </p>
 </div>
 <Link
 href="/admin/curriculum"
 prefetch={false}
 className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-extrabold text-xs shadow-md transition"
 >
 ← بازگشت به برنامهٔ درسی
 </Link>
 </div>
 </div>

 {/* ═══ ۴ کارت شاخص ═══ */}
 <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
 <div className={`bg-white rounded-2xl shadow-sm border p-4 ${withoutPublished > 0 ? 'border-rose-200' : 'border-emerald-200'}`}>
 <div className="text-2xs font-bold text-slate-500">رشته‌های بدون چارت منتشرشده</div>
 <div className={`mt-1 text-2xl font-extrabold ${withoutPublished > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
 {faNum(withoutPublished)}
 </div>
 <div className="mt-1 text-3xs font-bold text-slate-400">از {faNum(rows.length)} رشته/مقطع</div>
 </div>

 <div className={`bg-white rounded-2xl shadow-sm border p-4 ${uncoveredStudents > 0 ? 'border-rose-200' : 'border-emerald-200'}`}>
 <div className="text-2xs font-bold text-slate-500">دانشجویان بدون چارت</div>
 <div className={`mt-1 text-2xl font-extrabold ${uncoveredStudents > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
 {faNum(uncoveredStudents)}
 </div>
 <div className="mt-1 text-3xs font-bold text-slate-400">از {faNum(totalStudents)} دانشجوی فعال</div>
 </div>

 <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-4">
 <div className="text-2xs font-bold text-slate-500">نسخه‌های پیش‌نویس</div>
 <div className="mt-1 text-2xl font-extrabold text-amber-700">{faNum(totalDraft)}</div>
 <div className="mt-1 text-3xs font-bold text-slate-400">آمادهٔ ارسال برای بررسی</div>
 </div>

 <div className={`bg-white rounded-2xl shadow-sm border p-4 ${coveragePercent != null && coveragePercent >= 99.95 ? 'border-emerald-200' : 'border-slate-200'}`}>
 <div className="text-2xs font-bold text-slate-500">درصد پوشش</div>
 <div className={`mt-1 text-2xl font-extrabold ${coveragePercent != null && coveragePercent >= 99.95 ? 'text-emerald-700' : 'text-slate-900'}`}>
 {coverageLabel}
 </div>
 <div className="mt-1 text-3xs font-bold text-slate-400">
 {faNum(coveredStudents)} دانشجو پوشش‌داده‌شده
 </div>
 </div>
 </div>

 {/* ═══ توضیح کهربایی + مسیر انتشار ═══ */}
 <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2">
 <p className="text-xs font-extrabold text-amber-900 leading-relaxed">
 ⚠️ دانشجو تا وقتی چارت رشته‌اش منتشر نشده، در صفحهٔ انتخاب واحد هیچ درسی نمی‌بیند.
 </p>
 <div className="flex flex-wrap items-center gap-1.5 text-2xs font-black text-amber-900">
 <span className="px-2.5 py-1 rounded-lg bg-white border border-amber-300">۱. پیش‌نویس</span>
 <span className="text-amber-500">→</span>
 <span className="px-2.5 py-1 rounded-lg bg-white border border-amber-300">۲. ارسال برای بررسی</span>
 <span className="text-amber-500">→</span>
 <span className="px-2.5 py-1 rounded-lg bg-white border border-amber-300">۳. تأیید</span>
 <span className="text-amber-500">→</span>
 <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white border border-emerald-700">انتشار</span>
 </div>
 <p className="text-2xs text-amber-800 leading-relaxed font-bold">
 انتشار، خودش چارت را دوباره اعتبارسنجی می‌کند و چارتی را که «خطای بازدارنده» دارد
 منتشر نمی‌کند؛ ابتدا خطاهای تبِ «بررسی و خاتمه» را برطرف کنید.
 </p>
 </div>

 {/* ═══ جدول پوشش ═══ */}
 {rows.length === 0 ? (
 <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-1">
 <div className="text-2xl">🗂️</div>
 <h3 className="font-extrabold text-slate-900 text-sm">هنوز رشته یا دانشجویی برای این دانشگاه ثبت نشده است</h3>
 <p className="text-xs text-slate-500 font-bold leading-relaxed">
 وقتی رشته‌ها و دانشجویان فعال در این دانشگاه ثبت شوند، وضعیت پوشش چارت همین‌جا نمایش داده می‌شود.
 </p>
 </div>
 ) : (
 <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <h3 className="font-extrabold text-slate-900 text-sm">
 🧭 پوشش چارت به تفکیک رشته و مقطع
 </h3>
 <span className="text-2xs text-slate-500 font-bold">
 مرتب‌شده بر اساس «دانشجوی بدون چارت» (بیشترین اول)
 </span>
 </div>

 <div className="rt-wrap">
 <table className="w-full border-collapse text-xs rt rt--scroll">
 <thead>
 <tr className="bg-slate-900 text-white text-center">
 <th scope="col" className="p-2.5 border border-slate-800 text-right">رشته</th>
 <th scope="col" className="p-2.5 border border-slate-800">مقطع</th>
 <th scope="col" className="p-2.5 border border-slate-800">دانشجوی فعال</th>
 <th scope="col" className="p-2.5 border border-slate-800">پوشش‌داده‌شده</th>
 <th scope="col" className="p-2.5 border border-slate-800">بدون چارت</th>
 <th scope="col" className="p-2.5 border border-slate-800">نسخه‌ها (منتشر/پیش‌نویس/بایگانی)</th>
 <th scope="col" className="p-2.5 border border-slate-800">بازهٔ ورودیِ بدون پوشش</th>
 <th scope="col" className="p-2.5 border border-slate-800 w-40">اقدام</th>
 </tr>
 </thead>
 <tbody>
 {rows.map((r) => {
 // ✅ فقط وقتی معنادار است: این گروه دانشجوی فعال دارد و همهٔ آن‌ها
 // پوشش داده شده‌اند. گروهِ بدون دانشجو «سبز» نمی‌شود، چون ممکن است
 // هیچ چارت منتشرشده‌ای هم نداشته باشد (سیگنال سبزِ نادرست).
 const isCovered = r.students > 0 && r.uncovered === 0;
 return (
 <tr
 key={r.key}
 className={`text-center transition ${
 isCovered ? 'bg-emerald-50/70 hover:bg-emerald-50' : 'hover:bg-slate-50'
 }`}
 >
 <td className="p-2.5 border border-slate-200 text-right">
 <div className="flex items-center gap-1.5 justify-end">
 {isCovered && <span title="همهٔ دانشجویان این گروه چارت منتشرشده دارند">✅</span>}
 <span className="font-extrabold text-slate-800">{r.majorName}</span>
 {r.majorCode && (
 <span className="font-mono text-3xs text-slate-400">{faNum(r.majorCode)}</span>
 )}
 </div>
 </td>
 <td className="p-2.5 border border-slate-200 font-bold text-slate-700">{r.degreeTitle}</td>
 <td className="p-2.5 border border-slate-200 font-extrabold text-slate-800">{faNum(r.students)}</td>
 <td className="p-2.5 border border-slate-200 font-extrabold text-emerald-700">{faNum(r.covered)}</td>
 <td className={`p-2.5 border border-slate-200 font-extrabold ${r.uncovered > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
 {faNum(r.uncovered)}
 </td>
 <td className="p-2.5 border border-slate-200">
 <div className="flex items-center justify-center gap-1 flex-wrap">
 <span className="px-2 py-0.5 rounded-full text-3xs font-black bg-emerald-100 text-emerald-900">
 {faNum(r.published)} منتشر
 </span>
 <span className="px-2 py-0.5 rounded-full text-3xs font-black bg-amber-100 text-amber-900">
 {faNum(r.draft)} پیش‌نویس
 </span>
 <span className="px-2 py-0.5 rounded-full text-3xs font-black bg-slate-200 text-slate-700">
 {faNum(r.archived)} بایگانی
 </span>
 </div>
 {r.inProgress > 0 && (
 <div className="mt-1 text-3xs font-bold text-slate-500">
 + {faNum(r.inProgress)} در بازبینی/تأیید
 </div>
 )}
 {r.published > 0 && (
 <div className="mt-1 text-3xs font-bold text-emerald-700">
 پنجرهٔ منتشرشده: {yearRange(r.publishedFrom, r.publishedTo)}
 </div>
 )}
 </td>
 <td className="p-2.5 border border-slate-200 font-bold text-slate-700">
 {r.uncovered > 0 ? yearRange(r.uncoveredFrom, r.uncoveredTo) : '—'}
 </td>
 <td className="p-2.5 border border-slate-200">
 {r.newestDraftId != null ? (
 <Link
 href={`/admin/curriculum?version=${r.newestDraftId}`}
 prefetch={false}
 className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200 text-2xs font-extrabold transition"
 >
 باز کردن پیش‌نویس
 </Link>
 ) : (
 <span className="text-2xs font-bold text-slate-400">بدون پیش‌نویس</span>
 )}
 </td>
 </tr>
 );
 })}
 </tbody>
 <tfoot>
 <tr className="bg-slate-100 text-slate-800 font-black text-2xs">
 <td className="p-2.5 border border-slate-200 text-right" colSpan={2}>
 جمع ({faNum(rows.length)} رشته/مقطع)
 </td>
 <td className="p-2.5 border border-slate-200">{faNum(totalStudents)}</td>
 <td className="p-2.5 border border-slate-200 text-emerald-800">{faNum(coveredStudents)}</td>
 <td className="p-2.5 border border-slate-200 text-rose-800">{faNum(uncoveredStudents)}</td>
 <td className="p-2.5 border border-slate-200">
 {faNum(totalPublished)} / {faNum(totalDraft)} /{' '}
 {faNum(rows.reduce((s, r) => s + r.archived, 0))}
 </td>
 <td className="p-2.5 border border-slate-200" colSpan={2}>
 پوشش: {coverageLabel}
 </td>
 </tr>
 </tfoot>
 </table>
 </div>

 <p className="text-3xs text-slate-500 font-bold leading-relaxed">
 تعریف «پوشش‌داده‌شده»: دانشجوی فعالی که سال ورودش داخل بازهٔ ورودیِ دست‌کم یک نسخهٔ
 <b> منتشرشده </b>و<b> عادی (NORMAL) </b>از همان رشته/مقطع باشد. گرایش و نیمسال ورود در
 این شمارش لحاظ نمی‌شود (قاعدهٔ کاملِ حل چارت هنگام انتخاب واحد اعمال می‌شود). فقط
 وضعیت <b>ACTIVE</b> شمرده شده است.
 {studentsWithoutMajor > 0 && (
 <>
 {' '}همچنین {faNum(studentsWithoutMajor)} دانشجوی فعال بدون رشتهٔ ثبت‌شده در این آمار
 نیست (در جدول بالا جای نمی‌گیرد).
 </>
 )}
 </p>
 </div>
 )}
 </div>
 );
}
