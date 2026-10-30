'use client';
import { useState } from 'react';
import { Combobox, MultiCombobox, type Opt } from '@/components/combobox';
import { useFeedback, useRun } from '@/components/feedback';
import { ShiftToggle } from '@/components/shift-toggle';
import { Table } from '@/components/ui';
import { toCsv } from '@/lib/csv';
import { bulkIssue, bulkReturn, reviewBatch, type BatchReview } from '../actions';

export function BulkClient({ staff, available, issued, defaultShift }: {
  staff: Opt[]; available: Opt[]; issued: Opt[]; defaultShift: string;
}) {
  const { toast } = useFeedback();
  const { run, pending } = useRun();
  const [mode, setMode] = useState<'Issue' | 'Return'>('Issue');
  const [sid, setSid] = useState('');
  const [nos, setNos] = useState<string[]>([]);
  const [shift, setShift] = useState(defaultShift);
  const [rev, setRev] = useState<(BatchReview & { mode: 'Issue' | 'Return'; sid: string }) | null>(null);
  const [conds, setConds] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const reset = () => { setRev(null); };

  async function review() {
    setBusy(true);
    try {
      const r = await reviewBatch(mode, sid, nos.join('\n'));
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
    const list = rev.rows.map((r) => r.no);
    run(
      () => (rev.mode === 'Issue'
        ? bulkIssue(list, rev.sid, shift)
        : bulkReturn(list.map((no, i) => ({ no, cond: conds[i] ?? 'Good' })), shift)),
      () => { setRev(null); setNos([]); },
    );
  }

  function receipt() {
    if (!rev) return;
    const rows = [['Device', 'Mode', 'Staff', 'Shift'], ...rev.rows.map((r) => [r.no, rev.mode, rev.staffName ?? '', shift])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
    a.download = 'receipt.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="c">
      <h2>Bulk handover / return</h2>
      <div className="r">
        <select value={mode} aria-label="Mode" onChange={(e) => { setMode(e.target.value as 'Issue' | 'Return'); setNos([]); reset(); }}>
          <option>Issue</option><option>Return</option>
        </select>
        {mode === 'Issue' && <Combobox options={staff} value={sid} onChange={(v) => { setSid(v); reset(); }} placeholder="Search staff name or employee ID" />}
        <ShiftToggle value={shift} onChange={setShift} />
      </div>
      <MultiCombobox
        options={mode === 'Issue' ? available : issued}
        values={nos}
        onChange={(v) => { setNos(v); reset(); }}
        placeholder={mode === 'Issue' ? 'Search or scan available devices' : 'Search or scan issued devices'}
      />
      <div className="r" style={{ marginTop: 8 }}><button className="s" onClick={review} disabled={busy || nos.length === 0}>Review batch</button></div>

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
                    <select key={i} value={conds[i] ?? 'Good'} aria-label={`Condition for ${r.no}`} onChange={(e) => setConds({ ...conds, [i]: e.target.value })}>
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
