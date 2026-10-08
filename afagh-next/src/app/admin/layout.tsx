import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';
import AdminNav from './AdminNav';
import UniversitySwitcher from './UniversitySwitcher';
import TermSwitcher from '@/components/TermSwitcher';
import { getCurrentUniversity, listUniversities, uniTheme } from '@/lib/university-scope';
import { getTermScope } from '@/lib/term-scope';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // نقش‌های اصلی شاخهٔ /admin — همان گارد پیشین بدون تغییر.
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
  ];
  // ⚠ استثنای محدود: layout در App Router مسیر جاری را نمی‌بیند، پس نمی‌تواند
  // گارد را به یک زیرمسیر خاص دوخته کرد. کم‌ضررترین حالت این است که این دو نقش
  // شاخه را رد کنند و به کنش‌های خود برسند؛ اما تک‌تک صفحه‌ها `requireRole`
  // مستقل دارند (تنها استثنا: `regulation-check` که گارد ندارد — گزارش شود).
  //   • PROFESSOR           → فقط تأیید/رد درخواست دفاعِ پرونده‌های خودش
  //   • GRADUATION_EXPERT  → تأیید پروپوزال، تعیین وقت، ثبت نتیجه، استخر داوران
  const LIMITED_ROLES = ['PROFESSOR', 'GRADUATION_EXPERT'];

  const user = await requireRole([...AREA_ROLES, ...LIMITED_ROLES]);
  // انتخاب دانشگاه فعال، ابزار مدیریتی است؛ به دو نقش محدود بالا نشان داده نمی‌شود
  // (کنشِ `setUniversityCookie` خودش گارد ندارد — گزارش شود).
  const canSwitchUniversity = user.roles.some(r => AREA_ROLES.includes(r));
  const unis = await listUniversities();
  const curUni = await getCurrentUniversity();
  const th = uniTheme(curUni.code);
  const termScope = await getTermScope(curUni.id);
  return (
    <div className="min-h-screen bg-sky-50/70" data-uni={curUni.code}>
      <header className={`${th.header} text-white shadow-md transition-colors`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 p-3.5 px-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${th.badge} flex items-center justify-center font-bold text-sm shadow-inner`}>
              {curUni.title.slice(0, 1)}
            </div>
            <div>
              <Link href="/admin" title="بازگشت به صفحه اول (داشبورد)" className="hover:opacity-90 transition-opacity">
                <p className="font-extrabold text-sm tracking-wide">داشبورد مدیریت جامع {curUni.title}</p>
              </Link>
              <p className="text-xs opacity-80">{user.name} · نقش‌ها: {user.roles.join('، ')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TermSwitcher
              terms={termScope.terms}
              selectedId={termScope.selectedId}
              effectiveId={termScope.effectiveId}
              universityId={curUni.id}
            />
            {canSwitchUniversity && (
              <UniversitySwitcher
                universities={unis.map(u => ({ code: u.code, title: u.title, kind: u.kind }))}
                currentCode={curUni.code}
                buttonClass={th.badge}
              />
            )}
            <Link
              href="/help/admin"
              className={`text-xs ${th.soft} border ${th.ring} px-3 py-1.5 rounded-lg transition-colors font-medium`}
            >
              📖 راهنما
            </Link>
            <a
              href="/help/pdfs/admin.pdf"
              download
              className={`text-xs ${th.soft} border ${th.ring} px-3 py-1.5 rounded-lg transition-colors font-medium`}
            >
              📕 PDF
            </a>
            <form action={logoutAction}>
              <button className={`text-xs ${th.soft} border ${th.ring} px-3 py-1.5 rounded-lg transition-colors font-medium`}>
                خروج
              </button>
            </form>
          </div>
        </div>
        <AdminNav roles={user.roles} theme={th} />
      </header>
      <main className="mx-auto max-w-6xl p-3 sm:p-5 pb-16">{children}</main>
    </div>
  );
}
