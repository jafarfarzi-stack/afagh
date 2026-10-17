import 'server-only';
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, degree_level_configs, majors, short_term_certificates,
  short_term_courses, short_term_learners, short_term_registrations, student_cards, student_ledger, students, users,
} from '@/db/schema';
import { getNumber, getSetting } from '@/lib/settings';
import { calculateOfficialGPA } from '@/lib/regulations-engine';
import { getStudentFinance } from '@/lib/finance-engine/student-detail';
import { currentTermFor } from '@/lib/terms';
import { ledgerBalance } from '@/lib/ledger-balance';
import { createLogger } from '@/lib/logger';

// ══════════════════════════════════════════════════════════════════════
//  موتور استعلام عمومی (Verification Engine)
//
//  سه درگاه عمومی که پیش‌تر دادهٔ ساختگی برمی‌گرداندند:
//    /id/[token]            — گیت حراست: استعلام کارت دانشجویی
//    /exam-ticket/[token]   — گیت حوزهٔ امتحان: کارت ورود به جلسه
//    /verify-certificate    — اصالت‌سنجی گواهینامهٔ دوره‌های آزاد
//
//  هر سه پیش‌تر یک «fallback ساختگی» داشتند: هر توکن ناشناخته یک دانشجو/کارت/
//  گواهینامهٔ معتبرِ جعلی نشان می‌داد. یعنی درگاه اصالت‌سنجی عملاً هر چیزی را
//  تأیید می‌کرد. حالا همهٔ پاسخ‌ها از پایگاه داده می‌آیند و توکن ناشناخته
//  صریحاً «یافت نشد» است.
//
//  توکن‌ها امضاشده‌اند (HMAC-SHA256 با کلید تنظیم‌شدنی) تا قابل حدس/شمارش
//  نباشند؛ پیش‌تر توکن کارت آزمون فقط `VERIFY-<userId>` بود.
// ══════════════════════════════════════════════════════════════════════

const log = createLogger({ mod: 'verification' });

/**
 * بدهی ریالی دانشجو از تراز کانونی دفتر مالی (مثبت = بدهکار، صفر = تسویه).
 * هر سه گیت (کارت، آزمون، کارت ورود به جلسه) از همین استفاده می‌کنند تا
 * انواع قدیمی (TUITION_FIXED/VARIABLE) و POS_PAYMENT نامرئی نمانند.
 */
async function studentDebtRials(studentId: number): Promise<number> {
  const rows = await db
    .select({ transactionType: student_ledger.transactionType, amount: student_ledger.amount })
    .from(student_ledger)
    .where(eq(student_ledger.studentId, studentId));
  return Math.max(0, Math.round(ledgerBalance(rows)));
}

const b64u = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** کد ملی ماسک‌شده — فقط سه رقم اول و دو رقم آخر */
export function maskNationalCode(code: string | null | undefined): string {
  const c = String(code ?? '').trim();
  if (!c) return '—';
  // 🎯 گام ۳ سند: طول خروجی همیشه ثابت است تا طول واقعی کد ملی لو نرود
  // (کد ۹ رقمی و ۱۰ رقمی هر دو «۳+۵+۲» ستاره/رقم می‌شوند).
  if (c.length <= 5) return '*****';
  return `${c.slice(0, 3)}*****${c.slice(-2)}`;
}

// ─────────────────── امضای توکن ───────────────────

async function tokenSecret(): Promise<string> {
  const secret = (await getSetting('TICKET_TOKEN_SECRET')).trim();
  if (!secret) throw new Error('کلید امضای توکن (TICKET_TOKEN_SECRET) تنظیم نشده است.');
  return secret;
}

/**
 * ساخت توکن امضاشدهٔ کوتاه‌مدت: `T1.<payload>.<signature>`
 *
 * `jti` تصادفی دارد تا دو صدور پشت‌سرهم یک توکن یکسان نسازند (توکن قطعی یعنی
 * قابل پیش‌بینی/بازپخش). اعتبار توکن عیناً همان `ttlSeconds` است — کف‌گذاری
 * اینجا انجام نمی‌شود تا انقضای واقعی همیشه صادق باشد؛ صحت مقدار تنظیم‌شده
 * در نقطهٔ صدور بررسی می‌شود.
 */
export async function signToken(payload: Record<string, string | number>, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const jti = randomBytes(8).toString('hex');
  const body = b64u(Buffer.from(JSON.stringify({ ...payload, jti, exp }), 'utf8'));
  const sig = b64u(createHmac('sha256', await tokenSecret()).update(body).digest());
  return `T1.${body}.${sig}`;
}

