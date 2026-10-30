'use client';
import { useState } from 'react';
import { useFeedback, useRun } from '@/components/feedback';
import { SHIFTS, SHIFT_LABEL } from '@/lib/types';
import { addStaff, deleteStaff, setStaffActive } from '../actions';

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
        <input placeholder="Employee ID (optional)" value={emp} onChange={(e) => setEmp(e.target.value)} />
        <select value={shift} onChange={(e) => setShift(e.target.value)} aria-label="Default shift">
          <option value="">Default shift (optional)</option>
          {SHIFTS.map((s) => <option key={s} value={s}>{SHIFT_LABEL[s]}</option>)}
        </select>
        <button disabled={pending} onClick={() => run(() => addStaff(name, emp, '', shift), () => { setName(''); setEmp(''); setShift(''); })}>
          Add
        </button>
      </div>
    </div>
  );
}

export function StaffActions({ id, name, active, canDelete }: { id: string; name: string; active: boolean; canDelete: boolean }) {
  const { confirm } = useFeedback();
  const { run, pending } = useRun();

  async function toggle() {
    if (active) {
      const r = await confirm({ title: `Deactivate ${name}?`, input: { placeholder: 'Reason (required)', required: true } });
      if (r) run(() => setStaffActive(id, false, r.value));
    } else {
      run(() => setStaffActive(id, true, ''));
    }
  }
  async function remove() {
    const r = await confirm({
      title: `Permanently delete ${name}? This cannot be undone.`,
      input: { placeholder: 'Reason (required)', required: true },
    });
    if (r) run(() => deleteStaff(id, name, r.value));
  }

  return (
    <div className="r" style={{ margin: 0 }}>
      <button className="s" disabled={pending} onClick={toggle}>{active ? 'Deactivate' : 'Activate'}</button>
      {canDelete && <button className="d" disabled={pending} onClick={remove}>Delete</button>}
    </div>
  );
}
