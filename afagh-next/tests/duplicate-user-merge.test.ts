/**
 * ════════════════════════════════════════════════════════════════════════
 *  تست واحد «ادغامِ کاربرانِ تکراری» — منطق خالص scripts/lib/duplicate-user-merge.mjs
 *
 *  سه بخش:
 *   ۱) طبقه‌بندیِ ایمنی — ماتریسِ کاملِ MERGE_SAFE / MERGE_WITH_DATA_MIGRATION
 *      / BLOCKED با شواهدِ ارجاع
 *   ۲) زنجیره، چرخه، هم‌گرایی و «یتیم با دو هدف»
 *   ۳) گروه‌بندیِ نامزدها به «عملیاتِ ادغامِ کاربر» + تجزیهٔ دلیلِ برخورد
 *
 *  قاعده‌ای که این تست‌ها نگه می‌دارند: «سطری که وضعیتش را نمی‌دانیم،
 *  هرگز نباید قابلِ اعمال باشد.» برای همین تقریباً هر ورودیِ ناقصی باید
 *  BLOCKED بدهد، نه MERGE_SAFE.
 * ════════════════════════════════════════════════════════════════════════
 */
import {
  MERGE_CLASSES,
  BLOCK_REASONS,
  USER_REFERENCE_POLICY,
  IGNORED_REFERENCE_COLUMNS,
  isBackupTable,
  parseCollisionOwnerId,
  pickMergeCandidates,
  detectMergeChains,
  classifyMerge,
  groupIntoMergeOperations,
  summarizeMergeClasses,
  formatReferenceEvidence,
} from '../scripts/lib/duplicate-user-merge.mjs';
import { isValidIranianNationalCode } from '../scripts/lib/student-nc-repair.mjs';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const okT = (name: string, v: unknown) => eq(name, Boolean(v), true);
const okF = (name: string, v: unknown) => eq(name, Boolean(v), false);

// ── ورودیِ پایه: یک جفتِ واقعیِ زرینه (کدِ مصنوعی → کدِ واقعیِ آفاق) ────────
const base = {
  orphanUserId: 97058,
  targetUserId: 26767,
  orphan: { nationalCode: 'SZ00031028', personId: null as number | null, universityId: 2 },
  target: { nationalCode: '2803421712', personId: null as number | null, universityId: 1 },
  plannedStudentIds: [119001],
  orphanStudentCount: 1,
  references: [
    { table: 'students', column: 'userId', count: 1 },
    { table: 'user_roles', column: 'userId', count: 0 },
    { table: 'sessions', column: 'userId', count: 0 },
    { table: 'notifications', column: 'userId', count: 0 },
    { table: 'student_documents', column: 'personUserId', count: 0 },
    { table: 'audit_logs', column: 'actorUserId', count: 0 },
  ],
  isValidCode: isValidIranianNationalCode,
};
const c = (over: Record<string, unknown>) => classifyMerge({ ...base, ...over } as never);
const withRef = (table: string, column: string, count: number, extra: object = {}) => [
  ...base.references, { table, column, count, ...extra },
];
const keysOf = (r: { mergeClass: string; blockedBy: string | null; reasons: string[] }) => r.blockedBy;

// ── ۱) طبقه‌بندیِ ایمنی: حالتِ سالم ───────────────────────────────────────
console.log('\n--- ۱. طبقه‌بندیِ ایمنی: حالتِ سالم ---');
eq('بدون هیچ ارجاعِ معنادار ⇒ MERGE_SAFE', c({}).mergeClass, MERGE_CLASSES.SAFE);
eq('و هیچ دلیلی هم ندارد', c({}).blockedBy, null);
eq('و هیچ چیزی برای مهاجرت ندارد', c({}).migratable.length, 0);
eq('students خودش «ارجاع» حساب نمی‌شود (نقشِ planned)', c({}).immutable.length, 0);
eq('شواهدِ صفر: خودِ students ارجاع شمرده نمی‌شود', formatReferenceEvidence(base.references), 'هیچ ارجاعی (صفر) — تنها ارجاع، همین ردیف‌های students بوده');

