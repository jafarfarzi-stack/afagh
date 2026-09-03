import Link from 'next/link';
import { isDemoMode } from '@/lib/auth';

export default function ManualPage() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 sm:p-8 font-sans" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* هدر راهنما */}
        <div className="bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-400 text-slate-950">
              مستندات رسمی سازمانی (نسخه ۱.۴ — شهریور ۱۴۰۵)
            </span>
            <h1 className="text-xl sm:text-3xl font-black mt-2">
              راهنمای جامع کاربری و راهبری سامانه دانشگاهی آفاق
            </h1>
            <p className="text-xs sm:text-sm text-indigo-200 mt-1">
              دستورالعمل کامل ماژول‌های پذیرش سنجش، موتور گردش کار پویا (BPM)، استعلام ایرانداک، تسویه حساب پنج‌گانه و پایش SLA
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/Afagh_ERP_Comprehensive_User_Manual.pdf"
              download="Afagh_ERP_Comprehensive_User_Manual.pdf"
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs shadow-lg flex items-center gap-2 transition"
            >
              <span>📥</span>
              <span>دانلود مستقیم فایل PDF راهنما (۴۳۲KB)</span>
            </a>
            <Link
              href="/admin"
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition"
            >
              بازگشت به پنل مدیریت
            </Link>
          </div>
        </div>

        {/* دسترسی سریع به فصول */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { title: 'فصل ۱: پذیرش و سنجش', desc: 'پردازش TXT و فرمول شماره دانشجویی', icon: '📥', href: '#ch1' },
            { title: 'فصل ۲: میز خدمات و BPM', desc: 'گواهی اشتغال و تسویه موازی', icon: '📋', href: '#ch2' },
            { title: 'فصل ۳: همانندجویی ایرانداک', desc: 'وظایف سیستمی و سقف ۲۰٪ تشابه', icon: '🔍', href: '#ch3' },
            { title: 'فصل ۴: پایش زنده و SLA', desc: 'نقشه حرارتی و رفع گلوگاه‌ها', icon: '⏱️', href: '#ch4' },
            { title: 'فصل ۵: ماتریس RBAC', desc: 'تفکیک وظایف و مجوزهای خرد', icon: '🛡️', href: '#ch5' },
            { title: 'فصل ۶: آموزش مجازی', desc: 'ورود ۱-کلیکه بیگ‌بلوباتن و مودل', icon: '💻', href: '#ch6' },
            { title: 'فصل ۷: خودارزیابی پرسنل', desc: 'کارنامه KPI و رتبه‌بندی اساتید', icon: '🏆', href: '#ch7' },
            { title: 'فصل ۸: حساب‌های نمونه', desc: 'کلمه عبور و جدول نقش‌های دمو', icon: '👥', href: '#ch8' },
          ].map((item, idx) => (
            <a
              key={idx}
              href={item.href}
              className="card p-4 bg-white hover:bg-indigo-50/50 border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-300 transition space-y-1 block"
            >
              <div className="text-xl">{item.icon}</div>
              <h3 className="font-extrabold text-xs text-slate-900">{item.title}</h3>
              <p className="text-[11px] text-slate-500 leading-tight">{item.desc}</p>
            </a>
          ))}
        </div>

        {/* فصول مستند */}
        <div className="space-y-8">
          
          {/* فصل اول */}
          <section id="ch1" className="card p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
            <h2 className="text-base sm:text-lg font-black text-indigo-950 border-b pb-2">
              فصل ۱: هسته هویتی، ساختار سازمانی و پذیرش سازمان سنجش
            </h2>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              در ابتدای هر سال تحصیلی، اطلاعات داوطلبان پذیرفته‌شده به صورت فایل متنی (TXT/CSV) بارگذاری می‌شود. سیستم رکوردهای خام را در جدول واسط <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-900 font-mono">admissions_staging</code> ذخیره و بر اساس جدول نگاشت <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-900 font-mono">sanjesh_mappings</code>، کدهای رشته و سهمیه را با ساختار دانشگاه تطبیق می‌دهد:
            </p>
            <ul className="list-disc list-inside text-xs space-y-1 text-slate-600 pr-2">
              <li><b>رکوردهای سبز (RESOLVED):</b> دارای نگاشت قطعی در سیستم و آماده صدور شماره دانشجویی.</li>
              <li><b>رکوردهای قرمز (PENDING_MAPPING):</b> کدهای تعریف‌نشده با امکان نگاشت سریع با یک کلیک.</li>
              <li><b>فرمول‌ساز پویای شماره دانشجویی:</b> الگوی توکن‌دار مانند <code className="font-mono bg-slate-100 px-1">{'{Year:2}{DegreeCode:1}{MajorCode:3}{Seq:3}'}</code> (نمونه: <code>051412015</code>).</li>
            </ul>
          </section>

          {/* فصل دوم */}
          <section id="ch2" className="card p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
            <h2 className="text-base sm:text-lg font-black text-indigo-950 border-b pb-2">
              فصل ۲: میز خدمات الکترونیک، فرم‌ساز پویا و درخواست‌های دانشجویی (BPM)
            </h2>
            <div className="space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <p>
                <b>۱. گواهی اشتغال به تحصیل هوشمند:</b> سیستم به صورت خودکار (Auto-Check) وضعیت ثبت‌نام قطعی ترم جاری و عدم بدهی مالی شهریه را بررسی کرده و در صورت احراز شرایط، بلافاصله سند رسمی PDF دارای بارکد امنیتی QR و هش دیجیتال SHA-256 را صادر می‌کند.
              </p>
              <p>
                <b>۲. تطبیق واحد دروس:</b> پس از تایید انطباق سرفصل توسط مدیر گروه و آموزش کل، نمره درس مستقیماً در کارنامه تحصیلی دانشجو درج می‌شود.
              </p>
              <p>
                <b>۳. تسویه حساب موازی پنج‌گانه (Parallel Gateway):</b> استعلام همزمان ۵ بخش (امور مالی، کتابخانه، صندوق رفاه، آزمایشگاه/کارگاه و خوابگاه).
              </p>
            </div>
          </section>

          {/* فصل سوم */}
          <section id="ch3" className="card p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
            <h2 className="text-base sm:text-lg font-black text-indigo-950 border-b pb-2">
              فصل ۳: اتصال به وب‌سرویس‌ها و همانندجویی پایان‌نامه ایرانداک (Service Tasks)
            </h2>
            <div className="space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <p>
                در فرآیند مجوز دفاع و صحافی پایان‌نامه، سیستم به صورت خودکار (Service Task) متد POST را به API همانندجوی ایرانداک ارسال می‌نماید:
              </p>
              <ul className="list-disc list-inside text-xs space-y-1 text-slate-600 pr-2">
                <li><b>مشابهت &le; ۲۰٪ (مثلاً ۱۴.۲٪):</b> تایید خودکار سیستمی، الصاق گواهی اصالت و انتقال به گام تعیین هیئت داوران.</li>
                <li><b>مشابهت &gt; ۲۰٪ (مثلاً ۲۸.۵٪):</b> توقف خودکار گردش کار و ارسال اخطار به دانشجو جهت اصلاح متن.</li>
                <li><b>تاب‌آوری (Resilience):</b> تلاش مجدد با وقفه تصاعدی (Exponential Backoff) و قطع‌کننده مدار (Circuit Breaker).</li>
              </ul>
            </div>
          </section>

          {/* فصل چهارم تا هشتم */}
          <section id="ch4" className="card p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
            <h2 className="text-base sm:text-lg font-black text-indigo-950 border-b pb-2">
              فصل ۴ تا ۷: پایش زنده SLA، ماتریس RBAC و آموزش مجازی
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-700">
              <div className="p-3 bg-slate-50 rounded-xl border">
                <p className="font-bold text-slate-900 mb-1">⏱️ کنترل ضرب‌الاجل و نقشه حرارتی (Heatmap):</p>
                <p>پایش زمان توقف پرونده‌ها و اعمال قوانین خودکار انقضا (ارجاع به مقام بالاتر، تایید خودکار یا رد).</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border">
                <p className="font-bold text-slate-900 mb-1">🛡️ ماتریس دسترسی‌ها و تفکیک وظایف:</p>
                <p>جداسازی کامل اختیارات کارشناس پذیرش، آموزش و مالی (Segregation of Duties).</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border">
                <p className="font-bold text-slate-900 mb-1">💻 کلاس مجازی بیگ‌بلوباتن و مودل:</p>
                <p>ورود یک‌کلیکه (1-Click SSO) بدون نیاز به لاگین مجدد و آرشیو ویدیوهای ضبط‌شده.</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border">
                <p className="font-bold text-slate-900 mb-1">🏆 کارنامه خودارزیابی پرسنل (/professor/performance):</p>
                <p>نمایش حجم مختومه‌شده، میانگین زمان اقدام (MTTR) و شاخص رضایت دانشجویان (CSAT).</p>
              </div>
            </div>
          </section>

          {/* حساب‌های کاربری نمونه — فقط در حالت دمو نمایش داده می‌شود (۵-①) */}
          {isDemoMode() && (
          <section id="ch8" className="card p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
            <h2 className="text-base sm:text-lg font-black text-indigo-950 border-b pb-2">
              فصل ۸: جدول حساب‌های کاربری پیش‌فرض دمو (کلمه عبور همه: 123456)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b text-slate-700 font-extrabold">
                    <th className="p-2.5">نقش کاربری</th>
                    <th className="p-2.5">نام کاربری / کد ملی</th>
                    <th className="p-2.5">دسترسی‌ها و مسئولیت‌ها</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b"><td className="p-2.5 font-bold">مدیر ارشد (Admin)</td><td className="p-2.5 font-mono font-bold" dir="ltr">0000000001</td><td className="p-2.5">دسترسی کامل، طراح فرآیندها، RBAC و پایش زنده</td></tr>
                  <tr className="border-b"><td className="p-2.5 font-bold">عضو هیئت علمی / استاد</td><td className="p-2.5 font-mono font-bold" dir="ltr">0011111111</td><td className="p-2.5">کلاس مجازی، ثبت نمرات، خودارزیابی و قرارداد</td></tr>
                  <tr className="border-b"><td className="p-2.5 font-bold">دانشجو (پورتال خدمات)</td><td className="p-2.5 font-mono font-bold" dir="ltr">31412001 (یا 1010101010)</td><td className="p-2.5">ثبت درخواست‌ها، گواهی اشتغال، کارنامه و LMS</td></tr>
                  <tr className="border-b"><td className="p-2.5 font-bold">کارشناس آموزش کل</td><td className="p-2.5 font-mono font-bold" dir="ltr">0055555555</td><td className="p-2.5">بررسی پرونده‌ها، پذیرش سنجش و شورای آموزشی</td></tr>
                  <tr className="border-b"><td className="p-2.5 font-bold">کارشناس امور مالی</td><td className="p-2.5 font-mono font-bold" dir="ltr">0077777777</td><td className="p-2.5">تسویه شهریه، تایید مساعده و حقوق اساتید</td></tr>
                  <tr className="border-b"><td className="p-2.5 font-bold">مسئول مخزن آزمون</td><td className="p-2.5 font-mono font-bold" dir="ltr">0034343434</td><td className="p-2.5">قرنطینه اوراق و تحویل به استاد و بایگانی</td></tr>
                  <tr><td className="p-2.5 font-bold">مراقب آزمون</td><td className="p-2.5 font-mono font-bold" dir="ltr">0012121212</td><td className="p-2.5">ثبت حضور داوطلبان و صورتجلسه آزمون</td></tr>
                </tbody>
              </table>
            </div>
          </section>
          )}

        </div>
      </div>
    </div>
  );
}
