import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import { getDefaultShift } from '@/lib/shifts';
import { fmt } from '@/lib/time';
import { shiftLabel, type StaffRow, type Tx } from '@/lib/types';
import { Table } from '@/components/ui';
import { IssueReturn } from './issue-return';

export default async function IssuePage() {
  const p = await requireProfile();
  const sb = await createClient();
  const [staff, avail, out, defaultShift] = await Promise.all([
    sb.from('staff').select('id,name,emp_no').eq('active', true).order('name'),
    sb.from('devices').select('device_no,type,serial,notes').eq('status', 'Available').is('archived_at', null).order('device_no').limit(1000),
    sb.from('transactions').select('*').is('returned_at', null).order('issued_at', { ascending: false }).limit(1000),
    getDefaultShift(),
  ]);
  const outRows = (out.data ?? []) as Tx[];

  // who ORIGINALLY received a device that has since been transferred
  const originIds = outRows.map((t) => t.origin_tx).filter((x): x is string => !!x);
  const origins = new Map<string, string>();
  if (originIds.length) {
    const { data } = await sb.from('transactions').select('id,staff_name').in('id', originIds);
    (data ?? []).forEach((r) => origins.set(r.id as string, r.staff_name as string));
  }
  const doIssue = can(p.role, 'issue');

  return (
    <>
      <h1>Issue / Return</h1>
      {doIssue ? (
        <IssueReturn
          defaultShift={defaultShift}
          staff={((staff.data ?? []) as Pick<StaffRow, 'id' | 'name' | 'emp_no'>[]).map((s) => ({ value: s.id, label: s.name, sub: s.emp_no || undefined }))}
          available={(avail.data ?? []).map((d) => ({
            value: d.device_no as string, label: d.device_no as string,
            sub: [d.type, d.serial].filter(Boolean).join(' · ') + ' · Available',
            search: `${d.type} ${d.serial} ${d.notes}`,
          }))}
          outstanding={outRows.map((t) => ({
            value: t.device_no, label: t.device_no, sub: `Issued · ${t.staff_name}`, search: t.staff_name,
          }))}
        />
      ) : (
        <div className="c">Your role can view but not issue or return devices.</div>
      )}
      <div className="c">
        <h2>Currently issued ({outRows.length})</h2>
        <Table
          head={['Device', 'Holder', 'Originally issued to', 'Shift', 'Since', '']}
          rows={outRows.map((t) => {
            const orig = t.origin_tx ? origins.get(t.origin_tx) : null;
            return [
              t.device_no, t.staff_name, orig && orig !== t.staff_name ? orig : '—', shiftLabel(t.shift), fmt(t.issued_at),
              doIssue ? <Link key={t.id} className="btn s" href={`/bulk?from=${t.staff_id}&dev=${encodeURIComponent(t.device_no)}#transfer`}>Transfer</Link> : '',
            ];
          })}
        />
      </div>
    </>
  );
}
