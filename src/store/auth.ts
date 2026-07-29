import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { UserRole, Profile } from '@/types'

interface AuthState {
  user: any | null
  profile: Profile | null
  loading: boolean
  checkAuth: () => Promise<void>
  signIn: (account: string, password: string) => Promise<void>
  signUp: (account: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  isAdmin: () => boolean
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
    if (user) {
      await supabase.from('profiles').upsert({
        id: user.id,
        name,
        role: 'staff',
      })
    }
    await get().checkAuth()
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },

  isAdmin: () => {
    return get().profile?.role === 'admin'
  },
}))
