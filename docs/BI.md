# هوش تجاری ارزشیابی (BI) — مستند فنی

مسیر کد: `afagh-next/src/lib/bi-engine.ts`
صفحه‌ها: `/admin/bi` (داشبورد مدیریتی) و `/professor/evaluation` (کارنامهٔ ارزشیابی استاد)
job زمان‌بندی‌شده: `POST /api/cron/bi-refresh`

این ماژول جایگزین `afagh-erp/src/engines/bi.js` (SQLite) است و سه ایراد ساختاری
بازبینی کد را برطرف می‌کند: **N+1**، **بار تحلیل متن روی سرور وب**، و
**SQL خام به‌جای ORM**.

---

## ۱) حذف N+1 — کوئری تجمیعی به‌جای حلقه

### مشکل پیشین
`managementOverview` فهرست اساتید را می‌گرفت و داخل حلقه برای هر استاد:
1. `getTrend` را صدا می‌زد — که خودش برای **هر دورهٔ** `evaluation_periods`
   یک کوئری `periodScore` می‌زد؛
2. یک کوئری جدا برای شمارش پاسخ‌دهنده‌ها می‌زد.

`facilitiesReport` هم برای هر کلاس، یک کوئری به ازای هر شاخص و یک کوئری برای
فهرست دروس می‌زد.

با ۸ استاد و ۳ دوره = **۳۳ کوئری** فقط برای داشبورد، و با ۴ کلاس و ۴ شاخص =
**۲۰ کوئری** برای امکانات؛ هر دو به‌صورت خطی با حجم داده رشد می‌کردند.

### راه‌حل
نمرهٔ وزنی **همهٔ اساتید در همهٔ دوره‌ها** با یک CTE و `GROUP BY` گرفته می‌شود
(`allStaffPeriodScores`):

```sql
with ownership as (                 -- مالکیت ارزشیابی: مدرس اصلی کلاس
  select o.id as offering_id, o."professorId" as staff_id from course_offerings o where o."professorId" is not null
  union
  select op."offeringId", op."staffId" from offering_professors op where op.role = 'MAIN_LECTURER'
),
resp as (                            -- میانگین نمره به تفکیک استاد × دوره × پرسش
  select r."periodId" period_id, ow.staff_id, r."questionId" question_id, avg(qo."scoreValue") s
    from evaluation_responses r
    join ownership ow on ow.offering_id = r."offeringId"
    join question_options qo on qo.id = r."selectedOptionId"
   where r."selectedOptionId" is not null
   group by r."periodId", ow.staff_id, r."questionId"
)
select resp.staff_id, resp.period_id, sum(resp.s * q.weight) / nullif(sum(q.weight), 0) score
  from resp join evaluation_questions q on q.id = resp.question_id
            join evaluation_forms f     on f.id = q."formId"
 where f."targetType" = 'PROFESSOR'
 group by resp.staff_id, resp.period_id;
```

به همین ترتیب:
* شمارش پاسخ‌دهنده‌ها ← یک `GROUP BY` (`respondentsByStaff`)
* تعداد کلاس هر استاد ← یک `GROUP BY` (`offeringsByStaff`)
* شاخص‌های همهٔ کلاس‌ها در همهٔ محورها ← یک `GROUP BY`
* دروس هر کلاس ← یک `GROUP BY` با `string_agg(distinct c.code, ',')`
* محورهای رادار «من» و «گروه آموزشی» ← یک `GROUP BY` با
  `avg(...) filter (where ...)` (جای حلقهٔ شمارش پاسخ به ازای هر محور)

### عدد اندازه‌گیری‌شده (روی PostgreSQL ۱۸ زنده)

| گزارش | روش حلقه‌ای قدیمی | اکنون | پس از افزودن ۳ استاد و ۳ کلاس |
|---|---|---|---|
| داشبورد مدیریتی | ۳۳ کوئری | **۷ کوئری** | **۷ کوئری** (بدون تغییر) |
| تحلیل امکانات | ۲۰ کوئری | **۵ کوئری** | **۵ کوئری** (بدون تغییر) |

کوئری‌های مستقل با `Promise.all` موازی اجرا می‌شوند (`maxInflight = ۳`).

---

## ۲) تحلیل متن در پایگاه داده + کش

### مشکل پیشین
`wordCloud` همهٔ نظرات تشریحی یک استاد را به Node می‌آورد و با Regex
توکنایز می‌کرد. با هزاران نظر، این کار حلقهٔ رویداد سرور وب را بلاک می‌کند و
همهٔ درخواست‌های دیگر معطل می‌مانند.

### راه‌حل
توکنایز کامل داخل خود PostgreSQL انجام می‌شود — هیچ متن خامی به Node نمی‌آید:

```sql
select btrim(translate(w, 'يك', 'یک'), E'\u200C') as word
  from comments,
       lateral regexp_split_to_table(body, E'[^\u0600-\u06FF\u200C]+') as w
...
where length(word) >= $minLen
  and word <> all(string_to_array($stopwords, E'\u0001'))
group by word order by count(*) desc, word limit $limit;
```

