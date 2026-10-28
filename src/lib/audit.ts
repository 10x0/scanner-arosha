import 'server-only';
import { createAdminClient } from './supabase/admin';

type Actor = { id: string; name: string; role: string } | null;

/** Audit entries for things that happen outside a DB function (login, user admin). */
export async function auditAs(actor: Actor, action: string, record: string, reason = '') {
  const { error } = await createAdminClient().from('audit_log').insert({
    user_id: actor?.id ?? null, user_name: actor?.name ?? 'Anonymous', role: actor?.role ?? null,
    action, record, reason,
  });
  if (error) console.error('[audit]', error.message);
}
