import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import { getDefaultShift } from '@/lib/shifts';
import { fmt } from '@/lib/time';
import { shiftLabel, type StaffRow, type Tx } from '@/lib/types';
import { Table } from '@/components/ui';
import { BulkClient } from './bulk-client';
import { TransferPanel, type Holder } from './transfer-panel';

export default async function BulkPage({ searchParams }: { searchParams: Promise<{ from?: string; dev?: string }> }) {
  const p = await requireProfile();
  const sp = await searchParams;
  const sb = await createClient();
  const [staff, out, avail, defaultShift] = await Promise.all([
    sb.from('staff').select('id,name,emp_no,active').order('name').limit(2000),
    sb.from('transactions').select('*').is('returned_at', null).order('device_no').limit(5000),
    sb.from('devices').select('device_no,type,serial,notes').eq('status', 'Available').is('archived_at', null).order('device_no').limit(1000),
    getDefaultShift(),
  ]);
  const all = (staff.data ?? []) as StaffRow[];
  const held = (out.data ?? []) as Tx[];

  const holders: Holder[] = all
    .map((s) => ({
      id: s.id, name: s.name, emp: s.emp_no,
      devices: held.filter((t) => t.staff_id === s.id).map((t) => ({
        no: t.device_no, batch: t.origin_batch ?? t.batch_ref, since: fmt(t.issued_at), shift: shiftLabel(t.shift),
      })),
    }))
    .filter((h) => h.devices.length > 0)
    .sort((a, b) => b.devices.length - a.devices.length);

  const active = all.filter((s) => s.active);
  const canBulk = can(p.role, 'bulk');
  const canTransfer = can(p.role, 'issue');

  return (
    <>
      <h1>Bulk</h1>
      {canBulk ? (
        <BulkClient
          defaultShift={defaultShift}
          staff={active.map((s) => ({ value: s.id, label: s.name, sub: s.emp_no || undefined }))}
          available={(avail.data ?? []).map((d) => ({
            value: d.device_no as string, label: d.device_no as string,
            sub: [d.type, d.serial].filter(Boolean).join(' · ') + ' · Available', search: `${d.type} ${d.serial} ${d.notes}`,
          }))}
          issued={held.map((t) => ({ value: t.device_no, label: t.device_no, sub: `Issued · ${t.staff_name}`, search: t.staff_name }))}
        />
      ) : (
        <div className="c">Your role cannot run bulk handovers.</div>
      )}

      {canTransfer && (
        <TransferPanel
          holders={holders}
          staff={active.map((s) => ({ value: s.id, label: s.name, sub: s.emp_no || undefined }))}
          defaultShift={defaultShift}
          initialFrom={sp.from ?? ''}
          initialDev={sp.dev ?? ''}
        />
      )}

      <div className="c">
        <h2>Devices per staff member</h2>
        <Table
          head={['Staff', 'Devices held now', 'Device numbers']}
          rows={holders.map((h) => [h.name, h.devices.length, h.devices.map((d) => d.no).join(', ')])}
          empty="Nobody is holding devices."
        />
      </div>
    </>
  );
}
