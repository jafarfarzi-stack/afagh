import os
import sys
import arabic_reshaper
from bidi.algorithm import get_display

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage, PageBreak, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

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
        confidential = fa("نسخه جامع سازمانی — کلیه حقوق محفوظ است")
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

    title_style = ParagraphStyle(
        "CoverTitle",
        fontName="DejaVu-Bold",
        fontSize=20,
        leading=28,
        alignment=1,
        textColor=colors.HexColor("#0f172a")
    )

    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        fontName="DejaVu",
        fontSize=11,
        leading=17,
        alignment=1,
        textColor=colors.HexColor("#334155")
    )

    h1_style = ParagraphStyle(
        "Heading1_Fa",
        fontName="DejaVu-Bold",
        fontSize=14,
        leading=20,
        alignment=2,
        textColor=colors.HexColor("#1e1b4b"),
        spaceAfter=6,
        spaceBefore=12
    )

    h2_style = ParagraphStyle(
        "Heading2_Fa",
        fontName="DejaVu-Bold",
        fontSize=11,
        leading=16,
        alignment=2,
        textColor=colors.HexColor("#312e81"),
        spaceAfter=5,
        spaceBefore=8
    )

    body_style = ParagraphStyle(
        "Body_Fa",
        fontName="DejaVu",
        fontSize=9,
        leading=14.5,
        alignment=2,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=5
    )

    bullet_style = ParagraphStyle(
        "Bullet_Fa",
        fontName="DejaVu",
        fontSize=8.5,
        leading=13.5,
        alignment=2,
        textColor=colors.HexColor("#334155"),
        spaceAfter=2.5
    )

    table_header_style = ParagraphStyle(
        "TH_Fa",
        fontName="DejaVu-Bold",
        fontSize=8.5,
        leading=11,
        alignment=1,
        textColor=colors.HexColor("#ffffff")
    )

    table_cell_style = ParagraphStyle(
        "TD_Fa",
        fontName="DejaVu",
        fontSize=8,
        leading=11,
        alignment=2,
        textColor=colors.HexColor("#0f172a")
    )

    story = []

    # =========================================================================
    # 1. COVER PAGE (صفحه جلد)
    # =========================================================================
    story.append(Spacer(1, 35))
    story.append(Paragraph(fa("جمهوری اسلامی ایران — وزارت علوم، تحقیقات و فناوری"), subtitle_style))
    story.append(Paragraph(fa("دانشگاه جامع آفاق"), ParagraphStyle("UnivName", fontName="DejaVu-Bold", fontSize=18, leading=24, alignment=1, textColor=colors.HexColor("#1e3a8a"))))
    story.append(Spacer(1, 25))

    crest_data = [[Paragraph(fa("آفاق<br/><font size=7>AFAGH ENTERPRISE ERP</font>"), ParagraphStyle("Crest", fontName="DejaVu-Bold", fontSize=18, leading=20, alignment=1, textColor=colors.HexColor("#1e1b4b")))]]
    crest_table = Table(crest_data, colWidths=[120], rowHeights=[80])
    crest_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#e0e7ff")),
        ('BOX', (0,0), (-1,-1), 2.5, colors.HexColor("#3730a3")),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(crest_table)
    story.append(Spacer(1, 25))

    story.append(Paragraph(fa("راهنمای جامع کاربری و راهبری سامانه یکپارچه آفاق"), title_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph(fa("راهنمای کامل عملیاتی برای اساتید، دانشجویان، مدیران گروه و کارشناسان آموزشی شامل ماژول‌های اساتید، برنامه‌ریزی درسی، انتخاب واحد، کارنامه رسمی، پذیرش سنجش، موتور گردش کار پویا (BPM)، استعلام ایرانداک و پایش SLA"), subtitle_style))
    story.append(Spacer(1, 30))

    meta_data = [
        [Paragraph(fa("نسخه مستند:"), table_cell_style), Paragraph(fa("۲.۰ (ویرایش جامع سازمانی ۱۴۰۵)"), table_cell_style)],
        [Paragraph(fa("مخاطبان هدف:"), table_cell_style), Paragraph(fa("اساتید و هیئت علمی، دانشجویان، مدیران گروه‌های آموزشی، کارشناسان آموزش و مالی"), table_cell_style)],
        [Paragraph(fa("معماری فنی:"), table_cell_style), Paragraph(fa("Next.js 14 App Router + PostgreSQL + Redis + Drizzle ORM"), table_cell_style)],
        [Paragraph(fa("تاریخ انتشار:"), table_cell_style), Paragraph(fa("شهریور ۱۴۰۵ / سپتامبر ۲۰۲۶"), table_cell_style)],
    ]
    meta_table = Table(meta_data, colWidths=[120, 320])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(meta_table)

    story.append(PageBreak())

    # =========================================================================
    # 2. TABLE OF CONTENTS
    # =========================================================================
    story.append(Paragraph(fa("فهرست فصول و راهنمای تفصیلی"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#312e81"), spaceAfter=10))

    toc_items = [
        ("فصل ۱: راهنمای اساتید و اعضای هیئت علمی (حضور و غیاب، قرارداد، بارم‌بندی و ثبت نمرات)", "۳"),
        ("فصل ۲: برنامه‌ریزی درسی، چارت سرفصل و چیدمان ضدتقلب آزمون‌ها", "۵"),
        ("فصل ۳: پورتال تحصیلی دانشجو (انتخاب واحد با Redis، کارنامه رسمی و کارت آزمون)", "۷"),
        ("فصل ۴: میز خدمات الکترونیک و درخواست‌های دانشجویی (BPM و تسویه حساب موازی)", "۹"),
        ("فصل ۵: اتصال به وب‌سرویس‌ها و همانندجویی پایان‌نامه ایرانداک (Service Tasks)", "۱۱"),
        ("فصل ۶: مدیریت مهلت‌های زمانی (SLA)، نقشه حرارتی و پایش گلوگاه‌های اداری", "۱۳"),
        ("فصل ۷: هسته هویتی، پذیرش سازمان سنجش و فرمول‌ساز شماره دانشجویی", "۱۵"),
        ("فصل ۸: ماتریس پویای سطوح دسترسی (RBAC) و آموزش مجازی (BigBlueButton)", "۱۷"),
        ("فصل ۹: داشبوردهای زنده مدیریتی، گزارش‌های مقایسه‌ای و خودارزیابی پرسنل", "۱۹"),
        ("فصل ۱۰: جدول حساب‌های کاربری نمونه دمو و راهنمای رفع اشکال (FAQ)", "۲۱"),
    ]
    toc_data = [[Paragraph(fa(p), table_cell_style), Paragraph(fa(t), table_cell_style)] for t, p in toc_items]
    toc_table = Table(toc_data, colWidths=[40, 470])
    toc_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    story.append(toc_table)
    story.append(Spacer(1, 10))

    story.append(PageBreak())

    # =========================================================================
    # 3. CHAPTER 1: PROFESSOR PORTAL & ACADEMIC MANAGEMENT
    # =========================================================================
    story.append(Paragraph(fa("فصل ۱: راهنمای اساتید و اعضای هیئت علمی"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=8))

    story.append(Paragraph(fa("۱.۱. اعلام ساعات حضور ترم و ترجیحات تدریس (/professor/availability)"), h2_style))
    story.append(Paragraph(fa("اساتید پیش از آغاز برنامه‌ریزی ترم، روزها و بازه‌های زمانی مجاز خود را در تقویم هفتگی انتخاب می‌کنند تا سیستم برنامه‌ریزی مدیر گروه از تخصیص کلاس در ساعات تداخل جلوگیری نماید."), body_style))

    story.append(Paragraph(fa("۱.۲. حضور و غیاب ۱۶ جلسه‌ای و تطبیق هوشمند گیت ورود (/professor/attendance)"), h2_style))
    story.append(Paragraph(fa("• ثبت لیست حضور دانشجو: محاسبه خودکار غیبت‌های مجاز (حداکثر ۳/۱۶). دانشجویانی با بیش از ۳ غیبت به صورت خودکار به وضعیت «محروم از آزمون» تغییر وضعیت می‌یابند."), bullet_style))
    story.append(Paragraph(fa("• ثبت حضور ضمنی (Implicit Attendance): لاگین استاد در کامپیوتر کلاسی پای تخته یا گیت بیومتریک ورود دانشگاه به عنوان حضور معتبر ثبت شده و کسر کارکرد حقوق نخواهد داشت."), bullet_style))
    story.append(Paragraph(fa("• زنجیره کلاس‌های متوالی (Chain Matching): در کلاس‌های پشت‌سرهم (مثل ۰۸:۰۰-۱۰:۰۰ و ۱۰:۰۰-۱۲:۰۰)، ثبت حضور کلاس اول به صورت خودکار برای کلاس دوم اعمال می‌شود."), bullet_style))

    if os.path.exists("docs/images/screenshot_7_professor_portal.png"):
        story.append(RLImage("docs/images/screenshot_7_professor_portal.png", width=490, height=240))
        story.append(Spacer(1, 6))

    story.append(Paragraph(fa("۱.۳. قرارداد حق‌التدریس و بارم‌بندی نمرات با رمز یکبارمصرف OTP"), h2_style))
    story.append(Paragraph(fa("• قرارداد الکترونیک ۲FA: احکام تدریس با کسر ۱۰٪ مالیات تکلیفی و بیمه روزانه تامین اجتماعی محاسبه و با پیامک OTP امضا می‌شود."), body_style))
    story.append(Paragraph(fa("• قفل نمرات و ارسال رمز پیامکی: اساتید پس از بارم‌بندی نمرات میان‌ترم و پایانی، با دریافت رمز یکبارمصرف (OTP) نمرات را نهایی می‌کنند. مهلت قانونی نهایی‌سازی ۴۸ ساعت پس از آزمون است."), body_style))

    story.append(PageBreak())

    # =========================================================================
    # 4. CHAPTER 2: CURRICULUM PLANNING & EXAM ENGINE & REGULATIONS
    # =========================================================================
    story.append(Paragraph(fa("فصل ۲: برنامه‌ریزی درسی، چارت سرفصل و مرکز مدیریت آیین‌نامه‌ها"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=8))

    story.append(Paragraph(fa("۲.۱. کاتالوگ دروس و چارت سرفصل‌ها (/admin/curriculum)"), h2_style))
    story.append(Paragraph(fa("تعریف واحدهای نظری و عملی، تعیین پیش‌نیازها و هم‌نیازها، تفکیک دروس توصیفی (Pass/Fail) از دروس نمره‌دار عددی (۰ تا ۲۰) و کنترل ضرایب در معدل کل."), body_style))

    story.append(Paragraph(fa("۲.۲. مرکز مدیریت آیین‌نامه‌ها و قوانین آموزشی (/admin/regulations)"), h2_style))
    story.append(Paragraph(fa("• موتور آیین‌نامه‌ها (No-Code Regulation Engine): تنظیم داینامیک قوانین سنوات، مشروطی، سقف واحد ترم عادی و تابستان، سهمیه شاهد و حذف نمرات ردی پس از قبولی (EXCLUDE_IF_PASSED)."), bullet_style))
    story.append(Paragraph(fa("• اتصال هوشمند به سامانه سجاد و کمیسیون موارد خاص: مسدودسازی خودکار حساب دانشجوی دارای مشروطی یا سنوات بیش از حد و ایجاد پرونده دادخواست استعلام سجاد."), bullet_style))
    story.append(Paragraph(fa("• شبیه‌ساز و تست زنده قوانین (Regulation Sandbox): اعتبارسنجی بلادرنگ تصمیمات سیستم برای سناریوهای مختلف دانشجویان."), bullet_style))

    if os.path.exists("docs/images/screenshot_10_regulations_control_center.png"):
        story.append(RLImage("docs/images/screenshot_10_regulations_control_center.png", width=490, height=240))
        story.append(Spacer(1, 6))

    story.append(Paragraph(fa("۲.۳. برنامه‌ریزی هفتگی مدیر گروه و چیدمان ضدتقلب امتحانات (/admin/scheduling & /admin/exams)"), h2_style))
    story.append(Paragraph(fa("• ماتریس هوشمند تطبیق ساعات اساتید با اتاق‌ها و حل تداخل فضا و زمان."), bullet_style))
    story.append(Paragraph(fa("• چیدمان شطرنجی و ضدتقلب صندلی‌های آزمون و سد قرنطینه تجمیعی مخزن اوراق امتحانات."), bullet_style))

    if os.path.exists("docs/images/screenshot_8_curriculum_scheduling.png"):
        story.append(RLImage("docs/images/screenshot_8_curriculum_scheduling.png", width=490, height=220))
        story.append(Spacer(1, 6))

    story.append(PageBreak())

    # =========================================================================
    # 5. CHAPTER 3: STUDENT PORTAL (ENROLLMENT & TRANSCRIPT)
    # =========================================================================
    story.append(Paragraph(fa("فصل ۳: پورتال تحصیلی دانشجو (انتخاب واحد و کارنامه کل)"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=8))

    story.append(Paragraph(fa("۳.۱. سامانه انتخاب واحد هوشمند با اتاق انتظار Redis (§۶۹۰۶)"), h2_style))
    story.append(Paragraph(fa("در بازه ثبت‌نام، با مدیریت صف در حافظه Redis، ثبت قطعی بدون قفل دیتابیس انجام می‌شود. سیستم همزمان پیش‌نیازها، سقف واحد (۱۲ تا ۲۰ واحد، ۲۴ واحد برای معدل الف) و تداخل ساعات کلاسی و امتحانی را کنترل می‌کند."), body_style))

    if os.path.exists("docs/images/screenshot_9_student_enroll_transcript.png"):
        story.append(RLImage("docs/images/screenshot_9_student_enroll_transcript.png", width=490, height=240))
        story.append(Spacer(1, 6))

    story.append(Paragraph(fa("۳.۲. کارنامه کل تحصیلی با استناد به مصوبات آیین‌نامه (/student)"), h2_style))
    story.append(Paragraph(fa("• محاسبه معدل کل (GPA) با تفکیک دروس توصیفی (عدم ورود به مخرج معدل)."), bullet_style))
    story.append(Paragraph(fa("• اعمال مصوبه حذف نمره مردودی پس از قبولی (EXCLUDE_IF_PASSED مصوب ۱۳۹۶ به بعد)."), bullet_style))
    story.append(Paragraph(fa("• سند رسمی کارنامه چاپی شامل سربرگ وزارت علوم، مشخصات سجلی، ریزنمرات نیمسال‌ها و محل مهر اداره آموزش."), bullet_style))

    story.append(PageBreak())

    # =========================================================================
    # 6. CHAPTER 4: E-REQUESTS & WORKFLOW (BPM)
    # =========================================================================
    story.append(Paragraph(fa("فصل ۴: میز خدمات الکترونیک و درخواست‌های دانشجویی (BPM)"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=8))

    story.append(Paragraph(fa("۴.۱. گواهی اشتغال به تحصیل هوشمند و بارکد امنیتی"), h2_style))
    story.append(Paragraph(fa("بررسی خودکار (Auto-Check) ثبت‌نام فعال ترم و عدم بدهی شهریه؛ در صورت احراز شرایط، صدور آنی سند رسمی PDF دارای بارکد QR و امضای دیجیتال بدون نیاز به مراجعه حضوری."), body_style))

    if os.path.exists("docs/images/screenshot_2_student_requests.png"):
        story.append(RLImage("docs/images/screenshot_2_student_requests.png", width=490, height=240))
        story.append(Spacer(1, 6))

    story.append(Paragraph(fa("۴.۲. تطبیق واحد و تسویه حساب موازی پنج‌گانه"), h2_style))
    story.append(Paragraph(fa("• تطبیق واحد: ثبت مستقیم نمره درس تاییدشده در کارنامه دانشجو."), bullet_style))
    story.append(Paragraph(fa("• تسویه حساب موازی (Parallel Gateway): استعلام و تایید همزمان ۵ بخش (امور مالی، کتابخانه، رفاه، کارگاه، خوابگاه) جهت صدور دانشنامه."), bullet_style))

    story.append(PageBreak())

    # =========================================================================
    # 7. CHAPTER 5: IRANDOC & SERVICE TASKS
    # =========================================================================
    story.append(Paragraph(fa("فصل ۵: اتصال به وب‌سرویس‌ها و همانندجویی پایان‌نامه ایرانداک"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=8))

    story.append(Paragraph(fa("۵.۱. استعلام خودکار API ایرانداک و Rule Engine"), h2_style))
    story.append(Paragraph(fa("درخواست مجوز دفاع و صحافی پایان‌نامه با فراخوانی خودکار وب‌سرویس ایرانداک ارزیابی می‌شود:"), body_style))
    story.append(Paragraph(fa("• تشابه <= ۲۰٪: تایید خودکار سیستمی، الصاق گواهی اصالت و انتقال به تعیین داوران."), bullet_style))
    story.append(Paragraph(fa("• تشابه > ۲۰٪: توقف گردش کار و اخطار بازنویسی متن به دانشجو."), bullet_style))

    if os.path.exists("docs/images/screenshot_3_irandoc_api.png"):
        story.append(RLImage("docs/images/screenshot_3_irandoc_api.png", width=490, height=240))
        story.append(Spacer(1, 6))

    story.append(Paragraph(fa("۵.۲. تاب‌آوری، مکانیزم تلاش مجدد و لاگ ممیزی API"), h2_style))
    story.append(Paragraph(fa("ثبت لاگ کامل تراکنش‌ها در جدول api_audit_logs به همراه مکانیزم Exponential Backoff و Circuit Breaker جهت پایداری اتصال."), body_style))

    story.append(PageBreak())

    # =========================================================================
    # 8. CHAPTER 6: SLA MANAGEMENT & BOTTLENECK DETECTION
    # =========================================================================
    story.append(Paragraph(fa("فصل ۶: مدیریت مهلت‌های زمانی (SLA) و پایش گلوگاه‌های اداری"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=8))

    story.append(Paragraph(fa("۶.۱. کنترل ضرب‌الاجل‌ها و اکشن‌های انقضا (Timeout Actions)"), h2_style))
    story.append(Paragraph(fa("تعریف سقف زمانی مجاز (slaHours) per مرحله: ارجاع خودکار به مقام بالاتر (Escalate)، تایید خودکار (Auto-Approve) یا رد خودکار."), body_style))

    if os.path.exists("docs/images/screenshot_1_dashboard_ops.png"):
        story.append(RLImage("docs/images/screenshot_1_dashboard_ops.png", width=490, height=240))
        story.append(Spacer(1, 6))

    story.append(Paragraph(fa("۶.۲. نقشه حرارتی مراحل و صف‌های اداری (Process Heatmap)"), h2_style))
    story.append(Paragraph(fa("پایش تفکیک رنگی مراحل به روان (سبز)، هشدار تاخیر (زرد) و گلوگاه حاد اداری (قرمز)."), body_style))

    story.append(PageBreak())

    # =========================================================================
    # 9. CHAPTER 7: SANJESH ADMISSIONS & DYNAMIC ID FORMULA
    # =========================================================================
    story.append(Paragraph(fa("فصل ۷: پذیرش سازمان سنجش و فرمول‌ساز شماره دانشجویی"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=8))

    story.append(Paragraph(fa("۷.۱. پردازش فایل متنی سنجش و صف بازبینی Staging"), h2_style))
    story.append(Paragraph(fa("بارگذاری خطوط TXT/CSV، تطبیق خودکار با جدول sanjesh_mappings و صدور دسته‌جمعی شماره دانشجویی."), body_style))

    if os.path.exists("docs/images/screenshot_4_sanjesh_formula.png"):
        story.append(RLImage("docs/images/screenshot_4_sanjesh_formula.png", width=490, height=240))
        story.append(Spacer(1, 6))

    story.append(Paragraph(fa("۷.۲. فرمول‌ساز پویای شماره دانشجویی بر پایه توکن‌ها"), h2_style))
    story.append(Paragraph(fa("الگوی فرمول بر اساس {Year:2}{DegreeCode:1}{MajorCode:3}{Seq:3} بدون هاردکد در سیستم (خروجی نمونه: 051412015)."), body_style))

    story.append(PageBreak())

    # =========================================================================
    # 10. CHAPTER 8: DYNAMIC RBAC & VIRTUAL LMS
    # =========================================================================
    story.append(Paragraph(fa("فصل ۸: ماتریس دسترسی‌ها (RBAC) و آموزش مجازی (BBB)"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=8))

    story.append(Paragraph(fa("۸.۱. تفکیک وظایف سازمانی (Segregation of Duties)"), h2_style))
    story.append(Paragraph(fa("جداسازی اختیارات کارشناس پذیرش (بدون دسترسی مالی)، کارشناس آموزش و کارشناس مالی."), body_style))

    if os.path.exists("docs/images/screenshot_5_rbac_matrix.png"):
        story.append(RLImage("docs/images/screenshot_5_rbac_matrix.png", width=490, height=220))
        story.append(Spacer(1, 4))

    story.append(Paragraph(fa("۸.۲. سامانه آموزش مجازی بیگ‌بلوباتن و مودل (1-Click SSO)"), h2_style))
    story.append(Paragraph(fa("ورود یک‌کلیکه به وبینار با تفکیک نقش استاد (Moderator) و دانشجو (Attendee) و آرشیو ویدیوهای ضبط‌شده."), body_style))

    if os.path.exists("docs/images/screenshot_6_virtual_classroom.png"):
        story.append(RLImage("docs/images/screenshot_6_virtual_classroom.png", width=490, height=220))
        story.append(Spacer(1, 4))

    story.append(PageBreak())

    # =========================================================================
    # 11. CHAPTER 9 & 10: EXECUTIVE BI & ACCOUNTS FAQ
    # =========================================================================
    story.append(Paragraph(fa("فصل ۹ و ۱۰: داشبوردهای زنده، خودارزیابی پرسنل و حساب‌های نمونه"), h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#312e81"), spaceAfter=8))

    story.append(Paragraph(fa("۹.۱. کارنامه خودارزیابی و عملکرد پرسنل (/professor/performance)"), h2_style))
    story.append(Paragraph(fa("نمایش حجم مختومه‌شده ماه، میانگین زمان اقدام (MTTR)، پایبندی به SLA، رضایت دانشجویان (CSAT) و رتبه‌بندی در دانشکده."), body_style))

    story.append(Paragraph(fa("۱۰.۱. جدول حساب‌های کاربری پیش‌فرض دمو (کلمه عبور همه: 123456)"), h2_style))

    accounts_data = [
        [Paragraph(fa("نقش کاربری"), table_header_style), Paragraph(fa("نام کاربری / کد ملی"), table_header_style), Paragraph(fa("دسترسی‌ها و مسئولیت‌ها"), table_header_style)],
        [Paragraph(fa("مدیر ارشد سیستم (Admin)"), table_cell_style), Paragraph(fa("0000000001"), table_cell_style), Paragraph(fa("دسترسی کامل، طراح فرآیندها، RBAC و پایش زنده"), table_cell_style)],
        [Paragraph(fa("استاد و عضو هیئت علمی"), table_cell_style), Paragraph(fa("0011111111"), table_cell_style), Paragraph(fa("کلاس مجازی، ثبت نمرات با OTP، حضور ۱۶ جلسه و قرارداد"), table_cell_style)],
        [Paragraph(fa("دانشجو (پورتال خدمات)"), table_cell_style), Paragraph(fa("31412001 (یا 1010101010)"), table_cell_style), Paragraph(fa("انتخاب واحد با Redis، گواهی اشتغال، کارنامه کل رسمی و LMS"), table_cell_style)],
        [Paragraph(fa("کارشناس آموزش کل"), table_cell_style), Paragraph(fa("0055555555"), table_cell_style), Paragraph(fa("بررسی پرونده‌ها، پذیرش سنجش و شورای آموزشی"), table_cell_style)],
        [Paragraph(fa("کارشناس امور مالی"), table_cell_style), Paragraph(fa("0077777777"), table_cell_style), Paragraph(fa("تسویه شهریه، تایید مساعده و حقوق اساتید"), table_cell_style)],
        [Paragraph(fa("مسئول مخزن امتحانات"), table_cell_style), Paragraph(fa("0034343434"), table_cell_style), Paragraph(fa("قرنطینه اوراق و تحویل به استاد و بایگانی"), table_cell_style)],
        [Paragraph(fa("مراقب آزمون"), table_cell_style), Paragraph(fa("0012121212"), table_cell_style), Paragraph(fa("ثبت حضور داوطلبان با اسکن بارکد و صورتجلسه آزمون"), table_cell_style)],
    ]
    acc_table = Table(accounts_data, colWidths=[110, 120, 280])
    acc_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e1b4b")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#94a3b8")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(acc_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Comprehensive User manual generated successfully at: {pdf_path}")

if __name__ == "__main__":
    create_manual()
