import crypto from 'crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { hashPassword } from '@/lib/auth';
import {
  admissions_staging,
  degree_level_configs,
  educational_regulations,
  majors,
  sanjesh_mappings,
  student_id_formulas,
  students,
  users,
} from '@/db/schema';

// ============================================================================
// نمونه داده‌های نگاشت اولیه سازمان سنجش (Default Sanjesh Mappings)
// ============================================================================

export const DEFAULT_SANJESH_MAPPINGS = [
  { sanjeshCode: '11204', majorName: 'مهندسی کامپیوتر - نرم‌افزار', majorCode: '412', quota: 'منطقه ۱' },
  { sanjeshCode: '11205', majorName: 'مهندسی کامپیوتر - هوش مصنوعی', majorCode: '414', quota: 'منطقه ۲' },
  { sanjeshCode: '11301', majorName: 'مهندسی برق - مخابرات', majorCode: '310', quota: 'منطقه ۱' },
  { sanjeshCode: '11402', majorName: 'علوم کامپیوتر', majorCode: '201', quota: 'منطقه ۳' },
  { sanjeshCode: '11505', majorName: 'مدیریت کسب و کار (MBA)', majorCode: '601', quota: 'سهمیه آزاد' },
];

export async function ensureDefaultSanjeshMappings() {
  try {
    const existing = await db.select().from(sanjesh_mappings);
    if (existing.length === 0) {
      const allMajors = await db.select().from(majors);
      for (const sm of DEFAULT_SANJESH_MAPPINGS) {
        const major = allMajors.find(m => m.name.includes(sm.majorName.split(' - ')[0]));
        if (!major) {
          // به‌جای نسبت دادن بی‌صدا به «اولین رشتهٔ دیتابیس» (که می‌تواند رشتهٔ کاملاً
          // نامرتبط باشد)، از ایجاد نگاشت صرف‌نظر می‌کنیم و هشدار می‌دهیم؛
          // رکوردهای سنجشِ بدون نگاشت با وضعیت PENDING_MAPPING می‌مانند و
          // کارشناس بعداً می‌تواند به‌صورت دستی نگاشت کند.
          console.warn(`[sanjesh-mappings] رشتهٔ داخلی برای «${sm.majorName}» پیدا نشد — نگاشت ایجاد نشد (${sm.sanjeshCode}).`);
          continue;
        }
        await db.insert(sanjesh_mappings).values({
          sanjeshCode: sm.sanjeshCode,
          internalMajorId: major.id,
          sanjeshQuota: sm.quota,
          internalQuotaCode: 1,
        });
      }
    }
  } catch (err) {
    console.error('Error ensuring Sanjesh mappings:', err);
  }
}

// ============================================================================
// موتور فرمول‌ساز پویای شماره دانشجویی (Dynamic Student ID Generator)
// ============================================================================

/**
 * تولید شمارهٔ دانشجویی با افزایش اتمیک شمارنده (atomic SQL increment).
 *
 * برخلاف الگوی قبلی «read → compute → write» که در همزمانی دو پذیرش،
 * شمارهٔ تکراری تولید می‌کرد، این‌جا افزایش شمارنده در یک UPDATE اتمیک
 * (درون یک تراکنش) انجام می‌شود؛ بنابراین دو تراکنش هم‌زمان هرگز یک شماره
 * نمی‌گیرند. رقابت «ایجاد ردیف فرمول» هم با unique constraint روی
 * degreeLevelId + onConflictDoNothing حل شده است.
 *
 * برای شرکت‌پذیری در تراکنشِ فراخوان (مثلاً importStagedToStudents)،
 * پارامتر اختیاری `q` می‌پذیرد؛ در غیر این صورت از `db` استفاده می‌کند.
 */
