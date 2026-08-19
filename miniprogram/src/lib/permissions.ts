import type { UserRole, Profile } from '@/types'

export const SUPER_ADMIN_EMAIL = '2871116075@qq.com'

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  warehouse_manager: '库管',
  staff: '员工',
}

const ROLE_LEVEL: Record<UserRole, number> = {
  super_admin: 4,
  admin: 3,
  warehouse_manager: 2,
  staff: 1,
}

export function isSuperAdmin(profile?: Profile | null): boolean {
  return profile?.role === 'super_admin'
}

export function isAdminAbove(profile?: Profile | null): boolean {
  return profile?.role === 'super_admin' || profile?.role === 'admin'
}

export function isWarehouseManagerAbove(profile?: Profile | null): boolean {
  return (
    profile?.role === 'super_admin' ||
    profile?.role === 'admin' ||
    profile?.role === 'warehouse_manager'
  )
}

export function canWrite(profile?: Profile | null): boolean {
  return isWarehouseManagerAbove(profile)
}

export function canManageUsers(profile?: Profile | null): boolean {
  return isAdminAbove(profile)
}

export function canViewMoves(profile?: Profile | null): boolean {
  return isWarehouseManagerAbove(profile)
}

export function canViewCost(profile?: Profile | null): boolean {
  if (!profile) return false
  return profile.role === 'super_admin' || profile.role === 'admin'
}

export function compareRole(a: UserRole, b: UserRole): number {
  return ROLE_LEVEL[b] - ROLE_LEVEL[a]
}
