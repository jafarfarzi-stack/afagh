'use client';

import { useTransition } from 'react';
import { approveRequestAction, rejectRequestAction } from './actions';

export default function RequestActionButtons({ requestId, status }: { requestId: number; status: string }) {
  const [isPending, startTransition] = useTransition();

  if (status === 'APPROVED') {
    return <span className="text-xs font-semibold text-emerald-700">تأییدشده ✓</span>;
  }
  if (status === 'REJECTED') {
    return <span className="text-xs font-semibold text-red-700">ردشده ✗</span>;
  }

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <button
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await approveRequestAction(requestId);
          });
        }}
        className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1 font-medium transition-colors disabled:opacity-50"
      >
        {isPending ? '...' : 'تأیید شورا'}
      </button>

      <button
        disabled={isPending}
        onClick={() => {
          const reason = prompt('در صورت تمایل دلیل رد را وارد کنید:');
          if (reason !== null) {
            startTransition(async () => {
              await rejectRequestAction(requestId, reason);
            });
          }
        }}
        className="rounded-md bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs px-2.5 py-1 font-medium transition-colors disabled:opacity-50"
      >
        رد
      </button>
    </div>
  );
}
