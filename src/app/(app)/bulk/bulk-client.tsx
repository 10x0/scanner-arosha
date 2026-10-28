'use client';
import { useState } from 'react';
import { useFeedback, useRun } from '@/components/feedback';
import { Table } from '@/components/ui';
import { toCsv } from '@/lib/csv';
import { bulkIssue, bulkReturn, reviewBatch, type BatchReview } from '../actions';

export function BulkClient({ staff }: { staff: { id: string; name: string }[] }) {
  const { toast } = useFeedback();
  const { run, pending } = useRun();
  const [mode, setMode] = useState<'Issue' | 'Return'>('Issue');
  const [sid, setSid] = useState('');
  const [text, setText] = useState('');
  const [rev, setRev] = useState<(BatchReview & { mode: 'Issue' | 'Return'; sid: string }) | null>(null);
  const [conds, setConds] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  async function review() {
    setBusy(true);
    try {
      const r = await reviewBatch(mode, sid, text);
      if (!r.ok) { toast(r.message ?? 'Could not review batch', false); return; }
      setConds({});
      setRev({ ...r, mode, sid });
    } catch {
      toast('Could not review batch', false);
    } finally {
      setBusy(false);
    }
  }

  const bad = rev ? rev.rows.filter((r) => r.error).length : 0;
  const ok = rev ? rev.rows.length - bad : 0;

  function confirmBatch() {
    if (!rev) return;
    const nos = rev.rows.map((r) => r.no);
    run(
      () => (rev.mode === 'Issue' ? bulkIssue(nos, rev.sid) : bulkReturn(nos.map((no, i) => ({ no, cond: conds[i] ?? 'Good' })))),
      () => { setRev(null); setText(''); },
    );
  }

  function receipt() {
    if (!rev) return;
    const blob = new Blob([toCsv([['Device', 'Mode', 'Staff'], ...rev.rows.map((r) => [r.no, rev.mode, rev.staffName ?? ''])])], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'receipt.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="c">
      <h2>Bulk handover / return</h2>
      <div className="r">
        <select value={mode} onChange={(e) => { setMode(e.target.value as 'Issue' | 'Return'); setRev(null); }}>
          <option>Issue</option><option>Return</option>
        </select>
        <select value={sid} onChange={(e) => setSid(e.target.value)} disabled={mode === 'Return'}>
          <option value="">Staff (issue only)</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <textarea
        rows={4} className="w100" value={text} onChange={(e) => { setText(e.target.value); setRev(null); }}
        placeholder="Paste or scan device numbers (one per line, or comma separated)"
      />
      <div className="r"><button className="s" onClick={review} disabled={busy}>Review batch</button></div>

      {rev && (
        <div>
          {rev.mode === 'Issue' && rev.staffName && (
            <p><b>{rev.staffName}</b> will receive {ok} device(s): holding {rev.held} now, {rev.held + ok} after this batch.</p>
          )}
          <p>
            {rev.rows.length} devices · <b style={{ color: 'var(--bad)' }}>{bad} problem(s)</b>.
            The batch only runs if every line is valid (all-or-nothing).
          </p>
          <Table
            head={['Device', 'Check', ...(rev.mode === 'Return' ? ['Condition'] : [])]}
            rows={rev.rows.map((r, i) => [
              r.no,
              r.error ? <span style={{ color: 'var(--bad)' }}>{r.error}</span> : 'OK',
              ...(rev.mode === 'Return'
                ? [
                    <select key={i} value={conds[i] ?? 'Good'} onChange={(e) => setConds({ ...conds, [i]: e.target.value })}>
                      <option>Good</option><option>Damaged</option><option>Faulty</option>
                    </select>,
                  ]
                : []),
            ])}
          />
          <div className="r" style={{ marginTop: 8 }}>
            <button disabled={pending || bad > 0 || rev.rows.length === 0} onClick={confirmBatch}>Confirm batch</button>
            <button className="s" onClick={receipt}>Export receipt</button>
          </div>
        </div>
      )}
    </div>
  );
}
