import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmt } from '@/lib/time';
import { Table } from '@/components/ui';

const PAGE = 100;
type Row = { id: number; at: string; user_name: string; role: string | null; action: string; record: string; reason: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireProfile();
  const page = Math.max(0, Number((await searchParams).page) || 0);
  const sb = await createClient();
  const { data } = await sb.from('audit_log').select('*').order('id', { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
  const all = (data ?? []) as Row[];
  const rows = all.slice(0, PAGE);

  return (
    <>
      <h1>Audit</h1>
      <div className="c">
        <Table
          head={['When', 'User', 'Role', 'Action', 'Record', 'Reason']}
          rows={rows.map((a) => [fmt(a.at), a.user_name, a.role ?? '—', a.action, a.record, a.reason])}
        />
        <div className="r" style={{ marginTop: 8 }}>
          {page > 0 && <Link className="btn s" href={`/audit?page=${page - 1}`}>← Newer</Link>}
          {all.length > PAGE && <Link className="btn s" href={`/audit?page=${page + 1}`}>Older →</Link>}
        </div>
      </div>
    </>
  );
}
