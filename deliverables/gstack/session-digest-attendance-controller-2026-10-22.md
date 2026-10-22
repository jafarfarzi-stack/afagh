# دیجست فشردهٔ جلسه — حضور و غیاب + تخصیص اتاق + رفع باگ‌های صفحهٔ انتخاب

**تاریخ:** ۲۰۲۶-۱۰-۲۲ · **شاخه:** `FINAL` · **ریپو:** `D:\afagh` (اپ در `afagh-next/`)
**هدف:** ساختِ نقش «کنترل‌کنندهٔ حضور و غیاب کلاس‌ها»، انتخابِ «چه کسی حضور را ثبت کند» توسط مدیر،
ادغامِ تخصیص اتاق با تخصیص به مدیرگروه، و رفع سه باگِ صفحهٔ انتخابِ کلاس.
**این فایل جای خواندن کل سشن را می‌گیرد.** برای ادامه، فقط همین + فایل هدف کافی است.

---

## ۱) وضعیت فعلی (یک نگاه)

| مورد | مقدار |
|---|---|
| کامیت‌های این جلسه | `9e7b474` (نقش حضور + مهاجرت ۰۱۱۴ + رفع فیلتر/تاریخ) · `f1eeb0c` (مرز دانشگاه + مقاومت + خوانایی) |
| `tsc --noEmit` | تمیز |
| `npm test` | سبز (فایل `professor-calendar-layout` اصلاح شد — از ۷:۰۰ شروع می‌شود) |
| سرور `/root/afagh` | روی `9e7b474a` — **کدِ `f1eeb0c` هنوز دیپلوی نشده** |
| مهاجرت‌های اجرانشده روی DB | تا `0112` — **۰۱۱۳ و ۰۱۱۴ اجرا نشده‌اند** |
| دسترسی SSH | ❌ قطع (Tailscale محلی به coordination server وصل نیست) |
| سایتِ عمومی | ✅ سالم (307 روی `/`، 200 روی `/login`) |

### 🔴 کارِ فوریِ نشستِ بعد (اول این انجام شود)

```bash
# ۱) دیپلویِ کدِ اصلاح‌شده
cd /root/afagh && git fetch origin FINAL && git reset --hard FETCH_HEAD
docker compose up -d --build --no-deps app        # --no-deps اجباری (وگرنه pg/redis ری‌استارت می‌شوند)

# ۲) مهاجرت‌ها — بدون این‌ها نقش ATTENDANCE_CONTROLLER وجود ندارد و
#    «گروه مسئول» و ستون classrooms.departmentId هم موجود نیست
cd /root/afagh && docker compose run --rm app node scripts/migrate-db.mjs
# یا: docker compose exec app node scripts/migrate-db.mjs   (بسته به سرویس)

# ۳) راستی‌آزمایی
docker compose exec -T postgres psql -U afagh -d afagh_db -c \
  "select code from roles where code='ATTENDANCE_CONTROLLER';" \
  -c "select column_name from information_schema.columns where table_name='classrooms' and column_name='departmentId';"
```

بعد از آن: یک کاربر را به نقش `ATTENDANCE_CONTROLLER` بده، اتاق‌ها را در
«تخصیص کارشناس به اتاق‌ها» به او بسپار، و تنظیمِ
«چه کسی حضورِ کلاس را ثبت کند؟» را در `/admin/settings` بررسی کن.

---

## ۲) چه چیزی ساخته شد

### الف) نقش `ATTENDANCE_CONTROLLER` (مهاجرت `0113`)

فقط یک `INSERT` در `roles` — **هیچ جدول/ستونِ تازه‌ای ساخته نشد**. ثبتِ حضور از همان
`professor_class_attendance` استفاده می‌کند، پس موتور حقوق و گزارش‌ها دست‌نخورده می‌مانند:

