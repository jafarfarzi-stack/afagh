import { randomBytes, scryptSync } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, course_offerings, courses, enrollments, financial_clearances, majors,
  migration_runs, student_ledger, students, users,
} from '@/db/schema';
import { boolFa, checkNationalCode, dateFa, norm, num, parseCsv, pickCol } from './normalize';

// ═══ سامانهٔ مهاجرت داده از سیستم قدیمی — آموزشی + مالی ═══
// معماری: parse → normalize → validate → (dry-run گزارش | commit تراکنشی idempotent)
// ورودی: CSV/متن با سرستون‌های فارسی یا انگلیسی (نامک‌ها انعطاف‌پذیر)

export type Entity = 'student' | 'course' | 'term' | 'enrollment' | 'ledger' | 'clearance';
export const ENTITIES: { id: Entity; title: string; sample: string }[] = [
  { id: 'student', title: 'دانشجویان (هویت + پرونده)', sample: 'کد ملی, نام, نام خانوادگی, شماره دانشجویی, سال ورود, رشته, وضعیت' },
  { id: 'course', title: 'دروس', sample: 'کد درس, نام درس, واحد, نوع' },
  { id: 'term', title: 'ترم‌ها', sample: 'کد ترم, عنوان ترم, ترم جاری' },
  { id: 'enrollment', title: 'ثبت‌نام‌ها و نمرات (آموزشی)', sample: 'شماره دانشجویی, کد درس, کد ترم, نمره, وضعیت نمره' },
  { id: 'ledger', title: 'صورتحساب دانشجویان (مالی)', sample: 'شماره دانشجویی, کد ترم, نوع, مبلغ, شرح, تاریخ' },
  { id: 'clearance', title: 'تسویه‌حساب ترمی (مالی)', sample: 'شماره دانشجویی, کد ترم, تسویه' },
];

export type RowIssue = { row: number; msg: string };
export type Report = {
  entity: Entity; fileName: string; total: number; invalid: number;
  willInsert: number; existing: number;
  errors: RowIssue[]; warnings: RowIssue[];
  sample: Record<string, unknown>[];
};

const STUDENT_STATUS: Record<string, string> = {
  'فعال': 'ACTIVE', 'active': 'ACTIVE',
  'مسدود': 'BLOCKED_COMMISSION', 'blocked': 'BLOCKED_COMMISSION',
  'فارغ التحصیل': 'GRADUATED', 'فارغ‌التحصیل': 'GRADUATED', 'graduated': 'GRADUATED',
  'اخراج': 'EXPELLED', 'انصراف': 'EXPELLED', 'expelled': 'EXPELLED',
};
const GRADE_STATUS: Record<string, string> = { 'قطعی': 'FINALIZED', 'موقت': 'TEMPORARY', 'finalized': 'FINALIZED', 'temporary': 'TEMPORARY' };
const TX_TYPE: Record<string, string> = {
  'بدهی': 'DEBIT', 'قبض': 'DEBIT', 'debit': 'DEBIT', 'طلب': 'CREDIT', 'بستانکار': 'CREDIT',
  'پرداخت': 'CREDIT', 'واریز': 'CREDIT', 'credit': 'CREDIT', 'برگشت': 'CREDIT',
};

