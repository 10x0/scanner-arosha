import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import type { StaffRow } from '@/lib/types';
import { Table } from '@/components/ui';
import { AddStaff, ToggleStaff } from './staff-client';

export default async function StaffPage() {
  const p = await requireProfile();
  const sb = await createClient();
  const { data } = await sb.from('staff').select('*').order('name').limit(2000);
  const staff = (data ?? []) as StaffRow[];
  const manage = can(p.role, 'manage');

  return (
    <>
      <h1>Staff</h1>
      {manage && <AddStaff />}
      <div className="c">
        <Table
          head={['Name', 'Emp. no.', 'Shift', 'Active', '']}
          rows={staff.map((s) => [
            s.name, s.emp_no || '—', s.shift || '—', s.active ? 'Yes' : 'No',
            manage ? <ToggleStaff key={s.id} id={s.id} active={s.active} /> : '',
          ])}
        />
      </div>
    </>
  );
}
