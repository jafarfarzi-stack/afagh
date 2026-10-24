import {
  isDetailPath,
  safeBackPath,
  universitySwitchTarget,
} from '../src/lib/scope-switch.ts';
import { ADMIN_PANEL_ROLES, availablePanels } from '../src/lib/panel-links.ts';
import { homeFor } from '../src/lib/home-route.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

console.log('--- ۱. safeBackPath: فقط مسیر همان‌مبدأ ---');
eq('مسیر کامل با کوئری', safeBackPath('https://lxx.afagh.ac.ir/admin/students?page=2&x=1'), '/admin/students?page=2&x=1');
eq('بدون Referer → پیش‌فرض', safeBackPath(null), '/admin');
eq('خالی → پیش‌فرض', safeBackPath(''), '/admin');
eq('Referer نامعتبر → پیش‌فرض', safeBackPath('not a url'), '/admin');
eq('پروتکل غیر http(s) رد می‌شود', safeBackPath('javascript:alert(1)'), '/admin');
eq('پیش‌فرض دلخواه', safeBackPath(null, '/student'), '/student');

console.log('--- ۲. isDetailPath: صفحهٔ جزئیات با شناسهٔ عددی ---');
eq('/admin/finance/student/123', isDetailPath('/admin/finance/student/123'), true);
eq('/admin/finance/student/123?tab=ledger', isDetailPath('/admin/finance/student/123?tab=ledger'), true);
eq('/professor/documents/45/', isDetailPath('/professor/documents/45/'), true);
eq('فهرست با page در کوئری', isDetailPath('/admin/students?page=2'), false);
eq('مسیر دستهٔ مدیریت', isDetailPath('/admin/c/edu'), false);
eq('داشبورد', isDetailPath('/admin'), false);

console.log('--- ۳. universitySwitchTarget: مقصد امن پس از تغییر دانشگاه ---');
eq(
  'صفحهٔ جزئیات → داشبورد',
  universitySwitchTarget('https://h/admin/finance/student/123'),
  '/admin',
);
eq(
  'فهرست → همان صفحه با حذف university و صفحهٔ ۱',
  universitySwitchTarget('https://h/admin/students?university=AFAGH&page=4&q=ali'),
  '/admin/students?page=1&q=ali',
);
eq(
  'صفحهٔ بدون پارامتر → همان صفحه',
  universitySwitchTarget('https://h/admin/finance'),
  '/admin/finance',
);
eq('بدون Referer → داشبورد', universitySwitchTarget(null), '/admin');

console.log('--- ۴. availablePanels: همهٔ نقش‌های کاربر یک لینک می‌گیرند ---');
const keys = (roles: string[], perms = 0) => availablePanels(roles, perms).map(p => p.key);
eq('استاد + مدیر گروه + کارشناس مالی', keys(['PROFESSOR', 'DEP_HEAD', 'FINANCE_EXPERT']), ['admin', 'professor', 'group-manager']);
eq('استاد تنها → بدون لینک مدیریت', keys(['PROFESSOR']), ['professor']);
eq('مدیر گروه تنها → بدون لینک مدیریت', keys(['DEP_HEAD']), ['group-manager']);
eq('کارشناس آموزش + دانشجو', keys(['EDU_EXPERT', 'STUDENT']), ['admin', 'student']);
eq('مجوز سفارشی بدون نقش ستادی → /admin', keys(['PROFESSOR'], 1), ['admin', 'professor']);
eq('هیچ نقش/مجوزی', keys([], 0), []);
eq('همهٔ نقش‌های ستادی در فهرست پنل مدیریت‌اند', ADMIN_PANEL_ROLES.every(r => keys([r]).includes('admin')), true);

console.log('--- ۵. homeFor: اولویتِ کارتابل پس از ورود ---');
// موردِ واقعی: پویا بارمان ویسی با سه نقش EDU_EXPERT + PROFESSOR + STUDENT
eq('سه نقش (کارشناس+استاد+دانشجو) → کارشناس', homeFor(['EDU_EXPERT', 'PROFESSOR', 'STUDENT']), '/admin');
eq('کارشناس + دانشجو → کارشناس', homeFor(['EDU_EXPERT', 'STUDENT']), '/admin');
eq('استاد + دانشجو → استاد', homeFor(['PROFESSOR', 'STUDENT']), '/professor');
eq('دانشجو تنها', homeFor(['STUDENT']), '/student');
eq('استاد تنها', homeFor(['PROFESSOR']), '/professor');
eq('مدیر گروه تنها', homeFor(['DEP_HEAD']), '/group-manager');
eq('مدیر گروه + استاد → استاد', homeFor(['DEP_HEAD', 'PROFESSOR']), '/professor');
eq('کارشناس مالی', homeFor(['FINANCE_EXPERT']), '/admin/payroll');
eq('کارشناس مالی + استاد → کارشناس مالی', homeFor(['FINANCE_EXPERT', 'PROFESSOR']), '/admin/payroll');
eq('مراقب تنها', homeFor(['PROCTOR']), '/proctor');
eq('معاون آموزشی', homeFor(['VICE_EDU']), '/admin');
eq('بدون نقش → پیام ورود', homeFor([]), '/login?e=norole');

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
