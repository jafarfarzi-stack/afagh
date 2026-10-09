'use server';

import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { saham_institute_codes } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export interface InstituteCodeInput {
  id?: number;
  universityId: number;
  facultyId: number | null;
  title: string;
  code: string;
  provinceCode: string;
  cityCode: string;
  isDefault: boolean;
  isActive: boolean;
}

/** اعتبارسنجی کد ۱۲ رقمی سهام */
function checkCode(code: string): string | null {
  const c = code.trim();
  if (!/^\d{12}$/.test(c)) return 'کد واحد باید دقیقاً ۱۲ رقم باشد.';
  return null;
}

/** ذخیره (درج/ویرایش) یک سطر کد مؤسسه */
export async function saveInstituteCode(input: InstituteCodeInput): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['ADMIN']);
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'عنوان واحد لازم است.' };
  const codeErr = checkCode(input.code);
  if (codeErr) return { ok: false, error: codeErr };

  const row = {
    universityId: input.universityId,
    facultyId: input.facultyId,
    title,
    code: input.code.trim(),
    provinceCode: input.provinceCode.trim() || null,
    cityCode: input.cityCode.trim() || null,
    isDefault: input.isDefault ? 1 : 0,
    isActive: input.isActive ? 1 : 0,
  };
  try {
    let savedId = input.id;
    if (input.id) {
      await db.update(saham_institute_codes).set(row).where(eq(saham_institute_codes.id, input.id));
    } else {
      const [ins] = await db.insert(saham_institute_codes).values(row).returning({ id: saham_institute_codes.id });
      savedId = ins?.id;
    }
    // فقط یک پیش‌فرض برای هر دانشگاه — بقیه صفر می‌شوند
    if (input.isDefault && savedId) {
      await db.update(saham_institute_codes).set({ isDefault: 0 }).where(
        and(eq(saham_institute_codes.universityId, input.universityId), ne(saham_institute_codes.id, savedId)),
      );
    }
  } catch {
    return { ok: false, error: 'این کد قبلاً برای همین دانشگاه ثبت شده است.' };
  }
  revalidatePath('/admin/saham');
  revalidatePath('/admin/saham/settings');
  return { ok: true };
}

/** حذف یک سطر */
export async function deleteInstituteCode(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['ADMIN']);
  await db.delete(saham_institute_codes).where(eq(saham_institute_codes.id, id));
  revalidatePath('/admin/saham');
  revalidatePath('/admin/saham/settings');
  return { ok: true };
}
