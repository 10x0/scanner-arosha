'use client';
import { useState } from 'react';
import { useFeedback, useRun } from '@/components/feedback';
import { DAMAGE_CATEGORIES, DAMAGE_STATUSES } from '@/lib/types';
import { reportDamage, setRepairStatus } from '../actions';

export function ReportForm() {
  const { run, pending } = useRun();
  const [no, setNo] = useState('');
  const [cat, setCat] = useState(DAMAGE_CATEGORIES[0]);
  const [sev, setSev] = useState('Medium');
  const [desc, setDesc] = useState('');
  return (
    <div className="c">
      <h2>Report damaged device</h2>
      <div className="r">
        <input placeholder="Device number" value={no} onChange={(e) => setNo(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          {DAMAGE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={sev} onChange={(e) => setSev(e.target.value)}>
          <option>Low</option><option>Medium</option><option>High</option>
        </select>
        <input placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button disabled={pending} onClick={() => run(() => reportDamage(no, cat, sev, desc), () => { setNo(''); setDesc(''); })}>
          Report
        </button>
      </div>
    </div>
  );
}

export function StatusSelect({ id, no, status }: { id: string; no: string; status: string }) {
  const { confirm } = useFeedback();
  const { run, pending } = useRun();
  return (
    <select
      value={status}
      disabled={pending}
      onChange={async (e) => {
        const next = e.target.value;
        if (next === 'Repaired') {
          const r = await confirm({
            title: `Who repaired ${no}?`,
            input: { placeholder: 'Repaired by (name)', required: true },
            note: 'Repair note (optional)',
          });
          if (r) run(() => setRepairStatus(id, next, r.value, r.note));
        } else {
          run(() => setRepairStatus(id, next, '', ''));
        }
      }}
    >
      {DAMAGE_STATUSES.map((s) => <option key={s}>{s}</option>)}
    </select>
  );
}