| ستون | معنا |
|---|---|
| `staffId` | استادی که حضورش ثبت می‌شود (صاحبِ کلاس) |
| `confirmedByStaffId` | کسی که واقعاً ثبت کرد (کنترل‌کننده) |
| `verificationMethod` | `QR_SCAN` (خودِ استاد) یا `QR_BY_CONTROLLER` (کنترل‌کننده) |

### ب) `src/lib/attendance-control.ts` (جدید)

- `getRecorderPolicy()` → `{ mode, professorAllowed, controllerAllowed, roomScoped }`
- `getAttendanceRecorderMode()` → `PROFESSOR | CONTROLLER | BOTH` (مقدار نامعتبر = `BOTH`)
- `canControlRoom(userId, roomId)` → `{ allowed, source }` با زنجیرهٔ
  **اتاق → استثنای درس → دانشکده/دانشگاه → (اگر ROOM_SCOPED خاموش) دانشگاه خودش**
- `listControlledRooms(userId, uniId)` · `listTodaySessionsForRooms(roomIds, jalali)` (دسته‌ای، نه حلقه)
- `resolveClassProfessorStaffId(offeringId)`

### ج) تنظیمات (گروه تازهٔ «حضور و غیاب کلاس‌ها»)

| کلید | نوع | پیش‌فرض | معنا |
|---|---|---|---|
| `ATTENDANCE_RECORDER_MODE` | **select** (تازه) | `BOTH` | `PROFESSOR` / `CONTROLLER` / `BOTH` |
| `ATTENDANCE_CONTROLLER_ROOM_SCOPED` | boolean | `true` | محدود به اتاق‌های تخصیص‌یافته |

> نوع `select` برای تنظیمات اضافه شد: `SettingType` + `options` در `SettingDef`،
> `SettingView.default/options` در `settings-shared.ts`، رندر در `SettingsClient.tsx`،
> و اعتبارسنجی در `saveSettings` (مقدار خارج از فهرست → پیش‌فرض).

### د) کارتابل `/admin/attendance-control` (جدید)

`page.tsx` (سرور) + `AttendanceControlClient.tsx` (کلاینت). کنترل‌کننده جلساتِ امروزِ اتاق‌های خودش
را می‌بیند و بدون رفرشِ صفحه ثبت می‌کند (`recordAttendanceFromConsole`).

### ه) صفحهٔ QR سردر `/p/[code]`

- کارتِ تازهٔ «کنترل حضور و غیاب این اتاق» با شمارشگر «n از m جلسه»
- دکمهٔ ثبت در برنامهٔ هفتگی حالا برای کنترل‌کننده هم می‌آید
- حالتِ «فقط کنترل‌کننده» دکمهٔ «ثبت حضور من» را به استاد نشان نمی‌دهد

### و) «گروه مسئولِ اتاق» (مهاجرت `0114`)

`classrooms.departmentId` (nullable، FK به `departments` با `ON DELETE SET NULL`).
در کارتِ هر اتاق در `/admin/edu-expert-assign` انتخاب‌گرِ «گروه مسئول» + نامِ مدیرگروه
(`departments.headStaffId`) نمایش داده می‌شود. اکشن: `setClassroomDepartmentAction`.

---

## ۳) فایل‌های تغییرکرده / تازه

