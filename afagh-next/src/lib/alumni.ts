import 'server-only';
import crypto from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  alumni_profiles, alumni_requests, degree_level_configs, issued_degrees,
  majors, notifications, student_ledger, students, users,
} from '@/db/schema';
import { getNumber } from '@/lib/settings';
import { createLogger } from '@/lib/logger';

// ═══ پورتال دانش‌آموختگان ═══
// ارتباط دانشگاه با فرد بعد از فارغ‌التحصیلی قطع نمی‌شود: حساب کاربری از
// پورتال آموزشی به این پورتال منتقل می‌شود و خدمات پس از فراغت (ریزنمرات
// رسمی، آزادسازی مدرک، تأییدیه برای دارالترجمه) آنلاین ثبت و پرداخت می‌شود.

const log = createLogger({ mod: 'alumni' });

export const ALUMNI_SERVICES = [
  { code: 'OFFICIAL_TRANSCRIPT', title: 'ریزنمرات رسمی (مهر و موم‌شده)', feeKey: 'ALUMNI_FEE_TRANSCRIPT', needsDestination: false, hint: 'صدور ریزنمرات رسمی جهت ارائه به دانشگاه/سازمان' },
  { code: 'TRANSLATION_CONFIRM', title: 'تأییدیهٔ تحصیلی برای دارالترجمه', feeKey: 'ALUMNI_FEE_TRANSLATION', needsDestination: true, hint: 'نام دارالترجمه یا سازمان مقصد را بنویسید' },
  { code: 'DEGREE_RELEASE', title: 'آزادسازی مدرک (خرید تعهد خدمت)', feeKey: 'ALUMNI_FEE_RELEASE', needsDestination: false, hint: 'پس از تسویهٔ تعهد خدمت، دانشنامه آزاد می‌شود' },
  { code: 'DUPLICATE_DEGREE', title: 'صدور المثنی مدرک', feeKey: 'ALUMNI_FEE_DUPLICATE', needsDestination: false, hint: 'در صورت مفقودی؛ نیازمند بررسی اداره آموزش' },
] as const;

export type AlumniServiceCode = typeof ALUMNI_SERVICES[number]['code'];

export async function serviceCatalog() {
  return Promise.all(ALUMNI_SERVICES.map(async s => ({
    code: s.code, title: s.title, hint: s.hint,
    needsDestination: s.needsDestination,
    fee: await getNumber(s.feeKey, 0),
  })));
}

/** آیا این کاربر دانش‌آموخته است؟ (مبنای دسترسی به پورتال) */
export async function alumniOf(userId: number) {
  const [row] = await db.select({
    studentId: students.id, studentCode: students.studentCode, status: students.status,
    entryYear: students.entryYear, firstName: users.firstName, lastName: users.lastName,
    majorName: majors.name, degreeTitle: degree_level_configs.title,
  }).from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
    .where(eq(students.userId, userId)).limit(1);
  if (!row || row.status !== 'GRADUATED') return null;
  return { ...row, fullName: `${row.firstName} ${row.lastName}` };
}

export async function getProfile(studentId: number) {
  const [p] = await db.select().from(alumni_profiles).where(eq(alumni_profiles.studentId, studentId)).limit(1);
  return p ?? null;
}

export async function saveProfile(studentId: number, input: {
  employmentStatus?: string; organization?: string; jobTitle?: string;
  contactEmail?: string; contactMobile?: string; linkedinUrl?: string; allowContact?: boolean;
}) {
  const values = {
    studentId,
    employmentStatus: input.employmentStatus || null,
    organization: input.organization || null,
    jobTitle: input.jobTitle || null,
    contactEmail: input.contactEmail || null,
    contactMobile: input.contactMobile || null,
    linkedinUrl: input.linkedinUrl || null,
    allowContact: input.allowContact === false ? 0 : 1,
    updatedAt: new Date(),
  };
  await db.insert(alumni_profiles).values(values)
    .onConflictDoUpdate({ target: alumni_profiles.studentId, set: values });
  return { ok: true };
}

export async function myDegrees(studentId: number) {
  const rows = await db.select().from(issued_degrees)
    .where(eq(issued_degrees.studentId, studentId)).orderBy(desc(issued_degrees.id));
  return rows.map(d => ({
    id: d.id, degreeType: d.degreeType, serialNo: d.serialNo, verifyCode: d.verifyCode,
    ministryVerificationCode: d.ministryVerificationCode, isDelivered: d.isDelivered === 1,
    issuedAt: d.issuedAt.toISOString(),
  }));
}

const tracking = () => 'AL-' + crypto.randomBytes(4).toString('hex').toUpperCase();

