'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

export interface PermissionDefinition {
  id: number;
  code: string;
  category: 'ثبت‌نام و پذیرش (e-KYC)' | 'امور مالی و شهریه' | 'امتحانات و مخزن اوراق' | 'آموزش و نمرات' | 'بایگانی دیجیتال' | 'آموزش‌های آزاد';
  description: string;
}

export interface RoleMatrixItem {
  id: number;
  code: string;
  title: string;
  userCount: number;
  isSystem: boolean;
  permissions: string[]; // List of permission codes
}

const faNum = (n: any) =>
  n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const INITIAL_PERMISSIONS: PermissionDefinition[] = [
  // ثبت‌نام و پذیرش
  { id: 1, code: 'students:verify_kyc', category: 'ثبت‌نام و پذیرش (e-KYC)', description: 'تایید مدارک هویتی و ثبت‌نام آنلاین دانشجو' },
  { id: 2, code: 'students:issue_card', category: 'ثبت‌نام و پذیرش (e-KYC)', description: 'صدور و چاپ کارت دانشجویی هوشمند با QR' },
  { id: 3, code: 'students:view_dossier', category: 'ثبت‌نام و پذیرش (e-KYC)', description: 'مشاهده پرونده تحصیلی و هویتی دانشجو' },
  
  // امور مالی و شهریه
  { id: 4, code: 'finance:view_ledger', category: 'امور مالی و شهریه', description: 'مشاهده تراز مالی، دفتر کل و بدهکاری دانشجویان' },
  { id: 5, code: 'finance:approve_advances', category: 'امور مالی و شهریه', description: 'فعال‌سازی و تایید مساعده و علی‌الحساب اساتید' },
  { id: 6, code: 'finance:settle_payroll', category: 'امور مالی و شهریه', description: 'تسویه نهایی حق‌التدریس و صدور دیسکت بانکی' },
  { id: 7, code: 'finance:tamin_insurance', category: 'امور مالی و شهریه', description: 'مدیریت لیست بیمه روزانه تامین اجتماعی و مالیات' },

  // امتحانات و مخزن اوراق
  { id: 8, code: 'exams:manage_halls', category: 'امتحانات و مخزن اوراق', description: 'برنامه‌ریزی سالن‌ها، شماره صندلی و مراقبین' },
  { id: 9, code: 'exams:vault_handover', category: 'امتحانات و مخزن اوراق', description: 'شمارش و تایید بسته‌های درسی مخزن قرنطینه' },
  { id: 10, code: 'exams:proctor_attendance', category: 'امتحانات و مخزن اوراق', description: 'حضور و غیاب داوطلبان با اسکنر QR در سالن' },
  { id: 11, code: 'exams:temp_permit', category: 'امتحانات و مخزن اوراق', description: 'صدور مجوز ورود موقت (تعهد) بدون کارت' },

  // آموزش و نمرات
  { id: 12, code: 'grades:enter_temporary', category: 'آموزش و نمرات', description: 'ورود نمرات میان‌ترم و ثبت موقت' },
  { id: 13, code: 'grades:finalize_otp', category: 'آموزش و نمرات', description: 'قفل و نهایی‌سازی قطعی کارنامه با امضای OTP' },
  { id: 14, code: 'grades:resolve_appeals', category: 'آموزش و نمرات', description: 'رسیدگی به فرجام‌خواهی و اعتراضات نمره' },

  // بایگانی دیجیتال
  { id: 15, code: 'archive:verify_papers', category: 'بایگانی دیجیتال', description: 'تایید دریافت فیزیکی اوراق امتحانی و آزادسازی مالی' },
  { id: 16, code: 'archive:view_documents', category: 'بایگانی دیجیتال', description: 'مشاهده اسناد محرمانه و پرونده‌های بایگانی' },
];