// ── ۲) هویتِ دو ردیف ─────────────────────────────────────────────────────
console.log('\n--- ۲. طبقه‌بندیِ ایمنی: هویتِ دو ردیف ---');
eq('یتیم == هدف ⇒ BLOCKED', c({ targetUserId: 97058 }).mergeClass, MERGE_CLASSES.BLOCKED);
eq('  با دلیلِ درست', c({ targetUserId: 97058 }).blockedBy, BLOCK_REASONS.SAME_USER);
eq('شناسهٔ نامعتبر/مفقود ⇒ BLOCKED (نه حدس)', c({ orphanUserId: undefined }).blockedBy, BLOCK_REASONS.MISSING_ORPHAN);
eq('شناسهٔ منفی ⇒ BLOCKED', c({ targetUserId: -1 }).blockedBy, BLOCK_REASONS.MISSING_TARGET);
eq('سطرِ یتیم در دیتابیس نیست ⇒ BLOCKED', c({ orphan: null }).blockedBy, BLOCK_REASONS.MISSING_ORPHAN);
eq('سطرِ هدف در دیتابیس نیست ⇒ BLOCKED', c({ target: null }).blockedBy, BLOCK_REASONS.MISSING_TARGET);
eq('هدف خودش یتیمِ ادغامِ دیگری است (زنجیره) ⇒ BLOCKED', c({ targetIsOrphan: true }).blockedBy, BLOCK_REASONS.TARGET_IS_ORPHAN);
eq('زنجیرهٔ چرخه‌ای ⇒ BLOCKED', c({ inCycle: true }).blockedBy, BLOCK_REASONS.CYCLE);

// ── ۳) کدِ هدف ───────────────────────────────────────────────────────────
console.log('\n--- ۳. طبقه‌بندیِ ایمنی: کدِ هدف ---');
eq('هدف کدِ معتبر ندارد (mod-11) ⇒ BLOCKED', c({ target: { nationalCode: '2269' } }).blockedBy, BLOCK_REASONS.TARGET_CODE_INVALID);
eq('هدف کدش NULL است ⇒ BLOCKED', c({ target: { nationalCode: null } }).blockedBy, BLOCK_REASONS.TARGET_HOLDS_OTHER_CODE);
okT('کدِ واقعیِ معتبرِ هدف (از دادهٔ واقعیِ زرینه) پذیرفته می‌شود', isValidIranianNationalCode('2803421712'));
okF('اگر کدِ آسیب‌دیدهٔ یتیم را به هدف بدهیم، SAFE نمی‌شود', c({ target: { nationalCode: base.orphan.nationalCode } }).mergeClass === MERGE_CLASSES.SAFE);

// ── ۴) شخص و دامنهٔ ردیف‌های دانشجو ───────────────────────────────────────
console.log('\n--- ۴. طبقه‌بندیِ ایمنی: شخص و دامنهٔ ردیف‌های دانشجو ---');
eq('یتیم personId دارد ⇒ BLOCKED (ردیفِ persons رها می‌شد)', c({ orphan: { ...base.orphan, personId: 9 } }).blockedBy, BLOCK_REASONS.ORPHAN_HAS_PERSON);
eq('یتیم هیچ ردیفِ دانشجویی ندارد ⇒ BLOCKED', c({ orphanStudentCount: 0 }).blockedBy, BLOCK_REASONS.ORPHAN_HAS_NO_STUDENTS);
eq('ردیفِ دانشجو خارج از طرح ⇒ BLOCKED', c({ orphanStudentCount: 2 }).blockedBy, BLOCK_REASONS.STUDENTS_OUT_OF_SCOPE);
eq('دو ردیفِ دانشجو، هر دو در طرح ⇒ SAFE', c({ plannedStudentIds: [1, 2], orphanStudentCount: 2 }).mergeClass, MERGE_CLASSES.SAFE);
eq('سه ردیف در طرح ولی فقط دو مالِ یتیم ⇒ BLOCKED', c({ plannedStudentIds: [1, 2, 3], orphanStudentCount: 2 }).blockedBy, BLOCK_REASONS.STUDENTS_OUT_OF_SCOPE);

