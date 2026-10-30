'use client';
import { useId, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';

export type Opt = { value: string; label: string; sub?: string; search?: string; disabled?: boolean };

const hay = (o: Opt) => `${o.label} ${o.sub ?? ''} ${o.search ?? ''}`.toLowerCase();
const MAX_SHOWN = 100;

/** On phones, bring the field to the top so the list isn't hidden behind the on-screen keyboard. */
function liftOnMobile(el: HTMLElement | null) {
  if (el && typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches) {
    setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
  }
}

function useList(options: Opt[], q: string) {
  return useMemo(() => {
    const k = q.trim().toLowerCase();
    const all = k ? options.filter((o) => hay(o).includes(k)) : options;
    return { shown: all.slice(0, MAX_SHOWN), total: all.length, all };
  }, [options, q]);
}

/** Searchable single-select. Type to filter; tap or press Enter to choose. */
export function Combobox({ options, value, onChange, placeholder, ariaLabel }: {
  options: Opt[]; value: string; onChange: (v: string) => void; placeholder: string; ariaLabel?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const { shown, total } = useList(options, q);
  const selected = options.find((o) => o.value === value);

  const pick = (o: Opt) => {
    if (o.disabled) return;
    onChange(o.value); setQ(''); setOpen(false); input.current?.blur();
  };
  const keys = (e: RKeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && shown[hi]) pick(shown[hi]); }
    else if (e.key === 'Escape') { setOpen(false); setQ(''); }
  };

  return (
    <div className="cb">
      <input
        ref={input}
        role="combobox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={placeholder}
        value={open ? q : selected?.label ?? ''}
        onFocus={() => { setOpen(true); setQ(''); setHi(0); liftOnMobile(input.current); }}
        onBlur={() => { setOpen(false); setQ(''); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={keys}
      />
      {value && !open && (
        <button type="button" className="cb-x" aria-label="Clear selection" onMouseDown={(e) => { e.preventDefault(); onChange(''); }}>×</button>
      )}
      {open && (
        <ul id={id} role="listbox" className="cb-list">
          {shown.length === 0 && <li className="cb-empty">No matches</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled}
              className={i === hi ? 'hi' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
            >
              <span>{o.label}</span>
              {o.sub && <span className="l">{o.sub}</span>}
            </li>
          ))}
          {total > MAX_SHOWN && <li className="cb-empty">Showing {MAX_SHOWN} of {total}. Keep typing to narrow.</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * Searchable multi-select with chips. Works with barcode scanners (scan + Enter adds the device)
 * and with pasted lists. Text that matches no option is still added, so the review step can flag it.
 */
export function MultiCombobox({ options, values, onChange, placeholder }: {
  options: Opt[]; values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const { shown, total, all } = useList(options, q);
  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());
  const canonical = (t: string) => options.find((o) => o.label.toLowerCase() === t.toLowerCase())?.value ?? t;

  const add = (vs: string[]) => {
    const next = [...values];
    for (const raw of vs) {
      const v = canonical(raw.trim());
      if (v && !next.some((x) => x.toLowerCase() === v.toLowerCase())) next.push(v);
    }
    onChange(next);
  };
  const toggle = (o: Opt) => {
    if (o.disabled) return;
    has(o.value) ? onChange(values.filter((x) => x.toLowerCase() !== o.value.toLowerCase())) : add([o.value]);
  };
  const enter = () => {
    const t = q.trim();
    if (!t) return;
    const exact = options.find((o) => o.label.toLowerCase() === t.toLowerCase());
    if (exact) add([exact.value]);
    else if (shown[hi]) add([shown[hi].value]);
    else add([t]);
    setQ(''); setHi(0);
  };
  const keys = (e: RKeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); enter(); }
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Backspace' && !q && values.length) onChange(values.slice(0, -1));
  };

  return (
    <div className="cb cb-multi">
      {values.length > 0 && (
        <div className="chips">
          {values.map((v) => (
            <span className="chip" key={v}>
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={input}
        role="combobox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={placeholder}
        value={q}
        onFocus={() => { setOpen(true); liftOnMobile(input.current); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={keys}
        onPaste={(e) => {
          const t = e.clipboardData.getData('text');
          if (/[\s,;]/.test(t.trim())) { e.preventDefault(); add(t.split(/[\s,;]+/).filter(Boolean)); }
        }}
      />
      <div className="l" style={{ marginTop: 4 }}>
        {values.length} selected
        {values.length > 0 && <> · <button type="button" className="lnk" onClick={() => onChange([])}>Clear all</button></>}
      </div>
      {open && (
        <ul id={id} role="listbox" aria-multiselectable="true" className="cb-list">
          {all.length > 0 && (
            <li className="cb-head" onMouseDown={(e) => { e.preventDefault(); add(all.filter((o) => !o.disabled).slice(0, 500).map((o) => o.value)); }}>
              Select all {q.trim() ? 'matching ' : ''}({Math.min(all.length, 500)})
            </li>
          )}
          {shown.length === 0 && <li className="cb-empty">No matches. Press Enter to add “{q.trim()}” anyway.</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={has(o.value)}
              aria-disabled={o.disabled}
              className={i === hi ? 'hi' : ''}
              onMouseDown={(e) => { e.preventDefault(); toggle(o); }}
            >
              <span>{has(o.value) ? '✓ ' : ''}{o.label}</span>
              {o.sub && <span className="l">{o.sub}</span>}
            </li>
          ))}
          {total > MAX_SHOWN && <li className="cb-empty">Showing {MAX_SHOWN} of {total}. Keep typing to narrow.</li>}
        </ul>
      )}
    </div>
  );
}
