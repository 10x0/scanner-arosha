import type { SupabaseClient } from '@supabase/supabase-js';
import { dayBounds, fmt, todayStr } from './time';
import type { Tx } from './types';

export const REPORT_TYPES = ['Daily log', 'Currently issued', 'Unreturned'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const RH = [
  'Transaction', 'Batch', 'Shift', 'Device', 'Staff', 'Issued', 'Returned',
  'Issued by', 'Received by', 'Condition', 'Status', 'Notes',
];

export async function fetchReport(sb: SupabaseClient, type: ReportType, date: string, shift: string) {
  let q = sb.from('transactions').select('*').order('issued_at', { ascending: false }).limit(5000);
  if (type !== 'Daily log') q = q.is('returned_at', null);
  if (type === 'Unreturned') q = q.lt('issued_at', dayBounds(todayStr()).from.toISOString());
  if (date) {
    const { from, to } = dayBounds(date);
    const a = from.toISOString(), b = to.toISOString();
    q = q.or(`and(issued_at.gte.${a},issued_at.lt.${b}),and(returned_at.gte.${a},returned_at.lt.${b})`);
  }
  if (shift) q = q.eq('shift', shift);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Tx[];
}

export const reportCells = (x: Tx): string[] => [
  x.id.slice(0, 8), x.batch_ref ?? '', x.shift, x.device_no, x.staff_name,
  fmt(x.issued_at), fmt(x.returned_at), x.issued_by_name, x.received_by_name ?? '',
  x.return_condition ?? '', x.returned_at ? 'Returned' : 'Outstanding', x.notes,
];
