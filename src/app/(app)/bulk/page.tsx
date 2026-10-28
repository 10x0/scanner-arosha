import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import type { StaffRow, Tx } from '@/lib/types';
import { Table } from '@/components/ui';
import { BulkClient } from './bulk-client';

export default async function BulkPage() {
  const p = await requireProfile();
  const sb = await createClient();
  const [staff, out] = await Promise.all([
    sb.from('staff').select('id,name,emp_no,active').order('name'),
    sb.from('transactions').select('staff_id,device_no').is('returned_at', null).limit(5000),
  ]);
  const all = (staff.data ?? []) as StaffRow[];
  const held = (out.data ?? []) as Pick<Tx, 'staff_id' | 'device_no'>[];

  const rows = all
    .filter((s) => s.active || held.some((t) => t.staff_id === s.id))
    .map((s) => {
      const m = held.filter((t) => t.staff_id === s.id);
      return { name: s.name, n: m.length, nos: m.map((t) => t.device_no).join(', ') || '—' };
    })
    .sort((a, b) => b.n - a.n);

  return (
    <>
      <h1>Bulk</h1>
      {can(p.role, 'bulk') ? (
        <BulkClient staff={all.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))} />
      ) : (
        <div className="c">Your role cannot run bulk handovers.</div>
      )}
      <div className="c">
        <h2>Devices per staff member</h2>
        <Table head={['Staff', 'Devices held now', 'Device numbers']} rows={rows.map((r) => [r.name, r.n, r.nos])} />
      </div>
    </>
  );
}
