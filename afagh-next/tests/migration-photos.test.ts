/**
 * تست واحد «تطبیق عکس افراد» — بدون DB و بدون Object Storage
 *
 * اجرا: npm test
 *
 * چرا این تست؟ چسباندن عکس به شخصِ اشتباه خطای غیرقابل‌قبولی است (کارت
 * دانشجویی و کارت ورود به جلسه از همین عکس ساخته می‌شود). این تست قواعد
 * ایمنی را قفل می‌کند: اولویت نام فایلِ اعلام‌شده، رد کردن موارد مبهم،
 * و نادیده‌گرفتن فایل‌های غیرتصویری.
 */
import {
  MAX_PHOTO_BYTES, extOf, isJunkEntry, photoKeyOf, planPhotoImport,
  type PhotoPerson,
} from '../src/lib/migration/photo-match.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const truthy = (name: string, got: unknown) => eq(name, !!got, true);

const person = (p: Partial<PhotoPerson> & { userId: number }): PhotoPerson => ({
  fullName: `کاربر ${p.userId}`, nationalCode: null, photoFileName: null,
  codes: [], hasPhoto: false, ...p,
});

console.log('\n— نام‌گذاری —');
{
  eq('پسوند و مسیر حذف می‌شود', photoKeyOf('images/IMG_0012.JPG'), 'img_0012');
  eq('ارقام فارسی لاتین می‌شوند', photoKeyOf('۱۰۲۴.jpg'), '1024');
  eq('extOf', extOf('a/b/photo.PNG'), 'png');
  eq('بدون پسوند', extOf('photo'), '');
  truthy('پوشه junk است', isJunkEntry('folder/'));
  truthy('متادیتای مک junk است', isJunkEntry('__MACOSX/._x.jpg'));
  truthy('فایل مخفی junk است', isJunkEntry('a/.DS_Store'));
  eq('فایل عادی junk نیست', isJunkEntry('a/1.jpg'), false);
}

console.log('\n— اولویت تطبیق —');
{
  const people = [
    person({ userId: 1, nationalCode: '0011111111', photoFileName: 'p-alpha.jpg', codes: ['1024'] }),
    person({ userId: 2, nationalCode: '0022222222', codes: ['2048'] }),
    person({ userId: 3, nationalCode: '0033333333', codes: ['3072'] }),
  ];
  const plan = planPhotoImport([
    { path: 'p-alpha.JPG', size: 1000 },          // نام فایل اعلام‌شده
    { path: 'photos/0022222222.png', size: 1000 }, // کد ملی
    { path: 'photos/3072.jpeg', size: 1000 },      // کد شخص
  ], people);

  eq('هر سه وصل شدند', plan.matches.length, 3);
  eq('اولی با نام فایل', plan.matches[0].by, 'photoFileName');
  eq('دومی با کد ملی', plan.matches[1].by, 'nationalCode');
  eq('سومی با کد', plan.matches[2].by, 'code');
  eq('بی‌صاحب نداریم', plan.orphans.length, 0);
  eq('کسی بدون عکس نماند', plan.missing.length, 0);
}

console.log('\n— موارد خطرناک که باید رد شوند —');
{
  const people = [
    person({ userId: 1, photoFileName: 'shared.jpg' }),
    person({ userId: 2, photoFileName: 'shared.jpg' }),   // دو نفر یک نام فایل!
    person({ userId: 3, codes: ['5000'] }),
  ];
  const plan = planPhotoImport([{ path: 'shared.jpg', size: 500 }], people);
  eq('عکس مبهم به هیچ‌کس وصل نشد', plan.matches.length, 0);
  eq('و به‌عنوان بی‌صاحب گزارش شد', plan.orphans.length, 1);
  truthy('با دلیل روشن', plan.orphans[0].reason.includes('۲ نفر') || plan.orphans[0].reason.includes('2 نفر'));
  eq('هر سه نفر بی‌عکس گزارش شدند', plan.missing.length, 3);
}

{
  const people = [person({ userId: 1, codes: ['7000'] })];
  const plan = planPhotoImport([
    { path: '7000.jpg', size: 1000 },
    { path: 'dup/7000.png', size: 2000 },   // همان شخص، عکس دوم
  ], people);
  eq('فقط یک عکس برای هر شخص', plan.matches.length, 1);
  eq('عکس اول برنده است', plan.matches[0].path, '7000.jpg');
  eq('دومی نادیده گرفته شد', plan.skipped.length, 1);
}

{
  const people = [person({ userId: 1, codes: ['8000'] }), person({ userId: 2, codes: ['8001'] })];
  const plan = planPhotoImport([
    { path: '8000.exe', size: 100 },                     // فرمت غیرمجاز
    { path: '8000.svg', size: 100 },                     // svg عمداً مجاز نیست
    { path: '8001.jpg', size: MAX_PHOTO_BYTES + 1 },     // حجم زیاد
    { path: 'empty/8000.png', size: 0 },                 // خالی
    { path: '__MACOSX/8000.jpg', size: 500 },            // متادیتا
  ], people);
  eq('هیچ‌کدام ذخیره نمی‌شوند', plan.matches.length, 0);
  eq('همه در فهرست نادیده‌گرفته‌شده‌ها', plan.skipped.length, 5);
  truthy('دلیل حجم ذکر شده', plan.skipped.some(s => s.reason.includes('حجم')));
  truthy('دلیل پسوند ذکر شده', plan.skipped.some(s => s.reason.includes('پسوند')));
}

console.log('\n— جایگزینی عکس موجود —');
{
  const people = [person({ userId: 1, codes: ['9000'], hasPhoto: true })];
  const plan = planPhotoImport([{ path: '9000.jpg', size: 1000 }], people);
  eq('وصل شد', plan.matches.length, 1);
  eq('و به‌عنوان جایگزینی علامت خورد', plan.matches[0].replaces, true);
  eq('کسی در فهرست بدون‌عکس نیست', plan.missing.length, 0);
}

console.log('\n— گزارش افراد بدون عکس —');
{
  const people = [
    person({ userId: 1, codes: ['1'], photoFileName: 'a.jpg' }),
    person({ userId: 2, codes: ['2'] }),
    person({ userId: 3, codes: ['3'], hasPhoto: true }),   // از قبل عکس دارد
  ];
  const plan = planPhotoImport([{ path: 'a.jpg', size: 10 }], people);
  eq('فقط یک نفر واقعاً بدون عکس است', plan.missing.length, 1);
  eq('و همان نفر دوم است', plan.missing[0].userId, 2);
  eq('نام فایل انتظاری گزارش می‌شود', plan.missing[0].expected, null);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} تطبیق عکس افراد: ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail === 0 ? 0 : 1);
