import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import type { Device } from '@/lib/types';
import { Pill, Table } from '@/components/ui';
import { AddDevice, DeviceActions } from './inventory-client';

const LIMIT = 500;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const p = await requireProfile();
  const { q = '' } = await searchParams;
  const sb = await createClient();

  let query = sb.from('devices').select('*').order('device_no').limit(LIMIT + 1);
  const term = q.replace(/[%,()*\\]/g, ' ').trim();
  if (term) query = query.or(`device_no.ilike.%${term}%,type.ilike.%${term}%,serial.ilike.%${term}%,status.ilike.%${term}%`);
  const { data } = await query;
  const all = (data ?? []) as Device[];
  const devices = all.slice(0, LIMIT);

  const repair = can(p.role, 'repair');
  const missing = can(p.role, 'missing');

  return (
    <>
      <h1>Inventory</h1>
      <form className="r" method="get">
        <input name="q" placeholder="Search devices" defaultValue={q} />
        <button className="s">Search</button>
        {can(p.role, 'export') && <a className="btn s" href="/api/export?type=inventory">Export CSV</a>}
      </form>
      {can(p.role, 'manage') && <AddDevice />}
      <div className="c">
        <Table
          head={['No.', 'Type', 'Serial no.', 'Status', 'Note', '']}
          rows={devices.map((d) => [
            d.device_no, d.type, d.serial || '—', <Pill key={d.id} s={d.status} />, d.notes,
            <DeviceActions key={d.id} id={d.id} no={d.device_no} status={d.status} canRepair={repair} canMissing={missing} />,
          ])}
        />
        {all.length > LIMIT && <p className="note">Showing the first {LIMIT} matches. Narrow the search to see others.</p>}
      </div>
    </>
  );
}
