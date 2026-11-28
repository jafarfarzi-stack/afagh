'use client';

// ═══════════════════════════════════════════════════════════════════════
// StaffProfilePanel — پروندهٔ استاد / کارمند
//
// بازطراحی (UI/UX):
// • سربرگ چسبانِ مشترک با عکس، نام، کد استاد، وضعیت و تنها دکمهٔ
// ویرایش/ذخیره/انصراف (نوار کد استاد بیرون فرم حذف شد و کد به شکل
// فقط‌خواندنی داخل فرم آمد).
// • ورودی لاتین «Full Name» که هیچ data-f/مسیر ذخیره نداشت و همچنین
// بلوک تزئینی «امضای الکترونیک» حذف شدند.
// • بلوک‌های تکراری «وضعیت» و «پایه» به یک کنترل واحد رسیدند.
// • دانشکده/گروه آموزشی فقط‌خواندنی‌اند؛ تغییر گروه از صفحهٔ گروه‌های
// آموزشی (setStaffDepartmentAction) انجام می‌شود.
// • نام فیلدهای حقوق/بانک (bankAccountNo, academicBase, …) دست‌نخورده
// مانده‌اند چون موتور حقوق و دستمزد به همان نام‌ها وابسته است.
// ═══════════════════════════════════════════════════════════════════════

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import StickyIdentityHeader from './StickyIdentityHeader';
import { ReadOnlyField, SelectField, TextField } from './Field';
import type { ProfileDraft } from './profile-draft';
import type { StaffItem } from '../types';
import { faNum } from '../transcript-utils';
import { setStaffDepartmentAction } from '@/app/admin/departments/actions';

export type StaffProfilePanelProps = {
 staff: StaffItem;
 draft: ProfileDraft;
 onField: (key: string, value: string | number) => void;
 editing: boolean;
 /** فقط ADMIN — ذخیرهٔ پروندهٔ استاد سمت سرور هم فقط ADMIN است */
 canEdit: boolean;
 saving: boolean;
 dirty: boolean;
 onEdit: () => void;
 onSave: () => void;
 onCancel: () => void;
 /** برچسب ترکیبی اشتغال (تدریس/اداری) برای گزینهٔ فعال */
 engageLabel: string;
 roleCount: number;
 rolesTitle: string;
 onOpenRoles: () => void;
 onToggleActive: () => void;
 onChangePassword: () => void;
 /** گروه‌های آموزشیِ همین دانشگاه — برای انتساب مستقیم از پرونده */
 deptOptions: { id: number; name: string; facultyId: number | null }[];
};

