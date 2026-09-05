import 'server-only';
import crypto from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  api_audit_logs,
  integrations_config,
  process_steps,
  step_api_actions,
  student_requests,
} from '@/db/schema';
import { getNumber, getSetting } from '@/lib/settings';
import { isDemoMode } from '@/lib/auth';
import { students, users } from '@/db/schema';

export interface IntegrationServiceDef {
  serviceName: string;
  titleFa: string;
  baseUrl: string;
  authType: string;
  description: string;
  sampleEndpoint: string;
}

/**
 * سرویس‌های داخلی سامانه — نشانی و کلید هیچ‌کدام در کد ثابت نیست:
 * پنل مدیر (پیکربندی سامانه) ← ENV ← خالی (سرویس غیرفعال).
 */
export async function builtinIntegrations(): Promise<IntegrationServiceDef[]> {
  const [irandoc, kyc, shaparak, sajjad] = await Promise.all([
    getSetting('IRANDOC_BASE_URL'),
    getSetting('KYC_BASE_URL'),
    getSetting('SHAPARAK_BASE_URL'),
    getSetting('SAJJAD_BASE_URL'),
  ]);
  return [
    {
      serviceName: 'IRANDOC_SIMILARITY',
      titleFa: 'سامانه همانندجویی ایرانداک (پایان‌نامه و مقالات)',
      baseUrl: irandoc,
      authType: 'Bearer_Token',
      description: 'استعلام خودکار درصد مشابهت متون دانشگاهی و دریافت گواهی دیجیتال اصالت پایان‌نامه.',
      sampleEndpoint: '/similarity-check',
    },
    {
      serviceName: 'CIVIL_REGISTRY_KYC',
      titleFa: 'سامانه احراز هویت ثبت احوال و شاهکار',
      baseUrl: kyc,
      authType: 'API_Key',
      description: 'تطبیق برخط کدملی با شماره همراه و دریافت اطلاعات شناسنامه‌ای.',
      sampleEndpoint: '/verify-national-id',
    },
    {
      serviceName: 'SHAPARAK_PAYMENT',
      titleFa: 'درگاه یکپارچه پرداخت شاپرک',
      baseUrl: shaparak,
      authType: 'OAuth2',
      description: 'تسویه الکترونیک شهریه، بدهی صندوق رفاه و کارمزد صدور دانشنامه.',
      sampleEndpoint: '/verify-transaction',
    },
    {
      serviceName: 'MINISTRY_CERT_INQUIRY',
      titleFa: 'سامانه استعلام اصالت مدارک وزارت علوم (سجاد)',
      baseUrl: sajjad,
      authType: 'Bearer_Token',
      description: 'استعلام دانشنامه و ریزنمرات مقاطع قبلی دانشجو جهت تطبیق واحد و پذیرش.',
      sampleEndpoint: '/degree-inquiry',
    },
  ];
}

export async function ensureDefaultIntegrations() {
  try {
    for (const s of await builtinIntegrations()) {
      const [existing] = await db
        .select()
        .from(integrations_config)
        .where(eq(integrations_config.serviceName, s.serviceName))
        .limit(1);

      if (!existing) {
        await db.insert(integrations_config).values({
          serviceName: s.serviceName,
          baseUrl: s.baseUrl,
          authType: s.authType,
          authCredentials: '',
          timeoutSeconds: await getNumber('API_TIMEOUT_SECONDS', 10),
          isActive: 1,
        });
      }
    }
  } catch (err) {
    console.error('Error ensuring integrations:', err);
  }
}

// ============================================================================
// شبیه‌ساز و اجرای واقعی استعلام همانندجویی ایرانداک (Irandoc Plagiarism Check)
// ============================================================================

export interface IrandocCheckResult {
  status: 'COMPLETED' | 'REJECTED' | 'FAILED';
  similarityPercentage: number;
  maxAllowedThreshold: number;
  certificateUrl: string;
  trackingCode: string;
  thesisTitle: string;
  decision: 'AUTO_APPROVE' | 'REJECT_EXCEED_LIMIT' | 'MANUAL_REVIEW';
  message: string;
  durationMs: number;
}

