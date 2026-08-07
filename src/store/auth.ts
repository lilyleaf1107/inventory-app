import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { getSettings } from '@/lib/settings'
import type { UserRole, Profile } from '@/types'

interface AuthState {
  user: any | null
  profile: Profile | null
  loading: boolean
  checkAuth: () => Promise<void>
  signIn: (account: string, password: string) => Promise<void>
  signUp: (account: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  // 权限判断（向后兼容）
  isAdmin: () => boolean
  // 新增权限判断
  isSuperAdmin: () => boolean
  canWrite: () => boolean
  canManageUsers: () => boolean
  canViewMoves: () => boolean
  canViewCost: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  checkAuth: async () => {
    set({ loading: true })
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      set({ user, profile: profile || null })
    } else {
      set({ user: null, profile: null })
    }
    set({ loading: false })
  },

  signIn: async (account: string, password: string) => {
    // 支持手机号登录：纯数字转为假邮箱
    const email = /^\d+$/.test(account) ? `${account}@phone.local` : account
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await get().checkAuth()
  },

  signUp: async (account: string, password: string, name: string) => {
    const email = /^\d+$/.test(account) ? `${account}@phone.local` : account
    const { data: { user }, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    })
    if (error) throw error
    // profile 由数据库触发器自动创建，无需前端 upsert
    await get().checkAuth()
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },

  // 向后兼容：管理员及以上（含超管）能管理用户
  isAdmin: () => {
    const role = get().profile?.role
    return role === 'admin' || role === 'super_admin'
  },

  isSuperAdmin: () => {
    return get().profile?.role === 'super_admin'
  },

  // 库管及以上可写入
  canWrite: () => {
    const role = get().profile?.role
    return (
      role === 'super_admin' ||
      role === 'admin' ||
      role === 'warehouse_manager'
    )
  },

  // 管理员及以上可管理用户
  canManageUsers: () => {
    const role = get().profile?.role
    return role === 'admin' || role === 'super_admin'
  },

  // 库管及以上可查看进出库记录
  canViewMoves: () => {
    const role = get().profile?.role
    return (
      role === 'super_admin' ||
      role === 'admin' ||
      role === 'warehouse_manager'
    )
  },

  // 可查看/修改产品成本（角色可在设置页面配置）
  canViewCost: () => {
    const role = get().profile?.role
    if (!role) return false
    const roles = getSettings().costVisibleRoles
    return roles.includes(role)
  },
}))
