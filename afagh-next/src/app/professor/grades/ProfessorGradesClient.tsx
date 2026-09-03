'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

export interface RubricWeights {
  midterm: number;       // میان‌ترم
  homework: number;      // تکالیف و تمرین‌ها
  participation: number; // حضور و فعالیت کلاسی
  practical: number;     // بخش عملی / کارگاهی
  finalExam: number;     // پایان‌ترم
}

export interface StudentGradeItem {
  studentId: number;
  studentCode: string;
  fullName: string;
  midtermScore?: number;
  homeworkScore?: number;
  participationScore?: number;
  practicalScore?: number;
  finalExamScore?: number;
  theoryProfScore?: number; // برای دروس مشترک: نمره استاد تئوری از ۲۰
  labProfScore?: number;    // برای دروس مشترک: نمره استاد عملی از ۲۰
  calculatedFinalScore?: number;
  status: 'DRAFT' | 'TEMPORARY' | 'FINALIZED' | 'APPEALED';
  note?: string;
}

export interface GradeAppealItem {
  id: number;
  studentId: number;
  studentCode: string;
  fullName: string;
  currentGrade: number;
  appealSection?: 'THEORY' | 'PRACTICAL' | 'ALL';
  studentMessage: string;
  status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
  professorReply?: string;
  newGrade?: number;
  createdAt: string;
}

export interface CoTaughtDetails {
  theoryProfName: string;
  theoryProfStaffCode: string;
  theoryWeightRatio: number; // e.g. 0.60 (60%)
  theoryWeightMarks: number; // e.g. 12 marks
  theorySigned: boolean;
  theorySignedAt?: string;
  theorySignatureHash?: string;

  labProfName: string;
  labProfStaffCode: string;
  labWeightRatio: number;    // e.g. 0.40 (40%)
  labWeightMarks: number;    // e.g. 8 marks
  labSigned: boolean;
  labSignedAt?: string;
  labSignatureHash?: string;

  currentProfRole: 'THEORY' | 'LAB';
}

export interface GradingCourseOffering {
  id: number;
  code: string;
  title: string;
  groupNumber: number;
  units: number;
  courseType: 'پایه' | 'اصلی' | 'تخصصی' | 'عمومی' | 'عملی';
  isCoTaught: boolean;
  coTaughtDetails?: CoTaughtDetails;
  isFinalized?: boolean;
  finalizedAt?: string;
  finalSignatureHash?: string;
  isArchived?: boolean;
  archivedAt?: string;
  archiveDossierId?: string;
  rubric: RubricWeights;
  students: StudentGradeItem[];
  appeals: GradeAppealItem[];
}

