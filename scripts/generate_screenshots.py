import os
import sys
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def fa(text):
    if not text:
        return ""
    reshaped = arabic_reshaper.reshape(str(text))
    return get_display(reshaped)

def get_font(size, bold=False):
    path = BOLD_FONT_PATH if bold else FONT_PATH
    return ImageFont.truetype(path, size)

def draw_header_bar(draw, title, subtitle, bg_color=(20, 28, 58), w=1200):
    draw.rectangle([(0, 0), (w, 90)], fill=bg_color)
    draw.text((w - 40, 20), fa(title), fill=(255, 255, 255), font=get_font(24, True), anchor="ra")
    draw.text((w - 40, 56), fa(subtitle), fill=(180, 200, 255), font=get_font(13), anchor="ra")
    draw.rectangle([(0, 86), (w, 90)], fill=(245, 158, 11)) # Amber accent

def generate_screenshots():
    os.makedirs("docs/images", exist_ok=True)
    
    # -------------------------------------------------------------
    # 1. SCREENSHOT: Executive Operations & Real-time Cartable
    # -------------------------------------------------------------
    img = Image.new("RGB", (1200, 650), color=(248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw_header_bar(draw, "داشبورد مدیریت زنده و کارتابل گردش کار (Real-time Ops & BPM)", "پایش لحظه‌ای پرونده‌ها، ضرب‌الاجل‌های SLA و گلوگاه‌های اداری")
    
    # Summary KPI Cards
    kpis = [
        ("کل درخواست‌ها", "۱۴۲ پرونده", (79, 70, 229)),
        ("در انتظار بررسی", "۲۸ مورد", (217, 119, 6)),
        ("تأیید نهایی", "۱۰۴ مورد", (16, 185, 129)),
        ("بحرانی و فوری", "۳ پرونده", (239, 68, 68)),
        ("رضایت دانشجو", "★ ۴.۸ از ۵", (245, 158, 11)),
    ]
    for i, (title, val, col) in enumerate(kpis):
        x0 = 40 + i * 225
        x1 = x0 + 215
        draw.rounded_rectangle([(x0, 110), (x1, 180)], radius=12, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
        draw.text((x1 - 15, 122), fa(title), fill=(100, 116, 139), font=get_font(11), anchor="ra")
        draw.text((x1 - 15, 146), fa(val), fill=col, font=get_font(18, True), anchor="ra")

    # Urgent cases alert box
    draw.rounded_rectangle([(40, 200), (1160, 310)], radius=14, fill=(254, 242, 242), outline=(252, 165, 165), width=2)
    draw.text((1140, 215), fa("🚨 پایش زنده پرونده‌های فوری و در آستانه نقض SLA (Urgent Operations Monitor)"), fill=(153, 27, 27), font=get_font(14, True), anchor="ra")
    draw.text((1140, 245), fa("• کد REQ-1405-8821: تطبیق واحد - مدیر گروه مهندسی کامپیوتر (تنها ۲.۵ ساعت باقی‌مانده)"), fill=(185, 28, 28), font=get_font(12), anchor="ra")
    draw.text((1140, 275), fa("• کد REQ-1405-3104: دفاع پایان‌نامه - تحصیلات تکمیلی (انقضای مهلت - ارجاع خودکار سیستمی به معاونت)"), fill=(185, 28, 28), font=get_font(12), anchor="ra")

    # Inbox Table Mockup
    draw.rounded_rectangle([(40, 330), (1160, 620)], radius=14, fill=(255, 255, 255), outline=(203, 213, 225), width=2)
    draw.rectangle([(40, 330), (1160, 375)], fill=(241, 245, 249))
    headers = [("کد رهگیری", 180), ("نام دانشجو", 380), ("عنوان خدمت", 600), ("مرحله فعلی", 820), ("وضعیت SLA", 980), ("اقدام", 1140)]
    for h, x in headers:
        draw.text((x, 345), fa(h), fill=(71, 85, 105), font=get_font(12, True), anchor="ra")

    rows = [
        ("REQ-1405-9921", "علیرضا پیروزمند (۳۱۴۱۲۰۰۱)", "گواهی اشتغال به تحصیل", "اعتبارسنجی مالی و ثبت‌نام", "✓ صدور آنی خودکار", "تأیید شد"),
        ("REQ-1405-5542", "نگین شجاعی (۳۱۴۱۲۰۰۲)", "تطبیق واحد دروس", "بررسی علمی مدیر گروه", "⏳ در مهلت (۱۲h مانده)", "بررسی"),
        ("REQ-1405-7719", "سهراب کیانی (۳۱۴۱۲۰۰۳)", "مجوز دفاع پایان‌نامه", "استعلام همانندجویی ایرانداک", "✓ تأیید API (۱۴.۲٪)", "تخصیص داور"),
        ("REQ-1405-1102", "مریم صادقی (۳۱۴۱۲۰۰۴)", "تسویه حساب فارغ‌التحصیلی", "تسویه موازی پنج‌گانه", "✓ ۴ از ۵ بخش تایید", "تایید نهایی"),
    ]
    for r_i, r in enumerate(rows):
        y = 390 + r_i * 55
        draw.line([(40, y + 45), (1160, y + 45)], fill=(241, 245, 249), width=1)
        draw.text((180, y + 12), fa(r[0]), fill=(30, 41, 59), font=get_font(12, True), anchor="ra")
        draw.text((380, y + 12), fa(r[1]), fill=(51, 65, 85), font=get_font(12), anchor="ra")
        draw.text((600, y + 12), fa(r[2]), fill=(30, 41, 59), font=get_font(12, True), anchor="ra")
        draw.text((820, y + 12), fa(r[3]), fill=(71, 85, 105), font=get_font(12), anchor="ra")
        draw.text((980, y + 12), fa(r[4]), fill=(16, 185, 129) if "✓" in r[4] else (217, 119, 6), font=get_font(11, True), anchor="ra")
        draw.rounded_rectangle([(1060, y + 5), (1140, y + 35)], radius=6, fill=(79, 70, 229))
        draw.text((1100, y + 12), fa(r[5]), fill=(255, 255, 255), font=get_font(10, True), anchor="mm")

    img.save("docs/images/screenshot_1_dashboard_ops.png")

    # -------------------------------------------------------------
    # 2. SCREENSHOT: Student Dynamic Requests & Printable Certificate
    # -------------------------------------------------------------
    img2 = Image.new("RGB", (1200, 650), color=(248, 250, 252))
    draw2 = ImageDraw.Draw(img2)
    draw_header_bar(draw2, "میز خدمات الکترونیک و درخواست‌های دانشجو", "ثبت فرم‌های پویا، پیگیری تایم‌لاین گردش کار و صدور سند رسمی")

    # Request Card (Certificate of Enrollment)
    draw2.rounded_rectangle([(40, 110), (580, 620)], radius=14, fill=(255, 255, 255), outline=(203, 213, 225), width=2)
    draw2.text((560, 130), fa("فرم درخواست گواهی اشتغال به تحصیل"), fill=(30, 41, 59), font=get_font(15, True), anchor="ra")
    draw2.text((560, 160), fa("سازمان / ارگان مقصد:"), fill=(100, 116, 139), font=get_font(11), anchor="ra")
    draw2.rounded_rectangle([(60, 185), (560, 225)], radius=8, fill=(248, 250, 252), outline=(203, 213, 225), width=1)
    draw2.text((540, 197), fa("سازمان نظام وظیفه عمومی ناجا"), fill=(15, 23, 42), font=get_font(12), anchor="ra")

    draw2.text((560, 245), fa("هدف درخواست:"), fill=(100, 116, 139), font=get_font(11), anchor="ra")
    draw2.rounded_rectangle([(60, 270), (560, 310)], radius=8, fill=(248, 250, 252), outline=(203, 213, 225), width=1)
    draw2.text((540, 282), fa("تمدید معافیت تحصیلی ترم جاری"), fill=(15, 23, 42), font=get_font(12), anchor="ra")

    draw2.rounded_rectangle([(60, 340), (560, 430)], radius=10, fill=(236, 253, 245), outline=(167, 243, 208), width=1)
    draw2.text((540, 355), fa("✓ احراز شرایط سیستمی هوشمند (Auto-Check):"), fill=(6, 95, 70), font=get_font(12, True), anchor="ra")
    draw2.text((540, 380), fa("• ثبت‌نام ترم ۱-۱۴۰۵: فعال (۱۸ واحد قطعی)"), fill=(4, 120, 87), font=get_font(11), anchor="ra")
    draw2.text((540, 405), fa("• تراز شهریه مالی: تسویه شده و فاقد بدهی"), fill=(4, 120, 87), font=get_font(11), anchor="ra")

    draw2.rounded_rectangle([(60, 460), (560, 510)], radius=10, fill=(16, 185, 129))
    draw2.text((310, 475), fa("📜 صدور آنی گواهی با بارکد امنیتی و امضا"), fill=(255, 255, 255), font=get_font(13, True), anchor="mm")

    # Official Certificate Document Preview
    draw2.rounded_rectangle([(620, 110), (1160, 620)], radius=14, fill=(255, 255, 255), outline=(15, 23, 42), width=3)
    draw2.text((890, 135), fa("جمهوری اسلامی ایران - وزارت علوم، تحقیقات و فناوری"), fill=(71, 85, 105), font=get_font(10), anchor="mm")
    draw2.text((890, 160), fa("دانشگاه جامع آفاق - معاونت آموزشی"), fill=(15, 23, 42), font=get_font(14, True), anchor="mm")
    draw2.line([(650, 185), (1130, 185)], fill=(15, 23, 42), width=2)

    draw2.text((1130, 205), fa("شماره سند: CERT-1405-9921"), fill=(71, 85, 105), font=get_font(10), anchor="ra")
    draw2.text((1130, 235), fa("بدین‌وسیله گواهی می‌شود؛"), fill=(15, 23, 42), font=get_font(12, True), anchor="ra")
    draw2.text((1130, 265), fa("دانشجو علیرضا پیروزمند به شماره دانشجویی ۳۱۴۱۲۰۰۱ در مقطع کارشناسی"), fill=(30, 41, 59), font=get_font(11), anchor="ra")
    draw2.text((1130, 290), fa("پیوسته رشته مهندسی کامپیوتر در نیمسال اول ۱۴۰۵-۱۴۰۶ اشتغال به تحصیل"), fill=(30, 41, 59), font=get_font(11), anchor="ra")
    draw2.text((1130, 315), fa("دارد و وضعیت تحصیلی ایشان فعال و مجاز می‌باشد."), fill=(30, 41, 59), font=get_font(11), anchor="ra")

    # Digital Seal & QR Code
    draw2.rounded_rectangle([(650, 430), (820, 590)], radius=10, fill=(248, 250, 252), outline=(203, 213, 225), width=1)
    draw2.text((735, 450), fa("بارکد رهگیری QR"), fill=(100, 116, 139), font=get_font(10), anchor="mm")
    draw2.rectangle([(675, 470), (795, 570)], fill=(15, 23, 42))

    draw2.rounded_rectangle([(960, 450), (1130, 580)], radius=50, outline=(30, 58, 138), width=2)
    draw2.text((1045, 500), fa("مهر و امضای دیجیتال"), fill=(30, 58, 138), font=get_font(11, True), anchor="mm")
    draw2.text((1045, 525), fa("اداره کل آموزش آفاق"), fill=(30, 58, 138), font=get_font(9), anchor="mm")

    img2.save("docs/images/screenshot_2_student_requests.png")

    # -------------------------------------------------------------
    # 3. SCREENSHOT: Irandoc Plagiarism API & Service Tasks
    # -------------------------------------------------------------
    img3 = Image.new("RGB", (1200, 650), color=(248, 250, 252))
    draw3 = ImageDraw.Draw(img3)
    draw_header_bar(draw3, "سامانه همانندجویی پایان‌نامه و وظایف خودکار ایرانداک", "اتصال برخط به API ایرانداک، سنجش درصد مشابهت و تصمیم‌گیری Rule Engine")

    draw3.rounded_rectangle([(40, 110), (1160, 270)], radius=14, fill=(255, 255, 255), outline=(203, 213, 225), width=2)
    draw3.text((1140, 130), fa("درخواست مجوز دفاع و صحافی پایان‌نامه کارشناسی ارشد"), fill=(15, 23, 42), font=get_font(15, True), anchor="ra")
    draw3.text((1140, 160), fa("عنوان: ارزیابی کارایی الگوریتم‌های یادگیری ماشین در سامانه‌های دانشگاهی توزیع‌شده"), fill=(51, 65, 85), font=get_font(12), anchor="ra")
    draw3.text((1140, 190), fa("دانشجو: سهراب کیانی · استاد راهنما: دکتر جمیل احمدی · کد رهگیری ایرانداک: IRAN-1405-7719"), fill=(100, 116, 139), font=get_font(11), anchor="ra")

    # API Flowchart Box
    draw3.rounded_rectangle([(40, 290), (1160, 620)], radius=14, fill=(240, 253, 250), outline=(94, 234, 212), width=2)
    draw3.text((1140, 310), fa("⚡ فرآیند خودکار وب‌سرویس (Automated Service Task & Rule Decision):"), fill=(15, 118, 110), font=get_font(14, True), anchor="ra")

    boxes = [
        ("۱. ارسال به API ایرانداک", "متد POST به همراه هش سند و کدملی", (13, 148, 136)),
        ("۲. دریافت پاسخ برخط", "درصد مشابهت: ۱۴.۲٪ (مدت پاسخ: 210ms)", (16, 185, 129)),
        ("۳. ارزیابی شرط سقف ۲۰٪", "۱۴.۲٪ <= ۲۰٪ -> تأیید خودکار سیستمی", (79, 70, 229)),
        ("۴. الصاق گواهی اصالت", "گواهی دیجیتال در پرونده پیوست شد", (245, 158, 11)),
    ]
    for i, (b_t, b_d, col) in enumerate(boxes):
        x0 = 60 + i * 270
        x1 = x0 + 250
        draw3.rounded_rectangle([(x0, 360), (x1, 480)], radius=12, fill=(255, 255, 255), outline=col, width=2)
        draw3.text((x1 - 15, 380), fa(b_t), fill=col, font=get_font(12, True), anchor="ra")
        draw3.text((x1 - 15, 415), fa(b_d), fill=(51, 65, 85), font=get_font(10), anchor="ra")

    draw3.rounded_rectangle([(60, 510), (1140, 590)], radius=10, fill=(255, 255, 255), outline=(203, 213, 225), width=1)
    draw3.text((1120, 530), fa("✓ نتیجه: گام سیستمی با موفقیت انجام شد و پرونده مستقیماً به کارتابل تعیین تاریخ دفاع و هیئت داوران منتقل گردید."), fill=(6, 95, 70), font=get_font(12, True), anchor="ra")
    draw3.text((1120, 560), fa("لاگ ممیزی API (Audit Trail): Status 200 OK | Duration: 214ms | Cert SHA-256 Verified"), fill=(100, 116, 139), font=get_font(10), anchor="ra")

    img3.save("docs/images/screenshot_3_irandoc_api.png")

    # -------------------------------------------------------------
    # 4. SCREENSHOT: Sanjesh Staging & Dynamic Student ID
    # -------------------------------------------------------------
    img4 = Image.new("RGB", (1200, 650), color=(248, 250, 252))
    draw4 = ImageDraw.Draw(img4)
    draw_header_bar(draw4, "سامانه پذیرش سنجش و فرمول‌ساز شماره دانشجویی", "پردازش فایل متنی سازمان سنجش، تطبیق داده‌ها و صدور الگوریتمی شناسه دانشجو")

    # Staging Grid Box
    draw4.rounded_rectangle([(40, 110), (680, 620)], radius=14, fill=(255, 255, 255), outline=(203, 213, 225), width=2)
    draw4.text((660, 130), fa("صف بازبینی داده‌های سنجش (Admissions Staging)"), fill=(15, 23, 42), font=get_font(14, True), anchor="ra")
    
    st_rows = [
        ("0011223344", "علیرضا پیروزمند", "کد ۱۱۲۰۴", "مهندسی کامپیوتر", "✓ تطبیق شد"),
        ("0022334455", "نگین شجاعی", "کد ۱۱۲۰۵", "هوش مصنوعی", "✓ تطبیق شد"),
        ("0044556677", "آناهیتا کریمی", "کد ۹۹۹۹۹", "نامشخص", "⚠️ نیازمند نگاشت"),
        ("0055667788", "بابک معتمدی", "کد ۱۱۴۰۲", "علوم کامپیوتر", "✓ تطبیق شد"),
    ]
    for idx, (nc, fn, sc, mj, st) in enumerate(st_rows):
        y = 175 + idx * 75
        draw4.rounded_rectangle([(60, y), (660, y + 65)], radius=8, fill=(248, 250, 252) if "✓" in st else (254, 242, 242), outline=(226, 232, 240), width=1)
        draw4.text((640, y + 12), fa(f"{fn} ({nc})"), fill=(15, 23, 42), font=get_font(11, True), anchor="ra")
        draw4.text((640, y + 36), fa(f"{sc} -> {mj}"), fill=(71, 85, 105), font=get_font(10), anchor="ra")
        draw4.text((160, y + 22), fa(st), fill=(16, 185, 129) if "✓" in st else (239, 68, 68), font=get_font(11, True), anchor="ra")

    draw4.rounded_rectangle([(60, 550), (660, 600)], radius=8, fill=(16, 185, 129))
    draw4.text((360, 565), fa("🚀 صدور دسته‌جمعی شماره دانشجویی و ثبت‌نام نهایی"), fill=(255, 255, 255), font=get_font(12, True), anchor="mm")

    # Formula Generator Box
    draw4.rounded_rectangle([(710, 110), (1160, 620)], radius=14, fill=(255, 255, 255), outline=(203, 213, 225), width=2)
    draw4.text((1140, 130), fa("فرمول‌ساز پویای شماره دانشجویی"), fill=(15, 23, 42), font=get_font(14, True), anchor="ra")
    draw4.text((1140, 165), fa("الگوی فرمول مقطع کارشناسی:"), fill=(100, 116, 139), font=get_font(11), anchor="ra")
    draw4.rounded_rectangle([(730, 190), (1140, 230)], radius=8, fill=(238, 242, 255), outline=(199, 210, 254), width=1)
    draw4.text((1120, 202), fa("{Year:2}{DegreeCode:1}{MajorCode:3}{Seq:3}"), fill=(67, 56, 202), font=get_font(12, True), anchor="ra")

    draw4.rounded_rectangle([(730, 260), (1140, 480)], radius=12, fill=(15, 23, 42))
    draw4.text((1120, 280), fa("تجزیه و شبیه‌سازی متغیرها:"), fill=(245, 158, 11), font=get_font(11, True), anchor="ra")
    draw4.text((1120, 315), fa("• سال ۱۴۰۵ -> {Year:2} = 05"), fill=(226, 232, 240), font=get_font(11), anchor="ra")
    draw4.text((1120, 345), fa("• مقطع کارشناسی -> {DegreeCode:1} = 1"), fill=(226, 232, 240), font=get_font(11), anchor="ra")
    draw4.text((1120, 375), fa("• کد رشته مهندسی کامپیوتر -> {MajorCode:3} = 412"), fill=(226, 232, 240), font=get_font(11), anchor="ra")
    draw4.text((1120, 405), fa("• شماره ترتیبی بعدی -> {Seq:3} = 015"), fill=(226, 232, 240), font=get_font(11), anchor="ra")

    draw4.text((935, 445), fa("خروجی شماره دانشجویی: 051412015"), fill=(52, 211, 153), font=get_font(13, True), anchor="mm")

    img4.save("docs/images/screenshot_4_sanjesh_formula.png")

    # -------------------------------------------------------------
    # 5. SCREENSHOT: Dynamic RBAC Matrix & Segregation of Duties
    # -------------------------------------------------------------
    img5 = Image.new("RGB", (1200, 650), color=(248, 250, 252))
    draw5 = ImageDraw.Draw(img5)
    draw_header_bar(draw5, "ماتریس پویای سطوح دسترسی (Dynamic RBAC)", "تفکیک وظایف (Segregation of Duties) میان کارشناس ثبت‌نام، مالی و آموزش")

    draw5.rounded_rectangle([(40, 110), (1160, 620)], radius=14, fill=(255, 255, 255), outline=(203, 213, 225), width=2)
    draw5.text((1140, 130), fa("جدول ماتریس مجوزهای خرد و تفکیک سازمانی وظایف"), fill=(15, 23, 42), font=get_font(14, True), anchor="ra")

    roles = ["مدیر ارشد (ADMIN)", "کارشناس آموزش (EDU)", "کارشناس مالی (FINANCE)", "کارشناس پذیرش (REGISTRATION)", "استاد (PROFESSOR)"]
    perms = [
        ("پذیرش و تشکیل پرونده اولیه", [True, True, False, True, False]),
        ("تعریف دروس و چارت سرفصل", [True, True, False, False, False]),
        ("تایید مالی و مدیریت شهریه", [True, False, True, False, False]),
        ("ثبت و ویرایش نمرات آزمون", [True, False, False, False, True]),
        ("تایید نهایی تسویه حساب", [True, True, True, False, False]),
        ("طراحی فرآیندها و تنظیمات SLA", [True, False, False, False, False]),
    ]

    # Draw Matrix Header
    draw5.rectangle([(40, 160), (1160, 205)], fill=(241, 245, 249))
    draw5.text((1120, 175), fa("عنوان دسترسی و مجوز خرد"), fill=(71, 85, 105), font=get_font(11, True), anchor="ra")
    for r_i, r_name in enumerate(roles):
        x = 750 - r_i * 150
        draw5.text((x, 175), fa(r_name.split(' ')[0]), fill=(71, 85, 105), font=get_font(10, True), anchor="mm")

    # Draw Matrix Rows
    for p_i, (p_title, p_grants) in enumerate(perms):
        y = 215 + p_i * 65
        draw5.line([(40, y + 55), (1160, y + 55)], fill=(241, 245, 249), width=1)
        draw5.text((1120, y + 15), fa(p_title), fill=(15, 23, 42), font=get_font(11, True), anchor="ra")
        for g_i, is_granted in enumerate(p_grants):
            x = 750 - g_i * 150
            if is_granted:
                draw5.rounded_rectangle([(x - 20, y + 8), (x + 20, y + 36)], radius=6, fill=(220, 252, 231), outline=(134, 239, 172))
                draw5.text((x, y + 14), fa("✓ مجاز"), fill=(22, 101, 52), font=get_font(9, True), anchor="mm")
            else:
                draw5.rounded_rectangle([(x - 20, y + 8), (x + 20, y + 36)], radius=6, fill=(254, 242, 242), outline=(254, 202, 202))
                draw5.text((x, y + 14), fa("✗ فاقد"), fill=(153, 27, 27), font=get_font(9), anchor="mm")

    img5.save("docs/images/screenshot_5_rbac_matrix.png")

    # -------------------------------------------------------------
    # 6. SCREENSHOT: BigBlueButton Virtual Classroom & Moodle LMS
    # -------------------------------------------------------------
    img6 = Image.new("RGB", (1200, 650), color=(248, 250, 252))
    draw6 = ImageDraw.Draw(img6)
    draw_header_bar(draw6, "سامانه آموزش مجازی و کلاس آنلاین (BigBlueButton & Moodle)", "ورود ۱-کلیکه بدون نیاز به لاگین مجدد (SSO)، وبینار زنده و آرشیو ویدیوها")

    draw6.rounded_rectangle([(40, 110), (1160, 620)], radius=14, fill=(255, 255, 255), outline=(203, 213, 225), width=2)
    draw6.text((1140, 130), fa("کلاس‌های برخط و جلسات ضبط‌شده نیمسال جاری"), fill=(15, 23, 42), font=get_font(14, True), anchor="ra")

    live_classes = [
        ("ساختمان داده‌ها و الگوریتم‌ها", "دکتر جمیل احمدی", "کلاس در حال برگزاری (Live)", "۳۴ نفر حاضر", True),
        ("طراحی سیستم‌های شی‌ءگرا", "دکتر علوی", "شروع در ساعت ۱۴:۰۰", "۰ نفر", False),
        ("شبکه‌های کامپیوتری", "دکتر حسینی", "پایان‌یافته (آرشیو ویدیو آماده)", "۹۰ دقیقه ضبط", False),
    ]

    for idx, (c_name, c_prof, c_status, c_att, is_live) in enumerate(live_classes):
        y = 175 + idx * 135
        bg_col = (240, 253, 250) if is_live else (248, 250, 252)
        border_col = (45, 212, 191) if is_live else (226, 232, 240)
        draw6.rounded_rectangle([(60, y), (1140, y + 115)], radius=12, fill=bg_col, outline=border_col, width=2 if is_live else 1)

        draw6.text((1120, y + 18), fa(c_name), fill=(15, 23, 42), font=get_font(13, True), anchor="ra")
        draw6.text((1120, y + 48), fa(f"مدرس: {c_prof} · وضعیت: {c_status}"), fill=(71, 85, 105), font=get_font(11), anchor="ra")
        draw6.text((1120, y + 78), fa(f"تعداد شرکت‌کنندگان: {c_att}"), fill=(13, 148, 136) if is_live else (100, 116, 139), font=get_font(11, True), anchor="ra")

        if is_live:
            draw6.rounded_rectangle([(100, y + 35), (280, y + 80)], radius=8, fill=(13, 148, 136))
            draw6.text((190, y + 50), fa("💻 ورود به کلاس آنلاین (BBB)"), fill=(255, 255, 255), font=get_font(11, True), anchor="mm")
        else:
            draw6.rounded_rectangle([(100, y + 35), (280, y + 80)], radius=8, fill=(241, 245, 249), outline=(203, 213, 225), width=1)
            draw6.text((190, y + 50), fa("▶️ بازپخش ویدیو ضبط‌شده"), fill=(51, 65, 85), font=get_font(11), anchor="mm")

    img6.save("docs/images/screenshot_6_virtual_classroom.png")
    print("Screenshots generated successfully!")

if __name__ == "__main__":
    generate_screenshots()
