'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

// ==========================================
// TYPES & DATA STRUCTURES
// ==========================================

export type FacultyContractType = 'FULL_TIME_FACULTY' | 'ADJUNCT';
export type PayrollStatus = 'DRAFT' | 'DEPT_HEAD_APPROVED' | 'DEAN_APPROVED' | 'FINANCE_SETTLED';

const faNum = (n: any) =>
  n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export interface CourseExamAggregationItem {
  id: number;
  courseCode: string;
  courseTitle: string;
  professorName: string;
  totalHallsCount: number;
  receivedHallsCount: number;
  totalExpectedSheets: number;
  totalDeliveredSheets: number;
  isFullyCollected: boolean;
  notificationSent: boolean;
  pickupQrStatus: string;
  pickupDate?: string;
  gradeDeadline: string;
  papersReturnedToArchive: boolean;
  archiveReturnDate?: string;
}

export interface CoursePayrollBreakdown {
  id: number;
  courseCode: string;
  courseTitle: string;
  degreeLevel: 'کارشناسی' | 'کارشناسی ارشد' | 'دکتری تخصصی';
  courseType: 'نظری' | 'عملی / آزمایشگاهی' | 'کارآموزی و پروژه' | 'پایان‌نامه';
  units: number;
  studentsCount: number;
  multiplier: number;
  teachingSharePercent: number; // e.g. 100 or 50 for co-teaching
  equivalentUnits: number;
  notes?: string;
}

export interface ProfessorPayrollRecord {
  id: number;
  staffId: number;
  staffCode: string;
  nationalCode: string;
  name: string;
  academicRank: 'مربی' | 'استادیار' | 'دانشیار' | 'استاد تمام';
  degree: 'کارشناسی ارشد' | 'دکتری تخصصی (Ph.D.)';
  departmentName: string;
  contractType: FacultyContractType;
  baseDutyUnits: number; // 10.0 for full-time faculty, 0 for adjunct
  baseRatePerUnit: number; // in Rials
  courses: CoursePayrollBreakdown[];
  totalEquivalentUnits: number;
  overloadUnits: number; // max(0, totalEquivalentUnits - baseDutyUnits)
  grossAmount: number; // in Rials
  classAbsencePenaltyUnits: number;
  classAbsencePenaltyAmount: number; // in Rials
  examAbsencePenaltyAmount: number; // in Rials (from Exam Minutes)
  lateGradePenaltyAmount: number; // in Rials
  taxRate: number; // e.g. 0.10 (10%)
  taxAmount: number; // in Rials
  totalDeductions: number; // in Rials
  netAmount: number; // in Rials
  status: PayrollStatus;
  iban: string;
  bankName: string;
  evaluatedScore: number;
  gradesFinalized: boolean;
  contractSigned: boolean;
  appointmentSigned: boolean;
  computedAt: string;
  approvedByDeptHeadAt?: string;
  approvedByDeanAt?: string;
  settledAt?: string;
}

export interface BaseRateItem {
  id: number;
  academicRank: string;
  degree: string;
  ratePerUnit: number; // in Rials
  ratePerHour: number; // in Rials
  effectiveYear: number;
}

export interface MultiplierRuleItem {
  id: number;
  ruleKey: string;
  ruleTitle: string;
  category: 'COURSE_TYPE' | 'DEGREE_LEVEL' | 'CLASS_SIZE' | 'THESIS';
  multiplier: number;
  description: string;
  isActive: boolean;
}

export interface BiometricAttendanceLogItem {
  id: number;
  staffCode: string;
  profName: string;
  sessionDate: string;
  courseTitle: string;
  groupNumber: number;
  classTime: string;
  isBackToBack: boolean;
  gatePunchTime?: string;
  verificationMethod:
    | 'GATE_FINGERPRINT'
    | 'CHAIN_MATCHING_CONTINUOUS'
    | 'STUDENT_ROLLCALL'
    | 'CLASS_PC_LOGIN'
    | 'UNJUSTIFIED_ABSENCE';
  verificationDetail: string;
  ipAddress: string;
  isFlaggedSuspicious: boolean;
  payrollPenaltyAmount: number;
}

export interface TeachingAppointmentDecree {
  id: number;
  decreeNo: string;
  staffCode: string;
  profName: string;
  academicRank: string;
  departmentName: string;
  termTitle: string;
  issueDate: string;
  coursesList: Array<{ code: string; title: string; group: number; units: number; weeklyHours: number }>;
  totalWeeklyHours: number;
  totalTermHours: number;
  signatureStatus: 'PENDING' | 'SIGNED';
  signedAt?: string;
  ipAddress?: string;
  otpUsed?: string;
  documentHash?: string;
}

export type PayrollTabType =
  | 'STATEMENTS_CARTABLE'
  | 'ATTENDANCE_BIOMETRIC_CHAIN'
  | 'ELECTRONIC_DECREES'
  | 'INSURANCE_AND_ADVANCES'
  | 'EXAM_AGGREGATION_CHAIN'
  | 'BASE_RATES'
  | 'MULTIPLIERS'
  | 'CONTRACTS'
  | 'BANK_DISKETTE';

// ==========================================
// INITIAL DATA
// ==========================================

const INITIAL_BASE_RATES: BaseRateItem[] = [
  { id: 1, academicRank: 'مربی', degree: 'کارشناسی ارشد', ratePerUnit: 25000000, ratePerHour: 1562500, effectiveYear: 1405 },
  { id: 2, academicRank: 'استادیار', degree: 'دکتری تخصصی (Ph.D.)', ratePerUnit: 38000000, ratePerHour: 2375000, effectiveYear: 1405 },
  { id: 3, academicRank: 'دانشیار', degree: 'دکتری تخصصی (Ph.D.)', ratePerUnit: 49000000, ratePerHour: 3062500, effectiveYear: 1405 },
  { id: 4, academicRank: 'استاد تمام', degree: 'دکتری تخصصی (Ph.D.)', ratePerUnit: 62000000, ratePerHour: 3875000, effectiveYear: 1405 },
];

const INITIAL_MULTIPLIERS: MultiplierRuleItem[] = [
  { id: 1, ruleKey: 'THEORY_COURSE', ruleTitle: 'دروس نظری استاندارد', category: 'COURSE_TYPE', multiplier: 1.00, description: 'ضریب پایه تدریس دروس تئوری طبق سرفصل وزارت علوم', isActive: true },
  { id: 2, ruleKey: 'PRACTICAL_LAB_COURSE', ruleTitle: 'دروس عملی، کارگاهی و آزمایشگاهی', category: 'COURSE_TYPE', multiplier: 1.50, description: 'ضریب ترغیبی به ازای هر واحد عملی و تجهیز آزمایشگاه', isActive: true },
  { id: 3, ruleKey: 'PROJECT_INTERNSHIP', ruleTitle: 'کارآموزی و پروژه پایانی', category: 'COURSE_TYPE', multiplier: 0.50, description: 'نظارت بر کارآموزی و هدایت پروژه کارشناسی', isActive: true },
  { id: 4, ruleKey: 'MASTER_LEVEL', ruleTitle: 'تدریس در مقطع کارشناسی ارشد', category: 'DEGREE_LEVEL', multiplier: 1.20, description: 'ضریب دشواری و تخصصی بودن دروس تحصیلات تکمیلی', isActive: true },
  { id: 5, ruleKey: 'PHD_LEVEL', ruleTitle: 'تدریس در مقطع دکتری تخصصی', category: 'DEGREE_LEVEL', multiplier: 1.50, description: 'ضریب سمینار و دروس پیشرفته دکتری', isActive: true },
  { id: 6, ruleKey: 'CROWDED_CLASS', ruleTitle: 'کلاس‌های پرجمعیت (بیش از ۴۰ دانشجو)', category: 'CLASS_SIZE', multiplier: 1.15, description: 'حق‌الزحمه اضافی برای تصحیح برگه و پاسخگویی به جمعیت بالا', isActive: true },
  { id: 7, ruleKey: 'MS_THESIS_GUIDE', ruleTitle: 'راهنمایی پایان‌نامه کارشناسی ارشد', category: 'THESIS', multiplier: 1.00, description: 'به ازای هر دانشجوی ارشد تا مرحله دفاع (معادل ۱ واحد)', isActive: true },
  { id: 8, ruleKey: 'PHD_DISSERTATION_GUIDE', ruleTitle: 'راهنمایی رساله دکتری تخصصی', category: 'THESIS', multiplier: 2.00, description: 'به ازای هر دانشجوی دکتری (معادل ۲ واحد معادل ترم)', isActive: true },
];