export async function generateStudentId(
  params: {
    degreeLevelId: number;
    entryYear: number;
    majorCode?: string;
    quotaCode?: number;
  },
  q: any = db,
): Promise<string> {
  const [level] = await q
    .select()
    .from(degree_level_configs)
    .where(eq(degree_level_configs.id, params.degreeLevelId))
    .limit(1);

  // واکشی فرمول تعریف‌شده یا ایجاد فرمول پیش‌فرض
  const [formulaRow] = await q
    .select()
    .from(student_id_formulas)
    .where(eq(student_id_formulas.degreeLevelId, params.degreeLevelId))
    .limit(1);

  const formula = formulaRow?.formula || '{Year:2}{DegreeCode:1}{MajorCode:3}{Seq:3}';
  let nextSeq: number;

  if (formulaRow) {
    // ── افزایش اتمیک: UPDATE ... RETURNING در یک دستور — بدون race ──
    const [upd] = await q
      .update(student_id_formulas)
      .set({ currentSequence: sql`${student_id_formulas.currentSequence} + 1` })
      .where(eq(student_id_formulas.id, formulaRow.id))
      .returning({ seq: student_id_formulas.currentSequence });
    nextSeq = upd ? upd.seq : (formulaRow.currentSequence ?? 0) + 1;
  } else {
    const [ins] = await q
      .insert(student_id_formulas)
      .values({
        degreeLevelId: params.degreeLevelId,
        entryYear: params.entryYear,
        formula,
        currentSequence: 1,
      })
      .onConflictDoNothing({ target: student_id_formulas.degreeLevelId })
      .returning({ seq: student_id_formulas.currentSequence });
    if (ins) {
      nextSeq = ins.seq;
    } else {
      // رقابت: ردیف فرمول توسط تراکنش دیگر ساخته شد → همان مسیر اتمیک
      const [row2] = await q
        .select()
        .from(student_id_formulas)
        .where(eq(student_id_formulas.degreeLevelId, params.degreeLevelId))
        .limit(1);
      if (!row2) throw new Error('ایجاد فرمول شمارهٔ دانشجویی ممکن نشد.');
      const [upd] = await q
        .update(student_id_formulas)
        .set({ currentSequence: sql`${student_id_formulas.currentSequence} + 1` })
        .where(eq(student_id_formulas.id, row2.id))
        .returning({ seq: student_id_formulas.currentSequence });
      nextSeq = upd ? upd.seq : (row2.currentSequence ?? 0) + 1;
    }
  }

  // استخراج متغیرها
  const year2 = String(params.entryYear).slice(-2); // مثلاً 05 برای 1405
  const degreeDigit = level?.code === 'BS' ? '1' : level?.code === 'MS' ? '2' : level?.code === 'PHD' ? '3' : '1';
  const major3 = (params.majorCode || '412').padStart(3, '0').slice(-3);
  const seq3 = String(nextSeq).padStart(3, '0');
  const quota1 = String(params.quotaCode || 1);

  // جایگذاری متغیرها در الگوی فرمول
  let generated = formula
    .replace('{Year:2}', year2)
    .replace('{DegreeCode:1}', degreeDigit)
    .replace('{MajorCode:3}', major3)
    .replace('{Seq:3}', seq3)
    .replace('{QuotaCode:1}', quota1);

  // در صورتی که فرمول متغیرهای پیش‌فرض نداشت
  if (!generated || generated === formula) {
    generated = `${year2}${degreeDigit}${major3}${seq3}`;
  }

  return generated;
}

// ============================================================================
// پارسر فایل متنی سازمان سنجش و بارگذاری در Staging (Sanjesh Text File Parser)
// ============================================================================

export interface StagingParsedRow {
  nationalCode: string;
  firstName: string;
  lastName: string;
  sanjeshCode: string;
  quota: string;
  mobile?: string;
  rank?: number;
}

const NATIONAL_CODE_RE = /^\d{10}$/;