const INITIAL_ROLES: RoleMatrixItem[] = [
  {
    id: 1,
    code: 'ADMIN',
    title: 'مدیر ارشد سیستم (Super Admin)',
    userCount: 2,
    isSystem: true,
    permissions: INITIAL_PERMISSIONS.map(p => p.code),
  },
  {
    id: 2,
    code: 'REGISTRATION_STAFF',
    title: 'کارشناس ثبت‌نام و پذیرش (e-KYC)',
    userCount: 4,
    isSystem: false,
    permissions: ['students:verify_kyc', 'students:issue_card', 'students:view_dossier', 'exams:temp_permit'],
  },
  {
    id: 3,
    code: 'FINANCE_EXPERT',
    title: 'کارشناس مالی و شهریه (Finance)',
    userCount: 3,
    isSystem: false,
    permissions: ['finance:view_ledger', 'finance:approve_advances', 'finance:settle_payroll', 'finance:tamin_insurance'],
  },
  {
    id: 4,
    code: 'VAULT_MANAGER',
    title: 'مسئول مخزن و قرنطینه امتحانات',
    userCount: 2,
    isSystem: false,
    permissions: ['exams:manage_halls', 'exams:vault_handover'],
  },
  {
    id: 5,
    code: 'ARCHIVE_EXPERT',
    title: 'کارشناس بایگانی الکترونیک',
    userCount: 2,
    isSystem: false,
    permissions: ['archive:verify_papers', 'archive:view_documents'],
  },
  {
    id: 6,
    code: 'PROCTOR',
    title: 'مراقب حوزه آزمون',
    userCount: 15,
    isSystem: false,
    permissions: ['exams:proctor_attendance'],
  },
  {
    id: 7,
    code: 'PROFESSOR',
    title: 'استاد هیئت علمی / مدعو',
    userCount: 45,
    isSystem: true,
    permissions: ['grades:enter_temporary', 'grades:finalize_otp', 'grades:resolve_appeals'],
  },
];

