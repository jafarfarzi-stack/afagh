'use client';

// مودال: رد نسخه با یادداشت
import { useCallback } from 'react';
import { useCurriculum } from '../curriculum-context';
import Modal from '@/components/ui/Modal';

export default function RejectModal() {
 const {
 busy,
 handleReject,
 modal,
 rejectNote,
 setModal,
 setRejectNote,
 } = useCurriculum();

 // onClose ثابت تا افکت Modal با هر رندر (هر کلید تایپ) دوباره اجرا نشود
 const handleClose = useCallback(() => setModal(null), [setModal]);

 return (
 <Modal
 open={modal === 'REJECT'}
 onClose={handleClose}
 title="✕ رد نسخه و بازگشت به پیش‌نویس"
 size="md"
 footer={
 <div className="flex w-full flex-wrap justify-end gap-2">
 <button onClick={() => setModal(null)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
 <button
 onClick={() => rejectNote.trim() && handleReject(rejectNote.trim())}
 disabled={busy || !rejectNote.trim()}
 className="px-5 py-1.5 rounded-lg bg-rose-600 text-white font-extrabold text-xs disabled:opacity-50"
 >
 ثبت رد
 </button>
 </div>
 }
 >
 <label className="block text-xs font-bold text-slate-700">
 دلیل رد (الزامی):
 <textarea
 value={rejectNote}
 onChange={e => setRejectNote(e.target.value)}
 rows={3}
 className="mt-1 w-full border border-slate-300 rounded-lg p-2"
 />
 </label>
 </Modal>
 );
}
