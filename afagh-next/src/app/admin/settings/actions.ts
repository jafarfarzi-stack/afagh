'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { classrooms, faculties, schedules } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { classroomOwnedBy, readClassroomUni } from '@/lib/offering-scheduling';

export interface SaveClassroomResult {
  ok: boolean;
  msg?: string;
  err?: string;
  /** شناسهٔ کلاسِ تازه‌ساخته‌شده (فقط برای حالت افزودن) */
  newId?: number;
}

/**
 * ذخیره/افزودن کلاس از سطح تنظیمات (ادمین). هم‌راستا با group-manager/classrooms
 * اما با گارد ادمین؛ فقط کلاسِ همین دانشگاه (fail-closed).
 *
 * بدون redirect تا پس از ذخیره صفحه نویگیت نشود و اسکرولِ کاربر (مخصوصاً برای
 * کلاس‌های پایینِ لیست) از دست نرود — نتیجه را برمی‌گرداند و فرمِ سمت‌کلاینت
 * پیام را سرجای خودش نشان می‌دهد.
 */
export async function adminSaveClassroomAction(
  _prev: SaveClassroomResult | null,
  fd: FormData,
): Promise<SaveClassroomResult> {
  /**
   * حذف از همان فرمِ ردیف می‌آید (دکمهٔ «حذف؟» با `intent=delete`).
   *
   * چرا؟ ردیف‌های جدولِ کلاس‌ها حالا هرکدام یک grid هستند و ستون‌ها باید زیر
   * سرسطر بنشینند؛ فرمِ دومِ تودرتو (حذف) این چیدمان را می‌شکست و HTML هم
   * فرمِ تودرتو را مجاز نمی‌داند.
   */
  if (String(fd.get('intent') ?? '') === 'delete') {
    return adminDeleteClassroomAction(_prev, fd);
  }
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const id = fd.get('id') ? Number(fd.get('id')) : 0;
    const name = String(fd.get('name') ?? '').trim();
    const cap = Number(fd.get('cap')) || 0;
    if (!name || cap <= 0) return { ok: false, err: 'نام کلاس و ظرفیت مثبت الزامی است.' };
    // کد کلاس اختیاری است (درخواست کاربر) — رشتهٔ خالی ⇒ NULL در پایگاه داده
    const code = String(fd.get('code') ?? '').trim() || null;
    const uni = await getCurrentUniversity().catch(() => null);
    const myUni = uni?.id ?? null;
    if (id) {
      const room = await readClassroomUni(db, id);
      if (!room || !classroomOwnedBy(room.universityId ?? null, myUni)) {
        return { ok: false, err: 'این کلاس متعلق به دانشگاه شما نیست.' };
      }
    }
    /**
     * دانشکده — جای «ساختمان» (درخواست آموزش: ساختمان در سامانه تعریف ندارد).
     * فقط دانشکده‌های همان دانشگاهِ فعال پذیرفته می‌شوند تا با سوییچ دانشگاه
     * ناسازگاری پیش نیاید.
     */
    let facultyId: number | null = null;
    let facultyName: string | null = null;
    const facultyRaw = String(fd.get('facultyId') ?? '').trim();
    if (facultyRaw) {
      const fid = Number(facultyRaw);
      const owned = Number.isInteger(fid) && fid > 0 && myUni != null
        ? await db
            .select({ id: faculties.id, name: faculties.name })
            .from(faculties)
            .where(and(eq(faculties.id, fid), eq(faculties.universityId, myUni)))
            .limit(1)
        : [];
      if (!owned.length) {
        return { ok: false, err: 'دانشکدهٔ انتخاب‌شده متعلق به دانشگاه فعال نیست.' };
      }
      facultyId = fid;
      facultyName = owned[0].name;
    }

    const vals = {
      name,
      code,
      capacity: cap,
      roomType: String(fd.get('roomType') ?? '') || null,
      facultyId,
      /**
       * نام دانشکده در ستون قدیمیِ `buildingName` هم نوشته می‌شود.
       *
       * چرا؟ ده‌ها صفحه (حضور و غیاب، تخصیص کارشناس، سالن امتحان، گزارش کلاس‌ها)
       * همین ستون را به‌عنوان «ساختمان کلاس» نمایش می‌دهند. تا وقتی همهٔ آن‌ها به
       * `facultyId` منتقل نشده‌اند، این هم‌نویسی از نمایشِ «بدون ساختمان» جلوگیری
       * می‌کند. `facultyId` منبع حقیقت است؛ این ستون فقط برای نمایش.
       */
      buildingName: facultyName,
      floor: String(fd.get('floor') ?? '') || null,
      rowsCount: Number(fd.get('rows')) || null,
      colsCount: Number(fd.get('cols')) || null,
      isActive: fd.get('isActive') == null ? 1 : (Number(fd.get('isActive')) ? 1 : 0),
    };
    if (id) {
      await db.update(classrooms).set(vals).where(eq(classrooms.id, id));
    } else {
      const [row] = await db.insert(classrooms).values({ ...vals, universityId: myUni }).returning({ id: classrooms.id });
      if (row) return { ok: true, msg: `کلاس «${name}» افزوده شد.`, newId: row.id };
    }
    revalidatePath('/admin/settings');
    revalidatePath('/admin/weekly-board');
    return { ok: true, msg: `کلاس «${name}» ذخیره شد.` };
  } catch (e) {
    return { ok: false, err: (e as Error)?.message ?? 'خطا در ذخیرهٔ کلاس.' };
  }
}

export async function adminDeleteClassroomAction(
  _prev: SaveClassroomResult | null,
  fd: FormData,
): Promise<SaveClassroomResult> {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const id = Number(fd.get('id'));
    const uni = await getCurrentUniversity().catch(() => null);
    const myUni = uni?.id ?? null;
    const room = await readClassroomUni(db, id);
    if (!room || !classroomOwnedBy(room.universityId ?? null, myUni)) {
      return { ok: false, err: 'این کلاس متعلق به دانشگاه شما نیست.' };
    }
    const used = await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.roomId, id)).limit(1);
    if (used.length) {
      return { ok: false, err: 'این کلاس در برنامهٔ هفتگی استفاده می‌شود — ابتدا برنامه را حذف کنید.' };
    }
    await db.delete(classrooms).where(eq(classrooms.id, id));
    revalidatePath('/admin/settings');
    revalidatePath('/admin/weekly-board');
    return { ok: true, msg: 'کلاس حذف شد.' };
  } catch (e) {
    return { ok: false, err: (e as Error)?.message ?? 'خطا در حذف کلاس.' };
  }
}
