'use client';
import { useState } from 'react';
import { useFeedback, useRun } from '@/components/feedback';
import { DEVICE_TYPES, type DeviceStatus } from '@/lib/types';
import { addDevice, putUnderRepair, setDeviceStatus } from '../actions';

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

export function DeviceActions({ id, no, status, canRepair, canMissing }: {
  id: string; no: string; status: DeviceStatus; canRepair: boolean; canMissing: boolean;
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

  return (
    <div className="r" style={{ margin: 0 }}>
      {canRepair && (status === 'Available' || status === 'Damaged') && (
        <button className="s" disabled={pending} onClick={repair}>Put under repair</button>
      )}
      {canMissing && status !== 'Missing' && status !== 'Retired' && (
        <>
          <button className="s" disabled={pending} onClick={() => mark('Missing')}>Declare missing</button>
          <button className="s" disabled={pending} onClick={() => mark('Retired')}>Retire</button>
        </>
      )}
      {canMissing && status === 'Missing' && (
        <button className="s" disabled={pending} onClick={() => mark('Available')}>Mark found</button>
      )}
    </div>
  );
}