/** بررسی امضا و انقضا — بدون هیچ حدس و تفسیر دلخواه از توکن */
export async function verifyTokenSignature<T extends Record<string, unknown>>(token: string): Promise<{ ok: true; payload: T & { exp: number } } | { ok: false; reason: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' }> {
  const parts = String(token ?? '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'T1') return { ok: false, reason: 'MALFORMED' };
  const [, body, sig] = parts;
  // 🎯 گام ۳ سند (Soft Key Rotation): اگر ادمین کلید را وسط دوره چرخش بدهد،
  // کارت‌هایی که با کلید قبلی صادر شده‌اند نباید یک‌شبه باطل شوند. بررسی:
  // ۱) کلید جاری  ۲) کلید قبلی (PREVIOUS_TICKET_TOKEN_SECRET) — زمان‌ثابت (timingSafeEqual)
  const currentSecret = await tokenSecret();
  const previousSecret = (await getSetting('PREVIOUS_TICKET_TOKEN_SECRET').catch(() => '')).trim();
  const a = Buffer.from(sig);
  const expectedCurrent = b64u(createHmac('sha256', currentSecret).update(body).digest());
  const bCurrent = Buffer.from(expectedCurrent);
  let valid = a.length === bCurrent.length && timingSafeEqual(a, bCurrent);
  if (!valid && previousSecret) {
    const expectedPrev = b64u(createHmac('sha256', previousSecret).update(body).digest());
    const bPrev = Buffer.from(expectedPrev);
    valid = a.length === bPrev.length && timingSafeEqual(a, bPrev);
  }
  if (!valid) return { ok: false, reason: 'BAD_SIGNATURE' };
  let payload: T & { exp: number };
  try {
    payload = JSON.parse(unb64u(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (!Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'EXPIRED' };
  return { ok: true, payload };
}

// ─────────────────── الف) کارت دانشجویی — گیت حراست ───────────────────

export type CardVerdict = 'VALID' | 'NOT_FOUND' | 'REVOKED' | 'LOST' | 'EXPIRED' | 'BLOCKED' | 'INACTIVE';

export type StudentCardVerification =
  | { verdict: 'NOT_FOUND' }
  | {
      verdict: Exclude<CardVerdict, 'NOT_FOUND'>;
      reason: string;
      allowed: boolean;
      token: string;
      studentId: number;
      studentCode: string;
      fullName: string;
      nationalIdMasked: string;
      majorName: string | null;
      degreeLevel: string | null;
      entranceYear: number;
      studentStatus: string;
      debt: number;
      rfidSerialNumber: string | null;
      printStatus: string | null;
      issuedAt: string | null;
      expiresAt: string | null;
      checkedAt: string;
    };

/** صدور/تمدید کارت دانشجویی — توکن تصادفی ۳۲ بایتی در student_cards */
export async function issueStudentCard(studentId: number, opts: { validDays?: number; force?: boolean } = {}) {
  const validDays = opts.validDays ?? (await getNumber('STUDENT_CARD_VALID_DAYS', 365));
  const existing = await db.select().from(student_cards).where(eq(student_cards.studentId, studentId)).limit(1);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + validDays * 86400000);
  if (existing[0] && !opts.force) {
    await db.update(student_cards)
      .set({ printStatus: 'PRINTED', issuedAt, expiresAt })
      .where(eq(student_cards.id, existing[0].id));
    return { token: existing[0].secureToken, expiresAt, renewed: true };
  }
  const token = randomBytes(24).toString('hex');
  if (existing[0]) {
    await db.update(student_cards)
      .set({ secureToken: token, printStatus: 'PRINTED', issuedAt, expiresAt })
      .where(eq(student_cards.id, existing[0].id));
  } else {
    await db.insert(student_cards).values({
      studentId, secureToken: token, printStatus: 'PRINTED',
      rfidSerialNumber: `E280-${randomBytes(2).toString('hex').toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`,
      issuedAt, expiresAt,
    });
  }
  return { token, expiresAt, renewed: false };
}

export async function revokeStudentCard(studentId: number, status: 'REVOKED' | 'LOST' = 'REVOKED') {
  await db.update(student_cards).set({ printStatus: status }).where(eq(student_cards.studentId, studentId));
}

/** استعلام کارت با توکن — یک کوئری JOIN، بدون هیچ دادهٔ ساختگی */
export async function verifyStudentCard(rawToken: string): Promise<StudentCardVerification> {
  const token = String(rawToken ?? '').trim();
  const [card] = await db
    .select({
      token: student_cards.secureToken,
      printStatus: student_cards.printStatus,
      rfid: student_cards.rfidSerialNumber,
      issuedAt: student_cards.issuedAt,
      expiresAt: student_cards.expiresAt,
      studentId: students.id,
      studentCode: students.studentCode,
      studentStatus: students.status,
      entryYear: students.entryYear,
      firstName: users.firstName,
      lastName: users.lastName,
      nationalCode: users.nationalCode,
      majorName: majors.name,
      degreeLevel: degree_level_configs.title,
    })
    .from(student_cards)
    .innerJoin(students, eq(students.id, student_cards.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
    .where(eq(student_cards.secureToken, token))
    .limit(1);

  if (!card) return { verdict: 'NOT_FOUND' };

  const debt = await studentDebtRials(card.studentId);

  const base = {
    token: card.token,
    studentId: card.studentId,
    studentCode: card.studentCode,
    fullName: `${card.firstName} ${card.lastName}`,
    nationalIdMasked: maskNationalCode(card.nationalCode),
    majorName: card.majorName,
    degreeLevel: card.degreeLevel,
    entranceYear: card.entryYear,
    studentStatus: card.studentStatus,
    debt,
    rfidSerialNumber: card.rfid,
    printStatus: card.printStatus,
    issuedAt: card.issuedAt ? new Date(card.issuedAt).toISOString().slice(0, 10) : null,
    expiresAt: card.expiresAt ? new Date(card.expiresAt).toISOString().slice(0, 10) : null,
    checkedAt: new Date().toISOString(),
  };

  if (card.printStatus === 'REVOKED') return { ...base, verdict: 'REVOKED', allowed: false, reason: 'کارت باطل شده است (اعلام سرقت/تعویض).' };
  if (card.printStatus === 'LOST') return { ...base, verdict: 'LOST', allowed: false, reason: 'کارت مفقودی اعلام شده است.' };
  if (card.expiresAt && new Date(card.expiresAt).getTime() < Date.now()) {
    return { ...base, verdict: 'EXPIRED', allowed: false, reason: 'تاریخ انقضای کارت گذشته است؛ نیاز به تمدید دارد.' };
  }
  if (card.studentStatus !== 'ACTIVE') {
    return { ...base, verdict: 'INACTIVE', allowed: false, reason: `وضعیت تحصیلی دانشجو «${card.studentStatus}» است.` };
  }
  if (debt > 0) {
    return { ...base, verdict: 'BLOCKED', allowed: false, reason: `مسدودی مالی — بدهی ${debt.toLocaleString('fa-IR')} ریال.` };
  }
  return { ...base, verdict: 'VALID', allowed: true, reason: 'کارت معتبر است — ورود مجاز.' };
}

/** جست‌وجوی کارت با شمارهٔ دانشجویی (کمک به حراست وقتی QR خوانده نمی‌شود) */
export async function findCardTokenByStudentCode(studentCode: string) {
  const [row] = await db
    .select({ token: student_cards.secureToken, studentId: students.id, fullName: sql<string>`${users.firstName} || ' ' || ${users.lastName}` })
    .from(student_cards)
    .innerJoin(students, eq(students.id, student_cards.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(students.studentCode, String(studentCode).trim()))
    .limit(1);
  return row ?? null;
}

// ─────────────────── ب) کارت ورود به جلسهٔ امتحان ───────────────────

export type ExamTicketVerification =
  | { ok: false; reason: 'BAD_TOKEN' | 'EXPIRED' | 'NOT_FOUND' | 'NOT_CLEARED'; message: string; debt?: number }
  | {
      ok: true;
      studentId: number;
      studentName: string;
      studentCode: string;
      nationalIdMasked: string;
      majorName: string | null;
      termTitle: string;
      isFinancialCleared: boolean;
      debt: number;
      exams: {
        courseTitle: string;
        courseCode: string;
        examDate: string;
        examTime: string;
        hallName: string | null;
        buildingName: string | null;
        seatNumber: number | null;
        professorName: string | null;
      }[];
      checkedAt: string;
    };

/** توکن کارت آزمون — امضاشده و کوتاه‌مدت (قابل تنظیم) */
export async function issueExamTicketToken(userId: number): Promise<{ token: string; expiresAt: string }> {
  const configured = await getNumber('EXAM_TICKET_TTL_MINUTES', 180);
  if (!Number.isFinite(configured) || configured <= 0) {
    log.warn('exam_ticket_ttl_invalid', { configured });
    throw new Error('مدت اعتبار کارت ورود به جلسه (EXAM_TICKET_TTL_MINUTES) باید عددی بزرگ‌تر از صفر باشد.');
  }
  const ttlMin = Math.min(configured, 4320); // سقف ۷۲ ساعت — کارت آزمون نباید دائمی شود
  const token = await signToken({ uid: userId, kind: 'EXAM' }, ttlMin * 60);
  return { token, expiresAt: new Date(Date.now() + ttlMin * 60_000).toISOString() };
}

export async function verifyExamTicket(rawToken: string): Promise<ExamTicketVerification> {
  const sig = await verifyTokenSignature<{ uid: number; kind: string }>(rawToken);
  if (!sig.ok) {
    return {
      ok: false,
      reason: sig.reason === 'EXPIRED' ? 'EXPIRED' : 'BAD_TOKEN',
      message: sig.reason === 'EXPIRED'
        ? 'این کارت ورود منقضی شده است؛ دانشجو باید از سامانه کارت جدید بگیرد.'
        : 'توکن نامعتبر یا دستکاری‌شده است.',
    };
  }
  if (sig.payload.kind !== 'EXAM') return { ok: false, reason: 'BAD_TOKEN', message: 'نوع توکن با کارت ورود به جلسه همخوانی ندارد.' };

  const [stu] = await db
    .select({
      studentId: students.id, studentCode: students.studentCode,
      firstName: users.firstName, lastName: users.lastName, nationalCode: users.nationalCode,
      majorName: majors.name,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .where(eq(users.id, sig.payload.uid))
    .limit(1);
  if (!stu) return { ok: false, reason: 'NOT_FOUND', message: 'دانشجویی با این توکن یافت نشد.' };

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);
  const debt = await studentDebtRials(stu.studentId);
  if (debt > 0) {
    return { ok: false, reason: 'NOT_CLEARED', message: 'تسویهٔ مالی انجام نشده است؛ صدور کارت ورود مجاز نیست.', debt };
  }

  // برنامهٔ امتحانات: تخصیص صندلی (سالن + شماره) و در نبود آن، زمان‌بندی EXAM کلاس
  const seats = ((await db.execute(sql`
    select c.title as "courseTitle", c.code as "courseCode",
           es."examDate" as "examDate", es."startTime" as "startTime", es."endTime" as "endTime",
           eh.name as "hallName", eh."buildingName" as "buildingName",
           sa."seatNumber" as "seatNumber",
           (pu."firstName" || ' ' || pu."lastName") as "professorName"
      from seat_allocations sa
      join enrollments en on en.id = sa."enrollmentId"
      join exam_sessions es on es.id = sa."sessionId"
      join exam_halls eh on eh.id = sa."hallId"
      join course_offerings o on o.id = en."offeringId"
      join courses c on c.id = o."courseId"
      left join staff st on st.id = o."professorId"
      left join users pu on pu.id = st."userId"
     where en."studentId" = ${stu.studentId}
       and (${term ? sql`es."termId" = ${term.id}` : sql`true`})
     order by es."examDate", es."startTime"
  `)).rows ?? []) as unknown as {
    courseTitle: string; courseCode: string; examDate: string; startTime: string; endTime: string;
    hallName: string | null; buildingName: string | null; seatNumber: number | null; professorName: string | null;
  }[];

  let exams = seats.map(r => ({
    courseTitle: r.courseTitle, courseCode: r.courseCode,
    examDate: r.examDate, examTime: `${r.startTime} – ${r.endTime}`,
    hallName: r.hallName, buildingName: r.buildingName,
    seatNumber: r.seatNumber, professorName: r.professorName,
  }));

  if (!exams.length) {
    // بدون تخصیص صندلی: از ردیف EXAM زمان‌بندی همان کلاس‌ها
    const sched = ((await db.execute(sql`
      select c.title as "courseTitle", c.code as "courseCode",
             coalesce(sc."examDate", '') as "examDate",
             coalesce(sc."startTime", '') as "startTime", coalesce(sc."endTime", '') as "endTime",
             (pu."firstName" || ' ' || pu."lastName") as "professorName"
        from enrollments en
        join course_offerings o on o.id = en."offeringId"
        join courses c on c.id = o."courseId"
        join schedules sc on sc."offeringId" = o.id and sc."scheduleType" = 'EXAM'
        left join staff st on st.id = o."professorId"
        left join users pu on pu.id = st."userId"
       where en."studentId" = ${stu.studentId}
         and (${term ? sql`o."termId" = ${term.id}` : sql`true`})
       order by sc."examDate", sc."startTime"
    `)).rows ?? []) as unknown as {
      courseTitle: string; courseCode: string; examDate: string; startTime: string; endTime: string; professorName: string | null;
    }[];
    exams = sched.map(r => ({
      courseTitle: r.courseTitle, courseCode: r.courseCode,
      examDate: r.examDate, examTime: r.startTime ? `${r.startTime} – ${r.endTime}` : '—',
      hallName: null, buildingName: null, seatNumber: null, professorName: r.professorName,
    }));
  }

  return {
    ok: true,
    studentId: stu.studentId,
    studentName: `${stu.firstName} ${stu.lastName}`,
    studentCode: stu.studentCode,
    nationalIdMasked: maskNationalCode(stu.nationalCode),
    majorName: stu.majorName,
    termTitle: term?.title ?? '—',
    isFinancialCleared: true,
    debt: 0,
    exams,
    checkedAt: new Date().toISOString(),
  };
}

// ─────────────────── ج) تأییدیهٔ انتخاب واحد (گزارش چاپی با QR) ───────────────────

export type EnrollConfirmVerification =
  | { ok: false; reason: 'BAD_TOKEN' | 'EXPIRED' | 'NOT_FOUND' | 'EMPTY'; message: string }
  | {
      ok: true;
      studentId: number;
      studentName: string;
      studentCode: string;
      nationalIdMasked: string;
      majorName: string | null;
      termId: number;
      termTitle: string;
      courses: {
        courseTitle: string;
        courseCode: string;
        units: number;
        groupNumber: number;
        professorName: string | null;
        status: string;
      }[];
      totalUnits: number;
      checkedAt: string;
    };

/** توکن تأییدیهٔ انتخاب واحد — امضاشده و میان‌مدت (پیش‌فرض ۳۰ روز، سقف ۱ سال) */
export async function issueEnrollConfirmToken(userId: number, termId: number): Promise<{ token: string; expiresAt: string }> {
  const configured = await getNumber('ENROLL_CONFIRM_TTL_MINUTES', 43200);
  if (!Number.isFinite(configured) || configured <= 0) {
    log.warn('enroll_confirm_ttl_invalid', { configured });
    throw new Error('مدت اعتبار تأییدیهٔ انتخاب واحد (ENROLL_CONFIRM_TTL_MINUTES) باید عددی بزرگ‌تر از صفر باشد.');
  }
  const ttlMin = Math.min(configured, 525600); // سقف ۱ سال — تأییدیه نباید دائمی شود
  const token = await signToken({ uid: userId, kind: 'ENROLL_CONFIRM', term: termId }, ttlMin * 60);
  return { token, expiresAt: new Date(Date.now() + ttlMin * 60_000).toISOString() };
}

export async function verifyEnrollConfirm(rawToken: string): Promise<EnrollConfirmVerification> {
  const sig = await verifyTokenSignature<{ uid: number; kind: string; term: number }>(rawToken);
  if (!sig.ok) {
    return {
      ok: false,
      reason: sig.reason === 'EXPIRED' ? 'EXPIRED' : 'BAD_TOKEN',
      message: sig.reason === 'EXPIRED'
        ? 'این تأییدیه منقضی شده است؛ دانشجو باید از سامانه تأییدیهٔ تازه بگیرد.'
        : 'توکن نامعتبر یا دستکاری‌شده است.',
    };
  }
  if (sig.payload.kind !== 'ENROLL_CONFIRM') return { ok: false, reason: 'BAD_TOKEN', message: 'نوع توکن با تأییدیهٔ انتخاب واحد همخوانی ندارد.' };

  const [stu] = await db
    .select({
      studentId: students.id, studentCode: students.studentCode,
      firstName: users.firstName, lastName: users.lastName, nationalCode: users.nationalCode,
      majorName: majors.name,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .where(eq(users.id, sig.payload.uid))
    .limit(1);
  if (!stu) return { ok: false, reason: 'NOT_FOUND', message: 'دانشجویی با این توکن یافت نشد.' };

  const [term] = await db.select({ id: academic_terms.id, title: academic_terms.title })
    .from(academic_terms).where(eq(academic_terms.id, sig.payload.term)).limit(1);
  if (!term) return { ok: false, reason: 'NOT_FOUND', message: 'نیمسال این تأییدیه در سامانه یافت نشد.' };

  // لیست زندهٔ دروس ثبت‌شدهٔ همان نیمسال (به‌جز حذف‌شده‌ها) — استعلام برخط، بدون اسنپ‌شات جدا
  const courses = ((await db.execute(sql`
    select c.title as "courseTitle", c.code as "courseCode",
           coalesce(c.units, 0)::int as "units",
           o."groupNumber" as "groupNumber",
           (pu."firstName" || ' ' || pu."lastName") as "professorName",
           en.status as "status"
      from enrollments en
      join course_offerings o on o.id = en."offeringId"
      join courses c on c.id = o."courseId"
      left join staff st on st.id = o."professorId"
      left join users pu on pu.id = st."userId"
     where en."studentId" = ${stu.studentId}
       and o."termId" = ${term.id}
       and en.status <> 'DROPPED'
     order by c.title
  `)).rows ?? []) as unknown as {
    courseTitle: string; courseCode: string; units: number;
    groupNumber: number; professorName: string | null; status: string;
  }[];

  if (!courses.length) {
    return { ok: false, reason: 'EMPTY', message: 'برای این دانشجو در این نیمسال ثبت‌نامی (به‌جز حذف‌شده) وجود ندارد.' };
  }

  return {
    ok: true,
    studentId: stu.studentId,
    studentName: `${stu.firstName} ${stu.lastName}`,
    studentCode: stu.studentCode,
    nationalIdMasked: maskNationalCode(stu.nationalCode),
    majorName: stu.majorName,
    termId: term.id,
    termTitle: term.title,
    courses,
    totalUnits: courses.reduce((s, c) => s + (Number(c.units) || 0), 0),
    checkedAt: new Date().toISOString(),
  };
}

// ─────────────────── هـ) کارنامهٔ مالی دانشجو (گزارش چاپی با QR) ───────────────────

export type FinanceStatementVerification =
  | { ok: false; reason: 'BAD_TOKEN' | 'EXPIRED' | 'NOT_FOUND' | 'EMPTY'; message: string }
  | {
      ok: true;
      studentId: number;
      studentName: string;
      studentCode: string;
      nationalIdMasked: string;
      majorName: string | null;
      totals: {
        charges: number;
        discounts: number;
        sponsorships: number;
        payments: number;
        balance: number;
        chequesPending: number;
      };
      terms: {
        termTitle: string;
        charges: number;
        discounts: number;
        payments: number;
        balance: number;
      }[];
      checkedAt: string;
    };

/** توکن کارنامهٔ مالی — امضاشده و میان‌مدت (پیش‌فرض ۳۰ روز، سقف ۱ سال) */
export async function issueFinanceStatementToken(userId: number): Promise<{ token: string; expiresAt: string }> {
  const configured = await getNumber('FINANCE_STMT_TTL_MINUTES', 43200);
  if (!Number.isFinite(configured) || configured <= 0) {
    log.warn('finance_stmt_ttl_invalid', { configured });
    throw new Error('مدت اعتبار کارنامهٔ مالی (FINANCE_STMT_TTL_MINUTES) باید عددی بزرگ‌تر از صفر باشد.');
  }
  const ttlMin = Math.min(configured, 525600); // سقف ۱ سال — کارنامه نباید دائمی شود
  const token = await signToken({ uid: userId, kind: 'FINANCE_STMT' }, ttlMin * 60);
  return { token, expiresAt: new Date(Date.now() + ttlMin * 60_000).toISOString() };
}

export async function verifyFinanceStatement(rawToken: string): Promise<FinanceStatementVerification> {
  const sig = await verifyTokenSignature<{ uid: number; kind: string }>(rawToken);
  if (!sig.ok) {
    return {
      ok: false,
      reason: sig.reason === 'EXPIRED' ? 'EXPIRED' : 'BAD_TOKEN',
      message: sig.reason === 'EXPIRED'
        ? 'این کارنامه منقضی شده است؛ دانشجو باید از سامانه کارنامهٔ تازه بگیرد.'
        : 'توکن نامعتبر یا دستکاری‌شده است.',
    };
  }
  if (sig.payload.kind !== 'FINANCE_STMT') return { ok: false, reason: 'BAD_TOKEN', message: 'نوع توکن با کارنامهٔ مالی همخوانی ندارد.' };

  const [stu] = await db
    .select({
      studentId: students.id, studentCode: students.studentCode,
      firstName: users.firstName, lastName: users.lastName, nationalCode: users.nationalCode,
      majorName: majors.name,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .where(eq(users.id, sig.payload.uid))
    .limit(1);
  if (!stu) return { ok: false, reason: 'NOT_FOUND', message: 'دانشجویی با این توکن یافت نشد.' };

  // کارنامهٔ زنده از موتور مالی (تک‌منبع: getStudentFinance) — استعلام برخط، بدون اسنپ‌شات جدا
  const fin = await getStudentFinance(stu.studentId);
  if (!fin || fin.transcript.length === 0) {
    return { ok: false, reason: 'EMPTY', message: 'برای این دانشجو هیچ تراکنش مالی ثبت نشده است.' };
  }

  return {
    ok: true,
    studentId: stu.studentId,
    studentName: `${stu.firstName} ${stu.lastName}`,
    studentCode: stu.studentCode,
    nationalIdMasked: maskNationalCode(stu.nationalCode),
    majorName: stu.majorName,
    totals: {
      charges: fin.totals.charges,
      discounts: fin.totals.discounts,
      sponsorships: fin.totals.sponsorships,
      payments: fin.totals.payments,
      balance: fin.totals.balance,
      chequesPending: fin.totals.chequesPending,
    },
    terms: fin.transcript.map((t) => ({
      termTitle: t.termTitle,
      charges: t.charges,
      discounts: t.discounts,
      payments: t.payments,
      balance: t.balance,
    })),
    checkedAt: new Date().toISOString(),
  };
}

// ─────────────────── ج) اصالت‌سنجی کارنامهٔ تحصیلی ───────────────────
export type TranscriptVerification =
  | { ok: false; reason: 'BAD_TOKEN' | 'EXPIRED' | 'NOT_FOUND' | 'EMPTY'; message: string }
  | {
      ok: true;
      studentId: number;
      studentName: string;
      studentCode: string;
      nationalIdMasked: string;
      majorName: string | null;
      degreeTitle: string | null;
      entryYear: number | null;
      gpa: number;
      totalUnits: number;
      passedUnits: number;
      policy: string;
      checkedAt: string;
    };

/** توکن کارنامهٔ تحصیلی — امضاشده و میان‌مدت (پیش‌فرض ۳۰ روز، سقف ۱ سال) */
export async function issueTranscriptToken(userId: number): Promise<{ token: string; expiresAt: string }> {
  const configured = await getNumber('TRANSCRIPT_TTL_MINUTES', 43200);
  if (!Number.isFinite(configured) || configured <= 0) {
    throw new Error('مدت اعتبار کارنامهٔ تحصیلی (TRANSCRIPT_TTL_MINUTES) باید عددی بزرگ‌تر از صفر باشد.');
  }
  const ttlMin = Math.min(configured, 525600);
  const token = await signToken({ uid: userId, kind: 'TRANSCRIPT' }, ttlMin * 60);
  return { token, expiresAt: new Date(Date.now() + ttlMin * 60_000).toISOString() };
}

/**
 * استعلام برخط کارنامهٔ تحصیلی — خلاصهٔ رسمی (هویت + واحدها + معدل).
 * ارقام زنده از موتور قوانین آموزشی (`calculateOfficialGPA`) خوانده می‌شود، پس
 * استعلام هیچ‌وقت با کارنامهٔ چاپی واگرا نمی‌شود.
 */
export async function verifyTranscript(rawToken: string): Promise<TranscriptVerification> {
  const sig = await verifyTokenSignature<{ uid: number; kind: string }>(rawToken);
  if (!sig.ok) {
    return {
      ok: false,
      reason: sig.reason === 'EXPIRED' ? 'EXPIRED' : 'BAD_TOKEN',
      message: sig.reason === 'EXPIRED'
        ? 'این کارنامهٔ تحصیلی منقضی شده است؛ دانشجو باید از سامانه کارنامهٔ تازه بگیرد.'
        : 'توکن نامعتبر یا دستکاری‌شده است.',
    };
  }
  if (sig.payload.kind !== 'TRANSCRIPT') {
    return { ok: false, reason: 'BAD_TOKEN', message: 'نوع توکن با کارنامهٔ تحصیلی همخوانی ندارد.' };
  }

  const [stu] = await db
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      entryYear: students.entryYear,
      firstName: users.firstName,
      lastName: users.lastName,
      nationalCode: users.nationalCode,
      majorName: majors.name,
      degreeTitle: degree_level_configs.title,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
    .where(eq(users.id, sig.payload.uid))
    .limit(1);
  if (!stu) return { ok: false, reason: 'NOT_FOUND', message: 'دانشجویی با این توکن یافت نشد.' };

  const gpaData = await calculateOfficialGPA(stu.studentId).catch(() => null);
  if (!gpaData) {
    return { ok: false, reason: 'EMPTY', message: 'محاسبهٔ کارنامهٔ تحصیلی برای این دانشجو ممکن نشد.' };
  }

  return {
    ok: true,
    studentId: stu.studentId,
    studentName: `${stu.firstName} ${stu.lastName}`,
    studentCode: stu.studentCode,
    nationalIdMasked: maskNationalCode(stu.nationalCode),
    majorName: stu.majorName,
    degreeTitle: stu.degreeTitle,
    entryYear: stu.entryYear ?? null,
    gpa: gpaData.gpa,
    totalUnits: gpaData.totalUnits,
    passedUnits: gpaData.passedUnits,
    policy: String(gpaData.policy ?? ''),
    checkedAt: new Date().toISOString(),
  };
}

// ─────────────────── د) اصالت‌سنجی گواهینامهٔ دوره‌های آزاد ───────────────────
/** اثر انگشت SHA-256 روی فیلدهای اساسی گواهینامه — برای کشف دستکاری */
export function certificateFingerprint(input: {
  certificateNumber: string; learnerId: number; courseId: number; grade: string | number; totalHours: number; issueDate: string;
}): string {
  const canonical = [
    input.certificateNumber.trim().toUpperCase(),
    input.learnerId, input.courseId,
    Number(input.grade).toFixed(2),
    input.totalHours,
    String(input.issueDate).trim(),
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export type CertificateVerdict = 'VALID' | 'REVOKED' | 'NOT_FOUND' | 'TAMPERED';

export type CertificateVerification =
  | { verdict: 'NOT_FOUND' }
  | {
      verdict: Exclude<CertificateVerdict, 'NOT_FOUND'>;
      certificateNumber: string;
      verificationHash: string;
      fullNameFa: string;
      fullNameEn: string | null;
      nationalIdMasked: string;
      courseTitleFa: string;
      courseTitleEn: string | null;
      instructorName: string;
      courseHours: number;
      grade: number;
      gradeStatus: string;
      issueDate: string;
      message: string;
    };

const gradeLabel = (g: number) => (g >= 19 ? 'عالی (A+)' : g >= 17 ? 'خیلی خوب (A)' : g >= 15 ? 'خوب (B)' : 'قبول (Pass)');

export async function issueShortTermCertificate(registrationId: number) {
  // check-then-insert اتمیک: قفل FOR UPDATE روی ثبت‌نام (سریال‌سازی صدور
  // تکراری برای یک ثبت‌نام) + قفل توافقی برای شمارهٔ سریال سراسری.
  return db.transaction(async tx => {
    const [reg] = await tx
      .select()
      .from(short_term_registrations)
      .where(eq(short_term_registrations.id, registrationId))
      .limit(1)
      .for('update');
    if (!reg) throw new Error('ثبت‌نام یافت نشد.');
    if (!reg.isPassed) throw new Error('فقط برای پذیرفته‌شدگان گواهینامه صادر می‌شود.');
    if (reg.certificateIssued) throw new Error('برای این ثبت‌نام پیش‌تر گواهینامه صادر شده است.');

    const [course] = await tx.select().from(short_term_courses).where(eq(short_term_courses.id, reg.courseId)).limit(1);
    const [learner] = await tx.select().from(short_term_learners).where(eq(short_term_learners.id, reg.learnerId)).limit(1);
    if (!course || !learner) throw new Error('دوره یا شرکت‌کننده یافت نشد.');

    // شمارهٔ سریال از دنبالهٔ پایگاه داده (نه count(*) که در race تکراری می‌دهد).
    // init زیر قفل توافقی انجام می‌شود تا دو تراکنش همزمان دنباله را به عقب برنگردانند.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('short_term_certificate_seq', 0))`);
    await tx.execute(sql`CREATE SEQUENCE IF NOT EXISTS short_term_certificate_seq`);
    await tx.execute(sql`
      SELECT setval('short_term_certificate_seq',
        GREATEST((SELECT count(*)::int FROM short_term_certificates),
                 (SELECT last_value::int FROM short_term_certificate_seq)), true)
    `);
    const seqRes = await tx.execute(sql`SELECT nextval('short_term_certificate_seq') AS seq`);
    const seq = Number((seqRes.rows[0] as unknown as { seq: string | number }).seq);
    if (!Number.isFinite(seq) || seq <= 0) throw new Error('تولید شمارهٔ گواهینامه ناموفق بود.');
    const year = new Date().getFullYear();
    const certificateNumber = `AFQ-CERT-${year}-${String(1000 + seq)}`;
    const grade = Number(reg.finalGrade ?? 0);
    const issueDate = `${year}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${String(new Date().getDate()).padStart(2, '0')}`;
    const verificationHash = certificateFingerprint({
      certificateNumber, learnerId: reg.learnerId, courseId: reg.courseId, grade, totalHours: course.hours, issueDate,
    });

    const [ins] = await tx.insert(short_term_certificates).values({
      certificateNumber, verificationHash,
      learnerId: reg.learnerId, courseId: reg.courseId, registrationId: reg.id,
      fullNameFa: learner.fullName, fullNameEn: learner.fullNameEn,
      courseTitleFa: course.title, courseTitleEn: course.titleEn,
      grade: String(grade), totalHours: course.hours, issueDate,
      universityId: reg.universityId ?? course.universityId ?? learner.universityId ?? null,
    }).returning({ id: short_term_certificates.id });

    await tx.update(short_term_registrations)
      .set({ certificateIssued: 1, certificateId: ins.id })
      .where(eq(short_term_registrations.id, reg.id));

    log.info('certificate_issued', { certificateNumber, registrationId: reg.id });
    return { id: ins.id, certificateNumber, verificationHash };
  });
}

export async function revokeCertificate(certificateNumber: string) {
  await db.update(short_term_certificates).set({ isRevoked: 1 }).where(eq(short_term_certificates.certificateNumber, certificateNumber.trim().toUpperCase()));
}

/** اصالت‌سنجی عمومی — اثر انگشت دوباره محاسبه و با مقدار ذخیره‌شده مقایسه می‌شود */
export async function verifyCertificate(rawCode: string): Promise<CertificateVerification> {
  const code = String(rawCode ?? '').trim().toUpperCase();
  const [c] = await db
    .select({
      certificateNumber: short_term_certificates.certificateNumber,
      verificationHash: short_term_certificates.verificationHash,
      fullNameFa: short_term_certificates.fullNameFa,
      fullNameEn: short_term_certificates.fullNameEn,
      courseTitleFa: short_term_certificates.courseTitleFa,
      courseTitleEn: short_term_certificates.courseTitleEn,
      grade: short_term_certificates.grade,
      totalHours: short_term_certificates.totalHours,
      issueDate: short_term_certificates.issueDate,
      isRevoked: short_term_certificates.isRevoked,
      learnerId: short_term_certificates.learnerId,
      courseId: short_term_certificates.courseId,
      nationalId: short_term_learners.nationalId,
      instructorName: short_term_courses.instructorName,
    })
    .from(short_term_certificates)
    .innerJoin(short_term_learners, eq(short_term_learners.id, short_term_certificates.learnerId))
    .innerJoin(short_term_courses, eq(short_term_courses.id, short_term_certificates.courseId))
    .where(eq(short_term_certificates.certificateNumber, code))
    .limit(1);

  if (!c) return { verdict: 'NOT_FOUND' };

  const recomputed = certificateFingerprint({
    certificateNumber: c.certificateNumber, learnerId: c.learnerId, courseId: c.courseId,
    grade: c.grade, totalHours: c.totalHours, issueDate: c.issueDate,
  });
  const grade = Math.round(Number(c.grade) * 100) / 100;
  const base = {
    certificateNumber: c.certificateNumber,
    verificationHash: c.verificationHash,
    fullNameFa: c.fullNameFa,
    fullNameEn: c.fullNameEn,
    nationalIdMasked: maskNationalCode(c.nationalId),
    courseTitleFa: c.courseTitleFa,
    courseTitleEn: c.courseTitleEn,
    instructorName: c.instructorName,
    courseHours: c.totalHours,
    grade,
    gradeStatus: gradeLabel(grade),
    issueDate: c.issueDate,
  };

  if (recomputed !== c.verificationHash) {
    log.warn('certificate_tampered', { certificateNumber: c.certificateNumber });
    return { ...base, verdict: 'TAMPERED', message: 'اثر انگشت امنیتی گواهینامه با محتوای آن همخوانی ندارد — احتمال دستکاری در سوابق.' };
  }
  if (c.isRevoked) return { ...base, verdict: 'REVOKED', message: 'این گواهینامه توسط اداره کل آموزش باطل شده است.' };
  return { ...base, verdict: 'VALID', message: 'گواهینامه معتبر است و در سوابق دانشگاه آفاق ثبت شده است.' };
}

// ─────────────────── د) دادهٔ کارت ورود به جلسه (پنل دانشجو) ───────────────────

export type ExamCardData = {
  studentId: number;
  studentCode: string;
  fullName: string;
  nationalIdMasked: string;
  majorName: string | null;
  entryYear: number | null;
  termTitle: string;
  debt: number;
  isFinancialCleared: boolean;
  courses: {
    enrollmentId: number;
    courseCode: string;
    courseTitle: string;
    units: number;
    professorName: string | null;
    classRoomName: string | null;
    examDate: string;
    examTime: string;
    examHall: string | null;
    seatNumber: number | null;
    hasEvaluated: boolean;
  }[];
};

/**
 * دادهٔ واقعی کارت ورود به جلسه برای پنل دانشجو.
 *
 * پیش‌تر این صفحه چهار درس ساختگی با «سالن آمفی‌تئاتر مرکزی / صندلی ۳۰۱» و
 * بدهی ثابت ۵٬۰۰۰٬۰۰۰ ریال نشان می‌داد و دکمهٔ پرداخت فقط یک setState بود.
 * حالا درس‌ها از ثبت‌نام‌های واقعی، سالن/صندلی از تخصیص صندلی (و در نبود آن از
 * زمان‌بندی EXAM) و بدهی از دفتر کل مالی خوانده می‌شود.
 */
export async function getExamCardData(
  userId: number,
  resolvedTerm?: { id: number; title: string } | null,
): Promise<ExamCardData | null> {
  const [stu] = await db
    .select({
      studentId: students.id, studentCode: students.studentCode, entryYear: students.entryYear,
      universityId: students.universityId,
      firstName: users.firstName, lastName: users.lastName, nationalCode: users.nationalCode,
      majorName: majors.name,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!stu) return null;

  const term = resolvedTerm !== undefined ? resolvedTerm : await currentTermFor(stu.universityId);
  const debt = await studentDebtRials(stu.studentId);

  const rows = ((await db.execute(sql`
    select en.id as "enrollmentId",
           c.code as "courseCode", c.title as "courseTitle", coalesce(c.units, 0)::int as "units",
           (pu."firstName" || ' ' || pu."lastName") as "professorName",
           cr.name as "classRoomName",
           coalesce(es."examDate", sc."examDate"::text, '') as "examDate",
           coalesce(es."startTime", sc."startTime"::text, '') as "startTime",
           coalesce(es."endTime", sc."endTime"::text, '') as "endTime",
           eh.name as "hallName", sa."seatNumber" as "seatNumber",
           en."hasEvaluated"::int as "hasEvaluated"
      from enrollments en
      join course_offerings o on o.id = en."offeringId"
      join courses c on c.id = o."courseId"
      left join staff st on st.id = o."professorId"
      left join users pu on pu.id = st."userId"
      left join schedules sc on sc."offeringId" = o.id and sc."scheduleType" = 'EXAM'
      left join classrooms cr on cr.id = sc."roomId"
      left join seat_allocations sa on sa."enrollmentId" = en.id
      left join exam_sessions es on es.id = sa."sessionId"
      left join exam_halls eh on eh.id = sa."hallId"
     where en."studentId" = ${stu.studentId}
       and (${term ? sql`o."termId" = ${term.id}` : sql`true`})
     order by coalesce(es."examDate", sc."examDate"::text, ''), coalesce(es."startTime", sc."startTime"::text, '')
  `)).rows ?? []) as unknown as {
    enrollmentId: number; courseCode: string; courseTitle: string; units: number;
    professorName: string | null; classRoomName: string | null; examDate: string;
    startTime: string; endTime: string; hallName: string | null; seatNumber: number | null; hasEvaluated: number;
  }[];

  return {
    studentId: stu.studentId,
    studentCode: stu.studentCode,
    fullName: `${stu.firstName} ${stu.lastName}`,
    nationalIdMasked: maskNationalCode(stu.nationalCode),
    majorName: stu.majorName,
    entryYear: stu.entryYear,
    termTitle: term?.title ?? '—',
    debt,
    isFinancialCleared: debt === 0,
    courses: rows.map(r => ({
      enrollmentId: r.enrollmentId,
      courseCode: r.courseCode,
      courseTitle: r.courseTitle,
      units: r.units,
      professorName: r.professorName,
      classRoomName: r.classRoomName,
      examDate: r.examDate || '—',
      examTime: r.startTime ? `${r.startTime} – ${r.endTime}` : '—',
      examHall: r.hallName,
      seatNumber: r.seatNumber,
      hasEvaluated: r.hasEvaluated === 1,
    })),
  };
}
