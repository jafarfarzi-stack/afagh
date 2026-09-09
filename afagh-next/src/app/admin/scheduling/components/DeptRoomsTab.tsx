'use client';

// گام ۳: کلاس‌های اختصاص‌یافته به گروه
import { usePlanning } from '../PlanningProvider';
import { faNum } from '../planning-core';

export default function DeptRoomsTab() {
  const { classrooms, currentProgram } = usePlanning();

  return (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🏛️</span>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    کلاس‌ها، سایت‌ها و آزمایشگاه‌های اختصاص‌یافته به دپارتمان «{currentProgram?.title ?? '—'}»
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  سهمیهٔ فضاهای فیزیکی این نیمسال از جدول scheduling_room_grants (موتور تخصیص) خوانده می‌شود؛ تغییر سهمیه از موتور تخصیص سالن انجام می‌شود.
                </p>
              </div>

              <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 font-extrabold text-xs">
                {faNum(classrooms.filter(c => c.isAllocatedToDept).length)} سالن سهمیه‌دار از {faNum(classrooms.length)} سالن دانشگاه
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classrooms.map(room => (
                <div
                  key={room.id}
                  className={`p-4 rounded-2xl border-2 transition flex flex-col justify-between shadow-sm ${
                    room.isAllocatedToDept
                      ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-400/20'
                      : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900">
                        {room.roomType === 'LAB' ? '🧪 سایت / آزمایشگاه' : room.roomType === 'GYM' ? '⚽ سالن ورزشی' : '📖 کلاس نظری'}
                      </span>
                      <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                        room.isAllocatedToDept ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {room.isAllocatedToDept ? '✓ اختصاص به گروه' : 'آزاد / سایر گروه‌ها'}
                      </span>
                    </div>

                    <h4 className="text-base font-extrabold text-slate-900">{room.name}</h4>
                    <p className="text-xs text-slate-500 mb-2">{room.buildingName}</p>

                    <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">ظرفیت صندلی:</span>
                        <span className="font-extrabold text-slate-900">{faNum(room.capacity)} نفر</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">امکانات:</span>
                        <span className="font-bold text-indigo-900">{room.equipment.join('، ')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 mt-3 text-center text-[11px] font-bold text-slate-500">
                    {room.isAllocatedToDept ? 'سهمیهٔ ثبت‌شدهٔ موتور تخصیص' : 'استخر مشترک دانشکده'}
                  </div>
                </div>
              ))}
            </div>
          </div>
  );
}
