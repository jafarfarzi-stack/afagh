import { NextRequest, NextResponse } from 'next/server';
import {
  approveDean, approveDeptHead, getApprovalHistory, getScopedOverview,
  rejectStatement, returnStatement, settleApproved, type ApprovalOp,
} from '@/lib/payroll-approvals';

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
      const rows = await getApprovalHistory(Number(sid));
      return NextResponse.json({ ok: true, history: rows });
    }
    const ov = await getScopedOverview();
    return NextResponse.json({ ok: true, term: ov.term, list: ov.list, totals: ov.totals, scoped: (ov as { scoped?: boolean }).scoped ?? false });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const op = body?.op as ApprovalOp;
    if (!OPS.includes(op)) {
      return NextResponse.json({ ok: false, error: 'عملیات نامعتبر است.' }, { status: 400 });
    }
    if (op === 'settle') {
      const staffId = Number(body?.staffId);
      if (!staffId) return NextResponse.json({ ok: false, error: 'شناسهٔ استاد نامعتبر است.' }, { status: 400 });
      const r = await settleApproved(staffId);
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    const statementId = Number(body?.statementId);
    if (!statementId) return NextResponse.json({ ok: false, error: 'شناسهٔ فیش نامعتبر است.' }, { status: 400 });
    const note = typeof body?.note === 'string' ? body.note : undefined;
    const r =
      op === 'approve-dept' ? await approveDeptHead(statementId, note)
      : op === 'approve-dean' ? await approveDean(statementId, note)
      : op === 'return' ? await returnStatement(statementId, note ?? '')
      : await rejectStatement(statementId, note ?? '');
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}
