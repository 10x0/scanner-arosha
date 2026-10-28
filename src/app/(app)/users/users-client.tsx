'use client';
import { useState } from 'react';
import { useFeedback, useRun } from '@/components/feedback';
import { ROLES, ROLE_LABEL, type Role } from '@/lib/perm';
import { createUser, resetPassword, setUserActive, setUserRole } from './actions';

export function AddUser() {
  const { run, pending } = useRun();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('operator');
  return (
    <div className="c">
      <h2>Add user</h2>
      <div className="r">
        <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Username" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input type="password" placeholder="Password (min 8)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <button disabled={pending} onClick={() => run(() => createUser(name, username, password, role), () => { setName(''); setUsername(''); setPassword(''); })}>
          Add user
        </button>
      </div>
      <p className="l">
        Operator: issue/return, bulk, report damage. Supervisor: same plus repairs and exports. Administrator: full access.
        Auditor: view and export only.
      </p>
    </div>
  );
}

export function UserControls({ id, name, role, active, isSelf }: { id: string; name: string; role: Role; active: boolean; isSelf: boolean }) {
  const { confirm } = useFeedback();
  const { run, pending } = useRun();
  return (
    <div className="r" style={{ margin: 0 }}>
      <select value={role} disabled={pending} onChange={(e) => run(() => setUserRole(id, e.target.value))}>
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
      <button
        className="s"
        disabled={pending}
        onClick={async () => {
          const r = await confirm({ title: `New password for ${name}`, input: { placeholder: 'New password (min 8 chars)', type: 'password', required: true } });
          if (r) run(() => resetPassword(id, r.value));
        }}
      >
        Reset password
      </button>
      <button className="s" disabled={pending || (isSelf && active)} onClick={() => run(() => setUserActive(id, !active))}>
        {active ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  );
}
