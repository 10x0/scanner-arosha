'use client';
import { useState } from 'react';
import { useRun } from '@/components/feedback';
import { setShiftTimes } from '../actions';

export function ShiftSettingsForm({ dayStart, nightStart }: { dayStart: string; nightStart: string }) {
  const { run, pending } = useRun();
  const [d, setD] = useState(dayStart);
  const [n, setN] = useState(nightStart);
  return (
    <div className="r">
      <label className="l">Day starts <input type="time" value={d} onChange={(e) => setD(e.target.value)} /></label>
      <label className="l">Night starts <input type="time" value={n} onChange={(e) => setN(e.target.value)} /></label>
      <button disabled={pending} onClick={() => run(() => setShiftTimes(d, n))}>Save</button>
    </div>
  );
}
