import React from 'react';
import InstructorAssignmentClient from './InstructorAssignmentClient';
import { getCourseOfferingInstructorsAction } from './actions';

interface PageProps {
  searchParams?: Promise<{
    offeringId?: string;
  }>;
}

/**
 * صفحه مدیریت تخصیص اساتید و تفکیک نقش‌ها در ارائه درسی (Server Component)
 */
export default async function AdminInstructorAssignmentPage({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const currentOfferingId = resolvedParams.offeringId || 'off-201';
  const currentCourseTitle = 'ریاضی عمومی ۱ (مهندسی کامپیوتر - گروه ۰۱)';

  // واکشی مدرسین تخصیص‌یافته به ارائه
  const response = await getCourseOfferingInstructorsAction(currentOfferingId);
  const initialAssignments = response.success && response.assignments ? response.assignments : [];

  // لیست اساتید فعال دانشگاه جهت انتخاب (در محیط پروداکشن از دیتابیس اساتید واکشی می‌شود)
  const availableInstructors = [
    { id: 'inst-101', name: 'دکتر محمد رضایی (استاد تمام)' },
    { id: 'inst-102', name: 'مهندس سارا عباسی (مدرس مدعو)' },
    { id: 'inst-103', name: 'دکتر علیرضا کاظمی (دانشیار)' },
    { id: 'inst-104', name: 'دکتر فاطمه حسینی (استادیار)' },
  ];

  return (
    <main className="min-h-screen bg-gray-50 py-8 font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">تخصیص اساتید و تفکیک مسئولیت‌های آموزشی</h1>
          <p className="text-xs text-gray-500 mt-1">
            تنظیم مدرس اصلی (Primary)، تفویض دسترسی‌های ورود نمرات، حضور و غیاب و تسهیم سهم موظفی تدریس
          </p>
        </div>

        <InstructorAssignmentClient
          courseOfferingId={currentOfferingId}
          courseTitle={currentCourseTitle}
          initialAssignments={initialAssignments}
          availableInstructors={availableInstructors}
        />
      </div>
    </main>
  );
}