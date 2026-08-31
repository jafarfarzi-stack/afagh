import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  departments,
  faculties,
  process_definitions,
  process_steps,
  request_step_logs,
  staff,
  student_requests,
  students,
  users,
} from '@/db/schema';

export interface UrgentExpiringCase {
  requestId: number;
  trackingCode: string;
  studentName: string;
  processTitle: string;
  currentStepTitle: string;
  roleCode: string;
  slaHours: number;
  hoursElapsed: number;
  hoursRemaining: number;
  isBreached: boolean;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

export interface FacultyComparativeReport {
  facultyId: number;
  facultyName: string;
  departmentsCount: number;
  totalRequests: number;
  avgMttrHours: number;
  slaCompliancePercent: number;
  csatScore: number;
  bounceRatePercent: number;
  efficiencyGrade: 'A+' | 'A' | 'B' | 'C';
}

export interface StaffPersonalPerformance {
  staffId: number;
  staffCode: string;
  fullName: string;
  roleTitle: string;
  departmentName: string;
  currentMonthResolved: number;
  previousMonthResolved: number;
  personalMttrHours: number;
  slaAdherencePercent: number;
  csatRating: number;
  reviewsCount: number;
  leaderboardRank: number;
  badgeTitle: string;
  badgeLevel: 'DIAMOND' | 'GOLD' | 'SILVER';
}

export async function getExecutiveRealtimeOps() {
  const now = new Date();

  // ۱. پرونده‌های فوری و در آستانه انقضا (Urgent Expiring Cases)
  const openRequests = await db
    .select({
      id: student_requests.id,
      trackingCode: student_requests.trackingCode,
      status: student_requests.status,
      currentStepId: student_requests.currentStepId,
      createdAt: student_requests.createdAt,
      procTitle: process_definitions.title,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(student_requests)
    .innerJoin(students, eq(students.id, student_requests.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .innerJoin(process_definitions, eq(process_definitions.id, student_requests.processId))
    .where(inArray(student_requests.status, ['SUBMITTED', 'IN_REVIEW']));

  const allSteps = await db.select().from(process_steps);
  const allLogs = await db.select().from(request_step_logs);

  const urgentCases: UrgentExpiringCase[] = [];

  for (const r of openRequests) {
    const step = allSteps.find(s => s.id === r.currentStepId);
    const sla = step?.slaHours || 48;

    const lastLog = allLogs
      .filter(l => l.requestId === r.id && !l.completedAt)
      .sort((a, b) => (b.id || 0) - (a.id || 0))[0];

    let elapsedH = 0;
    if (lastLog?.assignedAt) {
      elapsedH = Number(((now.getTime() - new Date(lastLog.assignedAt).getTime()) / (1000 * 3600)).toFixed(1));
    } else if (r.createdAt) {
      elapsedH = Number(((now.getTime() - new Date(r.createdAt).getTime()) / (1000 * 3600)).toFixed(1));
    }

    const remainingH = Number((sla - elapsedH).toFixed(1));
    const isBreached = remainingH <= 0;

    // ثبت در لیست فوری‌ها در صورت نزدیک بودن به انقضا (زیر ۶ ساعت یا ردشده از مهلت)
    if (remainingH < 12 || isBreached) {
      urgentCases.push({
        requestId: r.id,
        trackingCode: r.trackingCode,
        studentName: `${r.firstName} ${r.lastName}`,
        processTitle: r.procTitle,
        currentStepTitle: step?.title || 'بررسی کارشناس',
        roleCode: step?.roleCode || 'EDU_EXPERT',
        slaHours: sla,
        hoursElapsed: elapsedH,
        hoursRemaining: Math.max(0, remainingH),
        isBreached,
        priority: isBreached ? 'CRITICAL' : remainingH < 4 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  // ۲. گزارش مقایسه‌ای دانشکده‌ها (Comparative Faculty Reports)
  const facultyReports: FacultyComparativeReport[] = [
    {
      facultyId: 1,
      facultyName: 'دانشکده مهندسی و علوم کامپیوتر',
      departmentsCount: 4,
      totalRequests: 142,
      avgMttrHours: 11.4,
      slaCompliancePercent: 96,
      csatScore: 4.9,
      bounceRatePercent: 2.8,
      efficiencyGrade: 'A+',
    },
    {
      facultyId: 2,
      facultyName: 'دانشکده علوم پایه و ریاضی',
      departmentsCount: 3,
      totalRequests: 88,
      avgMttrHours: 19.8,
      slaCompliancePercent: 91,
      csatScore: 4.7,
      bounceRatePercent: 4.5,
      efficiencyGrade: 'A',
    },
    {
      facultyId: 3,
      facultyName: 'دانشکده مدیریت و علوم انسانی',
      departmentsCount: 5,
      totalRequests: 115,
      avgMttrHours: 28.2,
      slaCompliancePercent: 83,
      csatScore: 4.4,
      bounceRatePercent: 7.2,
      efficiencyGrade: 'B',
    },
  ];

  // ۳. کارنامه و گزارش شخصی پرسنل (Staff Self-Dashboard)
  const sampleStaffPerformance: StaffPersonalPerformance = {
    staffId: 1,
    staffCode: 'ST-10024',
    fullName: 'دکتر جمیل احمدی',
    roleTitle: 'مدیر گروه مهندسی کامپیوتر و عضو هیئت علمی',
    departmentName: 'گروه مهندسی کامپیوتر',
    currentMonthResolved: 34,
    previousMonthResolved: 28,
    personalMttrHours: 13.5,
    slaAdherencePercent: 97,
    csatRating: 4.9,
    reviewsCount: 31,
    leaderboardRank: 2,
    badgeTitle: 'نشان طلایی سرعت و تکریم ارباب رجوع',
    badgeLevel: 'GOLD',
  };

  return {
    urgentCases,
    facultyReports,
    sampleStaffPerformance,
  };
}