// ── ۵) ارجاع‌های قابلِ انتقال ────────────────────────────────────────────
console.log('\n--- ۵. طبقه‌بندیِ ایمنی: ارجاع‌های قابلِ انتقال ---');
eq('اعلان ⇒ MERGE_WITH_DATA_MIGRATION', c({ references: withRef('notifications', 'userId', 3) }).mergeClass, MERGE_CLASSES.MIGRATE);
eq('  و ستونِ قابلِ انتقال نام‌برده می‌شود', c({ references: withRef('notifications', 'userId', 3) }).migratable.map((m: { key: string }) => m.key), ['notifications.userId']);
eq('نقش ⇒ MERGE_WITH_DATA_MIGRATION', c({ references: withRef('user_roles', 'userId', 2) }).mergeClass, MERGE_CLASSES.MIGRATE);
eq('سندِ شخص ⇒ MERGE_WITH_DATA_MIGRATION', c({ references: withRef('student_documents', 'personUserId', 4) }).mergeClass, MERGE_CLASSES.MIGRATE);
eq('نشستِ فعال ⇒ MERGE_WITH_DATA_MIGRATION', c({ references: withRef('sessions', 'userId', 1) }).mergeClass, MERGE_CLASSES.MIGRATE);
eq('دو ارجاعِ قابلِ انتقال، هر دو فهرست می‌شوند', c({ references: [...withRef('notifications', 'userId', 3), { table: 'user_roles', column: 'userId', count: 2 }] }).migratable.length, 2);
eq('شمارشِ صفر همچنان SAFE است', c({ references: withRef('notifications', 'userId', 0) }).mergeClass, MERGE_CLASSES.SAFE);

