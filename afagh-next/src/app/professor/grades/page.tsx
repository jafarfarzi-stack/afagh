import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import ProfessorGradesClient, { GradingCourseOffering } from './ProfessorGradesClient';

export const dynamic = 'force-dynamic';

export default async function ProfessorGradesPage({
  searchParams,
}: {
  searchParams: { offeringId?: string };
}) {
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
  const defaultOfferingId = searchParams.offeringId ? Number(searchParams.offeringId) : undefined;

  // Realistic course offerings with single-instructor and co-taught courses
  const initialOfferings: GradingCourseOffering[] = [
    {
      id: 101,
      code: 'CE-302',
      title: 'سیستم‌های عامل',
      groupNumber: 1,
      units: 3,
      courseType: 'اصلی',
      isCoTaught: false,
      rubric: {
        midterm: 5,
        homework: 3,
        participation: 2,
        practical: 0,
        finalExam: 10,
      },
      students: [
        {
          studentId: 1,
          studentCode: '401123401',
          fullName: 'امیرحسین رضایی',
          midtermScore: 4.5,
          homeworkScore: 3,
          participationScore: 2,
          practicalScore: 0,
          finalExamScore: 8.5,
          calculatedFinalScore: 18.0,
          status: 'TEMPORARY',
        },
        {
          studentId: 2,
          studentCode: '401123402',
          fullName: 'سارا کاظمی',
          midtermScore: 4.0,
          homeworkScore: 2.5,
          participationScore: 2,
          practicalScore: 0,
          finalExamScore: 9.0,
          calculatedFinalScore: 17.5,
          status: 'TEMPORARY',
        },
        {
          studentId: 3,
          studentCode: '401123403',
          fullName: 'محمدحسین حسینی',
          midtermScore: 2.0,
          homeworkScore: 1.5,
          participationScore: 1,
          practicalScore: 0,
          finalExamScore: 4.5,
          calculatedFinalScore: 9.0,
          status: 'TEMPORARY',
        },
        {
          studentId: 4,
          studentCode: '401123404',
          fullName: 'فاطمه احمدی',
          midtermScore: 5.0,
          homeworkScore: 3.0,
          participationScore: 2,
          practicalScore: 0,
          finalExamScore: 9.5,
          calculatedFinalScore: 19.5,
          status: 'TEMPORARY',
        },
        {
          studentId: 5,
          studentCode: '401123405',
          fullName: 'علیرضا کریمی',
          midtermScore: 3.5,
          homeworkScore: 2.0,
          participationScore: 1.5,
          practicalScore: 0,
          finalExamScore: 6.5,
          calculatedFinalScore: 13.5,
          status: 'TEMPORARY',
        },
      ],
      appeals: [
        {
          id: 501,
          studentId: 3,
          studentCode: '401123403',
          fullName: 'محمدحسین حسینی',
          currentGrade: 9.0,
          studentMessage: 'استاد محترم، بنده تمرین سری دوم و کوئیز میان‌ترم را در سامانه ارسال کرده بودم ولی در نمره نهایی اعمال نشده است. در صورت امکان مجدداً بررسی فرمایید.',
          status: 'OPEN',
          createdAt: '۱۴۰۵/۰۹/۱۰ - ساعت ۱۴:۳۰',
        },
      ],
    },
    {
      id: 104,
      code: 'CE-208',
      title: 'آزمایشگاه و مبانی سیستم‌های عامل',
      groupNumber: 1,
      units: 2,
      courseType: 'عملی',
      isCoTaught: true,
      coTaughtDetails: {
        theoryProfName: 'دکتر مریم رضایی',
        theoryProfStaffCode: 'F-102',
        theoryWeightRatio: 0.60,
        theoryWeightMarks: 12,
        theorySigned: false,
        labProfName: user.name || 'دکتر جمیل احمدی',
        labProfStaffCode: me.staffCode || 'F-101',
        labWeightRatio: 0.40,
        labWeightMarks: 8,
        labSigned: false,
        currentProfRole: 'LAB',
      },
      rubric: {
        midterm: 0,
        homework: 0,
        participation: 0,
        practical: 20,
        finalExam: 0,
      },
      students: [
        {
          studentId: 1,
          studentCode: '401123401',
          fullName: 'امیرحسین رضایی',
          theoryProfScore: 17.25,
          labProfScore: 18.25,
          calculatedFinalScore: 17.65,
          status: 'TEMPORARY',
        },
        {
          studentId: 2,
          studentCode: '401123402',
          fullName: 'سارا کاظمی',
          theoryProfScore: 16.0,
          labProfScore: 18.75,
          calculatedFinalScore: 17.1,
          status: 'TEMPORARY',
        },
        {
          studentId: 5,
          studentCode: '401123405',
          fullName: 'علیرضا کریمی',
          theoryProfScore: 13.0,
          labProfScore: 15.0,
          calculatedFinalScore: 13.8,
          status: 'TEMPORARY',
        },
      ],
      appeals: [
        {
          id: 502,
          studentId: 5,
          studentCode: '401123405',
          fullName: 'علیرضا کریمی',
          currentGrade: 13.8,
          appealSection: 'PRACTICAL',
          studentMessage: 'استاد محترم آزمایشگاه، پروژه عملی سیستم‌های عامل را تحویل داده بودم ولی نمره عملی ۱۵ منظور شده است. لطفاً بازبینی فرمایید.',
          status: 'OPEN',
          createdAt: '۱۴۰۵/۰۹/۱۲ - ساعت ۱۱:۰۰',
        },
      ],
    },
    {
      id: 103,
      code: 'CE-204',
      title: 'ساختمان داده‌ها و الگوریتم‌ها',
      groupNumber: 1,
      units: 3,
      courseType: 'اصلی',
      isCoTaught: false,
      rubric: {
        midterm: 6,
        homework: 4,
        participation: 0,
        practical: 0,
        finalExam: 10,
      },
      students: [
        {
          studentId: 11,
          studentCode: '402123501',
          fullName: 'کیان سلطانی',
          midtermScore: 5.5,
          homeworkScore: 4.0,
          finalExamScore: 9.0,
          calculatedFinalScore: 18.5,
          status: 'DRAFT',
        },
        {
          studentId: 12,
          studentCode: '402123502',
          fullName: 'یلدا ابراهیمی',
          midtermScore: 5.0,
          homeworkScore: 3.5,
          finalExamScore: 8.0,
          calculatedFinalScore: 16.5,
          status: 'DRAFT',
        },
      ],
      appeals: [],
    },
  ];

  const professorData = {
    id: me.id,
    name: user.name || 'دکتر جمیل احمدی',
    staffCode: me.staffCode,
  };

  return (
    <ProfessorGradesClient
      professor={professorData}
      termTitle={termTitle}
      initialOfferings={initialOfferings}
      defaultOfferingId={defaultOfferingId}
    />
  );
}
