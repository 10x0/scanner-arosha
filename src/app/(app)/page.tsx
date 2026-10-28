import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { dayBounds, todayStr } from '@/lib/time';
import { STATUSES, type Stats } from '@/lib/types';

export default async function Dashboard() {
  await requireProfile();
  const supabase = await createClient();
  const { from, to } = dayBounds(todayStr());
  const { data } = await supabase.rpc('dashboard_stats', { p_from: from.toISOString(), p_to: to.toISOString() });
  const s = data as Stats | null;
  if (!s) return <div className="c">Could not load dashboard data.</div>;

  const cnt = (k: string) => s.status[k] ?? 0;
  const cards: [string, number][] = [
    ['Registered', s.registered], ['Available', cnt('Available')], ['Issued', cnt('Issued')],
    ['Damaged', cnt('Damaged')], ['Maintenance', cnt('Maintenance')], ['Missing', cnt('Missing')],
    ['Overdue', s.overdue], ['Staff today', s.staff_today], ['Out today', s.out_today], ['Back today', s.back_today],
  ];
  const mx = Math.max(1, ...STATUSES.map(cnt));

  return (
    <>
      <h1>Dashboard</h1>
      <div className="g">
        {cards.map(([label, n]) => (
          <div className="c" key={label}><div className="n">{n}</div><div className="l">{label}</div></div>
        ))}
      </div>
      <div className="c">
        <h2>Quick actions</h2>
        <div className="r">
          <Link className="btn" href="/issue">Issue / Return</Link>
          <Link className="btn" href="/bulk">Bulk Handover</Link>
          <Link className="btn" href="/damage">Report Damaged Device</Link>
          <Link className="btn" href="/inventory">Add Device / Inventory</Link>
          <Link className="btn s" href="/reports">Daily Report</Link>
        </div>
      </div>
      <div className="c">
        <h2>Device status</h2>
        {STATUSES.map((st) => (
          <div className="r" key={st}>
            <span style={{ width: 110 }}>{st}</span>
            <div className="bar" style={{ width: `${(cnt(st) / mx) * 60}%` }} /> {cnt(st)}
          </div>
        ))}
      </div>
    </>
  );
}
