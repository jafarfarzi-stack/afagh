'use server';

import { db } from '@/db';
import { universities, samin_connections } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { encryptSecret } from '@/lib/samin/crypto';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function upsertUniversity(formData: FormData) {
  await requireRole(['ADMIN']);
  const id = Number(formData.get('id') || 0);
  const code = String(formData.get('code') || '').trim().toUpperCase();
  const title = String(formData.get('title') || '').trim();
  const kind = String(formData.get('kind') || 'DISSOLVED').trim();
  const saminCode = String(formData.get('saminCode') || '').trim() || null;
  if (!code || !title) throw new Error('کد و عنوان الزامی است');
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) throw new Error('کد فقط A-Z 0-9 _ -');

  if (id) {
    await db.update(universities).set({ code, title, kind, saminCode, isActive: 1 }).where(eq(universities.id, id));
  } else {
    await db.insert(universities).values({ code, title, kind, saminCode }).onConflictDoNothing();
  }
  revalidatePath('/admin/universities');
}

export async function saveSaminConnection(formData: FormData) {
  await requireRole(['ADMIN']);
  const universityId = Number(formData.get('universityId'));
  if (!universityId) throw new Error('دانشگاه نامشخص');
  const clientId = String(formData.get('clientId') || '').trim() || null;
  const clientSecret = String(formData.get('clientSecret') || '').trim();
  const username = String(formData.get('username') || '').trim() || null;
  const password = String(formData.get('password') || '').trim();
  const apiBaseUrl = String(formData.get('apiBaseUrl') || '').trim() || 'https://apim.saorg.ir';
  const authBaseUrl = String(formData.get('authBaseUrl') || '').trim() || 'https://apiauth.saorg.ir/oauth2/token';

  const patch: Record<string, unknown> = { universityId, apiBaseUrl, authBaseUrl, clientId, username, isEnabled: 1, updatedAt: new Date() };
  if (clientSecret) (patch as any).clientSecretEnc = encryptSecret(clientSecret);
  if (password) (patch as any).passwordEnc = encryptSecret(password);

  await db.insert(samin_connections).values(patch as any).onConflictDoUpdate({ target: samin_connections.universityId, set: patch as any });
  revalidatePath('/admin/universities');
}

export async function deleteUniversity(id: number) {
  await requireRole(['ADMIN']);
  await db.delete(universities).where(eq(universities.id, id));
  revalidatePath('/admin/universities');
}
