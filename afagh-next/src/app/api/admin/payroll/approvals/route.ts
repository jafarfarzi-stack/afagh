import { NextRequest, NextResponse } from 'next/server';
import {
  approveDean, approveDeptHead, getApprovalHistory, getScopedOverview,
  rejectStatement, returnStatement, settleApproved, type ApprovalOp,
} from '@/lib/payroll-approvals';
import { assertCsrf } from '@/lib/security';

// ─────────────────────────────────────────────────────────────────
//  زنجیرهٔ تأیید فیش حق‌التدریس — نقطهٔ اتصال کلاینت (LivePayrollClient)
//  به منطق سرورساید src/lib/payroll-approvals.ts.
//  گیت نقش داخل همان توابع است (requireRole)؛ ADMIN همه‌جا عبور می‌کند.
// ─────────────────────────────────────────────────────────────────

const OPS: ApprovalOp[] = ['approve-dept', 'approve-dean', 'return', 'reject', 'settle'];

export async function GET(req: NextRequest) {
  try {
    const sid = req.nextUrl.searchParams.get('statementId');
    if (sid) {
      const sidNum = Number(sid);
      if (!Number.isSafeInteger(sidNum) || sidNum <= 0) return NextResponse.json({ ok: false, error: 'شناسهٔ فیش نامعتبر است.' }, { status: 400 });
      const rows = await getApprovalHistory(sidNum);
      return NextResponse.json({ ok: true, history: rows });
    }
    const ov = await getScopedOverview();
    return NextResponse.json({ ok: true, term: ov.term, list: ov.list, totals: ov.totals, scoped: (ov as { scoped?: boolean }).scoped ?? false });
  } catch (err) {
    // 🔒 پیام خام به کلاینت برنمی‌گردد — فقط لاگ سرور.
    console.error('[api] payroll/approvals GET failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'خطای ناشناخته' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  try {
    const body = await req.json().catch(() => ({}));
    const op = body?.op as ApprovalOp;
    if (!OPS.includes(op)) {
      return NextResponse.json({ ok: false, error: 'عملیات نامعتبر است.' }, { status: 400 });
    }
    if (op === 'settle') {
      const staffId = Number(body?.staffId);
      if (!Number.isSafeInteger(staffId) || staffId <= 0) return NextResponse.json({ ok: false, error: 'شناسهٔ استاد نامعتبر است.' }, { status: 400 });
      const r = await settleApproved(staffId);
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    const statementId = Number(body?.statementId);
    if (!Number.isSafeInteger(statementId) || statementId <= 0) return NextResponse.json({ ok: false, error: 'شناسهٔ فیش نامعتبر است.' }, { status: 400 });
    const note = typeof body?.note === 'string' ? body.note : undefined;
    const r =
      op === 'approve-dept' ? await approveDeptHead(statementId, note)
      : op === 'approve-dean' ? await approveDean(statementId, note)
      : op === 'return' ? await returnStatement(statementId, note ?? '')
      : await rejectStatement(statementId, note ?? '');
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (err) {
    // 🔒 پیام خام به کلاینت برنمی‌گردد — فقط لاگ سرور.
    console.error('[api] payroll/approvals POST failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'خطای ناشناخته' }, { status: 401 });
  }
}
