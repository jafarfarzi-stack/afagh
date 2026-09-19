'use client';

// ════════════════════════════════════════════════════════════════════════
//  پوستهٔ ماژول برنامهٔ درسی — ترتیب چیدمان قطعات، بدون state و بدون محاسبه.
//  هر بلوک شرطِ رندر خودش را داخل فایل خودش نگه داشته (رفتار قبلی، عیناً).
// ════════════════════════════════════════════════════════════════════════
import CurriculumToast from './CurriculumToast';
import CurriculumHeader from './CurriculumHeader';
import CurriculumTabsBar from './CurriculumTabsBar';
import CatalogTab from './CatalogTab';
import VersionDetailPanel from './VersionDetailPanel';
import NewVersionModal from './NewVersionModal';
import NewCourseModal from './NewCourseModal';
import CourseRulesModal from './CourseRulesModal';
import AddCourseModal from './AddCourseModal';
import RejectModal from './RejectModal';

export default function CurriculumShell() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-3 sm:p-6 space-y-5" dir="rtl">
      <CurriculumToast />
      <CurriculumHeader />
      <CurriculumTabsBar />
      <CatalogTab />
      <VersionDetailPanel />
      <NewVersionModal />
      <NewCourseModal />
      <CourseRulesModal />
      <AddCourseModal />
      <RejectModal />
    </div>
  );
}
