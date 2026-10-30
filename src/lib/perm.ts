// Pure helpers, safe to import from client and server code.
// NOTE: the database re-checks every permission; this only drives what the UI shows.
export type Role = 'administrator' | 'supervisor' | 'operator' | 'auditor';
export type Action = 'issue' | 'bulk' | 'damage' | 'repair' | 'manage' | 'missing' | 'export' | 'adjust' | 'delete';

export const PERM: Record<Role, Action[]> = {
  administrator: ['issue', 'bulk', 'damage', 'repair', 'manage', 'missing', 'export', 'adjust', 'delete'],
  supervisor: ['issue', 'bulk', 'damage', 'repair', 'export'],
  operator: ['issue', 'bulk', 'damage'],
  auditor: ['export'],
};
export const ROLES = Object.keys(PERM) as Role[];
export const ROLE_LABEL: Record<Role, string> = {
  administrator: 'Administrator', supervisor: 'Supervisor', operator: 'Operator', auditor: 'Auditor',
};
export const can = (role: Role, a: Action) => PERM[role].includes(a);
