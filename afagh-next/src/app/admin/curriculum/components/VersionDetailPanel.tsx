'use client';

// ════════════════════════════════════════════════════════════════════════
//  قاب «جزئیات نسخهٔ انتخابی» — فقط <div> بیرونی و پنج تب داخلش.
//  هیچ محاسبه‌ای اینجا نیست؛ هر تب فایل مستقل خودش را دارد.
// ════════════════════════════════════════════════════════════════════════
import { useCurriculum } from '../curriculum-context';
import DetailHeaderBar from './DetailHeaderBar';
import DetailFallback from './DetailFallback';
import VerifyTab from './VerifyTab';
import CoursesTab from './CoursesTab';
import SemestersTab from './SemestersTab';
import TransferTab from './TransferTab';

export default function VersionDetailPanel() {
  const { activeTab, detail, selectedVersion } = useCurriculum();
  // تب «تعریف کاتالوگ رشته» دادهٔ جزئیات نمی‌خواهد؛ بقیه سه/چهار تب لازم دارند
  const needsDetail = activeTab !== 'CATALOG';

  return (
    <>
      {/* Detail */}
      {selectedVersion && (
        <div className="space-y-5">
          <DetailHeaderBar />
          {needsDetail && !detail && <DetailFallback />}
          <VerifyTab />
          <CoursesTab />
          <SemestersTab />
          <TransferTab />
        </div>
      )}
    </>
  );
}
