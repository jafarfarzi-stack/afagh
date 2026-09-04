/**
 * gradesReducer — تجمیع منطق پراکندهٔ مگاکامپوننت نمرات استاد
 *
 * طبق نقشهٔ جراحی معماری، تمام انتقال‌های وضعیت (تغییر بارم، ورود نمره،
 * ارفاق، امضای دروس مشترک، رسیدگی به اعتراض، بایگانی صورت‌جلسه) در این
 * Reducer تجمیع شده است تا:
 *   ۱) باگ‌های رندر ناشی از تداخل useStateهای متعدد (مثل آپدیت میانگین کلاس
 *      و آپدیت نمرهٔ هم‌زمان) حذف شوند؛
 *   ۲) هر بخش فقط از طریق Actionها با وضعیت تعامل کند (ایزوله برای توسعهٔ تیمی)؛
 *   ۳) بدون رندر React قابل Unit Test باشد (tests/grades-reducer.test.ts).
 */
import { Dispatch } from 'react';
import type {
  GradeAppealBreakdown,
  GradeTabType,
  GradingCourseOffering,
  RubricField,
  RubricPreset,
  StudentGradeField,
} from './types';
import {
  RUBRIC_PRESETS,
  applyBonusToStudent,
  applyScoreToStudent,
  calculateFinalScore,
  clampAllStudentsToRubric,
  computeGradesHash,
  isOfferingFinalized,
  isRubricValid,
} from './grades-core';

export interface GradesState {
  offerings: GradingCourseOffering[];
  selectedOfferingId: number;
  activeTab: GradeTabType;
  toastMessage: string | null;
  searchStudentQuery: string;
  lastAutoSaveTime: string;
}

export type GradesAction =
  | { type: 'SET_OFFERING'; payload: number }
  | { type: 'SET_TAB'; payload: GradeTabType }
  | { type: 'SET_TOAST'; payload: string | null }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_SAVE_TIME'; payload: string }
  | { type: 'SWITCH_CO_ROLE'; payload: 'THEORY' | 'LAB' }
  | { type: 'UPDATE_RUBRIC_FIELD'; payload: { field: RubricField; value: number } }
  | { type: 'APPLY_RUBRIC_PRESET'; payload: RubricPreset }
  | { type: 'UPDATE_STUDENT_SCORE'; payload: { studentId: number; field: StudentGradeField; value: number | undefined } }
  | { type: 'COMMIT_GRADES'; payload: { offeringId: number; entries: { studentId: number; field: StudentGradeField; value: number | undefined }[] } }
  | { type: 'APPLY_BONUS_MARK'; payload: number }
  | { type: 'SUBMIT_TEMPORARY' }
  | { type: 'SIGN_OFFERING' }
  | { type: 'RESOLVE_APPEAL'; payload: { appealId: number; decision: 'ACCEPTED' | 'REJECTED'; reply: string; breakdown: GradeAppealBreakdown } }
  | { type: 'ARCHIVE_CERTIFICATE' };

export function initialGradesState(
  offerings: GradingCourseOffering[],
  defaultOfferingId?: number
): GradesState {
  return {
    offerings,
    selectedOfferingId:
      defaultOfferingId && offerings.some(o => o.id === defaultOfferingId)
        ? defaultOfferingId
        : offerings[0]?.id || 0,
    activeTab: 'ROSTER',
    toastMessage: null,
    searchStudentQuery: '',
    lastAutoSaveTime: 'هم‌اکنون',
  };
}

function patchOffering(
  state: GradesState,
  offeringId: number,
  fn: (off: GradingCourseOffering) => GradingCourseOffering
): GradingCourseOffering[] {
  return state.offerings.map(off => (off.id === offeringId ? fn(off) : off));
}

