'use client';
import { useActionState } from 'react';
import { signIn, type FormState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="r">
      <input name="username" placeholder="Username" autoComplete="username" className="w100" required autoFocus />
      <input name="password" type="password" placeholder="Password" autoComplete="current-password" className="w100" required />
      <button className="w100" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      {state.error && <div className="err" role="alert">{state.error}</div>}
    </form>
  );
}
