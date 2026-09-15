import React from 'react';
import MergedOfferingsClient from './MergedOfferingsClient';
import { getMergedOfferingsAction } from './actions';
import { getClassroomsAction } from '../actions';

/**
 * صفحه مدیریت و نظارت بر ادغام دروس و تخصیص فضاها (Server Component)
 */
export default async function AdminMergedOfferingsPage() {
  const currentTermId = '1402-2';
  const universityId = 'uni-afagh';

  // فراخوانی هم‌زمان گروه‌های ادغام‌شده و لیست کلاس‌های در دسترس
  const [mergedResult, classroomsResult] = await Promise.all([
    getMergedOfferingsAction(currentTermId),
    getClassroomsAction(universityId),
  ]);

  const groups = mergedResult.success && mergedResult.groups ? mergedResult.groups : [];
  const classrooms = classroomsResult.success && classroomsResult.classrooms ? classroomsResult.classrooms : [];

  return (
    <main className="min-h-screen bg-gray-50 py-8 font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">مدیریت ادغام دروس و هم‌پوشانی فضاها</h1>
          <p className="text-xs text-gray-500 mt-1">
            تعریف گروه‌های تجمیعی، تخصیص کلاس فیزیکی با تطبیق خودکار ظرفیت و تفکیک کدهای ثبت‌نامی نیمسال {currentTermId}
          </p>
        </div>

        <MergedOfferingsClient
          initialGroups={groups}
          availableClassrooms={classrooms}
        />
      </div>
    </main>
  );
}