| فایل | تغییر |
|---|---|
| `drizzle/0113_attendance_controller.sql` | تازه — INSERT نقش |
| `drizzle/0114_classroom_department.sql` | تازه — ستون + FK + ایندکس |
| `drizzle/meta/_journal.json` | idx 118 و 119 |
| `scripts/seed-base.mjs` | نقش در فهرست نصب تازه |
| `src/lib/attendance-control.ts` | **تازه** — کل منطقِ حضور |
| `src/lib/settings.ts` · `settings-shared.ts` | گروه/تنظیم تازه + نوع `select` |
| `src/app/admin/settings/{SettingsClient,page}.tsx` | رندر select |
| `src/app/admin/attendance-control/` | **تازه** — کارتابل |
| `src/app/p/[code]/actions.ts` | بازنویسی: `recordCore` مشترک + `recordAttendanceFromConsole` |
| `src/app/p/[code]/page.tsx` | کارت کنترل‌کننده + دکمه‌های mode-aware |
| `src/lib/auth.ts` | `homeFor` → کنترل‌کننده به `/admin/attendance-control` |
| `src/app/admin/layout.tsx` | `ATTENDANCE_CONTROLLER` در `AREA_ROLES` |
| `src/lib/admin-modules.ts` | ماژول تازه در رجیستری |
| `src/lib/edu-expert.ts` | کاندیدا شامل کنترل‌کننده · `departmentId/headName` · پارامتر `universityId` |
| `src/app/admin/edu-expert-assign/actions.ts` | `listDepartmentsForRoomOwner` · `setClassroomDepartmentAction` · مرز دانشگاه |
| `src/app/admin/edu-expert-assign/EduExpertAssignClient.tsx` | انتخاب‌گر «گروه مسئول» + اصلاحِ عرض سلکت‌ها |
| `src/app/admin/offering-editor/{actions,OfferingEditorClient}.tsx` | `roomExpertUserIds` + تاریخ شمسیِ امتحان |
| `src/app/admin/weekly-board/{page.tsx,FilterSelect.tsx}` | رفع فیلتر دانشکده/گروه |
| `tests/professor-calendar-layout.test.ts` | هم‌تراز با شروعِ ۷:۰۰ |

---

## ۴) سه باگی که کاربر گزارش داد و رفع شد

### ① «چرا اسم کلاس‌ها شد اتاق ۱۱ / اتاق ۱۱۴؟»

**علت:** مهاجرت `0114` روی DB اجرا نشده بود ولی کوئریِ فرادادهٔ اتاق‌ها `.catch(() => [])` داشت →
آرایه خالی → `roomById.get(id)` برای همه undefined → fallbackِ `اتاق ${roomId}`.
**درس:** `.catch(() => [])` روی کوئریِ «فرادادهٔ نمایش» = خرابیِ خاموش. صفحه دروغ می‌گفت، بدون خطا.
**رفع:** اول با ستون تازه تلاش، اگر خطای ساختار داد بدونِ آن ستون دوباره؛ اگر باز هم خالی بود `throw`.

### ② «صفحه به سوییچ دانشگاه حساس نیست و همهٔ گروه‌ها را می‌آورد»

`listClassroomExpertAssignments` و `listOfferingExpertAssignments` اصلاً `universityId` نمی‌گرفتند
و فهرست ترم/گروه هم فیلتر نداشت. حالا `getEduExpertAssignInit` یک‌بار دانشگاه جاری را می‌خواند و
به همه پاس می‌دهد.

### ③ «متن داخل کادر انتخاب‌ها خوانا نیست»

سلکتِ «افزودن کارشناس» عرض `w-28` (۷rem) داشت → نام‌های بلند فارسی به «…» می‌بریدند.
سلکت «گروه مسئول» هم `min-w-0` داشت و کوچک می‌شد. حالا هر دو سطرِ خودشان، عرضِ کامل، `dir="rtl"`.

---

## ⑤) رفع‌های دیگرِ همین جلسه

