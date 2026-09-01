import 'server-only';
import { NextResponse } from 'next/server';
import { getSessionUser, type SessionUser } from '@/lib/auth';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** فقط مدیر و کارشناس ارشد اجازهٔ مهاجرت دارند */
export async function requireMigrationAdmin(): Promise<{ user: SessionUser } | { res: NextResponse }> {
  const user = await getSessionUser();
  if (!user || !user.roles.includes('ADMIN')) {
    return { res: NextResponse.json({ error: 'دسترسی مجاز نیست.' }, { status: 403 }) };
  }
  return { user };
}

/** فایل آپلودشده → Buffer با سقف حجم */
export async function readUpload(file: File): Promise<Buffer> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('حجم فایل بیش از ۲۵ مگابایت است.');
  return Buffer.from(await file.arrayBuffer());
}

export function xlsxResponse(buf: Buffer, fileName: string): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
    },
  });
}
