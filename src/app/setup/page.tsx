import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { SetupForm } from './setup-form';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const { count } = await createAdminClient().from('profiles').select('id', { count: 'exact', head: true });
  if (count) redirect('/login');
  return (
    <div className="auth">
      <div className="c">
        <div className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Logo" width={44} height={44} />
        </div>
        <h2>Scanner Management System · Setup</h2>
        {process.env.SETUP_TOKEN ? (
          <>
            <p className="l">First-time setup: create the administrator account.</p>
            <SetupForm />
          </>
        ) : (
          <p className="err">Set the SETUP_TOKEN environment variable (any long random string), redeploy, then reload this page.</p>
        )}
      </div>
    </div>
  );
}
