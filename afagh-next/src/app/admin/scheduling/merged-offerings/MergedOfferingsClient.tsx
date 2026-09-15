'use client';

import React, { useState, useTransition } from 'react';
import { MergedGroupRecord, createMergedGroupAction } from './actions';
import { ClassroomCapacityInput } from '@/lib/scheduling-engine';

export default function MergedOfferingsClient({
  initialGroups,
  availableClassrooms,
}: {
  initialGroups: MergedGroupRecord[];
  availableClassrooms: ClassroomCapacityInput[];
}) {
  const [groups, setGroups] = useState<MergedGroupRecord[]>(initialGroups);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // فرم ایجاد گروه ادغام‌شده جدید
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState(
    availableClassrooms[0]?.classroomId || ''
  );

  // دروس عضو ادغام
  const [course1Title, setCourse1Title] = useState('ریاضی عمومی ۱ - کامپیوتر');
  const [course1Count, setCourse1Count] = useState(25);
  const [course2Title, setCourse2Title] = useState('ریاضی عمومی ۱ - برق');
  const [course2Count, setCourse2Count] = useState(20);

  const handleCreateMergedGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const targetRoom = availableClassrooms.find((c) => c.classroomId === selectedClassroomId);
    if (!targetRoom) {
      setMessage({ type: 'error', text: 'لطفاً یک کلاس معتبر انتخاب کنید.' });
      return;
    }

    startTransition(async () => {
      const memberOfferings = [
        { offeringId: `off-${Date.now()}-1`, courseTitle: course1Title, enrolledCount: course1Count },
        { offeringId: `off-${Date.now()}-2`, courseTitle: course2Title, enrolledCount: course2Count },
      ];

      const res = await createMergedGroupAction({
        termId: '1402-2',
        groupTitle,
        memberOfferings,
        targetClassroom: targetRoom,
      });

      if (res.success) {
        setMessage({ type: 'success', text: res.message || 'گروه ادغام‌شده با موفقیت ثبت شد.' });
        const newGroup: MergedGroupRecord = {
          groupId: `mg-${Date.now()}`,
          groupTitle,
          termId: '1402-2',
          assignedClassroomId: targetRoom.classroomId,
          assignedClassroomCode: targetRoom.roomCode,
          memberOfferings,
        };
        setGroups([newGroup, ...groups]);
        setGroupTitle('');
      } else {
        setMessage({ type: 'error', text: res.error || 'خطا در ثبت گروه ادغام‌شده' });
      }
    });
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      {/* پیام‌ها */}
      {message && (
        <div
          className={`p-4 rounded-lg text-sm border ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* فرم ادغام و لیست گروه‌ها */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* فرم ثبت گروه ادغام جدید */}
        <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4 lg:col-span-1">
          <h2 className="text-md font-bold text-gray-900 border-b pb-2">ایجاد گروه ادغام دروس</h2>
          <form onSubmit={handleCreateMergedGroup} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">عنوان گروه ادغام:</label>
              <input
                type="text"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="مثال: ریاضی عمومی ۱ (مشترک کامپیوتر و برق)"
                className="w-full border rounded-lg p-2 text-sm bg-gray-50"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">کلاس و فضای تخصیص‌یافته:</label>
              <select
                value={selectedClassroomId}
                onChange={(e) => setSelectedClassroomId(e.target.value)}
                className="w-full border rounded-lg p-2 text-sm bg-gray-50"
              >
                {availableClassrooms.map((room) => (
                  <option key={room.classroomId} value={room.classroomId}>
                    {room.roomCode} (ظرفیت: {room.teachingCapacity} نفر)
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t pt-2 space-y-2">
              <span className="text-xs font-bold text-gray-700 block">ارائه‌های عضو ادغام:</span>
              
              <div className="p-2.5 bg-gray-50 rounded-lg border space-y-2">
                <input
                  type="text"
                  value={course1Title}
                  onChange={(e) => setCourse1Title(e.target.value)}
                  placeholder="عنوان درس ۱"
                  className="w-full border rounded p-1.5 text-xs bg-white"
                  required
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">ثبت‌نامی:</label>
                  <input
                    type="number"
                    value={course1Count}
                    onChange={(e) => setCourse1Count(Number(e.target.value))}
                    className="w-20 border rounded p-1 text-xs bg-white"
                  />
                  <span className="text-xs text-gray-500">نفر</span>
                </div>
              </div>

              <div className="p-2.5 bg-gray-50 rounded-lg border space-y-2">
                <input
                  type="text"
                  value={course2Title}
                  onChange={(e) => setCourse2Title(e.target.value)}
                  placeholder="عنوان درس ۲"
                  className="w-full border rounded p-1.5 text-xs bg-white"
                  required
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">ثبت‌نامی:</label>
                  <input
                    type="number"
                    value={course2Count}
                    onChange={(e) => setCourse2Count(Number(e.target.value))}
                    className="w-20 border rounded p-1 text-xs bg-white"
                  />
                  <span className="text-xs text-gray-500">نفر</span>
                </div>
              </div>

              <div className="text-xs text-blue-700 bg-blue-50 p-2 rounded">
                مجموع دانشجویان در این گروه: <strong>{course1Count + course2Count} نفر</strong>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-blue-600 text-white rounded-lg p-2 text-sm font-medium hover:bg-blue-700 transition"
            >
              بررسی ظرفیت و تایید ادغام
            </button>
          </form>
        </div>

        {/* لیست گروه‌های ادغام‌شده موجود */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden lg:col-span-2">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="text-sm font-bold text-gray-800">فهرست گروه‌های درسی ادغام‌شده نیمسال</h2>
          </div>
          <div className="p-4 space-y-4">
            {groups.map((group) => {
              const totalStudents = group.memberOfferings.reduce((sum, m) => sum + m.enrolledCount, 0);
              return (
                <div key={group.groupId} className="border rounded-xl p-4 bg-gray-50/50 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">{group.groupTitle}</h3>
                      <span className="text-xs text-gray-500 font-mono">شناسه: {group.groupId}</span>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                      مکان: {group.assignedClassroomCode || 'نامشخص'}
                    </span>
                  </div>

                  <div className="bg-white rounded-lg border p-3">
                    <span className="text-xs font-bold text-gray-600 block mb-2">دروس و کدهای ثبت‌نامی شرکت‌کننده:</span>
                    <ul className="space-y-1.5 text-xs text-gray-700">
                      {group.memberOfferings.map((member) => (
                        <li key={member.offeringId} className="flex justify-between border-b last:border-0 pb-1">
                          <span>• {member.courseTitle}</span>
                          <span className="font-mono text-gray-500">{member.enrolledCount} دانشجو</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex justify-between items-center text-xs text-gray-600 pt-1">
                    <span>مجموع کل دانشجویان کلاس: <strong>{totalStudents} نفر</strong></span>
                    <span className="text-green-600 font-medium">تطبیق ظرفیت تایید شده ✓</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}