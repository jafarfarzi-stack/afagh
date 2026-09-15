'use client';

import React, { useState, useTransition } from 'react';
import { ClassroomRecord, upsertClassroomAction, evaluateClassroomAssignmentAction } from './actions';

export default function ClassroomsClient({
  initialClassrooms,
}: {
  initialClassrooms: ClassroomRecord[];
}) {
  const [classrooms, setClassrooms] = useState<ClassroomRecord[]>(initialClassrooms);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // حالت تست و ارزیابی زنده ظرفیت
  const [selectedRoomId, setSelectedRoomId] = useState<string>(initialClassrooms[0]?.classroomId || '');
  const [testDemand, setTestDemand] = useState<number>(35);
  const [testMode, setTestMode] = useState<'teaching' | 'exam'>('teaching');
  const [evaluationResult, setEvaluationResult] = useState<string | null>(null);

  // فرم افزودن/ویرایش کلاس جدید
  const [roomCode, setRoomCode] = useState('');
  const [teachingCap, setTeachingCap] = useState(40);
  const [examCap, setExamCap] = useState(25);
  const [isExamArea, setIsExamArea] = useState(true);

  const handleAddClassroom = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const newRoom: ClassroomRecord = {
        classroomId: `room-${Date.now()}`,
        roomCode,
        floor: 1,
        teachingCapacity: teachingCap,
        examCapacity: examCap,
        isExamArea,
        isActive: true,
      };

      const res = await upsertClassroomAction(newRoom);
      if (res.success) {
        setMessage({ type: 'success', text: res.message || 'کلاس با موفقیت ثبت شد.' });
        setClassrooms([newRoom, ...classrooms]);
        setRoomCode('');
      } else {
        setMessage({ type: 'error', text: res.error || 'خطا در ثبت کلاس' });
      }
    });
  };

  const handleRunEvaluation = async () => {
    const room = classrooms.find((c) => c.classroomId === selectedRoomId);
    if (!room) return;

    const res = await evaluateClassroomAssignmentAction(room, testDemand, testMode);
    if (res.success && res.check) {
      setEvaluationResult(res.check.message);
    } else {
      setEvaluationResult('خطا در ارزیابی ظرفیت');
    }
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      {/* اعلان‌ها */}
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

      {/* ابزار شبیه‌ساز و ارزیابی زنده ظرفیت فضا */}
      <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
        <h2 className="text-md font-bold text-gray-900 border-b pb-2">شبیه‌ساز و ارزیابی زنده ظرفیت فضا</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">انتخاب فضا:</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm bg-gray-50"
            >
              {classrooms.map((c) => (
                <option key={c.classroomId} value={c.classroomId}>
                  {c.roomCode} (آموزش: {c.teachingCapacity} | امتحان: {c.examCapacity})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">نوع ارزیابی:</label>
            <select
              value={testMode}
              onChange={(e) => setTestMode(e.target.value as any)}
              className="w-full border rounded-lg p-2 text-sm bg-gray-50"
            >
              <option value="teaching">ظرفیت آموزشی کلاس درس</option>
              <option value="exam">ظرفیت صندلی امتحانی</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">تعداد تقاضا / دانشجویان:</label>
            <input
              type="number"
              value={testDemand}
              onChange={(e) => setTestDemand(Number(e.target.value))}
              className="w-full border rounded-lg p-2 text-sm bg-gray-50"
            />
          </div>
          <div>
            <button
              onClick={handleRunEvaluation}
              className="w-full bg-blue-600 text-white rounded-lg p-2 text-sm font-medium hover:bg-blue-700 transition"
            >
              بررسی انطباق
            </button>
          </div>
        </div>

        {evaluationResult && (
          <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm font-medium mt-2">
            نتیجه ارزیابی: {evaluationResult}
          </div>
        )}
      </div>

      {/* فرم ثبت کلاس جدید */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4 lg:col-span-1">
          <h2 className="text-md font-bold text-gray-900 border-b pb-2">تعریف فضای فیزیکی جدید</h2>
          <form onSubmit={handleAddClassroom} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">کد یا نام فضا (مثال: کلاس ۱۰۴):</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="نام فضا..."
                className="w-full border rounded-lg p-2 text-sm bg-gray-50"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">ظرفیت آموزشی:</label>
              <input
                type="number"
                value={teachingCap}
                onChange={(e) => setTeachingCap(Number(e.target.value))}
                className="w-full border rounded-lg p-2 text-sm bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">ظرفیت صندلی امتحان:</label>
              <input
                type="number"
                value={examCap}
                onChange={(e) => setExamCap(Number(e.target.value))}
                className="w-full border rounded-lg p-2 text-sm bg-gray-50"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="examCheck"
                checked={isExamArea}
                onChange={(e) => setIsExamArea(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="examCheck" className="text-xs text-gray-700">قابل استفاده به عنوان حوزه امتحانی</label>
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-green-600 text-white rounded-lg p-2 text-sm font-medium hover:bg-green-700 transition"
            >
              ثبت و ایجاد فضا
            </button>
          </form>
        </div>

        {/* جدول لیست فضاها */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden lg:col-span-2">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="text-sm font-bold text-gray-800">فهرست کلاس‌ها و فضاهای فیزیکی دانشگاه</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-100 text-gray-600 text-xs">
                <tr>
                  <th className="p-3">کد فضا</th>
                  <th className="p-3">طبقه</th>
                  <th className="p-3">ظرفیت آموزشی</th>
                  <th className="p-3">ظرفیت امتحان</th>
                  <th className="p-3">حوزه امتحان</th>
                  <th className="p-3">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y text-gray-700">
                {classrooms.map((room) => (
                  <tr key={room.classroomId} className="hover:bg-gray-50">
                    <td className="p-3 font-bold text-gray-900">{room.roomCode}</td>
                    <td className="p-3">طبقه {room.floor}</td>
                    <td className="p-3">{room.teachingCapacity} نفر</td>
                    <td className="p-3">{room.examCapacity} نفر</td>
                    <td className="p-3">
                      {room.isExamArea ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">مجاز</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">غیرمجاز</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">فعال</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}