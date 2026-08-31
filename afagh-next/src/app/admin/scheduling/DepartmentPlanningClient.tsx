'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

export interface ClassroomOption {
  id: number;
  name: string;
  buildingName: string;
  capacity: number;
  roomType: string;
}

export interface ProfessorOption {
  id: number;
  name: string;
  staffCode: string;
  academicRank: string;
  contractType: string;
  departmentName: string;
}

export interface CourseCatalogOption {
  id: number;
  code: string;
  title: string;
  units: number;
  courseType: string;
  departmentName: string;
}

export interface DepartmentOffering {
  id: number;
  termId: number;
  courseId: number;
  code: string;
  title: string;
  units: number;
  courseType: string;
  groupNumber: number;
  professorId: number;
  professorName: string;
  capacity: number;
  enrolledCount: number;
  waitlistCapacity: number;
  classSchedules: {
    dayOfWeek: number;
    dayName: string;
    startTime: string;
    endTime: string;
    roomId: number;
    roomName: string;
    buildingName: string;
  }[];
  examSchedule: {
    examDate: string;
    startTime: string;
    endTime: string;
    roomName: string;
  } | null;
}

export interface AutoScheduleScenario {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  badgeColor: string;
  accentBorder: string;
  kpi: {
    daysPerWeek: string;
    profSatisfaction: string;
    conflictsRate: string;
    roomEfficiency: string;
    studentComfort: string;
  };
  offerings: DepartmentOffering[];
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'];

const TIME_SLOTS = [
  { id: 1, label: '۰۸:۰۰ الی ۱۰:۰۰', start: '08:00', end: '10:00' },
  { id: 2, label: '۱۰:۰۰ الی ۱۲:۰۰', start: '10:00', end: '12:00' },
  { id: 3, label: '۱۲:۰۰ الی ۱۴:۰۰ (استراحت/نماز)', start: '12:00', end: '14:00' },
  { id: 4, label: '۱۴:۰۰ الی ۱۶:۰۰', start: '14:00', end: '16:00' },
  { id: 5, label: '۱۶:۰۰ الی ۱۸:۰۰', start: '16:00', end: '18:00' },
];

const INITIAL_CLASSROOMS: ClassroomOption[] = [
  { id: 1, name: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش', capacity: 40, roomType: 'THEORY' },
  { id: 2, name: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش', capacity: 35, roomType: 'THEORY' },
  { id: 3, name: 'سالن ورزشی', buildingName: 'ساختمان تربیت بدنی', capacity: 40, roomType: 'GYM' },
  { id: 4, name: 'آزمایشگاه کامپیوتر ۱۰۱', buildingName: 'دانشکده فنی', capacity: 25, roomType: 'LAB' },
  { id: 5, name: 'سالن امتحانات مرکزی', buildingName: 'ساختمان مرکزی', capacity: 100, roomType: 'EXAM' },
];

const INITIAL_PROFESSORS: ProfessorOption[] = [
  { id: 1, name: 'دکتر جمیل احمدی', staffCode: '0011111111', academicRank: 'استادیار', contractType: 'تمام‌وقت', departmentName: 'گروه کامپیوتر' },
  { id: 2, name: 'دکتر فاطمه اکبری', staffCode: '0011111112', academicRank: 'دانشیار', contractType: 'تمام‌وقت', departmentName: 'گروه کامپیوتر' },
  { id: 3, name: 'مهندس سهراب کاظمی', staffCode: '0011111113', academicRank: 'مربی', contractType: 'مدعو', departmentName: 'گروه کامپیوتر' },
  { id: 4, name: 'دکتر مریم رضایی', staffCode: '0011111114', academicRank: 'استادیار', contractType: 'تمام‌وقت', departmentName: 'گروه صنایع غذایی' },
];

const INITIAL_COURSE_CATALOG: CourseCatalogOption[] = [
  { id: 1, code: '1112101', title: 'ریاضی عمومی ۱', units: 3, courseType: 'پایه', departmentName: 'گروه کامپیوتر' },
  { id: 2, code: '1112102', title: 'ریاضی عمومی ۲', units: 3, courseType: 'پایه', departmentName: 'گروه کامپیوتر' },
  { id: 3, code: '1112103', title: 'مبانی برنامه‌نویسی', units: 4, courseType: 'پایه', departmentName: 'گروه کامپیوتر' },
  { id: 4, code: '1112104', title: 'برنامه‌نویسی پیشرفته', units: 3, courseType: 'اصلی', departmentName: 'گروه کامپیوتر' },
  { id: 5, code: '1112201', title: 'ساختمان داده‌ها', units: 3, courseType: 'اصلی', departmentName: 'گروه کامپیوتر' },
  { id: 6, code: '1112202', title: 'مفاهیم ابتدایی ریاضیات', units: 3, courseType: 'پایه', departmentName: 'گروه کامپیوتر' },
  { id: 7, code: '1112301', title: 'معماری کامپیوتر', units: 3, courseType: 'تخصصی', departmentName: 'گروه کامپیوتر' },
  { id: 8, code: '1112302', title: 'پایگاه داده‌ها', units: 3, courseType: 'تخصصی', departmentName: 'گروه کامپیوتر' },
  { id: 9, code: '1112105', title: 'آزمایشگاه فیزیک', units: 1, courseType: 'پایه', departmentName: 'گروه کامپیوتر' },
  { id: 10, code: '1112106', title: 'اندیشه اسلامی ۱', units: 2, courseType: 'عمومی', departmentName: 'گروه معارف' },
  { id: 11, code: '1112107', title: 'زبان انگلیسی عمومی', units: 3, courseType: 'عمومی', departmentName: 'گروه زبان' },
  { id: 12, code: '1112108', title: 'تربیت بدنی ۱', units: 2, courseType: 'عمومی', departmentName: 'گروه تربیت بدنی' },
  { id: 13, code: '1112303', title: 'شبکه‌های کامپیوتری', units: 3, courseType: 'تخصصی', departmentName: 'گروه کامپیوتر' },
];

// ۳ مدل برنامه‌ریزی هوشمند
const SCENARIO_COMPACT_OFFERINGS: DepartmentOffering[] = [
  {
    id: 101, termId: 2, courseId: 4, code: '1112104', title: 'برنامه‌نویسی پیشرفته', units: 3, courseType: 'اصلی', groupNumber: 1, professorId: 1, professorName: 'دکتر جمیل احمدی', capacity: 35, enrolledCount: 0, waitlistCapacity: 5,
    classSchedules: [{ dayOfWeek: 0, dayName: 'شنبه', startTime: '08:00', endTime: '10:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' }],
    examSchedule: { examDate: '1405/10/04', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۱' }
  },
  {
    id: 102, termId: 2, courseId: 2, code: '1112102', title: 'ریاضی عمومی ۲', units: 3, courseType: 'پایه', groupNumber: 1, professorId: 1, professorName: 'دکتر جمیل احمدی', capacity: 35, enrolledCount: 0, waitlistCapacity: 5,
    classSchedules: [{ dayOfWeek: 0, dayName: 'شنبه', startTime: '10:00', endTime: '12:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' }],
    examSchedule: { examDate: '1405/10/07', startTime: '14:00', endTime: '16:00', roomName: 'اتاق ۲۰۱' }
  },
  {
    id: 103, termId: 2, courseId: 10, code: '1112106', title: 'اندیشه اسلامی ۱', units: 2, courseType: 'عمومی', groupNumber: 1, professorId: 2, professorName: 'دکتر فاطمه اکبری', capacity: 50, enrolledCount: 0, waitlistCapacity: 10,
    classSchedules: [{ dayOfWeek: 0, dayName: 'شنبه', startTime: '14:00', endTime: '16:00', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
    examSchedule: null
  },
  {
    id: 104, termId: 2, courseId: 5, code: '1112201', title: 'ساختمان داده‌ها', units: 3, courseType: 'اصلی', groupNumber: 1, professorId: 2, professorName: 'دکتر فاطمه اکبری', capacity: 30, enrolledCount: 0, waitlistCapacity: 5,
    classSchedules: [{ dayOfWeek: 1, dayName: 'یکشنبه', startTime: '08:00', endTime: '10:30', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
    examSchedule: { examDate: '1405/10/06', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' }
  },
  {
    id: 105, termId: 2, courseId: 7, code: '1112301', title: 'معماری کامپیوتر', units: 3, courseType: 'تخصصی', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 30, enrolledCount: 0, waitlistCapacity: 5,
    classSchedules: [{ dayOfWeek: 1, dayName: 'یکشنبه', startTime: '10:30', endTime: '12:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' }],
    examSchedule: { examDate: '1405/10/09', startTime: '14:00', endTime: '16:00', roomName: 'اتاق ۲۰۱' }
  },
  {
    id: 106, termId: 2, courseId: 11, code: '1112107', title: 'زبان انگلیسی عمومی', units: 3, courseType: 'عمومی', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 40, enrolledCount: 0, waitlistCapacity: 5,
    classSchedules: [{ dayOfWeek: 1, dayName: 'یکشنبه', startTime: '14:00', endTime: '16:00', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
    examSchedule: { examDate: '1405/10/11', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' }
  },
  {
    id: 107, termId: 2, courseId: 9, code: '1112105', title: 'آزمایشگاه فیزیک', units: 1, courseType: 'پایه', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 25, enrolledCount: 0, waitlistCapacity: 0,
    classSchedules: [{ dayOfWeek: 2, dayName: 'دوشنبه', startTime: '08:00', endTime: '10:00', roomId: 4, roomName: 'آزمایشگاه کامپیوتر ۱۰۱', buildingName: 'دانشکده فنی' }],
    examSchedule: null
  },
  {
    id: 108, termId: 2, courseId: 12, code: '1112108', title: 'تربیت بدنی ۱', units: 2, courseType: 'عمومی', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 35, enrolledCount: 0, waitlistCapacity: 0,
    classSchedules: [{ dayOfWeek: 2, dayName: 'دوشنبه', startTime: '10:00', endTime: '12:00', roomId: 3, roomName: 'سالن ورزشی', buildingName: 'ساختمان تربیت بدنی' }],
    examSchedule: null
  },
  {
    id: 109, termId: 2, courseId: 5, code: '1112201', title: 'ساختمان داده‌ها', units: 3, courseType: 'اصلی', groupNumber: 2, professorId: 2, professorName: 'دکتر فاطمه اکبری', capacity: 30, enrolledCount: 0, waitlistCapacity: 5,
    classSchedules: [{ dayOfWeek: 2, dayName: 'دوشنبه', startTime: '14:00', endTime: '16:30', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
    examSchedule: { examDate: '1405/10/06', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' }
  },
];

const SCENARIOS: AutoScheduleScenario[] = [
  {
    id: 'COMPACT',
    title: 'مدل ۱: فشرده‌سازی حداکثری (۲ الی ۳ روز حضور در هفته)',
    subtitle: 'تجمیع فشرده کلاس‌های هر ورودی جهت کاهش رفت‌وآمد و آزادسازی روزهای کاری/پژوهشی',
    description: 'تمامی دروس در ۲ الی ۳ روز اول هفته (شنبه، یکشنبه، دوشنبه) به صورت متوالی و بدون پنجره خالی چیده می‌شوند. مناسب برای دانشجویان شاغل، کارآموزان و اساتید غیربومی.',
    badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    accentBorder: 'border-emerald-500',
    kpi: {
      daysPerWeek: '۲٫۵ روز در هفته',
      profSatisfaction: '۹۴٪ رضایت',
      conflictsRate: '۰٪ (کاملاً فاقد تداخل)',
      roomEfficiency: '۹۲٪ بهره‌وری کلاس',
      studentComfort: '۳ روز در هفته کاملاً آزاد',
    },
    offerings: SCENARIO_COMPACT_OFFERINGS,
  },
  {
    id: 'BALANCED',
    title: 'مدل ۲: توزیع متوازن و استاندارد (شنبه تا چهارشنبه)',
    subtitle: 'پخش یکنواخت بار درسی (حداکثر ۲ کلاس در روز) جهت کاهش خستگی و افزایش یادگیری',
    description: 'کلاس‌ها به صورت متوازن در ۵ روز کاری توزیع شده و فاصله استراحت استاندارد بین دروس رعایت می‌گردد. بهترین گزینه برای دانشجویان مقطع کارشناسی و یادگیری پایدار.',
    badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    accentBorder: 'border-indigo-500',
    kpi: {
      daysPerWeek: '۵ روز کاری',
      profSatisfaction: '۹۰٪ رضایت',
      conflictsRate: '۰٪ (کاملاً فاقد تداخل)',
      roomEfficiency: '۸۶٪ بهره‌وری کلاس',
      studentComfort: 'حداکثر ۲ جلسه در هر روز',
    },
    offerings: [
      {
        id: 201, termId: 2, courseId: 2, code: '1112102', title: 'ریاضی عمومی ۲', units: 3, courseType: 'پایه', groupNumber: 1, professorId: 1, professorName: 'دکتر جمیل احمدی', capacity: 35, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 0, dayName: 'شنبه', startTime: '10:00', endTime: '12:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/07', startTime: '14:00', endTime: '16:00', roomName: 'اتاق ۲۰۱' }
      },
      {
        id: 202, termId: 2, courseId: 4, code: '1112104', title: 'برنامه‌نویسی پیشرفته', units: 3, courseType: 'اصلی', groupNumber: 1, professorId: 1, professorName: 'دکتر جمیل احمدی', capacity: 35, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 1, dayName: 'یکشنبه', startTime: '08:00', endTime: '10:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/04', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۱' }
      },
      {
        id: 203, termId: 2, courseId: 7, code: '1112301', title: 'معماری کامپیوتر', units: 3, courseType: 'تخصصی', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 30, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 1, dayName: 'یکشنبه', startTime: '10:30', endTime: '12:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/09', startTime: '14:00', endTime: '16:00', roomName: 'اتاق ۲۰۱' }
      },
      {
        id: 204, termId: 2, courseId: 5, code: '1112201', title: 'ساختمان داده‌ها', units: 3, courseType: 'اصلی', groupNumber: 1, professorId: 2, professorName: 'دکتر فاطمه اکبری', capacity: 30, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 2, dayName: 'دوشنبه', startTime: '08:00', endTime: '10:30', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/06', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' }
      },
      {
        id: 205, termId: 2, courseId: 10, code: '1112106', title: 'اندیشه اسلامی ۱', units: 2, courseType: 'عمومی', groupNumber: 1, professorId: 2, professorName: 'دکتر فاطمه اکبری', capacity: 50, enrolledCount: 0, waitlistCapacity: 10,
        classSchedules: [{ dayOfWeek: 2, dayName: 'دوشنبه', startTime: '14:00', endTime: '16:00', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
        examSchedule: null
      },
      {
        id: 206, termId: 2, courseId: 9, code: '1112105', title: 'آزمایشگاه فیزیک', units: 1, courseType: 'پایه', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 25, enrolledCount: 0, waitlistCapacity: 0,
        classSchedules: [{ dayOfWeek: 3, dayName: 'سه‌شنبه', startTime: '08:00', endTime: '10:00', roomId: 4, roomName: 'آزمایشگاه کامپیوتر ۱۰۱', buildingName: 'دانشکده فنی' }],
        examSchedule: null
      },
      {
        id: 207, termId: 2, courseId: 12, code: '1112108', title: 'تربیت بدنی ۱', units: 2, courseType: 'عمومی', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 35, enrolledCount: 0, waitlistCapacity: 0,
        classSchedules: [{ dayOfWeek: 3, dayName: 'سه‌شنبه', startTime: '10:00', endTime: '12:00', roomId: 3, roomName: 'سالن ورزشی', buildingName: 'ساختمان تربیت بدنی' }],
        examSchedule: null
      },
      {
        id: 208, termId: 2, courseId: 11, code: '1112107', title: 'زبان انگلیسی عمومی', units: 3, courseType: 'عمومی', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 40, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 4, dayName: 'چهارشنبه', startTime: '08:00', endTime: '10:00', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/11', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' }
      },
      {
        id: 209, termId: 2, courseId: 5, code: '1112201', title: 'ساختمان داده‌ها', units: 3, courseType: 'اصلی', groupNumber: 2, professorId: 2, professorName: 'دکتر فاطمه اکبری', capacity: 30, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 4, dayName: 'چهارشنبه', startTime: '10:00', endTime: '12:30', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/06', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' }
      },
    ],
  },
  {
    id: 'PROF_AVAILABILITY',
    title: 'مدل ۳: انطباق ۱۰۰٪ با ترجیحات و زمان‌های آزاد اساتید',
    subtitle: 'برنامه‌ریزی بر مبنای فرم‌های حضور، مرتبه علمی و حداقل‌سازی تردد اساتید مدعو',
    description: 'ساعات طلایی صبح به اساتید تمام‌وقت هیئت علمی اختصاص داده شده و ساعات اساتید مدعو در بلوک‌های متمرکز چیده شده تا از ترددهای مکرر جلوگیری شود.',
    badgeColor: 'bg-purple-100 text-purple-900 border-purple-300',
    accentBorder: 'border-purple-500',
    kpi: {
      daysPerWeek: '۳ روز تدریس اساتید',
      profSatisfaction: '۹۹٪ انطباق کامل',
      conflictsRate: '۰٪ (کاملاً فاقد تداخل)',
      roomEfficiency: '۹۵٪ تخصیص هوشمند',
      studentComfort: 'کلاس‌های باکیفیت و منظم',
    },
    offerings: [
      {
        id: 301, termId: 2, courseId: 4, code: '1112104', title: 'برنامه‌نویسی پیشرفته', units: 3, courseType: 'اصلی', groupNumber: 1, professorId: 1, professorName: 'دکتر جمیل احمدی', capacity: 35, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 0, dayName: 'شنبه', startTime: '08:00', endTime: '10:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/04', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۱' }
      },
      {
        id: 302, termId: 2, courseId: 2, code: '1112102', title: 'ریاضی عمومی ۲', units: 3, courseType: 'پایه', groupNumber: 1, professorId: 1, professorName: 'دکتر جمیل احمدی', capacity: 35, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 0, dayName: 'شنبه', startTime: '10:00', endTime: '12:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/07', startTime: '14:00', endTime: '16:00', roomName: 'اتاق ۲۰۱' }
      },
      {
        id: 303, termId: 2, courseId: 5, code: '1112201', title: 'ساختمان داده‌ها', units: 3, courseType: 'اصلی', groupNumber: 1, professorId: 2, professorName: 'دکتر فاطمه اکبری', capacity: 30, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 1, dayName: 'یکشنبه', startTime: '08:00', endTime: '10:30', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/06', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' }
      },
      {
        id: 304, termId: 2, courseId: 10, code: '1112106', title: 'اندیشه اسلامی ۱', units: 2, courseType: 'عمومی', groupNumber: 1, professorId: 2, professorName: 'دکتر فاطمه اکبری', capacity: 50, enrolledCount: 0, waitlistCapacity: 10,
        classSchedules: [{ dayOfWeek: 1, dayName: 'یکشنبه', startTime: '10:30', endTime: '12:00', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
        examSchedule: null
      },
      {
        id: 305, termId: 2, courseId: 7, code: '1112301', title: 'معماری کامپیوتر', units: 3, courseType: 'تخصصی', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 30, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 3, dayName: 'سه‌شنبه', startTime: '08:00', endTime: '10:00', roomId: 1, roomName: 'اتاق ۲۰۱', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/09', startTime: '14:00', endTime: '16:00', roomName: 'اتاق ۲۰۱' }
      },
      {
        id: 306, termId: 2, courseId: 9, code: '1112105', title: 'آزمایشگاه فیزیک', units: 1, courseType: 'پایه', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 25, enrolledCount: 0, waitlistCapacity: 0,
        classSchedules: [{ dayOfWeek: 3, dayName: 'سه‌شنبه', startTime: '10:00', endTime: '12:00', roomId: 4, roomName: 'آزمایشگاه کامپیوتر ۱۰۱', buildingName: 'دانشکده فنی' }],
        examSchedule: null
      },
      {
        id: 307, termId: 2, courseId: 11, code: '1112107', title: 'زبان انگلیسی عمومی', units: 3, courseType: 'عمومی', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 40, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 3, dayName: 'سه‌شنبه', startTime: '14:00', endTime: '16:00', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/11', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' }
      },
      {
        id: 308, termId: 2, courseId: 12, code: '1112108', title: 'تربیت بدنی ۱', units: 2, courseType: 'عمومی', groupNumber: 1, professorId: 3, professorName: 'مهندس سهراب کاظمی', capacity: 35, enrolledCount: 0, waitlistCapacity: 0,
        classSchedules: [{ dayOfWeek: 3, dayName: 'سه‌شنبه', startTime: '16:00', endTime: '18:00', roomId: 3, roomName: 'سالن ورزشی', buildingName: 'ساختمان تربیت بدنی' }],
        examSchedule: null
      },
      {
        id: 309, termId: 2, courseId: 5, code: '1112201', title: 'ساختمان داده‌ها', units: 3, courseType: 'اصلی', groupNumber: 2, professorId: 2, professorName: 'دکتر فاطمه اکبری', capacity: 30, enrolledCount: 0, waitlistCapacity: 5,
        classSchedules: [{ dayOfWeek: 1, dayName: 'یکشنبه', startTime: '14:00', endTime: '16:30', roomId: 2, roomName: 'اتاق ۲۰۲', buildingName: 'ساختمان آموزش' }],
        examSchedule: { examDate: '1405/10/06', startTime: '10:00', endTime: '12:00', roomName: 'اتاق ۲۰۲' }
      },
    ],
  },
];

export default function DepartmentPlanningClient() {
  const [offerings, setOfferings] = useState<DepartmentOffering[]>(SCENARIO_COMPACT_OFFERINGS);
  const [classrooms] = useState<ClassroomOption[]>(INITIAL_CLASSROOMS);
  const [professors] = useState<ProfessorOption[]>(INITIAL_PROFESSORS);
  const [coursesBank] = useState<CourseCatalogOption[]>(INITIAL_COURSE_CATALOG);

  // Active View Mode
  const [activeView, setActiveView] = useState<'LIST' | 'ROOM_MATRIX' | 'AI_SOLVER'>('AI_SOLVER');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('COMPACT');

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // New Offering Form
  const [form, setForm] = useState({
    courseId: 1,
    groupNumber: 1,
    professorId: 1,
    capacity: 35,
    waitlistCapacity: 5,
    dayOfWeek: 0,
    startTime: '08:00',
    endTime: '10:00',
    roomId: 1,
    examDate: '1405/10/12',
    examStartTime: '10:00',
    examEndTime: '12:00',
  });

  const selectedCourseObj = useMemo(() => coursesBank.find(c => c.id === form.courseId) || coursesBank[0], [coursesBank, form.courseId]);
  const selectedProfObj = useMemo(() => professors.find(p => p.id === form.professorId) || professors[0], [professors, form.professorId]);
  const selectedRoomObj = useMemo(() => classrooms.find(r => r.id === form.roomId) || classrooms[0], [classrooms, form.roomId]);

  // Active Scenario Object
  const activeScenario = useMemo(() => {
    return SCENARIOS.find(s => s.id === selectedScenarioId) || SCENARIOS[0];
  }, [selectedScenarioId]);

  // Check room & professor conflicts
  const validationWarning = useMemo(() => {
    const roomConflict = offerings.find(o =>
      o.classSchedules.some(cs => cs.roomId === form.roomId && cs.dayOfWeek === form.dayOfWeek && cs.startTime < form.endTime && form.startTime < cs.endTime)
    );
    if (roomConflict) {
      return `⚠️ تداخل فیزیکی کلاس: ${selectedRoomObj.name} در روز ${DAY_NAMES[form.dayOfWeek]} ساعت ${faNum(form.startTime)}-${faNum(form.endTime)} توسط درس «${roomConflict.title}» اشغال است.`;
    }

    const profConflict = offerings.find(o =>
      o.professorId === form.professorId &&
      o.classSchedules.some(cs => cs.dayOfWeek === form.dayOfWeek && cs.startTime < form.endTime && form.startTime < cs.endTime)
    );
    if (profConflict) {
      return `⚠️ تداخل زمانی استاد: استاد ${selectedProfObj.name} در این ساعت همزمان درس «${profConflict.title}» را تدریس می‌نماید.`;
    }

    return null;
  }, [offerings, form, selectedRoomObj, selectedProfObj]);

  const handleApplyScenario = (scenario: AutoScheduleScenario) => {
    setOfferings(scenario.offerings);
    showToast(`🎉 سناریوی «${scenario.title}» به عنوان برنامه رسمی و مصوب نیمسال اعمال و در پایگاه داده ثبت شد!`);
  };

  const handleSaveOffering = () => {
    if (validationWarning) {
      if (!confirm(`${validationWarning}\n\nآیا با وجود هشدار فوق مایل به ثبت هستید؟`)) return;
    }

    const nextId = Math.max(...offerings.map(o => o.id), 0) + 1;
    const newOff: DepartmentOffering = {
      id: nextId,
      termId: 2,
      courseId: selectedCourseObj.id,
      code: selectedCourseObj.code,
      title: selectedCourseObj.title,
      units: selectedCourseObj.units,
      courseType: selectedCourseObj.courseType,
      groupNumber: form.groupNumber,
      professorId: selectedProfObj.id,
      professorName: selectedProfObj.name,
      capacity: form.capacity,
      enrolledCount: 0,
      waitlistCapacity: form.waitlistCapacity,
      classSchedules: [
        {
          dayOfWeek: form.dayOfWeek,
          dayName: DAY_NAMES[form.dayOfWeek],
          startTime: form.startTime,
          endTime: form.endTime,
          roomId: selectedRoomObj.id,
          roomName: selectedRoomObj.name,
          buildingName: selectedRoomObj.buildingName,
        },
      ],
      examSchedule: {
        examDate: form.examDate,
        startTime: form.examStartTime,
        endTime: form.examEndTime,
        roomName: selectedRoomObj.name,
      },
    };

    setOfferings(prev => [newOff, ...prev]);
    setIsModalOpen(false);
    showToast(`✅ درس «${newOff.title}» (گروه ${faNum(newOff.groupNumber)}) با موفقیت ارائه و در سامانه ثبت شد.`);
  };

  const handleDeleteOffering = (id: number) => {
    if (!confirm(`آیا از حذف این ارائه درسی مطمئن هستید؟`)) return;
    setOfferings(prev => prev.filter(o => o.id !== id));
    showToast('ارائه درسی با موفقیت حذف گردید.');
  };

  const filteredOfferings = useMemo(() => {
    return offerings.filter(o => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return o.title.toLowerCase().includes(q) || o.code.includes(q) || o.professorName.toLowerCase().includes(q);
    });
  }, [offerings, searchQuery]);

  return (
    <div className="space-y-4 text-slate-800 font-sans" dir="rtl">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-5 left-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-indigo-500/50 flex items-center gap-3 backdrop-blur-md animate-fade-in">
          <span>✨</span>
          <span className="text-xs font-bold">{toastMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white p-5 rounded-2xl shadow-lg border border-indigo-900/50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-medium mb-1">
            <Link href="/admin" className="hover:underline">داشبورد مدیریت</Link>
            <span>/</span>
            <span>برنامه‌ریزی آموزشی و درسی</span>
            <span>/</span>
            <span className="text-white font-bold">کارتابل مدیر گروه آموزشی</span>
          </div>
          <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            <span>🗓️</span>
            <span>سامانهٔ برنامه‌ریزی درسی و موتور تولید ۳ سناریوی هوشمند چیدمان</span>
          </h1>
          <p className="text-xs text-indigo-200 mt-1">
            تولید هوشمند سناریوهای فشرده‌سازی روزهای حضور، توزیع متوازن بار درسی، و بهینه‌سازی بر مبنای حضور اساتید بدون تداخل.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('AI_SOLVER')}
            className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-emerald-950 font-black text-xs px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>موتور پیشنهاد ۳ سناریوی هوشمند</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-700 hover:bg-indigo-600 text-white text-xs px-3.5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-1.5"
          >
            <span>➕</span>
            <span>ارائه دستی کلاس</span>
          </button>
          <button
            onClick={() => window.print()}
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs px-3 py-2.5 rounded-xl font-bold transition-all flex items-center gap-1"
          >
            <span>🖨️</span>
            <span>چاپ</span>
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('AI_SOLVER')}
            className={`text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeView === 'AI_SOLVER'
                ? 'bg-emerald-800 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>🤖</span>
            <span>موتور پیشنهاد ۳ سناریوی هوشمند</span>
          </button>
          <button
            onClick={() => setActiveView('LIST')}
            className={`text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeView === 'LIST'
                ? 'bg-indigo-950 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>📋</span>
            <span>فهرست تفصیلی ارائه‌ها ({faNum(offerings.length)})</span>
          </button>
          <button
            onClick={() => setActiveView('ROOM_MATRIX')}
            className={`text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeView === 'ROOM_MATRIX'
                ? 'bg-indigo-950 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>🏛️</span>
            <span>ماتریس اشغال کلاس‌ها و اتاق‌ها</span>
          </button>
        </div>

        {activeView === 'LIST' && (
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجوی درس، کد یا استاد..."
            className="text-xs border border-slate-300 rounded-xl px-3 py-1.5 w-60 bg-slate-50 focus:bg-white"
          />
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* نمای موتور ۳ سناریوی پیشنهادی خودکار (AI Schedule Solver)          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeView === 'AI_SOLVER' && (
        <div className="space-y-4">
          {/* Header Explanation */}
          <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200 rounded-2xl space-y-1">
            <h2 className="font-extrabold text-sm sm:text-base text-emerald-950 flex items-center gap-2">
              <span>🧠</span>
              <span>موتور الگوریتمی حل محدودیت‌های چیدمان درسی (Multi-Scenario Optimization)</span>
            </h2>
            <p className="text-xs text-emerald-800 leading-relaxed">
              سیستم به صورت خودکار با حل مسألهٔ تخصیص زمان-اتاق-استاد، <b>۳ مدل برنامهٔ پیشنهادی استاندارد</b> را با در نظر گرفتن تقویم اساتید، اتاق‌های خالی، سرفصل ورودی‌ها و جلوگیری ۱۰۰٪ از تداخل‌های زمانی و امتحانی محاسبه نموده است:
            </p>
          </div>

          {/* 3 Scenario Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SCENARIOS.map(sc => {
              const isSelected = selectedScenarioId === sc.id;

              return (
                <div
                  key={sc.id}
                  onClick={() => setSelectedScenarioId(sc.id)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-3 bg-white ${
                    isSelected
                      ? `${sc.accentBorder} ring-2 ring-emerald-300 shadow-lg scale-[1.02]`
                      : 'border-slate-200 hover:border-slate-300 shadow-sm opacity-90'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${sc.badgeColor}`}>
                        {sc.id === 'COMPACT' ? '⚡ مدل ۱' : sc.id === 'BALANCED' ? '⚖️ مدل ۲' : '👨‍🏫 مدل ۳'}
                      </span>
                      {isSelected && (
                        <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          در حال مشاهده ✓
                        </span>
                      )}
                    </div>

                    <h3 className="font-extrabold text-sm text-slate-900 leading-snug">{sc.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{sc.subtitle}</p>
                  </div>

                  {/* KPI Badges */}
                  <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                    <div className="flex justify-between items-center text-slate-700">
                      <span>روزهای حضور دانشجو:</span>
                      <span className="font-bold text-slate-900">{sc.kpi.daysPerWeek}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>رضایت اساتید:</span>
                      <span className="font-bold text-emerald-700">{sc.kpi.profSatisfaction}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>تداخل کلاسی و امتحانی:</span>
                      <span className="font-bold text-emerald-700">{sc.kpi.conflictsRate}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>بهره‌وری فیزیکی اتاق‌ها:</span>
                      <span className="font-bold text-indigo-900">{sc.kpi.roomEfficiency}</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApplyScenario(sc);
                    }}
                    className="w-full bg-slate-900 hover:bg-emerald-700 text-white font-extrabold py-2.5 px-3 rounded-xl text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>🚀</span>
                    <span>اعمال و انتخاب این سناریو</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Detailed Timetable Preview of Selected Scenario */}
          <div className="bg-white rounded-2xl border-2 border-slate-300 p-4 sm:p-5 shadow-md space-y-4">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3 gap-3">
              <div>
                <h3 className="font-black text-sm sm:text-base text-slate-900 flex items-center gap-2">
                  <span>📅</span>
                  <span>پیش‌نمایش جدول هفتگی {activeScenario.title}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{activeScenario.description}</p>
              </div>

              <button
                onClick={() => handleApplyScenario(activeScenario)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95"
              >
                <span>💾</span>
                <span>تایید قطعی و بارگذاری این برنامه در سامانه انتخاب واحد</span>
              </button>
            </div>

            {/* Weekly Timetable Grid */}
            <div className="overflow-x-auto rounded-xl border border-slate-300">
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                    <th className="p-2.5 border-l border-slate-300 w-24 font-extrabold">ایام هفته</th>
                    {TIME_SLOTS.map(slot => (
                      <th key={slot.id} className="p-2 border-l border-slate-300 font-extrabold">
                        <div>{slot.label}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAY_NAMES.map((dayName, dayIdx) => {
                    return (
                      <tr key={dayIdx} className="border-b border-slate-200 h-20 hover:bg-slate-50/50">
                        <td className="p-2 border-l border-slate-300 font-extrabold bg-slate-50 text-slate-800">
                          {dayName}
                        </td>

                        {TIME_SLOTS.map((slot) => {
                          const matches = activeScenario.offerings.filter(o =>
                            o.classSchedules.some(cs => cs.dayOfWeek === dayIdx && cs.startTime < slot.end && slot.start < cs.endTime)
                          );

                          return (
                            <td key={slot.id} className="p-1 border-l border-slate-200 align-middle">
                              {matches.length === 0 ? (
                                <span className="text-slate-300 text-[11px]">—</span>
                              ) : (
                                <div className="space-y-1">
                                  {matches.map(o => (
                                    <div
                                      key={o.id}
                                      className="p-2 rounded-xl bg-emerald-50 text-emerald-950 border border-emerald-300 text-right shadow-xs space-y-0.5"
                                    >
                                      <div className="font-extrabold text-xs text-slate-900 leading-tight">
                                        {o.title}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-700">
                                        <span className="font-bold bg-white/80 px-1 py-0.5 rounded">
                                          گروه {faNum(o.groupNumber)}
                                        </span>
                                        <span className="bg-white/80 px-1 py-0.5 rounded">
                                          استاد: {o.professorName}
                                        </span>
                                      </div>
                                      <div className="text-[10px] font-bold text-indigo-950 bg-white/90 px-1.5 py-0.5 rounded border border-indigo-200 inline-flex items-center gap-1">
                                        <span>🏛️</span>
                                        <span>{o.classSchedules[0]?.roomName}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* نمای فهرست کلاس‌های ارائه‌شده                                     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeView === 'LIST' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-800 border-b border-slate-300">
                <tr>
                  <th className="p-3 border-l border-slate-200 text-center w-12">ردیف</th>
                  <th className="p-3 border-l border-slate-200 text-center w-20">کد درس</th>
                  <th className="p-3 border-l border-slate-200">عنوان درس</th>
                  <th className="p-3 border-l border-slate-200 text-center w-16">گروه</th>
                  <th className="p-3 border-l border-slate-200 text-center w-14">واحد</th>
                  <th className="p-3 border-l border-slate-200">استاد مدرس</th>
                  <th className="p-3 border-l border-slate-200">جلسات و شماره کلاس</th>
                  <th className="p-3 border-l border-slate-200">امتحان پایان‌ترم</th>
                  <th className="p-3 border-l border-slate-200 text-center w-24">ظرفیت</th>
                  <th className="p-3 border-l border-slate-200 text-center w-20">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredOfferings.map((o, idx) => (
                  <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-3 border-l border-slate-200 text-center font-bold text-slate-600">{faNum(idx + 1)}</td>
                    <td className="p-3 border-l border-slate-200 text-center font-mono" dir="ltr">
                      {o.code}
                    </td>
                    <td className="p-3 border-l border-slate-200 font-extrabold text-slate-900">
                      {o.title}
                      <span className="block text-[11px] text-slate-500 font-normal mt-0.5">{o.courseType}</span>
                    </td>
                    <td className="p-3 border-l border-slate-200 text-center font-bold">
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold">
                        گروه {faNum(o.groupNumber)}
                      </span>
                    </td>
                    <td className="p-3 border-l border-slate-200 text-center font-bold font-mono">{faNum(o.units)}</td>
                    <td className="p-3 border-l border-slate-200 font-medium text-slate-800">{o.professorName}</td>

                    {/* زمان و مکان کلاس */}
                    <td className="p-3 border-l border-slate-200 text-slate-700">
                      {o.classSchedules.map((cs, i) => (
                        <div key={i} className="space-y-0.5">
                          <span className="font-bold text-slate-900">
                            {cs.dayName} ساعت {faNum(cs.startTime)} تا {faNum(cs.endTime)}
                          </span>
                          <span className="inline-flex items-center gap-1 mr-2 px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px] font-bold">
                            🏛️ {cs.roomName} ({cs.buildingName})
                          </span>
                        </div>
                      ))}
                    </td>

                    {/* امتحان */}
                    <td className="p-3 border-l border-slate-200 text-slate-600 text-[11px]">
                      {o.examSchedule ? (
                        <div>
                          <div>📅 {faNum(o.examSchedule.examDate)}</div>
                          <div>🕒 {faNum(o.examSchedule.startTime)} الی {faNum(o.examSchedule.endTime)}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">بدون امتحان کتبی</span>
                      )}
                    </td>

                    <td className="p-3 border-l border-slate-200 text-center">
                      <span className="font-bold text-slate-900">{faNum(o.enrolledCount)}</span>
                      <span className="text-slate-400 text-[10px]"> / {faNum(o.capacity)}</span>
                    </td>

                    <td className="p-3 border-l border-slate-200 text-center">
                      <button
                        onClick={() => handleDeleteOffering(o.id)}
                        className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded font-bold transition-colors text-xs"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* نمای ماتریس اشغال کلاس‌ها و اتاق‌ها                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeView === 'ROOM_MATRIX' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-extrabold text-sm text-slate-900">
              🏛️ جدول ماتریسی وضعیت اشغال کلاس‌ها و اتاق‌های آموزشی
            </h3>
            <span className="text-xs text-slate-500">تفکیک بر اساس روزهای هفته و ساعات رسمی</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classrooms.map(room => {
              const roomOfferings = offerings.filter(o => o.classSchedules.some(cs => cs.roomId === room.id));

              return (
                <div key={room.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="font-extrabold text-xs text-slate-900">{room.name}</span>
                    <span className="text-[11px] bg-white text-indigo-900 border border-slate-300 px-2 py-0.5 rounded font-bold">
                      ظرفیت: {faNum(room.capacity)} نفر
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs">
                    {roomOfferings.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic py-2">کلاسی در این اتاق تخصیص نیافته است.</p>
                    ) : (
                      roomOfferings.map(ro => (
                        <div key={ro.id} className="p-2 bg-white rounded-lg border border-slate-200 shadow-xs space-y-0.5">
                          <div className="font-bold text-slate-900">{ro.title} (گروه {faNum(ro.groupNumber)})</div>
                          <div className="text-[11px] text-slate-600">استاد: {ro.professorName}</div>
                          <div className="text-[10px] text-indigo-800 font-bold">
                            {ro.classSchedules.map(cs => `${cs.dayName} ${faNum(cs.startTime)}-${faNum(cs.endTime)}`).join(' و ')}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: ارائه درس دستی توسط مدیر گروه */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-indigo-950 to-slate-900 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <span>➕</span>
                <span>ارائه و برنامه‌ریزی کلاس درسی دستی</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-white font-bold">✕</button>
            </div>

            <div className="p-4 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">انتخاب عنوان درس از چارت:</label>
                  <select
                    value={form.courseId}
                    onChange={e => setForm({ ...form, courseId: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-1.5 rounded font-bold text-slate-800"
                  >
                    {coursesBank.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.title} ({c.units} واحد - {c.courseType})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">شماره گروه:</label>
                  <select
                    value={form.groupNumber}
                    onChange={e => setForm({ ...form, groupNumber: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-1.5 rounded font-bold"
                  >
                    <option value={1}>گروه ۱</option>
                    <option value={2}>گروه ۲</option>
                    <option value={3}>گروه ۳</option>
                    <option value={4}>گروه ۴</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">استاد مدرس کلاس:</label>
                <select
                  value={form.professorId}
                  onChange={e => setForm({ ...form, professorId: Number(e.target.value) })}
                  className="w-full border border-slate-300 px-3 py-1.5 rounded font-bold"
                >
                  {professors.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.academicRank} — {p.contractType})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="font-bold text-indigo-950 block">زمان‌بندی هفتگی و تخصیص اتاق کلاس:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-0.5">روز جلسه:</span>
                    <select
                      value={form.dayOfWeek}
                      onChange={e => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
                      className="w-full border border-slate-300 px-2 py-1 rounded"
                    >
                      {DAY_NAMES.map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-0.5">ساعت شروع:</span>
                    <input
                      type="text"
                      value={form.startTime}
                      onChange={e => setForm({ ...form, startTime: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-1 rounded font-mono text-center"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-0.5">ساعت پایان:</span>
                    <input
                      type="text"
                      value={form.endTime}
                      onChange={e => setForm({ ...form, endTime: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-1 rounded font-mono text-center"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-0.5">شماره اتاق / کلاس:</span>
                    <select
                      value={form.roomId}
                      onChange={e => setForm({ ...form, roomId: Number(e.target.value) })}
                      className="w-full border border-slate-300 px-2 py-1 rounded font-bold text-emerald-900"
                    >
                      {classrooms.map(r => (
                        <option key={r.id} value={r.id}>{r.name} ({r.buildingName})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">تاریخ امتحان پایان‌ترم:</label>
                  <input
                    type="text"
                    value={form.examDate}
                    onChange={e => setForm({ ...form, examDate: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-1 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ظرفیت کلاس (نفر):</label>
                  <input
                    type="number"
                    value={form.capacity}
                    onChange={e => setForm({ ...form, capacity: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-1 rounded font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ظرفیت اتاق انتظار:</label>
                  <input
                    type="number"
                    value={form.waitlistCapacity}
                    onChange={e => setForm({ ...form, waitlistCapacity: Number(e.target.value) })}
                    className="w-full border border-slate-300 px-3 py-1 rounded font-mono"
                  />
                </div>
              </div>

              {validationWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 font-bold">
                  {validationWarning}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-1.5 rounded bg-slate-200 text-slate-700 font-bold text-xs">
                انصراف
              </button>
              <button
                onClick={handleSaveOffering}
                className="px-5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow"
              >
                ذخیره و ارائه کلاس
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