export default function StaffProfilePanel({
 staff,
 draft,
 onField,
 editing,
 canEdit,
 saving,
 dirty,
 onEdit,
 onSave,
 onCancel,
 engageLabel,
 roleCount,
 rolesTitle,
 onOpenRoles,
 onToggleActive,
 onChangePassword,
 deptOptions,
}: StaffProfilePanelProps) {
 const router = useRouter();
 const [deptPick, setDeptPick] = useState(String(staff.departmentId ?? ''));
 const [deptSaving, setDeptSaving] = useState(false);
 const [deptMsg, setDeptMsg] = useState('');
 useEffect(() => {
 setDeptPick(String(staff.departmentId ?? ''));
 setDeptMsg('');
 }, [staff.id, staff.departmentId]);

 /** ذخیرهٔ انتساب گروه از همین پرونده — همان اکشنی که صفحهٔ گروه‌ها استفاده می‌کند */
 const saveDepartment = async () => {
 setDeptSaving(true);
 setDeptMsg('');
 try {
 const fd = new FormData();
 fd.set('staffId', String(staff.id));
 fd.set('deptId', deptPick);
 const res = await setStaffDepartmentAction(fd);
 if (res.ok) {
 setDeptMsg('گروه آموزشی ذخیره شد.');
 router.refresh();
 } else {
 setDeptMsg(res.error || 'ذخیره نشد.');
 }
 } catch {
 setDeptMsg('ذخیرهٔ گروه انجام نشد.');
 } finally {
 setDeptSaving(false);
 }
 };

 const bind = (key: string) => (editing ? (v: string) => onField(key, v) : undefined);
 const active = Number(draft.isActive ?? 1) !== 0;
 const married = String(draft.maritalStatus ?? '') !== 'مجرد';

 return (
 <div className="space-y-2">
 <StickyIdentityHeader
 userId={staff.userId}
 hasPhoto={!!staff.photoKey}
 photoIcon="👨‍🏫"
 photoLabel="تصویر پرسنلی"
 title={`${staff.firstName} ${staff.lastName}`.trim()}
 codeLabel="کد استاد"
 code={staff.staffCode}
 status={(
 <span className={`rounded-full px-2 py-0.5 text-3xs font-bold ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
 {active ? `✅ ${engageLabel}` : '⛔ غیرفعال'}
 </span>
 )}
 editing={editing}
 canEdit={canEdit}
 dirty={dirty}
 saving={saving}
 onEdit={onEdit}
 onSave={onSave}
 onCancel={onCancel}
 extraActions={staff.userId ? (
 <button
 type="button"
 onClick={onOpenRoles}
 className="rounded bg-indigo-700 px-2.5 py-1.5 text-2xs font-bold text-white hover:bg-indigo-800"
 title={rolesTitle}
 >
 {roleCount > 0 ? `⚙ ${faNum(roleCount, 0)} نقش` : '⚙ نقش‌ها'}
 </button>
 ) : undefined}
 />

 <div key={`prof-${staff.id}`} className="space-y-3 rounded-b-md border border-slate-400 bg-white p-3 sm:p-5">
 {/* ── ۱) آموزشی و سازمانی ── */}
 <section className="space-y-2">
 <h4 className="font-bold text-slate-800">🎓 اطلاعات آموزشی و سازمانی</h4>
 <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
 <ReadOnlyField label="کد استاد" value={staff.staffCode} dir="ltr" mono align="right" />
 <ReadOnlyField
 label="دانشکده"
 value={staff.facultyName && staff.facultyName !== '—'
 ? `${staff.facultyName}${staff.facultyCode ? ` (کد ${staff.facultyCode})` : ''}`
 : ''}
 hint="از گروه آموزشی انتخاب‌شده تعیین می‌شود"
 />
 <div className="space-y-1">
 <SelectField
 label="گروه آموزشی"
 value={deptPick}
 onChange={editing ? v => { setDeptPick(v); setDeptMsg(''); } : undefined}
 options={[
 { value: '', label: '— بدون گروه —' },
 ...deptOptions.map(d => ({ value: String(d.id), label: d.name })),
 ]}
 />
 {editing && deptPick !== String(staff.departmentId ?? '') && (
 <button
 type="button"
 onClick={saveDepartment}
 disabled={deptSaving}
 className="rounded-lg bg-indigo-700 px-2.5 py-1 text-2xs font-bold text-white disabled:opacity-60"
 >
 {deptSaving ? '⏳ در حال ذخیره…' : '💾 ذخیرهٔ گروه آموزشی'}
 </button>
 )}
 {deptMsg && <p className="text-3xs font-bold text-indigo-700">{deptMsg}</p>}
 <p className="text-3xs text-slate-500">
 همین گروه، مبنای یافتن استاد در «برنامه‌ریزی» است؛ تغییر گروه از{' '}
 <Link prefetch={false} href="/admin/departments" className="font-bold text-indigo-700 underline">
 صفحهٔ گروه‌های آموزشی
 </Link>{' '}
 هم ممکن است.
 </p>
 </div>
 <TextField label="رشته و گرایش تخصصی" value={String(draft.fieldOfStudy ?? '')} onChange={bind('fieldOfStudy')} />
 <ReadOnlyField label="رشتهٔ اصلی" value={staff.fieldMain} />
 <TextField label="آخرین دانشگاه دانش‌آموختگی" value={String(draft.lastDegreeUniversity ?? '')} onChange={bind('lastDegreeUniversity')} />
 <TextField label="کشور اخذ آخرین مدرک" value={String(draft.lastDegreeCountryCode ?? '')} onChange={bind('lastDegreeCountryCode')} mono />
 <SelectField
 label="وضعیت کلی اشتغال"
 value={active ? '1' : '0'}
 onChange={editing ? v => onField('isActive', v === '1' ? 1 : 0) : undefined}
 options={[{ value: '1', label: engageLabel }, { value: '0', label: 'غیرفعال' }]}
 />
 </div>
 </section>

 {/* ── ۲) استخدامی و حقوق ── */}
 <section className="space-y-2 border-t border-slate-200 pt-3">
 <h4 className="font-bold text-slate-800">📑 اطلاعات استخدامی</h4>
 <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
 <TextField label="مدرک تحصیلی" value={String(draft.degree ?? '')} onChange={bind('degree')} />
 <TextField label="نوع همکاری" value={String(draft.cooperationType ?? '')} onChange={bind('cooperationType')} />
 <TextField label="مرتبهٔ علمی" value={String(draft.academicRank ?? '')} onChange={bind('academicRank')} />
 <TextField label="شمارهٔ مستخدم" value={String(draft.personnelNo ?? '')} onChange={bind('personnelNo')} dir="ltr" mono />
 <TextField label="تاریخ استخدام" value={String(draft.hireDate ?? '')} onChange={bind('hireDate')} dir="ltr" mono />
 <TextField label="پایهٔ استادی" value={String(draft.academicBase ?? '')} onChange={bind('academicBase')} mono center />
 <TextField label="سمت اجرایی" value={String(draft.staffType ?? '')} onChange={bind('staffType')} />
 <TextField
 label="شمارهٔ حساب بانکی"
 value={String(draft.bankAccountNo ?? '')}
 onChange={bind('bankAccountNo')}
 dir="ltr"
 mono
 hint="برای واریز حقوق استفاده می‌شود — نام و مقدار این فیلد را عوض نکنید"
 />
 </div>
 </section>

 {/* ── ۳) فردی و حساب وب ── */}
 <section className="space-y-2 border-t border-slate-200 pt-3">
 <h4 className="font-bold text-slate-800">👤 اطلاعات فردی</h4>
 <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
 <TextField label="نام" value={String(draft.firstName ?? '')} onChange={bind('firstName')} />
 <TextField label="نام خانوادگی" value={String(draft.lastName ?? '')} onChange={bind('lastName')} />
 <TextField label="کد ملی" value={String(draft.nationalCode ?? '')} onChange={bind('nationalCode')} dir="ltr" mono maxLength={10} inputMode="numeric" />
 <TextField
 label="تاریخ تولد (شمسی)"
 value={String(draft.birthDate ?? '')}
 onChange={bind('birthDate')}
 dir="ltr"
 mono
 placeholder="۱۳۶۰/۰۱/۰۱"
 hint="در سرور به میلادی تبدیل می‌شود"
 />
 <TextField label="تلفن همراه" value={String(draft.mobile ?? '')} onChange={bind('mobile')} dir="ltr" mono maxLength={11} inputMode="tel" />
 <TextField label="تلفن دفتر / ثابت" value={String(draft.phone ?? '')} onChange={bind('phone')} dir="ltr" mono />
 <TextField label="پست الکترونیکی" value={String(draft.email ?? '')} onChange={bind('email')} dir="ltr" mono type="email" />
 <TextField label="آدرس محل سکونت" value={String(draft.address ?? '')} onChange={bind('address')} className="sm:col-span-2" />

 <div className="space-y-1">
 <span className="block font-bold text-slate-700">وضعیت تأهل</span>
 <div className="flex items-center gap-4 rounded border border-slate-200 bg-slate-100/60 px-2 py-1.5">
 <label className="flex cursor-pointer items-center gap-1">
 <input
 type="radio"
 name={`prof_married_${staff.id}`}
 checked={married}
 onChange={editing ? () => onField('maritalStatus', 'متأهل') : undefined}
 disabled={!editing}
 className="accent-emerald-600"
 />
 متأهل
 </label>
 <label className="flex cursor-pointer items-center gap-1">
 <input
 type="radio"
 name={`prof_married_${staff.id}`}
 checked={!married}
 onChange={editing ? () => onField('maritalStatus', 'مجرد') : undefined}
 disabled={!editing}
 className="accent-emerald-600"
 />
 مجرد
 </label>
 </div>
 </div>
 </div>

 {canEdit && (
 <div className="rounded border border-slate-200 bg-slate-50 p-2.5">
 <div className="flex flex-wrap items-center gap-2">
 <span className="font-bold">🔐 حساب وب استاد:</span>
 <span className={`rounded-full px-2 py-0.5 text-3xs font-bold ${(staff.userIsActive ?? 1) === 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
 {(staff.userIsActive ?? 1) === 0 ? '⛔ غیرفعال' : '✅ فعال'}
 </span>
 <div className="mr-auto flex flex-wrap gap-1.5">
 <button
 type="button"
 onClick={onToggleActive}
 className="rounded border border-slate-300 bg-white px-2.5 py-1 text-2xs font-bold hover:bg-slate-100"
 title="فعال/غیرفعال‌سازی کامل حساب (ورود، کارتابل، برنامه‌ریزی، نشست‌ها، OTPها) — فقط مدیر سیستم"
 >
 {(staff.userIsActive ?? 1) === 0 ? 'فعال‌سازی کامل' : 'غیرفعال‌سازی کامل'}
 </button>
 <button
 type="button"
 onClick={onChangePassword}
 className="rounded bg-slate-700 px-2.5 py-1 text-2xs font-bold text-white hover:bg-slate-800"
 title="تغییر رمز عبور استاد (فقط مدیر سیستم)"
 >
 🔑 تغییر رمز
 </button>
 </div>
 </div>
 <p className="mt-1 text-3xs text-slate-500">
 وضعیت حساب وب با «وضعیت کلی اشتغال» (فیلد فرم) متفاوت است و بلافاصله اعمال می‌شود.
 </p>
 </div>
 )}
 </section>
 </div>
 </div>
 );
}
