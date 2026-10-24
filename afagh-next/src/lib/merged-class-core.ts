/**
 * ═══════════════════════════════════════════════════════════════════════
 *  «کلاس ادغامی» — یک جلسهٔ فیزیکی، چند ردیفِ داده
 *
 *  چرا این ماژول لازم شد (درخواست آموزش):
 *  ─────────────────────────────────────────────────────────────────────
 *  در اتاق ۱۲۳ درسِ «ریاضی» و «ریاضی ۱» هر دو با یک استاد و هر دو ساعت ۸
 *  ارائه می‌شوند. در عمل **یک** کلاس است، ولی در دادهٔ سما دو عرضهٔ جدا است
 *  و هر عرضه جلسهٔ خودش را در `class_sessions` دارد. نتیجه:
 *
 *    • در کارتابل کنترل‌کننده دو ردیف برای یک کلاس دیده می‌شود
 *    · استاد باید دو بار «ثبت حضور» بزند
 *    · اگر یکی را فراموش کند، حقوقِ همان جلسه ناقص محاسبه می‌شود
 *
 *  راه‌حل: ردیف‌های ادغامی در «نمایش» یکی می‌شوند (فقط ردیف نماینده با نشان
 *  🔗) و در «ثبت» خودکار روی همهٔ اعضا اعمال می‌شود.
 *
 *  قاعدهٔ تشخیصِ ادغام (همان قاعدهٔ بقیهٔ سامانه):
 *    الف) هر دو `sharedScheduleGroupKey` یکسان و غیرِ `SOLO-` داشته باشند
 *        (ادغامِ دستیِ کارشناس در صفحهٔ تداخل‌ها) — برندهٔ مطلق
 *    ب) روز/ساعتِ شروع و پایان دقیقاً یکی، استاد یکی، و اتاق یکی
 *        (ادغامِ خودکار — همان چیزی که تقویم استاد و تابلوی هفتگی می‌گویند)
 *
 *  ⚠ چرا «استادِ یکسان» شرط است: اگر دو استادِ متفاوت در یک اتاق و یک ساعت
 *    باشند آن «تداخل واقعی» است، نه کلاس ادغامی؛ ثبت حضورِ یکی نباید حضورِ
 *    دیگری را هم بزند.
 *
 *  ⚠ چرا «ساعتِ دقیقاً یکسان» و نه تلورانس ۲۰ دقیقه‌ای: در سما اختلافِ چند
 *    دقیقه طبیعی است، ولی آن حالت‌ها کارشناس با یک کلیک در صفحهٔ تداخل‌ها
 *    «ادغام» می‌کند و از آن لحظه کلیدِ دستی (حالت الف) دارند. خودکارِ
 *    تلورانسی می‌توانست دو کلاسِ واقعاً جدا را یکی کند.
 *
 *  این فایل خالص است (بدون DB، بدون fs) تا `tsx` بتواند رفتارش را تست کند.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** حداقلِ ستون‌هایی که برای تشخیصِ ادغام لازم است — هر سه صفحهٔ حضور دارند */
export interface MergableSessionRow {
  sessionId: number;
  offeringId: number;
  /** اتاقِ حل‌شده (نه `class_sessions.roomId` که عملاً خالی است) */
  roomId: number | null;
  /** 'HH:MM' */
  startTime: string;
  /** 'HH:MM' */
  endTime: string;
  /** `course_offerings.professorId` */
  professorId: number | null;
  /** `course_offerings.sharedScheduleGroupKey` */
  sharedScheduleGroupKey?: string | null;
}

