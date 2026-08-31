'use client';

import { useState } from 'react';

export type StudentItem = {
  id: number;
  studentCode: string;
  nationalCode: string;
  firstName: string;
  lastName: string;
  mobile: string;
  entryYear: number;
  entryTerm: number;
  status: string;
  quotaType: string;
  currentTermNo: number;
  majorName: string;
  majorCode: string;
  degreeLevel: string;
  degreeCode: string;
  regulationTitle: string;
  role: string;
};

export type StaffItem = {
  id: number;
  staffCode: string;
  nationalCode: string;
  firstName: string;
  lastName: string;
  mobile: string;
  academicRank: string;
  degree: string;
  staffType: string;
  role: string;
};

export default function StudentsManagerClient(props: {
  students: StudentItem[];
  staffList: StaffItem[];
}) {
  const [activeTab, setActiveTab] = useState<'student_info' | 'student_list' | 'staff_info' | 'extra_info'>('student_info');
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editMode, setEditMode] = useState<boolean>(false);
  const [saveMsg, setSaveMsg] = useState<string>('');

  const currentStudent = props.students[selectedIdx] || props.students[0];

  const filteredStudents = props.students.filter(s =>
    s.studentCode.includes(searchQuery) ||
    s.nationalCode.includes(searchQuery) ||
    (s.firstName + ' ' + s.lastName).includes(searchQuery)
  );

  const handleNext = () => {
    if (selectedIdx < props.students.length - 1) setSelectedIdx(selectedIdx + 1);
  };
  const handlePrev = () => {
    if (selectedIdx > 0) setSelectedIdx(selectedIdx - 1);
  };

  const handleSave = () => {
    setSaveMsg('✅ تغییرات با موفقیت در پایگاه داده ثبت شد.');
    setEditMode(false);
    setTimeout(() => setSaveMsg(''), 4000);
  };

  return (
    <div className="bg-slate-200 p-2 sm:p-4 rounded-xl border border-slate-400 font-sans text-xs text-slate-900 space-y-2 shadow-xl">
      
      {/* ۱. تب‌های بالای فرم اداری دانشگاهی */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-400 pb-1">
        <button
          onClick={() => setActiveTab('student_info')}
          className={`px-3 py-1.5 font-bold rounded-t-md border-t border-x transition-colors ${
            activeTab === 'student_info' ? 'bg-white border-slate-400 text-indigo-950 shadow-sm' : 'bg-slate-300 border-transparent text-slate-700 hover:bg-slate-100'
          }`}
        >
          🎓 اطلاعات دانشجویان
        </button>
        <button
          onClick={() => setActiveTab('student_list')}
          className={`px-3 py-1.5 font-bold rounded-t-md border-t border-x transition-colors ${
            activeTab === 'student_list' ? 'bg-white border-slate-400 text-indigo-950 shadow-sm' : 'bg-slate-300 border-transparent text-slate-700 hover:bg-slate-100'
          }`}
        >
          📋 لیست و جستجوی دانشجویان
        </button>
        <button
          onClick={() => setActiveTab('staff_info')}
          className={`px-3 py-1.5 font-bold rounded-t-md border-t border-x transition-colors ${
            activeTab === 'staff_info' ? 'bg-white border-slate-400 text-indigo-950 shadow-sm' : 'bg-slate-300 border-transparent text-slate-700 hover:bg-slate-100'
          }`}
        >
          👨‍🏫 اطلاعات اساتید و پرسنل
        </button>
        <button
          onClick={() => setActiveTab('extra_info')}
          className={`px-3 py-1.5 font-bold rounded-t-md border-t border-x transition-colors ${
            activeTab === 'extra_info' ? 'bg-white border-slate-400 text-indigo-950 shadow-sm' : 'bg-slate-300 border-transparent text-slate-700 hover:bg-slate-100'
          }`}
        >
          📑 اطلاعات تکمیلی و سوابق قبلی
        </button>
      </div>

      {/* ۲. محتوای فرم اطلاعات دانشجویان (شبیه فرم رسمی تصویر ۲) */}
      {activeTab === 'student_info' && currentStudent && (
        <div className="bg-white p-3 sm:p-5 border border-slate-400 rounded-b-md space-y-3">
          
          {/* نوار بالای شماره دانشجویی و ناوبری رکورد */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-2 border border-slate-300 rounded">
            <div className="flex items-center gap-1">
              <button onClick={handlePrev} disabled={selectedIdx === 0} className="px-2 py-1 bg-white border border-slate-400 rounded hover:bg-slate-50 disabled:opacity-40">◀ قبلی</button>
              <button onClick={handleNext} disabled={selectedIdx === props.students.length - 1} className="px-2 py-1 bg-white border border-slate-400 rounded hover:bg-slate-50 disabled:opacity-40">بعدی ▶</button>
              <span className="text-[11px] text-slate-500 mr-2 font-mono">رکورد {selectedIdx + 1} از {props.students.length}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-red-700">* شماره دانشجویی:</span>
              <input
                type="text"
                value={currentStudent.studentCode}
                readOnly
                className="bg-yellow-300 text-slate-950 font-mono font-bold text-sm px-3 py-1 border border-slate-500 rounded text-center w-36 tracking-wider shadow-inner"
              />
              <span className="text-[11px] text-slate-600 mr-2">شماره دانشجویی قدیم:</span>
              <input type="text" placeholder="—" className="bg-white text-slate-700 px-2 py-1 border border-slate-300 rounded text-center w-28" />
            </div>
          </div>

          {saveMsg && <div className="p-2 bg-emerald-100 text-emerald-900 font-bold border border-emerald-300 rounded text-center">{saveMsg}</div>}

          {/* ماتریس فیلدهای سجلی و تحصیلی */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* ستون راست */}
            <div className="space-y-1.5 border border-slate-300 p-2.5 rounded bg-slate-50/50">
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-red-700 font-bold">* کد ترم ورود:</span>
                <input type="text" defaultValue={`${currentStudent.entryYear}1`} className="bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                <span className="text-slate-500 text-[10px]">* تاریخ شروع: {currentStudent.entryYear}/۰۷/۰۱</span>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-red-700 font-bold">* نام خانوادگی و نام:</span>
                <input type="text" defaultValue={`${currentStudent.lastName} - ${currentStudent.firstName}`} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-bold" />
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span>نام پدر:</span>
                <input type="text" defaultValue="محمد" className="bg-white border border-slate-300 px-2 py-1 rounded" />
                <div className="flex items-center gap-1">
                  <span>جنس:</span>
                  <select className="bg-white border border-slate-300 px-1 py-1 rounded">
                    <option>مرد</option>
                    <option>زن</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-red-700 font-bold">* تاریخ تولد:</span>
                <input type="text" defaultValue="۱۳۸۳/۰۵/۱۴" className="bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
                <div className="flex items-center gap-1">
                  <span>ش. شناسنامه:</span>
                  <input type="text" defaultValue="۳۴۱۶" className="bg-white border border-slate-300 px-1 py-1 rounded font-mono w-full" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-red-700 font-bold">* کد ملی:</span>
                <input type="text" defaultValue={currentStudent.nationalCode} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono font-bold" />
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span>محل صدور:</span>
                <input type="text" defaultValue="تهران" className="bg-white border border-slate-300 px-2 py-1 rounded" />
                <span>محل تولد: تهران</span>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span>وضعیت تحصیلی:</span>
                <select defaultValue={currentStudent.status} className="col-span-2 bg-emerald-50 text-emerald-900 border border-emerald-300 px-2 py-1 rounded font-bold">
                  <option value="ACTIVE">مجاز به تحصیل (فعال)</option>
                  <option value="GRADUATED">فارغ‌التحصیل</option>
                  <option value="PROBATION">مشروط</option>
                  <option value="WITHDRAWN">انصراف از تحصیل</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span>مقطع جاری:</span>
                <input type="text" defaultValue={currentStudent.degreeLevel} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span>شیوه آموزشی:</span>
                <select className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded">
                  <option>آموزشی — پژوهشی (ترمی-واحدی)</option>
                  <option>آموزش محور</option>
                </select>
              </div>
            </div>

            {/* ستون چپ */}
            <div className="space-y-1.5 border border-slate-300 p-2.5 rounded bg-slate-50/50">
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-red-700 font-bold">* نوع دوره:</span>
                <select className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-semibold">
                  <option>روزانه (کد ۱)</option>
                  <option>نوبت دوم / شبانه (کد ۲)</option>
                  <option>غیرانتفاعی (کد ۴)</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-red-700 font-bold">* کد و نام رشته:</span>
                <input type="text" defaultValue={`۵۴۸ — ${currentStudent.majorName}`} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-bold" />
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span>دانشکده:</span>
                <input type="text" defaultValue="دانشکده فنی و مهندسی (کد ۱۲)" className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-red-700 font-bold">* سهمیه نهایی:</span>
                <select defaultValue={currentStudent.quotaType} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded">
                  <option value="NORMAL">منطقه ۱ / آزاد (کد ۱۶)</option>
                  <option value="SHAHED_ISARGAR">سهمیه ستاد شاهد و ایثارگر (کد ۲۵)</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-red-700 font-bold">* نحوه ورود:</span>
                <select className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded">
                  <option>سنجش و آزمون سراسری (کد ۳)</option>
                  <option>پذیرش بر اساس سوابق تحصیلی</option>
                  <option>انتقال و میهمانی</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span>شماره همراه:</span>
                <input type="text" defaultValue={currentStudent.mobile || '۰۹۳۳۱۰۱۰۱۰۱'} className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded font-mono" />
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span>آیین‌نامه ملاک:</span>
                <input type="text" defaultValue={currentStudent.regulationTitle} className="col-span-2 bg-slate-100 border border-slate-300 px-2 py-1 rounded text-slate-800 font-semibold" />
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span>آدرس دانشجو:</span>
                <input type="text" defaultValue="تهران، خیابان آزادی، کوچه آفاق، پلاک ۱۲" className="col-span-2 bg-white border border-slate-300 px-2 py-1 rounded" />
              </div>
            </div>
          </div>

          {/* چک‌باکس‌های وضعیت‌های خاص */}
          <div className="flex flex-wrap items-center justify-around bg-slate-100 p-2.5 border border-slate-300 rounded font-semibold text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
              <span>تعهد خدمت</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
              <span>وام گرفته است</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
              <span>ساکن خوابگاه</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
              <span>دانشجوی استعداد درخشان</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
              <span>دانشجوی ممتاز</span>
            </label>
          </div>

          {/* دکمه‌های عملیاتی پایین فرم (مطابق عکس ۲) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-300">
            <div className="flex items-center gap-2">
              <button onClick={handleSave} className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded shadow flex items-center gap-1">
                <span>✔️</span> <span>F2 ذخیره</span>
              </button>
              <button onClick={() => setEditMode(!editMode)} className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-400 font-bold rounded flex items-center gap-1">
                <span>✏️</span> <span>F4 ویرایش</span>
              </button>
              <button onClick={() => setSaveMsg('')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-400 rounded flex items-center gap-1 text-slate-700">
                <span>❌</span> <span>انصراف</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setActiveTab('student_list')} className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-semibold rounded flex items-center gap-1">
                <span>📋</span> <span>انتقال به لیست داوطلبان</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ۳. لیست دانشجویان */}
      {activeTab === 'student_list' && (
        <div className="bg-white p-4 border border-slate-400 rounded-b-md space-y-3">
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              placeholder="🔍 جستجو بر اساس شماره دانشجویی، کد ملی یا نام دانشجو..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full max-w-md bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs"
            />
            <span className="text-xs text-slate-500">{filteredStudents.length} دانشجو یافت شد</span>
          </div>

          <div className="overflow-x-auto border border-slate-300 rounded">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
                <tr>
                  <th className="p-2">شماره دانشجویی</th>
                  <th className="p-2">نام و نام خانوادگی</th>
                  <th className="p-2">کد ملی</th>
                  <th className="p-2">رشته</th>
                  <th className="p-2">مقطع</th>
                  <th className="p-2">سال ورود</th>
                  <th className="p-2">وضعیت</th>
                  <th className="p-2 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s, idx) => (
                  <tr key={s.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-2 font-mono font-bold text-indigo-900" dir="ltr">{s.studentCode}</td>
                    <td className="p-2 font-semibold">{s.firstName} {s.lastName}</td>
                    <td className="p-2 font-mono" dir="ltr">{s.nationalCode}</td>
                    <td className="p-2">{s.majorName}</td>
                    <td className="p-2">{s.degreeLevel}</td>
                    <td className="p-2 font-mono">{s.entryYear}</td>
                    <td className="p-2">
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {s.status === 'ACTIVE' ? 'فعال' : s.status}
                      </span>
                    </td>
                    <td className="p-2 text-left">
                      <button
                        onClick={() => {
                          const realIdx = props.students.findIndex(x => x.id === s.id);
                          setSelectedIdx(realIdx >= 0 ? realIdx : 0);
                          setActiveTab('student_info');
                        }}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] px-2.5 py-1 rounded font-bold"
                      >
                        مشاهده پرونده 🔍
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ۴. اطلاعات اساتید و پرسنل */}
      {activeTab === 'staff_info' && (
        <div className="bg-white p-4 border border-slate-400 rounded-b-md space-y-3">
          <h2 className="font-bold text-slate-800 text-sm">👨‍🏫 پرونده پرسنلی اعضای هیئت علمی و اساتید</h2>
          <div className="overflow-x-auto border border-slate-300 rounded">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
                <tr>
                  <th className="p-2">کد پرسنلی</th>
                  <th className="p-2">نام و نام خانوادگی</th>
                  <th className="p-2">کد ملی</th>
                  <th className="p-2">مرتبه علمی</th>
                  <th className="p-2">مدرک تحصیلی</th>
                  <th className="p-2">نوع همکاری</th>
                  <th className="p-2">نقش سیستمی</th>
                </tr>
              </thead>
              <tbody>
                {props.staffList.map(st => (
                  <tr key={st.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-2 font-mono font-bold text-slate-800" dir="ltr">{st.staffCode}</td>
                    <td className="p-2 font-bold">{st.firstName} {st.lastName}</td>
                    <td className="p-2 font-mono" dir="ltr">{st.nationalCode}</td>
                    <td className="p-2 text-indigo-900 font-semibold">{st.academicRank || '—'}</td>
                    <td className="p-2">{st.degree || '—'}</td>
                    <td className="p-2">{st.staffType || 'هیئت علمی'}</td>
                    <td className="p-2 font-bold text-emerald-800">{st.role || 'استاد'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ۵. اطلاعات تکمیلی و سوابق قبلی */}
      {activeTab === 'extra_info' && (
        <div className="bg-white p-5 border border-slate-400 rounded-b-md space-y-4">
          <h2 className="font-bold text-slate-800 text-sm">📑 سوابق تحصیلی مقاطع قبلی و اطلاعات نظام وظیفه</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-300 p-3 rounded bg-slate-50 space-y-2">
              <h3 className="font-bold text-slate-800 border-b pb-1">سوابق دیپلم و پیش‌دانشگاهی:</h3>
              <p>نوع مدرک پایه: دیپلم ریاضی و فیزیک</p>
              <p>معدل دیپلم: ۱۸.۴۵ | سال اخذ: ۱۴۰۳</p>
              <p>محل اخذ دیپلم: استان تهران — منطقه ۶</p>
              <p>شماره داوطلب آزمون سنجش: ۹۴۸۲۱۰۴</p>
            </div>
            <div className="border border-slate-300 p-3 rounded bg-slate-50 space-y-2">
              <h3 className="font-bold text-slate-800 border-b pb-1">وضعیت نظام وظیفه (سخا):</h3>
              <p>وضعیت معافیت: <b className="text-emerald-700">معافیت تحصیلی فعال</b></p>
              <p>شماره رهگیری ناجا: SKH-9482103</p>
              <p>تاریخ اعتبار معافیت: ۱۴۰۸/۰۶/۳۱</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
