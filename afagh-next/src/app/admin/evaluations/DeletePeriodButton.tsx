'use client';

import { deleteEvaluationPeriodAction } from './actions';

/** دکمهٔ حذف دوره با تأیید — جدا شده چون سرورکامپوننت هندلر رویداد ندارد. */
export default function DeletePeriodButton({ id }: { id: number }) {
  return (
    <form
      action={deleteEvaluationPeriodAction}
      className="inline"
      onSubmit={(e) => { if (!confirm('این دورهٔ ارزشیابی حذف شود؟')) e.preventDefault(); }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="rounded-lg bg-red-50 px-2 py-1 font-bold text-red-700 hover:bg-red-100">حذف</button>
    </form>
  );
}
