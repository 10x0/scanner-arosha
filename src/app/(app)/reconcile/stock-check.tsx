'use client';
import { useFeedback, useRun } from '@/components/feedback';
import { recordStockCheck } from '../actions';

export function StockCheck() {
  const { confirm } = useFeedback();
  const { run, pending } = useRun();
  return (
    <button
      disabled={pending}
      onClick={async () => {
        const r = await confirm({ title: 'Record stock check', note: 'Stock check note (blank = no discrepancies)' });
        if (r) run(() => recordStockCheck(r.note));
      }}
    >
      Record stock check
    </button>
  );
}
