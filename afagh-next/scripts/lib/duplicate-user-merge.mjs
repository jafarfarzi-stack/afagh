/**
 * ════════════════════════════════════════════════════════════════════════
 *  منطق خالص «ادغام کاربران تکراری» — بدون I/O و بدون دیتابیس
 *
 *  مصرف‌کننده: scripts/merge-duplicate-users.mjs (رابط خط فرمان)
 *              tests/duplicate-user-merge.test.ts (تست واحد)
 *
 *  چرا این ماژول وجود دارد؟ چون «ادغام امن است یا نیست» یک قاعدهٔ
 *  قابل‌تست است، نه یک دستور SQL. اگر این قاعده داخل فایل وین۸۰۰ بماند،
 *  هیچ‌کس نمی‌تواند بدون دیتابیس ثابت کند که BLOCKED درست کار می‌کند.
 *
 *  ── مسئله‌ای که حل می‌کند ───────────────────────────────────────────────
 *  واردکنندهٔ سما برای هر دانشجو دو بار «یک انسان» را وارد کرده است: یک‌بار
 *  در دانشگاه خودش (کد ملی = کد مصنوعی S… یا شمارهٔ شناسنامه) و یک‌بار در
 *  دانشگاه دیگر (کد ملی = کد واقعی). برای زرینه هیچ‌کدام از این دو ردیف را
 *  نمی‌توان «ترمیم» کرد چون کدِ واقعی در دستِ ردیفِ دیگر است. تنها راهِ درست
 *  یکی کردنِ این دو ردیف است: students.userId به کاربرِ درست اشاره کند و
 *  ردیفِ یتیم حذف شود. این ماژول همان «یکی کردن» را ایمن می‌کند.
 *
 *  ── اصل حاکم بر کل ماژول ────────────────────────────────────────────────
 *  «هرگز حدس نمی‌زنیم، و هرگز تاریخِ یک انسان را بازنویسی نمی‌کنیم.»
 *   • حذف users ⟵ به معنی «این کاربر هرگز وجود نداشته» است. اگر حتی یک
 *     ارجاعِ معنادار (نقش، نشست، سند، تأیید، رد ممیزی) به او باشد، حذفش
 *     تاریخِ سیستم را دروغ می‌گوید ⇒ BLOCKED.
 *   • ستون‌هایی مثل audit_logs."actorUserId" یا student_discounts."approvedBy"
 *     «شاهدِ رویداد» هستند نه «پیوندِ مالکیت». هرگز به کاربر دیگری بازنویسی
 *     نمی‌شوند ⇒ BLOCKED (نه MERGE_WITH_DATA_MIGRATION).
 *   • ستون‌هایی مثل students."userId" یا student_documents."personUserId"
 *     «پیوندِ مالکیتِ همان آدم» هستند ⇒ جابه‌جایی‌شان درست است.
 * ════════════════════════════════════════════════════════════════════════
 */

// ── تجزیهٔ دلیل برخورد از خروجی fix-student-nc-v2 ──────────────────────────

/**
 * @typedef {object} MergeCandidate
 * @property {number} studentId
 * @property {string} studentCode
 * @property {string|null} universityCode
 * @property {number} orphanUserId   کاربرِ یتیم (کدِ آسیب‌دیده را نگه داشته)
 * @property {number} targetUserId   کاربرِ هدف (صاحبِ کدِ ملیِ واقعی)
 * @property {string|null} orphanCode
 * @property {string|null} orphanClass
 * @property {string|null} targetCode
 */

export const MERGE_CLASSES = Object.freeze({
  SAFE: 'MERGE_SAFE',
  MIGRATE: 'MERGE_WITH_DATA_MIGRATION',
  BLOCKED: 'BLOCKED',
});

