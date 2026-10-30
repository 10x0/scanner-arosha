import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import { fmt } from '@/lib/time';
import { shiftLabel, type Device, type Tx } from '@/lib/types';
import { Pill, Table } from '@/components/ui';
import { AddDevice, DeviceActions } from './inventory-client';

const LIMIT = 500;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  const p = await requireProfile();
  const { q = '', archived } = await searchParams;
  const showArchived = archived === '1';
  const sb = await createClient();

  let query = sb.from('devices').select('*').order('device_no').limit(LIMIT + 1);
  if (!showArchived) query = query.is('archived_at', null);
  const term = q.replace(/[%,()*\\]/g, ' ').trim();
  if (term) query = query.or(`device_no.ilike.%${term}%,type.ilike.%${term}%,serial.ilike.%${term}%,status.ilike.%${term}%,notes.ilike.%${term}%`);

  const canDelete = can(p.role, 'delete');
  const [{ data }, recent, hist] = await Promise.all([
    query,
    sb.from('transactions').select('*').order('issued_at', { ascending: false }).limit(15),
    canDelete ? sb.rpc('history_ids') : Promise.resolve({ data: null }),
  ]);
  const all = (data ?? []) as Device[];
  const devices = all.slice(0, LIMIT);
  const withHistory = new Set<string>(((hist.data as { devices?: string[] } | null)?.devices) ?? []);
  const repair = can(p.role, 'repair');
  const missing = can(p.role, 'missing');

  return (
    <>
      <h1>Inventory</h1>
      <form className="r" method="get">
        <input name="q" placeholder="Search number, type, serial, status" defaultValue={q} />
        <label className="l" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} style={{ minHeight: 0 }} /> Show archived
        </label>
        <button className="s">Search</button>
        {can(p.role, 'export') && <a className="btn s" href="/api/export?type=inventory">Export CSV</a>}
      </form>
      {can(p.role, 'manage') && <AddDevice />}
      <div className="c">
        <Table
          head={['No.', 'Type', 'Serial no.', 'Status', 'Note', '']}
          rows={devices.map((d) => [
            d.device_no, d.type, d.serial || '—',
            <span key={d.id}><Pill s={d.status} />{d.archived_at ? <span className="l"> archived</span> : null}</span>,
            d.notes,
            <div className="r" key={d.id + 'a'} style={{ margin: 0 }}>
              <Link className="btn s" href={`/history?device=${encodeURIComponent(d.device_no)}`}>History</Link>
              <DeviceActions
                id={d.id} no={d.device_no} status={d.status} archived={!!d.archived_at}
                canRepair={repair} canMissing={missing} canDelete={canDelete} hasHistory={withHistory.has(d.id)}
              />
            </div>,
          ])}
        />
        {all.length > LIMIT && <p className="note">Showing the first {LIMIT} matches. Narrow the search to see others.</p>}
      </div>

      <div className="c">
        <h2>Recent activity</h2>
        <Table
          head={['Device', 'Staff', 'Event', 'Shift', 'When', 'Outcome']}
          rows={((recent.data ?? []) as Tx[]).map((t) => [
            t.device_no, t.staff_name, t.transferred_from ? 'Transfer in' : 'Issue', shiftLabel(t.shift), fmt(t.issued_at),
            t.end_type === 'transfer' ? `Transferred (${shiftLabel(t.return_shift)})` : t.returned_at ? `Returned (${shiftLabel(t.return_shift)})` : 'Outstanding',
          ])}
        />
        <p className="l"><Link href="/history">Full handover &amp; transfer history →</Link></p>
      </div>
    </>
  );
}