const INITIAL_PAYROLL_RECORDS: ProfessorPayrollRecord[] = [
  {
    id: 1,
    staffId: 101,
    staffCode: '۱۱۰۲',
    nationalCode: '۰۰۱۱۱۱۱۱۱۱',
    name: 'دکتر جمیل احمدی',
    academicRank: 'استادیار',
    degree: 'دکتری تخصصی (Ph.D.)',
    departmentName: 'مهندسی کامپیوتر',
    contractType: 'FULL_TIME_FACULTY',
    baseDutyUnits: 10.0,
    baseRatePerUnit: 38000000,
    evaluatedScore: 4.85,
    gradesFinalized: true,
    contractSigned: true,
    appointmentSigned: true,
    computedAt: '۱۴۰۵/۱۰/۲۸ - ۱۰:۳۰',
    status: 'DEAN_APPROVED',
    approvedByDeptHeadAt: '۱۴۰۵/۱۰/۲۸ - ۱۲:۰۰',
    approvedByDeanAt: '۱۴۰۵/۱۰/۲۹ - ۰۹:۱۵',
    iban: 'IR120170000000123456789001',
    bankName: 'بانک ملی ایران',
    courses: [
      { id: 1, courseCode: '1112101', courseTitle: 'ریاضی عمومی ۱', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 30, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 2, courseCode: '1112201', courseTitle: 'ساختمان داده‌ها', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 35, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 3, courseCode: '1112302', courseTitle: 'سیستم‌های عامل پیشرفته', degreeLevel: 'کارشناسی ارشد', courseType: 'نظری', units: 3, studentsCount: 15, multiplier: 1.2, teachingSharePercent: 100, equivalentUnits: 3.6 },
      { id: 4, courseCode: '1112401', courseTitle: 'آزمایشگاه شبکه‌های کامپیوتری', degreeLevel: 'کارشناسی', courseType: 'عملی / آزمایشگاهی', units: 2, studentsCount: 22, multiplier: 1.5, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 5, courseCode: '1112999', courseTitle: 'راهنمایی پایان‌نامه ارشد (۲ دانشجو)', degreeLevel: 'کارشناسی ارشد', courseType: 'پایان‌نامه', units: 2, studentsCount: 2, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 2.0 },
    ],
    totalEquivalentUnits: 14.6,
    overloadUnits: 4.6,
    grossAmount: 174800000,
    classAbsencePenaltyUnits: 0,
    classAbsencePenaltyAmount: 0,
    examAbsencePenaltyAmount: 0,
    lateGradePenaltyAmount: 0,
    taxRate: 0.10,
    taxAmount: 17480000,
    totalDeductions: 17480000,
    netAmount: 157320000,
  },
  {
    id: 2,
    staffId: 102,
    staffCode: '۱۱۰۵',
    nationalCode: '۰۰۲۲۲۲۲۲۲۲',
    name: 'دکتر سارا رضایی',
    academicRank: 'استادیار',
    degree: 'دکتری تخصصی (Ph.D.)',
    departmentName: 'مهندسی کامپیوتر',
    contractType: 'FULL_TIME_FACULTY',
    baseDutyUnits: 10.0,
    baseRatePerUnit: 38000000,
    evaluatedScore: 4.70,
    gradesFinalized: false,
    contractSigned: true,
    appointmentSigned: true,
    computedAt: '۱۴۰۵/۱۰/۲۸ - ۱۰:۳۰',
    status: 'DEPT_HEAD_APPROVED',
    approvedByDeptHeadAt: '۱۴۰۵/۱۰/۲۸ - ۱۵:۴۰',
    iban: 'IR550180000000123456789002',
    bankName: 'بانک تجارت',
    courses: [
      { id: 1, courseCode: '1112103', courseTitle: 'مبانی برنامه‌نویسی', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 4, studentsCount: 30, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 4.0 },
      { id: 2, courseCode: '1112202', courseTitle: 'برنامه‌نویسی پیشرفته', degreeLevel: 'کارشناسی', courseType: 'عملی / آزمایشگاهی', units: 3, studentsCount: 30, multiplier: 1.5, teachingSharePercent: 100, equivalentUnits: 4.5 },
      { id: 3, courseCode: '1112303', courseTitle: 'پایگاه داده‌ها', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 45, multiplier: 1.15, teachingSharePercent: 100, equivalentUnits: 3.45 },
      { id: 4, courseCode: '1112402', courseTitle: 'هوش مصنوعی پیشرفته', degreeLevel: 'کارشناسی ارشد', courseType: 'نظری', units: 3, studentsCount: 18, multiplier: 1.2, teachingSharePercent: 100, equivalentUnits: 3.6 },
    ],
    totalEquivalentUnits: 15.55,
    overloadUnits: 5.55,
    grossAmount: 210900000,
    classAbsencePenaltyUnits: 0,
    classAbsencePenaltyAmount: 0,
    examAbsencePenaltyAmount: 0,
    lateGradePenaltyAmount: 0,
    taxRate: 0.10,
    taxAmount: 21090000,
    totalDeductions: 21090000,
    netAmount: 189810000,
  },
  {
    id: 3,
    staffId: 103,
    staffCode: '۱۱۹۰',
    nationalCode: '۰۰۳۳۳۳۳۳۳۳',
    name: 'استاد مهدی کاظمی (مدعو)',
    academicRank: 'مربی',
    degree: 'کارشناسی ارشد',
    departmentName: 'مهندسی کامپیوتر',
    contractType: 'ADJUNCT',
    baseDutyUnits: 0.0,
    baseRatePerUnit: 25000000,
    evaluatedScore: 3.10,
    gradesFinalized: false,
    contractSigned: false,
    appointmentSigned: false,
    computedAt: '۱۴۰۵/۱۰/۲۸ - ۱۰:۳۰',
    status: 'DRAFT',
    iban: 'IR770190000000123456789003',
    bankName: 'بانک ملت',
    courses: [
      { id: 1, courseCode: '1112301', courseTitle: 'طراحی الگوریتم‌ها', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 28, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 2, courseCode: '1112108', courseTitle: 'مبانی فناوری اطلاعات (گروه ۲)', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 42, multiplier: 1.15, teachingSharePercent: 100, equivalentUnits: 3.45 },
    ],
    totalEquivalentUnits: 6.45,
    overloadUnits: 6.45,
    grossAmount: 161250000,
    classAbsencePenaltyUnits: 0.5,
    classAbsencePenaltyAmount: 12500000,
    examAbsencePenaltyAmount: 15000000,
    lateGradePenaltyAmount: 5000000,
    taxRate: 0.10,
    taxAmount: 16125000,
    totalDeductions: 48625000,
    netAmount: 112625000,
  },
  {
    id: 4,
    staffId: 104,
    staffCode: '۱۱۰۴',
    nationalCode: '۰۰۴۴۴۴۴۴۴۴',
    name: 'دکتر علی حسینی',
    academicRank: 'دانشیار',
    degree: 'دکتری تخصصی (Ph.D.)',
    departmentName: 'مهندسی کامپیوتر',
    contractType: 'FULL_TIME_FACULTY',
    baseDutyUnits: 10.0,
    baseRatePerUnit: 49000000,
    evaluatedScore: 4.40,
    gradesFinalized: true,
    contractSigned: true,
    appointmentSigned: true,
    computedAt: '۱۴۰۵/۱۰/۲۸ - ۱۰:۳۰',
    status: 'FINANCE_SETTLED',
    approvedByDeptHeadAt: '۱۴۰۵/۱۰/۲۸ - ۱۱:۰۰',
    approvedByDeanAt: '۱۴۰۵/۱۰/۲۸ - ۱۶:۰۰',
    settledAt: '۱۴۰۵/۱۰/۲۹ - ۱۰:۰۰',
    iban: 'IR330120000000123456789004',
    bankName: 'بانک صادرات ایران',
    courses: [
      { id: 1, courseCode: '1112105', courseTitle: 'فیزیک عمومی ۱', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 25, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 2, courseCode: '1112204', courseTitle: 'مدار منطقی', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 35, multiplier: 1.0, teachingSharePercent: 70, equivalentUnits: 2.1 },
      { id: 3, courseCode: '1112501', courseTitle: 'محاسبات موازی و ابری', degreeLevel: 'دکتری تخصصی', courseType: 'نظری', units: 3, studentsCount: 8, multiplier: 1.5, teachingSharePercent: 100, equivalentUnits: 4.5 },
      { id: 4, courseCode: '1112502', courseTitle: 'راهنمایی رساله دکتری (۱ دانشجو)', degreeLevel: 'دکتری تخصصی', courseType: 'پایان‌نامه', units: 2, studentsCount: 1, multiplier: 2.0, teachingSharePercent: 100, equivalentUnits: 4.0 },
    ],
    totalEquivalentUnits: 13.6,
    overloadUnits: 3.6,
    grossAmount: 176400000,
    classAbsencePenaltyUnits: 0,
    classAbsencePenaltyAmount: 0,
    examAbsencePenaltyAmount: 0,
    lateGradePenaltyAmount: 0,
    taxRate: 0.10,
    taxAmount: 17640000,
    totalDeductions: 17640000,
    netAmount: 158760000,
  },
  {
    id: 5,
    staffId: 105,
    staffCode: '۱۱۸۵',
    nationalCode: '۰۰۵۵۵۵۵۵۵۵',
    name: 'استاد نیلوفر مهدوی (مدعو)',
    academicRank: 'استادیار',
    degree: 'دکتری تخصصی (Ph.D.)',
    departmentName: 'مهندسی صنایع',
    contractType: 'ADJUNCT',
    baseDutyUnits: 0.0,
    baseRatePerUnit: 38000000,
    evaluatedScore: 4.65,
    gradesFinalized: true,
    contractSigned: true,
    appointmentSigned: true,
    computedAt: '۱۴۰۵/۱۰/۲۸ - ۱۰:۳۰',
    status: 'DEAN_APPROVED',
    approvedByDeptHeadAt: '۱۴۰۵/۱۰/۲۸ - ۱۴:۰۰',
    approvedByDeanAt: '۱۴۰۵/۱۰/۲۹ - ۰۸:۳۰',
    iban: 'IR990150000000123456789005',
    bankName: 'بانک پاسارگاد',
    courses: [
      { id: 1, courseCode: '1212101', courseTitle: 'تحقیق در عملیات ۱', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 38, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 2, courseCode: '1212202', courseTitle: 'کنترل کیفیت آماری', degreeLevel: 'کارشناسی', courseType: 'نظری', units: 3, studentsCount: 32, multiplier: 1.0, teachingSharePercent: 100, equivalentUnits: 3.0 },
      { id: 3, courseCode: '1212305', courseTitle: 'سیستم‌های صف و شبیه‌سازی', degreeLevel: 'کارشناسی ارشد', courseType: 'نظری', units: 3, studentsCount: 16, multiplier: 1.2, teachingSharePercent: 100, equivalentUnits: 3.6 },
    ],
    totalEquivalentUnits: 9.6,
    overloadUnits: 9.6,
    grossAmount: 364800000,
    classAbsencePenaltyUnits: 0,
    classAbsencePenaltyAmount: 0,
    examAbsencePenaltyAmount: 0,
    lateGradePenaltyAmount: 0,
    taxRate: 0.10,
    taxAmount: 36480000,
    totalDeductions: 36480000,
    netAmount: 328320000,
  },
];

const INITIAL_BIOMETRIC_LOGS: BiometricAttendanceLogItem[] = [
  {
    id: 1,
    staffCode: '۱۱۰۲',
    profName: 'دکتر جمیل احمدی',
    sessionDate: '۱۴۰۵/۰۸/۱۲',
    courseTitle: 'ریاضی عمومی ۱',
    groupNumber: 1,
    classTime: '۰۸:۰۰ - ۱۰:۰۰',
    isBackToBack: false,
    gatePunchTime: '۰۷:۴۸:۱۲',
    verificationMethod: 'GATE_FINGERPRINT',
    verificationDetail: 'تطبیق موفق اثر انگشت در گیت ورودی اصلی (ساختمان آموزش)',
    ipAddress: '192.168.10.45 (شبکه داخلی دانشگاه)',
    isFlaggedSuspicious: false,
    payrollPenaltyAmount: 0,
  },
  {
    id: 2,
    staffCode: '۱۱۰۲',
    profName: 'دکتر جمیل احمدی',
    sessionDate: '۱۴۰۵/۰۸/۱۲',
    courseTitle: 'ساختمان داده‌ها',
    groupNumber: 1,
    classTime: '۱۰:۰۰ - ۱۲:۰۰',
    isBackToBack: true,
    gatePunchTime: undefined,
    verificationMethod: 'CHAIN_MATCHING_CONTINUOUS',
    verificationDetail: 'منطق پیوستگی زنجیره‌ای (Chain Matching): کلاس متوالی دوم — تایید خودکار حضور بدون نیاز به اثر انگشت مجدد در گیت',
    ipAddress: '192.168.10.45 (شبکه داخلی دانشگاه)',
    isFlaggedSuspicious: false,
    payrollPenaltyAmount: 0,
  },
  {
    id: 3,
    staffCode: '۱۱۰۵',
    profName: 'دکتر سارا رضایی',
    sessionDate: '۱۴۰۵/۰۸/۱۴',
    courseTitle: 'مبانی برنامه‌نویسی',
    groupNumber: 1,
    classTime: '۱۳:۳۰ - ۱۵:۳۰',
    isBackToBack: false,
    gatePunchTime: '۱۳:۱۵:۴۰',
    verificationMethod: 'CLASS_PC_LOGIN',
    verificationDetail: 'لاگین مستقیم استاد در کامپیوتر تریبون کلاس ۳۰۴ (Single Sign-On)',
    ipAddress: '10.20.4.102 (Classroom PC)',
    isFlaggedSuspicious: false,
    payrollPenaltyAmount: 0,
  },
  {
    id: 4,
    staffCode: '۱۱۹۰',
    profName: 'استاد مهدی کاظمی (مدعو)',
    sessionDate: '۱۴۰۵/۰۸/۱۶',
    courseTitle: 'طراحی الگوریتم‌ها',
    groupNumber: 1,
    classTime: '۰۸:۰۰ - ۱۰:۰۰',
    isBackToBack: false,
    gatePunchTime: undefined,
    verificationMethod: 'UNJUSTIFIED_ABSENCE',
    verificationDetail: 'عدم ثبت اثر انگشت در گیت، عدم لاگین کلاسی و عدم تشکیل جلسه جبرانی',
    ipAddress: '—',
    isFlaggedSuspicious: true,
    payrollPenaltyAmount: 12500000,
  },
];