/**
 * سیاست هر ستونِ ارجاع‌دهنده به users.id
 *
 *  hard        : آیا در کاتالوگ پایگاه‌داده FK واقعی دارد؟ (فقط برای گزارش —
 *                سیاست تصمیم از روی نقش ستون گرفته می‌شود، نه از روی وجود FK،
 *                تا رفتار ابزار روی هر دیتابیسی یکسان باشد.)
 *  role        : planned   → ستونی که خودِ عملیاتِ ادغام جابه‌جا می‌کند
 *                migratable→ با اطمینان به کاربرِ هدف منتقل می‌شود
 *                immutable → شاهدِ رویداد/تأیید؛ هرگز منتقل نمی‌شود ⇒ BLOCKED
 *  migratable  : آیا انتقالش مجاز است؟ (هم‌ارز role برای خوانایی)
 *  uniqueGuard : آیا ایندکس یکتایی شاملِ همین ستون دارد؟ ⇒ اگر کاربرِ هدف
 *                هم سطری در آن جدول داشته باشد، «نمی‌دانیم کدام سطر تکراری
 *                می‌شود» ⇒ BLOCKED. (قاعدهٔ حدس‌نکردن.)
 */
const P = (role, extra = {}) => ({ role, migratable: role === 'migratable', hard: null, uniqueGuard: false, ...extra });

export const USER_REFERENCE_POLICY = Object.freeze({
  // ── خودِ عملیات ──
  'students.userId': P('planned', { note: 'همین ردیف‌ها به کاربرِ هدف بازمی‌گردند' }),

  // ── هویت و نشست: مالکیتِ همان آدم ──
  'sessions.userId': P('migratable', { note: 'نشستِ فعال ⇒ نشانهٔ «کاربرِ واقعی»، ولی جابه‌جایی‌اش درست است' }),
  'user_roles.userId': P('migratable', { uniqueGuard: true, note: 'کلید اصلی (userId, roleId)' }),
  'notifications.userId': P('migratable'),
  'notification_channels.userId': P('migratable', { uniqueGuard: true, note: 'uq_notification_channels(userId, channel)' }),
  'kyc_verifications.userId': P('migratable', { note: 'هویتِ احرازشدهٔ همان آدم' }),
  'student_documents.personUserId': P('migratable', { note: 'سند متعلق به همان شخص است' }),
  'admissions_staging.userId': P('migratable'),

  // ── منشأ/ردّ کاری: «آخرین‌کسی که این سطر را دید» — جابه‌جایی بی‌خطر است ──
  'pos_transactions.operator_id': P('migratable', { note: 'اپراتورِ ثبت تراکنش' }),
  'exam_calendar_configs.updatedByUserId': P('migratable'),
  'legacy_code_maps.updatedByUserId': P('migratable'),
  'legacy_import_batches.createdByUserId': P('migratable'),
  'legacy_tuition_formulas.createdByUserId': P('migratable'),
  'migration_audit_entries.createdByUserId': P('migratable'),
  'migration_runs.triggeredByUserId': P('migratable'),
  'tuition_compare_runs.createdByUserId': P('migratable'),

  // ── شاهدِ رویداد یا تأییدِ انسانی: هرگز بازنویسی نمی‌شود ⇒ BLOCKED ──
  'audit_logs.actorUserId': P('immutable', { note: 'زنجیرهٔ هش دارد؛ بازنویسیِ actor یعنی جعلِ تاریخ' }),
  'grade_change_log.actorUserId': P('immutable', { note: 'دفترِ تغییرِ نمره' }),
  'curriculum_approvals.approvedByUserId': P('immutable', { note: 'امضای تأیید' }),
  'thesis_progress.proposalApprovedBy': P('immutable', { note: 'امضای تأییدِ پروپوزال' }),
  'student_discounts.approvedBy': P('immutable', { note: 'امضای تأییدِ تخفیف' }),
  'issued_degrees.issuedByUserId': P('immutable', { note: 'عملِ صدور مدرک' }),
  'kyc_verifications.reviewedBy': P('immutable', { note: 'داوریِ انسانی' }),
  'identity_resolution_reviews.reviewedBy': P('immutable', { note: 'داوریِ انسانیِ تطبیق هویت' }),
  'staff.userId': P('immutable', { note: 'پروندهٔ کارمندی؛ userId یکتا است' }),
  'notification_deliveries.userId': P('immutable', { note: 'سابقهٔ تحویل اعلان به حسابی که حذف می‌شود' }),
  'notification_logs.userId': P('immutable', { note: 'سابقهٔ اعلان' }),
});

