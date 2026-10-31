'use server';
import { revalidatePath } from 'next/cache';
import { getVerifiedProfile, type Profile } from '@/lib/auth';
import { auditAs } from '@/lib/audit';
import { can, ROLES, type Role } from '@/lib/perm';
import { MIN_PASSWORD, USERNAME_RE, usernameToEmail } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Result } from '@/lib/types';

const fail = (message: string): Result => ({ ok: false, message });
const done = (message: string): Result => { revalidatePath('/users'); return { ok: true, message }; };

/** Every action re-verifies the caller is an active administrator (the page check is not enough). */
async function admin(): Promise<Profile | null> {
  const p = await getVerifiedProfile();
  return p && can(p.role, 'manage') ? p : null;
}

export async function createUser(name: string, username: string, password: string, role: string): Promise<Result> {
  const me = await admin();
  if (!me) return fail('Only administrators can manage users.');
  name = name.trim();
  username = username.trim().toLowerCase();
  if (!name) return fail('Enter a name');
  if (!USERNAME_RE.test(username)) return fail('Username: 3-32 letters, numbers, . _ - (no spaces)');
  if (password.length < MIN_PASSWORD) return fail(`Password must be at least ${MIN_PASSWORD} characters`);
  if (!ROLES.includes(role as Role)) return fail('Invalid role');

  const sb = createAdminClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: usernameToEmail(username), password, email_confirm: true, user_metadata: { name },
  });
  if (error || !data.user) {
    return fail(/already|exists|registered/i.test(error?.message ?? '') ? 'Username already taken' : 'Could not create the user');
  }
  const { error: pErr } = await sb.from('profiles').insert({ id: data.user.id, name, username, role, active: true });
  if (pErr) {
    await sb.auth.admin.deleteUser(data.user.id);
    return fail(pErr.code === '23505' ? 'Username already taken' : 'Could not create the user');
  }
  await auditAs(me, 'USER ADD', `${name} (${username}) – ${role}`);
  return done(`${name} added as ${role}`);
}

export async function setUserRole(id: string, role: string): Promise<Result> {
  const me = await admin();
  if (!me) return fail('Only administrators can manage users.');
  if (!ROLES.includes(role as Role)) return fail('Invalid role');
  const sb = createAdminClient();
  const { data, error } = await sb.from('profiles').update({ role }).eq('id', id).select('name').single();
  if (error) return fail(error.code === 'P0001' ? error.message : 'Could not change the role');
  await auditAs(me, 'USER ROLE', `${data.name} → ${role}`);
  return done('Role updated');
}

export async function setUserActive(id: string, active: boolean): Promise<Result> {
  const me = await admin();
  if (!me) return fail('Only administrators can manage users.');
  if (!active && id === me.id) return fail('You cannot deactivate yourself');
  const sb = createAdminClient();
  const { data, error } = await sb.from('profiles').update({ active }).eq('id', id).select('name').single();
  if (error) return fail(error.code === 'P0001' ? error.message : 'Could not update the user');
  // Also block token refresh / new sign-ins at the auth layer
  await sb.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' });
  await auditAs(me, active ? 'USER ACTIVATE' : 'USER DEACTIVATE', data.name);
  return done(active ? 'User activated' : 'User deactivated');
}

export async function resetPassword(id: string, password: string): Promise<Result> {
  const me = await admin();
  if (!me) return fail('Only administrators can manage users.');
  if (password.length < MIN_PASSWORD) return fail(`Password must be at least ${MIN_PASSWORD} characters`);
  const sb = createAdminClient();
  const { error } = await sb.auth.admin.updateUserById(id, { password });
  if (error) return fail('Could not reset the password');
  const { data } = await sb.from('profiles').select('name').eq('id', id).maybeSingle();
  await auditAs(me, 'PASSWORD RESET', data?.name ?? id);
  return done('Password updated');
}