export default function AdminPermissionsClient() {
  const [roles, setRoles] = useState<RoleMatrixItem[]>(INITIAL_ROLES);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Custom Role Form State
  const [newRoleTitle, setNewRoleTitle] = useState('');
  const [newRoleCode, setNewRoleCode] = useState('');
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  const categories = ['ALL', 'ثبت‌نام و پذیرش (e-KYC)', 'امور مالی و شهریه', 'امتحانات و مخزن اوراق', 'آموزش و نمرات', 'بایگانی دیجیتال'];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Toggle specific permission for a role
  const handleTogglePermission = (roleCode: string, permissionCode: string) => {
    setRoles(prev =>
      prev.map(r => {
        if (r.code !== roleCode) return r;
        const has = r.permissions.includes(permissionCode);
        const nextPerms = has
          ? r.permissions.filter(p => p !== permissionCode)
          : [...r.permissions, permissionCode];
        return { ...r, permissions: nextPerms };
      })
    );
    showToast(`مجوز «${permissionCode}» برای نقش «${roleCode}» به‌روزرسانی شد.`);
  };

  // Create New Custom Role
  const handleCreateNewRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleTitle || !newRoleCode) return;

    const newRole: RoleMatrixItem = {
      id: Date.now(),
      code: newRoleCode.toUpperCase().trim(),
      title: newRoleTitle.trim(),
      userCount: 0,
      isSystem: false,
      permissions: [],
    };

    setRoles(prev => [...prev, newRole]);
    setNewRoleTitle('');
    setNewRoleCode('');
    setIsCreatingRole(false);
    showToast(`نقش سفارشی «${newRole.title}» با موفقیت تعریف شد. اکنون می‌توانید مجوزهای آن را تنظیم نمایید.`);
  };

  const filteredPermissions = INITIAL_PERMISSIONS.filter(p => {
    if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-4 bg-emerald-950 text-emerald-100 rounded-2xl shadow-xl border border-emerald-600 font-bold text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>📢</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-800/50 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-400 text-slate-950">
              امنیت و کنترل دسترسی (Dynamic RBAC)
            </span>
            <span className="text-xs text-indigo-300">تفکیک وظایف پرسنل آموزشی و مالی</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black">
            🛡️ ماتریس پویا و مدیریت سطوح دسترسی کاربران و کارشناسان
          </h1>
          <p className="text-xs text-indigo-200 mt-1">
            تفکیک کامل اختیارات کارشناس ثبت‌نام، کارشناس مالی، مخزن اوراق، مراقبین و اساتید با کلیدهای تفکیک وظایف (Segregation of Duties)
          </p>
        </div>

        <button
          onClick={() => setIsCreatingRole(!isCreatingRole)}
          className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg transition flex items-center gap-1.5"
        >
          <span>+ تعریف نقش سازمانی جدید</span>
        </button>
      </div>

      {/* Segregation of Duties Info Box */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center gap-2 text-indigo-900 font-black">
            <span>🎓</span>
            <span>کارشناس ثبت‌نام و پذیرش (e-KYC):</span>
          </div>
          <p className="text-slate-600 leading-5">
            دسترسی به تایید احراز هویت و صدور کارت دانشجویی. <b>دسترسی مالی: صفر مطلق</b> (امکان مشاهده گردش حساب ندارد).
          </p>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center gap-2 text-emerald-900 font-black">
            <span>💰</span>
            <span>کارشناس مالی و شهریه (Finance):</span>
          </div>
          <p className="text-slate-600 leading-5">
            دسترسی به تراز دفتر کل، تایید مساعده و تسویه حق‌التدریس. <b>دسترسی آموزشی: صفر مطلق</b> (امکان ویرایش نمرات ندارد).
          </p>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center gap-2 text-amber-900 font-black">
            <span>🔒</span>
            <span>مسئول مخزن و قرنطینه امتحانات:</span>
          </div>
          <p className="text-slate-600 leading-5">
            دسترسی زمان‌دار به اسکن بسته‌های درسی و تحویل اوراق با QR. <b>دسترسی به سوالات خارج از بازه: مسدود</b>.
          </p>
        </div>
      </div>

      {/* New Role Modal / Inline Drawer */}
      {isCreatingRole && (
        <form
          onSubmit={handleCreateNewRole}
          className="p-5 bg-white rounded-3xl border-2 border-indigo-500/60 shadow-lg space-y-4 animate-scaleUp"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-black text-slate-900 text-sm">تعریف نقش سازمانی سفارشی جدید (Custom Role)</h3>
            <button
              type="button"
              onClick={() => setIsCreatingRole(false)}
              className="text-slate-400 hover:text-slate-700 text-xs"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">عنوان فارسی نقش سازمانی *</label>
              <input
                type="text"
                required
                placeholder="مثال: کارشناس امور فرهنگی و دانشجویی"
                value={newRoleTitle}
                onChange={e => setNewRoleTitle(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">کد سیستمی نقش (انگلیسی) *</label>
              <input
                type="text"
                required
                placeholder="CULTURAL_OFFICER"
                value={newRoleCode}
                onChange={e => setNewRoleCode(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500"
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreatingRole(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-black text-xs shadow-xs"
            >
              + ثبت و افزودن به ماتریس
            </button>
          </div>
        </form>
      )}

      {/* Permission Matrix Data Grid */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
        {/* Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-500 shrink-0">فیلتر بخش‌ها:</span>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-indigo-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'ALL' ? 'همه بخش‌ها' : cat}
            </button>
          ))}
        </div>

        {/* Matrix Grid Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-3 w-64">عنوان مجوز و شرح دسترسی</th>
                <th className="p-3">دسته‌بندی</th>
                {roles.map(r => (
                  <th key={r.code} className="p-3 text-center min-w-[110px]">
                    <div className="font-black">{r.title}</div>
                    <div className="text-[10px] text-indigo-300 font-mono" dir="ltr">
                      {r.code} ({faNum(r.userCount)})
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPermissions.map((perm, idx) => (
                <tr
                  key={perm.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                  }`}
                >
                  <td className="p-3">
                    <div className="font-black text-slate-900">{perm.description}</div>
                    <div className="font-mono text-[10px] text-slate-400" dir="ltr">
                      {perm.code}
                    </div>
                  </td>

                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                      {perm.category}
                    </span>
                  </td>

                  {/* Role Checkbox Toggles */}
                  {roles.map(role => {
                    const isAllowed = role.permissions.includes(perm.code);
                    const isAdmin = role.code === 'ADMIN';

                    return (
                      <td key={role.code} className="p-3 text-center">
                        <label className="inline-flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isAllowed}
                            disabled={isAdmin} // Super Admin cannot be unchecked
                            onChange={() => handleTogglePermission(role.code, perm.code)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-70"
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
          <span>تغییرات به صورت لحظه‌ای در کش Redis و Middleware مرکزی اعمال می‌گردد.</span>
          <span className="font-bold text-indigo-900">تعداد کل مجوزهای امنیتی: {faNum(INITIAL_PERMISSIONS.length)} مجوز</span>
        </div>
      </div>
    </div>
  );
}