/**
 * ستون‌هایی که اسمشان «کاربری» است ولی اصلاً به users.id اشاره نمی‌کنند.
 * وجودِ این فهرست به معنی «بی‌اهمیت» نیست؛ به معنی «بررسی شد و کنار گذاشته شد»
 * است — و رابط خط فرمان اگر ستونِ عددیِ ناشناخته‌ای پیدا کند که در هیچ‌کدام
 * از این دو فهرست نباشد، سخت‌گیرانه خطا می‌دهد.
 */
export const IGNORED_REFERENCE_COLUMNS = Object.freeze({
  // خودِ جدولِ users نمی‌تواند به خودش اشاره کند (personId → persons.id است)
  'users.personId': '→ persons.id؛ جدولِ مرجع خودش',
  // جدول‌های صحنهٔ ابزارهای ترمیم: ارجاع دارند ولی «شاهدِ رویداد» نیستند،
  // گزارشِ اجرایِ خشک‌اند نه دادهٔ زنده. (هر دو ابزار خودشان هم هستند.)
  'national_code_repair_staging.userId': 'جدولِ صحنهٔ fix-student-nc-v2 — گزارشِ اجرای خشک، نه دادهٔ زنده',
  'national_code_repair_staging.collisionUserId': 'همان — ستونِ «صاحبِ برخورد» در گزارشِ اجرای خشک',
  'user_merge_staging.orphanUserId': 'جدولِ صحنهٔ همین ابزار — گزارشِ اجرای خشک',
  'user_merge_staging.targetUserId': 'جدولِ صحنهٔ همین ابزار — گزارشِ اجرای خشک',
  // اشاره به staff.id
  'curriculum_approvals.approvedByStaffId': '→ staff.id',
  'curriculum_versions.createdByStaffId': '→ staff.id',
  'departments.headStaffId': '→ staff.id',
  'graduation_audits.headApprovedBy': '→ staff.id',
  'instructor_advances.approvedByFinanceId': '→ staff.id',
  'request_step_logs.actorStaffId': '→ staff.id',
  // اشاره به persons.id
  'students.personId': '→ persons.id (هویتِ فیزیکی، نه حسابِ کاربری)',
  'person_source_identities.personId': '→ persons.id',
  'identity_resolution_reviews.candidatePersonId': '→ persons.id',
  'thesis_progress.proposalFileId': '→ files/ID، شمارهٔ کاربر نیست',
  //  department
  'course_offerings.ownerDepartmentId': '→ departments.id',
  'scheduling_room_grants.ownerDepartmentId': '→ departments.id',
  // پول / وضعیت / بولی
  'instructor_advances.approvedAmount': 'عدد (ریال)، شمارهٔ کاربر نیست',
  'graduation_audits.headApprovalStatus': 'رشتهٔ وضعیت، شمارهٔ کاربر نیست',
  'short_term_registrations.certificateIssued': 'بولی',
  'student_requests.autoCreated': 'بولی',
  'students.certIssued3m': 'بولی',
});

/**
 * جدول‌های پشتیبان: ارجاع دارند ولی دادهٔ زنده نیستند (فقط گزارش می‌شوند).
 * الگو عامداً گشاد است: «…_backup…»، «backup_…»، «backup…_» و «backups_…».
 */
export const BACKUP_TABLE_PATTERN = '_backup|^backup|^backups_';

export const isBackupTable = (table) => new RegExp(BACKUP_TABLE_PATTERN).test(String(table));

// ── دلایل BLOCKED (ترتیب تقدم: اولین شرط برنده است) ────────────────────────

