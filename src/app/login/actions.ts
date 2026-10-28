'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/auth';
import { auditAs } from '@/lib/audit';
import { limitLogin } from '@/lib/ratelimit';
import { MIN_PASSWORD, USERNAME_RE, usernameToEmail } from '@/lib/env';

export type FormState = { error?: string };
const BAD_LOGIN = 'Wrong username or password, or the account is inactive.';

async function clientIp() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get('username') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!username || !password) return { error: 'Enter your username and password.' };

  const rl = await limitLogin(await clientIp(), username);
  if (!rl.ok) return { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min.` };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error || !data.user) {
    await auditAs(null, 'LOGIN FAILED', username);
    return { error: BAD_LOGIN };
  }
  const { data: prof } = await supabase.from('profiles').select('id,name,role,active').eq('id', data.user.id).maybeSingle();
  if (!prof?.active) {
    await supabase.auth.signOut();
    await auditAs(null, 'LOGIN FAILED', `${username} (inactive or no profile)`);
    return { error: BAD_LOGIN };
  }
  await auditAs(prof, 'LOGIN', prof.name);
  redirect('/');
}

export async function signOut() {
  const p = await getProfile();
  if (p) await auditAs(p, 'LOGOUT', p.name);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/** First run only: creates the initial administrator. Needs SETUP_TOKEN. */
export async function createFirstAdmin(_prev: FormState, form: FormData): Promise<FormState> {
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return { error: 'SETUP_TOKEN is not configured on the server.' };
  if (String(form.get('token') ?? '') !== expected) return { error: 'Invalid setup token.' };

  const name = String(form.get('name') ?? '').trim();
  const username = String(form.get('username') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!name) return { error: 'Enter a name.' };
  if (!USERNAME_RE.test(username)) return { error: 'Username: 3-32 letters, numbers, . _ - (no spaces).' };
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };

  const admin = createAdminClient();
  const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true });
  if (count) return { error: 'Setup is already complete. Sign in instead.' };

  const { data, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username), password, email_confirm: true, user_metadata: { name },
  });
  if (error || !data.user) {
    console.error('[setup] createUser', error);
    return { error: 'Could not create the account. Check AUTH_EMAIL_DOMAIN and the Supabase keys.' };
  }
  const { data: won, error: rpcErr } = await admin.rpc('bootstrap_admin', { p_id: data.user.id, p_name: name, p_username: username });
  if (rpcErr || !won) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: 'Setup is already complete. Sign in instead.' };
  }

  const supabase = await createClient();
  const { error: signErr } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (signErr) redirect('/login');
  redirect('/');
}
