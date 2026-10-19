import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * راهنمای زندهٔ API کششی مودل — عمومی است و داده‌ای لو نمی‌دهد.
 *
 * مدل tenant: هر دانشگاه یک مؤسسهٔ مستقل است و با `universities.id` / کد آن
 * شناسایی می‌شود. هر توکن LMS فقط به یک دانشگاه قفل است؛ پارامتر `?uni=`
 * صرفاً برای سازگاری پذیرفته می‌شود و اگر با دانشگاهِ توکن یکی نباشد 403
 * برمی‌گرداند. هیچ توکنی به دادهٔ چند دانشگاه دسترسی ندارد.
 *
 * احراز هویت: فقط هدر `Authorization: Bearer <token>` یا `x-lms-token`.
 * پارامتر `?token=` حذف شده است تا توکن در URL / access log ثبت نشود.
 *
 * نگاشت توکن به دانشگاه (بدون تغییر schema):
 *   MOODLE_PULL_TOKENS="tokA:AFAGH,tokB:ZARINE"  ← چند توکن، هر کدام یک دانشگاه
 *   MOODLE_PULL_TOKEN + MOODLE_PULL_UNIVERSITY  ← توکن تکیِ قدیمی
 * در نصب تک‌دانشگاهی، تنها دانشگاه فعال به‌صورت خودکار انتخاب می‌شود.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    name: 'Afagh LMS pull API',
    version: 2,
    auth: 'header Authorization: Bearer <token> or x-lms-token = MOODLE_PULL_TOKEN / MOODLE_PULL_TOKENS (no ?token=)',
    tenant: {
      model: 'هر توکن به یک دانشگاه قفل است؛ همهٔ پاسخ‌ها فقط دادهٔ همان دانشگاه را دارند.',
      tokenMap: 'MOODLE_PULL_TOKENS="token:UNI_CODE,..." یا MOODLE_PULL_TOKEN + MOODLE_PULL_UNIVERSITY',
      uniParam: '?uni= فقط برای سازگاری؛ ناهماهنگ با دانشگاه توکن ⇒ 403 uni_mismatch',
    },
    resources: {
      terms: {
        url: '/api/lms/terms?current=1',
        desc: 'ترم‌های همان دانشگاه: id, termCode, title, isCurrent, universityCode',
      },
      courses: {
        url: '/api/lms/courses?term=14051',
        desc: 'ارائه‌های یک ترم (term=کد ترم یا current): هر ارائه یک درس مودل است. idnumber یکتاست.',
        fields: ['idnumber', 'shortname', 'fullname', 'termCode', 'courseCode', 'groupNumber', 'units', 'teacherUsername', 'teacherName', 'universityCode'],
      },
      users: {
        url: '/api/lms/users?role=student&term=14051&limit=500&offset=0',
        desc: 'کاربران همان دانشگاه: role=student|staff (پیش‌فرض هر دو). با term فقط کسانی که در آن ترم درگیرند.',
        defaultFields: ['username', 'firstname', 'lastname', 'role', 'active', 'major', 'entryYear', 'department', 'universityCode'],
        optIn: {
          withNationalCode: '1 → idnumber (کد ملی)',
          withEmail: '1 → email',
          withPhone: '1 → phone (همراه)',
        },
      },
      enrollments: {
        url: '/api/lms/enrollments?term=14051',
        desc: 'ثبت‌نامی‌های همان دانشگاه: course=idnumber درس، username، role=student|editingteacher',
      },
      schedule: {
        url: '/api/lms/schedule?term=14051',
        desc: 'برنامهٔ هفتگی کلاس‌ها: course، dayOfWeek (۰=شنبه..۶=جمعه)، startTime، endTime، room، building',
      },
    },
    notes: [
      'username دانشجو = شمارهٔ دانشجویی؛ username استاد = کد پرسنلی.',
      'حریم خصوصی: idnumber (کد ملی)، email و phone به‌صورت پیش‌فرض برنمی‌گردند؛ فقط با withNationalCode=1 / withEmail=1 / withPhone=1.',
      'هر توکن فقط دادهٔ یک دانشگاه را می‌بیند؛ برای چند دانشگاه، چند توکن در MOODLE_PULL_TOKENS تعریف کنید.',
    ],
  });
}
