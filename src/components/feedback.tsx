'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { Result } from '@/lib/types';

type ConfirmOpts = {
  title: string;
  input?: { placeholder: string; required?: boolean; type?: 'text' | 'password' };
  note?: string; // placeholder for an optional free-text note
};
type ConfirmOut = { value: string; note: string } | null;
type Ctx = {
  toast: (text: string, ok?: boolean) => void;
  confirm: (o: ConfirmOpts) => Promise<ConfirmOut>;
};
const FeedbackCtx = createContext<Ctx | null>(null);

export function useFeedback(): Ctx {
  const c = useContext(FeedbackCtx);
  if (!c) throw new Error('FeedbackProvider missing');
  return c;
}

/** Runs a server action, shows its message as a toast, and calls onOk on success. */
export function useRun() {
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const run = useCallback(
    (fn: () => Promise<Result>, onOk?: (r: Result) => void) => {
      start(async () => {
        try {
          const r = await fn();
          toast(r.message, r.ok);
          if (r.ok) onOk?.(r);
        } catch {
          toast('Something went wrong. Please try again.', false);
        }
      });
    },
    [toast],
  );
  return { run, pending };
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: ConfirmOut) => void }) | null>(null);

  const toast = useCallback((t: string, ok = true) => {
    setMsg({ t, ok });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3500);
  }, []);
  const confirm = useCallback(
    (o: ConfirmOpts) => new Promise<ConfirmOut>((resolve) => setDlg({ ...o, resolve })),
    [],
  );

  return (
    <FeedbackCtx.Provider value={{ toast, confirm }}>
      {children}
      {dlg && (
        <Dialog
          opts={dlg}
          toast={toast}
          onClose={(v) => {
            dlg.resolve(v);
            setDlg(null);
          }}
        />
      )}
      {msg && (
        <div id="msg" role="status" style={{ background: msg.ok ? '#15803d' : '#b91c1c' }}>
          {msg.t}
        </div>
      )}
    </FeedbackCtx.Provider>
  );
}

function Dialog({ opts, toast, onClose }: { opts: ConfirmOpts; toast: Ctx['toast']; onClose: (v: ConfirmOut) => void }) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const submit = () => {
    if (opts.input?.required && !value.trim()) return toast('This field is required', false);
    onClose({ value: value.trim(), note: note.trim() });
  };
  const keys = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') onClose(null);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" onKeyDown={keys}>
      <div className="c" style={{ width: 340, maxWidth: '100%', margin: 0 }}>
        <h2>{opts.title}</h2>
        {opts.input && (
          <input
            ref={first}
            className="w100"
            type={opts.input.type ?? 'text'}
            placeholder={opts.input.placeholder}
            value={value}
            autoComplete="off"
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        {opts.note && (
          <input
            ref={opts.input ? undefined : first}
            className="w100"
            style={opts.input ? { marginTop: 8 } : undefined}
            placeholder={opts.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
        <div className="r" style={{ margin: '10px 0 0' }}>
          <button onClick={submit}>Confirm</button>
          <button className="s" onClick={() => onClose(null)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
