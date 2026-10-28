'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/', 'Dashboard'], ['/issue', 'Issue / Return'], ['/bulk', 'Bulk'], ['/inventory', 'Inventory'],
  ['/staff', 'Staff'], ['/damage', 'Damage'], ['/reports', 'Reports'], ['/reconcile', 'Reconcile'],
  ['/users', 'Users'], ['/audit', 'Audit'],
] as const;

export function NavLinks({ canManage }: { canManage: boolean }) {
  const path = usePathname();
  return (
    <>
      {LINKS.filter(([href]) => canManage || href !== '/users').map(([href, label]) => {
        const on = href === '/' ? path === '/' : path.startsWith(href);
        return <Link key={href} href={href} className={on ? 'on' : ''}>{label}</Link>;
      })}
    </>
  );
}
