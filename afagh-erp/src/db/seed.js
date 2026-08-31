'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  داده اولیه سامانه جامع آموزشی دانشگاه آفاق
 *  شامل: ساختار سازمانی، آیین‌نامه‌ها (۱۳۹۰ و ۱۴۰۳)، دروس با درخت
 *  پیش‌نیاز، ترم جاری ۱۰۵۱ (مهر ۱۴۰۵)، دانشجویان با سناریوهای واقعی،
 *  مالی، گردش کار PREREQ_WAIVER + COMMISSION_PERMIT با SLA
 *  اجرای مجدد:  npm run reset   (بازسازی کامل دیتابیس)
 * ══════════════════════════════════════════════════════════════════════
 */
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DB_DIR, 'afagh.db');

// در حالت --reset ابتدا فایل دیتابیس حذف و ماژول اتصال از کش پاک می‌شود
if (process.argv.includes('--reset') && fs.existsSync(DB_FILE)) {
  for (const f of ['afagh.db', 'afagh.db-wal', 'afagh.db-shm']) {
    const p = path.join(DB_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.log('⛔ دیتابیس قبلی حذف شد — بازسازی...');
  delete require.cache[require.resolve('./index')];
}

const { db, initSchema, hashPassword } = require('./index');

main();

function main() {
  initSchema();

  const run = (sql, params = []) => db.prepare(sql).run(...params);
  const lastId = () => db.prepare(`SELECT last_insert_rowid() AS id`).get().id;

  console.log('🌱 در حال کاشت داده اولیه...');

  // ─────────────────────────────────────────────
  // نقش‌ها و دسترسی‌ها (RBAC پویا)
  // ─────────────────────────────────────────────
  const roles = [
    ['ADMIN', 'مدیر سیستم', 1], ['STUDENT', 'دانشجو', 1], ['PROFESSOR', 'استاد', 1],
    ['DEP_HEAD', 'مدیر گروه', 1], ['EDU_EXPERT', 'کارشناس آموزش', 1],
    ['VICE_EDU', 'معاون آموزشی', 1], ['FINANCE_EXPERT', 'کارشناس مالی', 1], ['MILITARY_OFFICER', 'کارشناس نظام وظیفه', 1], ['ARCHIVE_EXPERT', 'کارشناس بایگانی', 1], ['APPLICANT', 'متقاضی ثبت‌نام', 1],
    ['PROCTOR', 'مراقب آزمون', 1]
  ];
  for (const [code, title, sys] of roles) run(`INSERT OR IGNORE INTO roles (code, title, isSystem) VALUES (?,?,?)`, [code, title, sys]);

  const perms = [
    ['student.portal', 'دسترسی به پورتال دانشجو'], ['enroll.submit', 'ثبت انتخاب واحد'],
    ['workflow.act', 'اقدام در کارتابل گردش کار'], ['grades.enter', 'ثبت نمره'],
    ['admin.regulations', 'مدیریت آیین‌نامه‌ها'], ['admin.kpi', 'گزارش‌های مدیریتی'],
    ['admin.all', 'دسترسی کامل مدیر سیستم'], ['finance.view', 'مشاهده مالی']
  ];
  for (const [code, title] of perms) run(`INSERT OR IGNORE INTO permissions (code, title) VALUES (?,?)`, [code, title]);

  const permId = c => db.prepare(`SELECT id FROM permissions WHERE code = ?`).get(c).id;
  const roleId = c => db.prepare(`SELECT id FROM roles WHERE code = ?`).get(c).id;
  const grants = {
    ADMIN: perms.map(p => p[0]),
    STUDENT: ['student.portal', 'enroll.submit'],
    PROFESSOR: ['grades.enter'],
    DEP_HEAD: ['workflow.act'],
    EDU_EXPERT: ['workflow.act', 'finance.view'],
    VICE_EDU: ['workflow.act'],
    FINANCE_EXPERT: ['finance.view', 'workflow.act']
  };
  for (const [rc, list] of Object.entries(grants))
    for (const p of list) run(`INSERT OR IGNORE INTO role_permissions (roleId, permissionId) VALUES (?,?)`, [roleId(rc), permId(p)]);

  // ─────────────────────────────────────────────
  // مقاطع، دانشکده، گروه، رشته
  // ─────────────────────────────────────────────
  run(`INSERT INTO degree_level_configs (title, code, defaultPassingGrade, conditionalGpaThreshold, maxUnitsPerTerm) VALUES (?,?,?,?,?)`, ['کارشناسی پیوسته', 'BS', 10.00, 12.00, 20]);
  run(`INSERT INTO degree_level_configs (title, code, defaultPassingGrade, conditionalGpaThreshold, maxUnitsPerTerm) VALUES (?,?,?,?,?)`, ['کارشناسی ارشد', 'MS', 12.00, 14.00, 12]);
  const BS = db.prepare(`SELECT id FROM degree_level_configs WHERE code='BS'`).get().id;
  const MS = db.prepare(`SELECT id FROM degree_level_configs WHERE code='MS'`).get().id;

  run(`INSERT INTO faculties (name) VALUES (?)`, ['دانشکده فنی و مهندسی']);
  const facId = lastId();
  run(`INSERT INTO departments (name, facultyId) VALUES (?,?)`, ['گروه مهندسی کامپیوتر', facId]);
  const depId = lastId();

  run(`INSERT INTO majors (name, degreeLevelId, departmentId, majorCode) VALUES (?,?,?,?)`, ['مهندسی نرم‌افزار', BS, depId, '412']);
  const softMajor = lastId();
  run(`INSERT INTO majors (name, degreeLevelId, departmentId, majorCode) VALUES (?,?,?,?)`, ['مهندسی نرم‌افزار — انتقالی (تکمیل دوره)', BS, depId, '413']);
  const transferMajor = lastId();
  run(`INSERT INTO majors (name, degreeLevelId, departmentId, majorCode) VALUES (?,?,?,?)`, ['مهندسی کامپیوتر – ارشد', MS, depId, '113']);
  const msMajor = lastId();

  // ─────────────────────────────────────────────
  // موتور آیین‌نامه‌ها — دو نسخه (ورودی ۱۳۹۰ و ۱۴۰۳)
  // ─────────────────────────────────────────────
  const rules1390 = {
    regular_term_rules: { minUnits: 12, maxUnits: 20, probationMaxUnits: 14, gpaA_MaxUnits: 24 },
    summer_term_rules: { defaultMaxUnits: 6, graduatingMaxUnits: 8 },
    graduating_term_rules: { canTakeWithProbation: false, maxUnits: 24 },
    quota_overrides: {},
    failed_course_gpa_policy: 'KEEP_ALWAYS', unexcused_absence_policy: 'ZERO',
    probation_gpa_threshold: 12, max_allowed_probations: 3, max_study_semesters: 10, gpaA_threshold: 17
  };
  const rules1403 = {
    regular_term_rules: { minUnits: 12, maxUnits: 20, probationMaxUnits: 14, gpaA_MaxUnits: 24 },
    summer_term_rules: { defaultMaxUnits: 6, graduatingMaxUnits: 8 },
    graduating_term_rules: { canTakeWithProbation: true, maxUnits: 24 },
    quota_overrides: {
      SHAHED_ISARGAR: { summer_term_rules: { defaultMaxUnits: 8 }, probationMaxUnits: 14 }
    },
    failed_course_gpa_policy: 'EXCLUDE_IF_PASSED', unexcused_absence_policy: 'ZERO',
    probation_gpa_threshold: 12, max_allowed_probations: 3, max_study_semesters: 8, gpaA_threshold: 17
  };
  const rulesMS = {
    regular_term_rules: { minUnits: 6, maxUnits: 12, probationMaxUnits: 10, gpaA_MaxUnits: 14 },
    summer_term_rules: { defaultMaxUnits: 4, graduatingMaxUnits: 6 },
    graduating_term_rules: { canTakeWithProbation: false, maxUnits: 14 },
    quota_overrides: {},
    failed_course_gpa_policy: 'EXCLUDE_IF_PASSED', unexcused_absence_policy: 'ZERO',
    probation_gpa_threshold: 14, max_allowed_probations: 2, max_study_semesters: 4, gpaA_threshold: 17.5
  };
  run(`INSERT INTO educational_regulations (title, degreeLevelId, effectiveFromYear, effectiveToYear, rulesConfig) VALUES (?,?,?,?,?)`,
    ['آیین‌نامه آموزشی کارشناسی — ورودی‌های ۱۳۸۶ تا ۱۳۹۵', BS, 1386, 1395, JSON.stringify(rules1390)]);
  const reg1390 = lastId();
  run(`INSERT INTO educational_regulations (title, degreeLevelId, effectiveFromYear, effectiveToYear, rulesConfig) VALUES (?,?,?,?,?)`,
    ['آیین‌نامه یکپارچه کارشناسی — مصوب ۱۴۰۳', BS, 1403, null, JSON.stringify(rules1403)]);
  const reg1403 = lastId();
  run(`INSERT INTO educational_regulations (title, degreeLevelId, effectiveFromYear, effectiveToYear, rulesConfig) VALUES (?,?,?,?,?)`,
    ['آیین‌نامه کارشناسی ارشد — ۱۴۰۳', MS, 1403, null, JSON.stringify(rulesMS)]);
  const regMS = lastId();

  // فرمول شماره دانشجویی پویا: {Year:2}{DegreeCode:1}{MajorCode:3}{Seq:3}
  run(`INSERT INTO student_id_formulas (degreeLevelId, entryYear, formula, currentSequence) VALUES (?,?,?,?)`, [BS, 1403, '{Year:2}{DegreeCode:1}{MajorCode:3}{Seq:3}', 0]);
  run(`INSERT INTO student_id_formulas (degreeLevelId, entryYear, formula, currentSequence) VALUES (?,?,?,?)`, [BS, 1390, '{Year:2}{DegreeCode:1}{MajorCode:3}{Seq:3}', 0]);
  run(`INSERT INTO student_id_formulas (degreeLevelId, entryYear, formula, currentSequence) VALUES (?,?,?,?)`, [MS, 1404, '{Year:2}{DegreeCode:2}{MajorCode:3}{Seq:3}', 0]);

  // ─────────────────────────────────────────────
  // کاربران: ادمین، اساتید، کارشناسان
  // ─────────────────────────────────────────────
  const mkUser = (nc, fn, ln, mobile, pass) => {
    run(`INSERT INTO users (nationalCode, firstName, lastName, mobile, passwordHash) VALUES (?,?,?,?,?)`, [nc, fn, ln, mobile, hashPassword(pass)]);
    return lastId();
  };
  const mkStaff = (userId, code, dep, type, rank, degree) => {
    run(`INSERT INTO staff (userId, staffCode, departmentId, staffType, academicRank, degree) VALUES (?,?,?,?,?,?)`, [userId, code, dep, type, rank, degree]);
    return lastId();
  };

  const uAdmin = mkUser('0000000001', 'مدیر', 'سامانه', '09120000001', '123456');
  run(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`, [uAdmin, roleId('ADMIN')]);

  const uProf1 = mkUser('0011111111', 'محمد', 'رضایی', '09121111111', '123456');
  const prof1 = mkStaff(uProf1, 'F-101', depId, 'هیئت علمی', 'استادیار', 'دکتری');
  const uProf2 = mkUser('0022222222', 'زهرا', 'احمدی', '09122222222', '123456');
  const prof2 = mkStaff(uProf2, 'F-102', depId, 'هیئت علمی', 'دانشیار', 'دکتری');
  const uProf3 = mkUser('0033333333', 'حسین', 'کاظمی', '09123333333', '123456');
  const prof3 = mkStaff(uProf3, 'F-103', depId, 'مدعو', 'مربی', 'فوق لیسانس');
  for (const u of [uProf1, uProf2, uProf3]) run(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`, [u, roleId('PROFESSOR')]);

  const uDepHead = mkUser('0044444444', 'سیدامیر', 'موسوی', '09124444444', '123456');
  const depHead = mkStaff(uDepHead, 'F-201', depId, 'هیئت علمی', 'استاد', 'دکتری');
  run(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`, [uDepHead, roleId('DEP_HEAD')]);

  const uExpert = mkUser('0055555555', 'فاطمه', 'محمدی', '09125555555', '123456');
  const expert = mkStaff(uExpert, 'S-301', depId, 'کارشناس آموزش', null, null);
  run(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`, [uExpert, roleId('EDU_EXPERT')]);

  const uVice = mkUser('0066666666', 'علی', 'نیک‌پور', '09126666666', '123456');
  const vice = mkStaff(uVice, 'S-401', depId, 'معاون آموزشی', null, null);
  run(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`, [uVice, roleId('VICE_EDU')]);

  const uFinance = mkUser('0077777777', 'مریم', 'صادقی', '09127777777', '123456');
  const finance = mkStaff(uFinance, 'S-501', depId, 'کارشناس مالی', null, null);
  run(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`, [uFinance, roleId('FINANCE_EXPERT')]);

  const uMil = mkUser('0088888888', 'ناصر', 'کریمی', '09128888888', '123456');
  const mil = mkStaff(uMil, 'S-601', depId, 'کارشناس نظام وظیفه', null, null);
  run(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`, [uMil, roleId('MILITARY_OFFICER')]);

  const uArch = mkUser('0099999999', 'لیلا', 'آقایی', '09129999999', '123456');
  const arch = mkStaff(uArch, 'S-701', depId, 'کارشناس بایگانی', null, null);
  run(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`, [uArch, roleId('ARCHIVE_EXPERT')]);

  // ─────────────────────────────────────────────
  // دروس + چارت + قوانین پیش‌نیاز (درخت منطقی)
  // ─────────────────────────────────────────────
  const mkCourse = (code, title, th, pr, type, gtype = 'NUMERIC', gpa = 1) => {
    const units = th + pr;
    run(`INSERT INTO courses (code, title, theoreticalUnits, practicalUnits, units, courseType, departmentId, gradingType, affectsGpa) VALUES (?,?,?,?,?,?,?,?,?)`,
      [code, title, th, pr, units, type, depId, gtype, gpa]);
    return lastId();
  };
  const cMath1 = mkCourse('1112101', 'ریاضی عمومی ۱', 3, 0, 'پایه');
  const cMath2 = mkCourse('1112102', 'ریاضی عمومی ۲', 3, 0, 'پایه');
  const cProg1 = mkCourse('1112103', 'مبانی برنامه‌نویسی', 3, 1, 'پایه');
  const cProg2 = mkCourse('1112104', 'برنامه‌نویسی پیشرفته', 3, 0, 'اصلی');
  const cData = mkCourse('1112201', 'ساختمان داده', 3, 0, 'اصلی');
  const cLogic = mkCourse('1112202', 'مفاهیم ابتدایی ریاضیات', 3, 0, 'پایه');
  const cArch = mkCourse('1112301', 'معماری کامپیوتر', 3, 0, 'تخصصی');
  const cDb = mkCourse('1112302', 'پایگاه داده', 3, 0, 'تخصصی');
  const cPhyLab = mkCourse('1112105', 'آزمایشگاه فیزیک', 0, 1, 'عمومی', 'DESCRIPTIVE', 0);
  const cIslamic = mkCourse('1112106', 'اندیشه اسلامی ۱', 2, 0, 'عمومی', 'DESCRIPTIVE', 0);
  const cEng = mkCourse('1112107', 'زبان انگلیسی ۱', 0, 3, 'عمومی', 'NUMERIC', 0);
  const cPE = mkCourse('1112108', 'تربیت بدنی ۱', 0, 2, 'عمومی', 'DESCRIPTIVE', 0);
  const cNet = mkCourse('1112303', 'شبکه‌های کامپیوتری', 3, 0, 'تخصصی');
  const cThesisMS = mkCourse('2112901', 'پایان‌نامه', 6, 0, 'تخصصی');

  // چارت نرم‌افزار (ورودی ۱۴۰۳) — حداقل ۱۴۰ واحد
  run(`INSERT INTO syllabuses (majorId, entryYearStart, entryYearEnd, minTotalUnitsToGraduate) VALUES (?,?,?,?)`, [softMajor, 1403, null, 140]);
  const sylNew = lastId();
  run(`INSERT INTO syllabuses (majorId, entryYearStart, entryYearEnd, minTotalUnitsToGraduate) VALUES (?,?,?,?)`, [softMajor, 1386, 1402, 140]);
  run(`INSERT INTO syllabuses (majorId, entryYearStart, entryYearEnd, minTotalUnitsToGraduate) VALUES (?,?,?,?)`, [transferMajor, 1403, null, 30]);
  const sylOld = lastId();
  run(`INSERT INTO syllabuses (majorId, entryYearStart, entryYearEnd, minTotalUnitsToGraduate) VALUES (?,?,?,?)`, [msMajor, 1404, null, 32]);

  // قوانین پیش‌نیاز — درخت منطقی JSON
  run(`INSERT INTO course_rules (courseId, syllabusId, ruleType, logicTree) VALUES (?,?,?,?)`,
    [cMath2, null, 'PREREQ', JSON.stringify({ operator: 'AND', conditions: [{ course: '1112101' }] })]);
  run(`INSERT INTO course_rules (courseId, syllabusId, ruleType, logicTree) VALUES (?,?,?,?)`,
    [cProg2, null, 'PREREQ', JSON.stringify({ operator: 'AND', conditions: [{ course: '1112103' }] })]);
  // ساختمان داده: (مبانی برنامه‌نویسی AND ریاضی ۱)
  run(`INSERT INTO course_rules (courseId, syllabusId, ruleType, logicTree) VALUES (?,?,?,?)`,
    [cData, null, 'PREREQ', JSON.stringify({ operator: 'AND', conditions: [{ course: '1112103' }, { course: '1112101' }] })]);
  // معماری کامپیوتر: (برنامه‌نویسی پیشرفته OR مفاهیم ریاضیات)
  run(`INSERT INTO course_rules (courseId, syllabusId, ruleType, logicTree) VALUES (?,?,?,?)`,
    [cArch, null, 'PREREQ', JSON.stringify({ operator: 'OR', conditions: [{ course: '1112104' }, { course: '1112202' }] })]);
  run(`INSERT INTO course_rules (courseId, syllabusId, ruleType, logicTree) VALUES (?,?,?,?)`,
    [cDb, null, 'PREREQ', JSON.stringify({ operator: 'AND', conditions: [{ course: '1112201' }] })]);
  run(`INSERT INTO course_rules (courseId, syllabusId, ruleType, logicTree) VALUES (?,?,?,?)`,
    [cNet, null, 'PREREQ', JSON.stringify({ operator: 'AND', conditions: [{ course: '1112301' }] })]);
  // نمونه اورراید نمره قبولی (مطابق طرح: آزمون جامع)
  run(`INSERT INTO course_rules (courseId, syllabusId, ruleType, logicTree, customPassingGrade) VALUES (?,?,?,?,?)`,
    [cData, sylNew, 'PREREQ', JSON.stringify({ operator: 'AND', conditions: [{ course: '1112103' }, { course: '1112101' }] }), 12.00]);

  // ─────────────────────────────────────────────
  // کلاس‌ها و ترم‌ها
  // ─────────────────────────────────────────────
  const mkClass = (name, cap, type) => { run(`INSERT INTO classrooms (name, capacity, roomType) VALUES (?,?,?)`, [name, cap, type]); return lastId(); };
  const room201 = mkClass('اتاق ۲۰۱', 40, 'THEORY');
  const room202 = mkClass('اتاق ۲۰۲', 35, 'THEORY');
  const gym = mkClass('سالن ورزشی', 40, 'GYM');
  const lab101 = mkClass('آزمایشگاه کامپیوتر ۱۰۱', 25, 'LAB');
  const examHall = mkClass('سالن امتحانات مرکزی', 100, 'EXAM');
  // هندسه سالن‌ها (ماژول امتحانات)
  run(`UPDATE classrooms SET buildingName=?, rowsCount=?, colsCount=? WHERE id=?`, ['ساختمان آموزش', 5, 8, room201]);
  run(`UPDATE classrooms SET buildingName=?, rowsCount=?, colsCount=? WHERE id=?`, ['ساختمان آموزش', 5, 7, room202]);
  run(`UPDATE classrooms SET buildingName=?, rowsCount=?, colsCount=? WHERE id=?`, ['ساختمان ورزش', 4, 10, gym]);
  run(`UPDATE classrooms SET buildingName=?, rowsCount=?, colsCount=? WHERE id=?`, ['ساختمان مرکزی', 10, 10, examHall]);

  // ترم قبل: ۱۰۴۲ (بهار ۱۴۰۵) — برای محاسبه معدل ترم قبل
  run(`INSERT INTO academic_terms (termCode, title, isCurrent, isSummer, isEnrollmentOpen, startDate, endDate) VALUES (?,?,0,0,0,?,?)`,
    ['1042', 'نیمسال دوم ۱۴۰۴-۱۴۰۵', '2026-02-01', '2026-06-30']);
  const prevTerm = lastId();
  // ترم جاری: ۱۰۵۱ (مهر ۱۴۰۵)
  run(`INSERT INTO academic_terms (termCode, title, isCurrent, isSummer, isEnrollmentOpen, enrollmentStartDate, enrollmentEndDate, startDate, endDate, gradeEntryDeadline, appealWindowDays, professorAppealSlaDays) VALUES (?,?,1,0,1,?,?,?,?,?,?,?)`,
    ['1051', 'نیمسال اول ۱۴۰۵-۱۴۰۶', '2026-08-20', '2026-09-10', '2026-09-23', '2027-01-20', '2027-02-10', 3, 5]);
  const curTerm = lastId();

  const mkOffering = (termId, courseId, profId, grp, cap, wl) => {
    run(`INSERT INTO course_offerings (termId, courseId, professorId, groupNumber, capacity, waitlistCapacity) VALUES (?,?,?,?,?,?)`,
      [termId, courseId, profId, grp, cap, wl]);
    return lastId();
  };
  const mkSched = (offId, type, day, start, end, room, examDate = null) =>
    run(`INSERT INTO schedules (offeringId, scheduleType, dayOfWeek, examDate, startTime, endTime, roomId) VALUES (?,?,?,?,?,?,?)`,
      [offId, type, day, examDate, start, end, room]);

  // ارائه‌های ترم جاری
  const oMath2 = mkOffering(curTerm, cMath2, prof1, 1, 35, 5);      mkSched(oMath2, 'CLASS', 0, '10:00', '12:00', room201); mkSched(oMath2, 'EXAM', null, '14:00', '16:00', room201, '2026-12-28');
  const oProg2 = mkOffering(curTerm, cProg2, prof1, 1, 35, 5);      mkSched(oProg2, 'CLASS', 0, '08:00', '10:00', room201); mkSched(oProg2, 'EXAM', null, '10:00', '12:00', room201, '2026-12-25');
  const oData = mkOffering(curTerm, cData, prof2, 1, 30, 5);        mkSched(oData, 'CLASS', 1, '08:00', '10:30', room202); mkSched(oData, 'EXAM', null, '10:00', '12:00', room202, '2026-12-25'); // تداخل امتحانی با oProg2!
  const oData2 = mkOffering(curTerm, cData, prof2, 2, 30, 0);       mkSched(oData2, 'CLASS', 2, '08:00', '10:30', room202); mkSched(oData2, 'EXAM', null, '10:00', '12:00', room202, '2026-12-27');
  const oArch = mkOffering(curTerm, cArch, prof3, 1, 30, 0);        mkSched(oArch, 'CLASS', 1, '10:30', '12:00', room201); mkSched(oArch, 'EXAM', null, '14:00', '16:00', room201, '2026-12-30');
  const oPhyLab = mkOffering(curTerm, cPhyLab, prof3, 1, 24, 0);    mkSched(oPhyLab, 'CLASS', 3, '08:00', '10:00', lab101);
  const oIslamic = mkOffering(curTerm, cIslamic, prof2, 1, 50, 10); mkSched(oIslamic, 'CLASS', 2, '10:30', '12:00', room202);
  const oEng = mkOffering(curTerm, cEng, prof3, 1, 40, 5);         mkSched(oEng, 'CLASS', 4, '08:00', '10:00', room202); mkSched(oEng, 'EXAM', null, '10:00', '12:00', room202, '2026-12-29');
  const oPE = mkOffering(curTerm, cPE, prof3, 1, 30, 0);           mkSched(oPE, 'CLASS', 4, '10:00', '12:00', gym);
  const oNet = mkOffering(curTerm, cNet, prof1, 1, 28, 4);          mkSched(oNet, 'CLASS', 3, '10:00', '12:00', room201); mkSched(oNet, 'EXAM', null, '14:00', '16:00', room201, '2027-01-02');
  const oDb = mkOffering(curTerm, cDb, prof2, 1, 28, 4);            mkSched(oDb, 'CLASS', 4, '08:00', '10:30', room202); mkSched(oDb, 'EXAM', null, '10:00', '12:00', room202, '2027-01-04');

  // ─────────────────────────────────────────────
  // دانشجویان — سناریوهای واقعی طرح
  // ─────────────────────────────────────────────
  const genStudentCode = (formulaId, entryYear, degreeCode, majorCode) => {
    const formulaRow = db.prepare(`SELECT * FROM student_id_formulas WHERE id = ?`).get(formulaId);
    const seq = formulaRow.currentSequence + 1;
    run(`UPDATE student_id_formulas SET currentSequence = ? WHERE id = ?`, [seq, formulaRow.id]);
    return formulaRow.formula
      .replace('{Year:2}', String(entryYear % 100))
      .replace('{DegreeCode:1}', degreeCode).replace('{DegreeCode:2}', degreeCode)
      .replace('{MajorCode:3}', String(majorCode).padStart(3, '0'))
      .replace('{Seq:3}', String(seq).padStart(3, '0'));
  };
  const fBS1403 = db.prepare(`SELECT id FROM student_id_formulas WHERE degreeLevelId = ? AND entryYear = 1403`).get(BS).id;
  const fBS1390 = db.prepare(`SELECT id FROM student_id_formulas WHERE degreeLevelId = ? AND entryYear = 1390`).get(BS).id;
  const fMS1404 = db.prepare(`SELECT id FROM student_id_formulas WHERE degreeLevelId = ? AND entryYear = 1404`).get(MS).id;

  const mkStudent = (nc, fn, ln, mobile, major, level, reg, entryYear, quota = 'NORMAL', termNo = 1) => {
    const uid = mkUser(nc, fn, ln, mobile, '123456');
    run(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`, [uid, roleId('STUDENT')]);
    const f = level === BS ? (entryYear >= 1403 ? fBS1403 : fBS1390) : fMS1404;
    const dcode = level === BS ? '1' : '11';
    const mcode = major === softMajor ? '412' : '113';
    const code = genStudentCode(f, entryYear, dcode, mcode);
    run(`INSERT INTO students (userId, studentCode, majorId, degreeLevelId, regulationId, entryYear, quotaType, currentTermNo) VALUES (?,?,?,?,?,?,?,?)`,
      [uid, code, major, level, reg, entryYear, quota, termNo]);
    return { studentId: lastId(), userId: uid, code };
  };

  // ۱) علی — ورودی ۱۴۰۳، عادی، معدل خوب (سقف ۲۰)
  const ali = mkStudent('1010101010', 'علی', 'رضایی', '09331010101', softMajor, BS, reg1403, 1403, 'NORMAL', 5);
  // ۲) مریم — ورودی ۱۴۰۳، معدل الف (سقف ۲۴)
  const maryam = mkStudent('1010101011', 'مریم', 'حسینی', '09331010102', softMajor, BS, reg1403, 1403, 'NORMAL', 5);
  // ۳) رضا — ورودی ۱۴۰۳، مشروطی ترم قبل (سقف ۱۴)
  const reza = mkStudent('1010101012', 'رضا', 'کریمی', '09331010103', softMajor, BS, reg1403, 1403, 'NORMAL', 5);
  // ۴) زینب — ورودی ۱۴۰۳، سهمیه شاهد و ایثارگر
  const zeinab = mkStudent('1010101013', 'زینب', 'موسوی', '09331010104', softMajor, BS, reg1403, 1403, 'SHAHED_ISARGAR', 5);
  // ۵) حسن — ورودی ۱۳۹۰ با آیین‌نامه قدیمی (KEEP_ALWAYS نمره ردی)
  const hasan = mkStudent('1010101014', 'حسن', 'قاسمی', '09331010105', softMajor, BS, reg1390, 1390, 'NORMAL', 12);
  // ۶) سینا — ترم آخر (واحد باقیمانده کم)
  const sina = mkStudent('1010101015', 'سینا', 'نادری', '09331010106', transferMajor, BS, reg1403, 1403, 'NORMAL', 8);
  // ۷) دانشجوی ارشد
  const sarina = mkStudent('1010101016', 'سارینا', 'اهانی', '09331010107', msMajor, MS, regMS, 1404, 'NORMAL', 3);

  // ─────────────────────────────────────────────
  // تاریخچه دروس گذرانده (ترم قبل) + نمرات قطعی
  // ─────────────────────────────────────────────
  const prevOfferings = {};
  const mkPrev = (courseId, profId) => { const o = mkOffering(prevTerm, courseId, profId, 1, 100, 0); prevOfferings[courseId] = o; return o; };
  mkPrev(cMath1, prof1); mkPrev(cProg1, prof1); mkPrev(cLogic, prof2); mkPrev(cIslamic, prof2); mkPrev(cPhyLab, prof3); mkPrev(cMath2, prof1);
  mkPrev(cProg2, prof1); mkPrev(cData, prof2); mkPrev(cArch, prof3); mkPrev(cNet, prof1);

  const setGrade = (studentId, courseId, grade, status = 'FINALIZED') => {
    const off = prevOfferings[courseId];
    run(`INSERT INTO enrollments (studentId, offeringId, status, gradeValue, gradeStatus, hasEvaluated) VALUES (?,?,?,?,?,1)`,
      [studentId, off, 'REGISTERED', grade, status]);
  };
  // علی: ریاضی۱=17.5، مبانی=16، اندیشه=قبول(1)
  setGrade(ali.studentId, cMath1, 17.5); setGrade(ali.studentId, cProg1, 16); setGrade(ali.studentId, cIslamic, 1);
  // مریم: ریاضی۱=19.25، مبانی=18.5، اندیشه=قبول → معدل الف
  setGrade(maryam.studentId, cMath1, 19.25); setGrade(maryam.studentId, cProg1, 18.5); setGrade(maryam.studentId, cIslamic, 1);
  // رضا: ریاضی۱=8 (رد)، مبانی=9.5 (رد) → مشروط
  setGrade(reza.studentId, cMath1, 8); setGrade(reza.studentId, cProg1, 9.5); setGrade(reza.studentId, cIslamic, 1);
  // زینب: ریاضی۱=15، مبانی=14.75
  setGrade(zeinab.studentId, cMath1, 15); setGrade(zeinab.studentId, cProg1, 14.75); setGrade(zeinab.studentId, cIslamic, 1);
  // حسن (ورودی ۱۳۹۰): ۳ ترم تاریخچه — ردی که پاس نشده (KEEP_ALWAYS باید لحاظ شود)
  run(`INSERT INTO academic_terms (termCode, title, isCurrent, isSummer, startDate, endDate) VALUES (?,?,0,0,?,?)`, ['1021', 'نیمسال اول ۱۴۰۲-۱۴۰۳', '2023-09-01', '2024-01-20']);
  const oldTerm = db.prepare(`SELECT id FROM academic_terms WHERE termCode='1021'`).get().id;
  const oldOff1 = mkOffering(oldTerm, cMath1, prof1, 1, 100, 0);
  run(`INSERT INTO enrollments (studentId, offeringId, status, gradeValue, gradeStatus, hasEvaluated) VALUES (?,?,?,?,?,1)`, [hasan.studentId, oldOff1, 'REGISTERED', 7.75, 'FINALIZED']);
  setGrade(hasan.studentId, cLogic, 13); setGrade(hasan.studentId, cPhyLab, 1);
  // و در ترم قبل ریاضی۱ را با ۱۴ پاس کرد → برای آیین‌نامه ۱۳۹۰ هر دو در معدل می‌مانند!
  setGrade(hasan.studentId, cMath1, 14);
  // سینا (ترم آخر): تقریباً همه دروس را پاس کرده — فقط ۶ واحد باقیمانده
  const allBs = [cMath1, cMath2, cProg1, cProg2, cData, cArch, cPhyLab, cIslamic, cNet, cLogic];
  for (const c of allBs) setGrade(sina.studentId, c, 16);
  // ثبت‌نام‌های ترم جاری — برای دموی «ثبت نمره استاد + OTP + اعتراض»
  const curEnroll = (student, offeringId, units) => {
    run(`INSERT INTO enrollments (studentId, offeringId, status, registeredAt) VALUES (?,?, 'REGISTERED', CURRENT_TIMESTAMP)`, [student.studentId, offeringId]);
    run(`UPDATE course_offerings SET enrolledCount = enrolledCount + 1 WHERE id = ?`, [offeringId]);
    run(`INSERT INTO student_ledger (studentId, termId, transactionType, amount, description) VALUES (?,?, 'DEBIT', ?, ?)`,
      [student.studentId, curTerm, 950000 * units, 'هزینه متغیر درس (انتخاب واحد)']);
  };
  curEnroll(ali, oProg2, 3); curEnroll(ali, oMath2, 3); curEnroll(ali, oIslamic, 2);
  curEnroll(maryam, oProg2, 3); curEnroll(maryam, oData2, 3); curEnroll(maryam, oArch, 3);
  curEnroll(reza, oEng, 3); curEnroll(reza, oPE, 2); curEnroll(reza, oIslamic, 2);
  curEnroll(hasan, oProg2, 3); curEnroll(hasan, oMath2, 3);
  curEnroll(sina, oNet, 3); curEnroll(sina, oDb, 3);
  // سارینا (ارشد): پایان‌نامه در ترم جاری ارائه شده — کمیتهٔ سه‌نقشی (راهنما/مشاور/داور — سند §۲۸۰۷)
  const oThesis = mkOffering(curTerm, cThesisMS, prof2, 1, 5, 0);
  run(`UPDATE course_offerings SET offeringType = 'THESIS' WHERE id = ?`, [oThesis]);
  run(`INSERT INTO offering_professors (offeringId, staffId, role, sharePercentage) VALUES (?,?, 'REVIEWER', '0.00')`, [oThesis, prof1]);   // داور: مقطوع هر جلسه دفاع
  run(`INSERT INTO offering_professors (offeringId, staffId, role, sharePercentage) VALUES (?,?, 'ADVISOR', '40.00')`, [oThesis, prof3]);  // مشاور: ضریب ۰.۵ واحد
  const directEnroll = (stu, offeringId, dr = 0) => {
    const sid = stu && typeof stu === 'object' ? stu.studentId : stu;
    run(`INSERT INTO enrollments (studentId, offeringId, status, isDirectedReading) VALUES (?,?,'REGISTERED',?)`, [sid, offeringId, dr]);
    run(`UPDATE course_offerings SET enrolledCount = enrolledCount + 1 WHERE id = ?`, [offeringId]);
  };
  directEnroll(sarina, oThesis);

  // معرفی به استاد (ممتحن: کاظمی) و کارآموزی (سرپرست: احمدی) — فرمول‌ساز مالی سند §۲۷۸۴
  const cDR = mkCourse('1112401', 'مطالعه فردی (معرفی به استاد)', 3, 0, 'اختیاری');
  const cInt = mkCourse('1112402', 'کارآموزی', 0, 2, 'اصلی');
  const oDR = mkOffering(curTerm, cDR, prof3, 1, 1, 0);
  run(`UPDATE course_offerings SET offeringType='DIRECTED_READING', customGradeDeadline = date('now','+20 days') WHERE id = ?`, [oDR]);
  run(`INSERT INTO offering_professors (offeringId, staffId, role, sharePercentage) VALUES (?,?, 'EXAMINER', '100.00')`, [oDR, prof3]);
  directEnroll(maryam, oDR, 1);
  const oInt = mkOffering(curTerm, cInt, prof2, 1, 10, 0);
  run(`UPDATE course_offerings SET offeringType='INTERNSHIP' WHERE id = ?`, [oInt]);
  run(`INSERT INTO offering_professors (offeringId, staffId, role, sharePercentage) VALUES (?,?, 'SUPERVISOR', '100.00')`, [oInt, prof2]);
  directEnroll(hasan, oInt); directEnroll(sina, oInt); directEnroll(reza, oInt);

  // ─────────────────────────────────────────────
  // ماژول حضور و غیاب: جلسات، تردد گیت، قراردادهای الکترونیکی
  // ─────────────────────────────────────────────
  const pad2 = n => String(n).padStart(2, '0');
  const dstr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const tstr = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const NOW = new Date();
  const addMinutes = (base, m) => new Date(base.getTime() + m * 60000);
  const sat = weeks => { const d = new Date(NOW); d.setDate(d.getDate() - ((d.getDay() + 1) % 7) - weeks * 7); return dstr(d); }; // شنبه‌های گذشته

  const addSession = (offeringId, date, st, et, no, status = 'SCHEDULED') => {
    run(`INSERT INTO class_sessions (offeringId, sessionDate, startTime, endTime, status, sessionNo) VALUES (?,?,?,?,?,?)`,
      [offeringId, date, st, et, status, no]);
    return lastId();
  };
  const markHeld = (sessionId, staffId, method, flag = 'VALID') => {
    run(`UPDATE class_sessions SET status='HELD' WHERE id=?`, [sessionId]);
    run(`INSERT INTO professor_class_attendance (sessionId, staffId, verificationMethod, status) VALUES (?,?,?,?)`,
      [sessionId, staffId, method, flag]);
  };
  const stuAtt = (sessionId, students, absentIdx = -1) => {
    students.forEach((stu, i) => {
      const eid = db.prepare(`SELECT e.id FROM enrollments e WHERE e.studentId=? AND e.offeringId=? AND e.status='REGISTERED'`).get(stu.studentId, stu.off);
      if (eid) run(`INSERT OR IGNORE INTO student_class_attendance (sessionId, enrollmentId, status) VALUES (?,?,?)`, [sessionId, eid.id, i === absentIdx ? 'ABSENT' : 'PRESENT']);
    });
  };

  // سه شنبه‌گذشته (شنبه‌های ۱۳، ۲۰، ۲۷ تیرماه) به‌علاوه امروز — برای دموی زنده
  const prog2Stu = [{ studentId: ali.studentId, off: oProg2 }, { studentId: maryam.studentId, off: oProg2 }, { studentId: hasan.studentId, off: oProg2 }];
  const math2Stu = [{ studentId: ali.studentId, off: oMath2 }, { studentId: hasan.studentId, off: oMath2 }];
  for (let w = 3; w >= 1; w--) {
    const d = sat(w);
    const sp = addSession(oProg2, d, '08:00', '10:00', 4 - w);
    markHeld(sp, prof1, 'ROLL_CALL');
    stuAtt(sp, prog2Stu, w === 2 ? 1 : -1); // مریم یک غیبت در جلسه ۲
    const sm = addSession(oMath2, d, '10:00', '12:00', 4 - w);
    // جلسه ۲ ریاضی: ثبت خارج از ساعت کلاس → پرچم مشکوک (داشبورد تقلب)
    markHeld(sm, prof1, 'ROLL_CALL', w === 2 ? 'FLAGGED_SUSPICIOUS' : 'VALID');
    stuAtt(sm, math2Stu);
  }
  // جلسه امروز (زنده): ریاضی۲ بعد از برنامه‌نویسی — پشت سر هم برای دموی Chain Matching
  const sProg2Today = addSession(oProg2, dstr(NOW), tstr(addMinutes(NOW, -40)), tstr(addMinutes(NOW, 80)), 4);
  const sMath2Today = addSession(oMath2, dstr(NOW), tstr(addMinutes(NOW, 80)), tstr(addMinutes(NOW, 200)), 4);
  // آزمایشگاه فیزیک (پنجشنبه آینده) — استاد کاظمی قرارداد را امضا نکرده → دموی گلوگاه
  const nextThu = new Date(NOW); nextThu.setDate(nextThu.getDate() + ((4 - nextThu.getDay() + 7) % 7 || 7));
  addSession(oPhyLab, dstr(nextThu), '08:00', '10:00', 1);

  // پانچ گیت امروز: استاد رضایی صبح امروز (گیت ورودی اصلی)
  run(`INSERT INTO physical_access_logs (staffId, punchTime, deviceLocation) VALUES (?,?,?)`, [prof1, dstr(addMinutes(NOW, -180)) + ' ' + tstr(addMinutes(NOW, -180)) + ':00', 'گیت ورودی اصلی']);

  // قالب اسناد + تنظیمات شبکه داخلی دانشگاه (حصار IP)
  run(`INSERT OR IGNORE INTO document_templates (code, title, templateText) VALUES (?,?,?)`, ['CONTRACT', 'قرارداد تدریس',
    'قرارداد تدریس {term}\nاستاد گرامی {firstName} {lastName}\nدروس محول‌شده: {courses}\nنرخ محاسبه حق‌التدریس بر اساس رتبه علمی و ضرایب مصوب دانشگاه آفاق اعمال می‌گردد. امضای الکترونیکی این سند با کد تایید پیامکی دارای اعتبار قانونی و غیرقابل انکار (Non-repudiation) است.']);
  run(`INSERT OR IGNORE INTO document_templates (code, title, templateText) VALUES (?,?,?)`, ['APPOINTMENT', 'ابلاغیه تدریس',
    'ابلاغیه تدریس {term}\nاستاد {firstName} {lastName} موظف است دروس {courses} را طبق برنامه هفتگی ارائه نماید.']);
  run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('CAMPUS_IP_RANGES', ?)`,
    [JSON.stringify({ ranges: ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.2', '172.30.', '172.31.', '192.168.', '127.', '::1', 'localhost'], note: 'حصار شبکه: ثبت حضور و غیاب فقط از شبکه داخلی دانشگاه' })]);
  run(`INSERT OR IGNORE INTO integrations_config (serviceName, baseUrl, authType, authCredentials, timeoutSeconds, isActive) VALUES (?,?,?,?,?,1)`,
    ['FINGERPRINT_GATE', 'http://gate-middleware.local/api', 'API_KEY', 'gate-demo-token', 10]);

  // قراردادهای ترم: رضایی/احمدی امضاشده — کاظمی در انتظار (گلوگاه حضور و غیاب)
  const mkContract = (staffId, userRow, signed) => {
    const courses = db.prepare(`SELECT GROUP_CONCAT(c.title, '، ') g FROM course_offerings o JOIN courses c ON c.id=o.courseId WHERE o.termId=? AND o.professorId=?`).get(curTerm, staffId).g || '—';
    const tpl = db.prepare(`SELECT templateText FROM document_templates WHERE code='CONTRACT'`).get().templateText;
    const snap = tpl.replace('{term}', 'نیمسال اول ۱۴۰۵-۱۴۰۶').replace('{firstName}', userRow.fn).replace('{lastName}', userRow.ln).replace('{courses}', courses);
    const crypto = require('crypto');
    const h = crypto.createHash('sha256').update(snap).digest('hex');
    run(`INSERT INTO electronic_documents (staffId, termId, docType, title, documentSnapshot, documentHash, signatureStatus) VALUES (?,?,?,?,?,?,?)`,
      [staffId, curTerm, 'CONTRACT', 'قرارداد تدریس — نیمسال اول ۱۴۰۵', snap, h, signed ? 'SIGNED' : 'PENDING']);
    if (signed) run(`INSERT INTO document_signatures (documentId, staffId, signedAt, ipAddress, userAgent, otpUsed) VALUES (?,?,?,?,?,?)`,
      [lastId(), staffId, dstr(NOW) + ' 08:10:00', '10.20.3.11', 'AfaghPortal/Chrome', '·····']);
  };
  mkContract(prof1, { fn: 'محمد', ln: 'رضایی' }, true);
  mkContract(prof2, { fn: 'زهرا', ln: 'احمدی' }, true);
  mkContract(prof3, { fn: 'حسین', ln: 'کاظمی' }, false);

  // ─────────────────────────────────────────────
  // مالی: قواعد ترم + دفتر کل + تسویه علی‌الحساب
  // ─────────────────────────────────────────────
  run(`INSERT INTO term_financial_rules (termId, degreeLevelId, fixedTuition, perUnitTuition, advancePaymentRequired) VALUES (?,?,?,?,?)`,
    [curTerm, BS, 4500000, 950000, 8000000]);
  run(`INSERT INTO term_financial_rules (termId, degreeLevelId, fixedTuition, perUnitTuition, advancePaymentRequired) VALUES (?,?,?,?,?)`,
    [curTerm, MS, 6500000, 1200000, 11000000]);

  const payAdvance = (studentId, level) => {
    const rule = db.prepare(`SELECT * FROM term_financial_rules WHERE termId = ? AND degreeLevelId = ?`).get(curTerm, level);
    run(`INSERT INTO student_ledger (studentId, termId, transactionType, amount, description) VALUES (?,?, 'CREDIT', ?, ?)`,
      [studentId, curTerm, rule.advancePaymentRequired, 'پرداخت علی‌الحساب انتخاب واحد (درگاه بانکی — شبیه‌سازی)']);
    run(`INSERT INTO student_ledger (studentId, termId, transactionType, amount, description) VALUES (?,?, 'DEBIT', ?, ?)`,
      [studentId, curTerm, rule.fixedTuition, 'شهریه ثابت ترم اول ۱۴۰۵']);
    run(`INSERT INTO financial_clearances (studentId, termId, isCleared, clearedAt) VALUES (?,?,1, CURRENT_TIMESTAMP)`, [studentId, curTerm]);
  };
  payAdvance(ali.studentId, BS); payAdvance(maryam.studentId, BS); payAdvance(reza.studentId, BS);
  payAdvance(zeinab.studentId, BS); payAdvance(hasan.studentId, BS); payAdvance(sina.studentId, BS); payAdvance(sarina.studentId, MS);

  // ─────────────────────────────────────────────
  // نظام وظیفه / سامانه سخا — سه صندوق کارشناس (سند §۲۵۵۸–۲۷۴۰)
  // ─────────────────────────────────────────────
  run(`INSERT OR IGNORE INTO integrations_config (serviceName, baseUrl, authType, authCredentials, timeoutSeconds, isActive) VALUES (?,?,?,?,?,1)`,
    ['SAKHA_API', 'https://sakha.naja.ir/api', 'API_KEY', JSON.stringify({ token: 'sakha-demo-token' }), 15]);
  const amir = mkStudent('1010101020', 'امیر', 'یوسفی', '09331010200', softMajor, BS, reg1403, 1405, 'NORMAL', 1);
  payAdvance(amir.studentId, BS);   // واریز شهریه علی‌الحساب = اولین فیلتر نیت واقعی (سند §۲۶۴۳)
  const karim = mkStudent('1010101021', 'کریم', 'عباسی', '09331010201', softMajor, BS, reg1390, 1402, 'NORMAL', 5);
  run(`UPDATE students SET status='WITHDRAWN' WHERE id=?`, [karim.studentId]);  // انصراف ← پیشنهاد ابطال (سند §۲۶۵۵)
  const d = n => { const t = new Date(Date.now() + n * 86400000); return t.toISOString().slice(0, 10); };
  const mkMil = (sid, status, expiry, sakhaStatus = null, extra = null) => {
    run(`INSERT INTO military_service_records (studentId, status, exemptionStartDate, exemptionExpiry, sakhaStatus, pendingExtraSemesters, lastSyncAt)
         VALUES (?,?,?,?,?,?, CURRENT_TIMESTAMP)`, [sid, status, status === 'EDUCATIONAL_EXEMPTION' ? d(-400) : null, expiry, sakhaStatus, extra]);
  };
  mkMil(ali.studentId, 'EDUCATIONAL_EXEMPTION', d(220));            // سالم
  mkMil(reza.studentId, 'EDUCATIONAL_EXEMPTION', d(200));           // سالم
  mkMil(hasan.studentId, 'EDUCATIONAL_EXEMPTION', d(20));           // 🔴 شمارشگر قرمز (سند §۲۷۳۷)
  mkMil(sina.studentId, 'EDUCATIONAL_EXEMPTION', d(45), 'PENDING_EXTENSION_REVIEW', 1);  // 📥 صندوق ۲: رای کمیسیون
  mkMil(amir.studentId, 'PENDING_UNIVERSITY_APPROVAL', null);       // 📥 صندوق ۱: ثبت‌نام جدید (پرداخت کرده)
  mkMil(karim.studentId, 'EDUCATIONAL_EXEMPTION', d(300));          // 📥 صندوق ۳: انصراف ← ابطال

  // ─────────────────────────────────────────────
  // بایگانی الکترونیک + ثبت‌نام غیرحضوری + e-KYC (سند §۲۴۱۵–۲۵۵۶)
  // ─────────────────────────────────────────────
  for (const svc of [['CIVIL_REGISTRY', 'ثبت احوال'], ['SHAHKAR', 'شاهکار'], ['EDU_CERTIFICATION', 'تاییدیه تحصیلی آموزش‌وپرورش']])
    run(`INSERT OR IGNORE INTO integrations_config (serviceName, baseUrl, authType, authCredentials, timeoutSeconds, isActive) VALUES (?,?,?,?,10,1)`,
      [svc[0], 'https://' + svc[0].toLowerCase() + '.gov.ir/api', 'API_KEY', JSON.stringify({ token: svc[0].toLowerCase() + '-demo-token' })]);

  // پوشه‌های زونکن دیجیتال + RBAC پوشه‌ای (سند §۲۴۸۳: مالی فقط مالی)
  const mkCat = (title, scope, roles) => { run(`INSERT INTO document_categories (title, scope, accessRoles) VALUES (?,?,?)`, [title, scope, JSON.stringify(roles)]); return lastId(); };
  const cIdentity = mkCat('هویتی', 'STUDENT', ['ARCHIVE_EXPERT', 'EDU_EXPERT', 'ADMIN', 'MILITARY_OFFICER']);
  const cEdu = mkCat('تحصیلی', 'STUDENT', ['ARCHIVE_EXPERT', 'EDU_EXPERT', 'ADMIN']);
  const cFin = mkCat('اداری/مالی', 'STUDENT', ['ARCHIVE_EXPERT', 'FINANCE_EXPERT', 'ADMIN']);
  const cMed = mkCat('انضباطی/پزشکی', 'STUDENT', ['ARCHIVE_EXPERT', 'ADMIN']);
  const mkType = (cat, code, title, aud, req, ver) => { run(`INSERT INTO document_types (categoryId, code, title, targetAudience, isRequired, needsVerification) VALUES (?,?,?,?,?,?)`, [cat, code, title, aud, req, ver]); return lastId(); };
  mkType(cIdentity, 'NATIONAL_CARD', 'کارت ملی', 'BOTH', 1, 1);
  mkType(cIdentity, 'BIRTH_CERT', 'شناسنامه', 'BOTH', 1, 1);
  mkType(cIdentity, 'PERSONNEL_PHOTO', 'عکس پرسنلی', 'BOTH', 1, 0);
  mkType(cEdu, 'DIPLOMA', 'تاییدیه تحصیلی دیپلم', 'STUDENT', 1, 1);
  mkType(cEdu, 'TRANSCRIPT', 'ریزنمرات مقاطع قبل', 'STUDENT', 0, 1);
  mkType(cFin, 'PROMISSORY', 'سفته', 'BOTH', 0, 1);
  mkType(cMed, 'MEDICAL_CERT', 'گواهی پزشکی', 'STUDENT', 0, 1);

  // متقاضیان دمو (حساب موقت: رمز = کد ملی — سند §۲۴۲۷)
  const upDir = path.join(DB_DIR, 'uploads', 'onboard');
  fs.mkdirSync(upDir, { recursive: true });
  const mkSvg = (t, c) => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="${c}"/><text x="50%" y="46%" text-anchor="middle" font-size="17" fill="#fff" font-family="Tahoma">${t}</text><text x="50%" y="60%" text-anchor="middle" font-size="11" fill="#e2e8f0">سند اسکن‌شده — Object Storage</text></svg>`;
  const applicants = [
    { nc: '1212123451', fn: 'یاسر', ln: 'امینی', mob: '09331212121', score: 94.5, ai: 'AUTO_APPROVED', docs: 'VERIFIED', paid: 9500000, st: 'READY' },
    { nc: '1212123452', fn: 'مهدی', ln: 'رحیمی', mob: '09331212122', score: 78.2, ai: 'MANUAL_REVIEW', docs: 'PENDING', paid: 9500000, st: 'KYC_RUN' },
    { nc: '1212123453', fn: 'سعید', ln: 'نجفی', mob: '09331212123', score: 58.0, ai: 'REJECTED', docs: 'PENDING', paid: 0, st: 'DOSSIER_SUBMITTED' }
  ];
  const chals = ['سر خود را به سمت راست بچرخانید', 'اعداد ۴-۹-۲ را با صدای بلند بخوانید', 'چشم‌های خود را پلک بزنید'];
  for (const a of applicants) {
    const uid = mkUser(a.nc, a.fn, a.ln, a.mob, a.nc);
    run(`INSERT INTO user_roles (userId, roleId) VALUES (?,?)`, [uid, roleId('APPLICANT')]);
    run(`INSERT INTO admissions_staging (nationalCode, userId, fullName, mobile, mappedMajorId, entryYear, degreeLevelId, status, onboardingStatus, paidAdvance, paidAmount, profileJson)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [a.nc, uid, a.fn + ' ' + a.ln, a.mob, softMajor, 1405, BS, 'imported', a.st, a.paid ? 1 : 0, a.paid,
       JSON.stringify({ address: 'تهران، خیابان نمونه', fatherName: 'محمد', shahkar: 'VERIFIED', civilRegistry: 'VERIFIED' })]);
    const sid = lastId();
    // مدارک در Object Storage (دمو: data/uploads) + متادیتا در DB (سند §۲۴۷۰)
    const docSet = a.docs === 'VERIFIED'
      ? [['NATIONAL_CARD', cIdentity, '#0f766e'], ['BIRTH_CERT', cIdentity, '#155e75'], ['PERSONNEL_PHOTO', cIdentity, '#0e7490'], ['DIPLOMA', cEdu, '#7c3aed']]
      : [['NATIONAL_CARD', cIdentity, '#0f766e'], ['DIPLOMA', cEdu, '#7c3aed']];
    for (const [code, cat, color] of docSet) {
      const fname = `staging-${sid}-${code}.svg`;
      fs.writeFileSync(path.join(upDir, fname), mkSvg(a.fn + ' ' + a.ln + ' — ' + (code === 'NATIONAL_CARD' ? 'کارت ملی' : 'دیپلم'), color));
      run(`INSERT INTO student_documents (personUserId, categoryId, typeId, fileName, fileUrl, mimeType, verificationStatus)
           VALUES (?,?,?,?,?,?,?)`,
        [uid, cat, db.prepare('SELECT id FROM document_types WHERE code=?').get(code).id, fname, 'onboard/' + fname, 'image/svg+xml', a.docs]);
    }
    run(`INSERT INTO kyc_verifications (userId, civilRegistryStatus, shahkarStatus, fetchedCivilData, livenessVideoUrl, livenessChallenge, faceMatchScore, aiVerificationStatus, ipAddress, deviceInfo, completedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
      [uid, 'VERIFIED', 'VERIFIED', JSON.stringify({ firstName: a.fn, lastName: a.ln, alive: true }), 'onboard/liveness-' + a.nc + '.svg', chals[sid % 3], a.score, a.ai, '5.112.40.10', 'Chrome/Android — Samsung', ]);
    const urow = db.prepare('SELECT id FROM users WHERE id=?').get(uid);
    run(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`, [uid, 'ONBOARDING_WELCOME', JSON.stringify({ text: 'به دانشگاه آفاق خوش آمدید! حساب موقت شما با کد ملی «' + a.nc + '» ساخته شد (رمز ورود = کد ملی). برای تکمیل ثبت‌نام غیرحضوری و دریافت شماره دانشجویی، مدارک خود را بارگذاری و شهریهٔ علی‌الحساب را پرداخت کنید.', vars: { name: a.fn } })]);
  }
  // ⚠ دانشجوی بدهکار نمونه: تسویه زینب را برمی‌داریم تا گیت مالی دیده شود
  run(`DELETE FROM financial_clearances WHERE studentId = ?`, [zeinab.studentId]);
  run(`UPDATE student_ledger SET amount = 2000000 WHERE studentId = ? AND transactionType = 'CREDIT'`, [zeinab.studentId]);

  // ─────────────────────────────────────────────
  // فرآیندهای گردش کار (BPM) — کاملاً داده‌محور
  // ─────────────────────────────────────────────
  // ۱) مجوز اخذ درس بدون پیش‌نیاز / با تداخل (شورای آموزشی)
  run(`INSERT INTO process_definitions (code, title, formSchema, isActive) VALUES (?,?,?,1)`,
    ['PREREQ_WAIVER', 'مجوز اخذ درس بدون پیش‌نیاز / تداخل امتحانی', JSON.stringify([
      { key: 'offeringTitle', label: 'درس', type: 'text' },
      { key: 'reasons', label: 'دلایل', type: 'textarea' }
    ])]);
  const p1 = lastId();
  run(`INSERT INTO process_steps (processId, stepOrder, title, stepType, roleCode, slaHours, timeoutAction) VALUES (?,?,?,?,?,?,?)`,
    [p1, 1, 'بررسی مدیر گروه آموزشی', 'USER', 'DEP_HEAD', 12, 'AUTO_REJECT']);
  const s1 = lastId();
  run(`INSERT INTO process_steps (processId, stepOrder, title, stepType, roleCode, slaHours, timeoutAction) VALUES (?,?,?,?,?,?,?)`,
    [p1, 2, 'تایید نهایی معاون آموزشی', 'USER', 'VICE_EDU', 24, 'ESCALATE']);
  const s2 = lastId();
  run(`INSERT INTO process_steps (processId, stepOrder, title, stepType, roleCode, slaHours, timeoutAction) VALUES (?,?,?,?,?,?,?)`,
    [p1, 3, 'ارجاع به مدیر سیستم (Escalation)', 'USER', 'ADMIN', 24, 'NOTIFY']);
  const s3 = lastId();
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,0)`, [s1, 'APPROVE', s2]);
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,1)`, [s1, 'REJECT', null]);
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,1)`, [s2, 'APPROVE', null]);
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,1)`, [s2, 'REJECT', null]);
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,1)`, [s3, 'APPROVE', null]);
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,1)`, [s3, 'REJECT', null]);

  // ۲) مجوز ادامه تحصیل — کمیسیون موارد خاص (سجاد)
  run(`INSERT INTO process_definitions (code, title, formSchema, isActive) VALUES (?,?,?,1)`,
    ['COMMISSION_PERMIT', 'مجوز ادامه تحصیل — کمیسیون موارد خاص (سجاد)', JSON.stringify([
      { key: 'reason', label: 'دلیل مسدودی', type: 'text' },
      { key: 'sajadCode', label: 'کد رهگیری سامانه سجاد', type: 'text' },
      { key: 'extraSemesters', label: 'سنوات ارفاقی اعطاشده', type: 'number' }
    ])]);
  const p2 = lastId();
  run(`INSERT INTO process_steps (processId, stepOrder, title, stepType, roleCode, slaHours, timeoutAction) VALUES (?,?,?,?,?,?,?)`,
    [p2, 1, 'بررسی کارشناس آموزش (اصالت نامه سجاد)', 'USER', 'EDU_EXPERT', 48, 'NOTIFY']);
  const c1 = lastId();
  run(`INSERT INTO process_steps (processId, stepOrder, title, stepType, roleCode, slaHours, timeoutAction) VALUES (?,?,?,?,?,?,?)`,
    [p2, 2, 'تایید معاون آموزشی و اعمال رای', 'USER', 'VICE_EDU', 24, 'ESCALATE']);
  const c2 = lastId();
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,0)`, [c1, 'APPROVE', c2]);
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,1)`, [c1, 'REJECT', null]);
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,1)`, [c2, 'APPROVE', null]);
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,1)`, [c2, 'REJECT', null]);

  // ۳) غیبت موجه امتحان (گواهی پزشکی — مهلت ۴۸ ساعته)
  run(`INSERT INTO process_definitions (code, title, formSchema, isActive) VALUES (?,?,?,1)`,
    ['EXCUSED_ABSENCE', 'غیبت موجه امتحان (ارائه گواهی)', JSON.stringify([
      { key: 'course', label: 'درس', type: 'text' },
      { key: 'reason', label: 'شرح و پیوست گواهی', type: 'textarea' }
    ])]);
  const p3 = lastId();
  run(`INSERT INTO process_steps (processId, stepOrder, title, stepType, roleCode, slaHours, timeoutAction) VALUES (?,?,?,?,?,?,?)`,
    [p3, 1, 'بررسی کارشناس آموزش (اصالت گواهی)', 'USER', 'EDU_EXPERT', 48, 'AUTO_REJECT']);
  const e1 = lastId();
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,1)`, [e1, 'APPROVE', null]);
  run(`INSERT INTO process_transitions (stepId, action, toStepId, isFinal) VALUES (?,?,?,1)`, [e1, 'REJECT', null]);

  // نمونه اتصال خارجی (ایرانداک) — مطابق طرح Integration Schema
  run(`INSERT INTO integrations_config (serviceName, baseUrl, authType, authCredentials, timeoutSeconds, isActive) VALUES (?,?,?,?,?,?)`,
    ['IRANDOC_SIMILARITY', 'https://api.irandoc.ac.ir/v1', 'BEARER', 'eyJ...(ENCRYPTED)', 10, 0]);

  // ─────────────────────────────────────────────
  // قالب‌های پیام (موتور قالب‌ساز — متن‌ها قابل ویرایش توسط مدیر)
  // ─────────────────────────────────────────────
  const tpls = [
    ['WAITLIST_PROMOTED', 'SMS', 'دانشجوی گرامی {firstName} {lastName}، ظرفیت درس {course} آزاد شد و ثبت شما قطعی گردید.'],
    ['COUNCIL_APPROVED', 'SMS', 'دانشجوی گرامی {firstName}، درخواست شورای آموزشی شما برای درس {course} تایید شد.'],
    ['COUNCIL_REJECTED', 'SMS', 'دانشجوی گرامی {firstName}، درخواست شورای آموزشی شما متاسفانه رد شد. جهت توضیحات به آموزش مراجعه کنید.'],
    ['COMMISSION_APPROVED', 'SMS', 'دانشجوی گرامی {firstName}، رای کمیسیون موارد خاص ثبت شد و پنل انتخاب واحد شما بازگشت.'],
    ['EXAM_ABSENCE', 'SMS', 'دانشجوی گرامی {firstName} {lastName}، غیبت شما در امتحان درس {courseName} ثبت گردید. جهت ارائه گواهی موجه تا {deadlineDate} فرصت دارید.'],
    ['SLA_WARNING', 'SMS', 'یادآوری: پرونده آموزشی شما در انتظار اقدام کارشناس است و در آستانه انقضای مهلت قرار دارد.'],
    ['PROFESSOR_SESSION_ABSENT', 'SMS', 'استاد {professor}، جلسه {course} در تاریخ {date} به‌عنوان غیبت ثبت شد. جهت تعیین کلاس جبرانی با اداره آموزش هماهنگ کنید.'],
    ['SEATING_READY', 'SMS', 'دانشجوی گرامی {firstName}، شماره صندلی امتحانات شما تعیین شد. کارت ورود به جلسه را از پنل خود دریافت کنید.'],
    ['EXCUSE_ACCEPTED', 'SMS', 'دانشجوی گرامی {firstName}، گواهی غیبت شما از درس {course} موجه تشخیص داده شد و درس از کارنامه حذف گردید.'],
    ['EXCUSE_REJECTED', 'SMS', 'دانشجوی گرامی {firstName}، گواهی غیبت شما از درس {course} موجه تشخیص داده نشد؛ نمره صفر طبق آیین‌نامه ثبت می‌شود.']
  ];
  for (const [code, ch, txt] of tpls)
    run(`INSERT OR IGNORE INTO notification_templates (eventCode, channel, templateText, isActive) VALUES (?,?,?,1)`, [code, ch, txt]);

  // ─────────────────────────────────────────────
  // ارزشیابی (فرم‌ساز پویا + دادهٔ BI رادار/روند/ابر کلمات — سند §۱۲۷۵–۱۳۶۵)
  // ─────────────────────────────────────────────
  const t1402 = db.prepare(`SELECT id FROM academic_terms WHERE title LIKE '%۱۴۰۲%'`).get().id;
  const t1404 = db.prepare(`SELECT id FROM academic_terms WHERE title LIKE '%دوم ۱۴۰۴%'`).get().id;
  const sid = c => db.prepare(`SELECT id FROM staff WHERE staffCode=?`).get(c).id;
  const cid = c => db.prepare(`SELECT id FROM courses WHERE code=?`).get(c).id;

  // دوره‌های ارزشیابی: دو دورهٔ بستهٔ گذشته (برای روند ترمیک) + دورهٔ فعال
  const mkPeriod = (termId, title, sd, ed, act) => {
    run(`INSERT INTO evaluation_periods (termId, title, startDate, endDate, isActive) VALUES (?,?,?,?,?)`, [termId, title, sd, ed, act]);
    return lastId();
  };
  const p1402 = mkPeriod(t1402, 'ارزشیابی اساتید نیمسال اول ۱۴۰۲', '2022-10-01', '2023-01-10', 0);
  const p1404 = mkPeriod(t1404, 'ارزشیابی اساتید نیمسال دوم ۱۴۰۴', '2025-02-01', '2025-06-10', 0);
  const pCur = mkPeriod(curTerm, 'ارزشیابی اساتید نیمسال اول ۱۴۰۵', '2026-08-20', '2027-01-31', 1);

  // فرم‌ساز: نظری + عملی (پروفشنال) + امکانات (فاصلیتی)
  const mkForm = (title, target) => { run(`INSERT INTO evaluation_forms (title, targetType) VALUES (?,?)`, [title, target]); return lastId(); };
  const mkQ = (formId, text, type, w, ord, axis) => {
    run(`INSERT INTO evaluation_questions (formId, questionText, questionType, weight, orderIndex, axisLabel) VALUES (?,?,?,?,?,?)`, [formId, text, type, w, ord, axis]);
    const qid = lastId();
    if (type === 'SINGLE_CHOICE')
      for (const [label, sc] of [['عالی', 5], ['خوب', 4], ['متوسط', 3], ['ضعیف', 2], ['خیلی ضعیف', 1]])
        run(`INSERT INTO question_options (questionId, optionLabel, scoreValue) VALUES (?,?,?)`, [qid, label, sc]);
    return qid;
  };
  const fTheory = mkForm('فرم ارزشیابی استاد (نظری)', 'PROFESSOR');
  const fPractical = mkForm('فرم ارزشیابی استاد (عملی)', 'PROFESSOR');
  const fFacility = mkForm('فرم کیفیت امکانات کلاس', 'FACILITY');
  const theoryQ = [
    mkQ(fTheory, 'استاد به‌موقع و منظم در کلاس حاضر می‌شود.', 'SINGLE_CHOICE', 1.5, 1, 'نظم زمانی'),
    mkQ(fTheory, 'بر مطالب درس تسلط دارد و با مثال‌های کاربردی توضیح می‌دهد.', 'SINGLE_CHOICE', 1.2, 2, 'تسلط بر مبحث'),
    mkQ(fTheory, 'در خارج از کلاس در دسترس است و به سوالات پاسخ می‌دهد.', 'SINGLE_CHOICE', 1.0, 3, 'در دسترس بودن'),
    mkQ(fTheory, 'نقطه قوت استاد (نظر شما):', 'TEXT', 1.0, 4, null)
  ];
  const practicalQ = [
    mkQ(fPractical, 'راهنمایی استاد در انجام آزمایش‌ها و پروژه‌ها کافی است.', 'SINGLE_CHOICE', 1.3, 1, 'راهنمایی عملی'),
    mkQ(fPractical, 'بر تجهیزات و نرم‌افزار کارگاه مسلط است.', 'SINGLE_CHOICE', 1.0, 2, 'تسلط بر تجهیزات'),
    mkQ(fPractical, 'بر مطالب علمی درس تسلط دارد.', 'SINGLE_CHOICE', 1.2, 3, 'تسلط بر مبحث'),
    mkQ(fPractical, 'نقطه قوت استاد (نظر شما):', 'TEXT', 1.0, 4, null)
  ];
  const facilityQ = [
    mkQ(fFacility, 'کیفیت پروژکتور و تصویر کلاس', 'SINGLE_CHOICE', 1.0, 1, 'پروژکتور و تصویر'),
    mkQ(fFacility, 'سیستم گرمایش و سرمایش کلاس', 'SINGLE_CHOICE', 1.0, 2, 'تهویه و دما'),
    mkQ(fFacility, 'راحتی صندلی‌ها و وضعیت کلاس', 'SINGLE_CHOICE', 1.0, 3, 'صندلی‌ها')
  ];

  // نگاشت پویای فرم به نوع درس (سند §۱۳۲۵)
  run(`INSERT INTO form_assignments (formId, practicalOnly) VALUES (?,1)`, [fPractical]);
  run(`INSERT INTO form_assignments (formId, practicalOnly) VALUES (?,0)`, [fTheory]);

  // آستانهٔ بحرانی گلوگاه کیفی مدیر گروه (سند §۱۳۵۵)
  run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('EVAL_FLAG_THRESHOLD','3.5')`);

  // ── دادهٔ بی‌هویت BI (گمنامی مطلق: هیچ ارجاعی به دانشجو نیست) ──
  // رندوم قطعی برای دموی تکرارپذیر
  let rs = 1405; const rnd = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ins = db.prepare(`INSERT INTO evaluation_responses (periodId, offeringId, questionId, selectedOptionId, textAnswer) VALUES (?,?,?,?,?)`);
  const optsOf = qid => db.prepare(`SELECT id, scoreValue FROM question_options WHERE questionId=? ORDER BY scoreValue`).all(qid);
  const optNear = (opts, t) => opts.reduce((b, o) => Math.abs(o.scoreValue - t) < Math.abs(b.scoreValue - t) ? o : b);

  // پروفایل روند ۳ ترمه (سند §۱۳۴۷): رضایی صعودی، احمدی پایدار، کاظمی نزولی (فعلاً زیر آستانه ۳.۵)
  const profiles = [
    { code: 'F-101', trend: { [p1402]: 3.70, [p1404]: 3.95, [pCur]: 4.55 },
      skew: { 'نظم زمانی': 0.35, 'تسلط بر مبحث': 0.10, 'در دسترس بودن': 0.20, 'راهنمایی عملی': 0.10, 'تسلط بر تجهیزات': 0.0 } },
    { code: 'F-102', trend: { [p1402]: 4.60, [p1404]: 4.55, [pCur]: 4.70 },
      skew: { 'نظم زمانی': 0.15, 'تسلط بر مبحث': 0.15, 'در دسترس بودن': 0.30, 'راهنمایی عملی': 0.15, 'تسلط بر تجهیزات': 0.10 } },
    { code: 'F-103', trend: { [p1402]: 4.35, [p1404]: 3.80, [pCur]: 2.90 },
      skew: { 'نظم زمانی': -0.50, 'تسلط بر مبحث': 0.55, 'در دسترس بودن': -0.45, 'راهنمایی عملی': -0.20, 'تسلط بر تجهیزات': -0.10 } }
  ];
  const commentPool = {
    'F-101': ['منظم و وقت‌شناس', 'مثال‌های کاربردی زیاد', 'صبور و باوقار', 'تسلط کامل روی مطالب', 'کلاس منظم و پرانرژی', 'پاسخگو در ساعات اداری', 'تکالیف هدفمند', 'منظم', 'به‌موقع سر کلاس'],
    'F-102': ['دقیق و منظم', 'در دسترس و پاسخگو', 'مشاوره پروژه عالی', 'منظم', 'پروژه‌های عملی مفید', 'تحویل تکلیف به‌موقع', 'پاسخگو', 'دقیق'],
    'F-103': ['متخصص و تسلط بالا', 'امتحان سخت', 'سخت‌گیر در نمره‌دهی', 'سرعت پیشروی بالا', 'پروژه زیاد', 'تسلط کامل', 'سخت‌گیر', 'سرعت بالا']
  };

  // کلاس‌های تاریخی (فقط برای روند ترمیک — بدون برنامه/ثبت‌نام)
  const histOff = [
    { term: t1402, period: p1402, prof: 'F-101', course: '1112101' },
    { term: t1402, period: p1402, prof: 'F-102', course: '1112201' },
    { term: t1402, period: p1402, prof: 'F-103', course: '1112107' },
    { term: t1404, period: p1404, prof: 'F-101', course: '1112103' },
    { term: t1404, period: p1404, prof: 'F-102', course: '1112302' },
    { term: t1404, period: p1404, prof: 'F-103', course: '1112105' }
  ];
  const mkHist = h => {
    run(`INSERT INTO course_offerings (termId, courseId, professorId, groupNumber, capacity) VALUES (?,?,?,1,30)`, [h.term, cid(h.course), sid(h.prof)]);
    return lastId();
  };

  const evalOffering = (periodId, offeringId, courseCode, profCode, respondents) => {
    const prof = profiles.find(x => x.code === profCode);
    const mean = prof.trend[periodId];
    const isPractical = db.prepare(`SELECT practicalUnits FROM courses WHERE code=?`).get(courseCode).practicalUnits > 0;
    const qs = isPractical ? practicalQ : theoryQ;
    const singles = qs.slice(0, 3);
    for (let i = 0; i < respondents; i++) {
      for (const qid of singles) {
        const axis = db.prepare(`SELECT axisLabel FROM evaluation_questions WHERE id=?`).get(qid).axisLabel;
        const t = Math.max(1, Math.min(5, mean + (prof.skew[axis] || 0) + (rnd() - 0.5) * 1.2));
        ins.run(periodId, offeringId, qid, optNear(optsOf(qid), t).id, null);
      }
      if (rnd() < 0.6) {
        const pool = commentPool[profCode];
        ins.run(periodId, offeringId, qs[3], null, pool[Math.floor(rnd() * pool.length)]);
      }
    }
  };
  for (const h of histOff) evalOffering(h.period, mkHist(h), h.course, h.prof, 9);
  // کلاس‌های جاری (دورهٔ فعال)
  for (const o of db.prepare(`SELECT o.id, c.code, s.staffCode FROM course_offerings o JOIN courses c ON c.id=o.courseId JOIN staff s ON s.id=o.professorId WHERE o.termId=?`).all(curTerm))
    if (commentPool[o.staffCode]) evalOffering(pCur, o.id, o.code, o.staffCode, 7);

  // ── پاسخ‌های فرم امکانات (تحلیل کلاس‌های نیازمند تعمیر — سند §۱۳۵۷) ──
  // اتاق ۲۰۱ پروژکتور خراب (میانگین ~۲) ← پرچم قرمز تدارکات؛ بقیه سالم
  const roomProfile = { 1: { 'پروژکتور و تصویر': 2.0, 'تهویه و دما': 3.9, 'صندلی‌ها': 3.4 }, 2: { 'پروژکتور و تصویر': 4.3, 'تهویه و دما': 4.1, 'صندلی‌ها': 3.8 }, 3: { 'پروژکتور و تصویر': 4.5, 'تهویه و دما': 4.4, 'صندلی‌ها': 4.2 }, 4: { 'پروژکتور و تصویر': 4.1, 'تهویه و دما': 3.3, 'صندلی‌ها': 3.6 } };
  for (const sc of db.prepare(`SELECT DISTINCT offeringId, roomId FROM schedules WHERE scheduleType='CLASS' AND roomId IS NOT NULL`).all()) {
    const prof = roomProfile[sc.roomId];
    for (let i = 0; i < 6; i++)
      for (const qid of facilityQ) {
        const axis = db.prepare(`SELECT axisLabel FROM evaluation_questions WHERE id=?`).get(qid).axisLabel;
        const t = Math.max(1, Math.min(5, prof[axis] + (rnd() - 0.5) * 0.8));
        ins.run(pCur, sc.offeringId, qid, optNear(optsOf(qid), t).id, null);
      }
  }

  // ─────────────────────────────────────────────
  // حق‌التدریس (نرخ‌ها و ضرایب پویا — فاز بعدی فعال می‌شود)
  // ─────────────────────────────────────────────
  run(`INSERT INTO teaching_rates (academicRank, degree, baseRatePerUnit, effectiveYear) VALUES (?,?,?,?)`, ['استادیار', 'دکتری', 850000, 1405]);
  run(`INSERT INTO teaching_rates (academicRank, degree, baseRatePerUnit, effectiveYear) VALUES (?,?,?,?)`, ['دانشیار', 'دکتری', 950000, 1405]);
  run(`INSERT INTO teaching_rates (academicRank, degree, baseRatePerUnit, effectiveYear) VALUES (?,?,?,?)`, ['مربی', 'فوق لیسانس', 620000, 1405]);
  const coefs = [['ضریب درس عملی', 1.5], ['ضریب مقطع ارشد', 1.2], ['ضریب کلاس جمعی (>۴۰ نفر)', 1.15], ['ضریب معرفی به استاد (هر دانشجو)', 0.33]];

  // موتور فرمول‌ساز مالی (سند §۲۷۸۴–۲۸۴۷): فرمول‌های اختصاصی نوع ارائه × نقش استاد
  const mkPayRule = (type, role, unit, perStudent, flat, title) =>
    run(`INSERT INTO payroll_calculation_rules (offeringType, professorRole, multiplierUnit, multiplierPerStudent, flatFee, title) VALUES (?,?,?,?,?,?)`,
      [type, role, unit, perStudent, flat, title]);
  mkPayRule('THESIS', 'SUPERVISOR', 1.5, null, null, 'استاد راهنمای پایان‌نامه: نرخ × واحد × ۱.۵');
  mkPayRule('THESIS', 'ADVISOR', 0.5, null, null, 'استاد مشاور پایان‌نامه: نرخ × واحد × ۰.۵');
  mkPayRule('THESIS', 'REVIEWER', null, null, 2500000, 'داور: مقطوع ۲٬۵۰۰٬۰۰۰ ریال بابت هر جلسه دفاع');
  mkPayRule('DIRECTED_READING', 'EXAMINER', null, 0.33, null, 'ممتحن معرفی به استاد: نرخ × واحد × دانشجو × ۰.۳۳');
  mkPayRule('INTERNSHIP', 'SUPERVISOR', null, 0.5, null, 'سرپرست کارآموزی: نرخ × واحد × دانشجو × ۰.۵');
  for (const [name, m] of coefs) run(`INSERT INTO teaching_coefficients (ruleName, multiplier) VALUES (?,?)`, [name, m]);

  // قراردادهای ترمی اساتید (ماژول ۷ سند §۱۷۲۹) — موظفی هیئت علمی، مدعو بدون موظفی
  const mkPayContract = (staffId, type, duty, tax) => {
    run(`INSERT INTO professor_term_contracts (staffId, termId, contractType, baseDutyUnits, taxRate) VALUES (?,?,?,?,?)`,
      [staffId, curTerm, type, duty, tax]);
  };
  mkPayContract(prof1, 'FULL_TIME', 6, 10);   // رضایی — هیئت علمی، موظفی ۶ واحد
  mkPayContract(prof2, 'FULL_TIME', 4, 10);   // احمدی — هیئت علمی، موظفی ۴ واحد
  mkPayContract(prof3, 'ADJUNCT', 0, 10);     // کاظمی — مدعو، بدون موظفی (پرداخت از واحد اول + علی‌الحساب میان‌ترم)

  // بایگانی الکترونیک — دسته‌ها
  for (const cat of ['هویتی', 'تحصیلی', 'اداری/مالی', 'انضباطی/پزشکی'])
    run(`INSERT INTO document_categories (title, scope) VALUES (?, 'STUDENT')`, [cat]);

  // سالن‌های امتحانی
  run(`INSERT INTO exam_halls (name, totalCapacity, rowsCount, colsCount, buildingName) VALUES (?,?,?,?,?)`, ['سالن آمفی‌تئاتر', 120, 10, 12, 'ساختمان مرکزی']);
  run(`INSERT INTO exam_halls (name, totalCapacity, rowsCount, colsCount, buildingName) VALUES (?,?,?,?,?)`, ['سالن ۱', 60, 6, 10, 'ساختمان فنی']);

  console.log('✅ داده اولیه با موفقیت کاشته شد.');
  console.log('─────────────────────────────────────────────');
  console.log('👥 حساب‌های نمونه (رمز همه: 123456)');
  console.log('  👨‍🎓 دانشجو (عادی):        1010101010');
  console.log('  👩‍🎓 دانشجو (معدل الف):     1010101011');
  console.log('  🧑‍🎓 دانشجو (مشروطی):      1010101012');
  console.log('  👩‍🎓 دانشجو (شاهد/بدون تسویه): 1010101013');
  console.log('  🧓 دانشجو (ورودی ۱۳۹۰):   1010101014');
  console.log('  🎓 دانشجو (ترم آخر):      1010101015');
  console.log('  🎓 دانشجوی ارشد:          1010101016');
  console.log('  👨‍🏫 مدیر گروه:            0044444444');
  console.log('  🧑‍💼 کارشناس آموزش:        0055555555');
  console.log('  🧑‍⚖️ معاون آموزشی:          0066666666');
  console.log('  💰 کارشناس مالی:          0077777777');
  console.log('  🛡 مدیر سیستم:            0000000001');
}