/** 'HH:MM' یا 'HH:MM:SS' → 'HH:MM'؛ مقدارِ بد → null */
export function normSessionTime(v: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * کلیدِ گروهِ ادغامیِ یک جلسه — `null` یعنی «ادغامی نیست».
 *
 * پیشوندها (همان قراردادِ صفحهٔ «ادغام عرضه‌ها» — `api/admin/offering-merge`):
 *   `K:<key>`   ادغامِ دستیِ کارشناس — برندهٔ مطلق
 *   `SOLO:<id>` کارشناس عمداً این عرضه را جدا کرده → هرگز با کسی گروه نمی‌شود
 *   `A:…`       ادغامِ خودکار (ساعت/استاد/اتاق)
 *
 * ⚠ چرا SOLO به «گروهِ یکتا» می‌رود و نه « fall through به خودکار»: منظورِ
 *   «جدا کردن» این است که این دو کلاس **یکی نیستند**. اگر به قاعدهٔ خودکار
 *   برگردد، دو عرضهٔ SOLO با ساعت و اتاقِ یکسان دوباره یکی می‌شوند و کلیدِ
 *   دستیِ کارشناس بی‌اثر می‌شود. (همان قاعدهٔ `isMergedPair` در
 *   `schedule-conflicts-core.ts`.)
 */
export function sessionMergeKey(r: MergableSessionRow): string | null {
  const shared = String(r.sharedScheduleGroupKey ?? '').trim();
  if (shared) {
    if (shared.startsWith('SOLO-')) return `SOLO:${r.offeringId}`;
    return `K:${shared}`;
  }

  const st = normSessionTime(r.startTime);
  const en = normSessionTime(r.endTime);
  if (!st || !en) return null;
  if (r.roomId == null) return null;
  if (r.professorId == null) return null;
  return `A:${r.roomId}|${r.professorId}|${st}|${en}`;
}

/** یک «کلاس فیزیکی» — ممکن است از چند جلسهٔ داده تشکیل شده باشد */
export interface MergedSessionGroup<T> {
  key: string | null;
  /** آیا بیش از یک جلسه دارد؟ (فقط این‌ها باید نشان 🔗 بگیرند) */
  merged: boolean;
  /** شناسهٔ جلسهٔ نماینده — همان چیزی که کاربر می‌بیند و رویش کلیک می‌کند */
  primarySessionId: number;
  /** همهٔ جلسه‌های عضو، مرتب‌شده — «ثبت» روی همهٔ این‌ها اعمال می‌شود */
  memberSessionIds: number[];
  members: T[];
}

/**
 * ردیف‌های جلسه را به «کلاس فیزیکی» گروه می‌کند.
 *
 * ترتیبِ ورودی حفظ می‌شود (خروجی به ترتیبِ اولین حضورِ هر گروه) تا صفحه‌ها
 * با مرتب‌سازیِ سرورِ خودشان واگرا نشوند. نماینده = کوچک‌ترین sessionId گروه.
 */
export function groupSessionsIntoMerged<T extends MergableSessionRow>(
  rows: readonly T[],
): MergedSessionGroup<T>[] {
  const groups: MergedSessionGroup<T>[] = [];
  const byKey = new Map<string, MergedSessionGroup<T>>();

  for (const row of rows) {
    const k = sessionMergeKey(row);
    if (k == null) {
      groups.push({
        key: null,
        merged: false,
        primarySessionId: row.sessionId,
        memberSessionIds: [row.sessionId],
        members: [row],
      });
      continue;
    }
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, merged: false, primarySessionId: row.sessionId, memberSessionIds: [], members: [] };
      byKey.set(k, g);
      groups.push(g);
    }
    g.members.push(row);
  }

  for (const g of groups) {
    if (g.members.length > 1) {
      g.merged = true;
      g.members = [...g.members].sort((a, b) => a.sessionId - b.sessionId);
      g.memberSessionIds = g.members.map(m => m.sessionId);
      g.primarySessionId = g.memberSessionIds[0];
    } else {
      g.memberSessionIds = g.members.map(m => m.sessionId);
      g.primarySessionId = g.memberSessionIds[0];
    }
  }

  return groups;
}

/** متنِ نشانِ ادغام برای UI — مثلاً «۳ کلاس ادغامی» */
export function mergeBadgeText(memberCount: number): string {
  const n = Math.max(0, Math.floor(memberCount));
  const fa = String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  return n === 1 ? 'یک کلاس' : `${fa} کلاس ادغامی`;
}

/**
 * توضیحِ تکمیلیِ نشانِ ادغام — نامِ درس‌های عضو.
 * مثلاً «ریاضی · ریاضی ۱»
 *
 * `title` یا `courseTitle` پذیرفته می‌شود تا هر سه صفحهٔ حضور (که نامِ درس را
 * در ستونِ خودشان دارند) بدون نگاشتِ اضافه از آن استفاده کنند.
 */
export function mergeMemberTitles(
  members: readonly { title?: string | null; courseTitle?: string | null }[],
): string {
  const titles = [...new Set(
    members
      .map(m => String(m.title ?? m.courseTitle ?? '').trim())
      .filter(t => t !== ''),
  )];
  return titles.join(' · ');
}