export const BLOCK_REASONS = Object.freeze({
  SAME_USER: 'SAME_USER',
  MISSING_ORPHAN: 'MISSING_ORPHAN_USER',
  MISSING_TARGET: 'MISSING_TARGET_USER',
  TARGET_IS_ORPHAN: 'TARGET_IS_ANOTHER_ORPHAN',
  CYCLE: 'MERGE_CHAIN_CYCLE',
  MULTIPLE_TARGETS: 'MULTIPLE_DISTINCT_TARGETS_FOR_ONE_ORPHAN',
  TARGET_HOLDS_OTHER_CODE: 'TARGET_NO_LONGER_HOLDS_THE_EXPECTED_CODE',
  TARGET_CODE_INVALID: 'TARGET_NATIONAL_CODE_IS_NOT_VALID_MOD11',
  ORPHAN_HAS_PERSON: 'ORPHAN_HAS_PERSON_ID',
  STUDENTS_OUT_OF_SCOPE: 'ORPHAN_HAS_STUDENT_ROWS_OUTSIDE_THE_PLAN',
  ORPHAN_HAS_NO_STUDENTS: 'ORPHAN_HAS_NO_STUDENT_ROWS',
  IMMUTABLE_REFERENCE: 'ORPHAN_HAS_IMMUTABLE_REFERENCE',
  UNIQUE_RISK: 'UNIQUE_CONFLICT_RISK_ON_MIGRATION',
  UNKNOWN_REFERENCE: 'UNDECLARED_REFERENCE_COLUMN_FOUND',
  CONCURRENT_MODIFICATION: 'STAGING_SNAPSHOT_NO_LONGER_MATCHES_DATABASE',
});

/** ترتیبِ بررسیِ دلایل — همان ترتیبِ BLOCK_REASONS است (Object.keys ترتیبِ درج را نگه می‌دارد). */
export const BLOCK_REASON_ORDER = Object.freeze(Object.values(BLOCK_REASONS));

// ── تجزیهٔ دلیل برخورد از خروجی fix-student-nc-v2 ──────────────────────────

/**
 * دلیل برخوردِ ابزار ترمیم را به شمارهٔ کاربرِ صاحبِ کد تبدیل می‌کند.
 * قالبِ ساخته‌شده در student-nc-repair.mjs دقیقاً همین است:
 *   PROPOSED_CODE_OWNED_BY_USER_<id>
 * @param {string} reason
 * @returns {number|null}
 */
