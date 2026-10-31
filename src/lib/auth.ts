import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Role } from './perm';

export type Profile = { id: string; name: string; username: string; role: Role; active: boolean };

async function profileFor(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('id,name,username,role,active').eq('id', userId).maybeSingle();
  return data && data.active ? (data as Profile) : null;
}

/**
 * Current user's active profile, or null. Deduplicated per request.
 * Uses getClaims() (local JWT verification, no Auth-server round trip). Role and "active" still come from the
 * database on every call, so a deactivated user loses access immediately even while their token is valid.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return sub ? profileFor(sub) : null;
});

/** Same, but confirmed with the Auth server. Used before service-role (user management) operations. */
export const getVerifiedProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? profileFor(user.id) : null;
});

export async function requireProfile(): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect('/login');
  return p;
}
