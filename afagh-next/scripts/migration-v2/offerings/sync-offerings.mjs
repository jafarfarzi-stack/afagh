#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Synchronize Offerings & Weekly Schedules
 *  — ورود و تطبیق ساخت‌یافته ارائه‌ها از فایل خروجی سما (برنامه هفتگي.txt)
 *  — تجمیع جلسات چندگانه کلاسی برای هر ارائه
 *  — به‌روزرسانی اساتید و رفع ارائه‌های موقت TRANSFER
 * ══════════════════════════════════════════════════════════════════════
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as logger from '../core/logger.mjs';
import { closePool, query } from '../core/db.mjs';
import { parseSamaScheduleSlot } from './schedule-parser.mjs';
import { importOfferingsBatch } from './offering-importer.mjs';

const rawArgs = process.argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i].startsWith('--')) {
    const key = rawArgs[i].slice(2);
    args[key] = (rawArgs[i + 1] && !rawArgs[i + 1].startsWith('--')) ? rawArgs[++i] : 'true';
  }
}

function findCandidateDir() {
  if (args.dir) return args.dir;
  const candidates = [
    '/data',
    '/data/information afagh',
    '/data/information-afagh',
    '/root/information afagh',
    '/root/information-afagh',
    '/root/afagh/information afagh',
    join(process.cwd(), '..', 'information afagh'),
    join(process.cwd(), 'information afagh'),
    'E:\\git\\information afagh',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

const DIR = findCandidateDir();

function findInDir(dir, pattern) {
  try {
    if (!existsSync(dir)) return null;
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      try { if (!statSync(p).isFile()) continue; } catch { continue; }
      if (pattern.test(n)) return p;
    }
  } catch {}
  return null;
}

function resolveScheduleFile() {
  if (args.file) return args.file;
  // جستجو در پوشه انتخاب‌شده
  const foundInDir = findInDir(DIR, /برنامه\s*هفتگ[يی]/i);
  if (foundInDir) return foundInDir;

  // بررسی مستقیم در دایرکتوری‌های کاندید
  const candidates = [
    '/data/برنامه هفتگي.txt',
    '/data/برنامه هفتگی.txt',
    join(process.cwd(), '..', 'information afagh', 'برنامه هفتگي.txt'),
    join(process.cwd(), '..', 'information afagh', 'برنامه هفتگی.txt'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return join(DIR, 'برنامه هفتگي.txt');
}

const FILE = resolveScheduleFile();
const DRY = args.dry === 'true';
const LIMIT = args.limit ? parseInt(args.limit, 10) : 0;
const UNI_ID = args.uni ? parseInt(args.uni, 10) : 1;

async function run() {
  if (!existsSync(FILE)) {
    logger.error(
      `فایل برنامه هفتگی یافت نشد: ${FILE}\nلطفاً با سوییچ --dir یا --file مسیر دقیق را مشخص کنید:\n` +
      `مثال: node scripts/migration-v2/offerings/sync-offerings.mjs --dir "/مسیر/پوشه/داده‌ها"\n` +
      `یا:   node scripts/migration-v2/offerings/sync-offerings.mjs --file "/مسیر/کامل/برنامه هفتگي.txt"`
    );
    process.exit(1);
  }

  logger.info(`در حال خواندن فایل برنامه هفتگی از: ${FILE}`);
  const content = readFileSync(FILE, 'utf8');
  const lines = content.split('\n');

  // تجمیع سطرها بر اساس (TermCode, LessonCode, LessonGroup)
  const offeringsMap = new Map();

  let headerPassed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.includes('TermCode') && line.includes('LessonCode')) {
      headerPassed = true;
      continue;
    }
    if (!headerPassed && i < 3) {
      if (line.includes('TermCode')) {
        headerPassed = true;
        continue;
      }
    }

    const parts = line.split('\t');
    if (parts.length < 4) continue;

    const rawTerm = parts[0]?.trim();
    const rawCourse = parts[1]?.trim();
    const rawGroup = parts[2]?.trim() || '1';
    const rawDon = parts[3]?.trim();

    // فیلتر رکوردهای نامعتبر یا تستی
    if (!rawTerm || rawTerm === '0' || !rawCourse || rawCourse === '0') {
      continue;
    }

    const key = `${rawTerm}|${rawCourse}|${rawGroup}`;
    if (!offeringsMap.has(key)) {
      offeringsMap.set(key, {
        termCode: rawTerm,
        courseCode: rawCourse,
        groupNumber: parseInt(rawGroup, 10) || 1,
        professorCode: rawDon && rawDon !== '0' && rawDon !== '-1' ? rawDon : null,
        capacity: 40,
        schedules: [],
        classroomName: null,
      });
    }

    const off = offeringsMap.get(key);

    // به‌روزرسانی کد استاد در صورت وجود
    if (!off.professorCode && rawDon && rawDon !== '0' && rawDon !== '-1') {
      off.professorCode = rawDon;
    }

    // استخراج اطلاعات جلسه کلاسی
    const slot = parseSamaScheduleSlot({
      dayCode: parts[4],
      startTime: parts[5],
      endTime: parts[6],
      placeCode: parts[7],
      weeklyCrossTypeID: parts[12],
    });

    if (slot.hasSchedule) {
      off.schedules.push(slot);
      if (!off.classroomName && slot.roomCode) {
        off.classroomName = slot.roomCode;
      }
    }
  }

  let list = Array.from(offeringsMap.values());
  logger.info(`تعداد کل ارائه‌های یکتا استخراج‌شده: ${list.length}`);

  if (LIMIT > 0) {
    list = list.slice(0, LIMIT);
    logger.info(`اعمال محدودیت بر اساس --limit: ${list.length} ارائه`);
  }

  const stats = await importOfferingsBatch(list, UNI_ID, { dryRun: DRY });
  console.log('\n--- خلاصه گزارش عملیات واردسازی ارائه‌ها ---');
  console.log(JSON.stringify(stats, null, 2));

  await closePool();
}

run().catch(async (err) => {
  logger.error(`خطای پیش‌بینی نشده: ${err.message}`, { stack: err.stack });
  await closePool();
  process.exit(1);
});
