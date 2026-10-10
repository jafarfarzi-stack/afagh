import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * راهنمای زندهٔ API کششی مودل — عمومی است و داده‌ای لو نمی‌دهد.
 * احراز هویت همهٔ منابع دیگر: هدر `x-lms-token` یا `?token=` برابر MOODLE_PULL_TOKEN.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    name: 'Afagh LMS pull API',
    version: 1,
    auth: 'header x-lms-token (or ?token=) = MOODLE_PULL_TOKEN',
    resources: {
      terms: {
        url: '/api/lms/terms?current=1',
        desc: 'ترم‌ها: id, termCode, title, isCurrent, universityCode',
      },
      courses: {
        url: '/api/lms/courses?term=14051',
        desc: 'ارائه‌های یک ترم (term=کد ترم یا current): هر ارائه یک درس مودل است. idnumber یکتاست.',
        fields: ['idnumber', 'shortname', 'fullname', 'termCode', 'courseCode', 'groupNumber', 'units', 'teacherUsername', 'teacherName', 'universityCode'],
      },
      users: {
        url: '/api/lms/users?role=student&term=14051&limit=500&offset=0',
        desc: 'کاربران: role=student|staff (پیش‌فرض هر دو). با term فقط کسانی که در آن ترم درگیرند.',
        fields: ['username', 'idnumber', 'firstname', 'lastname', 'email', 'phone', 'role', 'active', 'major', 'entryYear', 'department', 'universityCode'],
      },
      enrollments: {
        url: '/api/lms/enrollments?term=14051',
        desc: 'ثبت‌نامی‌ها: course=idnumber درس، username، role=student|editingteacher',
      },
      schedule: {
        url: '/api/lms/schedule?term=14051',
        desc: 'برنامهٔ هفتگی کلاس‌ها: course، dayOfWeek (۰=شنبه..۶=جمعه)، startTime، endTime، room، building',
      },
    },
    notes: [
      'username دانشجو = شمارهٔ دانشجویی؛ username استاد = کد پرسنلی؛ idnumber = کد ملی.',
      'نکتهٔ حریم خصوصی: idnumber (کد ملی) فقط با توکن معتبر داده می‌شود.',
    ],
  });
}
