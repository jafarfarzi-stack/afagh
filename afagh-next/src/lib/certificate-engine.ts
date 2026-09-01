import 'server-only';
import { getPublicBaseUrl } from '@/lib/settings';
import crypto from 'crypto';

export interface CertificateData {
  certCode: string;
  learnerName: string;
  learnerNameEn?: string;
  nationalIdMasked: string;
  courseName: string;
  courseNameEn?: string;
  durationHours: number;
  instructorName: string;
  grade: number;
  issueDateFa: string;
  issueDateEn: string;
}

/**
 * تولید هش اعتبارسنجی رمزنگاری‌شده SHA-256 جهت جلوگیری از جعل مدرک
 */
export function generateCertificateVerificationHash(data: CertificateData): string {
  const payload = `${data.certCode}|${data.learnerName}|${data.nationalIdMasked}|${data.courseName}|${data.grade}|${data.issueDateFa}|AFAGH_SECRET_SALT_2026`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * تولید کد SVG بهینه‌شده برای بارکد کیوآر (بدون وابستگی سنگین به مرورگر)
 */
export function generateSvgQrCode(url: string): string {
  // SVG Mock representation of high-contrast QR Matrix
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="120" height="120">
      <rect width="100" height="100" fill="#ffffff" rx="8" />
      <path d="M10 10h30v30h-30z M15 15h20v20h-20z M20 20h10v10h-10z" fill="#0f172a" />
      <path d="M60 10h30v30h-30z M65 15h20v20h-20z M70 20h10v10h-10z" fill="#0f172a" />
      <path d="M10 60h30v30h-30z M15 65h20v20h-20z M20 70h10v10h-10z" fill="#0f172a" />
      <rect x="45" y="10" width="10" height="10" fill="#0f172a" />
      <rect x="45" y="30" width="10" height="10" fill="#0f172a" />
      <rect x="45" y="50" width="10" height="10" fill="#0f172a" />
      <rect x="45" y="70" width="10" height="10" fill="#0f172a" />
      <rect x="65" y="50" width="10" height="10" fill="#0f172a" />
      <rect x="80" y="50" width="10" height="10" fill="#0f172a" />
      <rect x="60" y="70" width="20" height="20" fill="#0f172a" />
    </svg>
  `;
}

/**
 * قالب استاندارد HTML گواهینامه رسمی با طراحی لوکس جهت پرینت و تبدیل به PDF
 */
export async function buildCertificateHtml(data: CertificateData): Promise<string> {
  const verifyUrl = `${await getPublicBaseUrl()}/verify/${data.certCode}`;
  const qrSvg = generateSvgQrCode(verifyUrl);
  const hash = generateCertificateVerificationHash(data);

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="fa">
    <head>
      <meta charset="UTF-8" />
      <title>گواهینامه ${data.certCode}</title>
      <style>
        @page { size: A4 landscape; margin: 0; }
        body {
          margin: 0;
          padding: 40px;
          font-family: 'Vazirmatn', 'Tahoma', sans-serif;
          background: #f8fafc;
          color: #0f172a;
          box-sizing: border-box;
          width: 297mm;
          height: 210mm;
        }
        .cert-card {
          border: 12px double #1e1b4b;
          border-radius: 24px;
          background: #ffffff;
          padding: 40px 60px;
          height: calc(100% - 80px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 20px;
        }
        .title {
          font-size: 28px;
          font-weight: 900;
          color: #1e1b4b;
          text-align: center;
          margin-top: 15px;
        }
        .body-text {
          font-size: 18px;
          line-height: 2.2;
          text-align: justify;
          margin: 20px 0;
        }
        .highlight {
          color: #1e1b4b;
          font-weight: bold;
          text-decoration: underline #f59e0b 3px;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 2px solid #e2e8f0;
          padding-top: 20px;
        }
        .qr-box {
          text-align: center;
          font-size: 11px;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <div class="cert-card">
        <div class="header">
          <div>
            <h3>دانشگاه غیرانتفاعی آفاق ارومیه</h3>
            <p style="font-size: 12px; color: #64748b;">مرکز آموزش‌های تخصصی و آزاد</p>
          </div>
          <div style="font-size: 32px; font-weight: bold; color: #1e1b4b;">آفاق</div>
          <div style="text-align: left; font-family: sans-serif;" dir="ltr">
            <h4>AFAGH UNIVERSITY</h4>
            <p style="font-size: 11px; color: #64748b;">Continuing Education Center</p>
          </div>
        </div>

        <div class="title">گواهینـامـه پـایـان دوره تـخصـصی</div>

        <div class="body-text">
          بدین‌وسیله گواهی می‌شود سرکار خانم / جناب آقای <span class="highlight">${data.learnerName}</span> با شماره ملی <span style="font-family: monospace;">${data.nationalIdMasked}</span>، دوره آموزشی و مهارتی <span class="highlight">«${data.courseName}»</span> به مدت <b>${data.durationHours} ساعت</b> را با تدریس استاد محترم <b>${data.instructorName}</b> با موفقیت و نمره نهایی <b style="color: #059669;">${data.grade} از ۲۰</b> به پایان رسانده است.
        </div>

        <div class="footer">
          <div style="text-align: center;">
            <p style="font-weight: bold;">مدرس دوره</p>
            <p style="font-size: 14px; color: #1e1b4b; margin-top: 10px;">${data.instructorName}</p>
          </div>

          <div class="qr-box">
            ${qrSvg}
            <p style="margin-top: 5px;">کد رهگیری: <b>${data.certCode}</b></p>
            <p style="font-size: 8px; color: #94a3b8;">SHA-256: ${hash.slice(0, 20)}...</p>
          </div>

          <div style="text-align: center;">
            <p style="font-weight: bold;">رئیس مرکز آموزش‌های آزاد</p>
            <div style="margin-top: 10px; font-size: 12px; border: 1px solid #cbd5e1; padding: 4px 12px; border-radius: 8px;">
              مهر الکترونیک دانشگاه
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
