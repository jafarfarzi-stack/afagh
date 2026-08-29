import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { departments, roles, staff, user_roles, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function toggleHeadAction(fd: FormData) {
  'use server';
  await requireRole(['ADMIN']);
  const userId = Number(fd.get('userId'));
  const assign = fd.get('assign') === '1';
  const [head] = await db.select().from(roles).where(eq(roles.code, 'DEP_HEAD')).limit(1);
  if (!head) return;
  if (assign) {
    const has = await db.select().from(user_roles).where(eq(user_roles.userId, userId));
    if (!has.some(h => h.roleId === head.id)) await db.insert(user_roles).values({ userId, roleId: head.id });
  } else {
    await db.delete(user_roles).where(eq(user_roles.userId, userId));
  }
  revalidatePath('/admin/staff');
}

export default async function StaffPage() {
  await requireRole(['ADMIN']);
  const [head] = await db.select().from(roles).where(eq(roles.code, 'DEP_HEAD')).limit(1);
  const rows = await db
    .select({ userId: users.id, code: users.nationalCode, name: users.firstName, family: users.lastName, staffCode: staff.staffCode, dept: departments.name, rank: staff.academicRank, type: staff.staffType })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .leftJoin(departments, eq(departments.id, staff.departmentId))
    .orderBy(staff.id);
  const headRoles = head ? await db.select().from(user_roles).where(eq(user_roles.roleId, head.id)) : [];
  const heads = new Set(headRoles.map(h => h.userId));

  return (
    <div className="card">
      <h2 className="mb-1 font-bold">استاف و مدیران گروه</h2>
      <p className="mb-3 text-xs text-slate-500">مدیر گروه (DEP_HEAD) به پنل /group-manager می‌رسد و فقط دروس/ارائه‌های گروه خودش را مدیریت می‌کند.</p>
      <table className="w-full text-right text-xs">
        <thead><tr className="text-slate-500"><th className="p-2">نام</th><th className="p-2">کد</th><th className="p-2">گروه</th><th className="p-2">رتبه/نوع</th><th className="p-2">مدیر گروه</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.userId} className={'border-t border-slate-100' + (heads.has(r.userId) ? ' bg-teal-50' : '')}>
              <td className="p-2 font-medium">{r.name} {r.family}</td>
              <td className="p-2" dir="ltr">{r.staffCode}</td>
              <td className="p-2">{r.dept ?? '—'}</td>
              <td className="p-2">{r.rank ?? r.type ?? '—'}</td>
              <td className="p-2">
                <form action={toggleHeadAction}>
                  <input type="hidden" name="userId" value={r.userId} />
                  <input type="hidden" name="assign" value={heads.has(r.userId) ? '0' : '1'} />
                  <button className={heads.has(r.userId) ? 'text-red-600 hover:underline' : 'text-teal-700 hover:underline'}>
                    {heads.has(r.userId) ? 'گرفتن نقش' : 'دادن نقش'}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
