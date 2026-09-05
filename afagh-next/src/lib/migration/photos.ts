import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { staff, students, users } from '@/db/schema';
import { unzip } from './xlsx';
import { putArchiveObject } from '@/lib/objectStore';
import {
  PHOTO_EXT, extOf, planPhotoImport,
  type PhotoEntry, type PhotoPerson, type PhotoPlan,
} from './photo-match';

// ═══ واردسازی دسته‌ای عکس افراد از یک آرشیو ZIP ═══
//
// سیستم قدیمی عکس‌ها را جدا از دیتابیس نگه می‌دارد. کاربر یک ZIP می‌دهد و
// این ماژول هر عکس را به صاحبش وصل می‌کند. خودِ فایل در Object Storage
// می‌نشیند و در دیتابیس فقط کلیدش می‌ماند (سند §۲۴۳۸).

export type PhotoScope = 'all' | 'professor' | 'student' | 'staff';

export type PhotoReport = {
  fileName: string;
  mode: 'DRY' | 'COMMIT';
  totalEntries: number;
  matched: number;
  stored: number;
  replaced: number;
  orphans: { path: string; reason: string }[];
  skipped: { path: string; reason: string }[];
  missingCount: number;
  missingSample: { fullName: string; expected: string | null }[];
  errors: string[];
  /** نمونهٔ تطبیق‌ها برای نمایش پیش از ثبت */
  sample: { path: string; person: string; by: string; replaces: boolean }[];
};

/**
 * افرادی که می‌توانند عکس بگیرند + همهٔ کدهایی که ممکن است نام فایل عکس باشند.
 * (یک نفر می‌تواند هم دانشجو باشد هم کارمند؛ کدهایش کنار هم جمع می‌شوند.)
 */
export async function photoPeople(scope: PhotoScope): Promise<PhotoPerson[]> {
  const wantStaff = scope === 'all' || scope === 'professor' || scope === 'staff';
  const wantStudent = scope === 'all' || scope === 'student';

  const map = new Map<number, PhotoPerson>();
  const add = (u: { id: number; firstName: string; lastName: string; nationalCode: string; photoFileName: string | null; photoKey: string | null }) => {
    if (!map.has(u.id)) {
      map.set(u.id, {
        userId: u.id,
        fullName: `${u.firstName} ${u.lastName}`.trim(),
        nationalCode: u.nationalCode,
        photoFileName: u.photoFileName,
        codes: [],
        hasPhoto: !!u.photoKey,
      });
    }
    return map.get(u.id)!;
  };

  if (wantStaff) {
    const rows = await db.select({
      id: users.id, firstName: users.firstName, lastName: users.lastName,
      nationalCode: users.nationalCode, photoFileName: users.photoFileName, photoKey: users.photoKey,
      staffCode: staff.staffCode, staffType: staff.staffType, personnelNo: staff.personnelNo,
    }).from(staff).innerJoin(users, eq(users.id, staff.userId));
    for (const r of rows) {
      if (scope === 'professor' && r.staffType && r.staffType !== 'PROFESSOR') continue;
      const p = add(r);
      if (r.staffCode) p.codes.push(r.staffCode);
      if (r.personnelNo) p.codes.push(r.personnelNo);
    }
  }

  if (wantStudent) {
    const rows = await db.select({
      id: users.id, firstName: users.firstName, lastName: users.lastName,
      nationalCode: users.nationalCode, photoFileName: users.photoFileName, photoKey: users.photoKey,
      studentCode: students.studentCode,
    }).from(students).innerJoin(users, eq(users.id, students.userId));
    for (const r of rows) {
      const p = add(r);
      if (r.studentCode) p.codes.push(r.studentCode);
    }
  }

  return [...map.values()];
}

/** کلید شیء عکس — قابل حدس‌زدن نیست تا لینک مستقیم لو نرود */
export function photoObjectKey(userId: number, ext: string): string {
  return `photos/${userId}/${Date.now()}-${Math.floor(Math.random() * 900 + 100)}.${ext}`;
}

export async function importPhotoArchive(
  buf: Buffer, fileName: string, scope: PhotoScope, commit: boolean,
): Promise<PhotoReport> {
  const report: PhotoReport = {
    fileName, mode: commit ? 'COMMIT' : 'DRY', totalEntries: 0,
    matched: 0, stored: 0, replaced: 0,
    orphans: [], skipped: [], missingCount: 0, missingSample: [], errors: [], sample: [],
  };

  let files: Map<string, Buffer>;
  try {
    files = unzip(buf);
  } catch {
    report.errors.push('فایل ZIP خوانده نشد — مطمئن شوید آرشیو سالم است (ZIP، نه RAR/7z).');
    return report;
  }

  const entries: PhotoEntry[] = [...files.entries()].map(([path, data]) => ({ path, size: data.length }));
  report.totalEntries = entries.length;

  const people = await photoPeople(scope);
  if (!people.length) {
    report.errors.push('هنوز هیچ شخصی در سامانه نیست — اول فایل استادان/دانشجویان را وارد کنید، بعد عکس‌ها را.');
    return report;
  }

  const plan: PhotoPlan = planPhotoImport(entries, people);
  const byId = new Map(people.map(p => [p.userId, p]));
  report.matched = plan.matches.length;
  report.replaced = plan.matches.filter(m => m.replaces).length;
  report.orphans = plan.orphans.slice(0, 50);
  report.skipped = plan.skipped.slice(0, 50);
  report.missingCount = plan.missing.length;
  report.missingSample = plan.missing.slice(0, 20).map(m => ({ fullName: m.fullName, expected: m.expected }));
  report.sample = plan.matches.slice(0, 20).map(m => ({
    path: m.path,
    person: byId.get(m.userId)?.fullName ?? String(m.userId),
    by: m.by === 'photoFileName' ? 'نام فایل اعلام‌شده در اکسل' : m.by === 'nationalCode' ? 'کد ملی' : 'کد شخص',
    replaces: m.replaces,
  }));

  if (!commit) return report;

  for (const m of plan.matches) {
    const data = files.get(m.path);
    if (!data) continue;
    const ext = extOf(m.path);
    const mime = PHOTO_EXT[ext] ?? 'application/octet-stream';
    try {
      const key = photoObjectKey(m.userId, ext);
      await putArchiveObject(key, data, mime);
      await db.update(users).set({
        photoKey: key, photoMime: mime, photoUpdatedAt: new Date(),
        photoFileName: (m.path.split('/').pop() ?? m.path).slice(0, 255),
      }).where(eq(users.id, m.userId));
      report.stored++;
    } catch (e) {
      const msg = (e as Error).message || String(e);
      // خطای اتصال به انبار فایل یعنی هیچ عکسی ذخیره نخواهد شد؛ ادامهٔ حلقه
      // فقط هزاران خطای تکراری تولید می‌کند.
      if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|connect/i.test(msg)) {
        report.errors.push(`اتصال به انبار فایل (Object Storage) برقرار نشد: ${msg} — عکس‌ها ذخیره نشدند. سرویس MinIO/S3 و متغیرهای S3_ENDPOINT/S3_ACCESS_KEY را بررسی کنید.`);
        break;
      }
      report.errors.push(`ذخیرهٔ «${m.path}» ناموفق بود: ${msg}`);
      if (report.errors.length > 20) {
        report.errors.push('… ادامهٔ خطاها نمایش داده نشد.');
        break;
      }
    }
  }
  return report;
}
