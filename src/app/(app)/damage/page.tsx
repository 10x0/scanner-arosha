import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import { fmt } from '@/lib/time';
import type { DamageRow } from '@/lib/types';
import { Table } from '@/components/ui';
import { ReportForm, StatusSelect } from './damage-client';

export default async function DamagePage() {
  const p = await requireProfile();
  const sb = await createClient();
  const { data } = await sb.from('damage_reports').select('*').order('reported_at', { ascending: false }).limit(500);
  const rows = (data ?? []) as DamageRow[];
  const repair = can(p.role, 'repair');

  return (
    <>
      <h1>Damage</h1>
      {can(p.role, 'damage') && <ReportForm />}
      <div className="c">
        <Table
          head={['Device', 'Reported', 'Category', 'Severity', 'Last user', 'Status', 'Repaired by', 'Repair note']}
          rows={rows.map((r) => [
            r.device_no, fmt(r.reported_at), r.category, r.severity, r.last_user || '—',
            repair && r.status !== 'Repaired' && r.status !== 'Beyond Repair'
              ? <StatusSelect key={r.id} id={r.id} no={r.device_no} status={r.status} />
              : r.status,
            r.repaired_by || '—', r.repair_note,
          ])}
        />
      </div>
      <p className="note">Setting “Repaired” returns the device to Available. Damaged devices cannot be issued until then.</p>
    </>
  );
}
