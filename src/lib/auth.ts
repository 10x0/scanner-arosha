import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Role } from './perm';

export type Profile = { id: string; name: string; username: string; role: Role; active: boolean };

/** Current user's active profile, or null. Deduplicated per request. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('id,name,username,role,active').eq('id', user.id).maybeSingle();
  return data && data.active ? (data as Profile) : null;
});

export async function requireProfile(): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect('/login');
  return p;
}
