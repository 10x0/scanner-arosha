import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmt } from '@/lib/time';
import { shiftLabel, type Tx, type TransferRow } from '@/lib/types';
import { Table } from '@/components/ui';

const clean = (s: string) => s.replace(/[%,()*\\]/g, ' ').trim();

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ device?: string; staff?: string }> }) {
  await requireProfile();
  const sp = await searchParams;
  const device = clean(sp.device ?? '');
  const staff = clean(sp.staff ?? '');
  const sb = await createClient();

  let tq = sb.from('transactions').select('*').order('issued_at', { ascending: false }).limit(300);
  let xq = sb.from('transfers').select('*').order('transferred_at', { ascending: false }).limit(300);
  if (device) { tq = tq.ilike('device_no', `%${device}%`); xq = xq.ilike('device_no', `%${device}%`); }
  if (staff) {
    tq = tq.ilike('staff_name', `%${staff}%`);
    xq = xq.or(`from_staff_name.ilike.%${staff}%,to_staff_name.ilike.%${staff}%,origin_staff_name.ilike.%${staff}%`);
  }
  const [tx, tr] = await Promise.all([tq, xq]);
  const txs = (tx.data ?? []) as Tx[];
  const trs = (tr.data ?? []) as TransferRow[];

  return (
    <>
      <h1>Handover &amp; transfer history</h1>
      <form className="r" method="get">
        <input name="device" placeholder="Device number" defaultValue={device} />
        <input name="staff" placeholder="Staff name" defaultValue={staff} />
        <button className="s">Filter</button>
      </form>

      <div className="c">
        <h2>Transfers ({trs.length})</h2>
        <Table
          head={['When', 'Device', 'Originally received by', 'From', 'To', 'Shift', 'By', 'Batch', 'Note']}
          rows={trs.map((x) => [
            fmt(x.transferred_at), x.device_no, x.origin_staff_name, x.from_staff_name, x.to_staff_name,
            shiftLabel(x.shift), x.by_name, x.batch_ref ?? '', x.note,
          ])}
          empty="No transfers yet."
        />
      </div>

      <div className="c">
        <h2>Handovers ({txs.length})</h2>
        <Table
          head={['Device', 'Holder', 'Event', 'Issue shift', 'Issued', 'How it ended', 'Return shift', 'Ended', 'Issued by', 'Batch']}
          rows={txs.map((t) => [
            t.device_no, t.staff_name, t.transferred_from ? 'Transfer in' : 'Issue', shiftLabel(t.shift), fmt(t.issued_at),
            t.end_type === 'transfer' ? 'Transferred' : t.returned_at ? 'Returned' : 'Active',
            t.return_shift ? shiftLabel(t.return_shift) : '—', fmt(t.returned_at), t.issued_by_name, t.batch_ref ?? '',
          ])}
        />
      </div>
    </>
  );
}
