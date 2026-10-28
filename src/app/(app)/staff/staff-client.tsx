'use client';
import { useState } from 'react';
import { useRun } from '@/components/feedback';
import { SHIFTS } from '@/lib/types';
import { addStaff, setStaffActive } from '../actions';

export function AddStaff() {
  const { run, pending } = useRun();
  const [name, setName] = useState('');
  const [emp, setEmp] = useState('');
  const [shift, setShift] = useState('');
  return (
    <div className="c">
      <h2>Add staff</h2>
      <div className="r">
        <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Employee no. (optional)" value={emp} onChange={(e) => setEmp(e.target.value)} />
        <select value={shift} onChange={(e) => setShift(e.target.value)}>
          <option value="">Shift (optional)</option>
          {SHIFTS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button disabled={pending} onClick={() => run(() => addStaff(name, emp, '', shift), () => { setName(''); setEmp(''); setShift(''); })}>
          Add
        </button>
      </div>
    </div>
  );
}

export function ToggleStaff({ id, active }: { id: string; active: boolean }) {
  const { run, pending } = useRun();
  return (
    <button className="s" disabled={pending} onClick={() => run(() => setStaffActive(id, !active))}>
      {active ? 'Deactivate' : 'Activate'}
    </button>
  );
}
