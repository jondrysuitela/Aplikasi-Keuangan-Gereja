import type { UserRole } from '@/types';

export type Permission =
  | 'view'
  | 'input'
  | 'import'
  | 'export'
  | 'backup'
  | 'restore'
  | 'settings'
  | 'admin'
  | 'delete'
  | 'lock-year'
  | 'attachment';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ['view', 'input', 'import', 'export', 'backup', 'restore', 'settings', 'admin', 'delete', 'lock-year', 'attachment'],
  bendahara: ['view', 'input', 'import', 'export', 'backup', 'attachment'],
  guest: ['view', 'export'],
};

export function can(role: UserRole | undefined, permission: Permission) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function roleLabel(role: UserRole | undefined) {
  if (role === 'admin') return 'Admin';
  if (role === 'bendahara') return 'Bendahara';
  if (role === 'guest') return 'Guest';
  return 'Tidak dikenal';
}
