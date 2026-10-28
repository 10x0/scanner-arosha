'use client';
import { useActionState } from 'react';
import { createFirstAdmin } from '../login/actions';
import type { FormState } from '../login/actions';

export function SetupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createFirstAdmin, {});
  return (
    <form action={action} className="r">
      <input name="token" type="password" placeholder="Setup token" className="w100" required autoComplete="off" />
      <input name="name" placeholder="Full name" className="w100" required />
      <input name="username" placeholder="Username" className="w100" required autoComplete="off" />
      <input name="password" type="password" placeholder="Password (min 8)" className="w100" required autoComplete="new-password" />
      <button className="w100" disabled={pending}>{pending ? 'Creating…' : 'Create administrator'}</button>
      {state.error && <div className="err" role="alert">{state.error}</div>}
    </form>
  );
}
