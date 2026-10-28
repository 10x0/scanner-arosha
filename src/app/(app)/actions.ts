'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Result } from '@/lib/types';

type PgErr = { message: string; code?: string };

/** Messages raised by our SQL functions (P0001) and permission errors (42501) are user-facing. */
function friendly(e: PgErr): string {
  if (e.code === 'P0001' || e.code === '42501') return e.message;
  if (e.code === '23505') return 'That record already exists, or the device already has an active assignment.';
  console.error('[rpc]', e);
  return 'Unexpected error. Please try again.';
}

async function call(fn: string, args: Record<string, unknown>, success: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, message: friendly(error) };
  revalidatePath('/', 'layout');
  return { ok: true, message: success };
}

const clean = (s: string | undefined | null) => (s ?? '').trim();
const batchRef = () => 'B-' + crypto.randomUUID().slice(0, 8).toUpperCase();

// ── Issue / Return ──────────────────────────────────────────
export async function issueOne(no: string, staffId: string, notes: string, staffName: string) {
  return call('issue_devices', { p_device_nos: [clean(no)], p_staff_id: staffId, p_notes: clean(notes), p_batch: null },
    `${clean(no)} issued to ${staffName}`);
}

export async function returnOne(no: string, cond: string, notes: string) {
  const r = await call('return_devices', { p_items: [{ no: clean(no), cond }], p_notes: clean(notes), p_batch: null },
    `${clean(no)} returned${cond !== 'Good' ? ' – damage record opened' : ''}`);
  return r;
}

// ── Bulk ────────────────────────────────────────────────────
export type BatchReview = {
  ok: boolean; message?: string;
  rows: { no: string; error: string | null }[];
  staffName: string | null; held: number;
};

export async function reviewBatch(mode: 'Issue' | 'Return', staffId: string, raw: string): Promise<BatchReview> {
  const empty = { rows: [], staffName: null, held: 0 };
  const nos = raw.split(/[\s,;]+/).filter(Boolean);
  if (!nos.length) return { ok: false, message: 'Enter at least one device number', ...empty };
  if (nos.length > 500) return { ok: false, message: 'Maximum 500 devices per batch', ...empty };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('check_batch', {
    p_mode: mode, p_nos: nos, p_staff: mode === 'Issue' && staffId ? staffId : null,
  });
  if (error) return { ok: false, message: friendly(error), ...empty };

  let staffName: string | null = null;
  let held = 0;
  if (mode === 'Issue' && staffId) {
    const { data: s } = await supabase.from('staff').select('name').eq('id', staffId).maybeSingle();
    staffName = s?.name ?? null;
    const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true })
      .eq('staff_id', staffId).is('returned_at', null);
    held = count ?? 0;
  }
  return { ok: true, rows: data as { no: string; error: string | null }[], staffName, held };
}

export async function bulkIssue(nos: string[], staffId: string) {
  const ref = batchRef();
  const r = await call('issue_devices', { p_device_nos: nos, p_staff_id: staffId, p_notes: '', p_batch: ref },
    `Batch ${ref} complete (${nos.length} devices)`);
  return r;
}

export async function bulkReturn(items: { no: string; cond: string }[]) {
  const ref = batchRef();
  return call('return_devices', { p_items: items, p_notes: '', p_batch: ref },
    `Batch ${ref} complete (${items.length} devices)`);
}

// ── Inventory ───────────────────────────────────────────────
export async function addDevice(no: string, type: string, serial: string, notes: string) {
  return call('add_device', { p_no: clean(no), p_type: type, p_serial: clean(serial), p_notes: clean(notes) },
    `${clean(no)} added`);
}
export async function putUnderRepair(deviceId: string, no: string, reason: string) {
  return call('put_under_repair', { p_device_id: deviceId, p_reason: clean(reason) }, `${no} is now under repair`);
}
export async function setDeviceStatus(deviceId: string, no: string, status: 'Missing' | 'Retired' | 'Available', reason: string) {
  return call('set_device_status', { p_device_id: deviceId, p_status: status, p_reason: clean(reason) },
    `${no} marked ${status === 'Available' ? 'found (Available)' : status}`);
}

// ── Staff ───────────────────────────────────────────────────
export async function addStaff(name: string, emp: string, dept: string, shift: string) {
  return call('add_staff', { p_name: clean(name), p_emp: clean(emp), p_dept: clean(dept), p_shift: shift },
    `${clean(name)} added`);
}
export async function setStaffActive(id: string, active: boolean) {
  return call('set_staff_active', { p_id: id, p_active: active }, active ? 'Staff member activated' : 'Staff member deactivated');
}

// ── Damage / repair ─────────────────────────────────────────
export async function reportDamage(no: string, category: string, severity: string, desc: string) {
  return call('report_damage', { p_device_no: clean(no), p_category: category, p_severity: severity, p_desc: clean(desc) },
    `Damage reported for ${clean(no)}`);
}
export async function setRepairStatus(reportId: string, status: string, repairedBy: string, note: string) {
  return call('set_repair_status', { p_report_id: reportId, p_status: status, p_repaired_by: clean(repairedBy), p_note: clean(note) },
    `Status set to ${status}`);
}

// ── Reconcile ───────────────────────────────────────────────
export async function recordStockCheck(note: string) {
  return call('record_stock_check', { p_note: clean(note) }, 'Stock check recorded');
}
