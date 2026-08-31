import { requireRole } from '@/lib/auth';
import TemplateEngineClient from './TemplateEngineClient';

export const dynamic = 'force-dynamic';

export default async function AdminTemplatesPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  return <TemplateEngineClient />;
}