export function parseCollisionOwnerId(reason) {
  const m = /^PROPOSED_CODE_OWNED_BY_USER_(\d+)$/.exec(String(reason ?? '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * فیلترِ سطرهای گزارش v2 که نامزدِ ادغام‌اند.
 * عمداً «reason» را دقیقاً با همان قالب می‌سنجد تا اگر روزی معنای آن عوض شد،
 * این ابزار ساکت‌سانی نکند و هیچ سطری را نامزد نگیرد.
 * @param {Array<Record<string, unknown>>} planRows سطرهای گزارشِ v2
 * @returns {MergeCandidate[]}
 */
export function pickMergeCandidates(planRows) {
  const out = [];
  for (const r of planRows || []) {
    const targetUserId = parseCollisionOwnerId(r.reason);
    if (targetUserId === null) continue;
    const orphanUserId = Number(r.userId);
    const studentId = Number(r.studentId);
    if (!Number.isInteger(orphanUserId) || !Number.isInteger(targetUserId) || !Number.isInteger(studentId)) continue;
    out.push({
      studentId,
      studentCode: String(r.studentCode ?? ''),
      universityCode: r.universityCode ?? null,
      orphanUserId,
      targetUserId,
      orphanCode: r.currentCode ?? null,
      orphanClass: r.currentClass ?? null,
      targetCode: r.proposedCode ?? null,
    });
  }
  return out;
}

// ── تشخیص زنجیره و چرخه ───────────────────────────────────────────────────

/**
 * نگاشت یتیم → هدف را می‌گیرد و زنجیره‌ها/چرخه‌ها/هم‌گرایی را گزارش می‌دهد.
 *
 *  fanIn : چند یتیم به یک هدف می‌روند (طبیعی — چند دانشجوی خراب به یک آدمِ درست).
 *  chain : هدفِ یک ادغام، خودش یتیمِ ادغامِ دیگری است ⇒ باید ترتیبِ اجرا
 *          معنادار باشد؛ ما ترتیب را تضمین نمی‌کنیم پس BLOCKED می‌شود.
 *  cycle : دنبال‌کردنِ هدف‌ها به نقطهٔ شروع برمی‌گردد.
 *
 * @param {Array<{orphanUserId:number,targetUserId:number}>} candidates
 * @returns {{ chains: Array<{chain:number[], terminal:number|null}>,
 *             cycles: Array<{cycle:number[]}>,
 *             multipleTargets: Array<{orphanUserId:number, targets:number[]}>,
 *             fanIn: Array<{targetUserId:number, count:number}>,
 *             orphanIds: Set<number>, targetIds: Set<number>,
 *             next: Map<number, Set<number>> }}
 */
export function detectMergeChains(candidates) {
  const next = new Map(); // orphan -> Set(target)
  const fanIn = new Map(); // target -> count
  for (const c of candidates || []) {
    if (!next.has(c.orphanUserId)) next.set(c.orphanUserId, new Set());
    next.get(c.orphanUserId).add(c.targetUserId);
    fanIn.set(c.targetUserId, (fanIn.get(c.targetUserId) || 0) + 1);
  }

  const multipleTargets = [...next.entries()].filter(([, v]) => v.size > 1).map(([o, v]) => ({ orphanUserId: o, targets: [...v] }));

  const chains = [];
  const cycles = [];
  for (const start of next.keys()) {
    const orphanHops = [start]; // فقط یتیم‌ها؛ هدفِ پایانی جدا گزارش می‌شود
    const seen = new Set([start]);
    let cur = start;
    let terminal = null;
    for (let i = 0; i < 64; i++) {
      const targets = next.get(cur);
      if (!targets || targets.size === 0) { terminal = cur; break; }
      const t = [...targets][0];
      if (seen.has(t)) { cycles.push({ cycle: [...orphanHops, t] }); terminal = t; break; }
      if (!next.has(t)) { terminal = t; break; } // هدف یتیمِ دیگری نیست ⇒ پایانِ زنجیره
      seen.add(t);
      orphanHops.push(t);
      cur = t;
    }
    // زنجیره یعنی «هدفِ یک ادغام خودش یتیمِ ادغامِ دیگری است» ⇒ طول ≥ ۲ یتیم
    if (orphanHops.length > 1) chains.push({ chain: orphanHops, terminal });
  }

  const uniqChains = [];
  const seenChain = new Set();
  for (const c of chains) {
    const key = c.chain.join('>');
    if (seenChain.has(key)) continue;
    seenChain.add(key);
    uniqChains.push(c);
  }

  return {
    chains: uniqChains,
    cycles,
    multipleTargets,
    fanIn: [...fanIn.entries()].filter(([, n]) => n > 1).map(([targetUserId, orphans]) => ({ targetUserId, count: orphans })),
    orphanIds: new Set(next.keys()),
    targetIds: new Set(fanIn.keys()),
    next,
  };
}

// ── طبقه‌بندی ایمنی ───────────────────────────────────────────────────────

/**
 * قلبِ کار: با داده‌های آمده تصمیم می‌گیرد که ادغام این جفتِ (یتیم، هدف) امن است.
 * کاملاً خالص: هیچ SQL، هیچ شبکه. آزمونِ واحد دقیقاً همین را می‌سنجد.
 *
 * @param {object} p
 * @param {number}  p.orphanUserId
 * @param {number}  p.targetUserId
 * @param {object|null} p.orphan      سطر users یتیم یا null اگر پیدا نشد
 * @param {object|null} p.target      سطر users هدف یا null
 * @param {number[]} p.plannedStudentIds همهٔ students.id که باید جابه‌جا شوند
 * @param {number} p.orphanStudentCount چند ردیف students به یتیم تعلق دارد
 * @param {Array<{table:string,column:string,count:number,uniqueRisk?:boolean}>} p.references
 *        شمارشِ واقعیِ ارجاع‌ها به users.id یتیم (غیر از students)
 * @param {boolean} p.targetIsOrphan  آیا هدف هم یتیمِ همین اجراست؟
 * @param {boolean} [p.inCycle]
 * @param {boolean} [p.unknownReferenceColumn]
 * @param {(code:string)=>boolean} [p.isValidCode] اعتبارسنج mod-11 (تزریق می‌شود تا این ماژول به ابزار وابسته نباشد)
 * @returns {{ mergeClass: string, blockedBy: string|null, reasons: string[],
 *             migratable: Array<{table:string,column:string,count:number,key:string,reason?:string}>,
 *             immutable: Array<{table:string,column:string,count:number,key:string,reason?:string}> }}
 */
export function classifyMerge({
  orphanUserId,
  targetUserId,
  orphan,
  target,
  plannedStudentIds = [],
  orphanStudentCount = 0,
  references = [],
  targetIsOrphan = false,
  inCycle = false,
  unknownReferenceColumn = false,
  isValidCode = () => true,
}) {
  const reasons = [];
  const immutable = [];
  const migratable = [];

  const block = (reason) => reasons.push(reason);

  // ── ۱) هویتِ دو ردیف ──
  //  شناسه‌ها باید عددِ صحیحِ مثبت باشند؛ ورودیِ ناقص یعنی «نمی‌دانیم» و
  //  «نمی‌دانیم» هیچ‌وقت اجازهٔ نوشتن نمی‌گیرد.
  if (!Number.isInteger(Number(orphanUserId)) || Number(orphanUserId) <= 0) block(BLOCK_REASONS.MISSING_ORPHAN);
  if (!Number.isInteger(Number(targetUserId)) || Number(targetUserId) <= 0) block(BLOCK_REASONS.MISSING_TARGET);
  if (Number(orphanUserId) === Number(targetUserId)) block(BLOCK_REASONS.SAME_USER);
  if (!orphan) block(BLOCK_REASONS.MISSING_ORPHAN);
  if (!target) block(BLOCK_REASONS.MISSING_TARGET);
  if (targetIsOrphan) block(BLOCK_REASONS.TARGET_IS_ORPHAN);
  if (inCycle) block(BLOCK_REASONS.CYCLE);

  // ── ۲) کدِ هدف: ادغام وقتی معنا دارد که هدف واقعاً کدِ معتبر را نگه دارد ──
  if (target) {
    const code = target.nationalCode;
    if (!code) block(BLOCK_REASONS.TARGET_HOLDS_OTHER_CODE);
    else if (!isValidCode(String(code))) block(BLOCK_REASONS.TARGET_CODE_INVALID);
  }

  // ── ۳) شخصِ فیزیکی: ادغامِ دو حسابِ یک شخص نباید دو ردیف persons را رها کند ──
  if (orphan && orphan.personId !== null && orphan.personId !== undefined) block(BLOCK_REASONS.ORPHAN_HAS_PERSON);

  // ── ۴) دامنهٔ ردیف‌های دانشجو: همهٔ ردیف‌های یتیم باید در طرح باشند وگرنه
  //      حذف users آن‌ها را رها می‌کند (students.userId نال‌ناپذیر است). ──
  const planned = new Set(plannedStudentIds.map(Number));
  if (orphanStudentCount === 0) block(BLOCK_REASONS.ORPHAN_HAS_NO_STUDENTS);
  if (planned.size !== orphanStudentCount) block(BLOCK_REASONS.STUDENTS_OUT_OF_SCOPE);

  // ── ۵) ارجاع‌ها ──
  for (const ref of references) {
    const key = `${ref.table}.${ref.column}`;
    const policy = USER_REFERENCE_POLICY[key];
    if (!policy) {
      block(BLOCK_REASONS.UNKNOWN_REFERENCE);
      continue;
    }
    if (policy.role === 'planned') continue; // خودِ عملیات
    if (!ref.count) continue;
    if (policy.role === 'immutable') {
      immutable.push({ ...ref, key, reason: policy.note });
      block(BLOCK_REASONS.IMMUTABLE_REFERENCE);
      continue;
    }
    if (policy.uniqueGuard && ref.uniqueRisk) {
      block(`${BLOCK_REASONS.UNIQUE_RISK}:${key}`);
      continue;
    }
    migratable.push({ ...ref, key, reason: policy.note });
  }
  if (unknownReferenceColumn) block(BLOCK_REASONS.UNKNOWN_REFERENCE);

  const mergeClass = reasons.length ? MERGE_CLASSES.BLOCKED : migratable.length ? MERGE_CLASSES.MIGRATE : MERGE_CLASSES.SAFE;
  return { mergeClass, blockedBy: reasons.length ? reasons[0] : null, reasons, migratable, immutable };
}

/**
 * نگاشت «کدام یتیم به کدام هدف» ⇒ نگاشت «کدام یتیم به کدام هدف» برای اجرا.
 * برای هر جفت فقط یک «عملیاتِ ادغامِ کاربر» می‌سازد، چون حذفِ users یک‌بار
 * انجام می‌شود و همهٔ ردیف‌های دانشجویش با هم جابه‌جا می‌شوند.
 * نگاشتِ یتیم→چند هدف یا بالعکس ⇒ رکوردِ ناسازگار که BLOCKED می‌شود.
 *
 * @param {Array<{orphanUserId:number,targetUserId:number,studentId:number,studentCode?:string}>} candidates
 * @returns {{ operations: Array<{orphanUserId:number,targetUserId:number|null,studentIds:number[],
 *             studentCodes:string[], inconsistent:boolean, conflictingTarget?:number}>,
 *             inconsistent: Array<{orphanUserId:number,targetUserId:number|null,studentIds:number[],
 *             studentCodes:string[], inconsistent:boolean, conflictingTarget?:number}> }}
 */
export function groupIntoMergeOperations(candidates) {
  const byOrphan = new Map();
  for (const c of candidates || []) {
    if (!byOrphan.has(c.orphanUserId)) {
      byOrphan.set(c.orphanUserId, { orphanUserId: c.orphanUserId, targetUserId: c.targetUserId, studentIds: [], studentCodes: [], meta: c });
    }
    const op = byOrphan.get(c.orphanUserId);
    op.studentIds.push(c.studentId);
    op.studentCodes.push(c.studentCode);
    if (op.targetUserId !== c.targetUserId) {
      op.conflictingTarget = c.targetUserId;
      op.targetUserId = null; // عمداً نامعتبر تا BLOCKED شود
    }
  }
  const operations = [...byOrphan.values()].map((o) => ({
    ...o,
    inconsistent: !o.targetUserId || o.targetUserId === o.orphanUserId,
  }));
  return { operations, inconsistent: operations.filter((o) => o.inconsistent) };
}

/**
 * خلاصهٔ سطل‌ها برای گزارش.
 * @param {Array<{mergeClass:string}>} rows
 * @returns {{ MERGE_SAFE: number, MERGE_WITH_DATA_MIGRATION: number, BLOCKED: number }}
 */
export function summarizeMergeClasses(rows) {
  const s = { [MERGE_CLASSES.SAFE]: 0, [MERGE_CLASSES.MIGRATE]: 0, [MERGE_CLASSES.BLOCKED]: 0 };
  for (const r of rows || []) if (s[r.mergeClass] !== undefined) s[r.mergeClass]++;
  return s;
}

/**
 * خلاصهٔ شواهدِ ارجاع به شکل متنِ کوتاهِ قابلِ چاپ:
 *   "user_roles=0 · sessions=0 · notifications=3 · …"
 *
 * دو قاعده:
 *  ۱) ستون‌هایی که نقشِ `planned` دارند (یعنی students.userId — خودِ عملیاتِ
 *     ادغام) هرگز «ارجاع» شمرده نمی‌شوند؛ گفتنِ «۸۹ ارجاع به students»
 *     گمراه‌کننده است چون آن ۸۹ دقیقاً چیزی است که داریم جابه‌جا می‌کنیم.
 *  ۲) فقط ستون‌های با شمارشِ غیرصفر نوشته می‌شوند تا گزارش خوانا بماند؛
 *     صفر یعنی «شمرده شد و چیزی نبود»، نه «بررسی نشد».
 * @param {Array<{table:string,column:string,count:number}>} references
 */
export function formatReferenceEvidence(references) {
  const nz = (references || []).filter((r) => {
    const policy = USER_REFERENCE_POLICY[`${r.table}.${r.column}`];
    if (policy && policy.role === 'planned') return false;
    return r.count > 0;
  });
  if (!nz.length) return 'هیچ ارجاعی (صفر) — تنها ارجاع، همین ردیف‌های students بوده';
  return nz.map((r) => `${r.table}.${r.column}=${r.count}`).join(' · ');
}