export async function submitRequest(studentId: number, input: {
  requestType: AlumniServiceCode; destination?: string; description?: string;
}) {
  const svc = ALUMNI_SERVICES.find(s => s.code === input.requestType);
  if (!svc) throw new Error('نوع خدمت نامعتبر است.');
  if (svc.needsDestination && !input.destination?.trim()) throw new Error('مقصد (دارالترجمه/سازمان) الزامی است.');

  const fee = await getNumber(svc.feeKey, 0);
  const [r] = await db.insert(alumni_requests).values({
    studentId, requestType: input.requestType, trackingCode: tracking(),
    status: fee > 0 ? 'AWAITING_PAYMENT' : 'IN_REVIEW',
    fee: String(fee), destination: input.destination?.trim() || null,
    description: input.description?.trim() || null,
  }).returning();

  log.info('alumni_request', { studentId, type: input.requestType, fee });
  return r;
}

export async function payRequest(requestId: number, studentId: number) {
  const [r] = await db.select().from(alumni_requests)
    .where(and(eq(alumni_requests.id, requestId), eq(alumni_requests.studentId, studentId))).limit(1);
  if (!r) throw new Error('درخواست یافت نشد.');
  if (r.status !== 'AWAITING_PAYMENT') return { ok: true, already: true };

  const [led] = await db.insert(student_ledger).values({
    studentId, transactionType: 'CREDIT', amount: String(Math.round(Number(r.fee ?? 0))),
    description: `پرداخت هزینهٔ خدمت دانش‌آموختگان — ${r.trackingCode}`,
  }).returning({ id: student_ledger.id });

  await db.update(alumni_requests).set({
    status: 'IN_REVIEW', paidAt: new Date(), ledgerId: led?.id ?? null, updatedAt: new Date(),
  }).where(eq(alumni_requests.id, requestId));
  return { ok: true };
}

export async function myRequests(studentId: number) {
  const rows = await db.select().from(alumni_requests)
    .where(eq(alumni_requests.studentId, studentId)).orderBy(desc(alumni_requests.id));
  return rows.map(r => ({
    id: r.id, requestType: r.requestType, trackingCode: r.trackingCode, status: r.status,
    fee: Number(r.fee ?? 0), destination: r.destination, description: r.description,
    resultFileUrl: r.resultFileUrl, adminNote: r.adminNote,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
  }));
}

/** فهرست کارتابل اداره آموزش */
export async function allRequests(status?: string) {
  const rows = await db.select({
    id: alumni_requests.id, requestType: alumni_requests.requestType, trackingCode: alumni_requests.trackingCode,
    status: alumni_requests.status, fee: alumni_requests.fee, destination: alumni_requests.destination,
    description: alumni_requests.description, adminNote: alumni_requests.adminNote,
    createdAt: alumni_requests.createdAt, studentId: alumni_requests.studentId,
    studentCode: students.studentCode, firstName: users.firstName, lastName: users.lastName,
  }).from(alumni_requests)
    .innerJoin(students, eq(students.id, alumni_requests.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(status && status !== 'ALL' ? eq(alumni_requests.status, status) : sql`true`)
    .orderBy(desc(alumni_requests.id)).limit(200);
  return rows.map(r => ({
    id: r.id, requestType: r.requestType, trackingCode: r.trackingCode, status: r.status,
    fee: Number(r.fee ?? 0), destination: r.destination, description: r.description, adminNote: r.adminNote,
    studentId: r.studentId, studentCode: r.studentCode, fullName: `${r.firstName} ${r.lastName}`,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
  }));
}

export async function resolveRequest(input: {
  requestId: number; status: 'IN_REVIEW' | 'DONE' | 'REJECTED'; note?: string;
  resultFileUrl?: string; userId: number;
}) {
  const [r] = await db.select().from(alumni_requests).where(eq(alumni_requests.id, input.requestId)).limit(1);
  if (!r) throw new Error('درخواست یافت نشد.');
  await db.update(alumni_requests).set({
    status: input.status, adminNote: input.note ?? r.adminNote,
    resultFileUrl: input.resultFileUrl ?? r.resultFileUrl,
    handledBy: input.userId, updatedAt: new Date(),
  }).where(eq(alumni_requests.id, input.requestId));

  const [stu] = await db.select({ userId: students.userId }).from(students).where(eq(students.id, r.studentId)).limit(1);
  if (stu) {
    await db.insert(notifications).values({
      userId: stu.userId, eventCode: 'ALUMNI_REQUEST_' + input.status,
      payload: JSON.stringify({
        text: input.status === 'DONE'
          ? `درخواست ${r.trackingCode} انجام شد.${input.note ? ' ' + input.note : ''}`
          : input.status === 'REJECTED'
            ? `درخواست ${r.trackingCode} رد شد.${input.note ? ' دلیل: ' + input.note : ''}`
            : `درخواست ${r.trackingCode} در حال بررسی است.`,
      }),
    });
  }
  return { ok: true };
}