export function gradesReducer(state: GradesState, action: GradesAction): GradesState {
  switch (action.type) {
    case 'SET_OFFERING':
      return { ...state, selectedOfferingId: action.payload, activeTab: 'ROSTER' };
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_TOAST':
      return { ...state, toastMessage: action.payload };
    case 'SET_SEARCH':
      return { ...state, searchStudentQuery: action.payload };
    case 'SET_SAVE_TIME':
      return { ...state, lastAutoSaveTime: action.payload };

    case 'SWITCH_CO_ROLE': {
      const off = state.offerings.find(o => o.id === state.selectedOfferingId);
      const offerings = patchOffering(state, state.selectedOfferingId, o =>
        o.coTaughtDetails
          ? { ...o, coTaughtDetails: { ...o.coTaughtDetails, currentProfRole: action.payload } }
          : o
      );
      const profTitle = action.payload === 'THEORY'
        ? `بخش تئوری (${off?.coTaughtDetails?.theoryProfName})`
        : `بخش عملی (${off?.coTaughtDetails?.labProfName})`;
      return {
        ...state,
        offerings,
        toastMessage: `دیدگاه تغییر یافت: اکنون در حال ورود نمرات به عنوان استاد ${profTitle} هستید.`,
      };
    }

    case 'UPDATE_RUBRIC_FIELD': {
      if (isOfferingFinalized(state.offerings.find(o => o.id === state.selectedOfferingId))) return state;
      const { field, value } = action.payload;
      return {
        ...state,
        offerings: patchOffering(state, state.selectedOfferingId, off => {
          const newRubric = { ...off.rubric, [field]: Math.max(0, Math.min(20, value)) };
          return { ...off, rubric: newRubric, students: clampAllStudentsToRubric(off, newRubric) };
        }),
      };
    }

    case 'APPLY_RUBRIC_PRESET': {
      const current = state.offerings.find(o => o.id === state.selectedOfferingId);
      if (isOfferingFinalized(current)) return state;
      const newRubric = RUBRIC_PRESETS[action.payload];
      return {
        ...state,
        offerings: patchOffering(state, state.selectedOfferingId, off => ({
          ...off,
          rubric: newRubric,
          students: clampAllStudentsToRubric(off, newRubric),
        })),
        toastMessage: 'الگوی بارم‌بندی با مجموع ۲۰ اعمال شد و سقف نمرات دانشجویان بر اساس بارم تنظیم گردید.',
      };
    }

    case 'UPDATE_STUDENT_SCORE': {
      const { studentId, field, value } = action.payload;
      const offering = state.offerings.find(o => o.id === state.selectedOfferingId);
      if (!offering || isOfferingFinalized(offering)) return state;
      return {
        ...state,
        offerings: patchOffering(state, offering.id, off => ({
          ...off,
          students: off.students.map(st => {
            if (st.studentId !== studentId) return st;
            return applyScoreToStudent(st, off, field, value);
          }),
        })),
      };
    }

    case 'COMMIT_GRADES': {
      // پس از تأیید سرور (Server Action) — اعمال قطعی همان مقادیر به‌صورت انبوه
      return {
        ...state,
        offerings: patchOffering(state, action.payload.offeringId, off => ({
          ...off,
          students: off.students.map(st => {
            const entry = action.payload.entries.find(e => e.studentId === st.studentId);
            if (!entry) return st;
            return applyScoreToStudent(st, off, entry.field, entry.value);
          }),
        })),
      };
    }

    case 'APPLY_BONUS_MARK': {
      const offering = state.offerings.find(o => o.id === state.selectedOfferingId);
      if (!offering || isOfferingFinalized(offering)) return state;
      return {
        ...state,
        offerings: patchOffering(state, offering.id, off => ({
          ...off,
          students: off.students.map(st => applyBonusToStudent(st, off, action.payload)),
        })),
        toastMessage: `✨ نمره تشویقی (${action.payload} نمره) با موفقیت اعمال شد.`,
      };
    }

    case 'SUBMIT_TEMPORARY': {
      const offering = state.offerings.find(o => o.id === state.selectedOfferingId);
      if (!offering) return state;
      if (!isRubricValid(offering.rubric) && !offering.isCoTaught) return state; // کامپوننت پیام خطا می‌دهد
      return {
        ...state,
        offerings: patchOffering(state, offering.id, off => ({
          ...off,
          students: off.students.map(s => ({ ...s, status: 'TEMPORARY' })),
        })),
        toastMessage: '✅ نمرات به صورت «موقت» ثبت گردید. کارنامه دانشجویان باز شده و مهلت اعتراض ۳ روزه آغاز شد.',
      };
    }

    case 'SIGN_OFFERING': {
      const offering = state.offerings.find(o => o.id === state.selectedOfferingId);
      if (!offering || isOfferingFinalized(offering)) return state;
      const nowStr = '۱۴۰۵/۰۹/۱۵ - ' + new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      const sigHash = 'AF-DS-1405-' + Math.random().toString(36).substring(2, 10).toUpperCase();

      const updated = patchOffering(state, offering.id, off => {
        if (off.isCoTaught && off.coTaughtDetails) {
          const role = off.coTaughtDetails.currentProfRole;
          const isTheorySigning = role === 'THEORY';
          const theorySigned = isTheorySigning ? true : off.coTaughtDetails.theorySigned;
          const labSigned = !isTheorySigning ? true : off.coTaughtDetails.labSigned;
          const bothSigned = theorySigned && labSigned;
          return {
            ...off,
            coTaughtDetails: {
              ...off.coTaughtDetails,
              theorySigned,
              theorySignedAt: isTheorySigning ? nowStr : off.coTaughtDetails.theorySignedAt,
              theorySignatureHash: isTheorySigning ? sigHash : off.coTaughtDetails.theorySignatureHash,
              labSigned,
              labSignedAt: !isTheorySigning ? nowStr : off.coTaughtDetails.labSignedAt,
              labSignatureHash: !isTheorySigning ? sigHash : off.coTaughtDetails.labSignatureHash,
            },
            isFinalized: bothSigned,
            finalizedAt: bothSigned ? nowStr : undefined,
            finalSignatureHash: bothSigned ? computeGradesHash(off) : undefined,
            students: off.students.map(s => ({ ...s, status: bothSigned ? 'FINALIZED' : s.status })),
          };
        }
        return {
          ...off,
          isFinalized: true,
          finalizedAt: nowStr,
          finalSignatureHash: sigHash,
          students: off.students.map(s => ({ ...s, status: 'FINALIZED' })),
        };
      });
      const after = updated.find(o => o.id === offering.id);
      const bothSigned = after?.isFinalized ?? false;
      if (after?.isCoTaught && after.coTaughtDetails) {
        const role = after.coTaughtDetails.currentProfRole;
        if (bothSigned) {
          return {
            ...state, offerings: updated, activeTab: 'CERTIFICATE',
            toastMessage: '🎉 هر دو بخش با موفقیت امضا و نمرات کل دوره قطعی و قفل شدند.',
          };
        }
        return {
          ...state, offerings: updated,
          toastMessage: role === 'THEORY'
            ? '✓ بخش تئوری با موفقیت امضا شد. در انتظار امضای بخش عملی جهت قفل نهایی.'
            : '✓ بخش عملی با موفقیت امضا شد. در انتظار امضای بخش تئوری جهت قفل نهایی.',
        };
      }
      return {
        ...state, offerings: updated, activeTab: 'CERTIFICATE',
        toastMessage: '🔒 نمرات با موفقیت و امضای رمزنگاری‌شده قطعی (FINALIZED) شد و به اداره آموزش ارسال گردید.',
      };
    }

    case 'RESOLVE_APPEAL': {
      const { appealId, decision, reply, breakdown } = action.payload;
      const offering = state.offerings.find(o => o.id === state.selectedOfferingId);
      if (!offering) return state;

      let resolvedCalculated = 0;
      const offerings = patchOffering(state, offering.id, off => {
        const clampN = (v: number, max: number) => Math.max(0, Math.min(max, Number(v) || 0));
        const appeal = off.appeals.find(a => a.id === appealId);
        if (!appeal) return off;
        const st = off.students.find(s => s.studentId === appeal.studentId);
        const newStudents = off.students.map(s => {
          if (s.studentId !== appeal.studentId || decision !== 'ACCEPTED') return s;
          const updated: typeof s = {
            ...s,
            midtermScore: off.isCoTaught ? s.midtermScore : clampN(breakdown.midtermScore, off.rubric.midterm),
            homeworkScore: off.isCoTaught ? s.homeworkScore : clampN(breakdown.homeworkScore, off.rubric.homework),
            participationScore: off.isCoTaught ? s.participationScore : clampN(breakdown.participationScore, off.rubric.participation),
            practicalScore: off.isCoTaught ? s.practicalScore : clampN(breakdown.practicalScore, off.rubric.practical),
            finalExamScore: off.isCoTaught ? s.finalExamScore : clampN(breakdown.finalExamScore, off.rubric.finalExam),
            theoryProfScore: off.isCoTaught ? clampN(breakdown.theoryProfScore, 20) : s.theoryProfScore,
            labProfScore: off.isCoTaught ? clampN(breakdown.labProfScore, 20) : s.labProfScore,
            status: 'TEMPORARY',
            calculatedFinalScore: 0,
          };
          updated.calculatedFinalScore = calculateFinalScore(updated, off);
          resolvedCalculated = updated.calculatedFinalScore;
          return updated;
        });
        return {
          ...off,
          appeals: off.appeals.map(ap => ap.id === appealId
            ? {
                ...ap,
                status: decision,
                professorReply: reply,
                newGrade: decision === 'ACCEPTED' ? resolvedCalculated : ap.currentGrade,
              }
            : ap),
          students: newStudents,
        };
      });
      return {
        ...state,
        offerings,
        toastMessage: decision === 'ACCEPTED'
          ? '✓ اعتراض دانشجو پذیرفته شد و نمره جدید در سامانه ثبت گردید.'
          : '✕ اعتراض دانشجو پس از بررسی رد گردید.',
      };
    }

    case 'ARCHIVE_CERTIFICATE': {
      const offering = state.offerings.find(o => o.id === state.selectedOfferingId);
      if (!offering) return state;
      const dossierCode = 'AF-ARC-DOSSIER-' + offering.code + '-G' + offering.groupNumber + '-1405';
      return {
        ...state,
        offerings: patchOffering(state, offering.id, off => ({
          ...off,
          isArchived: true,
          archivedAt: '۱۴۰۵/۰۹/۱۵ - ' + new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
          archiveDossierId: dossierCode,
        })),
        toastMessage: `📁 صورت‌جلسه رسمی آزمون با شناسه ${dossierCode} با موفقیت در بایگانی اسناد هیئت علمی دانشگاه آفاق ثبت و ذخیره گردید.`,
      };
    }

    default:
      return state;
  }
}

export type GradesDispatch = Dispatch<GradesAction>;

/** نمایش پیام کوتاه (Toast) با پاک‌سازی خودکار */
export function flashToast(dispatch: GradesDispatch, message: string, ms = 4000) {
  dispatch({ type: 'SET_TOAST', payload: message });
  setTimeout(() => dispatch({ type: 'SET_TOAST', payload: null }), ms);
}
