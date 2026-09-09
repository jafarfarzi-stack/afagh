'use server';

import { db } from '@/db';
import { samin_staging, students, users, universities } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { buildSaminPayloadForStudent } from '@/lib/samin/samin-mapper';
import { saminBulkImport } from '@/lib/samin/client';

export async function enqueueForSamin(universityId: number): Promise<{ inserted: number; skipped: number }> {
  await requireRole(['ADMIN']);
  // اگر universityId=null بود (دادهٔ قدیم)، فقط همان دانشگاه را فیلتر می‌کنیم
  const studs = await db.select({ id: students.id }).from(students).where(eq(students.universityId, universityId)).limit(5000);
  // اگر هیچ دانشجویی با universityId نداشتیم (دادهٔ قدیم)، برای سازگاری همه را برای AFAGH در نظر می‌گیریم
  const ids = studs.length ? studs.map(s => s.id) : [];

  let inserted = 0; let skipped = 0;
  for (const sid of ids) {
    const payload = await buildSaminPayloadForStudent(sid);
    if (!payload) { skipped++; continue; }
    const pk = String(payload.person_pk_in_source || sid);
    const [ex] = await db.select({ id: samin_staging.id }).from(samin_staging).where(and(eq(samin_staging.universityId, universityId), eq(samin_staging.entityCode, '1000'), eq(samin_staging.personPkInSource, pk))).limit(1);
    if (ex) { skipped++; continue; }
    await db.insert(samin_staging).values({
      universityId,
      entityCode: '1000',
      personPkInSource: pk,
      studentPkInSource: String(payload.student_pk_in_source || sid),
      payload: payload as any,
      status: 'PENDING',
    }).onConflictDoNothing();
    inserted++;
  }
  revalidatePath('/admin/samin');
  return { inserted, skipped };
}

export async function sendToSamin(universityId: number, entityCode: string) {
  await requireRole(['ADMIN']);
  const batch = await db.select().from(samin_staging).where(and(eq(samin_staging.universityId, universityId), eq(samin_staging.entityCode, entityCode), eq(samin_staging.status, 'PENDING'))).limit(50);
  if (!batch.length) throw new Error('صفی برای ارسال نیست — ابتدا آماده‌سازی را بزنید');

  const data_object = batch.map(r => (r.payload as any));
  const res: any = await saminBulkImport(universityId, { data_object, entity_code: entityCode, import_type_code: '0' });

  const traceId = Number(res.trace_id ?? res.traceId ?? 0) || null;
  for (const r of batch) {
    await db.update(samin_staging).set({ status: 'SENT', traceId, sentAt: new Date() }).where(eq(samin_staging.id, r.id));
  }
  revalidatePath('/admin/samin');
  return res;
}

export async function traceSamin(universityId: number, traceId: number) {
  await requireRole(['ADMIN']);
  const { saminTrace } = await import('@/lib/samin/client');
  return saminTrace(universityId, traceId);
}
