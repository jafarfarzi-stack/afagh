#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  Extract legacy educational data from a uems-style SQL Server → TSV
 *  (پیشنیاز اسکریپت migrate-legacy-education.mjs)
 *
 *  این اسکریپت روی ماشینی اجرا می‌شود که SQL Server (دیتابیس قدیمی uems)
 *  دارد و جداول آموزشی را به فایل‌های TSV صادر می‌کند تا روی سرور PG
 *  (که دسترسی شبکه به SQL ندارد) بتوان نگاشت را انجام داد — همان الگوی
 *  fin_export_uems در مهاجرت مالی.
 *
 *  ⚠ فعلاً فقط برای دانشگاه آفاق (uni=1) اجرا شد؛ اما ساختار عمومی است:
 *  هر دانشگاه آینده‌ای با همین مدل DB قابل استفاده است (ستون‌ها ثابت).
 *
 *  اجرا:
 *    node extract-legacy-education.mjs --server "localhost\AFAGH" --user sa --pass "..." --db uems --out D:\farzi\git\backup\edu_export_uems
 * ══════════════════════════════════════════════════════════════════════
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) { const k = raw[i].slice(2); args[k] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true'; }
}
const SERVER = args.server || 'localhost\\AFAGH';
const USER = args.user || 'sa';
const PASS = args.pass || '';
const TRUSTED = args.trusted === 'true';   // --trusted ⇒ ویندوز integrated auth (بدون رمز)
const AUTH = TRUSTED ? ['-E'] : ['-U', USER, '-P', PASS];
const DB = args.db || 'uems';
const OUT = args.out || 'D:\\farzi\\git\\backup\\edu_export_uems';

// sqlcmd در مسیر Client SDK نصب است
const SQLCMD = process.env.SQLCMD || 'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\sqlcmd.exe';

mkdirSync(OUT, { recursive: true });

/** خروجی Unicode از sqlcmd (-u -o) → TSV با سرستون و UTF-8.
 *  بدون -h -1 سرستونها هم میآیند؛ migrate-legacy-education با نام ستون کار میکند،
 *  و -u از تبدیل عنوانهای فارسی به کدپیج DOS (و موژیبیک شدنشان) جلوگیری میکند. */
