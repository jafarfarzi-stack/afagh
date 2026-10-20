'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { majors, students, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { assertServerActionOrigin } from '@/lib/security';
import {
  parseFixedWidthText, normalizeNationalCode, suggestRelation,
  type SanjeshColumn,
} from '@/lib/sanjesh-parser';

async function readInputs(formData: FormData): Promise<{ columns: SanjeshColumn[]; text: string } | { error: string }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { error: og.error };
  await requireRole(['ADMIN']);
  const structureRaw = String(formData.get('structure') ?? '').trim();
  const file = formData.get('file');
  if (!structureRaw) return { error: 'ساختار ستون‌ها (JSON) را وارد کنید.' };
  let columns: SanjeshColumn[];
  try {
    columns = JSON.parse(structureRaw);
    if (!Array.isArray(columns)) throw new Error('not array');
  } catch {
    return { error: 'ساختار JSON نامعتبر است.' };
  }
  if (!file || typeof file === 'string') return { error: 'فایل داده را انتخاب کنید.' };
  const text = await (file as File).text();
  return { columns, text };
}

export async function previewSanjeshAction(formData: FormData): Promise<{
  ok: boolean; error?: string; count?: number; sample?: Record<string, string>[];
}> {
  const res = await readInputs(formData);
  if ('error' in res) return { ok: false, error: res.error };
  const rows = parseFixedWidthText(res.text, res.columns);
  return { ok: true, count: rows.length, sample: rows.slice(0, 15) };
}

export async function commitSanjeshAction(formData: FormData): Promise<{
  ok: boolean; error?: string; updated?: number; notFound?: number; total?: number;
}> {
  const res = await readInputs(formData);
  if ('error' in res) return { ok: false, error: res.error };
  const rows = parseFixedWidthText(res.text, res.columns);

  // کش majors برای تعیین نسبت
  const allMajors = await db.select({ id: majors.id, majorCode: majors.majorCode }).from(majors);
  const majorByCode = new Map(allMajors.map(m => [m.majorCode, m.id]));

  let updated = 0;
  let notFound = 0;
  for (const row of rows) {
    const nc = normalizeNationalCode(row.__nationalCode);
    const sc = row.__studentCode?.trim() || null;
    // یافتن دانشجو
    let student: { id: number; majorId: number | null } | null = null;
    if (sc) {
      const [s] = await db.select({ id: students.id, majorId: students.majorId })
        .from(students).where(eq(students.studentCode, sc)).limit(1);
      student = s ?? null;
    } else if (nc) {
      const [s] = await db.select({ id: students.id, majorId: students.majorId })
        .from(students).innerJoin(users, eq(users.id, students.userId))
        .where(eq(users.nationalCode, nc)).limit(1);
      student = s ?? null;
    }
    if (!student) { notFound++; continue; }

    const prevCode = row.__previousMajorCode?.trim() || null;
    const prevTitle = row.__previousMajorTitle?.trim() || null;
    const newMajorCode = student.majorId ? (allMajors.find(m => m.id === student!.majorId)?.majorCode ?? null) : null;
    const relation = suggestRelation(prevCode, newMajorCode);

    await db.update(students).set({
      previousMajorCode: prevCode,
      previousMajorTitle: prevTitle,
      previousMajorRelation: relation,
    }).where(eq(students.id, student.id));
    updated++;
  }

  revalidatePath('/admin/sanjesh-import');
  revalidatePath('/group-manager/compensatory');
  return { ok: true, updated, notFound, total: rows.length };
}
