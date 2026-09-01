'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { students } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import {
  alumniOf, myRequests, payRequest, saveProfile, submitRequest,
  type AlumniServiceCode,
} from '@/lib/alumni';

// ═══ کنش‌های پورتال دانش‌آموختگان ═══

async function meAlumni() {
  const user = await requireRole(['STUDENT']);
  const a = await alumniOf(user.id);
  if (!a) throw new Error('این بخش ویژهٔ دانش‌آموختگان است.');
  return { user, studentId: a.studentId };
}

const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'خطای نامشخص' });

export async function saveProfileAction(input: {
  employmentStatus?: string; organization?: string; jobTitle?: string;
  contactEmail?: string; contactMobile?: string; linkedinUrl?: string; allowContact?: boolean;
}) {
  try {
    const { studentId } = await meAlumni();
    await saveProfile(studentId, input);
    revalidatePath('/alumni');
    return { ok: true as const };
  } catch (e) { return fail(e); }
}

export async function submitRequestAction(input: { requestType: string; destination?: string; description?: string }) {
  try {
    const { studentId } = await meAlumni();
    await submitRequest(studentId, {
      requestType: input.requestType as AlumniServiceCode,
      destination: input.destination, description: input.description,
    });
    revalidatePath('/alumni');
    return { ok: true as const, requests: await myRequests(studentId) };
  } catch (e) { return fail(e); }
}

export async function payRequestAction(requestId: number) {
  try {
    const { studentId } = await meAlumni();
    await payRequest(requestId, studentId);
    revalidatePath('/alumni');
    return { ok: true as const, requests: await myRequests(studentId) };
  } catch (e) { return fail(e); }
}

export async function myRequestsAction() {
  try {
    const { studentId } = await meAlumni();
    return { ok: true as const, requests: await myRequests(studentId) };
  } catch (e) { return fail(e); }
}