| مشکل | رفع |
|---|---|
| فیلتر «دانشکده/گروه» تابلوی هفتگی کار نمی‌کرد | `scopedDeptIds` هم گروه هم دانشکده را اعمال می‌کند؛ `room` کهنه به «همه» برمی‌گردد؛ `FilterSelect.tsx` با تغییر فیلتر فرم را خودکار ارسال و `room` را پاک می‌کند |
| «تخصیص ندادی» در تعریف برنامهٔ درس (با اینکه کارشناس به اتاق سپرده شده) | `OfferingEditRow.roomExpertUserIds` از `classroom_edu_experts` پر می‌شود و به‌صورت چیپِ سبز «اتاق» نشان داده می‌شود |
| تاریخ امتحان میلادی نمایش داده می‌شد | `gregToJalaliInput`/`jalaliInputToGreg` در `OfferingEditorClient` (تبدیل دوطرفه، پذیرش ارقام فارسی). ستون `schedules.examDate` هنوز میلادی است |
| تست‌های کهنهٔ تقویم | گرید از ۷:۰۰ شروع می‌شود (`PROFESSOR_CALENDAR_START_MINUTES = 420`): ۱۴ برچسب ساعت، `topPercent` ۵۸٫۹۷، `heightPercent` ۱۲٫۸۲، سانسِ بریده ۰۶:۳۰ |

---

## ۶) قراردادها و تله‌ها (برای نشستِ بعد)

- **`--no-deps` در دیپلوی اجباری است** — بدون آن `postgres`/`redis` هم ری‌استارت می‌شوند و سایت می‌خوابد.
- **مهاجرت‌ها با دیپلویِ خودکار اجرا نمی‌شوند** — باید دستی زده شوند (علتِ حادثهٔ «اتاق ۱۱»).
- **هرگز روی ویندوز بیلد نکن** (`npm run build`) — ۲۰ دقیقه طول می‌کشد و sandbox آن را می‌کشد.
  گیت محلی `npx tsc --noEmit` است.
- **تنها روی `FINAL` کار کن** — یک عامل موازی دوره‌ای `/root/afagh` را به کامیت خودش ریست می‌کند.
- **`docker compose exec` باید با نامِ سرویس باشد** (`postgres`)، نه نامِ کانتینر (`afagh_pg`).
- سشن روی `sessions.token` با `sha256` ذخیره می‌شود؛ توکن باید ۶۴ کاراکتر هگز باشد.
  کاربران با `mustChangePassword=1` به `/login` ریدایرکت می‌شوند (۳۰۷).
- **نامِ کلاس‌ها تکراری است**: «كلاس 4 عمومي» دو رکورد دارد (#81 با ۱۶۱ سانس، #124 با صفر).
  اگر QR روی رکوردِ خالی چاپ شده باشد، استاد بن‌بست می‌شود. پاک‌سازیِ این دوتا کارِ باز است.
- **هیچ کاربری در DB نقشِ `EDU_EXPERT` ندارد** (۰ ردیف) — پس انتخاب‌گر کارشناس تا تخصیصِ نقش خالی است.
  برای تست باید اول نقش داده شود.

---

## ۷) کارهای باز

| # | کار | اولویت |
|---|---|---|
| ۱ | **دیپلوی + اجرای مهاجرت ۰۱۱۳/۰۱۱۴** (SSH برگردد) | 🔴 P0 |
| ۲ | تخصیص نقش `ATTENDANCE_CONTROLLER` به کاربران واقعی | 🟠 P1 |
| ۳ | تنظیمِ `ATTENDANCE_RECORDER_MODE` را در `/admin/settings` انتخاب و تأیید کن | 🟠 P1 |
| ۴ | تستِ زنده: اسکن QR توسط کنترل‌کننده + ثبت در کارتابل | 🟠 P1 |
| ۵ | پاک‌سازی کلاس‌های هم‌نام (ادغام/غیرفعال‌کردن رکورد خالی) | 🟡 P2 |
| ۶ | نمایشِ ساعت‌ها ۲۴ساعته در فرم امتحان (این moment به locale مرورگر وابسته است) | 🟡 P2 |
| ۷ | پلن موبایل فرانت (۷۷ صفحه ادمین + ۲۷ پرتال، ۱۰۶ فایل `<table>`) — هنوز شروع نشده | 🟡 P2 |

---

> این دیجست برای ادامهٔ کار در نشستِ دیگر نوشته شده است. تصمیم‌های محصول را با مسئولِ فنی بازبینی کن.
