'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Button from './Button';
import Modal from './Modal';
import { registerConfirm, type ConfirmOptions } from '@/lib/ui-feedback';

/**
 * `confirm()` قابل‌وعده — جانشین ۶۳ فراخوانی `window.confirm` در کدبیس.
 *
 * استفاده:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: '…', body: '…', danger: true }))) return;
 *
 * چرا: دیالوگ بومی قابل ترجمه/استایل‌دهی نیست، در موبایل کل صفحه را بلاک
 * می‌کند و متن مخرب را از متن بی‌خطر جدا نمی‌کند (دکمهٔ تأییدِ حذف و
 * «فعال‌سازی» هر دو OK است). این نسخه با `danger` دکمهٔ قرمز و متن هشدار
 * نشان می‌دهد و فوکوس را روی «انصراف» می‌گذارد.
 */
type Options = {
  title: string;
  body?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

const Ctx = createContext<(o: Options) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<{ opts: Options; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback(
    (opts: Options) => new Promise<boolean>(resolve => setPending({ opts, resolve })),
    []
  );

  const answer = useCallback(
    (v: boolean) => {
      setPending(p => {
        p?.resolve(v);
        return null;
      });
    },
    []
  );

  const value = useMemo(() => confirm, [confirm]);

  /* ثبت در پلِ سراسری: کدِ بیرون از کامپوننت هم می‌تواند `askConfirm()` بزند
     و همین دیالوگ (با ترپ فوکوس و دکمهٔ خطر) باز شود. */
  useEffect(() => {
    registerConfirm((opts) => confirm(opts as Options));
    return () => registerConfirm(null);
  }, [confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal
        open={!!pending}
        onClose={() => answer(false)}
        title={pending?.opts.title ?? ''}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" full onClick={() => answer(false)}>
              {pending?.opts.cancelText ?? 'انصراف'}
            </Button>
            <Button
              type="button"
              variant={pending?.opts.danger ? 'danger' : 'success'}
              full
              onClick={() => answer(true)}
            >
              {pending?.opts.confirmText ?? 'تأیید'}
            </Button>
          </>
        }
      >
        {pending?.opts.body ? (
          <p className="text-xs font-bold leading-6 text-slate-700 dark:text-slate-300">{pending.opts.body}</p>
        ) : null}
        {pending?.opts.danger ? (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-2xs font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
            ⚠️ این عمل بازگشت‌پذیر نیست؛ پیش از تأیید مطمئن شوید.
          </p>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

export function useConfirm() {
  return useContext(Ctx);
}
