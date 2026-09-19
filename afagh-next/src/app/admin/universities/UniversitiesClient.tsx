'use client';

import { useState } from 'react';
import { upsertUniversity, saveSaminConnection, deleteUniversity } from './actions';

type Uni = { id: number; code: string; title: string; kind: string; status: string; saminCode: string | null; province: string | null; dissolvedAt: string | null; isActive: number };
type Conn = { universityId: number; apiBaseUrl: string; authBaseUrl: string; clientId: string | null; username: string | null; isEnabled: number; lastSyncAt: string | null; hasSecret: boolean };

export default function UniversitiesClient({ universities, connections }: { universities: Uni[]; connections: Conn[] }) {
  const [editing, setEditing] = useState<Uni | null>(null);
  const [msg, setMsg] = useState('');

  const connMap = new Map(connections.map(c => [c.universityId, c]));

  return (
    <div className="space-y-4">
      {msg && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2 rounded">{msg}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b text-slate-600">
              <th className="px-2 py-2 text-right">کد</th>
              <th className="px-2 py-2 text-right">عنوان</th>
              <th className="px-2 py-2 text-right">نوع</th>
              <th className="px-2 py-2 text-right">کد ثمین</th>
              <th className="px-2 py-2 text-right">اتصال ثمین</th>
              <th className="px-2 py-2 text-right">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {universities.map(u => {
              const c = connMap.get(u.id);
              return (
                <tr key={u.id} className="border-b hover:bg-slate-50">
                  <td className="px-2 py-2 font-mono font-bold">{u.code}</td>
                  <td className="px-2 py-2">{u.title}</td>
                  <td className="px-2 py-2">{u.kind === 'OWN' ? 'خودمان' : 'منحل‌شده'}</td>
                  <td className="px-2 py-2 font-mono text-[11px]">{u.saminCode || '—'}</td>
                  <td className="px-2 py-2">
                    {c ? (
                      <span className={c.hasSecret ? 'text-emerald-600' : 'text-amber-600'}>
                        {c.hasSecret ? '✓ متصل' : 'ناقص'}{c.lastSyncAt ? ` · ${new Date(c.lastSyncAt).toLocaleDateString('fa-IR')}` : ''}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 flex gap-1">
                    <button onClick={() => setEditing(u)} className="text-indigo-600 hover:underline">ویرایش</button>
                    <ConnButton uni={u} conn={c} onMsg={setMsg} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card space-y-3">
        <h3 className="font-bold text-sm">{editing ? 'ویرایش دانشگاه' : 'افزودن دانشگاه جدید'}</h3>
        <form action={async (fd) => { try { await upsertUniversity(fd); setEditing(null); setMsg('ذخیره شد'); } catch (e: any) { setMsg(e.message); } }} className="grid grid-cols-2 gap-2 text-xs">
          <input type="hidden" name="id" value={editing?.id || ''} />
          <input name="code" placeholder="کد (ZARINE)" defaultValue={editing?.code || ''} className="border rounded px-2 py-1.5" required />
          <input name="title" placeholder="عنوان" defaultValue={editing?.title || ''} className="border rounded px-2 py-1.5" required />
          <select name="kind" defaultValue={editing?.kind || 'DISSOLVED'} className="border rounded px-2 py-1.5">
            <option value="OWN">خودمان</option>
            <option value="DISSOLVED">منحل‌شده</option>
            <option value="MERGED">ادغامی</option>
          </select>
          <input name="saminCode" placeholder="کد ثمین sender_university" defaultValue={editing?.saminCode || ''} className="border rounded px-2 py-1.5" />
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="bg-indigo-600 text-white px-4 py-1.5 rounded text-xs">ذخیره</button>
            {editing && <button type="button" onClick={() => setEditing(null)} className="border px-3 py-1.5 rounded text-xs">انصراف</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

function ConnButton({ uni, conn, onMsg }: { uni: Uni; conn: Conn | undefined; onMsg: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="text-emerald-600 hover:underline">اتصال ثمین</button>;
  return (
    <form action={async (fd) => { try { await saveSaminConnection(fd); onMsg('اتصال ذخیره شد (رمزها رمزنگاری شد)'); setOpen(false); } catch (e: any) { onMsg(e.message); } }} className="flex flex-wrap gap-1 items-center">
      <input type="hidden" name="universityId" value={uni.id} />
      <input name="clientId" placeholder="client_id" defaultValue={conn?.clientId || ''} className="border rounded px-1 py-0.5 w-24" />
      <input name="clientSecret" placeholder="client_secret (خالی=بدون تغییر)" type="password" className="border rounded px-1 py-0.5 w-24" />
      <input name="username" placeholder="username" defaultValue={conn?.username || ''} className="border rounded px-1 py-0.5 w-20" />
      <input name="password" placeholder="password (خالی=بدون تغییر)" type="password" className="border rounded px-1 py-0.5 w-24" />
      <button type="submit" className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[11px]">ذخیره</button>
      <button type="button" onClick={() => setOpen(false)} className="border px-2 py-0.5 rounded text-[11px]">×</button>
    </form>
  );
}
