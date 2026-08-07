import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '缺少 Supabase 配置未设置，请配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY',
  )
}

// 提前建立到 Supabase 的连接（DNS 预解析 + TLS 握手），减少安卓首屏等待
if (supabaseUrl && typeof document !== 'undefined') {
  try {
    const origin = new URL(supabaseUrl).origin
    const dns = document.createElement('link')
    dns.rel = 'dns-prefetch'
    dns.href = origin
    document.head.appendChild(dns)
    const pre = document.createElement('link')
    pre.rel = 'preconnect'
    pre.href = origin
    pre.crossOrigin = 'anonymous'
    document.head.appendChild(pre)
  } catch {
    /* ignore */
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // 移动端不需要 URL 检测，减少开销
    },
  },
)

export function getPublicUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export function getProductImageUrl(path: string | null) {
  if (!path) return ''
  return getPublicUrl('product-images', path)
}

export async function uploadProductImage(file: File) {
  const ext = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('product-images')
    .upload(fileName, file)
  if (error) throw error
  return fileName
}

export async function deleteProductImage(path: string) {
  await supabase.storage.from('product-images').remove([path])
}
