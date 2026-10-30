'use client';
import { SHIFTS, SHIFT_LABEL } from '@/lib/types';

/** Day / Night segmented control. Always one of the two; never free text. */
export function ShiftToggle({ value, onChange, label = 'Shift' }: { value: string; onChange: (s: string) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {SHIFTS.map((s) => (
        <button key={s} type="button" aria-pressed={value === s} onClick={() => onChange(s)}>
          {s === 'Day' ? '☀ ' : '☾ '}{SHIFT_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
