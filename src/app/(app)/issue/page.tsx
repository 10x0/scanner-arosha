import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import { fmt } from '@/lib/time';
import type { StaffRow, Tx } from '@/lib/types';
import { Table } from '@/components/ui';
import { IssueReturn } from './issue-return';

export default async function IssuePage() {
  const p = await requireProfile();
  const sb = await createClient();
  const [staff, avail, out] = await Promise.all([
    sb.from('staff').select('id,name,emp_no,shift').eq('active', true).order('name'),
    sb.from('devices').select('device_no').eq('status', 'Available').order('device_no').limit(1000),
    sb.from('transactions').select('*').is('returned_at', null).order('issued_at', { ascending: false }).limit(1000),
  ]);
  const outRows = (out.data ?? []) as Tx[];

  return (
    <>
      <h1>Issue / Return</h1>
      {can(p.role, 'issue') ? (
        <IssueReturn
          staff={((staff.data ?? []) as StaffRow[]).map((s) => ({ id: s.id, name: s.name, emp: s.emp_no }))}
          available={(avail.data ?? []).map((d) => d.device_no as string)}
          outstanding={outRows.map((t) => ({ no: t.device_no, staff: t.staff_name, since: fmt(t.issued_at) }))}
        />
      ) : (
        <div className="c">Your role can view but not issue or return devices.</div>
      )}
      <div className="c">
        <h2>Currently issued ({outRows.length})</h2>
        <Table
          head={['Device', 'Staff', 'Issued', 'Shift']}
          rows={outRows.map((t) => [t.device_no, t.staff_name, fmt(t.issued_at), t.shift])}
        />
      </div>
    </>
  );
}
