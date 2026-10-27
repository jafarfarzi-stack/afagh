'use client';

// دکمهٔ «همگام‌سازی پیش‌نیاز از جدول دروس».
// منبعِ قواعد در سامانهٔ قدیمی «جدول دروس» بود؛ چون course_rules به نسخه
// مقیّد است، این دکمه متنِ درس‌ها را برای همین نسخه مادی‌سازی می‌کند.
// اکشن در Provider صدا زده می‌شود (قاعدهٔ معماری ماژول: هیچ کامپوننتی
// Server Action را مستقیم import نمی‌کند).
import { useCurriculum } from '../curriculum-context';

export default function SyncRequisitesButton() {
  const { busy, handleSyncRequisites, selectedVersionId } = useCurriculum();

  return (
    <button
      type="button"
      onClick={handleSyncRequisites}
      disabled={busy || selectedVersionId == null}
      title="خواندن پیش‌نیاز و هم‌نیاز از جدول دروس و ثبت آن در قواعد این نسخه"
      className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs border border-white/20 transition"
    >
      {busy ? '⏳ در حال خواندن…' : '🔗 پیش‌نیاز از جدول دروس'}
    </button>
  );
}
