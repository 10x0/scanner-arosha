import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import { dayBounds, fmt, todayStr } from '@/lib/time';
import { STATUSES, type Stats, type Tx } from '@/lib/types';
import { Table } from '@/components/ui';
import { StockCheck } from './stock-check';

export default async function ReconcilePage() {
  const p = await requireProfile();
  const sb = await createClient();
  const { from, to } = dayBounds(todayStr());
  const [stats, overdue, checks] = await Promise.all([
    sb.rpc('dashboard_stats', { p_from: from.toISOString(), p_to: to.toISOString() }),
    sb.from('transactions').select('*').is('returned_at', null).lt('issued_at', from.toISOString()).order('issued_at').limit(1000),
    sb.from('stock_checks').select('checked_at,note').order('checked_at', { ascending: false }).limit(3),
  ]);
  const s = stats.data as Stats | null;
  if (!s) return <div className="c">Could not load data.</div>;

  const cnt = (k: string) => s.status[k] ?? 0;
  const active = s.registered - cnt('Retired');
  const sum = ['Available', 'Issued', 'Damaged', 'Maintenance', 'Missing'].reduce((a, k) => a + cnt(k), 0);
  const inv = (overdue.data ?? []) as Tx[];
  const last = (checks.data ?? []) as { checked_at: string; note: string }[];

  return (
    <>
      <h1>Reconcile</h1>
      <div className="g">
        {STATUSES.map((st) => (
          <div className="c" key={st}><div className="n">{cnt(st)}</div><div className="l">{st}</div></div>
        ))}
        <div className="c"><div className="n">{inv.length}</div><div className="l">Need investigation</div></div>
      </div>
      <div className="c">
        <h2>Reconciliation</h2>
        <p>
          Active inventory: <b>{active}</b> · status total: <b>{sum}</b> ·{' '}
          {active === sum ? <span className="Available">Reconciled ✓</span> : <span className="Damaged">Mismatch</span>}{' '}
          (retired reported separately)
        </p>
        {can(p.role, 'missing') && <StockCheck />}
        <p className="l">Last checks: {last.map((c) => `${fmt(c.checked_at)} – ${c.note}`).join('; ') || 'none'}</p>
        <p className="note">Unreturned devices are never auto-marked Missing; only an administrator can declare that.</p>
      </div>
      <div className="c">
        <h2>Issued before today</h2>
        <Table head={['Device', 'Staff', 'Issued']} rows={inv.map((t) => [t.device_no, t.staff_name, fmt(t.issued_at)])} />
      </div>
    </>
  );
}
