import { getMakeupInbox } from './makeup-actions';
import MakeupInboxClient from './MakeupInboxClient';

/**
 * کارتابل درخواست‌های کلاس جبرانی — دادهٔ واقعی از class_sessions
 * (وضعیت PROPOSED = در انتظار تخصیص سالن توسط آموزش).
 */
export default async function AdminMakeupRequestsCard() {
  let initialRows: Awaited<ReturnType<typeof getMakeupInbox>>['rows'] = [];
  let rooms: Awaited<ReturnType<typeof getMakeupInbox>>['rooms'] = [];
  try {
    const data = await getMakeupInbox();
    initialRows = data.rows;
    rooms = data.rooms;
  } catch {
    // اگر جدول/ستون هنوز مهاجرت نشده، کارت خالی نشان بده (نه دادهٔ نمایشی)
  }
  return <MakeupInboxClient initialRows={initialRows} rooms={rooms} />;
}

export type { MakeupInboxRow } from './makeup-actions';