export async function parseAndStageSanjeshData(rawText: string, entryYear = 1405) {
  await ensureDefaultSanjeshMappings();

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const mappings = await db.select().from(sanjesh_mappings);
  const allMajors = await db.select().from(majors);
  const [defaultLevel] = await db.select().from(degree_level_configs).limit(1);

  // کد ملی‌هایی که قبلاً stage شده‌اند — جلوگیری از ورود تکراری (idempotent)
  const existingCodes = new Set(
    (await db.select({ nationalCode: admissions_staging.nationalCode }).from(admissions_staging)).map(r => r.nationalCode),
  );

  const stagedResults: any[] = [];
  let skippedInvalid = 0;
  let skippedDuplicates = 0;

  for (const line of lines) {
    // پشتیبانی از فرمت‌های کاما، تب یا پایپ
    const parts = line.split(/[,;\t|]+/).map(p => p.trim());
    if (parts.length < 4) continue;

    const [nationalCode, firstName, lastName, sanjeshCode, quota, mobile, rank] = parts;

    // ── اعتبارسنجی کد ملی: ۱۰ رقم — خطوط نامعتبر بی‌صدا وارد سیستم نمی‌شوند ──
    if (!NATIONAL_CODE_RE.test(nationalCode)) {
      console.warn(`[sanjesh-parser] کد ملی نامعتبر نادیده گرفته شد: «${nationalCode}»`);
      skippedInvalid++;
      continue;
    }
    // ── کد ملی تکراری (قبلاً stage شده) — بدون ساخت رکورد موازی ──
    if (existingCodes.has(nationalCode)) {
      skippedDuplicates++;
      continue;
    }
    existingCodes.add(nationalCode);

    // تطبیق با جدول نگاشت کدهای سنجش
    const match = mappings.find(m => m.sanjeshCode === sanjeshCode);
    const mappedMajorId = match ? match.internalMajorId : null;
    const status = mappedMajorId ? 'RESOLVED' : 'PENDING_MAPPING';

    const [staged] = await db
      .insert(admissions_staging)
      .values({
        nationalCode,
        fullName: `${firstName} ${lastName}`,
        rawSanjeshData: JSON.stringify({
          firstName,
          lastName,
          sanjeshCode,
          quota: quota || 'سهمیه عادی',
          rank: rank ? Number(rank) : undefined,
          // موبایل جعلی تصادفی تولید نمی‌شود؛ نبود موبایل → null (میدان اختیاری)
          mobile: mobile || undefined,
        }),
        mappedMajorId,
        entryYear,
        degreeLevelId: defaultLevel?.id || 1,
        quotaType: quota || 'NORMAL',
        mobile: mobile || null,
        status,
        onboardingStatus: 'IMPORTED',
      })
      .returning();

    stagedResults.push({
      id: staged.id,
      nationalCode,
      fullName: `${firstName} ${lastName}`,
      sanjeshCode,
      status,
      mappedMajorName: mappedMajorId ? allMajors.find(m => m.id === mappedMajorId)?.name : null,
    });
  }

  if (skippedInvalid || skippedDuplicates) {
    console.warn(`[sanjesh-parser] ${skippedInvalid} خط نامعتبر و ${skippedDuplicates} کد ملی تکراری نادیده گرفته شد.`);
  }
  return stagedResults;
}

// ============================================================================
// تبدیل رکوردهای Staging به دانشجو و کاربر نهایی (Batch Import to Users & Students)
// ============================================================================

/**
 * تبدیل رکوردهای staging به کاربر + دانشجو.
 *
 * هر رکورد در یک **تراکنش مستقل** پردازش می‌شود: ایجاد کاربر، تولید شمارهٔ
 * دانشجویی، ایجاد پرونده و به‌روزرسانی staging یا کاملاً موفق است یا کاملاً
 * برمی‌گردد — کاربر بدون پروندهٔ دانشجویی (یا شمارهٔ سوزانده‌شده) باقی نمی‌ماند.
 * شکست یک رکورد، بقیهٔ رکوردهای دسته را از کار نمی‌اندازد و در خروجی گزارش می‌شود.
 */
