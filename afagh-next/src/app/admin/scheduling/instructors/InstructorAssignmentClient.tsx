'use client';

import React, { useState, useTransition } from 'react';
import { InstructorAssignmentInput } from '@/lib/scheduling-engine';
import { assignInstructorsToOfferingAction, CourseOfferingInstructorRecord } from './actions';

interface InstructorOption {
  id: string;
  name: string;
}

export default function InstructorAssignmentClient({
  courseOfferingId,
  courseTitle,
  initialAssignments,
  availableInstructors,
}: {
  courseOfferingId: string;
  courseTitle: string;
  initialAssignments: CourseOfferingInstructorRecord[];
  availableInstructors: InstructorOption[];
}) {
  const [assignments, setAssignments] = useState<InstructorAssignmentInput[]>(
    initialAssignments.map((a) => ({
      instructorId: a.instructorId,
      instructorName: a.instructorName,
      isPrimary: a.isPrimary,
      canEnterGrades: a.canEnterGrades,
      canTrackAttendance: a.canTrackAttendance,
      sharePercentage: a.sharePercentage,
    }))
  );

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // محاسبه مجموع درصد تدریس
  const totalShare = assignments.reduce((sum, item) => sum + (Number(item.sharePercentage) || 0), 0);

  // تغییر استاد مسئول (فقط یک نفر می‌تواند استاد مسئول باشد)
  const handlePrimaryChange = (index: number) => {
    const updated = assignments.map((item, idx) => ({
      ...item,
      isPrimary: idx === index,
      // استاد مسئول حتماً باید دسترسی ثبت نمره داشته باشد
      canEnterGrades: idx === index ? true : item.canEnterGrades,
    }));
    setAssignments(updated);
  };

  // تغییر فیلدهای دیگر (درصد، دسترسی‌ها)
  const handleFieldChange = (
    index: number,
    field: keyof InstructorAssignmentInput,
    value: any
  ) => {
    const updated = [...assignments];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setAssignments(updated);
  };

  // افزودن استاد جدید به لیست ارائه
  const handleAddInstructor = () => {
    const remainingShare = Math.max(0, 100 - totalShare);
    const unassigned = availableInstructors.find(
      (inst) => !assignments.some((a) => a.instructorId === inst.id)
    );

    const newAssignment: InstructorAssignmentInput = {
      instructorId: unassigned ? unassigned.id : `inst-${Date.now()}`,
      instructorName: unassigned ? unassigned.name : 'مدرس جدید',
      isPrimary: assignments.length === 0,
      canEnterGrades: assignments.length === 0,
      canTrackAttendance: true,
      sharePercentage: remainingShare > 0 ? remainingShare : 0,
    };

    setAssignments([...assignments, newAssignment]);
  };

  // حذف استاد از ارائه
  const handleRemoveInstructor = (index: number) => {
    const updated = assignments.filter((_, idx) => idx !== index);
    // اگر نفر حذف‌شده استاد مسئول بود و ردیف دیگری وجود دارد، اولین نفر را مسئول کن
    if (assignments[index]?.isPrimary && updated.length > 0) {
      updated[0].isPrimary = true;
      updated[0].canEnterGrades = true;
    }
    setAssignments(updated);
  };

  // ذخیره در سرور
  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await assignInstructorsToOfferingAction({
        courseOfferingId,
        assignments,
      });

      if (res.success) {
        setMessage({ type: 'success', text: res.message || 'تخصیص اساتید با موفقیت تایید و ذخیره شد.' });
      } else {
        setMessage({ type: 'error', text: res.error || 'خطا در ذخیره‌سازی تخصیص اساتید' });
      }
    });
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      {/* اعلان وضعیت */}
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

      {/* پنل خلاصه وضعیت و متراژ بار تدریس */}
      <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-md font-bold text-gray-900">{courseTitle}</h2>
          <span className="text-xs text-gray-500 font-mono">شناسه ارائه: {courseOfferingId}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-left">
            <span className="text-xs text-gray-500 block">مجموع بار تدریس:</span>
            <span
              className={`text-lg font-bold ${
                totalShare === 100
                  ? 'text-green-600'
                  : totalShare > 100
                  ? 'text-red-600'
                  : 'text-orange-500'
              }`}
            >
              {totalShare}٪ از ۱۰۰٪
            </span>
          </div>
          <button
            onClick={handleAddInstructor}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-medium px-3 py-2 rounded-lg border transition"
          >
            + افزودن مدرس
          </button>
        </div>
      </div>

      {/* جدول تنظیم مدرسین و دسترسی‌ها */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="text-sm font-bold text-gray-800">مدرسین تخصیص‌یافته و حدود مسئولیت</h3>
          <span className="text-xs text-gray-500">
            * توجه: استاد مسئول تنها مرجع تایید نهایی نمرات به اداره آموزش است.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-100 text-gray-600 text-xs">
              <tr>
                <th className="p-3.5 text-center w-24">استاد مسئول</th>
                <th className="p-3.5">نام مدرس</th>
                <th className="p-3.5 text-center">ثبت نمره</th>
                <th className="p-3.5 text-center">حضور و غیاب</th>
                <th className="p-3.5 w-32">سهم تدریس (٪)</th>
                <th className="p-3.5 text-center w-20">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-400">
                    هنوز مدرسی به این ارائه‌ی درسی تخصیص نیافته است.
                  </td>
                </tr>
              ) : (
                assignments.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    {/* رادیوباتن استاد مسئول */}
                    <td className="p-3.5 text-center">
                      <input
                        type="radio"
                        name="primaryInstructor"
                        checked={item.isPrimary}
                        onChange={() => handlePrimaryChange(index)}
                        className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        title="انتخاب به عنوان استاد مسئول"
                      />
                    </td>

                    {/* نام و انتخاب مدرس */}
                    <td className="p-3.5">
                      <select
                        value={item.instructorId}
                        onChange={(e) => {
                          const selected = availableInstructors.find((i) => i.id === e.target.value);
                          const updated = [...assignments];
                          updated[index].instructorId = e.target.value;
                          if (selected) updated[index].instructorName = selected.name;
                          setAssignments(updated);
                        }}
                        className="border rounded-lg p-1.5 text-xs bg-gray-50 focus:bg-white w-full sm:w-64"
                      >
                        {availableInstructors.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* دسترسی ثبت نمره */}
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={item.canEnterGrades}
                        disabled={item.isPrimary} // استاد مسئول اجباراً دسترسی دارد
                        onChange={(e) => handleFieldChange(index, 'canEnterGrades', e.target.checked)}
                        className="rounded border-gray-300 text-blue-600"
                      />
                    </td>

                    {/* دسترسی حضور و غیاب */}
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={item.canTrackAttendance}
                        onChange={(e) => handleFieldChange(index, 'canTrackAttendance', e.target.checked)}
                        className="rounded border-gray-300 text-blue-600"
                      />
                    </td>

                    {/* درصد سهم تدریس */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.sharePercentage}
                          onChange={(e) =>
                            handleFieldChange(index, 'sharePercentage', Number(e.target.value))
                          }
                          className="w-20 border rounded p-1 text-xs bg-gray-50 focus:bg-white text-center"
                        />
                        <span className="text-xs text-gray-500">٪</span>
                      </div>
                    </td>

                    {/* دکمه حذف */}
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => handleRemoveInstructor(index)}
                        className="text-red-500 hover:text-red-700 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50"
                        title="حذف مدرس"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* دکمه ذخیره نهایی */}
        <div className="p-4 bg-gray-50 border-t flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || assignments.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium px-6 py-2 rounded-lg transition shadow-sm"
          >
            {isPending ? 'در حال ثبت...' : 'ذخیره و تایید نهایی تخصیص'}
          </button>
        </div>
      </div>
    </div>
  );
}