interface Props {
  professor: {
    id: number;
    name: string;
    staffCode: string;
  };
  termTitle: string;
  initialOfferings: GradingCourseOffering[];
  defaultOfferingId?: number;
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

export default function ProfessorGradesClient({
  professor,
  termTitle,
  initialOfferings,
  defaultOfferingId,
}: Props) {
  const [offerings, setOfferings] = useState<GradingCourseOffering[]>(initialOfferings);
  const [selectedOfferingId, setSelectedOfferingId] = useState<number>(
    defaultOfferingId && initialOfferings.some(o => o.id === defaultOfferingId)
      ? defaultOfferingId
      : initialOfferings[0]?.id || 101
  );

  const [activeTab, setActiveTab] = useState<'ROSTER' | 'RUBRIC' | 'APPEALS' | 'ANALYTICS' | 'CERTIFICATE'>('ROSTER');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showOtpModal, setShowOtpModal] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpSentCode, setOtpSentCode] = useState<string>('58219');
  const [selectedAppeal, setSelectedAppeal] = useState<GradeAppealItem | null>(null);
  const [appealReplyText, setAppealReplyText] = useState<string>('');
  const [appealNewGrade, setAppealNewGrade] = useState<number>(14);
  const [appealMidterm, setAppealMidterm] = useState<number>(0);
  const [appealHomework, setAppealHomework] = useState<number>(0);
  const [appealParticipation, setAppealParticipation] = useState<number>(0);
  const [appealPractical, setAppealPractical] = useState<number>(0);
  const [appealFinalExam, setAppealFinalExam] = useState<number>(0);
  const [appealTheoryProf, setAppealTheoryProf] = useState<number>(0);
  const [appealLabProf, setAppealLabProf] = useState<number>(0);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string>('هم‌اکنون');
  const [searchStudentQuery, setSearchStudentQuery] = useState<string>('');

  const currentOffering = offerings.find(o => o.id === selectedOfferingId) || offerings[0];
  const rubric = currentOffering?.rubric || { midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 };
  const totalRubric = (Number(rubric.midterm) || 0) + (Number(rubric.homework) || 0) + (Number(rubric.participation) || 0) + (Number(rubric.practical) || 0) + (Number(rubric.finalExam) || 0);
  const isRubricValid = totalRubric === 20;

  // Check if course is fully finalized
  const isOfferingFullyFinalized = useMemo(() => {
    if (!currentOffering) return false;
    if (currentOffering.isFinalized) return true;
    if (currentOffering.isCoTaught && currentOffering.coTaughtDetails) {
      return currentOffering.coTaughtDetails.theorySigned && currentOffering.coTaughtDetails.labSigned;
    }
    return currentOffering.students.length > 0 && currentOffering.students.every(s => s.status === 'FINALIZED');
  }, [currentOffering]);

  // Co-taught instructor switch
  const handleSwitchCoProfRole = (newRole: 'THEORY' | 'LAB') => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId || !off.coTaughtDetails) return off;
        return {
          ...off,
          coTaughtDetails: {
            ...off.coTaughtDetails,
            currentProfRole: newRole,
          },
        };
      })
    );
    const profTitle = newRole === 'THEORY'
      ? `بخش تئوری (${currentOffering.coTaughtDetails?.theoryProfName})`
      : `بخش عملی (${currentOffering.coTaughtDetails?.labProfName})`;
    setToastMessage(`دیدگاه تغییر یافت: اکنون در حال ورود نمرات به عنوان استاد ${profTitle} هستید.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Open Appeal Modal with initial student rubric values
  const openAppealModal = (appeal: GradeAppealItem) => {
    setSelectedAppeal(appeal);
    const st = currentOffering?.students.find(s => s.studentId === appeal.studentId);
    setAppealMidterm(st?.midtermScore ?? 0);
    setAppealHomework(st?.homeworkScore ?? 0);
    setAppealParticipation(st?.participationScore ?? 0);
    setAppealPractical(st?.practicalScore ?? 0);
    setAppealFinalExam(st?.finalExamScore ?? 0);
    setAppealTheoryProf(st?.theoryProfScore ?? 0);
    setAppealLabProf(st?.labProfScore ?? 0);
    setAppealReplyText(appeal.professorReply || '');
    setAppealNewGrade(st?.calculatedFinalScore ?? appeal.currentGrade);
  };

  // Live calculated total in the appeal modal based on updated breakdown inputs
  const calculatedAppealTotal = useMemo(() => {
    if (!currentOffering) return 0;
    if (currentOffering.isCoTaught && currentOffering.coTaughtDetails) {
      const t = appealTheoryProf * currentOffering.coTaughtDetails.theoryWeightRatio;
      const l = appealLabProf * currentOffering.coTaughtDetails.labWeightRatio;
      return Math.min(20, Math.round((t + l) * 100) / 100);
    } else {
      const sum = (appealMidterm || 0) + (appealHomework || 0) + (appealParticipation || 0) + (appealPractical || 0) + (appealFinalExam || 0);
      return Math.min(20, Math.round(sum * 100) / 100);
    }
  }, [currentOffering, appealMidterm, appealHomework, appealParticipation, appealPractical, appealFinalExam, appealTheoryProf, appealLabProf]);

  // Auto-save simulation
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastAutoSaveTime(timeStr);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Helper to re-clamp all students of an offering to its rubric
  const clampAllStudentsToRubric = (offering: GradingCourseOffering, newRubric: RubricWeights): StudentGradeItem[] => {
    return offering.students.map(st => {
      const m = st.midtermScore !== undefined ? Math.min(newRubric.midterm, st.midtermScore) : undefined;
      const h = st.homeworkScore !== undefined ? Math.min(newRubric.homework, st.homeworkScore) : undefined;
      const p = st.participationScore !== undefined ? Math.min(newRubric.participation, st.participationScore) : undefined;
      const pr = st.practicalScore !== undefined ? Math.min(newRubric.practical, st.practicalScore) : undefined;
      const f = st.finalExamScore !== undefined ? Math.min(newRubric.finalExam, st.finalExamScore) : undefined;

      let calc = 0;
      if (offering.isCoTaught && offering.coTaughtDetails) {
        const theory = st.theoryProfScore ?? 0;
        const lab = st.labProfScore ?? 0;
        calc = (theory * offering.coTaughtDetails.theoryWeightRatio) + (lab * offering.coTaughtDetails.labWeightRatio);
      } else {
        calc = (m ?? 0) + (h ?? 0) + (p ?? 0) + (pr ?? 0) + (f ?? 0);
      }

      return {
        ...st,
        midtermScore: m,
        homeworkScore: h,
        participationScore: p,
        practicalScore: pr,
        finalExamScore: f,
        calculatedFinalScore: Math.min(20, Math.round(calc * 100) / 100),
      };
    });
  };

  // Handle Rubric Changes
  const updateRubricField = (field: keyof RubricWeights, value: number) => {
    if (isOfferingFullyFinalized) return;
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        const newRubric = {
          ...off.rubric,
          [field]: Math.max(0, Math.min(20, value)),
        };
        const updatedStudents = clampAllStudentsToRubric(off, newRubric);
        return {
          ...off,
          rubric: newRubric,
          students: updatedStudents,
        };
      })
    );
  };

  const applyRubricPreset = (preset: 'STANDARD_THEORY' | 'BALANCED' | 'PRACTICAL_HEAVY' | 'FINAL_HEAVY') => {
    if (isOfferingFullyFinalized) return;
    let newRubric: RubricWeights;
    if (preset === 'STANDARD_THEORY') newRubric = { midterm: 6, homework: 4, participation: 0, practical: 0, finalExam: 10 };
    else if (preset === 'BALANCED') newRubric = { midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 };
    else if (preset === 'PRACTICAL_HEAVY') newRubric = { midterm: 3, homework: 3, participation: 2, practical: 7, finalExam: 5 };
    else newRubric = { midterm: 4, homework: 0, participation: 0, practical: 0, finalExam: 16 };

    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        const updatedStudents = clampAllStudentsToRubric(off, newRubric);
        return {
          ...off,
          rubric: newRubric,
          students: updatedStudents,
        };
      })
    );
    setToastMessage('الگوی بارم‌بندی با مجموع ۲۰ اعمال شد و سقف نمرات دانشجویان بر اساس بارم تنظیم گردید.');
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Handle Student Score Updates with STRICT ISOLATION FOR CO-TAUGHT
  const updateStudentScore = (studentId: number, field: keyof StudentGradeItem, val: number | undefined) => {
    if (isOfferingFullyFinalized) return;

    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;

        // Check co-taught permissions
        if (off.isCoTaught && off.coTaughtDetails) {
          const role = off.coTaughtDetails.currentProfRole;
          if (role === 'THEORY' && field === 'labProfScore') {
            alert('شما به عنوان استاد بخش تئوری وارد شده‌اید و اجازه ویرایش نمره عملی استاد همکار را ندارید.');
            return off;
          }
          if (role === 'LAB' && field === 'theoryProfScore') {
            alert('شما به عنوان استاد بخش عملی وارد شده‌اید و اجازه ویرایش نمره تئوری استاد همکار را ندارید.');
            return off;
          }
        }

        return {
          ...off,
          students: off.students.map(st => {
            if (st.studentId !== studentId) return st;

            let maxAllowed = 20;
            if (field === 'midtermScore') maxAllowed = off.rubric.midterm;
            else if (field === 'homeworkScore') maxAllowed = off.rubric.homework;
            else if (field === 'participationScore') maxAllowed = off.rubric.participation;
            else if (field === 'practicalScore') maxAllowed = off.rubric.practical;
            else if (field === 'finalExamScore') maxAllowed = off.rubric.finalExam;
            else if (field === 'theoryProfScore' || field === 'labProfScore') maxAllowed = 20;

            let clampedVal = val !== undefined ? Math.max(0, Math.min(maxAllowed, val)) : undefined;

            const updated = { ...st, [field]: clampedVal };

            if (off.isCoTaught && off.coTaughtDetails) {
              const theory = updated.theoryProfScore ?? 0;
              const lab = updated.labProfScore ?? 0;
              const calc = (theory * off.coTaughtDetails.theoryWeightRatio) + (lab * off.coTaughtDetails.labWeightRatio);
              updated.calculatedFinalScore = Math.min(20, Math.round(calc * 100) / 100);
            } else {
              const m = Math.min(off.rubric.midterm, updated.midtermScore ?? 0);
              const h = Math.min(off.rubric.homework, updated.homeworkScore ?? 0);
              const p = Math.min(off.rubric.participation, updated.participationScore ?? 0);
              const pr = Math.min(off.rubric.practical, updated.practicalScore ?? 0);
              const f = Math.min(off.rubric.finalExam, updated.finalExamScore ?? 0);
              const sum = m + h + p + pr + f;
              updated.calculatedFinalScore = Math.min(20, Math.round(sum * 100) / 100);
            }
            return updated;
          }),
        };
      })
    );
  };

  // Add Bonus Grace Mark to All Students
  const applyBonusMarkToAll = (bonus: number) => {
    if (isOfferingFullyFinalized) {
      alert('نمرات این درس قطعی و قفل شده است و امکان افزودن نمره ارفاق وجود ندارد.');
      return;
    }
    if (!confirm(`آیا از افزودن ${bonus} نمره ارفاق/تشویقی به تمامی دانشجویان مطمئن هستید؟`)) return;
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          students: off.students.map(st => {
            if (off.isCoTaught && off.coTaughtDetails) {
              const role = off.coTaughtDetails.currentProfRole;
              if (role === 'THEORY') {
                const cur = st.theoryProfScore ?? 0;
                const newT = Math.min(20, cur + bonus);
                const lab = st.labProfScore ?? 0;
                const calc = (newT * off.coTaughtDetails.theoryWeightRatio) + (lab * off.coTaughtDetails.labWeightRatio);
                return { ...st, theoryProfScore: newT, calculatedFinalScore: Math.min(20, Math.round(calc * 100) / 100) };
              } else {
                const cur = st.labProfScore ?? 0;
                const newL = Math.min(20, cur + bonus);
                const theory = st.theoryProfScore ?? 0;
                const calc = (theory * off.coTaughtDetails.theoryWeightRatio) + (newL * off.coTaughtDetails.labWeightRatio);
                return { ...st, labProfScore: newL, calculatedFinalScore: Math.min(20, Math.round(calc * 100) / 100) };
              }
            } else {
              const currentFinal = st.finalExamScore ?? 0;
              const newFinal = Math.min(off.rubric.finalExam, currentFinal + bonus);
              const m = Math.min(off.rubric.midterm, st.midtermScore ?? 0);
              const h = Math.min(off.rubric.homework, st.homeworkScore ?? 0);
              const p = Math.min(off.rubric.participation, st.participationScore ?? 0);
              const pr = Math.min(off.rubric.practical, st.practicalScore ?? 0);
              const sum = m + h + p + pr + newFinal;
              return {
                ...st,
                finalExamScore: newFinal,
                calculatedFinalScore: Math.min(20, Math.round(sum * 100) / 100),
              };
            }
          }),
        };
      })
    );
    setToastMessage(`✨ نمره تشویقی (${bonus} نمره) با موفقیت اعمال شد.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Grade Workflow Actions
  const handleSaveDraft = () => {
    setToastMessage('پیش‌نویس نمرات با موفقیت ذخیره شد (دانشجویان هنوز دسترسی رویت ندارند).');
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSubmitTemporary = () => {
    if (!isRubricValid && !currentOffering.isCoTaught) {
      alert(`خطا: مجموع بارم‌بندی شما برابر با ${totalRubric} است و باید دقیقاً ۲۰ باشد. لطفاً در برگه بارم‌بندی سهم‌ها را تنظیم نمایید.`);
      return;
    }
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          students: off.students.map(s => ({ ...s, status: 'TEMPORARY' })),
        };
      })
    );
    setToastMessage('✅ نمرات به صورت «موقت» ثبت گردید. کارنامه دانشجویان باز شده و مهلت اعتراض ۳ روزه آغاز شد.');
    setTimeout(() => setToastMessage(null), 6000);
  };

  const handleRequestFinalizeOtp = () => {
    if (isOfferingFullyFinalized) {
      alert('نمرات این درس قبلاً به صورت قطعی نهایی و قفل شده است.');
      return;
    }
    if (!isRubricValid && !currentOffering.isCoTaught) {
      alert('خطا: مجموع بارم‌بندی باید دقیقاً ۲۰ باشد.');
      return;
    }
    setShowOtpModal(true);
  };

  // Confirm Finalize / Section Sign
  const handleConfirmFinalize = () => {
    // 🔒 کد عبور پشتیبان دمو (۱۲۳۴۵/۱۲۳۴۵۶) فقط در حالت دمو پذیرفته می‌شود
    const demoOtpBypass =
      process.env.NEXT_PUBLIC_AFAGH_DEMO_MODE === '1' || process.env.NODE_ENV !== 'production';
    if (otpCode !== otpSentCode && !(demoOtpBypass && (otpCode === '12345' || otpCode === '123456'))) {
      alert('کد تایید اشتباه است. لطفاً کد پنج‌رقمی پیامک‌شده را وارد کنید.');
      return;
    }

    const nowStr = '۱۴۰۵/۰۹/۱۵ - ' + new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    const sigHash = 'AF-DS-1405-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;

        if (off.isCoTaught && off.coTaughtDetails) {
          const role = off.coTaughtDetails.currentProfRole;
          const isTheorySigning = role === 'THEORY';
          const newTheorySigned = isTheorySigning ? true : off.coTaughtDetails.theorySigned;
          const newLabSigned = !isTheorySigning ? true : off.coTaughtDetails.labSigned;
          const bothSigned = newTheorySigned && newLabSigned;

          const updatedDetails: CoTaughtDetails = {
            ...off.coTaughtDetails,
            theorySigned: newTheorySigned,
            theorySignedAt: isTheorySigning ? nowStr : off.coTaughtDetails.theorySignedAt,
            theorySignatureHash: isTheorySigning ? sigHash : off.coTaughtDetails.theorySignatureHash,
            labSigned: newLabSigned,
            labSignedAt: !isTheorySigning ? nowStr : off.coTaughtDetails.labSignedAt,
            labSignatureHash: !isTheorySigning ? sigHash : off.coTaughtDetails.labSignatureHash,
          };

          return {
            ...off,
            coTaughtDetails: updatedDetails,
            isFinalized: bothSigned,
            finalizedAt: bothSigned ? nowStr : undefined,
            finalSignatureHash: bothSigned ? sigHash : undefined,
            students: off.students.map(s => ({
              ...s,
              status: bothSigned ? 'FINALIZED' : s.status,
            })),
          };
        } else {
          return {
            ...off,
            isFinalized: true,
            finalizedAt: nowStr,
            finalSignatureHash: sigHash,
            students: off.students.map(s => ({ ...s, status: 'FINALIZED' })),
          };
        }
      })
    );

    setShowOtpModal(false);
    setOtpCode('');

    if (currentOffering.isCoTaught && currentOffering.coTaughtDetails) {
      const role = currentOffering.coTaughtDetails.currentProfRole;
      if (role === 'THEORY') {
        if (currentOffering.coTaughtDetails.labSigned) {
          setToastMessage('🎉 هر دو بخش تئوری و عملی با موفقیت امضا و نمرات کل دوره قطعی و قفل شدند.');
          setActiveTab('CERTIFICATE');
        } else {
          setToastMessage('✓ بخش تئوری با موفقیت امضا شد. در انتظار امضای بخش عملی توسط استاد آزمایشگاه جهت قفل نهایی.');
        }
      } else {
        if (currentOffering.coTaughtDetails.theorySigned) {
          setToastMessage('🎉 هر دو بخش عملی و تئوری با موفقیت امضا و نمرات کل دوره قطعی و قفل شدند.');
          setActiveTab('CERTIFICATE');
        } else {
          setToastMessage('✓ بخش عملی با موفقیت امضا شد. در انتظار امضای بخش تئوری توسط استاد تئوری جهت قفل نهایی.');
        }
      }
    } else {
      setToastMessage('🔒 نمرات با موفقیت و امضای رمزنگاری‌شده قطعی (FINALIZED) شد و به اداره آموزش ارسال گردید.');
      setActiveTab('CERTIFICATE');
    }
  };

  // Appeal Response with Rubric Breakdown updates
  const handleResolveAppeal = (decision: 'ACCEPTED' | 'REJECTED') => {
    if (!selectedAppeal) return;
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          appeals: off.appeals.map(ap => {
            if (ap.id !== selectedAppeal.id) return ap;
            return {
              ...ap,
              status: decision,
              professorReply: appealReplyText,
              newGrade: decision === 'ACCEPTED' ? calculatedAppealTotal : ap.currentGrade,
            };
          }),
          students: off.students.map(st => {
            if (st.studentId !== selectedAppeal.studentId) return st;
            if (decision === 'ACCEPTED') {
              return {
                ...st,
                status: 'TEMPORARY',
                midtermScore: off.isCoTaught ? st.midtermScore : appealMidterm,
                homeworkScore: off.isCoTaught ? st.homeworkScore : appealHomework,
                participationScore: off.isCoTaught ? st.participationScore : appealParticipation,
                practicalScore: off.isCoTaught ? st.practicalScore : appealPractical,
                finalExamScore: off.isCoTaught ? st.finalExamScore : appealFinalExam,
                theoryProfScore: off.isCoTaught ? appealTheoryProf : st.theoryProfScore,
                labProfScore: off.isCoTaught ? appealLabProf : st.labProfScore,
                calculatedFinalScore: calculatedAppealTotal,
              };
            }
            return st;
          }),
        };
      })
    );
    setSelectedAppeal(null);
    setToastMessage(decision === 'ACCEPTED' ? '✓ اعتراض دانشجو پذیرفته شد و نمره جدید در سامانه ثبت گردید.' : '✕ اعتراض دانشجو پس از بررسی رد گردید.');
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Archive Final Certified Grade Sheet to Professor's Dossier
  const handleArchiveCertificate = () => {
    const dossierCode = 'AF-ARC-DOSSIER-' + (currentOffering.code) + '-G' + currentOffering.groupNumber + '-1405';
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          isArchived: true,
          archivedAt: '۱۴۰۵/۰۹/۱۵ - ' + new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
          archiveDossierId: dossierCode,
        };
      })
    );
    setToastMessage(`📁 صورت‌جلسه رسمی آزمون با شناسه ${dossierCode} با موفقیت در بایگانی اسناد هیئت علمی دانشگاه آفاق ثبت و ذخیره گردید.`);
    setTimeout(() => setToastMessage(null), 6000);
  };

  const students = currentOffering?.students || [];

  const filteredStudents = useMemo(() => {
    if (!searchStudentQuery.trim()) return students;
    const q = searchStudentQuery.trim().toLowerCase();
    return students.filter(
      s => s.fullName.toLowerCase().includes(q) || s.studentCode.includes(q)
    );
  }, [students, searchStudentQuery]);

  const passedStudents = students.filter(s => (s.calculatedFinalScore ?? 0) >= 10).length;
  const failedStudents = students.filter(s => s.calculatedFinalScore !== undefined && s.calculatedFinalScore < 10).length;
  const averageGrade = students.length > 0
    ? (students.reduce((acc, s) => acc + (s.calculatedFinalScore ?? 0), 0) / students.length).toFixed(2)
    : '۰';

  const gradeDistribution = useMemo(() => {
    let excellent = 0; // 17 - 20
    let good = 0;      // 14 - 16.99
    let fair = 0;      // 10 - 13.99
    let fail = 0;      // < 10

    students.forEach(s => {
      const g = s.calculatedFinalScore;
      if (g === undefined) return;
      if (g >= 17) excellent++;
      else if (g >= 14) good++;
      else if (g >= 10) fair++;
      else fail++;
    });

    return { excellent, good, fair, fail };
  }, [students]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Banner */}
      <div className="card bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white p-5 rounded-3xl shadow-lg border border-indigo-800/40 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-3xl shadow-inner">
              📝
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-lg sm:text-xl tracking-tight">
                  میز هوشمند ثبت، بارم‌بندی و ارزشیابی نمرات اساتید
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500 text-white shadow-xs">
                  {termTitle}
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-1">
                استاد: {professor.name} · کد پرسنلی: {professor.staffCode}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/professor"
              className="px-3.5 py-2 rounded-xl bg-indigo-800 hover:bg-indigo-700 text-white font-bold text-xs border border-indigo-600/50 flex items-center gap-1.5 transition"
            >
              <span>داشبورد استاد ←</span>
            </Link>
          </div>
        </div>

        {/* Offering Switcher & Auto-save indicator */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 mt-4 border-t border-indigo-800/60">
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs text-indigo-200 font-bold block">
              انتخاب درس و گروه آموزشی جهت ثبت نمره:
            </label>
            <select
              value={selectedOfferingId}
              onChange={e => {
                setSelectedOfferingId(Number(e.target.value));
                setSearchStudentQuery('');
              }}
              className="w-full bg-indigo-900/80 border border-indigo-600/70 rounded-xl px-3 py-2 text-xs font-black text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {offerings.map(o => (
                <option key={o.id} value={o.id}>
                  {o.title} (گروه {faNum(o.groupNumber)} — کد {o.code}) {o.isCoTaught ? '👥 [درس مشترک تئوری/عملی]' : ''} {o.isFinalized ? '🔒 [قطعی و امضا شده]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex sm:flex-col justify-between sm:justify-center items-end sm:items-start border-t sm:border-t-0 sm:border-r sm:border-white/15 pt-2 sm:pt-0 sm:pr-3">
            <span className="text-indigo-200 font-bold block text-[11px]">وضعیت ذخیره‌سازی زنده:</span>
            <div className="flex items-center gap-1.5 text-emerald-300 font-mono text-xs font-bold mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>ذخیره خودکار: {lastAutoSaveTime}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-lg">📢</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-700 font-black">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CO-TAUGHT MANAGEMENT BANNER (تفکیک دقیق اختیارات دو استاد و قفل متقابل) */}
      {/* ========================================================================= */}
      {currentOffering.isCoTaught && currentOffering.coTaughtDetails && (
        <div className="p-4 bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 text-white rounded-3xl shadow-md border-2 border-purple-500/50 space-y-3 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-purple-800/60">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-purple-400 text-purple-950 font-black text-xs">
                👥 درس مشترک با دو استاد مستقل (تئوری + عملی)
              </span>
              <span className="text-xs font-bold text-purple-200">فرمول سهم‌بندی مصوب گروه</span>
            </div>

            {/* Role / Perspective Switcher */}
            <div className="flex items-center gap-2 bg-purple-900/60 p-1.5 rounded-2xl border border-purple-400/30 text-xs">
              <span className="text-[11px] text-purple-200 font-bold pr-1">دیدگاه ورود نمره:</span>
              <button
                type="button"
                onClick={() => handleSwitchCoProfRole('THEORY')}
                className={`px-3 py-1 rounded-xl font-black text-xs transition ${
                  currentOffering.coTaughtDetails.currentProfRole === 'THEORY'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-transparent text-purple-200 hover:text-white'
                }`}
              >
                📖 استاد تئوری ({currentOffering.coTaughtDetails.theoryProfName})
              </button>
              <button
                type="button"
                onClick={() => handleSwitchCoProfRole('LAB')}
                className={`px-3 py-1 rounded-xl font-black text-xs transition ${
                  currentOffering.coTaughtDetails.currentProfRole === 'LAB'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-transparent text-purple-200 hover:text-white'
                }`}
              >
                🔬 استاد عملی ({currentOffering.coTaughtDetails.labProfName})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Theory Professor Card */}
            <div className={`p-3 rounded-2xl border transition ${
              currentOffering.coTaughtDetails.currentProfRole === 'THEORY'
                ? 'bg-indigo-900/50 border-indigo-400'
                : 'bg-slate-900/40 border-slate-700 opacity-80'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-indigo-300 font-bold block text-[11px]">۱. بخش تئوری (سهم {faNum(currentOffering.coTaughtDetails.theoryWeightRatio * 100)}٪ — {faNum(currentOffering.coTaughtDetails.theoryWeightMarks)} نمره):</span>
                  <strong className="text-white text-sm font-black">{currentOffering.coTaughtDetails.theoryProfName}</strong>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  currentOffering.coTaughtDetails.theorySigned
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-amber-400/80 text-slate-950'
                }`}>
                  {currentOffering.coTaughtDetails.theorySigned ? '✓ امضا و تایید شد' : 'در انتظار امضا'}
                </span>
              </div>
              <p className="text-[11px] text-indigo-200 mt-1">
                {currentOffering.coTaughtDetails.currentProfRole === 'THEORY'
                  ? 'شما مجاز به ورود و ویرایش نمرات تئوری از ۲۰ هستید.'
                  : '🔒 ویرایش نمرات تئوری فقط توسط استاد تئوری امکان‌پذیر است.'}
              </p>
            </div>

            {/* Practical / Lab Professor Card */}
            <div className={`p-3 rounded-2xl border transition ${
              currentOffering.coTaughtDetails.currentProfRole === 'LAB'
                ? 'bg-purple-900/50 border-purple-400'
                : 'bg-slate-900/40 border-slate-700 opacity-80'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-purple-300 font-bold block text-[11px]">۲. بخش عملی/کارگاهی (سهم {faNum(currentOffering.coTaughtDetails.labWeightRatio * 100)}٪ — {faNum(currentOffering.coTaughtDetails.labWeightMarks)} نمره):</span>
                  <strong className="text-white text-sm font-black">{currentOffering.coTaughtDetails.labProfName}</strong>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  currentOffering.coTaughtDetails.labSigned
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-amber-400/80 text-slate-950'
                }`}>
                  {currentOffering.coTaughtDetails.labSigned ? '✓ امضا و تایید شد' : 'در انتظار امضا'}
                </span>
              </div>
              <p className="text-[11px] text-purple-200 mt-1">
                {currentOffering.coTaughtDetails.currentProfRole === 'LAB'
                  ? 'شما مجاز به ورود و ویرایش نمرات عملی از ۲۰ هستید.'
                  : '🔒 ویرایش نمرات عملی فقط توسط استاد آزمایشگاه امکان‌پذیر است.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-2 gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('ROSTER')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'ROSTER' ? 'bg-indigo-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📊 لیست نمرات کلاسی</span>
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-[10px]">{faNum(students.length)}</span>
          </button>

          {!currentOffering.isCoTaught && (
            <button
              onClick={() => setActiveTab('RUBRIC')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
                activeTab === 'RUBRIC' ? 'bg-indigo-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>⚙️ سهم‌بندی بارم</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isRubricValid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                جمع: {faNum(totalRubric)} از ۲۰
              </span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('APPEALS')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'APPEALS' ? 'bg-indigo-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📩 کارتابل اعتراضات</span>
            {currentOffering.appeals.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black text-[10px]">
                {faNum(currentOffering.appeals.filter(a => a.status === 'OPEN').length)} باز
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'ANALYTICS' ? 'bg-indigo-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📈 تحلیل آماری نمرات</span>
          </button>

          {isOfferingFullyFinalized && (
            <button
              onClick={() => setActiveTab('CERTIFICATE')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
                activeTab === 'CERTIFICATE' ? 'bg-emerald-700 text-white shadow-sm' : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border border-emerald-300'
              }`}
            >
              <span>📜 صورت‌جلسه نهایی و بایگانی</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-900 text-white text-[10px]">امضا شده ✓</span>
            </button>
          )}
        </div>

        {/* Quick Stats Summary */}
        <div className="hidden lg:flex items-center gap-3 text-xs font-bold text-slate-600">
          <span>میانگین: <b className="text-indigo-950">{faNum(averageGrade)}</b></span>
          <span>قبولی: <b className="text-emerald-700">{faNum(passedStudents)} نفر</b></span>
          <span>مردودی: <b className="text-rose-700">{faNum(failedStudents)} نفر</b></span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: RUBRIC SPECIFICATION (FOR SINGLE INSTRUCTOR COURSES) */}
      {/* ========================================================================= */}
      {activeTab === 'RUBRIC' && !currentOffering.isCoTaught && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div>
              <h3 className="font-black text-slate-900 text-base">
                تنظیم و بارم‌بندی سهم آزمون‌ها و تکالیف درس {currentOffering.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مجموع بارم مولفه‌ها باید دقیقاً برابر با ۲۰ نمره باشد.
              </p>
            </div>

            <div className={`px-4 py-1.5 rounded-2xl text-xs font-black flex items-center gap-2 ${
              isRubricValid ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-rose-100 text-rose-900 border border-rose-300'
            }`}>
              <span>مجموع بارم:</span>
              <span className="font-mono text-sm">{faNum(totalRubric)} از ۲۰</span>
              {isRubricValid ? <span>✓ تایید است</span> : <span>⚠️ اصلاح شود</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-xs text-slate-500 font-bold self-center ml-2">الگوهای آماده:</span>
            <button
              onClick={() => applyRubricPreset('STANDARD_THEORY')}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
            >
              استاندارد تئوری (۶ میان‌ترم + ۴ تمرین + ۱۰ پایان‌ترم)
            </button>
            <button
              onClick={() => applyRubricPreset('BALANCED')}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
            >
              متعادل (۵ میان‌ترم + ۳ تمرین + ۲ حضور + ۱۰ پایان‌ترم)
            </button>
            <button
              onClick={() => applyRubricPreset('PRACTICAL_HEAVY')}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
            >
              کارگاهی (۳ میان‌ترم + ۳ تمرین + ۲ حضور + ۷ عملی + ۵ پایان‌ترم)
            </button>
            <button
              onClick={() => applyRubricPreset('FINAL_HEAVY')}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
            >
              آزمون‌محور (۴ میان‌ترم + ۱۶ پایان‌ترم)
            </button>
          </div>

          {/* Rubric Input Fields */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="text-xs font-black text-slate-800 block">نمره میان‌ترم (از ۲۰):</label>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                disabled={isOfferingFullyFinalized}
                value={rubric.midterm}
                onChange={e => updateRubricField('midterm', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">آزمون کتبی میان‌ترم</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="text-xs font-black text-slate-800 block">تکالیف و تمرین‌ها:</label>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                disabled={isOfferingFullyFinalized}
                value={rubric.homework}
                onChange={e => updateRubricField('homework', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">پروژه و تکالیف هفتگی</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="text-xs font-black text-slate-800 block">حضور و فعالیت کلاسی:</label>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                disabled={isOfferingFullyFinalized}
                value={rubric.participation}
                onChange={e => updateRubricField('participation', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">نظم و مشارکت در بحث</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="text-xs font-black text-slate-800 block">پروژه عملی / آزمایشگاه:</label>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                disabled={isOfferingFullyFinalized}
                value={rubric.practical}
                onChange={e => updateRubricField('practical', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">آزمایشگاه / کارگاه</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="text-xs font-black text-slate-800 block">آزمون پایان‌ترم:</label>
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                disabled={isOfferingFullyFinalized}
                value={rubric.finalExam}
                onChange={e => updateRubricField('finalExam', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-center font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block text-center">برگه امتحان نهایی</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ROSTER GRADE ENTRY (RESPONSIVE: DESKTOP SPREADSHEET + MOBILE ADAPTIVE CARDS) */}
      {/* ========================================================================= */}
      {activeTab === 'ROSTER' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4 print:hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-base">
                  ورود نمرات درس {currentOffering.title} (گروه {faNum(currentOffering.groupNumber)})
                </h3>
                {isOfferingFullyFinalized && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs">
                    🔒 فریز و قفل قطعی شده
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentOffering.isCoTaught
                  ? `درس مشترک: نمره هر بخش از ۲۰ وارد شده و نمره کل طبق سهمیه مصوب (${faNum((currentOffering.coTaughtDetails?.theoryWeightRatio || 0.6) * 100)}٪ تئوری + ${faNum((currentOffering.coTaughtDetails?.labWeightRatio || 0.4) * 100)}٪ عملی) محاسبه می‌گردد.`
                  : `بر اساس بارم: میان‌ترم (${faNum(rubric.midterm)})، تکالیف (${faNum(rubric.homework)})، حضور (${faNum(rubric.participation)})، عملی (${faNum(rubric.practical)})، پایان‌ترم (${faNum(rubric.finalExam)})`}
              </p>
            </div>

            {/* Workflow Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => applyBonusMarkToAll(0.5)}
                disabled={isOfferingFullyFinalized}
                className="w-full sm:w-auto px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-40 text-amber-900 border border-amber-200 font-bold text-xs transition flex items-center justify-center gap-1"
              >
                <span>✨ ارفاق گروهی (+۰.۵ نمره)</span>
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={isOfferingFullyFinalized}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold text-xs transition flex items-center justify-center gap-1"
              >
                <span>💾 ذخیره پیش‌نویس</span>
              </button>
              <button
                onClick={handleSubmitTemporary}
                disabled={isOfferingFullyFinalized}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-black text-xs shadow-xs transition flex items-center justify-center gap-1"
              >
                <span>📢 ثبت موقت و رویت دانشجو</span>
              </button>
              <button
                onClick={handleRequestFinalizeOtp}
                disabled={isOfferingFullyFinalized}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 disabled:opacity-50 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-1.5"
              >
                <span>
                  {currentOffering.isCoTaught && currentOffering.coTaughtDetails
                    ? currentOffering.coTaughtDetails.currentProfRole === 'THEORY'
                      ? '🔒 قفل و امضای بخش تئوری با OTP'
                      : '🔒 قفل و امضای بخش عملی با OTP'
                    : '🔒 قفل قطعی نمرات با OTP'}
                </span>
              </button>
            </div>
          </div>

          {/* Search filter for roster */}
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              placeholder="جستجوی دانشجو با نام یا شماره دانشجویی..."
              value={searchStudentQuery}
              onChange={e => setSearchStudentQuery(e.target.value)}
              className="w-full sm:w-72 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-500 font-bold hidden sm:inline">
              نمایش {faNum(filteredStudents.length)} از {faNum(students.length)} دانشجو
            </span>
          </div>

          {/* VIEW A: DESKTOP TABLE VIEW (HIDDEN ON MOBILE) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-center">
                  <th className="p-2.5 border border-slate-800 w-12 font-bold">ردیف</th>
                  <th className="p-2.5 border border-slate-800 font-bold">شماره دانشجویی</th>
                  <th className="p-2.5 border border-slate-800 font-bold text-right">نام دانشجو</th>

                  {currentOffering.isCoTaught ? (
                    <>
                      <th className="p-2.5 border border-slate-800 font-bold bg-indigo-950">
                        نمره تئوری (از ۲۰)
                        <div className="text-[10px] text-indigo-300 font-normal">
                          سهم {faNum((currentOffering.coTaughtDetails?.theoryWeightRatio || 0.6) * 100)}٪
                        </div>
                      </th>
                      <th className="p-2.5 border border-slate-800 font-bold bg-purple-950">
                        نمره عملی (از ۲۰)
                        <div className="text-[10px] text-purple-300 font-normal">
                          سهم {faNum((currentOffering.coTaughtDetails?.labWeightRatio || 0.4) * 100)}٪
                        </div>
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="p-2 border border-slate-800 font-bold">میان‌ترم ({faNum(rubric.midterm)})</th>
                      <th className="p-2 border border-slate-800 font-bold">تکالیف ({faNum(rubric.homework)})</th>
                      <th className="p-2 border border-slate-800 font-bold">حضور ({faNum(rubric.participation)})</th>
                      {rubric.practical > 0 && (
                        <th className="p-2 border border-slate-800 font-bold">عملی ({faNum(rubric.practical)})</th>
                      )}
                      <th className="p-2 border border-slate-800 font-bold">پایان‌ترم ({faNum(rubric.finalExam)})</th>
                    </>
                  )}

                  <th className="p-2.5 border border-slate-800 font-black bg-slate-950 text-amber-300">نمره کل (از ۲۰)</th>
                  <th className="p-2.5 border border-slate-800 font-bold">نتیجه</th>
                  <th className="p-2.5 border border-slate-800 font-bold">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st, idx) => {
                  const finalScore = st.calculatedFinalScore;
                  const isPass = finalScore !== undefined && finalScore >= 10;
                  const isFail = finalScore !== undefined && finalScore < 10;

                  const isTheoryDisabled = isOfferingFullyFinalized || (currentOffering.isCoTaught && currentOffering.coTaughtDetails?.currentProfRole !== 'THEORY');
                  const isLabDisabled = isOfferingFullyFinalized || (currentOffering.isCoTaught && currentOffering.coTaughtDetails?.currentProfRole !== 'LAB');

                  return (
                    <tr key={st.studentId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2.5 border border-slate-200 text-center font-bold text-slate-500">
                        {faNum(idx + 1)}
                      </td>
                      <td className="p-2.5 border border-slate-200 font-mono text-center font-bold text-indigo-950" dir="ltr">
                        {st.studentCode}
                      </td>
                      <td className="p-2.5 border border-slate-200 font-black text-slate-900">
                        <div className="flex flex-col">
                          <span>{st.fullName}</span>
                          {(() => {
                            const appeal = currentOffering.appeals.find(a => a.studentId === st.studentId);
                            if (!appeal) return null;
                            if (appeal.status === 'OPEN') {
                              return (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 p-1.5 bg-amber-50 border border-amber-300 rounded-lg text-[10px] text-amber-950 font-medium">
                                  <span className="font-extrabold text-amber-900">📩 اعتراض:</span>
                                  <span className="truncate max-w-[170px] text-slate-700" title={appeal.studentMessage}>
                                    «{appeal.studentMessage}»
                                  </span>
                                  <button
                                    onClick={() => openAppealModal(appeal)}
                                    className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] shadow-xs transition"
                                  >
                                    ✍️ پاسخ و بازبینی
                                  </button>
                                </div>
                              );
                            } else if (appeal.status === 'ACCEPTED') {
                              return (
                                <div className="mt-1 flex items-center justify-between gap-1 p-1 bg-emerald-50 border border-emerald-300 rounded text-[10px] text-emerald-900 font-medium">
                                  <span className="font-bold text-emerald-800">✓ پذیرفته شد (نمره: {faNum(appeal.newGrade)})</span>
                                  <button
                                    onClick={() => openAppealModal(appeal)}
                                    className="text-indigo-700 hover:underline font-bold text-[10px]"
                                  >
                                    مشاهده
                                  </button>
                                </div>
                              );
                            } else {
                              return (
                                <div className="mt-1 flex items-center justify-between gap-1 p-1 bg-slate-100 border border-slate-300 rounded text-[10px] text-slate-700 font-medium">
                                  <span className="font-bold text-rose-700">✕ اعتراض رد شد</span>
                                  <button
                                    onClick={() => openAppealModal(appeal)}
                                    className="text-slate-600 hover:underline font-bold text-[10px]"
                                  >
                                    مشاهده
                                  </button>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </td>

                      {currentOffering.isCoTaught ? (
                        <>
                          <td className={`p-2 border border-slate-200 text-center ${isTheoryDisabled ? 'bg-slate-100/70' : 'bg-indigo-50/40'}`}>
                            <div className="flex items-center justify-center gap-1">
                              {isTheoryDisabled && <span className="text-slate-400 text-xs" title="فقط استاد بخش تئوری مجاز به تغییر است">🔒</span>}
                              <input
                                type="number"
                                min={0}
                                max={20}
                                step={0.25}
                                inputMode="decimal"
                                disabled={isTheoryDisabled}
                                value={st.theoryProfScore ?? ''}
                                onChange={e => {
                                  const val = e.target.value === '' ? undefined : Math.max(0, Math.min(20, Number(e.target.value)));
                                  updateStudentScore(st.studentId, 'theoryProfScore', val);
                                }}
                                className={`w-16 border rounded-lg p-1 text-center font-black ${
                                  isTheoryDisabled
                                    ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed'
                                    : 'border-indigo-300 text-indigo-950 bg-white shadow-xs focus:ring-2 focus:ring-indigo-500'
                                }`}
                              />
                            </div>
                          </td>
                          <td className={`p-2 border border-slate-200 text-center ${isLabDisabled ? 'bg-slate-100/70' : 'bg-purple-50/40'}`}>
                            <div className="flex items-center justify-center gap-1">
                              {isLabDisabled && <span className="text-slate-400 text-xs" title="فقط استاد بخش عملی مجاز به تغییر است">🔒</span>}
                              <input
                                type="number"
                                min={0}
                                max={20}
                                step={0.25}
                                inputMode="decimal"
                                disabled={isLabDisabled}
                                value={st.labProfScore ?? ''}
                                onChange={e => {
                                  const val = e.target.value === '' ? undefined : Math.max(0, Math.min(20, Number(e.target.value)));
                                  updateStudentScore(st.studentId, 'labProfScore', val);
                                }}
                                className={`w-16 border rounded-lg p-1 text-center font-black ${
                                  isLabDisabled
                                    ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed'
                                    : 'border-purple-300 text-purple-950 bg-white shadow-xs focus:ring-2 focus:ring-purple-500'
                                }`}
                              />
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.midterm}
                              step={0.25}
                              inputMode="decimal"
                              disabled={isOfferingFullyFinalized}
                              value={st.midtermScore !== undefined ? Math.min(rubric.midterm, st.midtermScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') updateStudentScore(st.studentId, 'midtermScore', undefined);
                                else updateStudentScore(st.studentId, 'midtermScore', Math.max(0, Math.min(rubric.midterm, Number(e.target.value))));
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>

                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.homework}
                              step={0.25}
                              inputMode="decimal"
                              disabled={isOfferingFullyFinalized}
                              value={st.homeworkScore !== undefined ? Math.min(rubric.homework, st.homeworkScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') updateStudentScore(st.studentId, 'homeworkScore', undefined);
                                else updateStudentScore(st.studentId, 'homeworkScore', Math.max(0, Math.min(rubric.homework, Number(e.target.value))));
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>

                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.participation}
                              step={0.25}
                              inputMode="decimal"
                              disabled={isOfferingFullyFinalized}
                              value={st.participationScore !== undefined ? Math.min(rubric.participation, st.participationScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') updateStudentScore(st.studentId, 'participationScore', undefined);
                                else updateStudentScore(st.studentId, 'participationScore', Math.max(0, Math.min(rubric.participation, Number(e.target.value))));
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>

                          {rubric.practical > 0 && (
                            <td className="p-1.5 border border-slate-200 text-center">
                              <input
                                type="number"
                                min={0}
                                max={rubric.practical}
                                step={0.25}
                                inputMode="decimal"
                                disabled={isOfferingFullyFinalized}
                                value={st.practicalScore !== undefined ? Math.min(rubric.practical, st.practicalScore) : ''}
                                onChange={e => {
                                  if (e.target.value === '') updateStudentScore(st.studentId, 'practicalScore', undefined);
                                  else updateStudentScore(st.studentId, 'practicalScore', Math.max(0, Math.min(rubric.practical, Number(e.target.value))));
                                }}
                                className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                              />
                            </td>
                          )}

                          <td className="p-1.5 border border-slate-200 text-center">
                            <input
                              type="number"
                              min={0}
                              max={rubric.finalExam}
                              step={0.25}
                              inputMode="decimal"
                              disabled={isOfferingFullyFinalized}
                              value={st.finalExamScore !== undefined ? Math.min(rubric.finalExam, st.finalExamScore) : ''}
                              onChange={e => {
                                if (e.target.value === '') updateStudentScore(st.studentId, 'finalExamScore', undefined);
                                else updateStudentScore(st.studentId, 'finalExamScore', Math.max(0, Math.min(rubric.finalExam, Number(e.target.value))));
                              }}
                              className="w-14 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                        </>
                      )}

                      <td className="p-2 border border-slate-200 text-center font-black text-sm bg-slate-50">
                        <span className={isPass ? 'text-emerald-700' : isFail ? 'text-rose-700' : 'text-slate-500'}>
                          {finalScore !== undefined ? faNum(finalScore) : '—'}
                        </span>
                      </td>

                      <td className="p-2 border border-slate-200 text-center">
                        {finalScore !== undefined ? (
                          isPass ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              قبول
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                              مردود
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold">ناتمام</span>
                        )}
                      </td>

                      <td className="p-2 border border-slate-200 text-center">
                        {isOfferingFullyFinalized || st.status === 'FINALIZED' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-700 text-white font-bold text-[10px]">
                            🔒 قطعی
                          </span>
                        ) : st.status === 'TEMPORARY' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                            📢 موقت
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-[10px]">
                            پیش‌نویس
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: OFFICIAL CERTIFIED GRADE SHEET & AUDIT DOSSIER ARCHIVE */}
      {/* ========================================================================= */}
      {(activeTab === 'CERTIFICATE' || isOfferingFullyFinalized) && activeTab === 'CERTIFICATE' && (
        <div className="print-area bg-white rounded-3xl p-6 shadow-xl border-2 border-slate-800 space-y-6">
          {/* Letterhead */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center font-black text-2xl shadow-md">
                آ
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-950">
                  دانشگاه غیرانتفاعی آفاق ارومیه — معاونت آموزشی و تحصیلات تکمیلی
                </h2>
                <p className="text-xs font-bold text-slate-600">
                  صورت‌جلسه رسمی و لیست نمرات نهایی پایان‌ترم · {termTitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-black text-xs shadow flex items-center gap-1.5"
              >
                <span>🖨️ چاپ و ذخیره صورت‌جلسه (PDF)</span>
              </button>

              {!currentOffering.isArchived ? (
                <button
                  onClick={handleArchiveCertificate}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow flex items-center gap-1.5"
                >
                  <span>📁 ثبت امضای دیجیتال و بایگانی اسناد</span>
                </button>
              ) : (
                <span className="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-950 font-black text-xs border border-emerald-300 flex items-center gap-1.5">
                  <span>✓ در پرونده الکترونیک بایگانی شد</span>
                </span>
              )}
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-300 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">عنوان و کد درس:</span>
              <strong className="text-slate-900 text-sm font-black">{currentOffering.title} ({currentOffering.code})</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">گروه و تعداد واحد:</span>
              <strong className="text-slate-900 text-sm font-black">گروه {faNum(currentOffering.groupNumber)} · {faNum(currentOffering.units)} واحد</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">استاد / اساتید درس:</span>
              <strong className="text-slate-900 text-xs font-black">
                {currentOffering.isCoTaught && currentOffering.coTaughtDetails
                  ? `${currentOffering.coTaughtDetails.theoryProfName} و ${currentOffering.coTaughtDetails.labProfName}`
                  : professor.name}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">وضعیت صورتجلسه:</span>
              <strong className="text-emerald-800 text-xs font-black">قفل قطعی و نهایی‌شده ✓</strong>
            </div>
          </div>

          {/* Grades Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-400 text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-center">
                  <th className="p-2 border border-slate-700 w-12 font-bold">ردیف</th>
                  <th className="p-2 border border-slate-700 font-bold">شماره دانشجویی</th>
                  <th className="p-2 border border-slate-700 text-right font-bold">نام و نام خانوادگی دانشجو</th>
                  {currentOffering.isCoTaught ? (
                    <>
                      <th className="p-2 border border-slate-700 font-bold">نمره تئوری ({faNum((currentOffering.coTaughtDetails?.theoryWeightRatio || 0.6) * 100)}٪)</th>
                      <th className="p-2 border border-slate-700 font-bold">نمره عملی ({faNum((currentOffering.coTaughtDetails?.labWeightRatio || 0.4) * 100)}٪)</th>
                    </>
                  ) : (
                    <th className="p-2 border border-slate-700 font-bold">نمره مستمر و کلاسی</th>
                  )}
                  <th className="p-2 border border-slate-700 font-black text-amber-300">نمره نهایی (از ۲۰)</th>
                  <th className="p-2 border border-slate-700 font-bold">نتیجه ارزشیابی</th>
                </tr>
              </thead>
              <tbody>
                {students.map((st, idx) => {
                  const finalScore = st.calculatedFinalScore ?? 0;
                  const isPass = finalScore >= 10;

                  return (
                    <tr key={st.studentId} className="border-b border-slate-300 text-center">
                      <td className="p-2 border border-slate-300 font-bold">{faNum(idx + 1)}</td>
                      <td className="p-2 border border-slate-300 font-mono font-bold" dir="ltr">{st.studentCode}</td>
                      <td className="p-2 border border-slate-300 text-right font-black text-slate-900">{st.fullName}</td>
                      {currentOffering.isCoTaught ? (
                        <>
                          <td className="p-2 border border-slate-300 font-mono font-bold">{faNum(st.theoryProfScore ?? '—')}</td>
                          <td className="p-2 border border-slate-300 font-mono font-bold">{faNum(st.labProfScore ?? '—')}</td>
                        </>
                      ) : (
                        <td className="p-2 border border-slate-300 font-mono">{faNum(((st.midtermScore || 0) + (st.homeworkScore || 0) + (st.participationScore || 0)).toFixed(2))}</td>
                      )}
                      <td className="p-2 border border-slate-300 font-black text-sm bg-slate-50 font-mono text-indigo-950">
                        {faNum(finalScore)}
                      </td>
                      <td className="p-2 border border-slate-300 font-bold">
                        {isPass ? <span className="text-emerald-800">قبول</span> : <span className="text-rose-800">مردود</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Statistical Summary and Dual Digital Signatures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-300 text-xs">
            {/* Stats */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-300 space-y-1.5">
              <span className="font-black text-slate-900 block">📊 خلاصه آماری نمرات کلاس:</span>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 font-medium">
                <div>تعداد کل دانشجویان: <strong>{faNum(students.length)} نفر</strong></div>
                <div>تعداد قبول‌شدگان: <strong className="text-emerald-800">{faNum(passedStudents)} نفر</strong></div>
                <div>میانگین نمرات کلاس: <strong>{faNum(averageGrade)} از ۲۰</strong></div>
                <div>تعداد مردودین: <strong className="text-rose-800">{faNum(failedStudents)} نفر</strong></div>
              </div>
            </div>

            {/* Electronic Signatures Block */}
            <div className="p-3.5 bg-indigo-50/70 rounded-2xl border-2 border-dashed border-indigo-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-indigo-950">🔐 گواهی امضای دیجیتال هیئت علمی:</span>
                <span className="text-[10px] text-emerald-800 font-mono font-bold">SHA-256 VERIFIED</span>
              </div>
              <div className="text-[10px] text-slate-600 font-mono space-y-0.5" dir="ltr">
                {currentOffering.isCoTaught && currentOffering.coTaughtDetails ? (
                  <>
                    <div>THEORY_SIG: {currentOffering.coTaughtDetails.theorySignatureHash || 'AF-DS-THEORY-9914A'} ({currentOffering.coTaughtDetails.theoryProfName})</div>
                    <div>LAB_SIG: {currentOffering.coTaughtDetails.labSignatureHash || 'AF-DS-LAB-8812B'} ({currentOffering.coTaughtDetails.labProfName})</div>
                  </>
                ) : (
                  <div>PROF_SIG: {currentOffering.finalSignatureHash || 'AF-DS-PROF-1405-7729A'} ({professor.name})</div>
                )}
                <div>AUDIT_TIMESTAMP: {currentOffering.finalizedAt || '۱۴۰۵/۰۹/۱۵'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: GRADE APPEALS MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'APPEALS' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4 print:hidden">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-slate-900 text-base">
                کارتابل رسیدگی به اعتراضات دانشجویان (درس {currentOffering.title})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                استاد محترم طبق آیین‌نامه موظف است ظرف مدت ۴۸ ساعت کاری به اعتراضات ثبت‌شده پاسخ دهد.
              </p>
            </div>
          </div>

          {currentOffering.appeals.length === 0 ? (
            <div className="text-center p-8 text-slate-500 text-xs font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-300">
              هیچ اعتراضی برای این کلاس ثبت نشده است.
            </div>
          ) : (
            <div className="space-y-3">
              {currentOffering.appeals.map(appeal => (
                <div key={appeal.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 text-xs">{appeal.fullName}</span>
                      <span className="font-mono text-xs text-slate-500">({faNum(appeal.studentCode)})</span>
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-bold text-[10px]">
                        نمره موقت: {faNum(appeal.currentGrade)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">{appeal.createdAt}</span>
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        appeal.status === 'ACCEPTED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : appeal.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}>
                        {appeal.status === 'ACCEPTED' ? 'پذیرفته شده' : appeal.status === 'REJECTED' ? 'رد شده' : 'در انتظار بررسی'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-800">
                    <span className="font-bold text-slate-500 block mb-1">متن اعتراض دانشجو:</span>
                    <p className="leading-5">{appeal.studentMessage}</p>
                  </div>

                  {appeal.status !== 'OPEN' && (
                    <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 text-xs text-slate-800">
                      <div className="flex items-center justify-between font-bold text-slate-600 mb-1">
                        <span>پاسخ ثبت‌شده استاد:</span>
                        {appeal.status === 'ACCEPTED' && (
                          <span className="text-emerald-700">نمره جدید ابلاغی: {faNum(appeal.newGrade)} از ۲۰</span>
                        )}
                      </div>
                      <p className="leading-5">{appeal.professorReply || 'بدون توضیح'}</p>
                    </div>
                  )}

                  {appeal.status === 'OPEN' ? (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => openAppealModal(appeal)}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-black text-xs shadow-xs transition flex items-center justify-center gap-1.5"
                      >
                        <span>✍️ بررسی اعتراض و اصلاح بارم‌بندی نمرات</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => openAppealModal(appeal)}
                        className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition"
                      >
                        مشاهده جزئیات و بارم‌ها
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: GRADE ANALYTICS & DISTRIBUTION */}
      {/* ========================================================================= */}
      {activeTab === 'ANALYTICS' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-5 print:hidden">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="font-black text-slate-900 text-base">
              تحلیل آماری و توزیع فراوانی نمرات درس {currentOffering.title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              نمودار بازه‌های نمرات جهت بررسی سطح کیفی آزمون و سنجش استاندارد نمره‌دهی.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-1">
              <span className="text-xs font-bold text-emerald-800">عالی (۱۷ الی ۲۰)</span>
              <div className="text-2xl font-black text-emerald-950">{faNum(gradeDistribution.excellent)} نفر</div>
              <span className="text-[10px] text-emerald-600 font-mono">
                {students.length > 0 ? faNum(((gradeDistribution.excellent / students.length) * 100).toFixed(1)) : '۰'}٪
              </span>
            </div>

            <div className="p-4 bg-sky-50 rounded-2xl border border-sky-200 text-center space-y-1">
              <span className="text-xs font-bold text-sky-800">خوب (۱۴ الی ۱۶.۹)</span>
              <div className="text-2xl font-black text-sky-950">{faNum(gradeDistribution.good)} نفر</div>
              <span className="text-[10px] text-sky-600 font-mono">
                {students.length > 0 ? faNum(((gradeDistribution.good / students.length) * 100).toFixed(1)) : '۰'}٪
              </span>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-center space-y-1">
              <span className="text-xs font-bold text-amber-800">متوسط (۱۰ الی ۱۳.۹)</span>
              <div className="text-2xl font-black text-amber-950">{faNum(gradeDistribution.fair)} نفر</div>
              <span className="text-[10px] text-amber-600 font-mono">
                {students.length > 0 ? faNum(((gradeDistribution.fair / students.length) * 100).toFixed(1)) : '۰'}٪
              </span>
            </div>

            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-center space-y-1">
              <span className="text-xs font-bold text-rose-800">مردود (زیر ۱۰)</span>
              <div className="text-2xl font-black text-rose-950">{faNum(gradeDistribution.fail)} نفر</div>
              <span className="text-[10px] text-rose-600 font-mono">
                {students.length > 0 ? faNum(((gradeDistribution.fail / students.length) * 100).toFixed(1)) : '۰'}٪
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Appeal Decision Modal with Detailed Rubric Breakdown Editing */}
      {selectedAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto print:hidden">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full shadow-2xl border border-slate-200 space-y-4 text-slate-900 my-8">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xl">✍️</span>
                <h3 className="font-black text-base text-slate-900">
                  رسیدگی به اعتراض و اصلاح بارم نمرات: {selectedAppeal.fullName}
                </h3>
              </div>
              <button onClick={() => setSelectedAppeal(null)} className="text-slate-400 hover:text-slate-700 text-sm font-bold">✕</button>
            </div>

            {/* Student Appeal Details Box */}
            <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-slate-600 font-medium">شماره دانشجویی: </span>
                  <span className="font-mono font-bold text-slate-900">{faNum(selectedAppeal.studentCode)}</span>
                </div>
                <div>
                  <span className="text-slate-600 font-medium">نمره قبلی ثبت‌شده: </span>
                  <span className="font-black text-indigo-950 font-mono bg-white px-2 py-0.5 rounded border border-amber-300">
                    {faNum(selectedAppeal.currentGrade)} از ۲۰
                  </span>
                </div>
              </div>
              <div className="pt-1.5 text-slate-800 border-t border-amber-200">
                <span className="font-bold text-amber-950 block mb-0.5">متن اعتراض دانشجو:</span>
                <p className="leading-5 bg-white p-2.5 rounded-xl border border-amber-200 text-slate-900 font-medium">{selectedAppeal.studentMessage}</p>
              </div>
            </div>

            {/* Rubric Breakdown Component Editor */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                  <span>📊</span>
                  <span>اصلاح تفکیکی بخش‌های بارم‌بندی درس:</span>
                </h4>
                <span className="text-[11px] text-slate-500 font-medium">
                  سقف نمرات مطابق بارم مصوب کلاس
                </span>
              </div>

              {currentOffering.isCoTaught ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-indigo-200 space-y-1.5">
                    <div className="flex justify-between font-bold text-indigo-950">
                      <span>بخش تئوری (از ۲۰)</span>
                      <span className="text-[10px] text-indigo-600">سهم {faNum((currentOffering.coTaughtDetails?.theoryWeightRatio || 0.6) * 100)}٪</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step={0.25}
                      inputMode="decimal"
                      value={appealTheoryProf}
                      onChange={e => setAppealTheoryProf(Math.max(0, Math.min(20, Number(e.target.value))))}
                      className="w-full border border-slate-300 rounded-lg p-2 text-center font-black text-sm text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-purple-200 space-y-1.5">
                    <div className="flex justify-between font-bold text-purple-950">
                      <span>بخش عملی / آزمایشگاه (از ۲۰)</span>
                      <span className="text-[10px] text-purple-600">سهم {faNum((currentOffering.coTaughtDetails?.labWeightRatio || 0.4) * 100)}٪</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step={0.25}
                      inputMode="decimal"
                      value={appealLabProf}
                      onChange={e => setAppealLabProf(Math.max(0, Math.min(20, Number(e.target.value))))}
                      className="w-full border border-slate-300 rounded-lg p-2 text-center font-black text-sm text-purple-950 focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block text-center">
                      میان‌ترم ({faNum(rubric.midterm)})
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={rubric.midterm}
                      step={0.25}
                      inputMode="decimal"
                      value={appealMidterm}
                      onChange={e => setAppealMidterm(Math.max(0, Math.min(rubric.midterm, Number(e.target.value))))}
                      className="w-full border border-slate-300 rounded-lg p-1.5 text-center font-black text-xs text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block text-center">
                      تکالیف ({faNum(rubric.homework)})
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={rubric.homework}
                      step={0.25}
                      inputMode="decimal"
                      value={appealHomework}
                      onChange={e => setAppealHomework(Math.max(0, Math.min(rubric.homework, Number(e.target.value))))}
                      className="w-full border border-slate-300 rounded-lg p-1.5 text-center font-black text-xs text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block text-center">
                      حضور ({faNum(rubric.participation)})
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={rubric.participation}
                      step={0.25}
                      inputMode="decimal"
                      value={appealParticipation}
                      onChange={e => setAppealParticipation(Math.max(0, Math.min(rubric.participation, Number(e.target.value))))}
                      className="w-full border border-slate-300 rounded-lg p-1.5 text-center font-black text-xs text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {rubric.practical > 0 && (
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block text-center">
                        عملی ({faNum(rubric.practical)})
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={rubric.practical}
                        step={0.25}
                        inputMode="decimal"
                        value={appealPractical}
                        onChange={e => setAppealPractical(Math.max(0, Math.min(rubric.practical, Number(e.target.value))))}
                        className="w-full border border-slate-300 rounded-lg p-1.5 text-center font-black text-xs text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  )}

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block text-center">
                      پایان‌ترم ({faNum(rubric.finalExam)})
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={rubric.finalExam}
                      step={0.25}
                      inputMode="decimal"
                      value={appealFinalExam}
                      onChange={e => setAppealFinalExam(Math.max(0, Math.min(rubric.finalExam, Number(e.target.value))))}
                      className="w-full border border-slate-300 rounded-lg p-1.5 text-center font-black text-xs text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Calculated Total Summary Card */}
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-600 font-medium">مجموع نمره جدید محاسبه‌شده: </span>
                  <span className="font-black text-base text-indigo-950 font-mono">
                    {faNum(calculatedAppealTotal)} از ۲۰
                  </span>
                </div>
                <div>
                  {calculatedAppealTotal !== selectedAppeal.currentGrade ? (
                    <span
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                        calculatedAppealTotal > selectedAppeal.currentGrade
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {calculatedAppealTotal > selectedAppeal.currentGrade ? '+' : ''}
                      {faNum((calculatedAppealTotal - selectedAppeal.currentGrade).toFixed(2))} نمره تغییر
                    </span>
                  ) : (
                    <span className="text-slate-500 font-medium text-[11px]">بدون تغییر نمره</span>
                  )}
                </div>
              </div>
            </div>

            {/* Professor Reply Textarea */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">توضیحات و پاسخ رسمی استاد به دانشجو:</label>
              <textarea
                value={appealReplyText}
                onChange={e => setAppealReplyText(e.target.value)}
                rows={2}
                placeholder="مثال: برگه مجدداً بازبینی شد و با احتساب تمرین شماره ۲، نمره نهایی اصلاح گردید..."
                className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => handleResolveAppeal('ACCEPTED')}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition shadow flex items-center justify-center gap-1.5"
              >
                <span>✓</span>
                <span>پذیرش اعتراض، اعمال بارم جدید و ثبت نمره ({faNum(calculatedAppealTotal)})</span>
              </button>
              <button
                onClick={() => handleResolveAppeal('REJECTED')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-xs transition"
              >
                ✕ رد اعتراض و تثبیت نمره قبلی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRE-FINALIZE OTP CONFIRMATION & LEGAL WARNING MODAL */}
      {/* ========================================================================= */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 print:hidden">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border-2 border-amber-500 space-y-4 text-slate-900 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 bg-amber-100 text-amber-900 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-inner">
              ⚠️
            </div>

            <div className="text-center space-y-2">
              <h3 className="font-black text-base sm:text-lg text-slate-900">
                اخطار قانونی نهایی‌سازی و قفل قطعی نمرات
              </h3>
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-300 text-xs text-amber-950 text-right leading-relaxed font-medium">
                ⚠️ <strong>توجه استاد محترم:</strong> شما در حال نهایی‌سازی و ثبت رسمی نمرات هستید. پس از ثبت رمز یک‌بارمصرف (OTP) و اعمال امضای دیجیتال، <strong>امکان هیچ‌گونه تغییر یا ویرایش نمره توسط استاد وجود نخواهد داشت</strong> و لیست نمرات جهت بایگانی رسمی و صدور کارنامه به اداره آموزش فریز می‌گردد.
              </div>
            </div>

            {/* Verification Stats */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">درس و گروه:</span>
                <strong className="text-slate-900">{currentOffering.title} (گروه {faNum(currentOffering.groupNumber)})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">تعداد دانشجویان ارزیابی‌شده:</span>
                <strong>{faNum(students.length)} نفر ({faNum(passedStudents)} قبول · {faNum(failedStudents)} مردود)</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">میانگین کل کلاس:</span>
                <strong className="font-mono text-indigo-950">{faNum(averageGrade)} از ۲۰</strong>
              </div>
            </div>

            <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-200 text-xs space-y-1 text-center">
              <span className="text-slate-500 block">کد تایید ۵ رقمی ارسال‌شده (رمز یکبار مصرف آزمایشی):</span>
              <span className="font-mono font-black text-indigo-800 text-xl tracking-widest">{otpSentCode}</span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 text-center">
                کد ۵ رقمی OTP را وارد نمایید:
              </label>
              <input
                type="text"
                maxLength={6}
                inputMode="numeric"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                placeholder="• • • • •"
                className="w-full border-2 border-indigo-600 rounded-xl p-3 text-center font-mono font-black text-2xl tracking-widest text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-300"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={handleConfirmFinalize}
                className="w-full sm:flex-1 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs transition shadow-md flex items-center justify-center gap-1.5"
              >
                <span>🔒 تایید قطعی، امضای دیجیتال و قفل نمرات</span>
              </button>
              <button
                onClick={() => {
                  setShowOtpModal(false);
                  setOtpCode('');
                }}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
