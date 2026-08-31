import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import ProfessorContractClient, { ContractDetails } from './ProfessorContractClient';

export const dynamic = 'force-dynamic';

export default async function ProfessorContractPage() {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);

  if (!me) {
    return (
      <div className="card text-center p-8">
        <p className="text-slate-600 font-bold">پروندهٔ هیئت علمی یافت نشد.</p>
      </div>
    );
  }

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  const termTitle = term?.title || 'نیمسال اول ۱۴۰۵–۱۴۰۶ (مهر ۱۴۰۵)';

  const initialContract: ContractDetails = {
    contractNo: 'CON-1405-CE-082',
    contractDate: '۱۴۰۵/۰۶/۲۰',
    termTitle: termTitle,
    professorName: `${user.firstName} ${user.lastName}`,
    nationalCode: user.nationalCode || '0011111111',
    staffCode: me.staffCode,
    academicRank: me.academicRank || 'استادیار',
    degree: me.degree || 'دکتری تخصصی مهندسی کامپیوتر',
    shebaNumber: 'IR58 0120 0000 0000 1234 5678 90',
    bankName: 'بانک تجارت — شعبه دانشگاه',
    courses: [
      {
        code: 'CE-302',
        title: 'سیستم‌های عامل (گروه ۱)',
        groupNumber: 1,
        theoryUnits: 3,
        practicalUnits: 0,
        weeklyHours: 3,
        termTotalHours: 48,
      },
      {
        code: 'CE-302',
        title: 'سیستم‌های عامل (گروه ۲)',
        groupNumber: 2,
        theoryUnits: 3,
        practicalUnits: 0,
        weeklyHours: 3,
        termTotalHours: 48,
      },
      {
        code: 'CE-204',
        title: 'ساختمان داده‌ها و الگوریتم‌ها',
        groupNumber: 1,
        theoryUnits: 3,
        practicalUnits: 0,
        weeklyHours: 3,
        termTotalHours: 48,
      },
      {
        code: 'CE-208',
        title: 'آزمایشگاه سیستم‌های عامل و شبکه (مشترک)',
        groupNumber: 1,
        theoryUnits: 0,
        practicalUnits: 1,
        weeklyHours: 2,
        termTotalHours: 32,
      },
      {
        code: 'CE-410',
        title: 'مهندسی اینترنت و وب پیشرفته',
        groupNumber: 1,
        theoryUnits: 3,
        practicalUnits: 0,
        weeklyHours: 3,
        termTotalHours: 48,
      },
    ],
    hourlyRate: 850000,       // ۸۵۰٬۰۰۰ ریال به ازای هر ساعت
    totalTermHours: 224,      // ۲۲۴ ساعت تدریس در ترم
    grossAmount: 190400000,   // ۱۹۰٬۴۰۰٬۰۰۰ ریال
    taxRatePercent: 10,
    taxDeduction: 19040000,   // ۱۹٬۰۴۰٬۰۰۰ ریال (۱۰٪ مالیات)
    insuranceDeduction: 13328000, // ۱۳٬۳۲۸٬۰۰۰ ریال بیمه
    netAmount: 158032000,     // ۱۵۸٬۰۳۲٬۰۰۰ ریال خالص دریافتی
    midtermPayment: 79016000, // ۵۰٪ پیش‌پرداخت میان‌ترم
    finalPayment: 79016000,   // ۵۰٪ تسویه نهایی
    signatureStatus: 'PENDING',
  };

  return <ProfessorContractClient initialContract={initialContract} />;
}