function hashDefault(nationalCode: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(nationalCode, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex')}`;
}

type Prepared = {
  report: Report;
  rows: Record<string, unknown>[];   // ردیف‌های سالمِ نرمال‌شده آمادهٔ درج
  rowNumbers: number[];              // شمارهٔ خط هر ردیف سالم
};

// ── مرحلهٔ ۱+۲: تجزیه و اعتبارسنجی ──
function prepare(entity: Entity, text: string, fileName: string): Prepared {
  const table = parseCsv(text);
  const report: Report = { entity, fileName, total: 0, invalid: 0, willInsert: 0, existing: 0, errors: [], warnings: [], sample: [] };
  if (table.length < 2) { report.errors.push({ row: 0, msg: 'فایل خالی یا بدون ردیف داده است.' }); return { report, rows: [], rowNumbers: [] }; }
  const headers = table[0];
  const body = table.slice(1);
  report.total = body.length;

  const col = (aliases: string[]) => pickCol(headers, aliases).idx;
  const rows: Record<string, unknown>[] = [];
  const rowNumbers: number[] = [];

  body.forEach((r, i) => {
    const ln = i + 2; // شمارهٔ خط انسانی (۱ = سرستون)
    const get = (aliases: string[]) => (col(aliases) >= 0 ? norm(r[col(aliases)]) : '');
    const err = (m: string) => report.errors.push({ row: ln, msg: m });
    const warn = (m: string) => report.warnings.push({ row: ln, msg: m });

    if (entity === 'student') {
      const nc = get(['کد ملی', 'کدملی', 'national_code', 'nationalcode', 'ncode']);
      const first = get(['نام', 'first_name', 'firstname']);
      const last = get(['نام خانوادگی', 'نامخانوادگی', 'last_name', 'lastname']);
      const code = get(['شماره دانشجویی', 'شمارهدانشجویی', 'student_code', 'studentcode']);
      const entryYear = num(get(['سال ورود', 'ورودی', 'entry_year']));
      const majorName = get(['رشته', 'گرایش', 'major']);
      const statusFa = get(['وضعیت']) || 'فعال';
      if (!nc || !first || !last || !code) return err('کد ملی/نام/نام خانوادگی/شماره دانشجویی الزامی است.');
      const chk = checkNationalCode(nc);
      if (chk === 'format') return err(`کد ملی نامعتبر: ${nc}`);
      if (chk === 'checksum') warn(`چک‌سام کد ملی ${nc} منطبق نیست (ثبت می‌شود — در سیستم قدیمی هم رایج است).`);
      if (!/^\d{8,14}$/.test(code)) return err(`شماره دانشجویی نامعتبر: ${code}`);
      if (!entryYear || entryYear < 1330 || entryYear > 1410) warn(`سال ورود نامعمول: ${entryYear}`);
      const status = STUDENT_STATUS[statusFa] ?? (/^[A-Z_]+$/.test(statusFa) ? statusFa : 'ACTIVE');
      rows.push({ nationalCode: nc, firstName: first, lastName: last, studentCode: code, entryYear: entryYear ?? 1400, majorName, status });
    }

    if (entity === 'course') {
      const code = get(['کد درس', 'کددرس', 'course_code', 'code']);
      const title = get(['نام درس', 'عنوان درس', 'title']);
      const units = num(get(['واحد', 'تعداد واحد', 'units']));
      const type = get(['نوع', 'نوع درس', 'course_type']);
      if (!code || !title) return err('کد درس و نام درس الزامی است.');
      if (units == null || units <= 0 || units > 12) return err(`واحد نامعتبر: ${get(['واحد', 'تعداد واحد', 'units'])}`);
      rows.push({ code, title, units, courseType: type || null });
    }

    if (entity === 'term') {
      const code = get(['کد ترم', 'کدترم', 'term_code', 'code']);
      const title = get(['عنوان ترم', 'نام ترم', 'title']) || `ترم ${code}`;
      const isCurrent = boolFa(get(['ترم جاری', 'جاری', 'is_current']));
      if (!code || !/^\d{3,4}$/.test(code)) return err(`کد ترم نامعتبر: ${code}`);
      rows.push({ termCode: code, title, isCurrent });
    }

    if (entity === 'enrollment') {
      const sc = get(['شماره دانشجویی', 'student_code']);
      const cc = get(['کد درس', 'course_code']);
      const tc = get(['کد ترم', 'term_code']);
      const grade = num(get(['نمره', 'grade', 'نمره نهایی']));
      const gsRaw = get(['وضعیت نمره', 'grade_status']) || 'قطعی';
      if (!sc || !cc || !tc) return err('شماره دانشجویی، کد درس و کد ترم الزامی است.');
      if (grade != null && (grade < 0 || grade > 20)) return err(`نمره خارج از بازه: ${grade}`);
      rows.push({ studentCode: sc, courseCode: cc, termCode: tc, gradeValue: grade, gradeStatus: grade == null ? 'PENDING' : (GRADE_STATUS[gsRaw] ?? 'FINALIZED') });
    }

    if (entity === 'ledger') {
      const sc = get(['شماره دانشجویی', 'student_code']);
      const tc = get(['کد ترم', 'term_code']);
      const ttRaw = get(['نوع', 'نوع تراکنش', 'type']);
      const amount = num(get(['مبلغ', 'amount']));
      const desc = get(['شرح', 'توضیحات', 'description']) || 'مهاجرت از سیستم قدیمی';
      const dt = dateFa(get(['تاریخ', 'تاریخ تراکنش', 'date']));
      const tt = TX_TYPE[ttRaw] ?? (/^[A-Z]+$/.test(ttRaw) ? ttRaw : null);
      if (!sc) return err('شماره دانشجویی الزامی است.');
      if (!tt) return err(`نوع تراکنش نامعتبر: «${ttRaw}» (بدهی/پرداخت)`);
      if (amount == null || amount <= 0) return err(`مبلغ نامعتبر: ${get(['مبلغ', 'amount'])}`);
      rows.push({ studentCode: sc, termCode: tc, transactionType: tt, amount: Math.round(amount), description: desc, createdAt: dt ?? new Date() });
    }

    if (entity === 'clearance') {
      const sc = get(['شماره دانشجویی', 'student_code']);
      const tc = get(['کد ترم', 'term_code']);
      const cleared = boolFa(get(['تسویه', 'وضعیت تسویه', 'cleared']));
      if (!sc || !tc) return err('شماره دانشجویی و کد ترم الزامی است.');
      rows.push({ studentCode: sc, termCode: tc, isCleared: cleared });
    }
  });

  report.invalid = report.errors.length;
  report.sample = rows.slice(0, 5);
  return { report, rows, rowNumbers: rows.map((_, i) => i) };
}

// ── مرحلهٔ ۳: dry-run — شبیه‌سازی بدون نوشتن ──
export async function dryRun(entity: Entity, text: string, fileName: string): Promise<Report> {
  const { report, rows } = prepare(entity, text, fileName);
  const codes = rows.map(r => String(r.studentCode ?? ''));

  if (entity === 'student') {
    const exUsers = await db.select({ c: users.nationalCode }).from(users).where(inArray(users.nationalCode, rows.map(r => String(r.nationalCode))));
    const exStudents = await db.select({ c: students.studentCode }).from(students).where(inArray(students.studentCode, codes));
    const u = new Set(exUsers.map(x => x.c)); const s = new Set(exStudents.map(x => x.c));
    for (const r of rows) {
      const dup = u.has(String(r.nationalCode)) || s.has(String(r.studentCode));
      if (dup) { report.existing++; report.warnings.push({ row: 0, msg: `${r.studentCode} از قبل موجود است — نادیده گرفته می‌شود.` }); }
      else report.willInsert++;
    }
  }
  if (entity === 'course') {
    const ex = new Set((await db.select({ c: courses.code }).from(courses).where(inArray(courses.code, rows.map(r => String(r.code))))).map(x => x.c));
    for (const r of rows) ex.has(String(r.code)) ? report.existing++ : report.willInsert++;
  }
  if (entity === 'term') {
    const ex = new Set((await db.select({ c: academic_terms.termCode }).from(academic_terms).where(inArray(academic_terms.termCode, rows.map(r => String(r.termCode))))).map(x => x.c));
    for (const r of rows) ex.has(String(r.termCode)) ? report.existing++ : report.willInsert++;
  }
  if (entity === 'enrollment' || entity === 'ledger' || entity === 'clearance') {
    const known = new Set((await db.select({ c: students.studentCode }).from(students).where(inArray(students.studentCode, codes))).map(x => x.c));
    for (const r of rows) {
      if (!known.has(String(r.studentCode))) { report.invalid++; report.errors.push({ row: 0, msg: `دانشجو ${r.studentCode} در سامانه نیست — اول فایل دانشجویان را مهاجرت کنید.` }); }
      else report.willInsert++;
    }
  }
  report.errors = report.errors.slice(0, 50);
  report.warnings = report.warnings.slice(0, 50);
  return report;
}

// ── مرحلهٔ ۴: commit — درج تراکنشی idempotent + تاریخچه ──
export async function commit(userId: number, entity: Entity, text: string, fileName: string): Promise<Report> {
  const { report, rows } = prepare(entity, text, fileName);
  let inserted = 0; let existing = 0;

  if (entity === 'student') {
    const degId = 1;   // کارشناسی پیوسته (پیش‌فرض مهاجرت — در کد قابل تنظیم)
    const regId = 1;   // آیین‌نامهٔ پیش‌فرض کارشناسی
    const majorRows = await db.select().from(majors);
    for (const r of rows) {
      const major = majorRows.find(m => norm(m.name) === norm(String(r.majorName))) ?? null;
      if (String(r.majorName) && !major) report.warnings.push({ row: 0, msg: `رشتهٔ «${r.majorName}» یافت نشد — بدون رشته ثبت شد.` });
      const res = await db.transaction(async tx => {
        let [u] = await tx.insert(users).values({
          nationalCode: String(r.nationalCode), firstName: String(r.firstName), lastName: String(r.lastName),
          passwordHash: hashDefault(String(r.nationalCode)),   // رمز اولیه = کد ملی (کاربر بعداً عوض می‌کند)
        }).onConflictDoNothing().returning({ id: users.id });
        if (!u) {
          [u] = await tx.select({ id: users.id }).from(users).where(eq(users.nationalCode, String(r.nationalCode))).limit(1);
          const [exSt] = await tx.select({ id: students.id }).from(students).where(eq(students.studentCode, String(r.studentCode))).limit(1);
          if (exSt) return false; // موجود
        }
        const [st] = await tx.insert(students).values({
          userId: u.id, studentCode: String(r.studentCode), majorId: major?.id ?? null,
          degreeLevelId: degId, regulationId: regId, entryYear: Number(r.entryYear), entryTerm: 1, status: String(r.status),
        }).onConflictDoNothing().returning({ id: students.id });
        return !!st;
      });
      res ? inserted++ : existing++;
    }
  }

  if (entity === 'course') {
    for (const r of rows) {
      const r0 = await db.insert(courses).values({
        code: String(r.code), title: String(r.title), units: String(r.units), courseType: r.courseType ? String(r.courseType) : null,
      }).onConflictDoNothing().returning({ id: courses.id });
      r0.length ? inserted++ : existing++;
    }
  }

  if (entity === 'term') {
    for (const r of rows) {
      const r0 = await db.insert(academic_terms).values({
        termCode: String(r.termCode), title: String(r.title), isCurrent: r.isCurrent ? 1 : 0,
      }).onConflictDoNothing().returning({ id: academic_terms.id });
      if (r0.length) {
        inserted++;
        if (r.isCurrent) {
          await db.update(academic_terms).set({ isCurrent: 0 });          // فقط یک ترم جاری
          await db.update(academic_terms).set({ isCurrent: 1 }).where(eq(academic_terms.id, r0[0].id));
        }
      } else existing++;
    }
  }

  if (entity === 'enrollment') {
    const stu = await db.select({ id: students.id, code: students.studentCode }).from(students);
    const crs = await db.select({ id: courses.id, code: courses.code }).from(courses);
    const trm = await db.select({ id: academic_terms.id, code: academic_terms.termCode }).from(academic_terms);
    for (const r of rows) {
      const s = stu.find(x => x.code === String(r.studentCode));
      const t = trm.find(x => x.code === String(r.termCode));
      if (!s || !t) { report.errors.push({ row: 0, msg: `${r.studentCode}/${r.termCode} یافت نشد.` }); continue; }
      let c = crs.find(x => x.code === String(r.courseCode));
      if (!c) { // درس قدیمی — placeholder می‌سازیم تا نمره برنامهٔ درسی جدید را خراب نکند
        const warnBak = report.warnings.length;
        const [nc] = await db.insert(courses).values({ code: String(r.courseCode), title: `درس مهاجرتی ${r.courseCode}`, units: '0' }).onConflictDoNothing().returning({ id: courses.id });
        if (nc) { c = { id: nc.id, code: String(r.courseCode) }; crs.push(c); report.warnings.push({ row: 0, msg: `درس ${r.courseCode} نبود — به‌صورت placeholder ساخته شد.` }); }
        else { const [ex] = await db.select({ id: courses.id, code: courses.code }).from(courses).where(eq(courses.code, String(r.courseCode))); c = ex; crs.push(c); }
        void warnBak;
      }
      // ارائهٔ مهاجرتی: یک گروه با ظرفیت باز برای آن ترم/درس
      let [off] = await db.select({ id: course_offerings.id }).from(course_offerings)
        .where(and(eq(course_offerings.termId, t.id), eq(course_offerings.courseId, c.id))).limit(1);
      if (!off) {
        [off] = await db.insert(course_offerings).values({
          termId: t.id, courseId: c.id, capacity: 999, groupNumber: 1, enrolledCount: 0, isActive: 1,
        }).returning({ id: course_offerings.id });
      }
      const r0 = await db.insert(enrollments).values({
        studentId: s.id, offeringId: off.id, status: 'REGISTERED',
        gradeValue: r.gradeValue != null ? String(r.gradeValue) : null,
        gradeStatus: String(r.gradeStatus), hasEvaluated: r.gradeValue != null ? 1 : 0,
      }).onConflictDoNothing().returning({ id: enrollments.id });
      r0.length ? inserted++ : existing++;
    }
  }

  if (entity === 'ledger') {
    const stu = await db.select({ id: students.id, code: students.studentCode }).from(students);
    const trm = await db.select({ id: academic_terms.id, code: academic_terms.termCode }).from(academic_terms);
    for (const r of rows) {
      const s = stu.find(x => x.code === String(r.studentCode));
      const t = trm.find(x => x.code === String(r.termCode));
      if (!s) { report.errors.push({ row: 0, msg: `دانشجو ${r.studentCode} یافت نشد.` }); continue; }
      const dup = await db.select({ id: student_ledger.id }).from(student_ledger)
        .where(and(eq(student_ledger.studentId, s.id), eq(student_ledger.amount, String(r.amount)), eq(student_ledger.description, String(r.description)))).limit(1);
      if (dup.length) { existing++; continue; }
      await db.insert(student_ledger).values({
        studentId: s.id, termId: t?.id ?? null, transactionType: String(r.transactionType),
        amount: String(r.amount), description: `[مهاجرت] ${r.description}`,
        createdAt: r.createdAt as Date,
      });
      inserted++;
    }
  }

  if (entity === 'clearance') {
    const stu = await db.select({ id: students.id, code: students.studentCode }).from(students);
    const trm = await db.select({ id: academic_terms.id, code: academic_terms.termCode }).from(academic_terms);
    for (const r of rows) {
      const s = stu.find(x => x.code === String(r.studentCode));
      const t = trm.find(x => x.code === String(r.termCode));
      if (!s || !t) { report.errors.push({ row: 0, msg: `${r.studentCode}/${r.termCode} یافت نشد.` }); continue; }
      const r0 = await db.insert(financial_clearances).values({
        studentId: s.id, termId: t.id, isCleared: r.isCleared ? 1 : 0, clearedAt: r.isCleared ? new Date() : null,
      }).onConflictDoUpdate({ target: [financial_clearances.studentId, financial_clearances.termId], set: { isCleared: r.isCleared ? 1 : 0 } })
        .returning({ id: financial_clearances.id });
      r0.length ? inserted++ : existing++;
    }
  }

  report.willInsert = inserted;
  report.existing = existing;
  report.errors = report.errors.slice(0, 50);
  report.warnings = report.warnings.slice(0, 50);
  await db.insert(migration_runs).values({
    entity, fileName, mode: 'COMMIT', totalRows: report.total, inserted, skippedExisting: existing,
    invalid: report.invalid, report: JSON.stringify(report), status: report.errors.length && !inserted ? 'FAILED' : 'OK', triggeredByUserId: userId,
  });
  return report;
}

export async function logDryRun(userId: number, report: Report) {
  await db.insert(migration_runs).values({
    entity: report.entity, fileName: report.fileName, mode: 'DRY', totalRows: report.total,
    inserted: 0, skippedExisting: 0, invalid: report.invalid,
    report: JSON.stringify(report), status: 'OK', triggeredByUserId: userId,
  });
}