const INITIAL_APPOINTMENT_DECREES: TeachingAppointmentDecree[] = [
  {
    id: 1,
    decreeNo: 'AF-DEC-1405-1102',
    staffCode: '۱۱۰۲',
    profName: 'دکتر جمیل احمدی',
    academicRank: 'استادیار',
    departmentName: 'مهندسی کامپیوتر',
    termTitle: 'نیمسال اول ۱۴۰۵-۱۴۰۴',
    issueDate: '۱۴۰۵/۰۶/۲۵',
    coursesList: [
      { code: '1112101', title: 'ریاضی عمومی ۱', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112201', title: 'ساختمان داده‌ها', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112302', title: 'سیستم‌های عامل پیشرفته', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112401', title: 'آزمایشگاه شبکه‌های کامپیوتری', group: 1, units: 2, weeklyHours: 2 },
    ],
    totalWeeklyHours: 11,
    totalTermHours: 176,
    signatureStatus: 'SIGNED',
    signedAt: '۱۴۰۵/۰۶/۲۸ - ۱۰:۱۵',
    ipAddress: '192.168.10.45',
    otpUsed: '94182',
    documentHash: 'SHA256:7f9a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
  },
  {
    id: 2,
    decreeNo: 'AF-DEC-1405-1105',
    staffCode: '۱۱۰۵',
    profName: 'دکتر سارا رضایی',
    academicRank: 'استادیار',
    departmentName: 'مهندسی کامپیوتر',
    termTitle: 'نیمسال اول ۱۴۰۵-۱۴۰۴',
    issueDate: '۱۴۰۵/۰۶/۲۵',
    coursesList: [
      { code: '1112103', title: 'مبانی برنامه‌نویسی', group: 1, units: 4, weeklyHours: 4 },
      { code: '1112202', title: 'برنامه‌نویسی پیشرفته', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112303', title: 'پایگاه داده‌ها', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112402', title: 'هوش مصنوعی پیشرفته', group: 1, units: 3, weeklyHours: 3 },
    ],
    totalWeeklyHours: 13,
    totalTermHours: 208,
    signatureStatus: 'SIGNED',
    signedAt: '۱۴۰۵/۰۶/۲۹ - ۱۶:۳۰',
    ipAddress: '192.168.10.52',
    otpUsed: '58124',
    documentHash: 'SHA256:9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d',
  },
  {
    id: 3,
    decreeNo: 'AF-DEC-1405-1190',
    staffCode: '۱۱۹۰',
    profName: 'استاد مهدی کاظمی (مدعو)',
    academicRank: 'مربی',
    departmentName: 'مهندسی کامپیوتر',
    termTitle: 'نیمسال اول ۱۴۰۵-۱۴۰۴',
    issueDate: '۱۴۰۵/۰۶/۲۵',
    coursesList: [
      { code: '1112301', title: 'طراحی الگوریتم‌ها', group: 1, units: 3, weeklyHours: 3 },
      { code: '1112108', title: 'مبانی فناوری اطلاعات (گروه ۲)', group: 2, units: 3, weeklyHours: 3 },
    ],
    totalWeeklyHours: 6,
    totalTermHours: 96,
    signatureStatus: 'PENDING',
  },
];

export default function PayrollEngineClient() {
  const [activeTab, setActiveTab] = useState<PayrollTabType>('STATEMENTS_CARTABLE');
  const [payrollRecords, setPayrollRecords] = useState<ProfessorPayrollRecord[]>(INITIAL_PAYROLL_RECORDS);
  const [baseRates, setBaseRates] = useState<BaseRateItem[]>(INITIAL_BASE_RATES);
  const [multipliers, setMultipliers] = useState<MultiplierRuleItem[]>(INITIAL_MULTIPLIERS);
  const [biometricLogs, setBiometricLogs] = useState<BiometricAttendanceLogItem[]>(INITIAL_BIOMETRIC_LOGS);
  const [appointmentDecrees, setAppointmentDecrees] = useState<TeachingAppointmentDecree[]>(INITIAL_APPOINTMENT_DECREES);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [contractFilter, setContractFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals & Selections
  const [detailedPayslipRecord, setDetailedPayslipRecord] = useState<ProfessorPayrollRecord | null>(null);
  const [selectedDecreeForView, setSelectedDecreeForView] = useState<TeachingAppointmentDecree | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Insurance, Tax & Advance Remuneration States
  const [globalTaminSyncEnabled, setGlobalTaminSyncEnabled] = useState<boolean>(true);
  const [profFinancialSettings, setProfFinancialSettings] = useState([
    {
      staffId: 101,
      staffCode: '۱۱۰۲',
      name: 'دکتر جمیل احمدی',
      contractType: 'FULL_TIME_FACULTY',
      canRequestAdvance: false, // پیش‌فرض پنهان
      isInsuranceEnabled: true, // بیمه روزانه تامین اجتماعی
      isTaxExempt: false,
      daysTaughtCount: 16,
      advanceAmountRequested: 0,
      advanceAmountApproved: 0,
      advanceStatus: 'NONE',
    },
    {
      staffId: 102,
      staffCode: '۱۱۰۵',
      name: 'دکتر سارا رضایی',
      contractType: 'FULL_TIME_FACULTY',
      canRequestAdvance: true, // فعال‌شده توسط مدیر مالی برای تقاضای موردی
      isInsuranceEnabled: true,
      isTaxExempt: false,
      daysTaughtCount: 14,
      advanceAmountRequested: 50000000,
      advanceAmountApproved: 50000000,
      advanceStatus: 'PAID',
    },
    {
      staffId: 103,
      staffCode: '۱۱۹۰',
      name: 'استاد مهدی کاظمی (مدعو)',
      contractType: 'ADJUNCT',
      canRequestAdvance: true, // فعال‌شده توسط مدیر مالی
      isInsuranceEnabled: true,
      isTaxExempt: false,
      daysTaughtCount: 12,
      advanceAmountRequested: 40000000,
      advanceAmountApproved: 35000000,
      advanceStatus: 'APPROVED',
    },
    {
      staffId: 104,
      staffCode: '۱۱۰۴',
      name: 'دکتر علی حسینی',
      contractType: 'FULL_TIME_FACULTY',
      canRequestAdvance: false,
      isInsuranceEnabled: true,
      isTaxExempt: false,
      daysTaughtCount: 15,
      advanceAmountRequested: 0,
      advanceAmountApproved: 0,
      advanceStatus: 'NONE',
    },
  ]);

  // Multi-hall Exam Aggregation & Archive Return Chain States
  const [courseExamAggregations, setCourseExamAggregations] = useState<CourseExamAggregationItem[]>([
    {
      id: 1,
      courseCode: '۱۱۱۲۱۰۱',
      courseTitle: 'ریاضی عمومی ۱',
      professorName: 'دکتر جمیل احمدی',
      totalHallsCount: 3, // آمفی‌تئاتر مرکزی، سالن شماره ۲، سالن ورزشی
      receivedHallsCount: 3,
      totalExpectedSheets: 65,
      totalDeliveredSheets: 65,
      isFullyCollected: true,
      notificationSent: true,
      pickupQrStatus: 'PICKED_UP_BY_PROF',
      pickupDate: '۱۴۰۵/۱۰/۱۹ - ۱۰:۰۰',
      gradeDeadline: '۱۴۰۵/۱۰/۲۹ (۱۰ روز کاری)',
      papersReturnedToArchive: true, // تایید بایگانی -> باز شدن تسویه مالی
      archiveReturnDate: '۱۴۰۵/۱۰/۲۶',
    },
    {
      id: 2,
      courseCode: '۱۱۱۲۱۰۳',
      courseTitle: 'مبانی برنامه‌نویسی',
      professorName: 'دکتر سارا رضایی',
      totalHallsCount: 2, // سایت ۱۰۲ و سایت ۱۰۳
      receivedHallsCount: 2,
      totalExpectedSheets: 40,
      totalDeliveredSheets: 40,
      isFullyCollected: true,
      notificationSent: true,
      pickupQrStatus: 'PICKED_UP_BY_PROF',
      pickupDate: '۱۴۰۵/۱۰/۲۲ - ۱۴:۳۰',
      gradeDeadline: '۱۴۰۵/۱۱/۰۲ (۱۰ روز کاری)',
      papersReturnedToArchive: false, // هنوز برنگشته -> قفل تسویه مالی ۶۰٪
      archiveReturnDate: undefined,
    },
    {
      id: 3,
      courseCode: '۱۱۱۲۱۰۵',
      courseTitle: 'فیزیک عمومی ۱',
      professorName: 'دکتر علی حسینی',
      totalHallsCount: 3, // سالن ۱، سالن ۳، آمفی‌تئاتر
      receivedHallsCount: 2, // ۲ سالن از ۳ سالن رسیده
      totalExpectedSheets: 70,
      totalDeliveredSheets: 45,
      isFullyCollected: false, // هنوز کامل نشده -> پیامک به استاد قفل است
      notificationSent: false,
      pickupQrStatus: 'WAITING_AGGREGATION',
      pickupDate: undefined,
      gradeDeadline: '—',
      papersReturnedToArchive: false,
      archiveReturnDate: undefined,
    },
  ]);

  // University Payment Policy: Full at term end vs Milestone Tranches
  const [paymentPolicy, setPaymentPolicy] = useState<'FULL_TERM_END' | 'MILESTONE_INSTALLMENTS'>('FULL_TERM_END');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 6000);
  };

  // ==========================================
  // AGGREGATED STATS & KPIS
  // ==========================================
  const totalGrossAmount = useMemo(() => {
    return payrollRecords.reduce((sum, r) => sum + r.grossAmount, 0);
  }, [payrollRecords]);

  const totalNetAmount = useMemo(() => {
    return payrollRecords.reduce((sum, r) => sum + r.netAmount, 0);
  }, [payrollRecords]);

  const totalDeductionsAmount = useMemo(() => {
    return payrollRecords.reduce((sum, r) => sum + r.totalDeductions, 0);
  }, [payrollRecords]);

  const totalEquivalentUnitsCount = useMemo(() => {
    return payrollRecords.reduce((sum, r) => sum + r.totalEquivalentUnits, 0);
  }, [payrollRecords]);

  const fullTimeFacultyCount = useMemo(() => {
    return payrollRecords.filter(r => r.contractType === 'FULL_TIME_FACULTY').length;
  }, [payrollRecords]);

  const adjunctFacultyCount = useMemo(() => {
    return payrollRecords.filter(r => r.contractType === 'ADJUNCT').length;
  }, [payrollRecords]);

  // ==========================================
  // ACTIONS & HANDLERS
  // ==========================================

  // Recalculate with live logs
  const handleRecalculateAll = () => {
    setPayrollRecords(prev =>
      prev.map(r => {
        const gross = r.overloadUnits * r.baseRatePerUnit;
        const tax = gross * r.taxRate;
        const deductions = tax + r.classAbsencePenaltyAmount + r.examAbsencePenaltyAmount + r.lateGradePenaltyAmount;
        const net = Math.max(0, gross - deductions);
        return {
          ...r,
          grossAmount: gross,
          taxAmount: tax,
          totalDeductions: deductions,
          netAmount: net,
          computedAt: 'هم‌اکنون (محاسبه آنلاین)',
        };
      })
    );
    showToast('🔄 محاسبات حقوق و حق‌التدریس کلیه اساتید بر اساس آخرین لاگ‌های حضور، امتحانات و ضرایب بازمحاسبه گردید.');
  };

  // Stage Approval Action
  const handleApproveStage = (id: number) => {
    const rec = payrollRecords.find(r => r.id === id);
    if (!rec) return;

    // Enforcement Gate: Final settlement blocked if grades not finalized or documents not signed
    if (rec.status === 'DEAN_APPROVED') {
      if (!rec.gradesFinalized) {
        alert('⛔ گلوگاه تسویه مالی: استاد هنوز کلیه نمرات دروس ترم را نهایی نکرده است. صدور سند تسویه مالی مسدود است.');
        return;
      }
      if (!rec.contractSigned || !rec.appointmentSigned) {
        alert('⛔ گلوگاه اسناد: استاد هنوز قرارداد یا ابلاغیه تدریس را با امضای الکترونیک تایید نکرده است.');
        return;
      }
    }

    setPayrollRecords(prev =>
      prev.map(r => {
        if (r.id === id) {
          let nextStatus: PayrollStatus = r.status;
          let deptAt = r.approvedByDeptHeadAt;
          let deanAt = r.approvedByDeanAt;
          let settled = r.settledAt;

          if (r.status === 'DRAFT') {
            nextStatus = 'DEPT_HEAD_APPROVED';
            deptAt = 'هم‌اکنون';
          } else if (r.status === 'DEPT_HEAD_APPROVED') {
            nextStatus = 'DEAN_APPROVED';
            deanAt = 'هم‌اکنون';
          } else if (r.status === 'DEAN_APPROVED') {
            nextStatus = 'FINANCE_SETTLED';
            settled = 'هم‌اکنون';
          }

          return {
            ...r,
            status: nextStatus,
            approvedByDeptHeadAt: deptAt,
            approvedByDeanAt: deanAt,
            settledAt: settled,
          };
        }
        return r;
      })
    );
    showToast(`✓ وضعیت تایید فیش حقوقی «${rec?.name}» به مرحله بعدی ارتقا یافت.`);
  };

  // Batch Payout & Settle
  const handleBatchSettle = () => {
    const eligible = payrollRecords.filter(r => r.status === 'DEAN_APPROVED' && r.gradesFinalized && r.contractSigned);
    if (eligible.length === 0) {
      showToast('⚠️ فیش آماده تسویه‌ای که کلیه گلوگاه‌های نمرات و امضای الکترونیک را پاس کرده باشد یافت نشد.');
      return;
    }
    setPayrollRecords(prev =>
      prev.map(r =>
        r.status === 'DEAN_APPROVED' && r.gradesFinalized && r.contractSigned
          ? { ...r, status: 'FINANCE_SETTLED', settledAt: 'هم‌اکنون' }
          : r
      )
    );
    showToast(`💳 تعداد ${eligible.length} فیش تاییدشده با موفقیت تسویه نهایی و سند پرداخت آن‌ها صادر شد.`);
  };

  // Export Bank ACH / Paya Diskette
  const handleExportBankDiskette = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'شماره ردیف,شماره شبا مقصد,نام صاحب حساب,مبلغ خالص (ریال),کد پرسنلی,کد ملی,نام بانک,شناسه پرداخت\n' +
      payrollRecords
        .map(
          (r, idx) =>
            `${idx + 1},${r.iban},${r.name},${r.netAmount},${r.staffCode},${r.nationalCode},${r.bankName},PAY-1405-${r.id}`
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Faculty_Payroll_Bank_Diskette_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('💾 فایل استاندارد دیسکت پرداخت بانکی (پایا/ساتنا/شبا) اساتید با موفقیت بارگیری شد.');
  };

  // Batch Generate Decrees
  const handleBatchGenerateDecrees = () => {
    showToast('🚀 ابلاغیه‌های رسمی تدریس (Teaching Appointment Decrees) برای کلیه ۴۰۰ استاد ترم در ۳ ثانیه تولید و پیامک اطلاع‌رسانی ارسال گردید.');
  };

  // Send Decree Reminder SMS
  const handleSendDecreeReminder = (profName: string) => {
    showToast(`📲 پیامک یادآوری امضای الکترونیکی ابلاغیه تدریس با موفقیت برای «${profName}» ارسال شد.`);
  };

  // Inline Rate Update
  const handleUpdateBaseRate = (id: number, newRate: number) => {
    setBaseRates(prev =>
      prev.map(b => (b.id === id ? { ...b, ratePerUnit: newRate, ratePerHour: Math.round(newRate / 16) } : b))
    );
    showToast('تعرفه پایه مرتبه علمی با موفقیت به‌روزرسانی گردید.');
  };

  // Inline Multiplier Update
  const handleUpdateMultiplier = (id: number, newMul: number) => {
    setMultipliers(prev =>
      prev.map(m => (m.id === id ? { ...m, multiplier: newMul } : m))
    );
    showToast('ضریب آیین‌نامه با موفقیت ذخیره شد.');
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Title */}
      <div className="card bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white p-5 rounded-2xl shadow-lg border border-indigo-800/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-700/80 border border-indigo-400/30 flex items-center justify-center text-3xl shadow-inner">
              💼
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-lg sm:text-xl tracking-tight">
                  سامانه جامع محاسبه حق‌التدریس، حضور بیومتریک و ابلاغیه‌های اساتید
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/90 text-white shadow-xs">
                  نیمسال اول ۱۴۰۵-۱۴۰۴
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-1">
                تطبیق هوشمند اثر انگشت گیت با منطق پیوستگی زنجیره‌ای (Chain Matching)، صدور ۱۰۰٪ بدون کاغذ ابلاغیه‌ها و دیسکت بانکی
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRecalculateAll}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-black text-xs shadow-md flex items-center gap-1.5 transition active:scale-95"
            >
              <span>🔄 بازمحاسبه آنلاین کلیه فیش‌ها</span>
            </button>
            <button
              onClick={handleExportBankDiskette}
              className="px-3.5 py-2 rounded-xl bg-indigo-800/80 hover:bg-indigo-700 text-indigo-100 font-bold text-xs border border-indigo-600/50 flex items-center gap-1.5 transition"
            >
              <span>💾 دریافت دیسکت بانکی (شبا)</span>
            </button>
            <Link
              href="/admin/exams"
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-600/50 flex items-center gap-1.5 transition"
            >
              <span>📝 ماژول امتحانات و صورتجلسات ←</span>
            </Link>
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-4 mt-4 border-t border-indigo-800/60 text-xs">
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[11px]">کل خالص پرداختی ترم:</span>
            <span className="text-base font-black text-emerald-400 font-mono">
              {totalNetAmount.toLocaleString('fa-IR')} <span className="text-[10px] font-normal text-indigo-200">ريال</span>
            </span>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[11px]">تعداد کل اساتید:</span>
            <span className="text-base font-black text-white">
              {payrollRecords.length} نفر ({fullTimeFacultyCount} هیئت علمی · {adjunctFacultyCount} مدعو)
            </span>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[11px]">مجموع واحدهای معادل:</span>
            <span className="text-base font-black text-amber-300 font-mono">
              {totalEquivalentUnitsCount.toFixed(2)} واحد
            </span>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[11px]">مجموع کسورات قانونی و انضباطی:</span>
            <span className="text-base font-black text-rose-300 font-mono">
              {totalDeductionsAmount.toLocaleString('fa-IR')} <span className="text-[10px] font-normal text-indigo-200">ريال</span>
            </span>
          </div>
          <div className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/40">
            <span className="text-indigo-300 block text-[11px]">وضعیت تسویه مالی:</span>
            <span className="text-base font-black text-emerald-300">
              {payrollRecords.filter(r => r.status === 'FINANCE_SETTLED').length} فیش تسویه شده
            </span>
          </div>
        </div>
      </div>

      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-lg">📢</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-700 font-black">✕</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white p-2 rounded-2xl shadow-xs border border-slate-200">
        <button
          onClick={() => setActiveTab('STATEMENTS_CARTABLE')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'STATEMENTS_CARTABLE'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📋 کارتابل فیش‌های حق‌التدریس اساتید</span>
        </button>

        <button
          onClick={() => setActiveTab('ATTENDANCE_BIOMETRIC_CHAIN')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'ATTENDANCE_BIOMETRIC_CHAIN'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🧬 پایش تردد بیومتریک و پیوستگی کلاس‌ها (Chain Matching)</span>
        </button>

        <button
          onClick={() => setActiveTab('ELECTRONIC_DECREES')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'ELECTRONIC_DECREES'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📜 ابلاغیه‌ها و صدور احکام تدریس (E-Sign)</span>
        </button>

        <button
          onClick={() => setActiveTab('INSURANCE_AND_ADVANCES')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'INSURANCE_AND_ADVANCES'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🏥 بیمه تامین اجتماعی، مالیات و مساعده</span>
        </button>

        <button
          onClick={() => setActiveTab('EXAM_AGGREGATION_CHAIN')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'EXAM_AGGREGATION_CHAIN'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📦 تجمیع اوراق امتحانی و بایگانی (No Sheet, No Pay)</span>
        </button>

        <button
          onClick={() => setActiveTab('BASE_RATES')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'BASE_RATES'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🏷️ جدول تعرفه پایه مرتبه علمی</span>
        </button>

        <button
          onClick={() => setActiveTab('MULTIPLIERS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'MULTIPLIERS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>⚙️ موتور ضرایب پویا (تئوری/عملی/ارشد/دکتری)</span>
        </button>

        <button
          onClick={() => setActiveTab('CONTRACTS')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'CONTRACTS'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📝 قراردادها و سقف موظفی</span>
        </button>

        <button
          onClick={() => setActiveTab('BANK_DISKETTE')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'BANK_DISKETTE'
              ? 'bg-indigo-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>💳 صدور دیسکت پرداخت بانکی (شبا)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: STATEMENTS CARTABLE */}
      {/* ========================================================================= */}
      {activeTab === 'STATEMENTS_CARTABLE' && (
        <div className="card space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                کارتابل صدور و تایید چندمرحله‌ای فیش‌های حق‌التدریس ترم
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                گردش کار رسمی: پیش‌نویس سیستمی ← تایید مدیر گروه ← تایید معاونت آموزشی ← تسویه امور مالی
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchSettle}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition active:scale-95"
              >
                <span>✅ تسویه و واریز کلیه فیش‌های تاییدشده</span>
              </button>
            </div>
          </div>

          {/* Payment Policy Selector Banner */}
          <div className="p-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="text-amber-300 font-bold block">⚖️ شیوه و خط‌مشی پرداخت حق‌التدریس دانشگاه:</span>
              <p className="text-indigo-200 text-[11px]">
                {paymentPolicy === 'FULL_TERM_END'
                  ? 'سیاست فعلی: پرداخت ۱۰۰٪ حق‌التدریس در پایان ترم پس از تایید نمرات و تحویل فیزیکی اوراق به بایگانی'
                  : 'سیاست فعلی: پرداخت ۳ مرحله‌ای در طول ترم (۲۰٪ پس از جلسه ۴ + ۳۰٪ پس از میان‌ترم + ۵۰٪ تسویه نهایی بایگانی)'}
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-white/10 p-1 rounded-xl border border-white/15 shrink-0">
              <button
                onClick={() => {
                  setPaymentPolicy('FULL_TERM_END');
                  showToast('سیاست پرداخت به «۱۰۰٪ یکجا در پایان ترم» تغییر یافت.');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  paymentPolicy === 'FULL_TERM_END'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                پرداخت یکجا پایان ترم
              </button>
              <button
                onClick={() => {
                  setPaymentPolicy('MILESTONE_INSTALLMENTS');
                  showToast('سیاست پرداخت به «اقساطی ۳ مرحله‌ای در طول ترم با شروط جلسات» تغییر یافت.');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  paymentPolicy === 'MILESTONE_INSTALLMENTS'
                    ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                پرداخت اقساطی چندمرحله‌ای
              </button>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">نوع قرارداد:</span>
                <select
                  value={contractFilter}
                  onChange={e => setContractFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800"
                >
                  <option value="ALL">همه اساتید</option>
                  <option value="FULL_TIME_FACULTY">اعضای هیئت علمی تمام‌وقت</option>
                  <option value="ADJUNCT">اساتید مدعو / حق‌التدریس</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">وضعیت گردش کار:</span>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800"
                >
                  <option value="ALL">همه وضعیت‌ها</option>
                  <option value="DRAFT">پیش‌نویس سیستمی</option>
                  <option value="DEPT_HEAD_APPROVED">تایید مدیر گروه</option>
                  <option value="DEAN_APPROVED">تایید معاونت آموزشی</option>
                  <option value="FINANCE_SETTLED">تسویه نهایی مالی</option>
                </select>
              </div>
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                placeholder="جستجو با نام استاد یا کد پرسنلی..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs bg-white text-slate-800"
              />
            </div>
          </div>

          {/* Table of Statements */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">کد</th>
                  <th className="p-2.5">نام استاد</th>
                  <th className="p-2.5">مرتبه علمی</th>
                  <th className="p-2.5">نوع قرارداد و موظفی</th>
                  <th className="p-2.5 text-center">کل واحد معادل</th>
                  <th className="p-2.5 text-center">واحد مازاد</th>
                  <th className="p-2.5 text-center">ناخالص (ريال)</th>
                  <th className="p-2.5 text-center">کسورات (ريال)</th>
                  <th className="p-2.5 text-center">خالص دریافتی (ريال)</th>
                  <th className="p-2.5 text-center">گلوگاه‌های تسویه</th>
                  <th className="p-2.5 text-center">وضعیت تایید</th>
                  <th className="p-2.5 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {payrollRecords
                  .filter(r => {
                    if (contractFilter !== 'ALL' && r.contractType !== contractFilter) return false;
                    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
                    if (searchQuery.trim()) {
                      const q = searchQuery.trim().toLowerCase();
                      return r.name.toLowerCase().includes(q) || r.staffCode.includes(q) || r.nationalCode.includes(q);
                    }
                    return true;
                  })
                  .map(rec => (
                    <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="p-2.5 font-mono font-bold text-slate-700" dir="ltr">
                        {rec.staffCode}
                      </td>
                      <td className="p-2.5 font-black text-slate-900">
                        <div>{rec.name}</div>
                        <div className="text-[10px] text-slate-500">{rec.departmentName}</div>
                      </td>
                      <td className="p-2.5 font-bold text-indigo-950">{rec.academicRank}</td>
                      <td className="p-2.5 text-[11px]">
                        {rec.contractType === 'FULL_TIME_FACULTY' ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 font-bold">
                            هیئت علمی ({rec.baseDutyUnits} واحد موظفی)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-950 font-bold">
                            اساتید مدعو (از واحد اول)
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-800">
                        {rec.totalEquivalentUnits.toFixed(2)}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-indigo-900">
                        {rec.overloadUnits.toFixed(2)}
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                        {rec.grossAmount.toLocaleString('fa-IR')}
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-rose-700">
                        {rec.totalDeductions.toLocaleString('fa-IR')}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-emerald-800 text-sm bg-emerald-50/40">
                        {rec.netAmount.toLocaleString('fa-IR')}
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex flex-col gap-0.5 text-[9px] font-bold">
                          <span className={rec.gradesFinalized ? 'text-emerald-700' : 'text-rose-600'}>
                            {rec.gradesFinalized ? '✓ نمرات نهایی' : '⚠️ نمرات باز'}
                          </span>
                          <span className={rec.contractSigned ? 'text-emerald-700' : 'text-rose-600'}>
                            {rec.contractSigned ? '✓ امضای قرارداد' : '⚠️ فاقد امضا'}
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        {rec.status === 'FINANCE_SETTLED' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white">
                            ✓ تسویه نهایی مالی
                          </span>
                        ) : rec.status === 'DEAN_APPROVED' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white">
                            ✓ تایید معاونت آموزش
                          </span>
                        ) : rec.status === 'DEPT_HEAD_APPROVED' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                            ✓ تایید مدیر گروه
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-800">
                            پیش‌نویس سیستمی
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailedPayslipRecord(rec)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-black text-[11px] transition"
                          >
                            📄 فیش تفصیلی
                          </button>
                          {rec.status !== 'FINANCE_SETTLED' && (
                            <button
                              onClick={() => handleApproveStage(rec.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] shadow-xs transition"
                            >
                              ✓ تایید مرحله
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: BIOMETRIC GATE & CHAIN MATCHING ENGINE */}
      {/* ========================================================================= */}
      {activeTab === 'ATTENDANCE_BIOMETRIC_CHAIN' && (
        <div className="card space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-slate-900 text-base">
                  🧬 موتور تطبیق هوشمند اثر انگشت گیت ورودی و پیوستگی کلاس‌ها (Chain Matching)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-200">
                  اتصال به گیت‌های سخت‌افزاری ZKTeco / Suprema
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                تطبیق لاگ تردد گیت با ساعات کلاسی، تایید خودکار کلاس‌های متوالی بدون نیاز به ثبت مکرر اثر انگشت (Buffer Time: ۱۵ الی ۳۰ دقیقه)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs">
                📶 وضعیت وب‌هوک گیت ورودی: برخط (Live)
              </span>
            </div>
          </div>

          {/* KPI Cards for Biometric Attendance */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-200">
              <span className="text-indigo-800 text-[11px] block font-bold">تطبیق با گیت ورودی (۰۷:۴۵):</span>
              <span className="text-base font-black text-indigo-950 font-mono">
                {biometricLogs.filter(l => l.verificationMethod === 'GATE_FINGERPRINT').length} جلسه (کلاس اول) 🧬
              </span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
              <span className="text-emerald-800 text-[11px] block font-bold">پیوستگی زنجیره‌ای (Chain Match):</span>
              <span className="text-base font-black text-emerald-950 font-mono">
                {biometricLogs.filter(l => l.verificationMethod === 'CHAIN_MATCHING_CONTINUOUS').length} جلسه (کلاس‌های متوالی) 🔗
              </span>
            </div>
            <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200">
              <span className="text-blue-800 text-[11px] block font-bold">لاگین سیستم تریبون کلاس (SSO):</span>
              <span className="text-base font-black text-blue-950 font-mono">
                {biometricLogs.filter(l => l.verificationMethod === 'CLASS_PC_LOGIN').length} جلسه تاییدشده 🖥️
              </span>
            </div>
            <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200">
              <span className="text-rose-800 text-[11px] block font-bold">غیبت غیرموجه قطعی (کسر از حقوق):</span>
              <span className="text-base font-black text-rose-950 font-mono">
                {biometricLogs.filter(l => l.verificationMethod === 'UNJUSTIFIED_ABSENCE').length} جلسه ⚠️
              </span>
            </div>
          </div>

          {/* Logic Explanation Box */}
          <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl space-y-2 text-xs">
            <h4 className="font-black text-amber-300 text-xs">
              💡 نحوه عملکرد منطق پیوستگی زنجیره‌ای (Chain Matching Logic) برای کلاس‌های پشت‌سرهم:
            </h4>
            <p className="text-indigo-100 leading-5">
              اگر استادی در یک روز دو کلاس متوالی داشته باشد (مثلاً کلاس اول ۰۸:۰۰ الی ۱۰:۰۰ و کلاس دوم ۱۰:۰۰ الی ۱۲:۰۰):
              <br />
              ۱. سیستم کلاس اول را با اثر انگشت ثبت‌شده در گیت ورودی (ساعت ۰۷:۴۸) تایید می‌کند.
              <br />
              ۲. برای کلاس دوم، سیستم <b>به هیچ وجه</b> به دنبال اثر انگشت مجدد در گیت ورودی نمی‌گردد؛ بلکه پایان موفقیت‌آمیز کلاس اول را به عنوان حضور پیوسته در محیط دانشگاه محسوب کرده و با احتساب ۱۵ الی ۳۰ دقیقه پنجره جابجایی بین ساختمان‌ها، کلاس دوم را به طور خودکار تایید می‌کند.
            </p>
          </div>

          {/* Biometric Logs Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">کد</th>
                  <th className="p-2.5">نام استاد</th>
                  <th className="p-2.5 text-center">تاریخ</th>
                  <th className="p-2.5">عنوان درس و گروه</th>
                  <th className="p-2.5 text-center">ساعت کلاسی</th>
                  <th className="p-2.5 text-center">تردد گیت ورودی</th>
                  <th className="p-2.5 text-center">روش تایید حضور</th>
                  <th className="p-2.5">جزئیات و آی‌پی ثبت‌شده</th>
                  <th className="p-2.5 text-center">اثر مالی</th>
                </tr>
              </thead>
              <tbody>
                {biometricLogs.map(log => (
                  <tr
                    key={log.id}
                    className={`border-b border-slate-100 ${
                      log.isFlaggedSuspicious ? 'bg-rose-50/80 font-bold' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-2.5 font-mono" dir="ltr">{log.staffCode}</td>
                    <td className="p-2.5 font-black text-slate-900">{log.profName}</td>
                    <td className="p-2.5 text-center font-mono font-bold text-slate-700">{log.sessionDate}</td>
                    <td className="p-2.5 font-bold text-indigo-950">
                      {log.courseTitle} (گروه {log.groupNumber})
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold">{log.classTime}</td>
                    <td className="p-2.5 text-center font-mono font-bold">
                      {log.gatePunchTime ? (
                        <span className="text-emerald-700">✓ {log.gatePunchTime}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-2.5 text-center">
                      {log.verificationMethod === 'GATE_FINGERPRINT' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-900">
                          🧬 اثر انگشت گیت
                        </span>
                      )}
                      {log.verificationMethod === 'CHAIN_MATCHING_CONTINUOUS' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900">
                          🔗 پیوستگی زنجیره‌ای (پشت‌سرهم)
                        </span>
                      )}
                      {log.verificationMethod === 'CLASS_PC_LOGIN' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-900">
                          🖥️ ورود به سیستم کلاس
                        </span>
                      )}
                      {log.verificationMethod === 'UNJUSTIFIED_ABSENCE' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white">
                          ⚠️ غیبت غیرموجه قطعی
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-[11px] text-slate-600">
                      <div>{log.verificationDetail}</div>
                      <div className="font-mono text-[10px] text-slate-400" dir="ltr">{log.ipAddress}</div>
                    </td>
                    <td className="p-2.5 text-center">
                      {log.payrollPenaltyAmount > 0 ? (
                        <span className="font-mono font-black text-rose-700">
                          - {log.payrollPenaltyAmount.toLocaleString('fa-IR')} ريال
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-bold">بدون کسر</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ELECTRONIC APPOINTMENT DECREES & E-SIGN */}
      {/* ========================================================================= */}
      {activeTab === 'ELECTRONIC_DECREES' && (
        <div className="card space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-slate-900 text-base">
                  📜 مدیریت و صدور ابلاغیه‌های رسمی تدریس (Teaching Appointment Decrees)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-200">
                  سامانه ۱۰۰٪ بدون کاغذ (Paperless)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                صدور ابلاغیه‌های تدریس ترم با امضای الکترونیک، احراز هویت دو مرحله‌ای پیامکی (2FA/OTP) و قفل گلوگاه‌های آموزشی
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchGenerateDecrees}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-800 to-indigo-950 hover:from-indigo-900 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition active:scale-95"
              >
                <span>🚀 صدور دسته‌جمعی ابلاغیه‌های ترم</span>
              </button>
            </div>
          </div>

          {/* Decrees Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">شماره حکم ابلاغیه</th>
                  <th className="p-2.5">نام استاد</th>
                  <th className="p-2.5">مرتبه و دانشکده</th>
                  <th className="p-2.5">دروس مصوب تخصیص‌یافته</th>
                  <th className="p-2.5 text-center">مجموع ساعات ترم</th>
                  <th className="p-2.5 text-center">وضعیت امضای الکترونیک</th>
                  <th className="p-2.5 text-center">شناسه امنیتی (Hash)</th>
                  <th className="p-2.5 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {appointmentDecrees.map(decree => (
                  <tr key={decree.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2.5 font-mono font-bold text-slate-700" dir="ltr">
                      {decree.decreeNo}
                    </td>
                    <td className="p-2.5 font-black text-slate-900">{decree.profName}</td>
                    <td className="p-2.5 text-slate-700">
                      <div>{decree.academicRank}</div>
                      <div className="text-[10px] text-slate-500">{decree.departmentName}</div>
                    </td>
                    <td className="p-2.5 font-bold text-indigo-950">
                      {decree.coursesList.map(c => `${c.title} (${c.units} واحد)`).join('، ')}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-slate-800">
                      {decree.totalTermHours} ساعت ({decree.totalWeeklyHours} ساعت/هفته)
                    </td>
                    <td className="p-2.5 text-center">
                      {decree.signatureStatus === 'SIGNED' ? (
                        <div>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs">
                            ✓ امضا شده با OTP
                          </span>
                          <div className="text-[9px] text-slate-500 font-mono mt-0.5">{decree.signedAt}</div>
                        </div>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950">
                          در انتظار امضای استاد
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-center font-mono text-[10px] text-slate-500" dir="ltr">
                      {decree.documentHash ? `${decree.documentHash.slice(0, 16)}...` : '—'}
                    </td>
                    <td className="p-2.5 text-left">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedDecreeForView(decree)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-black text-[11px] transition"
                        >
                          📜 مشاهده ابلاغیه
                        </button>
                        {decree.signatureStatus === 'PENDING' && (
                          <button
                            onClick={() => handleSendDecreeReminder(decree.profName)}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 font-black text-[10px] transition"
                          >
                            📲 پیامک یادآوری
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: INSURANCE & INTERIM ADVANCE REMUNERATION MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'INSURANCE_AND_ADVANCES' && (
        <div className="card space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-slate-900 text-base">
                  🏥 مدیریت هوشمند بیمه روزانه تامین اجتماعی، مالیات تکلیفی و مساعده‌های میان‌ترم
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-200">
                  قانون یک روز بیمه به ازای هر روز حضور
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                محاسبه خودکار ۱ روز بیمه در تاریخ‌های تدریس بدون احتساب تکراری در روزهای چندکلاسه · فعال‌سازی گزینشی مساعده فقط برای اساتید متقاضی
              </p>
            </div>

            {/* Global Master Switch */}
            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
              <span className="text-xs font-black text-slate-800">کلید اصلی اتصال به تامین اجتماعی:</span>
              <button
                onClick={() => {
                  setGlobalTaminSyncEnabled(!globalTaminSyncEnabled);
                  showToast(
                    `ارسال خودکار به سامانه تامین اجتماعی ${
                      !globalTaminSyncEnabled ? 'فعال (ON)' : 'غیرفعال (OFF)'
                    } شد.`
                  );
                }}
                className={`px-3 py-1 rounded-xl text-xs font-black transition ${
                  globalTaminSyncEnabled
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-300 text-slate-700'
                }`}
              >
                {globalTaminSyncEnabled ? 'روشن (ON) ✓' : 'خاموش (OFF)'}
              </button>
            </div>
          </div>

          {/* Logic Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 space-y-1">
              <span className="text-indigo-900 font-bold block">قانون بیمه روزانه تامین اجتماعی:</span>
              <p className="text-indigo-950 font-bold leading-5">
                اگر استادی در یک روز ۳ کلاس (صبح، ظهر، عصر) داشته باشد، دقیقاً <b>۱ روز بیمه</b> رد می‌شود تا روزهای کارکرد ماهانه از سقف تجاوز نکند.
              </p>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-1">
              <span className="text-amber-900 font-bold block">سیاست پرداخت مساعده (Advance):</span>
              <p className="text-amber-950 font-bold leading-5">
                منوی درخواست علی‌الحساب برای عموم اساتید <b>پنهان</b> است تا بار مالی زودرس ایجاد نشود؛ مدیر مالی می‌تواند به صورت موردی آن را برای استاد فعال کند.
              </p>
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1">
              <span className="text-emerald-900 font-bold block">کسر خودکار در تسویه نهایی:</span>
              <p className="text-emerald-950 font-bold leading-5">
                مبالغ مساعده پرداخت‌شده در میان‌ترم، به طور اتوماتیک از فیش تسویه حساب پایان ترم کسر می‌شوند (جلوگیری از پرداخت مضاعف).
              </p>
            </div>
          </div>

          {/* Table of Professors Settings */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-3">کد</th>
                  <th className="p-3">نام عضو هیئت علمی / مدرس</th>
                  <th className="p-3 text-center">روزهای تدریس ماه جاری</th>
                  <th className="p-3 text-center">بیمه تامین اجتماعی</th>
                  <th className="p-3 text-center">مالیات تکلیفی ۱۰٪</th>
                  <th className="p-3 text-center">دسترسی به درخواست مساعده</th>
                  <th className="p-3 text-center">مبلغ علی‌الحساب</th>
                  <th className="p-3 text-left">عملیات مالی</th>
                </tr>
              </thead>
              <tbody>
                {profFinancialSettings.map(prof => (
                  <tr key={prof.staffId} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-slate-600" dir="ltr">
                      {prof.staffCode}
                    </td>
                    <td className="p-3 font-black text-slate-900">{prof.name}</td>
                    <td className="p-3 text-center font-mono font-black text-indigo-950">
                      {faNum(prof.daysTaughtCount)} روز کارکرد
                    </td>

                    {/* Insurance Toggle */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          setProfFinancialSettings(prev =>
                            prev.map(p =>
                              p.staffId === prof.staffId ? { ...p, isInsuranceEnabled: !p.isInsuranceEnabled } : p
                            )
                          );
                          showToast(`وضعیت بیمه تامین اجتماعی برای ${prof.name} تغییر یافت.`);
                        }}
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition ${
                          prof.isInsuranceEnabled
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {prof.isInsuranceEnabled ? '✓ مشمول بیمه روزانه' : 'معاف / خویش‌فرما'}
                      </button>
                    </td>

                    {/* Tax Status */}
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                        {prof.isTaxExempt ? 'معاف از مالیات' : '۱۰٪ کسر استاندارد'}
                      </span>
                    </td>

                    {/* Advance Request Access Toggle */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          const newState = !prof.canRequestAdvance;
                          setProfFinancialSettings(prev =>
                            prev.map(p =>
                              p.staffId === prof.staffId ? { ...p, canRequestAdvance: newState } : p
                            )
                          );
                          showToast(
                            `دسترسی به دکمه مساعده برای «${prof.name}» در پنل استادی ${
                              newState ? '🟢 فعال (قابل رویت)' : '🔴 پنهان (غیرفعال)'
                            } شد.`
                          );
                        }}
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition shadow-xs ${
                          prof.canRequestAdvance
                            ? 'bg-amber-400 text-slate-950 border border-amber-500'
                            : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}
                      >
                        {prof.canRequestAdvance ? '🔓 منو در پنل فعال است' : '🔒 پنهان از دید استاد'}
                      </button>
                    </td>

                    {/* Advance Amount Status */}
                    <td className="p-3 text-center font-mono">
                      {prof.advanceAmountRequested > 0 ? (
                        <div>
                          <span className="font-bold text-amber-700">
                            {faNum(prof.advanceAmountApproved.toLocaleString('fa-IR'))} ريال
                          </span>
                          <span className="block text-[9px] text-slate-500 font-sans">
                            {prof.advanceStatus === 'PAID' ? 'پرداخت شده (آماده کسر در تسویه)' : 'تایید شده'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">بدون مساعده</span>
                      )}
                    </td>

                    <td className="p-3 text-left">
                      {prof.advanceStatus === 'APPROVED' && (
                        <button
                          onClick={() => {
                            setProfFinancialSettings(prev =>
                              prev.map(p =>
                                p.staffId === prof.staffId ? { ...p, advanceStatus: 'PAID' } : p
                              )
                            );
                            showToast(`دستور پرداخت مساعده برای ${prof.name} صادر شد و سند حسابداری ثبت گردید.`);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] shadow-xs"
                        >
                          پرداخت علی‌الحساب 💳
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: MULTI-HALL EXAM AGGREGATION & ARCHIVE RETURN CHAIN */}
      {/* ========================================================================= */}
      {activeTab === 'EXAM_AGGREGATION_CHAIN' && (
        <div className="card space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-slate-900 text-base">
                  📦 تجمیع اوراق امتحانات چندسالنه، تحویل با QR و بازگشت به بایگانی (No Sheet, No Pay!)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-200">
                  الگوی سد تجمیعی (Barrier Synchronization)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                صبر تا تحویل ۱۰۰٪ برگه‌ها از تمام سالن‌ها قبل از ارسال پیامک به استاد · قفل تسویه مالی ۶۰٪ تا زمان تحویل فیزیکی اوراق به بایگانی
              </p>
            </div>
          </div>

          {/* Workflow Explanation Banner */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 text-xs">
            <h4 className="font-black text-amber-300">
              🔗 زنجیره ۴ مرحله‌ای ممیزی اوراق امتحانی و تسویه حساب مالی اساتید:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-indigo-100">
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10">
                <b>۱. تجمیع بسته‌ها در مخزن:</b> بررسی تمام سالن‌ها. تا آخرین برگه نرسد، پیامکی برای استاد ارسال نمی‌شود.
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10">
                <b>۲. تحویل به استاد با QR:</b> استاد بارکد روی گوشی را به مسئول مخزن نشان می‌دهد و مهلت ۱۰ روزه نمره فعال می‌شود.
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10">
                <b>۳. ثبت قطعی نمرات:</b> ورود نمرات در سامانه با تایید دو مرحله‌ای OTP.
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10">
                <b>۴. بازگشت به بایگانی:</b> تحویل اوراق فیزیکی به کارشناس بایگانی و آزادسازی تسویه نهایی ۶۰٪ حق‌التدریس.
              </div>
            </div>
          </div>

          {/* Aggregations Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-3">کد درس</th>
                  <th className="p-3">عنوان درس امتحانی</th>
                  <th className="p-3">استاد مدرس</th>
                  <th className="p-3 text-center">وضعیت سالن‌ها</th>
                  <th className="p-3 text-center">تعداد کل اوراق</th>
                  <th className="p-3 text-center">پیامک تجمیعی به استاد</th>
                  <th className="p-3 text-center">تحویل به استاد (QR)</th>
                  <th className="p-3 text-center">بازگشت به بایگانی</th>
                  <th className="p-3 text-left">عملیات بایگانی</th>
                </tr>
              </thead>
              <tbody>
                {courseExamAggregations.map(agg => (
                  <tr key={agg.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-slate-700" dir="ltr">
                      {agg.courseCode}
                    </td>
                    <td className="p-3 font-black text-slate-900">{agg.courseTitle}</td>
                    <td className="p-3 font-bold text-indigo-950">{agg.professorName}</td>

                    {/* Multi-hall Barrier Status */}
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-black ${
                          agg.isFullyCollected
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-900 animate-pulse'
                        }`}
                      >
                        {faNum(agg.receivedHallsCount)} از {faNum(agg.totalHallsCount)} سالن تحویل شد
                      </span>
                    </td>

                    <td className="p-3 text-center font-mono font-black text-slate-800">
                      {faNum(agg.totalDeliveredSheets)} از {faNum(agg.totalExpectedSheets)} برگه
                    </td>

                    {/* SMS Status */}
                    <td className="p-3 text-center">
                      {agg.notificationSent ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          ✓ پیامک ارسال شد
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px]">
                          قفل (منتظر سایر سالن‌ها)
                        </span>
                      )}
                    </td>

                    {/* Professor Pickup QR Status */}
                    <td className="p-3 text-center">
                      {agg.pickupQrStatus === 'PICKED_UP_BY_PROF' ? (
                        <div>
                          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-950 font-bold text-[10px]">
                            ✓ تحویل به استاد با QR
                          </span>
                          <span className="text-[9px] text-slate-500 block font-mono mt-0.5">
                            مهلت نمره: {agg.gradeDeadline}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">در انتظار تجمیع</span>
                      )}
                    </td>

                    {/* Physical Archive Return Gate */}
                    <td className="p-3 text-center">
                      {agg.papersReturnedToArchive ? (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-black text-[10px] shadow-xs">
                          ✓ تحویل بایگانی شد (تسویه مالی آزاد)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl bg-rose-100 text-rose-800 font-black text-[10px]">
                          ⛔ دست استاد (تسویه مالی قفل)
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-left">
                      {!agg.papersReturnedToArchive && agg.pickupQrStatus === 'PICKED_UP_BY_PROF' && (
                        <button
                          onClick={() => {
                            setCourseExamAggregations(prev =>
                              prev.map(a =>
                                a.id === agg.id
                                  ? {
                                      ...a,
                                      papersReturnedToArchive: true,
                                      archiveReturnDate: '۱۴۰۵/۱۰/۲۹',
                                    }
                                  : a
                              )
                            );
                            showToast(
                              `✓ اوراق تصحیح‌شده درس «${agg.courseTitle}» با موفقیت در بایگانی تحویل گرفته شد و قفل تسویه مالی ۶۰٪ آزاد گردید.`
                            );
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] shadow-xs"
                        >
                          تایید دریافت اوراق در بایگانی 📥
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: BASE RATES */}
      {/* ========================================================================= */}
      {activeTab === 'BASE_RATES' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                جدول تعرفه پایه حق‌التدریس بر اساس مرتبه علمی و مدرک تحصیلی
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تعیین نرخ مصوب هیئت امنا به ازای هر واحد معادل تدریس یا هر ساعت کارکرد آموزشی در سال تحصیلی ۱۴۰۵
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {baseRates.map(rate => (
              <div key={rate.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-900 text-sm">
                    مرتبه: {rate.academicRank} ({rate.degree})
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 font-bold">
                    سال ۱۴۰۵
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-500 block text-[11px]">نرخ مصوب هر واحد معادل (ريال):</span>
                    <input
                      type="number"
                      value={rate.ratePerUnit}
                      onChange={e => handleUpdateBaseRate(rate.id, parseInt(e.target.value) || 0)}
                      className="w-full mt-1 border border-slate-300 rounded px-2 py-1 font-mono font-bold text-slate-800 text-xs"
                    />
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-500 block text-[11px]">معادل هر ساعت تدریس (ريال):</span>
                    <span className="block mt-2 font-mono font-black text-indigo-900 text-sm">
                      {rate.ratePerHour.toLocaleString('fa-IR')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: MULTIPLIERS ENGINE */}
      {/* ========================================================================= */}
      {activeTab === 'MULTIPLIERS' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                موتور ضرایب پویا و آیین‌نامه محاسبه واحدهای معادل (Dynamic Coefficients)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                فرمولاسیون هوشمند: واحد درس × ضریب نوع درس (عملی ۱.۵) × ضریب مقطع (ارشد ۱.۲ / دکتری ۱.۵) × ضریب جمعیت کلاس
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">عنوان قانون ضریب</th>
                  <th className="p-2.5">دسته‌بندی</th>
                  <th className="p-2.5 text-center">ضریب اعمالی</th>
                  <th className="p-2.5">شرح قانون و استناد آیین‌نامه‌ای</th>
                  <th className="p-2.5 text-center">وضعیت فعال</th>
                </tr>
              </thead>
              <tbody>
                {multipliers.map(rule => (
                  <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2.5 font-black text-slate-900">{rule.ruleTitle}</td>
                    <td className="p-2.5">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                        {rule.category}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="3"
                        value={rule.multiplier}
                        onChange={e => handleUpdateMultiplier(rule.id, parseFloat(e.target.value) || 1.0)}
                        className="w-20 text-center border border-slate-300 rounded px-1.5 py-0.5 font-mono font-bold text-slate-800 text-xs"
                      />
                    </td>
                    <td className="p-2.5 text-slate-600 text-[11px]">{rule.description}</td>
                    <td className="p-2.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900">
                        فعال ✓
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: CONTRACTS */}
      {/* ========================================================================= */}
      {activeTab === 'CONTRACTS' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                مدیریت قراردادهای ترمیک و ساعات موظفی اساتید
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تفکیک قرارداد اعضای هیئت علمی تمام‌وقت (موظفی ۱۰ الی ۱۲ واحد) از اساتید مدعو (محاسبه حق‌التدریس از واحد ۱)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {payrollRecords.map(rec => (
              <div key={rec.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">{rec.name}</h3>
                    <p className="text-[11px] text-slate-500">کد پرسنلی: {rec.staffCode} · مرتبه: {rec.academicRank}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                    rec.contractType === 'FULL_TIME_FACULTY' ? 'bg-indigo-100 text-indigo-900' : 'bg-amber-100 text-amber-900'
                  }`}>
                    {rec.contractType === 'FULL_TIME_FACULTY' ? 'هیئت علمی تمام‌وقت' : 'استاد مدعو / حق‌التدریس'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 text-[11px] block">سقف موظفی آموزشی:</span>
                    <span className="font-mono font-black text-slate-900">{rec.baseDutyUnits} واحد ترمیک</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">نرخ مالیات تکلیفی:</span>
                    <span className="font-mono font-black text-slate-900">{(rec.taxRate * 100)}٪ (ماده ۸۶ ق.م.م)</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-200">
                    <span className="text-slate-500 text-[11px] block">شماره شبا بانکی جهت واریز:</span>
                    <span className="font-mono text-slate-800 text-[11px]" dir="ltr">{rec.iban}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: BANK DISKETTE */}
      {/* ========================================================================= */}
      {activeTab === 'BANK_DISKETTE' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-black text-slate-900 text-base">
                صدور دیسکت پرداخت بانکی (سامانه پایا و ساتنا بانک مرکزی)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تولید خروجی استاندارد دیسکت انتقال وجه گروهی بر اساس شماره‌های شبای تاییدشده اساتید
              </p>
            </div>

            <button
              onClick={handleExportBankDiskette}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-800 hover:from-emerald-800 text-white font-extrabold text-xs shadow flex items-center gap-1.5 transition"
            >
              <span>💾 بارگیری مستقیم فایل دیسکت بانکی (CSV/TXT)</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-2.5">ردیف</th>
                  <th className="p-2.5">نام و نام خانوادگی استاد</th>
                  <th className="p-2.5">کد ملی</th>
                  <th className="p-2.5">شماره شبا مقصد (IBAN)</th>
                  <th className="p-2.5">بانک عامل</th>
                  <th className="p-2.5 text-center">مبلغ خالص واریزی (ريال)</th>
                  <th className="p-2.5 text-center">شناسه پرداخت بانکی</th>
                </tr>
              </thead>
              <tbody>
                {payrollRecords.map((rec, idx) => (
                  <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2.5 font-mono">{idx + 1}</td>
                    <td className="p-2.5 font-black text-slate-900">{rec.name}</td>
                    <td className="p-2.5 font-mono" dir="ltr">{rec.nationalCode}</td>
                    <td className="p-2.5 font-mono text-[11px] text-slate-700" dir="ltr">{rec.iban}</td>
                    <td className="p-2.5 font-bold text-slate-800">{rec.bankName}</td>
                    <td className="p-2.5 text-center font-mono font-black text-emerald-800 text-sm bg-emerald-50/40">
                      {rec.netAmount.toLocaleString('fa-IR')}
                    </td>
                    <td className="p-2.5 text-center font-mono text-slate-500" dir="ltr">
                      PAY-1405-{rec.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: APPOINTMENT DECREE VIEW */}
      {/* ========================================================================= */}
      {selectedDecreeForView && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">📜</span>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    ابلاغیه رسمی تدریس — دانشگاه جامع آفاق
                  </h3>
                  <p className="text-[11px] text-indigo-300">
                    شماره حکم: {selectedDecreeForView.decreeNo} · {selectedDecreeForView.termTitle}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDecreeForView(null)}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="text-center space-y-1 border-b pb-4">
                <h2 className="font-black text-slate-900 text-base">جمهوری اسلامی ایران — وزارت علوم، تحقیقات و فناوری</h2>
                <h3 className="font-bold text-slate-700">حکم رسمی ابلاغ تدریس و وظایف آموزشی نیمسال</h3>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 gap-2">
                <div>نام عضو هیئت علمی / مدرس: <strong>{selectedDecreeForView.profName}</strong></div>
                <div>کد پرسنلی: <strong className="font-mono">{selectedDecreeForView.staffCode}</strong></div>
                <div>مرتبه علمی: <strong>{selectedDecreeForView.academicRank}</strong></div>
                <div>دانشکده / گروه: <strong>{selectedDecreeForView.departmentName}</strong></div>
              </div>

              <div>
                <h4 className="font-black text-slate-900 mb-2">فهرست دروس مصوب ابلاغ‌شده جهت تدریس:</h4>
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b">
                      <th className="p-2">کد درس</th>
                      <th className="p-2">عنوان درس</th>
                      <th className="p-2 text-center">گروه</th>
                      <th className="p-2 text-center">تعداد واحد</th>
                      <th className="p-2 text-center">ساعت تدریس هفتگی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDecreeForView.coursesList.map((c, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 font-mono" dir="ltr">{c.code}</td>
                        <td className="p-2 font-bold">{c.title}</td>
                        <td className="p-2 text-center">گروه {c.group}</td>
                        <td className="p-2 text-center font-bold">{c.units} واحد</td>
                        <td className="p-2 text-center font-bold">{c.weeklyHours} ساعت</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Digital Signature Stamp */}
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-300 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="font-black text-emerald-950 block text-xs">
                    {selectedDecreeForView.signatureStatus === 'SIGNED' ? '✓ سند دارای امضای الکترونیک معتبر و غیرقابل انکار است' : 'در انتظار تایید و امضای الکترونیک استاد'}
                  </span>
                  {selectedDecreeForView.signedAt && (
                    <span className="text-[10px] text-emerald-800 font-mono block">
                      تاریخ امضا: {selectedDecreeForView.signedAt} · کد OTP: {selectedDecreeForView.otpUsed}
                    </span>
                  )}
                  {selectedDecreeForView.documentHash && (
                    <span className="text-[9px] text-slate-500 font-mono block" dir="ltr">
                      Hash: {selectedDecreeForView.documentHash}
                    </span>
                  )}
                </div>
                <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-2xl font-black shadow-md">
                  ✓
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
              <button
                onClick={() => setSelectedDecreeForView(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs"
              >
                بستن
              </button>
              <button
                onClick={() => window.print()}
                className="px-6 py-2 rounded-xl bg-indigo-900 text-white font-black text-xs shadow"
              >
                🖨️ پرینت حکم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DETAILED OFFICIAL PAYSLIP PREVIEW */}
      {/* ========================================================================= */}
      {detailedPayslipRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in">
            {/* Payslip Header */}
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-700 flex items-center justify-center font-black">
                  آ
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    فیش رسمی حق‌التدریس و کارکرد آموزشی اساتید — دانشگاه آفاق
                  </h3>
                  <p className="text-[11px] text-indigo-300">
                    نیمسال اول ۱۴۰۵-۱۴۰۴ · شماره سند: AFAGH-PAY-1405-{detailedPayslipRecord.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailedPayslipRecord(null)}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Payslip Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Professor Profile Box */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 text-[11px] block">نام استاد:</span>
                  <span className="font-black text-slate-900 text-sm">{detailedPayslipRecord.name}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">کد پرسنلی / کد ملی:</span>
                  <span className="font-mono font-bold text-slate-800" dir="ltr">
                    {detailedPayslipRecord.staffCode} · {detailedPayslipRecord.nationalCode}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">مرتبه علمی و مدرک:</span>
                  <span className="font-bold text-indigo-900">
                    {detailedPayslipRecord.academicRank} ({detailedPayslipRecord.degree})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">نوع قرارداد / سقف موظفی:</span>
                  <span className="font-bold text-slate-800">
                    {detailedPayslipRecord.contractType === 'FULL_TIME_FACULTY'
                      ? `هیئت علمی (${detailedPayslipRecord.baseDutyUnits} واحد موظفی)`
                      : 'استاد مدعو (۰ واحد موظفی)'}
                  </span>
                </div>
              </div>

              {/* Course Breakdown Table */}
              <div>
                <h4 className="font-black text-slate-900 text-xs mb-2">
                  📚 ریز دروس تدریس‌شده و محاسبه واحدهای معادل (Coefficients & Equivalent Units):
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 border-b">
                        <th className="p-2">کد درس</th>
                        <th className="p-2">عنوان درس</th>
                        <th className="p-2">مقطع</th>
                        <th className="p-2">نوع درس</th>
                        <th className="p-2 text-center">واحد مصوب</th>
                        <th className="p-2 text-center">دانشجویان</th>
                        <th className="p-2 text-center">ضریب اعمالی</th>
                        <th className="p-2 text-center">سهم تدریس</th>
                        <th className="p-2 text-center">واحد معادل نهایی</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailedPayslipRecord.courses.map(crs => (
                        <tr key={crs.id} className="border-b border-slate-100">
                          <td className="p-2 font-mono" dir="ltr">{crs.courseCode}</td>
                          <td className="p-2 font-black">{crs.courseTitle}</td>
                          <td className="p-2 text-slate-600">{crs.degreeLevel}</td>
                          <td className="p-2">{crs.courseType}</td>
                          <td className="p-2 text-center font-mono">{crs.units}</td>
                          <td className="p-2 text-center font-mono">{crs.studentsCount} نفر</td>
                          <td className="p-2 text-center font-mono font-bold text-indigo-900">× {crs.multiplier.toFixed(2)}</td>
                          <td className="p-2 text-center font-mono">{crs.teachingSharePercent}٪</td>
                          <td className="p-2 text-center font-mono font-black text-emerald-800 bg-emerald-50/50">
                            {crs.equivalentUnits.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Breakdown Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Earnings */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-2">
                  <h4 className="font-black text-emerald-950 text-xs border-b border-emerald-200 pb-1.5">
                    💵 کارکرد و حق‌التدریس ناخالص:
                  </h4>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">مجموع کل واحدهای معادل تدریس:</span>
                    <span className="font-mono font-black text-slate-900">{detailedPayslipRecord.totalEquivalentUnits.toFixed(2)} واحد</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">کسر سقف موظفی آموزشی (هیئت علمی):</span>
                    <span className="font-mono font-bold text-slate-700">- {detailedPayslipRecord.baseDutyUnits.toFixed(2)} واحد</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">خالص واحدهای مازاد قابل پرداخت:</span>
                    <span className="font-mono font-black text-indigo-900">{detailedPayslipRecord.overloadUnits.toFixed(2)} واحد</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">نرخ مصوب هر واحد معادل:</span>
                    <span className="font-mono font-bold text-slate-800">{detailedPayslipRecord.baseRatePerUnit.toLocaleString('fa-IR')} ريال</span>
                  </div>
                  <div className="flex justify-between text-xs pt-2 border-t border-emerald-200">
                    <span className="font-black text-emerald-950">جمع کل حق‌التدریس ناخالص:</span>
                    <span className="font-mono font-black text-emerald-900 text-sm">
                      {detailedPayslipRecord.grossAmount.toLocaleString('fa-IR')} ريال
                    </span>
                  </div>
                </div>

                {/* Deductions */}
                <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-200 space-y-2">
                  <h4 className="font-black text-rose-950 text-xs border-b border-rose-200 pb-1.5">
                    📉 کسورات قانونی، انضباطی و مالیاتی:
                  </h4>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">مالیات تکلیفی ۱۰٪ (ماده ۸۶ ق.م.م):</span>
                    <span className="font-mono font-bold text-rose-800">{detailedPayslipRecord.taxAmount.toLocaleString('fa-IR')} ريال</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">کسر غیبت کلاسی بدون جبرانی:</span>
                    <span className="font-mono font-bold text-rose-800">
                      {detailedPayslipRecord.classAbsencePenaltyAmount > 0
                        ? `${detailedPayslipRecord.classAbsencePenaltyAmount.toLocaleString('fa-IR')} ريال`
                        : '۰ ريال'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">جریمه غیبت در جلسه امتحان پایانی:</span>
                    <span className="font-mono font-bold text-rose-800">
                      {detailedPayslipRecord.examAbsencePenaltyAmount > 0
                        ? `${detailedPayslipRecord.examAbsencePenaltyAmount.toLocaleString('fa-IR')} ريال`
                        : '۰ ريال'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">جریمه تاخیر در ثبت نمرات (خارج از SLA):</span>
                    <span className="font-mono font-bold text-rose-800">
                      {detailedPayslipRecord.lateGradePenaltyAmount > 0
                        ? `${detailedPayslipRecord.lateGradePenaltyAmount.toLocaleString('fa-IR')} ريال`
                        : '۰ ريال'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs pt-2 border-t border-rose-200">
                    <span className="font-black text-rose-950">جمع کل کسورات:</span>
                    <span className="font-mono font-black text-rose-900 text-sm">
                      {detailedPayslipRecord.totalDeductions.toLocaleString('fa-IR')} ريال
                    </span>
                  </div>
                </div>
              </div>

              {/* Net Payable Banner */}
              <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl shadow-md flex items-center justify-between">
                <div>
                  <span className="text-xs text-emerald-100 block font-bold">مبلغ خالص قابل پرداخت و واریز به حساب بانکی:</span>
                  <span className="font-mono font-black text-xl sm:text-2xl">
                    {detailedPayslipRecord.netAmount.toLocaleString('fa-IR')} <span className="text-xs font-normal">ريال</span>
                  </span>
                </div>
                <div className="text-left text-xs font-mono">
                  <span className="block text-emerald-200 text-[10px]">شماره شبا:</span>
                  <span className="font-black" dir="ltr">{detailedPayslipRecord.iban}</span>
                </div>
              </div>

              {/* Signatures and Seals */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-200 text-center text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block text-[10px]">تایید مدیر گروه آموزشی:</span>
                  <span className="font-black text-slate-800">دکتر رضا رضایی</span>
                  <span className="text-emerald-700 font-mono text-[9px] block">✓ امضای دیجیتال ثبت شد</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block text-[10px]">تایید معاونت آموزشی دانشکده:</span>
                  <span className="font-black text-slate-800">دکتر محمدرضا صادقی</span>
                  <span className="text-emerald-700 font-mono text-[9px] block">✓ امضای دیجیتال ثبت شد</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-bold block text-[10px]">مهر اداره کل امور مالی و پرداخت:</span>
                  <span className="font-black text-slate-800">دانشگاه جامع آفاق</span>
                  <span className="text-emerald-700 font-mono text-[9px] block">✓ پلمب و سند حسابداری صادر شد</span>
                </div>
              </div>
            </div>

            {/* Payslip Footer */}
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
              <button
                onClick={() => setDetailedPayslipRecord(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs"
              >
                بستن
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-6 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-black text-xs shadow flex items-center gap-1.5"
              >
                <span>🖨️ پرینت رسمی فیش حقوقی</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
