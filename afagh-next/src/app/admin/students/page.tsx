import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { degree_level_configs, educational_regulations, majors, roles, staff, students, user_roles, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import StudentsManagerClient from './StudentsManagerClient';

export const dynamic = 'force-dynamic';

export default async function AdminStudentsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT']);

  // خواندن کلیه دانشجویان با مشخصات سجلی و تحصیلی
  const studentRows = await db
    .select({
      id: students.id,
      studentCode: students.studentCode,
      entryYear: students.entryYear,
      entryTerm: students.entryTerm,
      status: students.status,
      quotaType: students.quotaType,
      currentTermNo: students.currentTermNo,
      nationalCode: users.nationalCode,
      firstName: users.firstName,
      lastName: users.lastName,
      mobile: users.mobile,
      majorName: majors.name,
      majorCode: majors.majorCode,
      degreeLevel: degree_level_configs.title,
      degreeCode: degree_level_configs.code,
      regulationTitle: educational_regulations.title,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
    .leftJoin(educational_regulations, eq(educational_regulations.id, students.regulationId))
    .orderBy(desc(students.id));

  // خواندن کلیه اساتید و پرسنل با رتبه علمی و مدرک
  const staffRows = await db
    .select({
      id: staff.id,
      staffCode: staff.staffCode,
      staffType: staff.staffType,
      academicRank: staff.academicRank,
      degree: staff.degree,
      nationalCode: users.nationalCode,
      firstName: users.firstName,
      lastName: users.lastName,
      mobile: users.mobile,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .orderBy(desc(staff.id));

  return (
    <div className="space-y-4">
      <div className="card !p-4 bg-white border-slate-300 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">🎓 سامانه جامع مدیریت پذیرش و پرونده تحصیلی/پرسنلی</h1>
          <p className="text-xs text-slate-500 mt-0.5">مشاهده مشخصات شناسنامه‌ای، تحصیلی، سهمیه، مقاطع و اطلاعات اساتید</p>
        </div>
      </div>

      <StudentsManagerClient
        students={studentRows.map(s => ({
          id: s.id,
          studentCode: s.studentCode,
          nationalCode: s.nationalCode,
          firstName: s.firstName,
          lastName: s.lastName,
          mobile: s.mobile || '—',
          entryYear: s.entryYear,
          entryTerm: s.entryTerm || 1,
          status: s.status,
          quotaType: s.quotaType || 'NORMAL',
          currentTermNo: s.currentTermNo || 1,
          majorName: s.majorName || 'مهندسی کامپیوتر',
          majorCode: s.majorCode || '۵۴۸',
          degreeLevel: s.degreeLevel || 'کارشناسی پیوسته',
          degreeCode: s.degreeCode || 'BS',
          regulationTitle: s.regulationTitle || 'آیین‌نامه مصوب ۱۴۰۳',
          role: 'دانشجو',
        }))}
        staffList={staffRows.map(st => ({
          id: st.id,
          staffCode: st.staffCode,
          nationalCode: st.nationalCode,
          firstName: st.firstName,
          lastName: st.lastName,
          mobile: st.mobile || '—',
          academicRank: st.academicRank || 'استادیار',
          degree: st.degree || 'دکتری تخصصی',
          staffType: st.staffType || 'هیئت علمی تمام‌وقت',
          role: 'استاد / هیئت علمی',
        }))}
      />
    </div>
  );
}
