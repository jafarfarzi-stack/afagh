import React from 'react';
import ClassroomsClient from '../ClassroomsClient';
import { getClassroomsAction } from '../actions1';

/**
 * صفحه مدیریت کلاس‌ها و فضاهای فیزیکی دانشگاه (Server Component)
 */
export default async function AdminClassroomsPage() {
  const universityId = 'uni-afagh';
  const response = await getClassroomsAction(universityId);
  const classrooms = response.success && response.classrooms ? response.classrooms : [];

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">مدیریت فضاها و کلاس‌های آموزشی</h1>
          <p className="text-xs text-gray-500 mt-1">
            تعریف، ویرایش و نظارت بر ظرفیت‌های آموزشی و حوزه‌های صندلی امتحانی دانشگاه
          </p>
        </div>

        <ClassroomsClient initialClassrooms={classrooms} />
      </div>
    </main>
  );
}