export async function importStagedToStudents(stagingIds: number[]) {
  const stagedRows = await db
    .select()
    .from(admissions_staging)
    .where(inArray(admissions_staging.id, stagingIds));

  const [defaultReg] = await db.select().from(educational_regulations).limit(1);
  const importedResults: any[] = [];
  const failures: { stagingId: number; error: string }[] = [];

  for (const row of stagedRows) {
    if (!row.mappedMajorId || row.status !== 'RESOLVED') continue;
    // کپی محلی بعد از گارد — narrowing درون closure تراکنش از بین می‌رود
    const mappedMajorId = row.mappedMajorId;
    const degreeLevelId = row.degreeLevelId || 1;
    const entryYear = row.entryYear || 1405;
    const quotaType = row.quotaType || 'NORMAL';
    const nationalCode = row.nationalCode;

    let parsed: any = {};
    try {
      if (row.rawSanjeshData) parsed = JSON.parse(row.rawSanjeshData);
    } catch (_) {}

    try {
      const result = await db.transaction(async tx => {
        // ۱. بررسی یا ایجاد کاربر پلی‌مورفیک (Unified User)
        let [user] = await tx
          .select()
          .from(users)
          .where(eq(users.nationalCode, nationalCode))
          .limit(1);

        if (!user) {
          // رمز پیش‌فرض با همان موتور امنیتی سراسری (scrypt + salt تصادفی) —
          // نه sha256 خام؛ و فلگ «تغییر اجباری رمز» برای اولین ورود ست می‌شود.
          const passwordHash = await hashPassword('123456');
          [user] = await tx
            .insert(users)
            .values({
              nationalCode,
              firstName: parsed.firstName || row.fullName?.split(' ')[0] || 'دانشجو',
              lastName: parsed.lastName || row.fullName?.split(' ').slice(1).join(' ') || 'پذیرفته‌شده',
              mobile: row.mobile || parsed.mobile || null,
              passwordHash,
              isActive: 1,
              mustChangePassword: 1,
            })
            .returning();
        }

        // ۲. بررسی وجود پروندهٔ دانشجویی — فقط در صورت نبود، شماره تولید می‌شود
        //    (تا سکانس بی‌دلیل سوزانده نشود؛ رکوردهای تکراری شمارهٔ تازه نمی‌گیرند)
        const [existingStudent] = await tx
          .select()
          .from(students)
          .where(eq(students.userId, user.id))
          .limit(1);

        let studentId = existingStudent?.id;
        let studentCode = existingStudent?.studentCode;

        if (!existingStudent) {
          // ۳. تولید شمارهٔ دانشجویی پویا (اتمیک — داخل همین تراکنش)
          const [major] = await tx.select().from(majors).where(eq(majors.id, mappedMajorId)).limit(1);
          studentCode = await generateStudentId(
            {
              degreeLevelId,
              entryYear,
              majorCode: major?.majorCode || '412',
            },
            tx,
          );

          // ۴. ایجاد پروندهٔ دانشجویی
          const [newStudent] = await tx
            .insert(students)
            .values({
              userId: user.id,
              studentCode,
              majorId: mappedMajorId,
              degreeLevelId,
              regulationId: defaultReg?.id || 1,
              entryYear,
              entryTerm: 1,
              status: 'ACTIVE',
              quotaType,
              currentTermNo: 1,
            })
            .returning();
          studentId = newStudent.id;
        }

        // ۵. به‌روزرسانی وضعیت در Staging
        await tx
          .update(admissions_staging)
          .set({
            status: 'IMPORTED',
            studentId,
            userId: user.id,
            onboardingStatus: 'COMPLETED',
          })
          .where(eq(admissions_staging.id, row.id));

        return { studentCode, userId: user.id, firstName: user.firstName, lastName: user.lastName };
      });

      importedResults.push({
        stagingId: row.id,
        studentCode: result.studentCode,
        fullName: `${result.firstName} ${result.lastName}`,
        nationalCode: row.nationalCode,
      });
    } catch (err: any) {
      // رکورد ناموفق به‌طور کامل rollback شد — بقیهٔ دسته ادامه می‌یابد
      console.error(`[admissions-import] staging ${row.id} (${row.nationalCode}) ناموفق:`, err?.message);
      failures.push({ stagingId: row.id, error: err?.message || 'خطای ناشناخته' });
    }
  }

  return { imported: importedResults, failures };
}

// ============================================================================
// ثبت‌نام دستی، انتقالی و اتباع خارجی (Manual & Alternative Admissions)
// ============================================================================

export async function registerManualStudent(params: {
  nationalCode: string;
  firstName: string;
  lastName: string;
  mobile: string;
  majorId: number;
  degreeLevelId: number;
  entryYear?: number;
  entryTerm?: number;
  quotaType?: string;
  admissionType?: 'NORMAL' | 'TRANSFER' | 'INTERNATIONAL' | 'FREE_COURSE';
}) {
  const entryYear = params.entryYear || 1405;

  return db.transaction(async tx => {
    const [defaultReg] = await tx.select().from(educational_regulations).limit(1);

    // ۱. ایجاد یا یافتن کاربر یکپارچه
    let [user] = await tx
      .select()
      .from(users)
      .where(eq(users.nationalCode, params.nationalCode))
      .limit(1);

    if (!user) {
      const passwordHash = await hashPassword('123456');
      [user] = await tx
        .insert(users)
        .values({
          nationalCode: params.nationalCode,
          firstName: params.firstName,
          lastName: params.lastName,
          mobile: params.mobile,
          passwordHash,
          isActive: 1,
          mustChangePassword: 1,
        })
        .returning();
    }

    // ۲. تولید شمارهٔ دانشجویی با فرمول پویا (اتمیک — داخل همان تراکنش)
    const [major] = await tx.select().from(majors).where(eq(majors.id, params.majorId)).limit(1);
    const studentCode = await generateStudentId(
      {
        degreeLevelId: params.degreeLevelId,
        entryYear,
        majorCode: major?.majorCode || '412',
      },
      tx,
    );

    // ۳. ایجاد پروندهٔ دانشجویی
    const [newStudent] = await tx
      .insert(students)
      .values({
        userId: user.id,
        studentCode,
        majorId: params.majorId,
        degreeLevelId: params.degreeLevelId,
        regulationId: defaultReg?.id || 1,
        entryYear,
        entryTerm: params.entryTerm || 1,
        status: 'ACTIVE',
        quotaType: params.quotaType || 'NORMAL',
        currentTermNo: 1,
      })
      .returning();

    return {
      studentId: newStudent.id,
      userId: user.id,
      studentCode,
      fullName: `${user.firstName} ${user.lastName}`,
    };
  });
}
