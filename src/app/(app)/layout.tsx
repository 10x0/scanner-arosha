import type { ReactNode } from 'react';
import { requireProfile } from '@/lib/auth';
import { can, ROLE_LABEL } from '@/lib/perm';
import { FeedbackProvider } from '@/components/feedback';
import { NavLinks } from '@/components/nav-links';
import { signOut } from '../login/actions';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const p = await requireProfile();
  return (
    <FeedbackProvider>
      <div className="shell">
        <nav>
          <b>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" /> Scanner Management System
          </b>
          <NavLinks canManage={can(p.role, 'manage')} />
        </nav>
        <main>
          <header>
            <span className="l">{p.name} · {ROLE_LABEL[p.role]}</span>
            <form action={signOut}><button className="s">Log out</button></form>
          </header>
          {children}
        </main>
      </div>
    </FeedbackProvider>
  );
}
