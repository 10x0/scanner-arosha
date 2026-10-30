'use client';
import { useState } from 'react';
import { Combobox, type Opt } from '@/components/combobox';
import { useFeedback, useRun } from '@/components/feedback';
import { ShiftToggle } from '@/components/shift-toggle';
import { issueOne, returnOne } from '../actions';

export function IssueReturn({ staff, available, outstanding, defaultShift }: {
  staff: Opt[]; available: Opt[]; outstanding: Opt[]; defaultShift: string;
}) {
  const { toast, confirm } = useFeedback();
  const { run, pending } = useRun();

  const [who, setWho] = useState('');
  const [no, setNo] = useState('');
  const [note, setNote] = useState('');
  const [shift, setShift] = useState(defaultShift);
  const [rno, setRno] = useState('');
  const [cond, setCond] = useState('Good');
  const [rnote, setRnote] = useState('');
  const [rshift, setRshift] = useState(defaultShift);

  async function issue() {
    const st = staff.find((s) => s.value === who);
    if (!st) return toast('Select a staff member', false);
    if (!no) return toast('Select a device', false);
    if (!(await confirm({ title: `Issue ${no} to ${st.label} (${shift} shift)?` }))) return;
    run(() => issueOne(no, who, note, st.label, shift), () => { setNo(''); setNote(''); });
  }

  const held = outstanding.find((o) => o.value === rno);

  return (
    <>
      <div className="c">
        <h2>Issue scanner</h2>
        <div className="r">
          <Combobox options={staff} value={who} onChange={setWho} placeholder="Search staff name or employee ID" />
          <Combobox options={available} value={no} onChange={setNo} placeholder="Search available device" />
        </div>
        <div className="r">
          <ShiftToggle value={shift} onChange={setShift} />
          <input placeholder="Notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button onClick={issue} disabled={pending}>Confirm handover</button>
        </div>
        <div className="l">{available.length} device(s) available</div>
      </div>

      <div className="c">
        <h2>Return scanner</h2>
        <div className="r">
          <Combobox options={outstanding} value={rno} onChange={setRno} placeholder="Search issued device" />
          <select value={cond} onChange={(e) => setCond(e.target.value)} aria-label="Condition">
            <option>Good</option><option>Damaged</option><option>Faulty</option>
          </select>
        </div>
        <div className="r">
          <ShiftToggle value={rshift} onChange={setRshift} label="Return shift" />
          <input placeholder="Return notes" value={rnote} onChange={(e) => setRnote(e.target.value)} />
          <button
            disabled={pending}
            onClick={() => {
              if (!rno) return toast('Select a device to return', false);
              run(() => returnOne(rno, cond, rnote, rshift), () => { setRno(''); setRnote(''); setCond('Good'); });
            }}
          >
            Confirm return
          </button>
        </div>
        <div className="l">{held ? `${held.sub}` : ''}</div>
      </div>
    </>
  );
}