// ── ۶) ارجاع‌های تغییرناپذیر (شاهدِ رویداد) ─────────────────────────────
console.log('\n--- ۶. طبقه‌بندیِ ایمنی: ارجاع‌های تغییرناپذیر (شاهدِ رویداد) ---');
eq('audit_logs به‌عنوان کنشگر ⇒ BLOCKED', c({ references: withRef('audit_logs', 'actorUserId', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('  و ستونِ تغییرناپذیر نام‌برده می‌شود', c({ references: withRef('audit_logs', 'actorUserId', 1) }).immutable.map((m: { key: string }) => m.key), ['audit_logs.actorUserId']);
eq('grade_change_log ⇒ BLOCKED', c({ references: withRef('grade_change_log', 'actorUserId', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('امضای تأییدِ تخفیف ⇒ BLOCKED', c({ references: withRef('student_discounts', 'approvedBy', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('امضای تأییدِ برنامه ⇒ BLOCKED', c({ references: withRef('curriculum_approvals', 'approvedByUserId', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('امضای پروپوزال ⇒ BLOCKED', c({ references: withRef('thesis_progress', 'proposalApprovedBy', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('صدورِ مدرک ⇒ BLOCKED', c({ references: withRef('issued_degrees', 'issuedByUserId', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('داوریِ انسانیِ تطبیق هویت ⇒ BLOCKED', c({ references: withRef('identity_resolution_reviews', 'reviewedBy', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('داوریِ KYC ⇒ BLOCKED', c({ references: withRef('kyc_verifications', 'reviewedBy', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('پروندهٔ کارمندی ⇒ BLOCKED', c({ references: withRef('staff', 'userId', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('سابقهٔ تحویلِ اعلان ⇒ BLOCKED', c({ references: withRef('notification_deliveries', 'userId', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('سابقهٔ اعلان ⇒ BLOCKED', c({ references: withRef('notification_logs', 'userId', 1) }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);
eq('تغییرناپذیر بر مهاجرتِ قابلِ انتقال غلبه می‌کند', c({ references: [...withRef('notifications', 'userId', 3), { table: 'audit_logs', column: 'actorUserId', count: 1 }] }).mergeClass, MERGE_CLASSES.BLOCKED);
eq('و دلیلِ اولویت‌دار همان است', c({ references: [...withRef('notifications', 'userId', 3), { table: 'audit_logs', column: 'actorUserId', count: 1 }] }).blockedBy, BLOCK_REASONS.IMMUTABLE_REFERENCE);

// ── ۷) ریسکِ قیدِ یکتا ────────────────────────────────────────────────────
console.log('\n--- ۷. طبقه‌بندیِ ایمنی: ریسکِ قیدِ یکتا ---');
eq('نقش دارد ولی هدف هم نقش دارد ⇒ BLOCKED', c({ references: withRef('user_roles', 'userId', 2, { uniqueRisk: true }) }).blockedBy, `${BLOCK_REASONS.UNIQUE_RISK}:user_roles.userId`);
eq('کانالِ اعلان با ریسکِ یکتا ⇒ BLOCKED', c({ references: withRef('notification_channels', 'userId', 1, { uniqueRisk: true }) }).blockedBy, `${BLOCK_REASONS.UNIQUE_RISK}:notification_channels.userId`);
eq('همان ستون بدون ریسکِ یکتا ⇒ قابلِ انتقال', c({ references: withRef('notification_channels', 'userId', 1) }).mergeClass, MERGE_CLASSES.MIGRATE);
eq('دلیلِ اولویت‌دار حفظ می‌شود (هویت قبل از ریسکِ یکتا)', c({ targetUserId: 97058, references: withRef('user_roles', 'userId', 2, { uniqueRisk: true }) }).blockedBy, BLOCK_REASONS.SAME_USER);

// ── ۸) دروازهٔ کامل‌بودنِ فهرستِ ارجاع‌ها ──────────────────────────────────
console.log('\n--- ۸. طبقه‌بندیِ ایمنی: دروازهٔ کامل‌بودنِ فهرستِ ارجاع‌ها ---');
eq('ستونِ ارجاعِ ناشناخته ⇒ BLOCKED', c({ references: withRef('brand_new_table', 'userId', 1) }).blockedBy, BLOCK_REASONS.UNKNOWN_REFERENCE);
eq('پرچمِ کامل‌نبودنِ فهرست ⇒ BLOCKED', c({ unknownReferenceColumn: true }).blockedBy, BLOCK_REASONS.UNKNOWN_REFERENCE);
eq('حتی با شمارشِ صفر، ستونِ ناشناخته مهم است', c({ references: withRef('brand_new_table', 'userId', 0) }).blockedBy, BLOCK_REASONS.UNKNOWN_REFERENCE);

// ── ۹) یکپارچگیِ فهرستِ سیاست ────────────────────────────────────────────
console.log('\n--- ۹. یکپارچگیِ فهرستِ سیاستِ ارجاع‌ها ---');
const ROLES = ['planned', 'migratable', 'immutable'];
type Policy = { role: string; migratable: boolean; uniqueGuard?: boolean };
const pol = (k: string): Policy => (USER_REFERENCE_POLICY as Record<string, Policy>)[k];
const pols = Object.entries(USER_REFERENCE_POLICY as Record<string, Policy>) as Array<[string, Policy]>;
eq('همهٔ ستون‌های سیاست نقشِ معتبر دارند', pols.filter(([, p]) => !ROLES.includes(p.role)).map(([k]) => k), []);
eq('نقشِ migratable با پرچمِ migratable هم‌خوان است', pols.filter(([, p]) => p.role === 'migratable' && p.migratable !== true).map(([k]) => k), []);
eq('نقشِ immutable هرگز قابلِ انتقال نیست', pols.filter(([, p]) => p.role === 'immutable' && p.migratable).map(([k]) => k), []);
eq('ستون‌های دارای دروازهٔ یکتایی', pols.filter(([, p]) => p.uniqueGuard).map(([k]) => k).sort(), ['notification_channels.userId', 'user_roles.userId']);
eq('کارمندی هرگز قابلِ انتقال نیست', pol('staff.userId').role, 'immutable');
eq('ردیفِ دانشجو «عملیات» است نه ارجاع', pol('students.userId').role, 'planned');
// هر ستونی که «شاهدِ رویداد/تأیید» است باید immutable باشد — فهرستِ صریح
for (const k of ['audit_logs.actorUserId', 'grade_change_log.actorUserId', 'curriculum_approvals.approvedByUserId', 'student_discounts.approvedBy', 'identity_resolution_reviews.reviewedBy', 'issued_degrees.issuedByUserId', 'staff.userId']) {
  eq(`«${k}» تغییرناپذیر است`, pol(k).role, 'immutable');
}
// ستون‌های نادیده‌گرفته‌شده نباید با ستون‌های سیاست هم‌پوشانی داشته باشند
eq('فهرستِ نادیده‌گرفته‌شده با سیاست تداخل ندارد', Object.keys(IGNORED_REFERENCE_COLUMNS).filter((k) => pol(k) !== undefined), []);
okT('جدولِ پشتیبان شناسایی می‌شود', isBackupTable('students_backup_20261004'));
okT('جدولِ backup_… شناسایی می‌شود', isBackupTable('backup_students_zarine_s39'));
okF('جدولِ زنده با نامِ شبیه، پشتیبان نیست', isBackupTable('students'));
okF('جدولِ sessions پشتیبان نیست', isBackupTable('sessions'));

// ── ۱۰) تجزیهٔ دلیلِ برخورد و انتخابِ نامزد ───────────────────────────────
console.log('\n--- ۱۰. تجزیهٔ دلیلِ برخورد از گزارشِ بالادستی ---');
eq('قالبِ درست', parseCollisionOwnerId('PROPOSED_CODE_OWNED_BY_USER_26767'), 26767);
eq('قالبِ نادرست ⇒ null (نه حدس)', parseCollisionOwnerId('DUPLICATE_IN_PLAN_WITH_USER_5'), null);
eq('دلیلِ خالی ⇒ null', parseCollisionOwnerId(''), null);
eq('null ⇒ null', parseCollisionOwnerId(null as unknown as string), null);
eq('پیشوندِ مشابه ولی نادرست ⇒ null', parseCollisionOwnerId('PROPOSED_CODE_OWNED_BY_GROUP_5'), null);
const fakePlan = [
  { studentId: '10', studentCode: '9612392008', universityCode: 'ZARINE', userId: '97058', currentCode: '2269', currentClass: 'EQUALS_BIRTH_CERT|NOT_10_DIGITS', proposedCode: '2803421712', verdict: 'COLLISION', reason: 'PROPOSED_CODE_OWNED_BY_USER_26767' },
  { studentId: '11', studentCode: '9612392013', universityCode: 'ZARINE', userId: '97059', currentCode: '5', currentClass: 'NOT_10_DIGITS', proposedCode: '2803061899', verdict: 'COLLISION', reason: 'PROPOSED_CODE_OWNED_BY_USER_26770' },
  { studentId: '12', studentCode: '900031005', universityCode: 'ZARINE', userId: '97065', currentCode: '2860229000', currentClass: 'VALID', proposedCode: null, verdict: 'NO_CHANGE', reason: 'CURRENT_DB_CODE_VALID' },
  { studentId: '13', studentCode: '9614592001', universityCode: 'ZARINE', userId: '97050', currentCode: '2801928860', currentClass: 'VALID', proposedCode: null, verdict: 'AMBIGUOUS_SOURCE', reason: 'MULTIPLE_DISTINCT_VALID_SOURCE_CODES' },
];
const picked = pickMergeCandidates(fakePlan);
eq('فقط سطرهای PROPOSED_CODE_OWNED_BY_USER_<id> نامزد می‌شوند', picked.length, 2);
eq('شماره‌ها به عددِ صحیح تبدیل شدند', [picked[0].orphanUserId, picked[0].targetUserId], [97058, 26767]);
eq('کدِ هدف از proposedCode می‌آید', picked[0].targetCode, '2803421712');
eq('verdictِ نادرست نادیده گرفته می‌شود', pickMergeCandidates([{ ...fakePlan[0], verdict: 'AUTO_FIX' }]).length, 1);
eq('ورودیِ خالی ⇒ بدون نامزد', pickMergeCandidates([]).length, 0);
eq('null ⇒ بدون نامزد', pickMergeCandidates(null as never).length, 0);

// ── ۱۱) زنجیره، چرخه، هم‌گرایی ───────────────────────────────────────────
console.log('\n--- ۱۱. زنجیره، چرخه و هم‌گرایی ---');
const noChain = detectMergeChains([{ orphanUserId: 1, targetUserId: 2 }, { orphanUserId: 3, targetUserId: 4 }]);
eq('بدون زنجیره ⇒ خالی', noChain.chains.length, 0);
eq('بدون چرخه ⇒ خالی', noChain.cycles.length, 0);
eq('یتیم با بیش از یک هدف ⇒ خالی', noChain.multipleTargets.length, 0);
const chain = detectMergeChains([{ orphanUserId: 1, targetUserId: 2 }, { orphanUserId: 2, targetUserId: 3 }, { orphanUserId: 4, targetUserId: 5 }, { orphanUserId: 6, targetUserId: 2 }]);
// ۱ و ۶ هر دو به ۲ می‌روند و ۲ خودش یتیم است ⇒ دو زنجیرهٔ مستقل کشف می‌شود
eq('زنجیره‌های ۱→۲ و ۶→۲ کشف شدند (هدف، یتیمِ دیگری است)', chain.chains.map((x: { chain: number[] }) => x.chain.join('>')), ['1>2', '6>2']);
eq('انتهای زنجیره گزارش می‌شود', chain.chains[0]!.terminal, 3);
eq('هم‌گرایی: هدف ۲ از دو یتیم', chain.fanIn.find((f: { targetUserId: number }) => f.targetUserId === 2)?.count, 2);
eq('هم‌گرایی فقط برای هدفِ مشترک گزارش می‌شود', chain.fanIn.length, 1);
eq('هدفِ زنجیره در orphanIds هست (پس BLOCKED می‌شود)', chain.orphanIds.has(2), true);
eq('هدفِ ساده در orphanIds نیست', chain.orphanIds.has(5), false);
const cyc = detectMergeChains([{ orphanUserId: 1, targetUserId: 2 }, { orphanUserId: 2, targetUserId: 1 }]);
okT('چرخهٔ ۱→۲→۱ کشف شد', cyc.cycles.length > 0);
const cycPath = cyc.cycles[0]!.cycle;
eq('مسیرِ چرخه بسته است', cycPath[0] === cycPath[cycPath.length - 1], true);
const twoTargets = detectMergeChains([{ orphanUserId: 1, targetUserId: 2 }, { orphanUserId: 1, targetUserId: 3 }]);
eq('یتیم با دو هدف گزارش می‌شود', twoTargets.multipleTargets, [{ orphanUserId: 1, targets: [2, 3] }]);
okT('و هدفِ آن یتیم در orphanIds نیست', !twoTargets.orphanIds.has(2));
eq('ورودیِ خالی ⇒ بدون زنجیره', detectMergeChains([]).chains.length, 0);

// ── ۱۲) گروه‌بندی به عملیات ──────────────────────────────────────────────
console.log('\n--- ۱۲. گروه‌بندیِ نامزدها به عملیاتِ ادغامِ کاربر ---');
const g = groupIntoMergeOperations([
  { orphanUserId: 1, targetUserId: 5, studentId: 10, studentCode: 'a' },
  { orphanUserId: 1, targetUserId: 5, studentId: 11, studentCode: 'b' },
  { orphanUserId: 2, targetUserId: 5, studentId: 12, studentCode: 'c' },
]);
eq('سه ردیفِ دانشجو ⇒ دو عملیات (دانه = کاربر)', g.operations.length, 2);
eq('هر دو ردیفِ یک یتیم در یک عملیات', g.operations.find((o: { orphanUserId: number }) => o.orphanUserId === 1)?.studentIds, [10, 11]);
eq('کدهای دانشجویی هم با هم در یک عملیات', g.operations.find((o: { orphanUserId: number }) => o.orphanUserId === 1)?.studentCodes, ['a', 'b']);
eq('ورودیِ ناسازگار خالی است', g.inconsistent.length, 0);
const bad = groupIntoMergeOperations([
  { orphanUserId: 1, targetUserId: 5, studentId: 10, studentCode: 'a' },
  { orphanUserId: 1, targetUserId: 6, studentId: 11, studentCode: 'b' },
]);
eq('یتیم با دو هدف ⇒ ناسازگار', bad.inconsistent.length, 1);
eq('  و شناسهٔ هدف خالی می‌شود تا BLOCKED شود', bad.inconsistent[0]!.targetUserId, null);
eq('خودادغامی ⇒ ناسازگار', groupIntoMergeOperations([{ orphanUserId: 7, targetUserId: 7, studentId: 1, studentCode: 'x' }]).inconsistent.length, 1);

// ── ۱۳) خلاصهٔ سطل‌ها ─────────────────────────────────────────────────────
console.log('\n--- ۱۳. خلاصهٔ سطل‌ها ---');
eq('شمارشِ سه سطل', summarizeMergeClasses([{ mergeClass: MERGE_CLASSES.SAFE }, { mergeClass: MERGE_CLASSES.SAFE }, { mergeClass: MERGE_CLASSES.MIGRATE }, { mergeClass: MERGE_CLASSES.BLOCKED }]), { MERGE_SAFE: 2, MERGE_WITH_DATA_MIGRATION: 1, BLOCKED: 1 });
eq('ورودیِ خالی ⇒ همه صفر', summarizeMergeClasses([]), { MERGE_SAFE: 0, MERGE_WITH_DATA_MIGRATION: 0, BLOCKED: 0 });
eq('شواهدِ نامعلوم صفر شمرده نمی‌شود', summarizeMergeClasses([{ mergeClass: 'WHAT_IS_THIS' }]).MERGE_SAFE, 0);
eq('شواهدِ ارجاعِ غیرصفر فشرده می‌شود', formatReferenceEvidence([{ table: 'students', column: 'userId', count: 7 }, { table: 'notifications', column: 'userId', count: 3 }, { table: 'sessions', column: 'userId', count: 0 }]), 'notifications.userId=3');
eq('فهرستِ خالی ⇒ متنِ صفر', formatReferenceEvidence([]), 'هیچ ارجاعی (صفر) — تنها ارجاع، همین ردیف‌های students بوده');
eq('مرتب‌سازیِ ناموجود است ولی صفر درست است', formatReferenceEvidence([{ table: 'a', column: 'b', count: 0 }]).includes('هیچ ارجاعی'), true);

console.log(`\n${fail === 0 ? '✓' : '✗'} نتیجه: ${pass} موفق | ${fail} شکست`);
if (fail > 0) process.exitCode = 1;
