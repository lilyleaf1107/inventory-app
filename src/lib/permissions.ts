import type { UserRole, Profile } from '@/types'

// 超级管理员邮箱（唯一且不可更改）
export const SUPER_ADMIN_EMAIL = '2871116075@qq.com'

// 角色显示标签
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  warehouse_manager: '库管',
  staff: '员工',
}

// 角色等级（用于比较）
const ROLE_LEVEL: Record<UserRole, number> = {
  super_admin: 4,
  admin: 3,
  warehouse_manager: 2,
  staff: 1,
}

// 是否为超级管理员
export function isSuperAdmin(profile?: Profile | null): boolean {
  return profile?.role === 'super_admin'
}

// 是否为管理员及以上（含超管、管理员）—— 可管理用户
export function isAdminAbove(profile?: Profile | null): boolean {
  return (
    profile?.role === 'super_admin' || profile?.role === 'admin'
  )
}

// 是否为库管及以上（含超管、管理员、库管）—— 可进出库、修改库存
export function isWarehouseManagerAbove(profile?: Profile | null): boolean {
  return (
    profile?.role === 'super_admin' ||
    profile?.role === 'admin' ||
    profile?.role === 'warehouse_manager'
  )
}

// 是否可写入（进出库、修改产品/仓库等）
export function canWrite(profile?: Profile | null): boolean {
  return isWarehouseManagerAbove(profile)
}

// 是否可管理用户（查看/新增/删除/升降级）
export function canManageUsers(profile?: Profile | null): boolean {
  return isAdminAbove(profile)
}

// 是否可查看进出库记录
export function canViewMoves(profile?: Profile | null): boolean {
  return isWarehouseManagerAbove(profile)
}

// 是否可修改某用户角色（不能修改超管；管理员不能把任何人提升为超管）
export function canChangeRoleOf(
  target: { id: string; role: UserRole },
  actor: Profile | null | undefined,
): boolean {
  if (!actor) return false
  // 超管可改所有人（但自己已是超管，无需改）
  if (actor.role === 'super_admin') {
    // 不能改超管自己（防止误操作降级），但可改其他超管？实际只有 1 个超管
    if (target.id === actor.id) return false
    return true
  }
  // 管理员：不能改超管，不能把任何人设为超管
  if (actor.role === 'admin') {
    if (target.role === 'super_admin') return false
    return true
  }
  return false
}

// 是否可设置目标角色（actor 是否有权限把某人设为该角色）
export function canAssignRole(
  targetRole: UserRole,
  actor: Profile | null | undefined,
): boolean {
  if (!actor) return false
  // 超管可分配任意角色
  if (actor.role === 'super_admin') return true
  // 管理员不能分配 super_admin
  if (actor.role === 'admin') {
    return targetRole !== 'super_admin'
  }
  return false
}

// 角色排序比较（用于显示）
export function compareRole(a: UserRole, b: UserRole): number {
  return ROLE_LEVEL[b] - ROLE_LEVEL[a]
}
