import { requireProfile } from '@/lib/auth';
import { can, ROLE_LABEL, type Role } from '@/lib/perm';
import { createAdminClient } from '@/lib/supabase/admin';
import { Table } from '@/components/ui';
import { AddUser, UserControls } from './users-client';

type Row = { id: string; name: string; username: string; role: Role; active: boolean };

export default async function UsersPage() {
  const me = await requireProfile();
  if (!can(me.role, 'manage')) return <div className="c">Only administrators can manage users.</div>;

  const { data } = await createAdminClient().from('profiles').select('id,name,username,role,active').order('name');
  const users = (data ?? []) as Row[];

  return (
    <>
      <h1>Users</h1>
      <AddUser />
      <div className="c">
        <h2>All users ({users.length})</h2>
        <Table
          head={['Name', 'Username', 'Role', 'Active', '']}
          rows={users.map((u) => [
            u.name, u.username, ROLE_LABEL[u.role], u.active ? 'Yes' : 'No',
            <UserControls key={u.id} id={u.id} name={u.name} role={u.role} active={u.active} isSelf={u.id === me.id} />,
          ])}
        />
      </div>
    </>
  );
}
