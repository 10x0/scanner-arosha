'use client';
import { useState } from 'react';
import { useFeedback, useRun } from '@/components/feedback';
import { issueOne, returnOne } from '../actions';

type S = { id: string; name: string; emp: string };
type O = { no: string; staff: string; since: string };

const label = (s: S) => (s.emp ? `${s.name} · ${s.emp}` : s.name);

export function IssueReturn({ staff, available, outstanding }: { staff: S[]; available: string[]; outstanding: O[] }) {
  const { toast, confirm } = useFeedback();
  const { run, pending } = useRun();

  const [who, setWho] = useState('');
  const [no, setNo] = useState('');
  const [note, setNote] = useState('');
  const [rno, setRno] = useState('');
  const [cond, setCond] = useState('Good');
  const [rnote, setRnote] = useState('');

  const resolve = (): S | undefined => {
    const k = who.trim().toLowerCase();
    if (!k) return undefined;
    const byName = staff.filter((s) => s.name.toLowerCase() === k);
    return (
      staff.find((s) => label(s).toLowerCase() === k) ??
      staff.find((s) => s.emp && s.emp.toLowerCase() === k) ??
      (byName.length === 1 ? byName[0] : undefined)
    );
  };

  async function issue() {
    const st = resolve();
    if (!st) return toast('Pick a staff member from the list', false);
    if (!no.trim()) return toast('Enter or scan a device number', false);
    if (!(await confirm({ title: `Issue ${no.trim()} to ${st.name}?` }))) return;
    run(() => issueOne(no, st.id, note, st.name), () => { setNo(''); setNote(''); });
  }

  const assigned = outstanding.find((o) => o.no.toLowerCase() === rno.trim().toLowerCase());

  return (
    <>
      <div className="c">
        <h2>Issue scanner</h2>
        <div className="r">
          <input list="staff-list" placeholder="Staff name or employee no." value={who} onChange={(e) => setWho(e.target.value)} />
          <datalist id="staff-list">{staff.map((s) => <option key={s.id} value={label(s)} />)}</datalist>
          <input list="avail-list" placeholder="Device number (scan)" value={no} onChange={(e) => setNo(e.target.value)} />
          <datalist id="avail-list">{available.map((d) => <option key={d} value={d} />)}</datalist>
          <input placeholder="Notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button onClick={issue} disabled={pending}>Confirm handover</button>
        </div>
      </div>

      <div className="c">
        <h2>Return scanner</h2>
        <div className="r">
          <input list="out-list" placeholder="Device number (scan)" value={rno} onChange={(e) => setRno(e.target.value)} />
          <datalist id="out-list">{outstanding.map((o) => <option key={o.no} value={o.no}>{o.staff}</option>)}</datalist>
          <select value={cond} onChange={(e) => setCond(e.target.value)}>
            <option>Good</option><option>Damaged</option><option>Faulty</option>
          </select>
          <input placeholder="Return notes" value={rnote} onChange={(e) => setRnote(e.target.value)} />
          <button
            disabled={pending}
            onClick={() => {
              if (!rno.trim()) return toast('Enter or scan a device number', false);
              run(() => returnOne(rno, cond, rnote), () => { setRno(''); setRnote(''); setCond('Good'); });
            }}
          >
            Confirm return
          </button>
        </div>
        <div className="l">{assigned ? `Assigned to ${assigned.staff} since ${assigned.since}` : ''}</div>
      </div>
    </>
  );
}
