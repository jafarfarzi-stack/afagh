'use client';

import { useState, useEffect } from 'react';
import { faIR } from 'date-fns/locale';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, LineElement, PointElement } from 'chart.js';
import { saveAs } from 'file-saver';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, LineElement, PointElement);

const fa = (n: number) => Number(n || 0).toLocaleString('fa-IR');

interface StatementRow {
  termId: number;
  termCode: string;
  termTitle: string;
  tuitionFixed: number;
  tuitionVariable: number;
  discountFixed: number;
  discountVariable: number;
  subjectAdditive: number;
  subjectDeductive: number;
  sponsorship: number;
  payments: number;
  posPayments: number;
  loans: number;
  balance: number;
}

interface Props {
  studentId: number;
  studentName: string;
  studentCode: string;
}

function generateCSV(data: StatementRow[], studentName: string, studentCode: string): string {
  const headers = ['ترم', 'کد ترم', 'شهریه ثابت', 'شهریه متغیر', 'تخفیف ثابت', 'تخفیف متغیر', 'موضوعی افزایشی', 'موضوعی کاهشی', 'پوشش بنیاد', 'پرداخت آنلاین', 'پرداخت POS', 'وام', 'مانده'];
  const rows = data.map(d => [
    d.termTitle, d.termCode, fa(d.tuitionFixed), fa(d.tuitionVariable), fa(d.discountFixed), fa(d.discountVariable),
    fa(d.subjectAdditive), fa(d.subjectDeductive), fa(d.sponsorship), fa(d.payments), fa(d.posPayments), fa(d.loans), fa(d.balance)
  ]);
  const titleRow = [`صورت حساب مالی - ${studentName} (${studentCode})`, '', '', '', '', '', '', '', '', '', '', '', ''];
  const dateRow = [`تاریخ: ${new Date().toLocaleString('fa-IR', { locale: faIR })}`, '', '', '', '', '', '', '', '', '', '', '', ''];
  return [titleRow, dateRow, headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function generateText(data: StatementRow[], studentName: string, studentCode: string): string {
  const colWidths = [20, 12, 16, 16, 14, 14, 16, 14, 14, 14, 14, 12, 16];
  const headers = ['ترم', 'کد ترم', 'شهریه ثابت', 'شهریه متغیر', 'تخفیف ثابت', 'تخفیف متغیر', 'موضوعی +\nافزایشی', 'موضوعی -\nکاهشی', 'پوشش\nبنیاد', 'پرداخت\nآنلاین', 'پرداخت\nPOS', 'وام', 'مانده'];
  const pad = (s: string, w: number) => s.padEnd(w);
  const headerLine = headers.map((h, i) => pad(h, colWidths[i])).join(' | ');
  const sepLine = colWidths.map(w => '-'.repeat(w)).join('-+-');
  const body = data.map(d => [d.termTitle, d.termCode, fa(d.tuitionFixed), fa(d.tuitionVariable), fa(d.discountFixed), fa(d.discountVariable), fa(d.subjectAdditive), fa(d.subjectDeductive), fa(d.sponsorship), fa(d.payments), fa(d.posPayments), fa(d.loans), fa(d.balance)]
    .map((v, i) => pad(v, colWidths[i])).join(' | ')).join('\n');
  const totals = ['جمع کل', '', fa(data.reduce((s, d) => s + d.tuitionFixed, 0)), fa(data.reduce((s, d) => s + d.tuitionVariable, 0)), fa(data.reduce((s, d) => s + d.discountFixed, 0)), fa(data.reduce((s, d) => s + d.discountVariable, 0)), fa(data.reduce((s, d) => s + d.subjectAdditive, 0)), fa(data.reduce((s, d) => s + d.subjectDeductive, 0)), fa(data.reduce((s, d) => s + d.sponsorship, 0)), fa(data.reduce((s, d) => s + d.payments, 0)), fa(data.reduce((s, d) => s + d.posPayments, 0)), fa(data.reduce((s, d) => s + d.loans, 0)), fa(data.reduce((s, d) => s + d.balance, 0))]
    .map((v, i) => pad(v, colWidths[i])).join(' | ');
  return `صورت حساب مالی - ${studentName} (${studentCode})\nتاریخ: ${new Date().toLocaleString('fa-IR', { locale: faIR })}\n\n${headerLine}\n${sepLine}\n${body}\n${sepLine}\n${totals}`;
}

export default function StudentStatementClient({ studentId, studentName, studentCode }: Props) {
  const [data, setData] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartInstance, setChartInstance] = useState<ChartJS | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/finance/reports/student-statement?studentId=${studentId}`)
      .then(r => r.json())
      .then(d => { setData(d.rows || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [studentId]);

  useEffect(() => {
    if (!data.length) return;
    const ctx = document.getElementById('balanceChart') as HTMLCanvasElement;
    if (!ctx) return;
    if (chartInstance) chartInstance.destroy();

    const chart = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.termCode),
        datasets: [
          { label: 'بدهکاری (شهریه+موضوعی)', data: data.map(d => d.tuitionFixed + d.tuitionVariable + d.subjectAdditive), backgroundColor: 'rgba(239, 68, 68, 0.7)' },
          { label: 'بستانکاری (پرداخت+تخفیف+بنیاد)', data: data.map(d => d.payments + d.posPayments + d.discountFixed + d.discountVariable + d.sponsorship + d.subjectDeductive), backgroundColor: 'rgba(16, 185, 129, 0.7)' },
          { label: 'مانده', data: data.map(d => d.balance), type: 'line', borderColor: 'rgb(59, 130, 246)', backgroundColor: 'rgba(59, 130, 246, 0.1)', yAxisID: 'y1', tension: 0.3, fill: false, pointRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { font: { family: 'Vazirmatn, Tahoma' } } }, title: { display: true, text: 'روند مانده ترم‌به‌ترم', font: { family: 'Vazirmatn, Tahoma', size: 14 } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => fa(Number(v)) } }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => fa(Number(v)) } } },
      },
    });
    setChartInstance(chart);
  }, [data, chartInstance]);

  const exportCSV = () => {
    setExporting('csv');
    const csv = generateCSV(data, studentName, studentCode);
    const blob = new Blob([new TextEncoder().encode(csv)], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `statement_${studentCode}_${Date.now()}.csv`);
    setExporting(null);
  };

  const exportText = () => {
    setExporting('txt');
    const txt = generateText(data, studentName, studentCode);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `statement_${studentCode}_${Date.now()}.txt`);
    setExporting(null);
  };

  const printStatement = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl" lang="fa"><head><meta charset="UTF-8"><title>صورت حساب مالی - ${studentName}</title>
      <style>
        body { font-family: Vazirmatn, Tahoma, Arial; padding: 20px; direction: rtl; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
        .info { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: center; }
        th { background: #f5f5f5; }
        .summary { margin-top: 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .box { border: 1px solid #ddd; padding: 10px; text-align: center; }
        .box.negative { background: #fef2f2; color: #dc2626; }
        .box.positive { background: #f0fdf4; color: #16a34a; }
        @media print { .no-print { display: none; } }
      </style></head><body>
      <div class="header"><h1>صورت حساب مالی دانشجویی</h1><p>سیستم آفاق - پخش شده در ${new Date().toLocaleString('fa-IR', { locale: faIR })}</p></div>
      <div class="info"><div>نام و نام خانوادگی: ${studentName}</div><div>شماره دانشجویی: ${studentCode}</div><div>تاریخ استخراج: ${new Date().toLocaleString('fa-IR', { locale: faIR })}</div></div>
      <table><thead><tr>
        <th>ترم</th><th>شهریه ثابت</th><th>شهریه متغیر</th><th>تخفیف ثابت</th><th>تخفیف متغیر</th><th>موضوعی افزایشی</th><th>موضوعی کاهشی</th><th>پوشش بنیاد</th><th>پرداخت آنلاین</th><th>پرداخت POS</th><th>وام</th><th>مانده</th>
      </tr></thead><tbody>
      ${data.map(d => `<tr>
        <td>${d.termTitle} (${d.termCode})</td><td>${fa(d.tuitionFixed)}</td><td>${fa(d.tuitionVariable)}</td><td>${fa(d.discountFixed)}</td><td>${fa(d.discountVariable)}</td><td>${fa(d.subjectAdditive)}</td><td>${fa(d.subjectDeductive)}</td><td>${fa(d.sponsorship)}</td><td>${fa(d.payments)}</td><td>${fa(d.posPayments)}</td><td>${fa(d.loans)}</td><td class="${d.balance > 0 ? 'negative' : 'positive'}">${fa(d.balance)}</td>
      </tr>`).join('')}
      </tbody></table>
      <div class="summary">
        <div class="box"><strong>جمع شهریه ثابت</strong><br>${fa(data.reduce((s, d) => s + d.tuitionFixed, 0))}</div>
        <div class="box"><strong>جمع شهریه متغیر</strong><br>${fa(data.reduce((s, d) => s + d.tuitionVariable, 0))}</div>
        <div class="box"><strong>جمع پرداخت‌ها</strong><br>${fa(data.reduce((s, d) => s + d.payments + d.posPayments, 0))}</div>
      </div>
      <div class="no-print" style="margin-top:20px;text-align:center;"><button onclick="window.print()" style="padding:10px 20px;font-size:14px;">🖨️ چاپ / ذخیره PDF</button></div>
    </body></html>
    `);
    printWindow.document.close();
  };

  if (loading) return <div className="card p-6 text-center text-slate-500">⏳ در حال بارگذاری صورت حساب...</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">📄 صورت حساب مالی - {studentName}</h1>
          <p className="text-xs text-slate-500 mt-1">شماره دانشجویی: {studentCode} | بر اساس ۹ مشخصه سما (ثابت/متغیر/پرداختی/تخفیف ثابت/تخفیف متغیر/موضوعی+/- /بنیاد/وام)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={printStatement} className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white">🖨️ چاپ / PDF</button>
          <button onClick={() => setViewMode(v => v === 'table' ? 'chart' : 'table')} className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            {viewMode === 'table' ? '📊 نمودار' : '📋 جدول'}
          </button>
        </div>
      </div>

      {viewMode === 'chart' && (
        <div className="card" style={{ height: 400 }}>
          <canvas id="balanceChart" />
        </div>
      )}

      {viewMode === 'table' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-slate-600">
                <th className="p-2">ترم</th>
                <th className="p-2">شهریه ثابت</th>
                <th className="p-2">شهریه متغیر</th>
                <th className="p-2">تخفیف ثابت</th>
                <th className="p-2">تخفیف متغیر</th>
                <th className="p-2">موضوعی +\nافزایشی</th>
                <th className="p-2">موضوعی -\nکاهشی</th>
                <th className="p-2">پوشش\nبنیاد</th>
                <th className="p-2">پرداخت\nآنلاین</th>
                <th className="p-2">پرداخت\nPOS</th>
                <th className="p-2">وام</th>
                <th className="p-2">مانده</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={d.termId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} >
                  <td className="p-2 font-medium text-slate-800">{d.termTitle}<br/><span className="text-[10px] text-slate-500">{d.termCode}</span></td>
                  <td className="p-2 text-slate-700">{fa(d.tuitionFixed)}</td>
                  <td className="p-2 text-slate-700">{fa(d.tuitionVariable)}</td>
                  <td className="p-2 text-emerald-700">{fa(d.discountFixed)}</td>
                  <td className="p-2 text-emerald-700">{fa(d.discountVariable)}</td>
                  <td className="p-2 text-amber-700">{fa(d.subjectAdditive)}</td>
                  <td className="p-2 text-emerald-700">{fa(d.subjectDeductive)}</td>
                  <td className="p-2 text-cyan-700">{fa(d.sponsorship)}</td>
                  <td className="p-2 text-blue-700">{fa(d.payments)}</td>
                  <td className="p-2 text-orange-700">{fa(d.posPayments)}</td>
                  <td className="p-2 text-violet-700">{fa(d.loans)}</td>
                  <td className={`p-2 font-bold ${d.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fa(d.balance)}</td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold text-slate-800">
                <td className="p-2">جمع کل</td>
                <td className="p-2">{fa(data.reduce((s, d) => s + d.tuitionFixed, 0))}</td>
                <td className="p-2">{fa(data.reduce((s, d) => s + d.tuitionVariable, 0))}</td>
                <td className="p-2 text-emerald-700">{fa(data.reduce((s, d) => s + d.discountFixed, 0))}</td>
                <td className="p-2 text-emerald-700">{fa(data.reduce((s, d) => s + d.discountVariable, 0))}</td>
                <td className="p-2 text-amber-700">{fa(data.reduce((s, d) => s + d.subjectAdditive, 0))}</td>
                <td className="p-2 text-emerald-700">{fa(data.reduce((s, d) => s + d.subjectDeductive, 0))}</td>
                <td className="p-2 text-cyan-700">{fa(data.reduce((s, d) => s + d.sponsorship, 0))}</td>
                <td className="p-2 text-blue-700">{fa(data.reduce((s, d) => s + d.payments, 0))}</td>
                <td className="p-2 text-orange-700">{fa(data.reduce((s, d) => s + d.posPayments, 0))}</td>
                <td className="p-2 text-violet-700">{fa(data.reduce((s, d) => s + d.loans, 0))}</td>
                <td className="p-2">{fa(data.reduce((s, d) => s + d.balance, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}