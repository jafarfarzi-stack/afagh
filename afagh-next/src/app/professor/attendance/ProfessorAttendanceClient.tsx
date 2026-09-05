'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { saveSessionAttendanceAction, scheduleMakeupSessionAction } from './actions';

export interface StudentInfo {
  id: number;
  studentCode: string;
  fullName: string;
}

export interface StudentSessionAttendance {
  status: 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE';
  lateMinutes?: number;
  note?: string;
}

export interface ClassSessionItem {
  id: number;
  sessionNo: number;
  sessionDate: string; // e.g. '۱۴۰۵/۰۷/۰۵'
  startTime: string;   // e.g. '۰۸:۰۰'
  endTime: string;     // e.g. '۱۰:۰۰'
  roomName: string;    // e.g. 'کلاس ۳۰۱ (سمعی و بصری)'
  topic: string;
  isHeld: boolean;
  isMakeUp: boolean;
  replacedSessionNo?: number;
  professorStatus: 'VERIFIED_PRESENT' | 'ABSENT' | 'UPCOMING' | 'APPROVED_MAKEUP';
  verificationDetail: string;
  studentStatuses: { [studentId: number]: StudentSessionAttendance };
}

export interface AttendanceCourseOffering {
  id: number;
  code: string;
  title: string;
  groupNumber: number;
  units: number;
  roomName: string;
  scheduleTime: string;
  students: StudentInfo[];
  sessions: ClassSessionItem[];
}

export interface MakeupSessionRecord {
  id: number;
  offeringId: number;
  courseTitle: string;
  groupNumber: number;
  professorName: string;
  replacedSessionNo: number;
  sessionDate: string;
  sessionTime: string;
  roomName: string;
  topic: string;
  reason: string;
  status: 'APPROVED_DIRECT' | 'PENDING_EDUCATION' | 'APPROVED_BY_EDUCATION';
  allocatedAt: string;
}

interface Props {
  professor: {
    id: number;
    name: string;
    staffCode: string;
    academicRank?: string;
  };
  termTitle: string;
  initialOfferings: AttendanceCourseOffering[];
  defaultOfferingId?: number;
  initialMakeupHistory: MakeupSessionRecord[];
  todayJalali: string;
  rooms: { id: number; name: string; capacity: number; type: string }[];
}

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));



