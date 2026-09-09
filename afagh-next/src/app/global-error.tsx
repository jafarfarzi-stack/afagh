'use client';

import { useEffect } from 'react';

/**
 * آخرین خط دفاع: خطایی که در خودِ layout ریشه رخ دهد به error.tsx نمی‌رسد و
 * Next صفحهٔ پیش‌فرض انگلیسی را نشان می‌دهد. این فایل باید تگ html/body خودش
 * را داشته باشد چون جای layout ریشه را می‌گیرد.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', fontFamily: 'system-ui, Tahoma, sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: 32, maxWidth: 420, width: '100%', textAlign: 'center', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(15,23,42,.08)' }}>
          <div style={{ fontSize: 44 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '12px 0 6px' }}>سامانه موقتاً در دسترس نیست</h1>
          <p style={{ fontSize: 12, color: '#64748b', fontWeight: 700, lineHeight: 1.9, margin: 0 }}>
            خطایی بنیادی در بارگذاری سامانه رخ داد. لطفاً چند لحظه بعد دوباره تلاش کنید؛ اگر تکرار شد، کد پیگیری را به پشتیبانی اعلام کنید.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, fontFamily: 'monospace' }} dir="ltr">
              کد پیگیری: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{ marginTop: 18, padding: '10px 20px', borderRadius: 16, border: 0, background: '#1e1b4b', color: '#fff', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}
          >
            تلاش دوباره
          </button>
        </div>
      </body>
    </html>
  );
}
