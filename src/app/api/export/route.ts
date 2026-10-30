import { NextResponse, type NextRequest } from 'next/server';
import { getProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/csv';
import { isDateStr } from '@/lib/time';
import { fetchReport, REPORT_TYPES, reportCells, RH } from '@/lib/reports';
import { SHIFTS, type Device } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const p = await getProfile();
  if (!p) return new NextResponse('Unauthorized', { status: 401 });
  if (!can(p.role, 'export')) return new NextResponse('Forbidden', { status: 403 });

  const sp = req.nextUrl.searchParams;
  const sb = await createClient();
  let name: string;
  let rows: (string | number | null)[][];

  if (sp.get('type') === 'inventory') {
    const { data, error } = await sb.from('devices').select('*').order('device_no').limit(20000);
    if (error) return new NextResponse('Export failed', { status: 500 });
    name = 'inventory.csv';
    rows = [['Device', 'Type', 'Serial', 'Status', 'Archived', 'Note'], ...((data ?? []) as Device[]).map((d) => [d.device_no, d.type, d.serial, d.status, d.archived_at ? 'Yes' : '', d.notes])];
  } else {
    const type = REPORT_TYPES.find((t) => t === sp.get('type')) ?? 'Daily log';
    const date = isDateStr(sp.get('date') ?? undefined) ? (sp.get('date') as string) : '';
    const shift = (SHIFTS as readonly string[]).includes(sp.get('shift') ?? '') ? (sp.get('shift') as string) : '';
    try {
      const data = await fetchReport(sb, type, date, shift);
      rows = [RH, ...data.map(reportCells)];
    } catch {
      return new NextResponse('Export failed', { status: 500 });
    }
    name = 'report.csv';
  }

  await sb.rpc('log_export', { p_name: name });
  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
