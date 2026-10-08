'use server';

import { db } from '@/db';
import { login_notices, login_slides } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

const NOTICE_KINDS = ['info', 'warning', 'important'];

export type NoticeInput = {
  id?: number;
  universityId: number | null;
  title: string;
  body: string;
  kind: string;
  isActive: boolean;
  sortOrder: number;
};

export type SlideInput = {
  id?: number;
  universityId: number | null;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  isActive: boolean;
  sortOrder: number;
};

function cleanStr(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

export async function saveNoticeAction(input: NoticeInput) {
  await requireRole(['ADMIN']);
  const title = cleanStr(input.title, 150);
  if (!title) throw new Error('عنوان اطلاعیه الزامی است.');
  const kind = NOTICE_KINDS.includes(input.kind) ? input.kind : 'info';
  const values = {
    universityId: input.universityId || null,
    title,
    body: cleanStr(input.body, 2000),
    kind,
    isActive: input.isActive ? 1 : 0,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
    updatedAt: new Date(),
  };
  if (input.id) {
    await db.update(login_notices).set(values).where(eq(login_notices.id, input.id));
  } else {
    await db.insert(login_notices).values(values);
  }
  revalidatePath('/admin/login-showcase');
  revalidatePath('/login');
}

export async function deleteNoticeAction(id: number) {
  await requireRole(['ADMIN']);
  await db.delete(login_notices).where(eq(login_notices.id, id));
  revalidatePath('/admin/login-showcase');
  revalidatePath('/login');
}

export async function saveSlideAction(input: SlideInput) {
  await requireRole(['ADMIN']);
  const title = cleanStr(input.title, 150);
  if (!title) throw new Error('عنوان اسلاید الزامی است.');
  const values = {
    universityId: input.universityId || null,
    title,
    subtitle: cleanStr(input.subtitle, 255),
    imageUrl: cleanStr(input.imageUrl, 500),
    linkUrl: cleanStr(input.linkUrl, 500),
    isActive: input.isActive ? 1 : 0,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
    updatedAt: new Date(),
  };
  if (input.id) {
    await db.update(login_slides).set(values).where(eq(login_slides.id, input.id));
  } else {
    await db.insert(login_slides).values(values);
  }
  revalidatePath('/admin/login-showcase');
  revalidatePath('/login');
}

export async function deleteSlideAction(id: number) {
  await requireRole(['ADMIN']);
  await db.delete(login_slides).where(eq(login_slides.id, id));
  revalidatePath('/admin/login-showcase');
  revalidatePath('/login');
}

/** آپلود تصویر اسلاید — JPG/PNG/WebP تا ۲MB در public/uploads/slide-<ts>.<ext> */
export async function uploadSlideImageAction(formData: FormData): Promise<{ url: string }> {
  await requireRole(['ADMIN']);
  const file = formData.get('image');
  if (!file || typeof file === 'string') throw new Error('فایلی انتخاب نشده است.');
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error('فقط PNG/JPG/WebP مجاز است.');
  if (file.size > 2 * 1024 * 1024) throw new Error('حجم فایل بیش از ۲ مگابایت است.');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  await mkdir(join(process.cwd(), 'public', 'uploads'), { recursive: true });
  const name = `slide-${Date.now()}.${ext}`;
  await writeFile(join(process.cwd(), 'public', 'uploads', name), Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/${name}` };
}

/** ارم دانشگاه (استفاده مجدد از سازوکار موجود صفحه دانشگاه‌ها) + تازه‌سازی این صفحه */
export async function uploadShowcaseLogoAction(formData: FormData) {
  const { uploadUniversityLogoAction } = await import('../universities/actions');
  await uploadUniversityLogoAction(formData);
  revalidatePath('/admin/login-showcase');
  revalidatePath('/login');
}

export async function deleteShowcaseLogoAction(universityId: number) {
  const { deleteUniversityLogoAction } = await import('../universities/actions');
  await deleteUniversityLogoAction(universityId);
  revalidatePath('/admin/login-showcase');
  revalidatePath('/login');
}
