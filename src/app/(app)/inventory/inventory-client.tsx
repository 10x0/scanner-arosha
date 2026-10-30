'use client';
import { useState } from 'react';
import { useFeedback, useRun } from '@/components/feedback';
import { DEVICE_TYPES, type DeviceStatus } from '@/lib/types';
import { addDevice, archiveDevice, deleteDevice, putUnderRepair, setDeviceStatus } from '../actions';

export function AddDevice() {
  const { run, pending } = useRun();
  const [no, setNo] = useState('');
  const [type, setType] = useState(DEVICE_TYPES[0]);
  const [serial, setSerial] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="c">
      <h2>Add device</h2>
      <div className="r">
        <input placeholder="Device number" value={no} onChange={(e) => setNo(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {DEVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input placeholder="Serial number" value={serial} onChange={(e) => setSerial(e.target.value)} />
        <input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <button disabled={pending} onClick={() => run(() => addDevice(no, type, serial, note), () => { setNo(''); setSerial(''); setNote(''); })}>
          Add
        </button>
      </div>
    </div>
  );
}

export function DeviceActions({ id, no, status, archived, canRepair, canMissing, canDelete, hasHistory }: {
  id: string; no: string; status: DeviceStatus; archived: boolean;
  canRepair: boolean; canMissing: boolean; canDelete: boolean; hasHistory: boolean;
}) {
  const { confirm } = useFeedback();
  const { run, pending } = useRun();

  async function repair() {
    const r = await confirm({ title: `Put ${no} under repair?`, note: 'Reason (optional)' });
    if (r) run(() => putUnderRepair(id, no, r.note));
  }
  async function mark(s: 'Missing' | 'Retired' | 'Available') {
    const verb = s === 'Available' ? 'found' : s;
    const r = await confirm({ title: `Mark ${no} as ${verb}?`, note: 'Reason (optional)' });
    if (r) run(() => setDeviceStatus(id, no, s, r.note));
  }

  async function remove() {
    const r = await confirm({
      title: `Permanently delete ${no}? This cannot be undone.`,
      input: { placeholder: 'Reason (required)', required: true },
    });
    if (r) run(() => deleteDevice(id, no, r.value));
  }
  async function archive() {
    const r = await confirm({
      title: `Archive ${no}? It leaves the active list; all history is kept.`,
      input: { placeholder: 'Reason (required)', required: true },
    });
    if (r) run(() => archiveDevice(id, no, r.value));
  }

  return (
    <div className="r" style={{ margin: 0 }}>
      {canRepair && !archived && (status === 'Available' || status === 'Damaged') && (
        <button className="s" disabled={pending} onClick={repair}>Put under repair</button>
      )}
      {canMissing && !archived && status !== 'Missing' && status !== 'Retired' && (
        <>
          <button className="s" disabled={pending} onClick={() => mark('Missing')}>Declare missing</button>
          <button className="s" disabled={pending} onClick={() => mark('Retired')}>Retire</button>
        </>
      )}
      {canMissing && status === 'Missing' && (
        <button className="s" disabled={pending} onClick={() => mark('Available')}>Mark found</button>
      )}
      {canDelete && !hasHistory && (
        <button className="d" disabled={pending} onClick={remove}>Delete</button>
      )}
      {canDelete && hasHistory && !archived && status !== 'Issued' && (
        <button className="s" disabled={pending} onClick={archive}>Archive</button>
      )}
    </div>
  );
}
