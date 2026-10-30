export type Result = { ok: boolean; message: string };

export type DeviceStatus = 'Available' | 'Issued' | 'Damaged' | 'Maintenance' | 'Missing' | 'Retired';
export const STATUSES: DeviceStatus[] = ['Available', 'Issued', 'Damaged', 'Maintenance', 'Missing', 'Retired'];
export const DEVICE_TYPES = ['PDA', 'Black Zebra', 'Silver Zebra', 'I2'];
export const DAMAGE_STATUSES = ['Reported', 'Under Inspection', 'Awaiting Repair', 'Under Repair', 'Repaired', 'Beyond Repair'];
export const DAMAGE_CATEGORIES = [
  'Cracked screen', 'Broken trigger', 'Battery issue', 'Charging issue',
  'Scanner not reading barcodes', 'Physical damage', 'Software issue', 'Missing accessories', 'Other',
];
export const SHIFTS = ['Day', 'Night'] as const;
export type Shift = (typeof SHIFTS)[number];
export const SHIFT_LABEL: Record<string, string> = { Day: 'Day Shift', Night: 'Night Shift' };
export const shiftLabel = (s: string | null | undefined) => (s ? (SHIFT_LABEL[s] ?? s) : '—');

export type Device = {
  id: string; device_no: string; type: string; serial: string;
  status: DeviceStatus; condition: string; notes: string; archived_at: string | null;
};
export type StaffRow = { id: string; emp_no: string; name: string; dept: string; shift: string; active: boolean };
export type Tx = {
  id: string; batch_ref: string | null; device_id: string; staff_id: string; device_no: string;
  staff_name: string; shift: string; issued_at: string; issued_by_name: string; notes: string;
  returned_at: string | null; received_by_name: string | null; return_condition: string | null; return_notes: string;
  return_shift: string | null; end_type: 'return' | 'transfer' | null;
  transferred_from: string | null; origin_tx: string | null; origin_batch: string | null;
};
export type TransferRow = {
  id: string; batch_ref: string | null; transferred_at: string; device_no: string; origin_staff_name: string;
  from_staff_name: string; to_staff_name: string; shift: string; by_name: string; note: string;
};
export type DamageRow = {
  id: string; device_id: string; device_no: string; reported_at: string; last_user: string | null;
  category: string; severity: string; description: string; status: string;
  repaired_by: string | null; repair_note: string;
};
export type Stats = {
  registered: number; status: Record<string, number>; overdue: number;
  staff_today: number; out_today: number; back_today: number; transfers_today: number;
};