export default function ProfessorAttendanceClient({
  professor,
  termTitle,
  initialOfferings,
  defaultOfferingId,
  initialMakeupHistory,
  todayJalali,
  rooms: realRooms,
}: Props) {
  const profDisplayName = professor?.name || 'دکتر جمیل احمدی';

  const [offerings, setOfferings] = useState<AttendanceCourseOffering[]>(initialOfferings);
  const [selectedOfferingId, setSelectedOfferingId] = useState<number>(
    defaultOfferingId && initialOfferings.some(o => o.id === defaultOfferingId)
      ? defaultOfferingId
      : initialOfferings[0]?.id || 101
  );

  const [selectedSessionNo, setSelectedSessionNo] = useState<number>(7);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Make-up Session Creation Modal State
  const [showMakeupModal, setShowMakeupModal] = useState<boolean>(false);
  const [savingSession, setSavingSession] = useState(false);
  const [savingMakeup, setSavingMakeup] = useState(false);
  const [selectedRoomOptionId, setSelectedRoomOptionId] = useState<number>(101);
  const [makeupForm, setMakeupForm] = useState({
    replacedSessionNo: 4,
    sessionDate: '۱۴۰۵/۰۹/۰۸',
    sessionTime: '۱۳:۳۰ الی ۱۵:۳۰',
    topic: 'جلسه جبرانی: مدیریت بن‌بست و الگوریتم‌های بانکدار در سیستم‌عامل',
    reason: 'هم‌پوشانی با شرکت در سمینار تخصصی دانشگاه',
  });

  // Log of make-up sessions requested / scheduled (واقعی از class_sessions)
  const [makeupHistory, setMakeupHistory] = useState<MakeupSessionRecord[]>(initialMakeupHistory);

  // Current offering & session
  const currentOffering = useMemo(() => {
    return offerings.find(o => o.id === selectedOfferingId) || offerings[0];
  }, [offerings, selectedOfferingId]);

  const currentSession = useMemo(() => {
    return currentOffering.sessions.find(s => s.sessionNo === selectedSessionNo) || currentOffering.sessions[0];
  }, [currentOffering, selectedSessionNo]);

  // Compute total prior absences for each student across all completed sessions
  const studentPriorAbsentsMap = useMemo(() => {
    const map: { [studentId: number]: number } = {};
    currentOffering.students.forEach(st => { map[st.id] = 0; });

    currentOffering.sessions.forEach(sess => {
      if (sess.isHeld && sess.sessionNo !== selectedSessionNo) {
        currentOffering.students.forEach(st => {
          const rec = sess.studentStatuses[st.id];
          if (rec?.status === 'ABSENT') {
            map[st.id] = (map[st.id] || 0) + 1;
          }
        });
      }
    });

    return map;
  }, [currentOffering, selectedSessionNo]);

  // Update session topic
  const handleUpdateTopic = (topic: string) => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          sessions: off.sessions.map(sess => {
            if (sess.sessionNo !== selectedSessionNo) return sess;
            return { ...sess, topic };
          }),
        };
      })
    );
  };

  // Update session date
  const handleUpdateDate = (date: string) => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          sessions: off.sessions.map(sess => {
            if (sess.sessionNo !== selectedSessionNo) return sess;
            return { ...sess, sessionDate: date };
          }),
        };
      })
    );
  };

  // Set student status in current session
  const setStudentStatus = (studentId: number, status: 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE') => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          sessions: off.sessions.map(sess => {
            if (sess.sessionNo !== selectedSessionNo) return sess;
            const current = sess.studentStatuses[studentId] || { status: 'PRESENT' };
            return {
              ...sess,
              studentStatuses: {
                ...sess.studentStatuses,
                [studentId]: {
                  ...current,
                  status,
                  lateMinutes: status === 'LATE' ? (current.lateMinutes || 15) : undefined,
                },
              },
            };
          }),
        };
      })
    );
  };

  // Set student late minutes
  const setStudentLateMinutes = (studentId: number, mins: number) => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          sessions: off.sessions.map(sess => {
            if (sess.sessionNo !== selectedSessionNo) return sess;
            const current = sess.studentStatuses[studentId] || { status: 'LATE' };
            return {
              ...sess,
              studentStatuses: {
                ...sess.studentStatuses,
                [studentId]: {
                  ...current,
                  lateMinutes: mins,
                },
              },
            };
          }),
        };
      })
    );
  };

  // Set student note
  const setStudentNote = (studentId: number, note: string) => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          sessions: off.sessions.map(sess => {
            if (sess.sessionNo !== selectedSessionNo) return sess;
            const current = sess.studentStatuses[studentId] || { status: 'PRESENT' };
            return {
              ...sess,
              studentStatuses: {
                ...sess.studentStatuses,
                [studentId]: {
                  ...current,
                  note,
                },
              },
            };
          }),
        };
      })
    );
  };

  // Bulk status update
  const markAll = (status: 'PRESENT' | 'ABSENT') => {
    setOfferings(prev =>
      prev.map(off => {
        if (off.id !== selectedOfferingId) return off;
        return {
          ...off,
          sessions: off.sessions.map(sess => {
            if (sess.sessionNo !== selectedSessionNo) return sess;
            const updatedMap: { [studentId: number]: StudentSessionAttendance } = {};
            off.students.forEach(st => {
              updatedMap[st.id] = { status, lateMinutes: undefined, note: sess.studentStatuses[st.id]?.note };
            });
            return { ...sess, studentStatuses: updatedMap };
          }),
        };
      })
    );
    setToastMessage(status === 'PRESENT' ? 'تمامی دانشجویان این جلسه حاضر ثبت شدند.' : 'وضعیت دانشجویان بازنشانی گردید.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Save current session — ذخیرهٔ واقعی در student_class_attendance (سرور)
  const handleSaveSession = async () => {
    if (!currentSession || currentSession.id <= 0) {
      alert('جلسهٔ انتخابی هنوز در سرور ثبت نشده است.');
      return;
    }
    setSavingSession(true);
    try {
      const entries = Object.entries(currentSession.studentStatuses).map(([studentId, st]) => ({
        studentId: Number(studentId),
        status: st.status,
        lateMinutes: st.lateMinutes,
      }));
      const res = await saveSessionAttendanceAction(currentSession.id, entries);
      if (!res.ok) {
        alert(res.error || 'خطا در ذخیرهٔ حضور و غیاب.');
        return;
      }
      setOfferings(prev =>
        prev.map(off => {
          if (off.id !== selectedOfferingId) return off;
          return {
            ...off,
            sessions: off.sessions.map(sess => {
              if (sess.id !== currentSession.id) return sess;
              return { ...sess, isHeld: true };
            }),
          };
        })
      );
      setToastMessage(`✅ حضور و غیاب جلسه ${faNum(currentSession.sessionNo)} (مورخ ${faNum(currentSession.sessionDate)}) در پایگاه داده ثبت شد (${res.savedCount ?? entries.length} ردیف).`);
    } catch {
      alert('خطا در ارتباط با سرور.');
    } finally {
      setSavingSession(false);
    }
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Professor Creates Make-up Session
  const handleCreateMakeupSession = async () => {
    // Validate date: cannot be before current date
    if (makeupForm.sessionDate < todayJalali) {
      alert(`خطا: تاریخ جلسه جبرانی نمی‌تواند قبل از تاریخ جاری سامانه (${todayJalali}) باشد.`);
      return;
    }

    const isDirect = selectedRoomOptionId !== 0;
    const selectedRoom = realRooms.find(r => r.id === selectedRoomOptionId);
    if (isDirect && !selectedRoom) {
      alert('کلاس انتخابی معتبر نیست.');
      return;
    }
    const roomName = isDirect ? selectedRoom!.name : 'در انتظار تخصیص کلاس توسط آموزش';

    const newSessionNo = 100 + makeupForm.replacedSessionNo;

    // 1. If direct room selected, add session directly to active sessions
    if (isDirect) {
      const newSession: ClassSessionItem = {
        id: Date.now(),
        sessionNo: newSessionNo,
        sessionDate: makeupForm.sessionDate,
        startTime: makeupForm.sessionTime.split('الی')[0]?.trim() || '۱۳:۳۰',
        endTime: makeupForm.sessionTime.split('الی')[1]?.trim() || '۱۵:۳۰',
        roomName: selectedRoom!.name,
        topic: makeupForm.topic,
        isHeld: false,
        isMakeUp: true,
        replacedSessionNo: makeupForm.replacedSessionNo,
        professorStatus: 'APPROVED_MAKEUP',
        verificationDetail: `تخصیص مستقیم کلاس ${selectedRoom!.name} توسط استاد در ${todayJalali}`,
        studentStatuses: {},
      };

      currentOffering.students.forEach(st => {
        newSession.studentStatuses[st.id] = { status: 'PRESENT' };
      });

      setOfferings(prev =>
        prev.map(off => {
          if (off.id !== selectedOfferingId) return off;
          return {
            ...off,
            sessions: [...off.sessions, newSession],
          };
        })
      );

      setSelectedSessionNo(newSessionNo);
    }

    // 2. Add to makeup history
    const record: MakeupSessionRecord = {
      id: Date.now(),
      offeringId: selectedOfferingId,
      courseTitle: currentOffering.title,
      groupNumber: currentOffering.groupNumber,
      professorName: profDisplayName,
      replacedSessionNo: makeupForm.replacedSessionNo,
      sessionDate: makeupForm.sessionDate,
      sessionTime: makeupForm.sessionTime,
      roomName: roomName,
      topic: makeupForm.topic,
      reason: makeupForm.reason,
      status: isDirect ? 'APPROVED_DIRECT' : 'PENDING_EDUCATION',
      allocatedAt: `${todayJalali} ساعت ${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')}`,
    };

    // ذخیرهٔ واقعی در class_sessions (isMakeUpSession=1) — سپس به‌روزرسانی UI
    const replacedSession = currentOffering.sessions.find(x => x.sessionNo === makeupForm.replacedSessionNo);
    const sTimes = makeupForm.sessionTime.split('الی').map(x => x.trim());
    const toAscii = (x: string) => x.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    const normTime = (x: string) => { const m = toAscii(x).match(/\d{1,2}:\d{2}/); return m ? m[0].padStart(5, '0') : '13:30'; };
    setSavingMakeup(true);
    try {
      const res = await scheduleMakeupSessionAction({
        offeringId: selectedOfferingId,
        replacedSessionId: replacedSession?.id,
        sessionDate: toAscii(makeupForm.sessionDate),
        startTime: normTime(sTimes[0] ?? '').replace(/\d{2}:(\d{2})/, '13:30').length > 0 ? normTime(sTimes[0] ?? '') : '13:30',
        endTime: normTime(sTimes[1] ?? ''),
        roomName: isDirect ? roomName : '',
        isDirect,
      });
      if (!res.ok) {
        alert(res.error || 'ثبت جلسهٔ جبرانی ناموفق بود.');
        return;
      }
      setMakeupHistory(prev => [{ ...record, id: res.sessionId ?? record.id }, ...prev]);
      setShowMakeupModal(false);
      if (isDirect) {
        setToastMessage(`🎉 جلسه جبرانی در «${selectedRoom!.name}» برای تاریخ ${faNum(makeupForm.sessionDate)} ثبت شد و در فهرست جلسات درس قرار گرفت.`);
      } else {
        setToastMessage(`📩 درخواست جلسه جبرانی ثبت شد و در انتظار تأیید/تخصیص کلاس توسط ادارهٔ آموزش است.`);
      }
    } catch {
      alert('خطا در ارتباط با سرور.');
    } finally {
      setSavingMakeup(false);
    }
    setTimeout(() => setToastMessage(null), 8000);
  };

  // Statistics for the active session
  const students = currentOffering.students;
  const totalStudents = students.length;
  const presentCount = students.filter(s => {
    const st = currentSession.studentStatuses[s.id]?.status;
    return st === 'PRESENT' || st === 'LATE';
  }).length;
  const absentCount = students.filter(s => currentSession.studentStatuses[s.id]?.status === 'ABSENT').length;
  const excusedCount = students.filter(s => currentSession.studentStatuses[s.id]?.status === 'EXCUSED').length;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* Toast */}
      {toastMessage && (
        <div className="p-4 bg-emerald-900 text-emerald-100 rounded-2xl shadow-xl border border-emerald-700 font-bold text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-indigo-700/50 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">
                سامانه هوشمند حضور و غیاب و اثر انگشت
              </span>
              <span className="text-xs text-indigo-200">{termTitle} · استاد: {profDisplayName}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              📋 ثبت حضور و غیاب کلاسی و مدیریت جلسات جبرانی
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMakeupModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shadow transition flex items-center gap-1.5"
            >
              <span>➕ ایجاد جلسه جدید جبرانی</span>
            </button>
            <Link
              href="/professor/schedule"
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition"
            >
              🗓️ برنامه هفتگی
            </Link>
          </div>
        </div>

        {/* Controls: Select Course, Select Session & Auto-Loaded Date */}
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-indigo-200 font-bold block mb-1">۱. انتخاب کلاس و درس:</label>
            <select
              value={selectedOfferingId}
              onChange={e => {
                const newOffId = Number(e.target.value);
                setSelectedOfferingId(newOffId);
                const firstSess = offerings.find(o => o.id === newOffId)?.sessions[0]?.sessionNo || 1;
                setSelectedSessionNo(firstSess);
              }}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-3 py-2 font-bold"
            >
              {offerings.map(o => (
                <option key={o.id} value={o.id}>
                  {o.title} (گروه {faNum(o.groupNumber)} — کد {o.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-indigo-200 font-bold block mb-1">۲. انتخاب جلسه آموزشی (۱ الی ۱۶):</label>
            <select
              value={selectedSessionNo}
              onChange={e => setSelectedSessionNo(Number(e.target.value))}
              className="w-full bg-slate-900/90 text-white border-2 border-amber-400 rounded-lg px-3 py-2 font-extrabold"
            >
              {currentOffering.sessions.map(sess => (
                <option key={sess.sessionNo} value={sess.sessionNo}>
                  {sess.isMakeUp ? `🔷 جلسه جبرانی (جبران جلسه ${faNum(sess.replacedSessionNo)})` : `جلسه شماره ${faNum(sess.sessionNo)}`} — تاریخ {sess.sessionDate} {sess.isHeld ? '✓ برگزار شده' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-indigo-200 font-bold block mb-1">۳. تاریخ برگزاری این جلسه:</label>
            <input
              type="text"
              value={currentSession.sessionDate}
              onChange={e => handleUpdateDate(e.target.value)}
              className="w-full bg-slate-900/90 text-white border border-indigo-400/50 rounded-lg px-3 py-2 font-bold font-mono"
            />
          </div>
        </div>
      </div>

      {/* Professor Attendance Verification Banner (Fingerprint, Chain Matching & Status) */}
      <div className="space-y-3">
        {/* Biometric & Chain Matching Information Card */}
        <div className="p-3.5 bg-slate-900 text-white rounded-2xl border border-indigo-500/40 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-700/80 border border-indigo-400/40 flex items-center justify-center text-lg shrink-0">
              🧬
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-xs">موتور تطبیق هوشمند تردد بیومتریک و پیوستگی کلاس‌ها:</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white">
                  ✓ فعال (Chain Matching)
                </span>
              </div>
              <p className="text-indigo-200 text-[11px] leading-4">
                اثر انگشت در گیت ورودی (ساعت ۰۷:۴۸) ثبت شده است. برای کلاس‌های متوالی پشت‌سرهم، سیستم به طور خودکار حضور شما را تایید کرده و نیازی به ثبت مکرر اثر انگشت نیست.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-lg bg-white/10 text-emerald-300 font-mono text-[11px] border border-white/10">
              IP: 192.168.10.45 (شبکه داخلی دانشگاه)
            </span>
          </div>
        </div>

        {/* Status Alert */}
        <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
          currentSession.professorStatus === 'VERIFIED_PRESENT'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : currentSession.professorStatus === 'ABSENT'
            ? 'bg-rose-50 border-rose-300 text-rose-950'
            : currentSession.professorStatus === 'APPROVED_MAKEUP'
            ? 'bg-purple-50 border-purple-300 text-purple-950'
            : 'bg-slate-50 border-slate-300 text-slate-800'
        }`}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                currentSession.professorStatus === 'VERIFIED_PRESENT'
                  ? 'bg-emerald-700 text-white'
                  : currentSession.professorStatus === 'ABSENT'
                  ? 'bg-rose-700 text-white animate-pulse'
                  : currentSession.professorStatus === 'APPROVED_MAKEUP'
                  ? 'bg-purple-700 text-white'
                  : 'bg-slate-300 text-slate-800'
              }`}>
                {currentSession.professorStatus === 'VERIFIED_PRESENT' && '🟢 حضور استاد تایید شده'}
                {currentSession.professorStatus === 'ABSENT' && '🔴 غیبت استاد در جلسه'}
                {currentSession.professorStatus === 'APPROVED_MAKEUP' && '🔷 جلسه جبرانی مصوب'}
                {currentSession.professorStatus === 'UPCOMING' && '⏳ در انتظار تشکیل'}
              </span>
              <span className="text-xs font-bold text-slate-600">
                {currentSession.verificationDetail}
              </span>
            </div>

            {currentSession.professorStatus === 'ABSENT' && (
              <p className="text-xs text-rose-800 font-extrabold leading-5">
                ⚠️ اخطار آموزش: عدم حضور استاد در این جلسه از روی عدم ثبت اثر انگشت در گیت ورود تایید شده است. طبق ماده ۱۰ آیین‌نامه، ملزم به تعریف و برگزاری جلسه جبرانی می‌باشید.
              </p>
            )}

            {currentSession.professorStatus === 'VERIFIED_PRESENT' && (
              <p className="text-xs text-emerald-800 font-bold leading-5">
                ✓ حضور شما در این جلسه آموزشی از طریق سیستم گیت تردد و منطق پیوستگی ثبت گردیده و در فیش حقوقی لحاظ شد.
              </p>
            )}
          </div>

          {currentSession.professorStatus === 'ABSENT' && (
            <button
              onClick={() => {
                setMakeupForm(prev => ({ ...prev, replacedSessionNo: currentSession.sessionNo }));
                setShowMakeupModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow transition shrink-0 flex items-center gap-1.5"
            >
              <span>➕ ثبت جلسه جبرانی برای این غیبت</span>
            </button>
          )}
        </div>
      </div>

      {/* Session Details & Topic Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-950 font-extrabold text-xs">
              🏛️ {currentSession.roomName}
            </span>
            <span className="text-xs text-slate-600 font-bold">
              ⏰ ساعت {currentSession.startTime} الی {currentSession.endTime}
            </span>
            <span className="text-xs text-slate-600 font-bold">
              📚 {faNum(currentOffering.units)} واحد
            </span>
          </div>

          {/* Quick Bulk Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => markAll('PRESENT')}
              className="px-3 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs transition flex items-center gap-1"
            >
              <span>🟢 حضور همه در جلسه {faNum(currentSession.sessionNo)}</span>
            </button>
            <button
              onClick={() => markAll('ABSENT')}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
            >
              بازنشانی
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            موضوع و سرفصل تدریس شده در جلسه شماره {faNum(currentSession.sessionNo)}:
          </label>
          <input
            type="text"
            value={currentSession.topic}
            onChange={e => handleUpdateTopic(e.target.value)}
            placeholder="ثبت سرفصل تدریس شده..."
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Real-time Session Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-extrabold text-lg">
            👥
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">کل دانشجویان کلاس</div>
            <div className="text-lg font-black text-slate-900">{faNum(totalStudents)} نفر</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-extrabold text-lg">
            ✓
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">حاضرین این جلسه</div>
            <div className="text-lg font-black text-emerald-700">{faNum(presentCount)} نفر ({faNum(attendanceRate)}٪)</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-extrabold text-lg">
            ✕
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">غایبین جلسه {faNum(currentSession.sessionNo)}</div>
            <div className="text-lg font-black text-rose-700">{faNum(absentCount)} نفر</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-extrabold text-lg">
            ⏳
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold">غیبت‌های موجه</div>
            <div className="text-lg font-black text-amber-700">{faNum(excusedCount)} نفر</div>
          </div>
        </div>
      </div>

      {/* Student Attendance Roster for Selected Session */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">
              لیست دانشجویان و وضعیت حضور در جلسه شماره {faNum(currentSession.sessionNo)} (مورخ {currentSession.sessionDate})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              با تغییر جلسه در بالای صفحه، اطلاعات و وضعیت‌های همان جلسه نمایش داده می‌شود.
            </p>
          </div>

          <button
            onClick={handleSaveSession}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-extrabold text-xs shadow transition flex items-center gap-1.5"
          >
            <span>💾 ثبت و تایید نهایی جلسه {faNum(currentSession.sessionNo)}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white text-center">
                <th className="p-3 border border-slate-800 w-12 font-extrabold">ردیف</th>
                <th className="p-3 border border-slate-800 font-extrabold">شماره دانشجویی</th>
                <th className="p-3 border border-slate-800 font-extrabold">نام و نام خانوادگی دانشجو</th>
                <th className="p-3 border border-slate-800 font-extrabold">جمع غیبت در سایر جلسات</th>
                <th className="p-3 border border-slate-800 font-extrabold min-w-[280px]">وضعیت حضور در این جلسه</th>
                <th className="p-3 border border-slate-800 font-extrabold">توضیح کلاسی</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st, idx) => {
                const sessionAtt = currentSession.studentStatuses[st.id] || { status: 'PRESENT' };
                const priorAbsents = studentPriorAbsentsMap[st.id] || 0;
                const totalAbsentsWithCurrent = priorAbsents + (sessionAtt.status === 'ABSENT' ? 1 : 0);
                const is3AbsencesWarning = totalAbsentsWithCurrent >= 3;

                return (
                  <tr key={st.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-3 border border-slate-200 text-center font-bold text-slate-500">
                      {faNum(idx + 1)}
                    </td>
                    <td className="p-3 border border-slate-200 font-mono text-center font-bold text-indigo-950">
                      {faNum(st.studentCode)}
                    </td>
                    <td className="p-3 border border-slate-200 font-extrabold text-slate-900">
                      <div className="flex items-center justify-between">
                        <span>{st.fullName}</span>
                        {is3AbsencesWarning && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] border border-rose-300">
                            ⚠️ ماده ۳/۱۶ (غیبت: {faNum(totalAbsentsWithCurrent)})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 border border-slate-200 text-center font-bold">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${priorAbsents > 2 ? 'bg-rose-100 text-rose-900 font-extrabold' : 'bg-slate-100 text-slate-800'}`}>
                        {faNum(priorAbsents)} جلسه
                      </span>
                    </td>
                    <td className="p-2 border border-slate-200">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.id, 'PRESENT')}
                          className={`px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition ${
                            sessionAtt.status === 'PRESENT'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          🟢 حاضر
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.id, 'ABSENT')}
                          className={`px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition ${
                            sessionAtt.status === 'ABSENT'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          🔴 غایب
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.id, 'EXCUSED')}
                          className={`px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition ${
                            sessionAtt.status === 'EXCUSED'
                              ? 'bg-amber-500 text-slate-950 shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          🟡 موجه
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.id, 'LATE')}
                          className={`px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition ${
                            sessionAtt.status === 'LATE'
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          🔵 تاخیر
                        </button>

                        {sessionAtt.status === 'LATE' && (
                          <div className="flex items-center gap-1 mr-1">
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={sessionAtt.lateMinutes || 15}
                              onChange={e => setStudentLateMinutes(st.id, Number(e.target.value))}
                              className="w-12 border border-slate-300 rounded-lg p-1 text-center font-bold text-xs"
                            />
                            <span className="text-[10px] text-slate-500">دقیقه</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-2 border border-slate-200">
                      <input
                        type="text"
                        value={sessionAtt.note || ''}
                        onChange={e => setStudentNote(st.id, e.target.value)}
                        placeholder="ثبت توضیح..."
                        className="w-full border border-slate-300 rounded-lg p-1.5 text-xs text-slate-800"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Make-up Sessions Status Tracker for Professor */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">
              📑 وضعیت و تاریخچه جلسات جبرانی ثبت‌شده
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              جلساتی که مستقیماً در کلاس خالی ثبت شده یا جهت تعیین سالن ویژه به آموزش ارجاع داده شده‌اند.
            </p>
          </div>
        </div>

        {makeupHistory.length === 0 ? (
          <div className="text-center p-6 bg-slate-50 rounded-2xl text-xs font-bold text-slate-500">
            هیچ جلسه جبرانی برای این درس ثبت نشده است.
          </div>
        ) : (
          <div className="space-y-3">
            {makeupHistory.map(req => (
              <div key={req.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm">{req.courseTitle} (گروه {faNum(req.groupNumber)})</span>
                    <span className="text-xs text-slate-600 font-bold">مدرس: {req.professorName}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-bold text-[10px]">
                      جبران جلسه {faNum(req.replacedSessionNo)}
                    </span>
                  </div>

                  <div>
                    {req.status === 'APPROVED_DIRECT' || req.status === 'APPROVED_BY_EDUCATION' ? (
                      <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 font-black text-xs border border-emerald-300">
                        ✓ تایید و ابلاغ شد (مکان: {req.roomName})
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-black text-xs border border-amber-300 animate-pulse">
                        ⏳ در انتظار تخصیص کلاس توسط آموزش
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">زمان برگزاری:</span>
                    <span className="font-bold text-slate-900">{req.sessionDate} — ساعت {req.sessionTime}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">محل تشکیل:</span>
                    <span className="font-extrabold text-indigo-950">🏛️ {req.roomName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">سرفصل تدریس:</span>
                    <span className="font-bold text-slate-700">{req.topic}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: Professor Creates Make-up Session & Selects Free Classrooms Directly */}
      {showMakeupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-scaleUp text-slate-900">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-extrabold text-base text-slate-900">
                ➕ ایجاد و تخصیص کلاس جلسه جبرانی
              </h3>
              <button onClick={() => setShowMakeupModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <p className="text-xs text-slate-600 leading-5">
              استاد گرامی، در این فرم می‌توانید از میان <b>کلاس‌های خالی و در دسترس دانشگاه در تاریخ و ساعت انتخابی</b>، مستقیماً کلاس مورد نظر را انتخاب و نهایی فرمایید. در صورت عدم وجود کلاس مناسب، درخواست جهت تخصیص سالن ویژه به آموزش ارسال خواهد شد.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">جلسه غیبت مورد نظر جهت جبران:</label>
                <select
                  value={makeupForm.replacedSessionNo}
                  onChange={e => setMakeupForm({ ...makeupForm, replacedSessionNo: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                >
                  {currentOffering.sessions.filter(s => s.professorStatus === 'ABSENT' || s.isHeld).map(s => (
                    <option key={s.sessionNo} value={s.sessionNo}>
                      جلسه {faNum(s.sessionNo)} (مورخ {s.sessionDate}) {s.professorStatus === 'ABSENT' ? '🔴 غیبت استاد' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    تاریخ برگزاری (باید بعد از {todayJalali} باشد):
                  </label>
                  <input
                    type="text"
                    value={makeupForm.sessionDate}
                    onChange={e => setMakeupForm({ ...makeupForm, sessionDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">ساعت تشکیل:</label>
                  <select
                    value={makeupForm.sessionTime}
                    onChange={e => setMakeupForm({ ...makeupForm, sessionTime: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                  >
                    <option value="۱۳:۳۰ الی ۱۵:۳۰">۱۳:۳۰ الی ۱۵:۳۰ (شیفت بعدازظهر)</option>
                    <option value="۱۵:۳۰ الی ۱۷:۳۰">۱۵:۳۰ الی ۱۷:۳۰ (شیفت عصر)</option>
                    <option value="۱۷:۳۰ الی ۱۹:۳۰">۱۷:۳۰ الی ۱۹:۳۰ (شیفت غروب)</option>
                    <option value="۰۸:۰۰ الی ۱۰:۰۰ (پنج‌شنبه)">۰۸:۰۰ الی ۱۰:۰۰ (پنج‌شنبه)</option>
                    <option value="۱۰:۰۰ الی ۱۲:۰۰ (پنج‌شنبه)">۱۰:۰۰ الی ۱۲:۰۰ (پنج‌شنبه)</option>
                  </select>
                </div>
              </div>

              {/* Free Classrooms Selector */}
              <div>
                <label className="font-extrabold text-slate-900 block mb-1">
                  🏛️ انتخاب کلاس (لیست واقعی کلاس‌های دانشگاه — هماهنگی نهایی با آموزش):
                </label>
                <select
                  value={selectedRoomOptionId}
                  onChange={e => setSelectedRoomOptionId(Number(e.target.value))}
                  className="w-full border-2 border-indigo-500 rounded-xl p-2.5 font-extrabold bg-indigo-50/50 text-indigo-950"
                >
                  {realRooms.length === 0 && (
                    <option value={0}>🏢 بدون کلاس — درخواست تخصیص از ادارهٔ آموزش</option>
                  )}
                  {realRooms.map(room => (
                    <option key={room.id} value={room.id}>
                      🏫 {room.name} (ظرفیت {faNum(room.capacity)} نفر)
                    </option>
                  ))}
                  {realRooms.length > 0 && (
                    <option value={0}>🏢 سایر / درخواست تخصیص از ادارهٔ آموزش</option>
                  )}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">سرفصل و مبحث تدریس جلسه جبرانی:</label>
                <input
                  type="text"
                  value={makeupForm.topic}
                  onChange={e => setMakeupForm({ ...makeupForm, topic: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">دلیل برگزاری جلسه جبرانی:</label>
                <input
                  type="text"
                  value={makeupForm.reason}
                  onChange={e => setMakeupForm({ ...makeupForm, reason: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={handleCreateMakeupSession}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-800 hover:from-emerald-800 text-white font-extrabold text-xs transition shadow-md"
              >
                {selectedRoomOptionId !== 0 ? '✓ ثبت و تخصیص مستقیم کلاس جبرانی' : '🚀 ارسال به آموزش جهت تخصیص سالن'}
              </button>
              <button
                onClick={() => setShowMakeupModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
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
