import os
import sys
import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# Register Fonts
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

pdfmetrics.registerFont(TTFont("DejaVu", FONT_REGULAR))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", FONT_BOLD))

def fa(text):
    if not text:
        return ""
    reshaped = arabic_reshaper.reshape(str(text))
    return get_display(reshaped)

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_header_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_header_footer(self, page_count):
        if self._pageNumber == 1:
            return # Skip cover page

        self.saveState()
        self.setFont("DejaVu", 8)
        self.setFillColor(colors.HexColor("#475569"))

        # Header
        header_text = fa("سامانه جامع دانشگاهی آفاق (Afagh ERP) — راهنمای جامع کاربری و راهبری")
        self.drawRightString(555, 805, header_text)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(40, 798, 555, 798)

        # Footer
        footer_text = fa(f"صفحه {self._pageNumber} از {page_count}")
        self.drawString(40, 30, footer_text)
        confidential = fa("نسخه رسمی سازمانی — کلیه حقوق محفوظ است")
        self.drawRightString(555, 30, confidential)
        self.line(40, 42, 555, 42)

        self.restoreState()

def create_manual():
    pdf_path = "docs/Afagh_ERP_Comprehensive_User_Manual.pdf"
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=55,
        bottomMargin=55
    )

    styles = getSampleStyleSheet()

    # Custom RTL Styles
    title_style = ParagraphStyle(
        "CoverTitle",
        fontName="DejaVu-Bold",
        fontSize=22,
        leading=30,
        alignment=1, # Center
        textColor=colors.HexColor("#0f172a")
    )

    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        fontName="DejaVu",
        fontSize=12,
        leading=18,
        alignment=1,
        textColor=colors.HexColor("#334155")
    )

    h1_style = ParagraphStyle(
        "Heading1_Fa",
        fontName="DejaVu-Bold",
        fontSize=15,
        leading=22,
        alignment=2, # Right
        textColor=colors.HexColor("#1e1b4b"),
        spaceAfter=8,
        spaceBefore=14
    )

    h2_style = ParagraphStyle(
        "Heading2_Fa",
        fontName="DejaVu-Bold",
        fontSize=12,
        leading=18,
        alignment=2,
        textColor=colors.HexColor("#312e81"),
        spaceAfter=6,
        spaceBefore=10
    )

    body_style = ParagraphStyle(
        "Body_Fa",
        fontName="DejaVu",
        fontSize=9.5,
        leading=15,
        alignment=2,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        "Bullet_Fa",
        fontName="DejaVu",
        fontSize=9,
        leading=14,
        alignment=2,
        textColor=colors.HexColor("#334155"),
        spaceAfter=3
    )

    box_title_style = ParagraphStyle(
        "BoxTitle_Fa",
        fontName="DejaVu-Bold",
        fontSize=10,
        leading=14,
        alignment=2,
        textColor=colors.HexColor("#065f46")
    )

    table_header_style = ParagraphStyle(
        "TH_Fa",
        fontName="DejaVu-Bold",
        fontSize=9,
        leading=12,
        alignment=1,
        textColor=colors.HexColor("#ffffff")
    )

    table_cell_style = ParagraphStyle(
        "TD_Fa",
        fontName="DejaVu",
        fontSize=8.5,
        leading=12,
        alignment=2,
        textColor=colors.HexColor("#0f172a")
    )

    story = []

    # =========================================================================
    # 1. COVER PAGE (صفحه جلد)
    # =========================================================================
    story.append(Spacer(1, 40))
    story.append(Paragraph(fa("جمهوری اسلامی ایران — وزارت علوم، تحقیقات و فناوری"), subtitle_style))
    story.append(Paragraph(fa("دانشگاه جامع آفاق"), ParagraphStyle("UnivName", fontName="DejaVu-Bold", fontSize=18, leading=24, alignment=1, textColor=colors.HexColor("#1e3a8a"))))
    story.append(Spacer(1, 30))

    # University Seal Graphic Box
    crest_data = [[Paragraph(fa("آفاق<br/><font size=8>AFAGH ERP</font>"), ParagraphStyle("Crest", fontName="DejaVu-Bold", fontSize=20, leading=22, alignment=1, textColor=colors.HexColor("#1e1b4b")))]]
    crest_table = Table(crest_data, colWidths=[120], rowHeights=[90])
    crest_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#e0e7ff")),
        ('BOX', (0,0), (-1,-1), 3, colors.HexColor("#3730a3")),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(crest_table)
    story.append(Spacer(1, 35))

    story.append(Paragraph(fa("راهنمای جامع کاربری و راهبری سامانه یکپارچه آفاق"), title_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph(fa("دستورالعمل کامل عملیاتی ماژول‌های پذیرش سنجش، موتور گردش کار پویا (BPM)، استعلام همانندجویی ایرانداک، تسویه حساب پنج‌گانه، کلاس‌های مجازی و پایش زنده SLA"), subtitle_style))
    story.append(Spacer(1, 40))

    # Metadata Box
    meta_data = [
        [Paragraph(fa("نسخه مستند:"), table_cell_style), Paragraph(fa("۱.۴ (ویرایش سازمانی ۱۴۰۵)"), table_cell_style)],
        [Paragraph(fa("مخاطبان هدف:"), table_cell_style), Paragraph(fa("مدیران ارشد، کارشناسان آموزش و مالی، اساتید و دانشجویان"), table_cell_style)],
        [Paragraph(fa("معماری فنی:"), table_cell_style), Paragraph(fa("Next.js 14 App Router + PostgreSQL + Redis + Drizzle ORM"), table_cell_style)],
        [Paragraph(fa("تاریخ انتشار:"), table_cell_style), Paragraph(fa("شهریور ۱۴۰۵ / سپتامبر ۲۰۲۶"), table_cell_style)],
    ]
    meta_table = Table(meta_data, colWidths=[120, 320])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(meta_table)

    story.append(PageBreak())

    # =========================================================================
    # 2. TABLE OF CONTENTS & INTRODUCTION (فهرست و مقدمه)
    # =========================================================================
    story.append(Paragraph(fa("فهرست مطالب و ساختار راهنما"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#312e81"), spaceAfter=12))

    toc_items = [
        ("فصل ۱: هسته هویتی، ساختار سازمانی و پذیرش سازمان سنجش", "۳"),
        ("فصل ۲: میز خدمات الکترونیک، فرم‌ساز پویا و درخواست‌های دانشجویی", "۵"),
        ("فصل ۳: اتصال به وب‌سرویس‌ها و همانندجویی پایان‌نامه ایرانداک (Service Tasks)", "۷"),
        ("فصل ۴: مدیریت مهلت‌های زمانی (SLA)، نقشه حرارتی و پایش گلوگاه‌های اداری", "۹"),
        ("فصل ۵: ماتریس پویای سطوح دسترسی و تفکیک وظایف (Dynamic RBAC)", "۱۱"),
        ("فصل ۶: سامانه آموزش مجازی و وبینار (BigBlueButton & Moodle SSO)", "۱۳"),
        ("فصل ۷: داشبوردهای زنده مدیریتی، گزارش‌های مقایسه‌ای و خودارزیابی پرسنل", "۱۵"),
        ("فصل ۸: راهنمای حساب‌های نمونه و سوالات متداول (FAQ)", "۱۷"),
    ]
    toc_data = [[Paragraph(fa(p), table_cell_style), Paragraph(fa(t), table_cell_style)] for t, p in toc_items]
    toc_table = Table(toc_data, colWidths=[50, 460])
    toc_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    story.append(toc_table)
    story.append(Spacer(1, 15))

    story.append(Paragraph(fa("مقدمه و هدف سامانه"), h2_style))
    story.append(Paragraph(fa("سامانه جامع دانشگاهی آفاق (Afagh Academic ERP) یک اکوسیستم پیشرفته نسل جدید جهت مدیریت یکپارچه کلیه فرآیندهای آموزشی، مالی، پذیرش، گردش کار الکترونیک (BPM) و هوش تجاری دانشگاه است. این راهنما به منظور آموزش گام‌به‌گام پرسنل اداری، مدیران گروه‌ها، اساتید و دانشجویان تدوین گردیده است."), body_style))

    story.append(PageBreak())

    # =========================================================================
    # 3. CHAPTER 1: CORE IDENTITY & SANJESH ADMISSIONS
    # =========================================================================
    story.append(Paragraph(fa("فصل ۱: هسته هویتی، ساختار سازمانی و پذیرش سازمان سنجش"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=10))

    story.append(Paragraph(fa("۱.۱. زیرسیستم پردازش فایل سنجش و صف Staging"), h2_style))
    story.append(Paragraph(fa("در آغاز هر سال تحصیلی، اطلاعات داوطلبان پذیرفته‌شده در قالب فایل متنی (TXT/CSV) از سازمان سنجش وارد سامانه می‌شود. سیستم با استفاده از جدول واسط admissions_staging رکوردهای خام را ذخیره و بر اساس جدول sanjesh_mappings کدهای رشته و سهمیه سنجش را با ساختار دانشگاه تطبیق می‌دهد:"), body_style))

    story.append(Paragraph(fa("• رکوردهای سبز (RESOLVED): کدهایی که دارای نگاشت معتبر در سیستم هستند و آماده ثبت‌نام فوری می‌باشند."), bullet_style))
    story.append(Paragraph(fa("• رکوردهای قرمز (PENDING_MAPPING): کدهایی که رشته آنها در دانشگاه تعریف نشده و نیازمند نگاشت توسط کارشناس می‌باشند."), bullet_style))
    story.append(Paragraph(fa("• دکمه ثبت‌نام دسته‌جمعی (Batch Import): صدور همزمان حساب کاربری، ایجاد پرونده و تخصیص شماره دانشجویی پویا."), bullet_style))

    story.append(Spacer(1, 6))
    if os.path.exists("docs/images/screenshot_4_sanjesh_formula.png"):
        story.append(RLImage("docs/images/screenshot_4_sanjesh_formula.png", width=490, height=265))
        story.append(Spacer(1, 8))

    story.append(Paragraph(fa("۱.۲. موتور فرمول‌ساز پویای شماره دانشجویی (Dynamic ID Generator)"), h2_style))
    story.append(Paragraph(fa("شماره دانشجویی در آفاق بر اساس فرمول‌های قابل تنظیم per مقطع تحصیلی تولید می‌شود. متغیرهای کلیدی فرمول عبارتند از:"), body_style))
    story.append(Paragraph(fa("• {Year:2}: دو رقم آخر سال ورود (مثلاً 05 برای ورودی ۱۴۰۵)."), bullet_style))
    story.append(Paragraph(fa("• {DegreeCode:1}: کد تک‌رقمی مقطع (۱=کارشناسی، ۲=ارشد، ۳=دکتری)."), bullet_style))
    story.append(Paragraph(fa("• {MajorCode:3}: کد سه‌رقمی گروه تخصصی و رشته (مثلاً ۴۱۲ برای مهندسی کامپیوتر)."), bullet_style))
    story.append(Paragraph(fa("• {Seq:3}: شماره شمارنده ترتیبی هوشمند که به ازای هر دانشجو ۱ واحد افزایش می‌یابد (مثلاً 015)."), bullet_style))
    story.append(Paragraph(fa("مثال خروجی فرمول: 05 + 1 + 412 + 015 -> شماره دانشجویی نهایی: 051412015."), body_style))

    story.append(PageBreak())

    # =========================================================================
    # 4. CHAPTER 2: E-REQUESTS & DYNAMIC FORM BUILDER
    # =========================================================================
    story.append(Paragraph(fa("فصل ۲: میز خدمات الکترونیک و درخواست‌های دانشجویی"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=10))

    story.append(Paragraph(fa("۲.۱. گواهی اشتغال به تحصیل هوشمند و بارکد رهگیری امن"), h2_style))
    story.append(Paragraph(fa("دانشجویان از طریق پورتال /student/requests می‌توانند به صورت آنی درخواست گواهی اشتغال به تحصیل ثبت نمایند. سامانه با اجرای گام اعتبارسنجی خودکار (Auto-Check):"), body_style))
    story.append(Paragraph(fa("۱. وضعیت ثبت‌نام قطعی دروس در نیمسال جاری را بررسی می‌کند."), bullet_style))
    story.append(Paragraph(fa("۲. تراز مالی شهریه دانشجو را استعلام می‌نماید (عدم وجود بدهی)."), bullet_style))
    story.append(Paragraph(fa("۳. در صورت احراز شرایط، سند رسمی گواهی با امضای دیجیتال و بارکد امنیتی SHA-256 بلافاصله صادر شده و آماده چاپ می‌گردد."), bullet_style))

    story.append(Spacer(1, 6))
    if os.path.exists("docs/images/screenshot_2_student_requests.png"):
        story.append(RLImage("docs/images/screenshot_2_student_requests.png", width=490, height=265))
        story.append(Spacer(1, 8))

    story.append(Paragraph(fa("۲.۲. تطبیق واحد و تسویه حساب موازی پنج‌گانه"), h2_style))
    story.append(Paragraph(fa("• فرآیند تطبیق واحد: پس از تایید انطباق سرفصل توسط مدیر گروه و آموزش کل، نمره درس تطبیق‌یافته مستقیماً در کارنامه تحصیلی دانشجو درج می‌گردد."), body_style))
    story.append(Paragraph(fa("• تسویه حساب موازی فارغ‌التحصیلی (Parallel Gateway): استعلام همزمان و موازی از ۵ بخش: امور مالی (بدهی=۰)، کتابخانه (امانت=۰)، صندوق رفاه (تسویه وام)، آزمایشگاه و خوابگاه. پس از تایید همه واحدها، گواهی موقت صادر می‌شود."), body_style))

    story.append(PageBreak())

    # =========================================================================
    # 5. CHAPTER 3: IRANDOC PLAGIARISM & SERVICE TASKS
    # =========================================================================
    story.append(Paragraph(fa("فصل ۳: اتصال به وب‌سرویس‌ها و همانندجویی پایان‌نامه ایرانداک"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=10))

    story.append(Paragraph(fa("۳.۱. معماری وظایف خودکار سیستمی (Service Tasks)"), h2_style))
    story.append(Paragraph(fa("در موتور گردش کار آفاق، مراحلی که نیاز به دخالت انسانی ندارند به عنوان Service Task تعریف می‌شوند. در درخواست صحافی و مجوز دفاع پایان‌نامه ارشد، سیستم مستقیماً به API سامانه همانندجوی ایرانداک متصل می‌گردد:"), body_style))

    if os.path.exists("docs/images/screenshot_3_irandoc_api.png"):
        story.append(RLImage("docs/images/screenshot_3_irandoc_api.png", width=490, height=265))
        story.append(Spacer(1, 8))

    story.append(Paragraph(fa("۳.۲. موتور تصمیم‌گیری سقف سرقت ادبی (Rule Engine & Resilience)"), h2_style))
    story.append(Paragraph(fa("• اگر درصد مشابهت <= ۲۰٪ (مثلاً ۱۴.۲٪): سامانه به صورت خودکار پرونده را تایید کرده، فایل گواهی اصالت را ضمیمه می‌نماید و پرونده را به مرحله تعیین هیئت داوران هدایت می‌کند."), bullet_style))
    story.append(Paragraph(fa("• اگر درصد مشابهت > ۲۰٪ (مثلاً ۲۸.۵٪): گردش کار متوقف شده و با صدور اخطار سیستمی، پرونده جهت بازنویسی و کاهش تشابه به دانشجو بازگردانده می‌شود."), bullet_style))
    story.append(Paragraph(fa("• قابلیت اطمینان (Resilience): مکانیزم تلاش مجدد تصاعدی (Exponential Backoff)، قطع‌کننده مدار (Circuit Breaker) و ثبت ثانیه‌ای لاگ ممیزی API."), bullet_style))

    story.append(PageBreak())

    # =========================================================================
    # 6. CHAPTER 4: SLA MANAGEMENT & BOTTLENECK DETECTION
    # =========================================================================
    story.append(Paragraph(fa("فصل ۴: مدیریت مهلت‌های زمانی (SLA) و پایش گلوگاه‌های اداری"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=10))

    story.append(Paragraph(fa("۴.۱. کنترل ضرب‌الاجل‌ها و اقدامات انقضا (Timeout Actions)"), h2_style))
    story.append(Paragraph(fa("برای هر گام از فرآیند، سقف مجاز زمانی (slaHours) تعریف شده است. در صورت عدم اقدام کارشناس در مهلت مقرر، سیستم یکی از ۴ قانون زیر را اجرا می‌کند:"), body_style))
    story.append(Paragraph(fa("۱. ارجاع خودکار (Escalation): ارجاع پرونده به مدیر بالاتر (مثلاً از کارشناس به مدیر گروه یا معاونت)."), bullet_style))
    story.append(Paragraph(fa("۲. تأیید خودکار (Auto-Approve): عبور خودکار از گام به نفع دانشجو جهت تسریع امور اداری."), bullet_style))
    story.append(Paragraph(fa("۳. رد خودکار (Auto-Reject): بسته‌شدن پرونده در صورت عدم ارائه مستندات توسط متقاضی."), bullet_style))
    story.append(Paragraph(fa("۴. ارسال هشدار مکرر (Notify): ارسال پیامک و اعلان به مسئول پرونده."), bullet_style))

    if os.path.exists("docs/images/screenshot_1_dashboard_ops.png"):
        story.append(RLImage("docs/images/screenshot_1_dashboard_ops.png", width=490, height=265))
        story.append(Spacer(1, 8))

    story.append(Paragraph(fa("۴.۲. نقشه حرارتی مراحل و صف‌های اداری (Process Heatmap)"), h2_style))
    story.append(Paragraph(fa("در تب تحلیلی کارتابل، وضعیت مراحل به صورت تفکیک رنگی سبز (روان)، زرد (در آستانه انقضا) و قرمز (گلوگاه اداری) نمایش داده می‌شود تا مدیران دانشگاه بلافاصله گلوگاه‌های معطل‌کننده را شناسایی نمایند."), body_style))

    story.append(PageBreak())

    # =========================================================================
    # 7. CHAPTER 5: DYNAMIC RBAC & VIRTUAL LMS CLASSROOMS
    # =========================================================================
    story.append(Paragraph(fa("فصل ۵: ماتریس دسترسی‌ها (RBAC) و آموزش مجازی (BBB)"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=10))

    story.append(Paragraph(fa("۵.۱. ماتریس پویای سطوح دسترسی و تفکیک وظایف (Segregation of Duties)"), h2_style))
    story.append(Paragraph(fa("در پنل /admin/permissions، دسترسی‌ها به صورت ماتریسی مدیریت می‌شوند. طبق استاندارد تفکیک وظایف:"), body_style))
    story.append(Paragraph(fa("• کارشناس پذیرش (REGISTRATION_STAFF): دسترسی کامل به مدارک و پرونده اولیه بدون امکان دسترسی به تراز مالی و حقوق."), bullet_style))
    story.append(Paragraph(fa("• کارشناس مالی (FINANCE_EXPERT): تایید شهریه و مساعده بدون دسترسی به تغییر نمرات و سرفصل‌ها."), bullet_style))

    if os.path.exists("docs/images/screenshot_5_rbac_matrix.png"):
        story.append(RLImage("docs/images/screenshot_5_rbac_matrix.png", width=490, height=240))
        story.append(Spacer(1, 8))

    story.append(Paragraph(fa("۵.۲. اتصال یکپارچه بیگ‌بلوباتن و مودل (BigBlueButton Web Conferencing)"), h2_style))
    story.append(Paragraph(fa("در پنل /student/virtual-classes و داشبورد استاد، کلاس‌های آنلاین با یک کلیک و بدون نیاز به ورود نام کاربری/رمز مجدد (1-Click SSO) از طریق محاسبه هش امنیتی SHA-1 اجرا می‌شوند."), body_style))

    if os.path.exists("docs/images/screenshot_6_virtual_classroom.png"):
        story.append(RLImage("docs/images/screenshot_6_virtual_classroom.png", width=490, height=240))
        story.append(Spacer(1, 8))

    story.append(PageBreak())

    # =========================================================================
    # 8. CHAPTER 6: EXECUTIVE DASHBOARD & FAQ
    # =========================================================================
    story.append(Paragraph(fa("فصل ۶: کارنامه خودارزیابی پرسنل، حساب‌های نمونه و سوالات متداول"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=10))

    story.append(Paragraph(fa("۶.۱. حساب‌های کاربری پیش‌فرض جهت تست و ورود (کلمه عبور همه: 123456)"), h2_style))

    accounts_data = [
        [Paragraph(fa("نقش کاربری"), table_header_style), Paragraph(fa("نام کاربری / کد ملی"), table_header_style), Paragraph(fa("دسترسی‌ها و اختیارات"), table_header_style)],
        [Paragraph(fa("مدیر ارشد سیستم (Admin)"), table_cell_style), Paragraph(fa("0000000001"), table_cell_style), Paragraph(fa("دسترسی کامل، طراح فرآیندها، RBAC و پایش زنده"), table_cell_style)],
        [Paragraph(fa("استاد و عضو هیئت علمی"), table_cell_style), Paragraph(fa("0011111111"), table_cell_style), Paragraph(fa("کلاس مجازی، ثبت نمرات، خودارزیابی و قرارداد"), table_cell_style)],
        [Paragraph(fa("دانشجو (پورتال خدمات)"), table_cell_style), Paragraph(fa("31412001 (یا 1010101010)"), table_cell_style), Paragraph(fa("ثبت درخواست‌ها، گواهی اشتغال، کارنامه و LMS"), table_cell_style)],
        [Paragraph(fa("کارشناس آموزش کل"), table_cell_style), Paragraph(fa("0055555555"), table_cell_style), Paragraph(fa("بررسی پرونده‌ها، پذیرش سنجش و شورای آموزشی"), table_cell_style)],
        [Paragraph(fa("کارشناس امور مالی"), table_cell_style), Paragraph(fa("0077777777"), table_cell_style), Paragraph(fa("تسویه شهریه، تایید مساعده و حقوق اساتید"), table_cell_style)],
    ]
    acc_table = Table(accounts_data, colWidths=[120, 130, 260])
    acc_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e1b4b")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#94a3b8")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(acc_table)
    story.append(Spacer(1, 15))

    story.append(Paragraph(fa("۶.۲. سوالات متداول (FAQ) و نکات راهبری"), h2_style))
    story.append(Paragraph(fa("<b>پرسش:</b> اگر سرویس ایرانداک یا ثبت احوال قطع شود، پرونده دانشجو چه می‌شود؟<br/><b>پاسخ:</b> به لطف مکانیزم Circuit Breaker، سیستم پس از ۳ بار تلاش ناموفق، پرونده را به عنوان Fallback به کارتابل کارشناس آموزش تحصیلات تکمیلی ارجاع می‌دهد تا استعلام دستی انجام گیرد."), body_style))
    story.append(Paragraph(fa("<b>پرسش:</b> چگونه شماره دانشجویی ورودی‌های جدید تغییر می‌کند؟<br/><b>پاسخ:</b> در منوی «پذیرش سنجش و فرمول‌ساز» الگوی فرمول را بدون نیاز به کدنویسی ویرایش کرده و ذخیره نمایید."), body_style))
    story.append(Paragraph(fa("<b>پرسش:</b> گواهی صادرشده چگونه در مراجع خارجی اعتبارسنجی می‌شود؟<br/><b>پاسخ:</b> مراجع با اسکن بارکد QR یا ورود کد رهگیری در سامانه /verify به صورت برخط تاییدیه وزارت علوم و دانشگاه آفاق را مشاهده می‌کنند."), body_style))

    # Build Document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"User manual generated successfully at: {pdf_path}")

if __name__ == "__main__":
    create_manual()
