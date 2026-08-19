import { create } from 'zustand'
import Taro from '@tarojs/taro'
import { supabase } from '@/lib/supabase'
import { isAdminAbove, isWarehouseManagerAbove, canViewCost } from '@/lib/permissions'
import type { Profile } from '@/types'

interface AuthState {
  user: any | null
  profile: Profile | null
  loading: boolean
  wxOpenid: string | null
  initFromStorage: () => Promise<void>
  checkAuth: () => Promise<void>
  signIn: (account: string, password: string) => Promise<void>
  signInWithWx: () => Promise<{ needBind: boolean; openid?: string }>
  bindWx: () => Promise<void>
  signOut: () => Promise<void>
  isSuperAdmin: () => boolean
  canWrite: () => boolean
  canManageUsers: () => boolean
  canViewMoves: () => boolean
  canViewCost: () => boolean
}

const WX_OPENID_KEY = 'wx_openid'

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  wxOpenid: (() => {
    try { return Taro.getStorageSync(WX_OPENID_KEY) || null } catch { return null }
  })(),

  // 从本地存储恢复状态（wx_openid + 登录态检查）
  initFromStorage: async () => {
    try {
      const storedOpenid = Taro.getStorageSync(WX_OPENID_KEY) || null
      if (storedOpenid && !get().wxOpenid) {
        set({ wxOpenid: storedOpenid })
      }
    } catch {}
    await get().checkAuth()
  },

  checkAuth: async () => {
    set({ loading: true })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // ★ 把 access_token 写到固定 key，让 taroFetch 能同步读到
        const { data: session } = await supabase.auth.getSession()
        if (session?.access_token) {
          Taro.setStorageSync('sb_access_token', session.access_token)
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        set({ user, profile: profile || null })
      } else {
        Taro.removeStorageSync('sb_access_token')
        set({ user: null, profile: null })
      }
    } catch {
      set({ user: null, profile: null })
    }
    set({ loading: false })
  },

  signIn: async (account: string, password: string) => {
    const email = /^\d+$/.test(account) ? `${account}@phone.local` : account
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await get().checkAuth()
  },

  // 微信登录：Taro.login 拿 code → Edge Function 换 openid → 已绑定则自动登录
  signInWithWx: async () => {
    // 1. 调微信登录拿临时 code
    const { code } = await Taro.login()
    if (!code) {
      return { needBind: true }
    }

    // 2. 调 Edge Function 用 code 换 openid，并判断是否已绑定
    const { data, error } = await supabase.functions.invoke('wx-login', {
      body: { code },
    })
    if (error || !data) {
      throw new Error('微信登录请求失败')
    }

    // 3. 存 openid 到本地（用于后续账号密码登录时自动绑定）
    if (data.openid) {
      Taro.setStorageSync(WX_OPENID_KEY, data.openid)
      set({ wxOpenid: data.openid })
    }

    // 4. 已绑定 → 用返回的 token 自动登录
    if (data.action === 'login' && data.token_hash) {
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'magiclink',
      })
      if (!otpError) {
        await get().checkAuth()
        return { needBind: false }
      }
    }

    // 5. 未绑定 → 返回 openid，前端引导先账号密码登录后绑定
    return { needBind: true, openid: data.openid }
  },

  // 账号密码登录成功后，绑定当前 openid
  bindWx: async () => {
    const openid = get().wxOpenid
    const profile = get().profile
    if (!openid || !profile) {
      throw new Error('缺少微信身份或未登录')
    }
    const { error } = await supabase
      .from('profiles')
      .update({ wx_openid: openid })
      .eq('id', profile.id)
    if (error) throw error
    set({ profile: { ...profile, wx_openid: openid } })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    Taro.removeStorageSync('sb_access_token')
    set({ user: null, profile: null })
  },

  isSuperAdmin: () => get().profile?.role === 'super_admin',
  canWrite: () => isWarehouseManagerAbove(get().profile),
  canManageUsers: () => isAdminAbove(get().profile),
  canViewMoves: () => isWarehouseManagerAbove(get().profile),
  canViewCost: () => canViewCost(get().profile),
}))
