import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import { shiftLabel, type StaffRow } from '@/lib/types';
import { Table } from '@/components/ui';
import { AddStaff, StaffActions } from './staff-client';

export default async function StaffPage() {
  const p = await requireProfile();
  const sb = await createClient();
  const canDelete = can(p.role, 'delete');
  const [staffRes, heldRes, hist] = await Promise.all([
    sb.from('staff').select('*').order('name').limit(2000),
    sb.from('transactions').select('staff_id').is('returned_at', null).limit(10000),
    canDelete ? sb.rpc('history_ids') : Promise.resolve({ data: null }),
  ]);
  const staff = (staffRes.data ?? []) as StaffRow[];
  const held = new Map<string, number>();
  (heldRes.data ?? []).forEach((t) => held.set(t.staff_id as string, (held.get(t.staff_id as string) ?? 0) + 1));
  const withHistory = new Set<string>(((hist.data as { staff?: string[] } | null)?.staff) ?? []);
  const manage = can(p.role, 'manage');

  return (
    <>
      <h1>Staff</h1>
      {manage && <AddStaff />}
      <div className="c">
        <Table
          head={['Name', 'Emp. no.', 'Default shift', 'Devices held', 'Active', '']}
          rows={staff.map((s) => [
            s.name, s.emp_no || '—', s.shift ? shiftLabel(s.shift) : '—', held.get(s.id) ?? 0, s.active ? 'Yes' : 'No',
            manage ? (
              <StaffActions
                key={s.id} id={s.id} name={s.name} active={s.active}
                canDelete={canDelete && !withHistory.has(s.id) && !(held.get(s.id) ?? 0)}
              />
            ) : '',
          ])}
        />
      </div>
      {canDelete && <p className="note">Staff with any handover history can only be deactivated, never deleted.</p>}
    </>
  );
}