function run(sql, label) {
  const tmp = join(OUT, label + '.__u16.tmp');
  const r = spawnSync(SQLCMD, [
    '-S', SERVER, ...AUTH, '-d', DB,
    '-Q', sql,
    '-W', '-s', '\t', '-u', '-o', tmp,
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error('FAIL ' + label + '\n' + (r.stderr || r.stdout).slice(0, 2000));
    process.exit(1);
  }
  if (!existsSync(tmp)) { console.error('FAIL ' + label + ': خروجی sqlcmd ساخته نشد'); process.exit(1); }
  const buf = readFileSync(tmp);
  unlinkSync(tmp);
  const file = join(OUT, label + '.tsv');
  const fd = openSync(file, 'w');
  // decode جریانی: فایلهای چندصد مگابایتی را نمیتوان یکجا به رشته تبدیل کرد
  // (محدودیت طول رشتهٔ V8) — خطبهخط مینویسیم.
  const dec = new TextDecoder('utf-16le');
  const CH = 2 * 1024 * 1024; // زوج، تا جفتهای UTF-16 نبرند
  let carry = '', header = null, sepSkipped = false, rows = 0, warned = false;
  const emit = (line, final) => {
    if (!line.trim() && !final) return;
    if (!line.trim()) return;
    if (header === null) {
      header = line.replace(/^\uFEFF/, '');
      writeSync(fd, Buffer.from(header + '\n', 'utf8'));
      return;
    }
    if (!sepSkipped && /^[\s\t]*-[\s\t\-]*$/.test(line)) { sepSkipped = true; return; }
    if (/^Msg\s+\d+,\s*Level\s+\d+/i.test(line) || /Invalid (column|object) name/i.test(line)) {
      if (!warned) { console.error(`  ⚠ ${label}: خطای SQL — ${line.slice(0, 160)}`); warned = true; }
      return;
    }
    writeSync(fd, Buffer.from(line + '\n', 'utf8'));
    rows++;
  };
  for (let off = 0; off < buf.length; off += CH) {
    const text = dec.decode(buf.slice(off, Math.min(off + CH, buf.length)), { stream: true });
    const lines = (carry + text).split(/\r?\n/);
    carry = lines.pop();
    for (const l of lines) emit(l, false);
  }
  for (const l of (carry + dec.decode()).split(/\r?\n/)) emit(l, true);
  closeSync(fd);
  console.log(`  ${label}.tsv  ${rows.toLocaleString('en-US')} rows -> ${file}`);
  return { file, rows };
}

console.log('════ Extract educational uems → TSV ════');
console.log('server:', SERVER, 'db:', DB, 'out:', OUT);

// ── 1) کاتالوگ دروس به تفکیک ورودی ──
console.log('\n[phase 1] lesson catalog by entry');
run(
  `SET NOCOUNT ON;
   SELECT Code, Oldcode, Name, Unit, Th, Oh, Type, Maghta, GroupA, Daneshkadeh,
          Predecessor, CoPredecessor, isActive, Mali_type, StandardCode, LessonKindID,
          SpecialLessonTypeId, MinPassedMark, MinPassedMark2, LessonID, PreRequestPassedUnit
   FROM LT7 ORDER BY Code;`, 'LT7_lessons');

run(
  `SET NOCOUNT ON;
   SELECT ID, Reshte, TraningMethodID, MajorSpecID, EnterTerm FROM CSRUnit ORDER BY ID;`, 'CSRUnit');

run(
  `SET NOCOUNT ON;
   SELECT ID, CSRUnitID, LessonCode, LessonSubType, Predecessor, CoPredecessor, Mali_type,
          DefaultAcceptMarkState, DefaultRejectMarkState, Reshteh, FromEnterTerm, ToEnterTerm
   FROM LT51 ORDER BY ID;`, 'LT51_csr_lesson');

run(
  `SET NOCOUNT ON;
   SELECT ID, CSRUnitID, LessonType, UnitSum FROM CSRUnitLessonTypeSumUnit ORDER BY ID;`, 'CSRUnitLessonTypeSumUnit');

// جداول lookup نوع درس/نمره/مقطع
run(`SET NOCOUNT ON; SELECT * FROM SpecialLessonTypes ORDER BY SpecialLessonTypeId;`, 'SpecialLessonTypes');
run(`SET NOCOUNT ON; SELECT * FROM LessonGradeStatusTitles ORDER BY LessonGradeStatusTitleId;`, 'LessonGradeStatusTitles');
run(`SET NOCOUNT ON; SELECT * FROM TermType ORDER BY Code;`, 'TermType');
run(`SET NOCOUNT ON; SELECT * FROM ParentStudyLevel ORDER BY Code;`, 'ParentStudyLevel');
run(`SET NOCOUNT ON; SELECT * FROM StudyLevelSet ORDER BY Code;`, 'StudyLevelSet');
run(`SET NOCOUNT ON; SELECT * FROM DegreeType ORDER BY Code;`, 'DegreeType');
run(`SET NOCOUNT ON; SELECT Termcode AS Code, Title, StartDate, EndDate, Enroldate, WeekCount, IsHalfTerm FROM TermCodes ORDER BY Termcode;`, 'TermCodes');

// ── 2) دانشجویان ──
console.log('\n[phase 2] students');
run(
  `SET NOCOUNT ON;
   SELECT STNO, OLDSTNO, NAME, SEX, STATUS, TERMCODE, COURSTYPE, MAGHTA, RESHTE, DANESHKADEH,
          NAMEP, DAV, IDNO, BIRTHDATE, MADRAKSTAT, MOADEL, Startdate, Stopdate, TotalAvg,
          PunitCount, SUnitCount, RUnitCount, TotalPoint, FareghMaghta, CurrentMaghta,
          TraningMethodId, MajorSpecID, GroupCode, BranchCode, IsActive, Grade, TDIP
   FROM MAININFO ORDER BY STNO;`, 'MAININFO_students');

run(
  `SET NOCOUNT ON;
   SELECT PersonId, LastName, FirstName, FatherName, GenderId, IdentificationNumber,
          BirthDate, NationalCode, Phone, Mobile, PostalCode, Address, eMail
   FROM People ORDER BY PersonId;`, 'People_identity');

// ── 3) ارائهٔ ترمی دروس ──
console.log('\n[phase 3] term offerings');
run(
  `SET NOCOUNT ON;
   SELECT LT52ID, TermCode, LessonCode, LessonGroup, ExamDate, ExamTime, ExamLong,
          UClass, LClass, CapacityControl, Sex, Status, Daneshkadeh, GroupA, CourseType,
          EntranceTerm, IsEven, StartDate, EndDate, MarkListDeadLine, Objection, BranchCode
   FROM LT52 ORDER BY TermCode, LessonCode, LessonGroup;`, 'LT52_offerings');

run(
  `SET NOCOUNT ON; SELECT * FROM ProfessorStudentGrades ORDER BY ProfessorStudentGradeId;`, 'ProfessorStudentGrades');

// استادِ هر ارائه معلق در TeacherSalary_LessonProfessor
run(
  `SET NOCOUNT ON;
   SELECT TOP 0 1 AS probe FROM TeacherSalary_LessonProfessor;`, 'TeacherSalary_LessonProfessor');

// ── 4) زمان‌بندی هفتگی جلسات ──
console.log('\n[phase 4] weekly sessions');
run(
  `SET NOCOUNT ON;
   SELECT lt55id, TermCode, LessonCode, LessonGroup, DonCode, DayCode, StartTime, EndTime,
          PlaceCode, ExamPlace, daneshkadeh, WeeklyCrossControl
   FROM LT55 ORDER BY TermCode, LessonCode, LessonGroup, DayCode, StartTime;`, 'LT55_sessions');

run(
  `SET NOCOUNT ON;
   SELECT TermCode, LessonCode, LessonGroup, Peresent, PeresentCode FROM TermPeresent ORDER BY TermCode, LessonCode, LessonGroup;`, 'TermPeresent');

// ── 5) نمرات / انتخاب واحد ──
console.log('\n[phase 5] grades & enrollments');
run(
  `SET NOCOUNT ON;
   SELECT Id, Stno, TermCode, LessonCode, OldLessonCode, LessonGroup, Mark, MarkStat, SusCode,
          TheoryMark, OperativeMark, DonMark, DonMarkStat, DonStatus, DonCode, ProfAccept,
          FinallyMarkDate, LessonRegisterStatus, LessonRegisterDate
   FROM SUS ORDER BY TermCode, Stno;`, 'SUS_grades');

run(
  `SET NOCOUNT ON;
   SELECT StudentLessonsHistoryId, SUSID, STNO, TermCode, LessonCode, LessonGroup, Mark, MarkStat,
          SusCode, TheoryMark, OperativeMark, DonMark, DonMarkStat, DonStatus, FinallyMarkDate,
          ProfAccept, HistoryDate, IsCurrent
   FROM StudentLessonsHistory ORDER BY TermCode, STNO;`, 'StudentLessonsHistory');

// جلسات حضور دانشجو
run(
  `SET NOCOUNT ON;
   SELECT StudentTermLessonSessionId, TermLessonSessionId, StudentNumber, StudentId, SessionStatus, ModifyDate
   FROM StudentTermLessonSessions ORDER BY StudentNumber;`, 'StudentTermLessonSessions');

run(
  `SET NOCOUNT ON;
   SELECT TermLessonSessionId, LessonProgramId, ProfessorCode, ProfessorId, DayCode, StartTime, EndTime,
          Title, SessionStatusId, SessionDate, PersianDate, LessonCode, LessonGroup, SessionNo, TermCode, IsActive
   FROM TermLessonSessions ORDER BY TermCode, LessonCode, LessonGroup;`, 'TermLessonSessions');

console.log('\n✅ done — all TSV written to', OUT);