* نرمال‌سازی «ي/ك» عربی به «ی/ک» فارسی با `translate`
* جداسازی واژه‌ها با `regexp_split_to_table` (کلاس نویسهٔ عربی + نیم‌فاصله)
* حذف واژه‌های توقف با `string_to_array` روی **پارامتر بایند شده**
* نتیجه در جدول `analytics_snapshots` کش می‌شود

> نکتهٔ پیاده‌سازی: قالب `sql` درایزر، آرایهٔ JS را به چند placeholder جدا باز
> می‌کند؛ نوشتن `${stops}::text[]` خطای `cannot cast type record to text[]`
> می‌دهد. به همین دلیل فهرست واژه‌های توقف به‌صورت یک رشته با جداکنندهٔ
> U+0001 فرستاده و داخل SQL باز می‌شود (هم یک پارامتر است، هم `text[]`).

### عدد اندازه‌گیری‌شده با ۲۰٬۰۵۰ نظر

| مسیر | زمان | بیشترین تأخیر حلقهٔ رویداد |
|---|---|---|
| توکنایز در PostgreSQL (مسیر فعلی) | ۳۲۰ ms | **۱۴ ms** |
| توکنایز در Node (مسیر قدیمی) | ۵۷ ms | **۵۶ ms** (≈ تمام مدت، بلاک کامل) |

یعنی سرور در مسیر فعلی در تمام مدت پاسخ‌گو می‌ماند؛ در مسیر قدیمی به اندازهٔ
کل زمان محاسبه قفل می‌شد. خروجی دو مسیر واژه‌به‌واژه یکی است (تست مقایسه‌ای).

خواندن گرم از کش = **۱ کوئری** و کمتر از ۱ میلی‌ثانیه.

### job زمان‌بندی‌شده
```cron
# بازسازی کامل کش‌های BI پس از بسته‌شدن دورهٔ ارزشیابی
30 2 * * * curl -fsS -X POST -H "x-cron-secret: ***" http://localhost:8080/api/cron/bi-refresh
```
`refreshAllBiCaches` داشبورد، امکانات و ابر کلماتِ **همهٔ** اساتید را یک‌جا
بازسازی می‌کند (۸ استاد + ۷ کلاس در ۵۲ ms روی دادهٔ آزمایشی). احراز هویت: هدر
`x-cron-secret` برابر `GRAD_CRON_SECRET` یا نشست ادمین.

---

## ۳) Drizzle به‌جای SQL خام

* همهٔ خواندن‌های ساختاریافته با query builder درایزر نوشته شده‌اند.
* مواردی که ذاتاً تجمیعی هستند با `sql` **پارامتری‌شده** نوشته شده‌اند؛ هیچ
  مقدار ورودی به رشتهٔ SQL چسبانده نمی‌شود (واژه‌های توقف هم پارامتر بایند شده‌اند).
* تست تزریق: ۴ متن آزاد مخرب (`'); DROP TABLE staff; --`، `truncate
  analytics_snapshots;`، نقل‌قول‌های تودرتو) ثبت شد؛ کوئری سالم اجرا شد، جدول
  `staff` و جدول کش دست‌نخورده ماندند، و فقط واژه‌های فارسی در ابر کلمات باقی ماندند.

ایندکس‌های لازم (idempotent، در `src/db/pg-hardening.sql` بخش ⑦ و در
`ensureDbSchemaPatches`):

```
evaluation_responses ("periodId","offeringId"), ("questionId"), ("offeringId")
evaluation_questions ("formId","axisLabel")
schedules ("roomId","scheduleType")
offering_professors ("role","staffId")
analytics_snapshots ("reportType")
```

---

## تنظیمات (پنل مدیر → تنظیمات → «ارزشیابی و هوش تجاری»)

| کلید | ENV | پیش‌فرض | توضیح |
|---|---|---|---|
| `EVAL_FLAG_THRESHOLD` | ✅ | `3.5` | آستانهٔ بحرانی نمرهٔ استاد |
| `EVAL_FACILITY_REPAIR_THRESHOLD` | ✅ | `3` | آستانهٔ ارجاع کلاس به تعمیرات |
| `EVAL_TREND_TERMS` | ✅ | `3` | تعداد دورهٔ نمودار روند |
| `BI_WORDCLOUD_LIMIT` | ✅ | `18` | سقف واژه در ابر کلمات |
| `BI_WORDCLOUD_MIN_LEN` | ✅ | `3` | حداقل طول واژه |
| `BI_STOPWORDS` | ✅ | فهرست فارسی | واژه‌های توقف، با ویرگول |
| `BI_CACHE_TTL_SECONDS` | ✅ | `300` | عمر کش گزارش‌ها؛ صفر = همیشه محاسبهٔ تازه |

## گمنامی
هیچ کوئری‌ای به دانشجو یا پاسخ‌دهنده ارجاع نمی‌دهد؛ خروجی فقط **تعداد** و
**میانگین** است. تست خودکار، کد ملی دانشجویان را در کل JSON خروجی جست‌وجو و
نبودش را تأیید می‌کند.
