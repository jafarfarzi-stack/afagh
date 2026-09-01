import crypto from 'crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
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
        const major = allMajors.find(m => m.name.includes(sm.majorName.split(' - ')[0])) || allMajors[0];
        if (major) {
          await db.insert(sanjesh_mappings).values({
            sanjeshCode: sm.sanjeshCode,
            internalMajorId: major.id,
            sanjeshQuota: sm.quota,
            internalQuotaCode: 1,
          });
        }
      }
    }
  } catch (err) {
    console.error('Error ensuring Sanjesh mappings:', err);
  }
}

// ============================================================================
// موتور فرمول‌ساز پویای شماره دانشجویی (Dynamic Student ID Generator)
// ============================================================================

export async function generateStudentId(params: {
  degreeLevelId: number;
  entryYear: number;
  majorCode?: string;
  quotaCode?: number;
}): Promise<string> {
  const [level] = await db
    .select()
    .from(degree_level_configs)
    .where(eq(degree_level_configs.id, params.degreeLevelId))
    .limit(1);

  // واکشی فرمول تعریف‌شده یا ایجاد فرمول پیش‌فرض
  const [formulaRow] = await db
    .select()
    .from(student_id_formulas)
    .where(eq(student_id_formulas.degreeLevelId, params.degreeLevelId))
    .limit(1);

  let formula = formulaRow?.formula || '{Year:2}{DegreeCode:1}{MajorCode:3}{Seq:3}';
  let nextSeq = (formulaRow?.currentSequence || 0) + 1;

  if (formulaRow) {
    await db
      .update(student_id_formulas)
      .set({ currentSequence: nextSeq })
      .where(eq(student_id_formulas.id, formulaRow.id));
  } else {
    await db.insert(student_id_formulas).values({
      degreeLevelId: params.degreeLevelId,
      entryYear: params.entryYear,
      formula,
      currentSequence: nextSeq,
    });
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

export async function parseAndStageSanjeshData(rawText: string, entryYear = 1405) {
  await ensureDefaultSanjeshMappings();

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const mappings = await db.select().from(sanjesh_mappings);
  const allMajors = await db.select().from(majors);
  const [defaultLevel] = await db.select().from(degree_level_configs).limit(1);

  const stagedResults: any[] = [];

  for (const line of lines) {
    // پشتیبانی از فرمت‌های کاما، تب یا پایپ
    const parts = line.split(/[,;\t|]+/).map(p => p.trim());
    if (parts.length < 4) continue;

    const [nationalCode, firstName, lastName, sanjeshCode, quota, mobile, rank] = parts;

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
          mobile: mobile || '0912' + Math.floor(1000000 + Math.random() * 9000000),
        }),
        mappedMajorId,
        entryYear,
        degreeLevelId: defaultLevel?.id || 1,
        quotaType: quota || 'NORMAL',
        mobile: mobile || '09120000000',
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

  return stagedResults;
}

// ============================================================================
// تبدیل رکوردهای Staging به دانشجو و کاربر نهایی (Batch Import to Users & Students)
// ============================================================================

export async function importStagedToStudents(stagingIds: number[]) {
  const stagedRows = await db
    .select()
    .from(admissions_staging)
    .where(inArray(admissions_staging.id, stagingIds));

  const [defaultReg] = await db.select().from(educational_regulations).limit(1);
  const importedResults: any[] = [];

  for (const row of stagedRows) {
    if (!row.mappedMajorId || row.status !== 'RESOLVED') continue;

    let parsed: any = {};
    try {
      if (row.rawSanjeshData) parsed = JSON.parse(row.rawSanjeshData);
    } catch (_) {}

    // ۱. بررسی یا ایجاد کاربر پلی‌مورفیک (Unified User)
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.nationalCode, row.nationalCode))
      .limit(1);

    if (!user) {
      const passwordHash = crypto.createHash('sha256').update('123456').digest('hex');
      [user] = await db
        .insert(users)
        .values({
          nationalCode: row.nationalCode,
          firstName: parsed.firstName || row.fullName?.split(' ')[0] || 'دانشجو',
          lastName: parsed.lastName || row.fullName?.split(' ').slice(1).join(' ') || 'پذیرفته‌شده',
          mobile: row.mobile || parsed.mobile || '09120000000',
          passwordHash,
          isActive: 1,
        })
        .returning();
    }

    // ۲. تولید شماره دانشجویی پویا
    const [major] = await db.select().from(majors).where(eq(majors.id, row.mappedMajorId)).limit(1);
    const studentCode = await generateStudentId({
      degreeLevelId: row.degreeLevelId || 1,
      entryYear: row.entryYear || 1405,
      majorCode: major?.majorCode || '412',
    });

    // ۳. ایجاد پرونده دانشجویی
    const [existingStudent] = await db
      .select()
      .from(students)
      .where(eq(students.userId, user.id))
      .limit(1);

    let studentId = existingStudent?.id;

    if (!existingStudent) {
      const [newStudent] = await db
        .insert(students)
        .values({
          userId: user.id,
          studentCode,
          majorId: row.mappedMajorId,
          degreeLevelId: row.degreeLevelId || 1,
          regulationId: defaultReg?.id || 1,
          entryYear: row.entryYear || 1405,
          entryTerm: 1,
          status: 'ACTIVE',
          quotaType: row.quotaType || 'NORMAL',
          currentTermNo: 1,
        })
        .returning();
      studentId = newStudent.id;
    }

    // به‌روزرسانی وضعیت در Staging
    await db
      .update(admissions_staging)
      .set({
        status: 'IMPORTED',
        studentId,
        userId: user.id,
        onboardingStatus: 'COMPLETED',
      })
      .where(eq(admissions_staging.id, row.id));

    importedResults.push({
      stagingId: row.id,
      studentCode,
      fullName: `${user.firstName} ${user.lastName}`,
      nationalCode: user.nationalCode,
    });
  }

  return importedResults;
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
  const [defaultReg] = await db.select().from(educational_regulations).limit(1);

  // ۱. ایجاد یا یافتن کاربر یکپارچه
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.nationalCode, params.nationalCode))
    .limit(1);

  if (!user) {
    const passwordHash = crypto.createHash('sha256').update('123456').digest('hex');
    [user] = await db
      .insert(users)
      .values({
        nationalCode: params.nationalCode,
        firstName: params.firstName,
        lastName: params.lastName,
        mobile: params.mobile,
        passwordHash,
        isActive: 1,
      })
      .returning();
  }

  // ۲. تولید شماره دانشجویی با فرمول پویا
  const [major] = await db.select().from(majors).where(eq(majors.id, params.majorId)).limit(1);
  const studentCode = await generateStudentId({
    degreeLevelId: params.degreeLevelId,
    entryYear,
    majorCode: major?.majorCode || '412',
  });

  // ۳. ایجاد پرونده دانشجویی
  const [newStudent] = await db
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
}