/**
 * استعلام واقعی همانندجویی ایرانداک:
 *   • اگر IRANDOC_BASE_URL پیکربندی شده باشد → درخواست HTTP واقعی (POST /similarity-check)
 *   • در غیر این صورت فقط در حالت دمو محاسبهٔ قطعی محلی (با برچسب صریح «دمو»)
 *   • در production بدون پیکربندی → FAILED (هرگز جواب ساختگی)
 */
export async function executeIrandocCheck(params: {
  nationalCode: string;
  trackingCode: string;
  thesisTitle: string;
  docHash?: string;
  maxAllowedThreshold?: number;
}): Promise<IrandocCheckResult> {
  const startTime = Date.now();
  const threshold = params.maxAllowedThreshold ?? 20.0;
  const irandocBase = (await getSetting('IRANDOC_BASE_URL')).replace(/\/+$/, '');

  const audit = (status: number, body: unknown, ok: boolean) =>
    db.insert(api_audit_logs).values({
      serviceName: 'IRANDOC_SIMILARITY',
      requestUrl: (irandocBase || 'LOCAL') + '/similarity-check',
      requestPayload: JSON.stringify({
        national_id: params.nationalCode,
        tracking_code: params.trackingCode,
        thesis_title: params.thesisTitle,
      }),
      responseStatus: status,
      responseBody: JSON.stringify(body),
      durationMs: Date.now() - startTime,
      isSuccess: ok ? 1 : 0,
    }).catch(err => console.error('API audit log failed:', err));

  // ── مسیر ۱: اتصال واقعی به سرویس ──
  if (irandocBase) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`${irandocBase}/similarity-check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          national_id: params.nationalCode,
          tracking_code: params.trackingCode,
          thesis_title: params.thesisTitle,
          doc_hash: params.docHash ?? null,
          max_allowed_threshold: threshold,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const text = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
      const data = JSON.parse(text) as Record<string, unknown>;
      const similarity = Number(data.similarity ?? data.similarity_percent ?? data.similarityPercentage);
      const decision = String(data.decision ?? '');
      if (Number.isNaN(similarity)) throw new Error('پاسخ سرویس فاقد درصد مشابهت است.');
      const isApproved = similarity <= threshold;
      const result: IrandocCheckResult = {
        status: isApproved ? 'COMPLETED' : 'REJECTED',
        similarityPercentage: similarity,
        maxAllowedThreshold: threshold,
        certificateUrl: `${irandocBase}/cert/verify-${params.trackingCode}.pdf`,
        trackingCode: params.trackingCode,
        thesisTitle: params.thesisTitle,
        decision: decision === 'AUTO_APPROVE' ? 'AUTO_APPROVE' : isApproved ? 'AUTO_APPROVE' : 'REJECT_EXCEED_LIMIT',
        message: String(data.message ?? (isApproved
          ? `همانندجویی انجام شد: مشابهت ${similarity}٪ در محدودهٔ مجاز (زیر ${threshold}٪).`
          : `درصد مشابهت (${similarity}٪) از سقف مجاز (${threshold}٪) بیشتر است — نیاز به اصلاح متن.`)),
        durationMs: Date.now() - startTime,
      };
      await audit(200, result, true);
      return result;
    } catch (err) {
      const result: IrandocCheckResult = {
        status: 'FAILED',
        similarityPercentage: 0,
        maxAllowedThreshold: threshold,
        certificateUrl: '',
        trackingCode: params.trackingCode,
        thesisTitle: params.thesisTitle,
        decision: 'MANUAL_REVIEW',
        message: `اتصال به سرویس همانندجویی ناموفق بود: ${(err as Error).message} — بررسی دستی توسط کارشناس.`,
        durationMs: Date.now() - startTime,
      };
      await audit(502, result, false);
      return result;
    }
  }

  // ── مسیر ۲: فقط دمو — محاسبهٔ قطعی محلی با برچسب صریح ──
  if (isDemoMode()) {
    let similarity = 14.2;
    const hashVal = params.docHash || params.trackingCode;
    if (hashVal.includes('FAIL') || hashVal.includes('PLAGIARISM') || params.thesisTitle.includes('تکراری')) {
      similarity = 28.5;
    } else {
      const charCodeSum = hashVal.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      similarity = Number((8.0 + (charCodeSum % 105) / 10).toFixed(1));
    }
    const durationMs = Math.floor(180 + Math.random() * 220);
    const isApproved = similarity <= threshold;
    const result: IrandocCheckResult = {
      status: isApproved ? 'COMPLETED' : 'REJECTED',
      similarityPercentage: similarity,
      maxAllowedThreshold: threshold,
      certificateUrl: '',
      trackingCode: params.trackingCode,
      thesisTitle: params.thesisTitle,
      decision: isApproved ? 'AUTO_APPROVE' : 'REJECT_EXCEED_LIMIT',
      message: isApproved
        ? `[دمو — بدون اتصال به سرویس] مشابهت محاسبه‌شده ${similarity}٪ (زیر ${threshold}٪).`
        : `[دمو — بدون اتصال به سرویس] مشابهت محاسبه‌شده ${similarity}٪ — بالای سقف ${threshold}٪.`,
      durationMs,
    };
    await audit(200, result, isApproved);
    return result;
  }

  // ── مسیر ۳: production بدون پیکربندی → صادقانه FAILED ──
  const result: IrandocCheckResult = {
    status: 'FAILED',
    similarityPercentage: 0,
    maxAllowedThreshold: threshold,
    certificateUrl: '',
    trackingCode: params.trackingCode,
    thesisTitle: params.thesisTitle,
    decision: 'MANUAL_REVIEW',
    message: 'سرویس همانندجویی ایرانداک پیکربندی نشده است (IRANDOC_BASE_URL).',
    durationMs: Date.now() - startTime,
  };
  await audit(503, result, false);
  return result;
}

export async function executeStepServiceTask(params: {
  stepId: number;
  requestId: number;
  formData: Record<string, any>;
}) {
  const [step] = await db
    .select()
    .from(process_steps)
    .where(eq(process_steps.id, params.stepId))
    .limit(1);

  if (!step || step.stepType !== 'AUTO_INTEGRATION') {
    return { ok: false, error: 'این مرحله از نوع وظیفه سیستمی خودکار نیست.' };
  }

  const [req] = await db
    .select()
    .from(student_requests)
    .where(eq(student_requests.id, params.requestId))
    .limit(1);

  if (!req) return { ok: false, error: 'درخواست یافت نشد.' };

  // بررسی سناریوی استعلام همانندجویی پایان‌نامه
  if (params.formData?.thesisTitleFa || params.formData?.irandocTracking) {
    // کد ملی واقعی متقاضی (نه مقدار ثابت)
    const [applicant] = await db
      .select({ nationalCode: users.nationalCode })
      .from(student_requests)
      .innerJoin(students, eq(students.id, student_requests.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(eq(student_requests.id, params.requestId))
      .limit(1);
    const irandocRes = await executeIrandocCheck({
      nationalCode: applicant?.nationalCode ?? 'UNKNOWN',
      trackingCode: params.formData.irandocTracking || req.trackingCode,
      thesisTitle: params.formData.thesisTitleFa || 'پایان‌نامه کارشناسی ارشد',
      docHash: req.digitalStampHash || undefined,
    });

    return {
      ok: true,
      serviceName: 'IRANDOC_SIMILARITY',
      result: irandocRes,
      shouldAutoApprove: irandocRes.decision === 'AUTO_APPROVE',
    };
  }

  return { ok: true, message: 'وظیفه خودکار با موفقیت اجرا شد.' };
}

// ============================================================================
// دریافت گزارش تاریخچه ممیزی APIها (API Audit Trail)
// ============================================================================

export async function getApiAuditTrail() {
  await ensureDefaultIntegrations();

  const logs = await db
    .select()
    .from(api_audit_logs)
    .orderBy(desc(api_audit_logs.id))
    .limit(30);

  return logs;
}
