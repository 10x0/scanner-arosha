'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Combobox, type Opt } from '@/components/combobox';
import { useFeedback, useRun } from '@/components/feedback';
import { ShiftToggle } from '@/components/shift-toggle';
import { transferDevices } from '../actions';

export type Holder = {
  id: string; name: string; emp: string;
  devices: { no: string; batch: string | null; since: string; shift: string }[];
};

/** Transfer / Reassign: move one, several, or a whole handover from one staff member to another. */
export function TransferPanel({ holders, staff, defaultShift, initialFrom, initialDev }: {
  holders: Holder[]; staff: Opt[]; defaultShift: string; initialFrom: string; initialDev: string;
}) {
  const { toast, confirm } = useFeedback();
  const { run, pending } = useRun();
  const root = useRef<HTMLDivElement>(null);
  const toBox = useRef<HTMLDivElement>(null);

  const startFrom = holders.some((h) => h.id === initialFrom) ? initialFrom : '';
  const [from, setFrom] = useState(startFrom);
  const [sel, setSel] = useState<string[]>(startFrom && initialDev ? [initialDev] : []);
  const [to, setTo] = useState('');
  const [shift, setShift] = useState(defaultShift);
  const [note, setNote] = useState('');

  useEffect(() => { if (startFrom) root.current?.scrollIntoView({ block: 'start' }); }, [startFrom]);

  const holder = holders.find((h) => h.id === from);
  // The holder may have lost devices after a refresh; drop selections that are no longer held
  const valid = useMemo(() => sel.filter((n) => holder?.devices.some((d) => d.no === n)), [sel, holder]);

  const fromOpts: Opt[] = holders.map((h) => ({
    value: h.id, label: h.name, sub: `${h.emp ? h.emp + ' · ' : ''}${h.devices.length} device(s)`,
  }));
  const toOpts = staff.filter((s) => s.value !== from);

  const groups = useMemo(() => {
    const m = new Map<string, Holder['devices']>();
    (holder?.devices ?? []).forEach((d) => {
      const k = d.batch ?? '';
      m.set(k, [...(m.get(k) ?? []), d]);
    });
    return [...m.entries()];
  }, [holder]);

  const toggle = (no: string) => setSel((s) => (s.includes(no) ? s.filter((x) => x !== no) : [...s, no]));
  const addAll = (nos: string[]) => setSel((s) => [...new Set([...s, ...nos])]);

  async function submit() {
    const target = staff.find((s) => s.value === to);
    if (!holder) return toast('Choose who currently holds the devices', false);
    if (valid.length === 0) return toast('Select at least one device', false);
    if (!target) return toast('Choose the staff member to transfer to', false);
    const r = await confirm({ title: `Transfer ${valid.length} device(s) from ${holder.name} to ${target.label} (${shift} shift)?`, note: 'Note (optional)' });
    if (!r) return;
    run(() => transferDevices(valid, to, shift, r.note || note, target.label), () => { setSel([]); setTo(''); setNote(''); });
  }

  return (
    <div className="c" id="transfer" ref={root}>
      <h2>Transfer / Reassign devices</h2>
      <p className="l">
        Moves devices straight from one staff member to another. This is a transfer, not a return: the history keeps who
        originally received each device and who holds it now.
      </p>
      {holders.length === 0 ? (
        <p className="l">No devices are currently issued.</p>
      ) : (
        <>
          <div className="r">
            <Combobox options={fromOpts} value={from} onChange={(v) => { setFrom(v); setSel([]); }} placeholder="Search current holder" />
          </div>

          {holder && (
            <>
              <div className="grp">
                <b>{holder.name} holds {holder.devices.length} device(s)</b>
                <span className="r" style={{ margin: 0 }}>
                  <button type="button" className="s" onClick={() => addAll(holder.devices.map((d) => d.no))}>Select all ({holder.devices.length})</button>
                  <button type="button" className="s" onClick={() => setSel([])} disabled={sel.length === 0}>Clear</button>
                </span>
              </div>
              {groups.map(([batch, devs]) => (
                <div key={batch || 'single'}>
                  <div className="grp">
                    <span className="l">{batch ? `Handover ${batch}` : 'Single issues'} · {devs.length}</span>
                    {devs.length > 1 && (
                      <button type="button" className="s" onClick={() => addAll(devs.map((d) => d.no))}>Select this handover</button>
                    )}
                  </div>
                  {devs.map((d) => (
                    <label className="chk" key={d.no}>
                      <input type="checkbox" checked={valid.includes(d.no)} onChange={() => toggle(d.no)} />
                      <span className="grow"><b>{d.no}</b> <span className="l">· {d.shift} · since {d.since}</span></span>
                      <button
                        type="button"
                        className="s"
                        onClick={(e) => { e.preventDefault(); setSel([d.no]); toBox.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}
                      >
                        Transfer
                      </button>
                    </label>
                  ))}
                </div>
              ))}

              <div className="stack" style={{ marginTop: 12 }} ref={toBox}>
                <Combobox options={toOpts} value={to} onChange={setTo} placeholder="Search staff to transfer to" />
                <div className="r" style={{ margin: 0 }}>
                  <ShiftToggle value={shift} onChange={setShift} />
                  <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <button onClick={submit} disabled={pending || valid.length === 0}>
                  Transfer {valid.length > 0 ? `${valid.length} device(s)` : ''}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
